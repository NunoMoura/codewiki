import { createHash } from "node:crypto";
import { join } from "node:path";

import {
	runWikiRuntime,
	type RunWikiRuntimeInput,
} from "../commands/work.ts";
import {
	collectGitStatusSnapshot,
	runtimeWorktreeInputsFromGitStatus,
	type GitStatusSnapshot,
} from "../../git/status.ts";
import {
	executeRuntimeWorktreeCommands,
	type RuntimeWorktreePlan,
	type WorktreeCommandRunner,
} from "../../git/worktrees.ts";
import type { ImplementationWorkerReportInput } from "../../implementation/workers.ts";
import { loadWikiConfigFile } from "../../project/config-file.ts";
import type { WikiConfig } from "../../project/config.ts";
import type { TraceEvent, TraceRecord } from "../../changes/trace/types.ts";
import { buildWorkQueueView } from "../../work-state/work-queue.ts";
import type { WorkState } from "../../work-state/types.ts";
import { createImplementationWorkerPrompt } from "./prompt.ts";
import {
	IMPLEMENTATION_WORKER_DISPATCH_PACKET_SCHEMA_VERSION,
	cleanupImplementationWorkerArtifacts,
	readImplementationWorkerDispatchPackets,
	writeImplementationWorkerDispatchPacket,
	type ImplementationWorkerDispatchPacket,
} from "./implementation-artifacts.ts";
import {
	IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION,
	assertImplementationWorkerAssignment,
	assertImplementationWorkerReport,
	implementationWorkerJobId,
	type ImplementationWorkerAdapter,
	type ImplementationWorkerAssignment,
	type ImplementationWorkerReport,
} from "./implementation-adapter.ts";
import {
	implementationWorkerIntegrationJob,
	type ImplementationWorkerIntegrationInput,
} from "../integration/worker.ts";
import { scheduleImplementationWorkerAssignment } from "./jobs.ts";
import { implementationWorkerClaimReleaseJob } from "../claims/release.ts";
import {
	projectBranchMergeJob,
	type ProjectBranchMergeAuthority,
} from "../effects/project-branch-merge.ts";
import {
	projectBranchPushJob,
	type ProjectBranchPushAuthority,
} from "../effects/project-branch-push.ts";
import type {
	ProductPublicationAdapter,
	ProductPublicationPlan,
} from "../effects/product-publication-contract.ts";
import { productPublicationJob } from "../effects/product-publication.ts";
import type {
	ProductReleaseAdapter,
	ProductReleasePlan,
} from "../effects/product-release-contract.ts";
import { productReleaseJob } from "../effects/product-release.ts";
import type { ProjectCoordinator } from "../coordinator/project.ts";
import { appendRuntimeWorkUnitClaims } from "../claims/work-unit-events.ts";
import type { RuntimeReactor, RuntimeTrigger } from "../coordinator/reactor.ts";

export interface ImplementationWorkerDispatchResult {
	status: "held" | "quiescent" | "scheduled";
	workStateDigest: string;
	pendingWorkItemIds: string[];
	reviewReadyWorkItemIds: string[];
	scheduledJobIds: string[];
	blockers: string[];
}

export interface ImplementationWorkerRuntimeReconciliation {
	dispatch: ImplementationWorkerDispatchResult;
	workerReports: ImplementationWorkerReportInput[];
}

export interface ImplementationWorkerDispatcherOptions {
	repoRoot: string;
	coordinator: ProjectCoordinator;
	reactor: RuntimeReactor;
	adapter: ImplementationWorkerAdapter;
	isolationKind?: ImplementationWorkerAssignment["isolation"]["kind"];
	worktreeRunner?: WorktreeCommandRunner;
	loadConfig?: (repoRoot: string) => Promise<WikiConfig>;
	collectGitStatus?: (repoRoot: string) => Promise<GitStatusSnapshot>;
	mergeAuthority?: ProjectBranchMergeAuthority;
	pushAuthority?: ProjectBranchPushAuthority;
	publicationPlan?: ProductPublicationPlan;
	publicationAdapter?: ProductPublicationAdapter;
	releasePlan?: ProductReleasePlan;
	releaseAdapter?: ProductReleaseAdapter;
	now?: () => string;
	beforeAppend?: () => void | Promise<void>;
}

interface RecoveredImplementationWorker {
	packet: ImplementationWorkerDispatchPacket;
	claimEvent: TraceEvent;
	report: ImplementationWorkerReport;
	reviewInput: ImplementationWorkerReportInput;
}

/**
 * Serializes WorkState-to-claim reconciliation for one elected service, then
 * hands exact Assignment jobs to coordinator lanes without awaiting workers.
 */
export class ImplementationWorkerDispatcher {
	private readonly options: ImplementationWorkerDispatcherOptions;
	private reconcileTail: Promise<void> = Promise.resolve();

	constructor(options: ImplementationWorkerDispatcherOptions) {
		this.options = options;
	}

