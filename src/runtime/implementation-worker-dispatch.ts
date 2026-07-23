import { createHash } from "node:crypto";
import { join } from "node:path";

import {
	runWikiRuntime,
	type RunWikiRuntimeInput,
} from "../api/wiki-runtime.ts";
import {
	collectGitStatusSnapshot,
	runtimeWorktreeInputsFromGitStatus,
	type GitStatusSnapshot,
} from "../git/status.ts";
import {
	executeRuntimeWorktreeCommands,
	type RuntimeWorktreePlan,
	type WorktreeCommandRunner,
} from "../git/worktrees.ts";
import type { ImplementationWorkerReportInput } from "../implementation/workers.ts";
import { loadWikiConfigFile } from "../project/config-file.ts";
import type { WikiConfig } from "../project/config.ts";
import type { TraceEvent, TraceRecord } from "../traces/types.ts";
import { buildWorkQueueView } from "../views/work-queue.ts";
import type { WorkState } from "../work-state/types.ts";
import { createRuntimeHandoffManifest } from "./handoff.ts";
import {
	IMPLEMENTATION_WORKER_DISPATCH_PACKET_SCHEMA_VERSION,
	cleanupImplementationWorkerArtifacts,
	readImplementationWorkerDispatchPackets,
	writeImplementationWorkerDispatchPacket,
	type ImplementationWorkerDispatchPacket,
} from "./implementation-worker-artifacts.ts";
import {
	IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION,
	assertImplementationWorkerAssignment,
	assertImplementationWorkerReport,
	implementationWorkerJobId,
	type ImplementationWorkerAdapter,
	type ImplementationWorkerAssignment,
	type ImplementationWorkerReport,
} from "./implementation-worker-adapter.ts";
import { scheduleImplementationWorkerAssignment } from "./implementation-worker-jobs.ts";
import { implementationWorkerClaimReleaseJob } from "./implementation-worker-review.ts";
import type { ProjectCoordinator } from "./project-coordinator.ts";
import { appendRuntimeWorkUnitClaims } from "./work-unit-claims.ts";
import type { RuntimeReactor, RuntimeTrigger } from "./reactor.ts";

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
	worktreeRunner?: WorktreeCommandRunner;
	loadConfig?: (repoRoot: string) => Promise<WikiConfig>;
	collectGitStatus?: (repoRoot: string) => Promise<GitStatusSnapshot>;
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
		const canonicalClaimEventIds = new Set(
			observation.records.flatMap((record) =>
				record.type === "trace_event" &&
				record.event === "runtime.work_unit.claimed"
					? [record.id]
					: [],
			),
		);
		await this.options.beforeAppend?.();
		const cleanup = await cleanupImplementationWorkerArtifacts({
			repoRoot: this.options.repoRoot,
			activeClaimIds,
			canonicalClaimEventIds,
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
		const resumed = await this.resumePackets(activeClaims);
		const releaseable = resumed.recovered.filter((worker) =>
			workerReportCanRelease(worker, observation.workState),
		);
		const releasingClaims = new Set(
			releaseable.map((worker) => worker.packet.assignment.claimId),
		);
		const workerReports = resumed.recovered
			.filter(
				(worker) => !releasingClaims.has(worker.packet.assignment.claimId),
			)
			.map((worker) => worker.reviewInput);
		const releaseJobIds = this.scheduleReleases(releaseable, createdAt);
		const resumedJobIds = [...resumed.jobIds, ...releaseJobIds];
		const pending = new Set(workerRequiredWorkItemIds);
		for (const result of workerReports) pending.delete(result.workUnitId);
		const complete = (
			status: ImplementationWorkerDispatchResult["status"],
			jobIds: string[],
			blockers: string[],
		): ImplementationWorkerRuntimeReconciliation =>
			runtimeReconciliation(
				dispatchResult(
					status,
					observation.workState,
					pending,
					workerReports,
					jobIds,
					blockers,
				),
				workerReports,
			);

		if (cleanup.blockers.length > 0) {
			return complete("held", resumedJobIds, cleanup.blockers);
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
				!plan.worktree || !adapterSupportsWorktree(this.options.adapter),
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

	private async resumePackets(activeClaims: Map<string, TraceEvent>): Promise<{
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
			jobIds: this.schedulePackets(active.map(({ packet }) => packet)),
			recovered: recovered.filter(
				(worker): worker is RecoveredImplementationWorker => Boolean(worker),
			),
		};
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
): ImplementationWorkerDispatchPacket[] {
	const claimEvents = runtime.batch?.events || [];
	const handoff = createRuntimeHandoffManifest({ runtime, claimEvents });
	const candidates = new Map(
		runtime.plan.selected.map((candidate) => [candidate.workUnitId, candidate]),
	);
	const plans = new Map(
		runtime.policy.worktrees.map((plan) => [plan.workUnitId, plan]),
	);
	return handoff.workers.map((worker) => {
		const claim = claimEvents.find(
			(event) => text(event.data?.workUnitId) === worker.workUnitId,
		);
		const candidate = candidates.get(worker.workUnitId);
		const plan = plans.get(worker.workUnitId);
		if (!claim || !worker.claimId || !worker.worktree || !candidate || !plan) {
			throw new Error(
				`Implementation worker dispatch could not bind ${worker.workUnitId}.`,
			);
		}
		const contextDigest = digest({
			workStateDigest: workState.snapshotDigest,
			workItemId: worker.workUnitId,
			planningRefs: worker.planningRefs,
			componentRefs: worker.componentRefs,
			pathScopes: worker.pathScopes,
			traceRefs: candidate.traceRefs,
			prompt: worker.sessionInput.prompt,
		});
		const reportKey = digest({ claimId: worker.claimId, contextDigest }).slice(
			7,
			39,
		);
		const assignment: ImplementationWorkerAssignment = {
			schemaVersion: IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION,
			repoRoot,
			assignmentId: worker.claimId,
			workerId: worker.workerId,
			workItemId: worker.workUnitId,
			claimId: worker.claimId,
			traceId: worker.traceId,
			planningRefs: [...worker.planningRefs],
			traceRefs: [...candidate.traceRefs],
			componentRefs: [...worker.componentRefs],
			pathScopes: [...worker.pathScopes],
			workStateDigest: workState.snapshotDigest,
			sourceBaseRef: `git:${worker.worktree.baseSha || worker.worktree.baseRef || "HEAD"}`,
			contextDigest,
			prompt: worker.sessionInput.prompt,
			reportPath: join(
				repoRoot,
				".codewiki",
				"runtime",
				"workers",
				`${reportKey}.json`,
			),
			isolation: {
				kind: "worktree",
				ref: `worktree:${digest(worker.worktree).slice(7)}`,
			},
			worktree: worker.worktree,
			...(worker.executionPolicy
				? { executionPolicy: worker.executionPolicy }
				: {}),
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
	return {
		isolationKinds: adapter.isolationKinds,
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

function adapterSupportsWorktree(
	adapter: ImplementationWorkerAdapter,
): boolean {
	return !adapter.isolationKinds || adapter.isolationKinds.includes("worktree");
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

function dispatchResult(
	status: ImplementationWorkerDispatchResult["status"],
	workState: WorkState,
	pendingWorkItemIds: Set<string>,
	workerReports: ImplementationWorkerReportInput[],
	scheduledJobIds: string[],
	blockers: string[],
): ImplementationWorkerDispatchResult {
	return {
		status,
		workStateDigest: workState.snapshotDigest,
		pendingWorkItemIds: [...pendingWorkItemIds].sort(compareText),
		reviewReadyWorkItemIds: workerReports
			.map((result) => result.workUnitId)
			.sort(compareText),
		scheduledJobIds: [...new Set(scheduledJobIds)].sort(compareText),
		blockers: [...new Set(blockers)].sort(compareText),
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

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}