	reconcile(
		trigger: RuntimeTrigger,
	): Promise<ImplementationWorkerDispatchResult> {
		return this.enqueue(trigger).then((result) => result.dispatch);
	}

	reconcileRuntime(
		trigger: RuntimeTrigger,
	): Promise<ImplementationWorkerRuntimeReconciliation> {
		return this.enqueue(trigger);
	}

	private enqueue(
		trigger: RuntimeTrigger,
	): Promise<ImplementationWorkerRuntimeReconciliation> {
		const run = this.reconcileTail.then(() => this.reconcileOnce(trigger));
		this.reconcileTail = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	private async reconcileOnce(
		trigger: RuntimeTrigger,
	): Promise<ImplementationWorkerRuntimeReconciliation> {
		const observation = await this.options.reactor.observe(trigger);
		const activeAssignments = observation.workState.assignments.filter(
			(assignment) => assignment.status === "claimed",
		);
		const eventsById = new Map(
			observation.records.flatMap((record) =>
				record.type === "trace_event" ? [[record.id, record] as const] : [],
			),
		);
		const activeClaims = new Map(
			activeAssignments.flatMap((assignment) => {
				const event = assignment.claimEventId
					? eventsById.get(assignment.claimEventId)
					: undefined;
				return event ? [[assignment.id, event] as const] : [];
			}),
		);
		const activeClaimIds = new Set(
			activeAssignments.map((assignment) => assignment.id),
		);
		const canonicalClaims = new Map(
			observation.records.flatMap((record) =>
				record.type === "trace_event" &&
				record.event === "runtime.work_unit.claimed" &&
				text(record.data?.claimId)
					? [[text(record.data?.claimId) as string, record] as const]
					: [],
			),
		);
		const canonicalClaimEventIds = new Set(
			[...canonicalClaims.values()].map((claim) => claim.id),
		);
		await this.options.beforeAppend?.();
		const cleanup = await cleanupImplementationWorkerArtifacts({
			repoRoot: this.options.repoRoot,
			activeClaimIds,
			canonicalClaimEventIds,
			integratedClaims: integratedClaimProofs(observation.records),
			worktreeRunner: this.options.worktreeRunner,
		});
		const createdAt = (this.options.now || (() => new Date().toISOString()))();
		const queue = buildWorkQueueView({
			records: observation.records,
			generatedAt: trigger.occurredAt,
		});
		const workerRequiredWorkItemIds = queue.items.flatMap((item) =>
			item.kind === "work-unit" &&
			(item.status === "ready" || item.status === "claimed")
				? [item.id]
				: [],
		);
		const isolationKind = implementationWorkerIsolationKind(this.options);
		const adapterAvailability =
			workerRequiredWorkItemIds.length > 0
				? await inspectWorkerAdapter(this.options.adapter)
				: { available: true as const };
		const resumed = await this.resumePackets(
			activeClaims,
			adapterAvailability.available,
		);
		const integrationWorkers = await this.recoverIntegrationWorkers(
			canonicalClaims,
			resumed.recovered,
		);
		const integrations = this.scheduleIntegrations(
			integrationWorkers,
			observation.workState,
			observation.records,
			createdAt,
		);
		const merges = this.scheduleProjectBranchMerges(
			observation.records,
			createdAt,
		);
		const pushes = this.scheduleProjectBranchPushes(
			observation.records,
			createdAt,
		);
		const publications = this.scheduleProductPublications(
			observation.records,
			createdAt,
		);
		const productReleases = this.scheduleProductReleases(
			observation.records,
			createdAt,
		);
		const releaseable = resumed.recovered.filter((worker) =>
			workerReportCanRelease(worker, observation.workState),
		);
		const releasingClaims = new Set(
			releaseable.map((worker) => worker.packet.assignment.claimId),
		);
		const workerReports = resumed.recovered.flatMap((worker) =>
			releasingClaims.has(worker.packet.assignment.claimId)
				? []
				: [worker.reviewInput],
		);
		const releaseJobIds = this.scheduleReleases(releaseable, createdAt);
		const resumedJobIds = [
			...resumed.jobIds,
			...integrations.jobIds,
			...merges.jobIds,
			...pushes.jobIds,
			...publications.jobIds,
			...productReleases.jobIds,
			...releaseJobIds,
		];
		const pending = new Set(workerRequiredWorkItemIds);
		for (const result of workerReports) pending.delete(result.workUnitId);
		const complete = (
			status: ImplementationWorkerDispatchResult["status"],
			jobIds: string[],
			blockers: string[],
		): ImplementationWorkerRuntimeReconciliation =>
			runtimeReconciliation(
				dispatchResult({
					status,
					workState: observation.workState,
					pendingWorkItemIds: pending,
					workerReports,
					scheduledJobIds: jobIds,
					blockers,
				}),
				workerReports,
			);

		if (
			cleanup.blockers.length > 0 ||
			integrations.blockers.length > 0 ||
			merges.blockers.length > 0 ||
			pushes.blockers.length > 0 ||
			publications.blockers.length > 0 ||
			productReleases.blockers.length > 0 ||
			!adapterAvailability.available
		) {
			return complete("held", resumedJobIds, [
				...cleanup.blockers,
				...integrations.blockers,
				...merges.blockers,
				...pushes.blockers,
				...publications.blockers,
				...productReleases.blockers,
				...(!adapterAvailability.available
					? [
							`implementation_worker_adapter_unavailable:${adapterAvailability.reason}`,
						]
					: []),
			]);
		}

		if (!this.options.coordinator.snapshot().executionPermitted) {
			return complete("held", resumedJobIds, [
				"coordinator_execution_not_permitted",
			]);
		}

		const config = await (this.options.loadConfig || loadWikiConfigFile)(
			this.options.repoRoot,
		);
		const gitStatus = await (this.options.collectGitStatus || defaultGitStatus)(
			this.options.repoRoot,
		);
		if (!gitStatus.isGitRepository || !gitStatus.baseSha) {
			return complete("held", resumedJobIds, [
				"implementation_worker_git_base_unavailable",
				...gitStatus.errors,
			]);
		}

		const runtimeInput: RunWikiRuntimeInput = {
			action: "work-unit-claims",
			mode: "preview",
			queue,
			config,
			maxWorkers: config.runtime.maxWorkers,
			createdAt,
			nextSequenceByTrace: nextSequenceByTrace(observation.records),
			expectedBytesByTrace: observation.expectedBytesByTrace,
			repoRoot: this.options.repoRoot,
			workerIdPrefix: dispatchPrefix(
				"worker",
				observation.workState.snapshotDigest,
			),
			claimIdPrefix: dispatchPrefix(
				"claim",
				observation.workState.snapshotDigest,
			),
			...runtimeWorktreeInputsFromGitStatus(gitStatus),
		};
		const preview = await runWikiRuntime(runtimeInput);
		if (!preview.policy.appendAllowed) {
			return complete("held", resumedJobIds, preview.policy.blockers);
		}
		if (preview.plan.selected.length === 0) {
			return complete(
				resumedJobIds.length > 0 ? "scheduled" : "quiescent",
				resumedJobIds,
				[],
			);
		}
		const unsupported = preview.policy.worktrees.filter(
			(plan) =>
				!plan.worktree ||
				!adapterSupportsIsolation(this.options.adapter, isolationKind),
		);
		if (unsupported.length > 0) {
			return complete("held", resumedJobIds, [
				...unsupported.map(
					(plan) =>
						`implementation_worker_isolation_unavailable:${plan.workUnitId}`,
				),
			]);
		}
		if (!this.options.worktreeRunner) {
			return complete("held", resumedJobIds, [
				"implementation_worker_worktree_runner_unavailable",
			]);
		}

		const packets = createDispatchPackets(
			this.options.repoRoot,
			observation.workState,
			preview,
			isolationKind,
		);
		await Promise.all(
			packets.map((packet) =>
				writeImplementationWorkerDispatchPacket(this.options.repoRoot, packet),
			),
		);
		const claimBatch = authorizedClaimBatch(preview, packets);
		await this.options.beforeAppend?.();
		const appended = await appendRuntimeWorkUnitClaims(claimBatch, {
			repoRoot: this.options.repoRoot,
			expectedBytesByTrace: observation.expectedBytesByTrace,
		});
		assertStableClaims(packets, appended.events);
		const scheduled = this.schedulePackets(packets);
		for (const packet of packets) pending.add(packet.assignment.workItemId);
		return complete("scheduled", [...resumedJobIds, ...scheduled], []);
	}

	private async resumePackets(
		activeClaims: Map<string, TraceEvent>,
		executionAvailable: boolean,
	): Promise<{
		jobIds: string[];
		recovered: RecoveredImplementationWorker[];
	}> {
		const packets = await readImplementationWorkerDispatchPackets(
			this.options.repoRoot,
		);
		const active = packets.flatMap((packet) => {
			const claimEvent = activeClaims.get(packet.assignment.claimId);
			return claimEvent && packetMatchesClaim(packet, claimEvent)
				? [{ packet, claimEvent }]
				: [];
		});
		const recovered = await Promise.all(
			active.map(async ({ packet, claimEvent }) => {
				try {
					const report = await this.options.adapter.recover(packet.assignment);
					if (!report) return undefined;
					assertImplementationWorkerReport(packet.assignment, report);
					return {
						packet,
						claimEvent,
						report,
						reviewInput: reviewWorkerReport(packet.assignment, report),
					};
				} catch {
					return undefined;
				}
			}),
		);
		return {
			jobIds: executionAvailable
				? this.schedulePackets(active.map(({ packet }) => packet))
				: [],
			recovered: recovered.filter(
				(worker): worker is RecoveredImplementationWorker => Boolean(worker),
			),
		};
	}

	private async recoverIntegrationWorkers(
		canonicalClaims: Map<string, TraceEvent>,
		activeWorkers: RecoveredImplementationWorker[],
	): Promise<RecoveredImplementationWorker[]> {
		const recoveredByClaim = new Map(
			activeWorkers.map((worker) => [
				worker.packet.assignment.claimId,
				worker,
			]),
		);
		const packets = await readImplementationWorkerDispatchPackets(
			this.options.repoRoot,
		);
		await Promise.all(
			packets.map(async (packet) => {
				const claimId = packet.assignment.claimId;
				if (recoveredByClaim.has(claimId)) return undefined;
				const claimEvent = canonicalClaims.get(claimId);
				if (!claimEvent || !packetMatchesClaim(packet, claimEvent)) {
					return undefined;
				}
				try {
					const report = await this.options.adapter.recover(packet.assignment);
					if (!report || report.status !== "completed") return undefined;
					assertImplementationWorkerReport(packet.assignment, report);
					recoveredByClaim.set(claimId, {
						packet,
						claimEvent,
						report,
						reviewInput: reviewWorkerReport(packet.assignment, report),
					});
				} catch {
					// Invalid private evidence cannot authorize integration.
				}
				return undefined;
			}),
		);
		return [...recoveredByClaim.values()];
	}

	private scheduleIntegrations(
		workers: RecoveredImplementationWorker[],
		workState: WorkState,
		records: TraceRecord[],
		createdAt: string,
	): { jobIds: string[]; blockers: string[] } {
		const candidates = workers.flatMap((worker) => {
			if (worker.report.status !== "completed") return [];
			const assignment = worker.packet.assignment;
			const item = workState.workItems.find(
				(candidate) => candidate.id === assignment.workItemId,
			);
			if (!item?.implemented || integrationAlreadyProven(worker, records)) {
				return [];
			}
			const sprint = workState.sprints.find(
				(candidate) => candidate.id === item.sprintId,
			);
			const acceptanceEvent = implementationAcceptanceEvent(
				records,
				assignment.traceId,
				assignment.workItemId,
			);
			return sprint && acceptanceEvent ? [{ worker, sprint, acceptanceEvent }] : [];
		});
		if (candidates.length > 0 && !this.options.worktreeRunner) {
			return {
				jobIds: [],
				blockers: ["implementation_integration_runner_unavailable"],
			};
		}
		const jobIds = candidates.map(({ worker, sprint, acceptanceEvent }) => {
			const input: Omit<ImplementationWorkerIntegrationInput, "coordinator"> = {
				repoRoot: this.options.repoRoot,
				reactor: this.options.reactor,
				packet: worker.packet,
				report: worker.report,
				acceptanceEvent,
				sprintId: sprint.id,
				targetRefs: [...sprint.integrationRefs],
				createdAt,
				runner: this.options.worktreeRunner as WorktreeCommandRunner,
				beforeAppend: this.options.beforeAppend,
			};
			const job = implementationWorkerIntegrationJob(input);
			void this.options.coordinator
				.schedule(job)
				.then(() =>
					this.enqueue({
						kind: "project_truth_changed",
						occurredAt: (this.options.now || (() => new Date().toISOString()))(),
						refs: [worker.packet.assignment.traceId],
					}),
				)
				.catch(() => undefined);
			return job.idempotencyKey;
		});
		return { jobIds, blockers: [] };
	}

	private scheduleProjectBranchMerges(
		records: TraceRecord[],
		createdAt: string,
	): { jobIds: string[]; blockers: string[] } {
		const candidates = records.filter(
			(record): record is TraceEvent =>
				record.type === "trace_event" &&
				record.event === "runtime.integration.proven" &&
				!projectBranchMergeAlreadyProven(record, records),
		);
		if (candidates.length === 0) return { jobIds: [], blockers: [] };
		if (!this.options.mergeAuthority) {
			return {
				jobIds: [],
				blockers: ["project_branch_merge_authority_unavailable"],
			};
		}
		if (!this.options.worktreeRunner) {
			return {
				jobIds: [],
				blockers: ["project_branch_merge_runner_unavailable"],
			};
		}
		const jobIds: string[] = [];
		const blockers: string[] = [];
		for (const integrationEvent of candidates) {
			try {
				const job = projectBranchMergeJob({
					repoRoot: this.options.repoRoot,
					reactor: this.options.reactor,
					integrationEvent,
					authority: this.options.mergeAuthority,
					createdAt,
					runner: this.options.worktreeRunner,
					beforeAppend: this.options.beforeAppend,
				});
				void this.options.coordinator
					.schedule(job)
					.then(() =>
						this.enqueue({
							kind: "project_truth_changed",
							occurredAt: (this.options.now || (() => new Date().toISOString()))(),
							refs: [integrationEvent.traceId],
						}),
					)
					.catch(() => undefined);
				jobIds.push(job.idempotencyKey);
			} catch {
				blockers.push(
					`project_branch_merge_proof_invalid:${safeBlockerSegment(integrationEvent.id)}`,
				);
			}
		}
		return { jobIds, blockers };
	}

	private scheduleProjectBranchPushes(
		records: TraceRecord[],
		createdAt: string,
	): { jobIds: string[]; blockers: string[] } {
		const candidates = records.filter(
			(record): record is TraceEvent =>
				record.type === "trace_event" &&
				record.event === "runtime.project_branch.merged" &&
				!projectBranchPushAlreadyProven(record, records),
		);
		if (candidates.length === 0) return { jobIds: [], blockers: [] };
		if (!this.options.pushAuthority) {
			return {
				jobIds: [],
				blockers: ["project_branch_push_authority_unavailable"],
			};
		}
		if (!this.options.worktreeRunner) {
			return {
				jobIds: [],
				blockers: ["project_branch_push_runner_unavailable"],
			};
		}
		const jobIds: string[] = [];
		const blockers: string[] = [];
		for (const mergeEvent of candidates) {
			try {
				const job = projectBranchPushJob({
					repoRoot: this.options.repoRoot,
					reactor: this.options.reactor,
					mergeEvent,
					authority: this.options.pushAuthority,
					createdAt,
					runner: this.options.worktreeRunner,
					beforeAppend: this.options.beforeAppend,
				});
				void this.options.coordinator.schedule(job).catch(() => undefined);
				jobIds.push(job.idempotencyKey);
			} catch {
				blockers.push(
					`project_branch_push_proof_invalid:${safeBlockerSegment(mergeEvent.id)}`,
				);
			}
		}
		return { jobIds, blockers };
	}

	private scheduleProductPublications(
		records: TraceRecord[],
		createdAt: string,
	): { jobIds: string[]; blockers: string[] } {
		const plan = this.options.publicationPlan;
		if (!plan) return { jobIds: [], blockers: [] };
		const pushEvent = records.find(
			(record): record is TraceEvent =>
				record.type === "trace_event" && record.id === plan.pushEventId,
		);
		if (!pushEvent || productPublicationAlreadyProven(pushEvent, plan, records)) {
			return { jobIds: [], blockers: [] };
		}
		if (!this.options.publicationAdapter) {
			return {
				jobIds: [],
				blockers: ["product_publication_adapter_unavailable"],
			};
		}
		try {
			const job = productPublicationJob({
				repoRoot: this.options.repoRoot,
				reactor: this.options.reactor,
				plan,
				pushEvent,
				adapter: this.options.publicationAdapter,
				createdAt,
				beforeAppend: this.options.beforeAppend,
			});
			void this.options.coordinator
				.schedule(job)
				.then(() =>
					this.enqueue({
						kind: "project_truth_changed",
						occurredAt: (this.options.now || (() => new Date().toISOString()))(),
						refs: [pushEvent.traceId],
					}),
				)
				.catch(() => undefined);
			return { jobIds: [job.idempotencyKey], blockers: [] };
		} catch {
			return {
				jobIds: [],
				blockers: [
					`product_publication_proof_invalid:${safeBlockerSegment(pushEvent.id)}`,
				],
			};
		}
	}

	private scheduleProductReleases(
		records: TraceRecord[],
		createdAt: string,
	): { jobIds: string[]; blockers: string[] } {
		const plan = this.options.releasePlan;
		if (!plan) return { jobIds: [], blockers: [] };
		const publicationEvent = records.find(
			(record): record is TraceEvent =>
				record.type === "trace_event" &&
				record.id === plan.publicationEventId,
		);
		if (
			!publicationEvent ||
			productReleaseAlreadyProven(publicationEvent, plan, records)
		) {
			return { jobIds: [], blockers: [] };
		}
		if (!this.options.releaseAdapter) {
			return {
				jobIds: [],
				blockers: ["product_release_adapter_unavailable"],
			};
		}
		try {
			const job = productReleaseJob({
				repoRoot: this.options.repoRoot,
				reactor: this.options.reactor,
				plan,
				publicationEvent,
				adapter: this.options.releaseAdapter,
				createdAt,
				beforeAppend: this.options.beforeAppend,
			});
			void this.options.coordinator.schedule(job).catch(() => undefined);
			return { jobIds: [job.idempotencyKey], blockers: [] };
		} catch {
			return {
				jobIds: [],
				blockers: [
					`product_release_proof_invalid:${safeBlockerSegment(publicationEvent.id)}`,
				],
			};
		}
	}

	private scheduleReleases(
		workers: RecoveredImplementationWorker[],
		createdAt: string,
	): string[] {
		return workers.map((worker) => {
			const job = implementationWorkerClaimReleaseJob({
				repoRoot: this.options.repoRoot,
				reactor: this.options.reactor,
				assignment: worker.packet.assignment,
				report: worker.report,
				claimEvent: worker.claimEvent,
				createdAt,
				beforeAppend: this.options.beforeAppend,
			});
			void this.options.coordinator.schedule(job).catch(() => undefined);
			return job.idempotencyKey;
		});
	}

	private schedulePackets(
		packets: ImplementationWorkerDispatchPacket[],
	): string[] {
		return packets.map((packet) => {
			const jobId = implementationWorkerJobId(packet.assignment);
			void scheduleImplementationWorkerAssignment({
				coordinator: this.options.coordinator,
				adapter: preparedAdapter(
					this.options.adapter,
					packet.worktreePlan,
					this.options.worktreeRunner,
				),
				assignment: packet.assignment,
			}).catch(() => undefined);
			return jobId;
		});
	}
}

function createDispatchPackets(
	repoRoot: string,
	workState: WorkState,
	runtime: Awaited<ReturnType<typeof runWikiRuntime>>,
	isolationKind: ImplementationWorkerAssignment["isolation"]["kind"],
): ImplementationWorkerDispatchPacket[] {
	const claimEvents = runtime.batch?.events || [];
	const plans = new Map(
		runtime.policy.worktrees.map((plan) => [plan.workUnitId, plan]),
	);
	return runtime.plan.selected.map((candidate) => {
		const claim = claimEvents.find(
			(event) => text(event.data?.workUnitId) === candidate.workUnitId,
		);
		const claimId = text(claim?.data?.claimId);
		const workerId = text(claim?.data?.workerId);
		const plan = plans.get(candidate.workUnitId);
		if (!claim || !claimId || !workerId || !plan?.worktree) {
			throw new Error(
				`Implementation worker dispatch could not bind ${candidate.workUnitId}.`,
			);
		}
		const prompt = createImplementationWorkerPrompt({
			...candidate,
			worktree: plan.worktree,
		});
		const contextDigest = digest({
			workStateDigest: workState.snapshotDigest,
			workItemId: candidate.workUnitId,
			planningRefs: candidate.planningRefs,
			componentRefs: candidate.componentRefs,
			pathScopes: candidate.pathScopes,
			traceRefs: candidate.traceRefs,
			prompt,
		});
		const reportKey = digest({ claimId, contextDigest }).slice(7, 39);
		const assignment: ImplementationWorkerAssignment = {
			schemaVersion: IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION,
			repoRoot,
			assignmentId: claimId,
			workerId,
			workItemId: candidate.workUnitId,
			claimId,
			traceId: candidate.traceId,
			planningRefs: [...candidate.planningRefs],
			traceRefs: [...candidate.traceRefs],
			componentRefs: [...candidate.componentRefs],
			pathScopes: [...candidate.pathScopes],
			workStateDigest: workState.snapshotDigest,
			sourceBaseRef: `git:${plan.worktree.baseSha || plan.worktree.baseRef || "HEAD"}`,
			contextDigest,
			prompt,
			reportPath: join(
				repoRoot,
				".codewiki",
				"runtime",
				"workers",
				`${reportKey}.json`,
			),
			isolation: {
				kind: isolationKind,
				ref: `${isolationKind}:${digest(plan.worktree).slice(7)}`,
			},
			worktree: plan.worktree,
		};
		assertImplementationWorkerAssignment(assignment);
		return {
			schemaVersion: IMPLEMENTATION_WORKER_DISPATCH_PACKET_SCHEMA_VERSION,
			claimEventId: claim.id,
			assignment,
			worktreePlan: plan,
		};
	});
}

function authorizedClaimBatch(
	runtime: Awaited<ReturnType<typeof runWikiRuntime>>,
	packets: ImplementationWorkerDispatchPacket[],
) {
	const batch = runtime.batch;
	if (!batch) {
		throw new Error("Implementation worker dispatch requires claim events.");
	}
	const packetsByWorkItem = new Map(
		packets.map((packet) => [packet.assignment.workItemId, packet]),
	);
	return {
		...batch,
		events: batch.events.map((event) => {
			const packet = packetsByWorkItem.get(text(event.data?.workUnitId));
			if (!packet) {
				throw new Error(
					`Implementation worker dispatch has no packet for ${event.id}.`,
				);
			}
			return {
				...event,
				data: {
					...(event.data || {}),
					runtimeJobId: implementationWorkerJobId(packet.assignment),
					runtimeAssignmentDigest: digest(packet),
				},
			};
		}),
	};
}

function packetMatchesClaim(
	packet: ImplementationWorkerDispatchPacket,
	claim: TraceEvent,
): boolean {
	const assignment = packet.assignment;
	return (
		packet.claimEventId === claim.id &&
		assignment.traceId === claim.traceId &&
		assignment.claimId === text(claim.data?.claimId) &&
		assignment.workerId === text(claim.data?.workerId) &&
		assignment.workItemId === text(claim.data?.workUnitId) &&
		implementationWorkerJobId(assignment) === text(claim.data?.runtimeJobId) &&
		digest(packet) === text(claim.data?.runtimeAssignmentDigest) &&
		[...assignment.planningRefs, ...assignment.pathScopes].every((ref) =>
			claim.refs.includes(ref),
		)
	);
}

function preparedAdapter(
	adapter: ImplementationWorkerAdapter,
	plan: RuntimeWorktreePlan,
	runner: WorktreeCommandRunner | undefined,
): ImplementationWorkerAdapter {
	const availability = adapter.availability?.bind(adapter);
	return {
		isolationKinds: adapter.isolationKinds,
		...(availability ? { availability } : {}),
		recover: (assignment) => adapter.recover(assignment),
		async execute(assignment, signal) {
			signal.throwIfAborted();
			if (!runner) {
				throw new Error(
					"Implementation worker worktree runner is unavailable.",
				);
			}
			await executeRuntimeWorktreeCommands(plan, {
				dryRun: false,
				runner,
				steps: ["worktree.prepare", "worktree.verify"],
			});
			signal.throwIfAborted();
			return adapter.execute(assignment, signal);
		},
	};
}

function assertStableClaims(
	packets: ImplementationWorkerDispatchPacket[],
	appended: TraceEvent[],
): void {
	const expected = packets
		.map((packet) => packet.claimEventId)
		.sort(compareText);
	const actual = appended.map((event) => event.id).sort(compareText);
	if (JSON.stringify(expected) !== JSON.stringify(actual)) {
		throw new Error(
			"Implementation worker claim selection changed before append.",
		);
	}
}

function nextSequenceByTrace(records: TraceRecord[]): Record<string, number> {
	const next: Record<string, number> = {};
	for (const record of records) {
		if (record.type !== "trace_event") continue;
		next[record.traceId] = Math.max(
			next[record.traceId] || 1,
			record.sequence + 1,
		);
	}
	return next;
}

function dispatchPrefix(
	kind: "claim" | "worker",
	workStateDigest: string,
): string {
	return `${kind}-${digest(workStateDigest).slice(7, 19)}`;
}

function adapterSupportsIsolation(
	adapter: ImplementationWorkerAdapter,
	kind: ImplementationWorkerAssignment["isolation"]["kind"],
): boolean {
	return !adapter.isolationKinds || adapter.isolationKinds.includes(kind);
}

function implementationWorkerIsolationKind(
	options: ImplementationWorkerDispatcherOptions,
): ImplementationWorkerAssignment["isolation"]["kind"] {
	if (options.isolationKind) return options.isolationKind;
	if (
		options.adapter.isolationKinds?.includes("container") &&
		!options.adapter.isolationKinds.includes("worktree")
	) {
		return "container";
	}
	return "worktree";
}

async function inspectWorkerAdapter(
	adapter: ImplementationWorkerAdapter,
): Promise<{ available: boolean; reason: string }> {
	if (!adapter.availability) return { available: true, reason: "available" };
	try {
		const result = await adapter.availability();
		return result.available
			? { available: true, reason: "available" }
			: {
					available: false,
					reason: safeBlockerSegment(result.reason || "unavailable"),
				};
	} catch {
		return { available: false, reason: "inspection_failed" };
	}
}

function projectBranchMergeAlreadyProven(
	integrationEvent: TraceEvent,
	records: TraceRecord[],
): boolean {
	return records.some(
		(record) =>
			record.type === "trace_event" &&
			record.event === "runtime.project_branch.merged" &&
			record.data?.integrationEventId === integrationEvent.id &&
			record.data?.commit === integrationEvent.data?.commit &&
			record.data?.tree === integrationEvent.data?.tree,
	);
}

function projectBranchPushAlreadyProven(
	mergeEvent: TraceEvent,
	records: TraceRecord[],
): boolean {
	return records.some(
		(record) =>
			record.type === "trace_event" &&
			record.event === "runtime.project_branch.pushed" &&
			record.data?.mergeEventId === mergeEvent.id &&
			record.data?.commit === mergeEvent.data?.commit &&
			record.data?.tree === mergeEvent.data?.tree,
	);
}

function productPublicationAlreadyProven(
	pushEvent: TraceEvent,
	plan: ProductPublicationPlan,
	records: TraceRecord[],
): boolean {
	return records.some((record) => {
		if (record.type !== "trace_event") return false;
		const artifact = objectValue(record.data?.artifact);
		return (
			record.event === "runtime.product.published" &&
			record.data?.pushEventId === pushEvent.id &&
			record.data?.targetId === plan.target.targetId &&
			record.data?.channel === plan.target.channel &&
			artifact?.digest === plan.artifact.digest
		);
	});
}

function productReleaseAlreadyProven(
	publicationEvent: TraceEvent,
	plan: ProductReleasePlan,
	records: TraceRecord[],
): boolean {
	return records.some((record) => {
		if (record.type !== "trace_event") return false;
		const artifact = objectValue(record.data?.artifact);
		return (
			record.event === "runtime.product.released" &&
			record.data?.publicationEventId === publicationEvent.id &&
			record.data?.targetId === plan.target.targetId &&
			record.data?.channel === plan.target.channel &&
			artifact?.digest === plan.authority.artifactDigest
		);
	});
}

function safeBlockerSegment(value: string): string {
	const normalized = value
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/gu, "_")
		.replace(/^_+|_+$/gu, "")
		.slice(0, 80);
	return normalized || "unavailable";
}

function integratedClaimProofs(
	records: TraceRecord[],
): Map<string, { assignmentId: string; workerReportRef: string }> {
	return new Map(
		records.flatMap((record) => {
			if (
				record.type !== "trace_event" ||
				record.event !== "runtime.integration.proven"
			) {
				return [];
			}
			const claimId = text(record.data?.claimId);
			const assignmentId = text(record.data?.assignmentId);
			const workerReportRef = text(record.data?.workerReportRef);
			const runtimeJobId = text(record.data?.runtimeJobId);
			const commit = text(record.data?.commit);
			const tree = text(record.data?.tree);
			const contentProof = text(record.data?.contentProof);
			return claimId &&
				assignmentId &&
				workerReportRef &&
				/^implementation-integration:[a-f0-9]{64}$/u.test(runtimeJobId) &&
				/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(commit) &&
				/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(tree) &&
				contentProof === `git-tree:${tree}`
				? [[claimId, { assignmentId, workerReportRef }] as const]
				: [];
		}),
	);
}

function integrationAlreadyProven(
	worker: RecoveredImplementationWorker,
	records: TraceRecord[],
): boolean {
	const assignment = worker.packet.assignment;
	return records.some(
		(record) =>
			record.type === "trace_event" &&
			record.event === "runtime.integration.proven" &&
			record.data?.claimId === assignment.claimId &&
			record.data?.assignmentId === assignment.assignmentId &&
			record.data?.workerReportRef === worker.report.reportRef,
	);
}

function implementationAcceptanceEvent(
	records: TraceRecord[],
	traceId: string,
	workItemId: string,
): TraceEvent | undefined {
	for (let index = records.length - 1; index >= 0; index -= 1) {
		const record = records[index];
		if (
			record?.type === "trace_event" &&
			record.traceId === traceId &&
			record.loop === "implementation" &&
			record.event === "evidence_accepted" &&
			implementationEventCoversWorkItem(record, workItemId)
		) {
			return record;
		}
	}
	return undefined;
}

function implementationEventCoversWorkItem(
	event: TraceEvent,
	workItemId: string,
): boolean {
	const output = objectValue(event.data?.output);
	return [
		...stringList(output?.coveredWorkItemRefs),
		...objectList(output?.changes).flatMap((change) =>
			stringList(change.planningRefs),
		),
	].some(
		(ref) =>
			ref === workItemId ||
			ref.endsWith(`#work:${workItemId}`) ||
			ref.endsWith(`#work-item:${workItemId}`),
	);
}

function workerReportCanRelease(
	worker: RecoveredImplementationWorker,
	workState: WorkState,
): boolean {
	if (worker.report.status !== "completed") return true;
	return Boolean(
		workState.workItems.find(
			(item) => item.id === worker.packet.assignment.workItemId,
		)?.implemented,
	);
}

function reviewWorkerReport(
	assignment: ImplementationWorkerAssignment,
	report: ImplementationWorkerReport,
): ImplementationWorkerReportInput {
	const evidence = report.implementationEvidence;
	return {
		...(evidence || {}),
		workerId: assignment.workerId,
		workUnitId: assignment.workItemId,
		claimId: assignment.claimId,
		planningRefs: [...assignment.planningRefs],
		status: report.status,
		refs: [...new Set([...(evidence?.refs || []), report.reportRef])],
		...(report.sessionId ? { sessionId: report.sessionId } : {}),
		...(report.sessionFile ? { sessionFile: report.sessionFile } : {}),
		...(report.error ? { message: report.error } : {}),
	};
}

function runtimeReconciliation(
	dispatch: ImplementationWorkerDispatchResult,
	workerReports: ImplementationWorkerReportInput[],
): ImplementationWorkerRuntimeReconciliation {
	return { dispatch, workerReports };
}

function dispatchResult(input: {
	status: ImplementationWorkerDispatchResult["status"];
	workState: WorkState;
	pendingWorkItemIds: Set<string>;
	workerReports: ImplementationWorkerReportInput[];
	scheduledJobIds: string[];
	blockers: string[];
}): ImplementationWorkerDispatchResult {
	return {
		status: input.status,
		workStateDigest: input.workState.snapshotDigest,
		pendingWorkItemIds: [...input.pendingWorkItemIds].sort(compareText),
		reviewReadyWorkItemIds: input.workerReports
			.map((result) => result.workUnitId)
			.sort(compareText),
		scheduledJobIds: [...new Set(input.scheduledJobIds)].sort(compareText),
		blockers: [...new Set(input.blockers)].sort(compareText),
	};
}

function defaultGitStatus(repoRoot: string): Promise<GitStatusSnapshot> {
	return collectGitStatusSnapshot({ repoRoot });
}

function digest(value: unknown): string {
	return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}
	return value as Record<string, unknown>;
}

function objectList(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		const object = objectValue(entry);
		return object ? [object] : [];
	});
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}
