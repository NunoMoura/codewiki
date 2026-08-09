import type { WorktreeCommand, WorktreeRef } from "../../git/worktrees.ts";
import type { WorkerSessionInput } from "./start.ts";
import type { CodewikiHostError } from "../../error-handling/host-errors.ts";
import { createWorkerPrompt } from "./start.ts";
import type {
	RuntimeWorkUnitClaimAppendResult,
	RuntimeWorkUnitClaimEventBatch,
} from "../claims/work-unit-events.ts";
import type { RuntimeWorkUnitClaimPolicyDecision } from "../claims/policy.ts";
import type {
	RuntimeWorkUnitClaimCandidate,
	RuntimeWorkUnitClaimSelection,
} from "../claims/work-unit-selection.ts";
import type { TraceEvent } from "../../traces/types.ts";
import type { WorkerExecutionPolicySnapshot } from "./execution-policy.ts";

export type RuntimeHandoffSchemaVersion = "codewiki.runtime.handoff.v2";
export type RuntimeDisposableWorkerState =
	| "starting"
	| "running"
	| "completed"
	| "failed"
	| "blocked"
	| "cancelled"
	| "detached";

export interface RuntimeWorkerStatusRemediation {
	reason: string;
	route: string;
	blockers: string[];
	refs: string[];
	suggestedActions: string[];
	hostErrors?: CodewikiHostError[];
}

export interface RuntimeDisposableWorkerStatus {
	workerId: string;
	workUnitId: string;
	traceId: string;
	state: RuntimeDisposableWorkerState;
	planningRefs?: string[];
	claimId?: string;
	pid?: number;
	sessionId?: string;
	sessionFile?: string;
	outputRef?: string;
	lastActivityAt?: string;
	remediation?: RuntimeWorkerStatusRemediation;
	executionPolicy?: WorkerExecutionPolicySnapshot;
}
export type RuntimeHandoffAction =
	| "runtime.claims"
	| "worktree.prepare"
	| "worker.start"
	| "worker.collect_completion"
	| "wiki.implement"
	| "runtime.release"
	| "worktree.cleanup";

export interface RuntimeHandoffRuntimeResult {
	action: "work-unit-claims";
	mode: "preview" | "append";
	plan: RuntimeWorkUnitClaimSelection;
	policy: RuntimeWorkUnitClaimPolicyDecision;
	batch?: RuntimeWorkUnitClaimEventBatch;
	append?: RuntimeWorkUnitClaimAppendResult;
}

export interface CreateRuntimeHandoffManifestOptions {
	runtime: RuntimeHandoffRuntimeResult;
	claimEvents?: TraceEvent[];
	promptPrefix?: string;
	promptSuffix?: string;
	executionPoliciesByWorkUnit?: Record<string, WorkerExecutionPolicySnapshot>;
}

export interface RuntimeHandoffManifest {
	schemaVersion: RuntimeHandoffSchemaVersion;
	kind: "runtime_handoff";
	runtime: RuntimeHandoffSummary;
	claimEvents: TraceEvent[];
	workers: RuntimeHandoffWorker[];
	workerStatuses: RuntimeDisposableWorkerStatus[];
	expectedCompletion: RuntimeHandoffCompletionContract;
	release: RuntimeHandoffReleaseInstructions;
	actions: RuntimeHandoffAction[];
}

export interface RuntimeHandoffSummary {
	action: "work-unit-claims";
	mode: "preview" | "append";
	appendAllowed: boolean;
	blockers: string[];
	claimSelectionCount: number;
	heldCount: number;
	claimEventCount: number;
}

export interface RuntimeHandoffWorker {
	workUnitId: string;
	workerId: string;
	traceId: string;
	title: string;
	claimId?: string;
	planningRefs: string[];
	componentRefs: string[];
	pathScopes: string[];
	worktree?: WorktreeRef;
	worktreeCommands: RuntimeHandoffWorktreeCommands;
	executionPolicy?: WorkerExecutionPolicySnapshot;
	sessionInput: WorkerSessionInput & {
		executionPolicy?: WorkerExecutionPolicySnapshot;
	};
	completionFeeds: "collectWorkerOutputFiles -> collectWorkerReports";
	implementationInput: "workerReports";
}

export interface RuntimeHandoffWorktreeCommands {
	execute: "host_explicit_only";
	dryRunDefault: true;
	worktreePrepare: WorktreeCommand[];
	worktreeVerify: WorktreeCommand[];
	worktreeCleanup: WorktreeCommand[];
}

export interface RuntimeHandoffCompletionContract {
	collector: "collectWorkerOutputFiles -> collectWorkerReports";
	statusValues: ["completed", "blocked", "failed"];
	requiredFields: string[];
	proofFields: string[];
	example: Record<string, unknown>;
}

export interface RuntimeHandoffReleaseInstructions {
	failedStart: {
		helper: "createRuntimeFailedWorkerStartReleaseEvents";
		timing: "after_worker_start_failure";
	};
	completion: {
		helper: "createRuntimeWorkerCompletionReleaseEvents";
		timing: "after_wiki_implement_consumes_worker_results";
	};
}

export function createRuntimeHandoffManifest(
	options: CreateRuntimeHandoffManifestOptions,
): RuntimeHandoffManifest {
	const claimEvents = handoffClaimEvents(options);
	const claimMetadata = claimMetadataByWorkUnit(claimEvents);
	const worktrees = worktreePlanByWorkUnit(options.runtime.policy.worktrees);
	const workers = options.runtime.plan.selected.map((item) =>
		handoffWorker({ item, claimMetadata, worktrees, options }),
	);
	return {
		schemaVersion: "codewiki.runtime.handoff.v2",
		kind: "runtime_handoff",
		runtime: runtimeSummary(options.runtime, claimEvents),
		claimEvents,
		workers,
		workerStatuses: handoffWorkerStatuses(workers),
		expectedCompletion: expectedCompletionContract(),
		release: releaseInstructions(),
		actions: handoffActions(workers),
	};
}

function handoffWorker(input: {
	item: RuntimeWorkUnitClaimCandidate;
	claimMetadata: Map<string, RuntimeHandoffClaimMetadata>;
	worktrees: Map<
		string,
		RuntimeWorkUnitClaimPolicyDecision["worktrees"][number]
	>;
	options: CreateRuntimeHandoffManifestOptions;
}): RuntimeHandoffWorker {
	const claim = input.claimMetadata.get(input.item.workUnitId);
	const worktreePlan = input.worktrees.get(input.item.workUnitId);
	const workerId =
		claim?.workerId || worktreePlan?.workerId || input.item.workUnitId;
	const worktree = claim?.worktree || worktreePlan?.worktree;
	const promptItem = {
		...input.item,
		...(worktree ? { worktree } : {}),
	};
	const prompt = createWorkerPrompt(promptItem, input.options);
	const executionPolicy =
		input.options.executionPoliciesByWorkUnit?.[input.item.workUnitId];
	return {
		workUnitId: input.item.workUnitId,
		workerId,
		traceId: input.item.traceId,
		title: input.item.title,
		...(claim?.claimId ? { claimId: claim.claimId } : {}),
		planningRefs: [...input.item.planningRefs],
		componentRefs: [...input.item.componentRefs],
		pathScopes: [...input.item.pathScopes],
		...(worktree ? { worktree } : {}),
		...(executionPolicy ? { executionPolicy } : {}),
		worktreeCommands: {
			execute: "host_explicit_only",
			dryRunDefault: true,
			worktreePrepare: [...(worktreePlan?.commands.worktreePrepare || [])],
			worktreeVerify: [...(worktreePlan?.commands.worktreeVerify || [])],
			worktreeCleanup: [...(worktreePlan?.commands.worktreeCleanup || [])],
		},
		sessionInput: {
			workerId,
			workUnitId: input.item.workUnitId,
			traceId: input.item.traceId,
			planningRefs: [...input.item.planningRefs],
			pathScopes: [...input.item.pathScopes],
			componentRefs: [...input.item.componentRefs],
			...(worktree ? { worktree } : {}),
			...(executionPolicy ? { executionPolicy } : {}),
			prompt,
		},
		completionFeeds: "collectWorkerOutputFiles -> collectWorkerReports",
		implementationInput: "workerReports",
	};
}

function handoffWorkerStatuses(
	workers: RuntimeHandoffWorker[],
): RuntimeDisposableWorkerStatus[] {
	return workers.map((worker) => ({
		workerId: worker.workerId,
		workUnitId: worker.workUnitId,
		traceId: worker.traceId,
		state: "starting",
		planningRefs: [...worker.planningRefs],
		...(worker.claimId ? { claimId: worker.claimId } : {}),
		...(worker.executionPolicy
			? { executionPolicy: worker.executionPolicy }
			: {}),
	}));
}

function handoffClaimEvents(
	options: CreateRuntimeHandoffManifestOptions,
): TraceEvent[] {
	return [
		...(options.claimEvents ||
			options.runtime.append?.events ||
			options.runtime.batch?.events ||
			[]),
	];
}

function runtimeSummary(
	runtime: RuntimeHandoffRuntimeResult,
	claimEvents: TraceEvent[],
): RuntimeHandoffSummary {
	return {
		action: runtime.action,
		mode: runtime.mode,
		appendAllowed: runtime.policy.appendAllowed,
		blockers: [...runtime.policy.blockers],
		claimSelectionCount: runtime.plan.selected.length,
		heldCount: runtime.plan.held.length,
		claimEventCount: claimEvents.length,
	};
}

function handoffActions(
	workers: RuntimeHandoffWorker[],
): RuntimeHandoffAction[] {
	return [
		"runtime.claims",
		...(workers.some(
			(worker) => worker.worktreeCommands.worktreePrepare.length > 0,
		)
			? ["worktree.prepare" as const]
			: []),
		"worker.start",
		"worker.collect_completion",
		"wiki.implement",
		"runtime.release",
		...(workers.some(
			(worker) => worker.worktreeCommands.worktreeCleanup.length > 0,
		)
			? ["worktree.cleanup" as const]
			: []),
	];
}

function expectedCompletionContract(): RuntimeHandoffCompletionContract {
	return {
		collector: "collectWorkerOutputFiles -> collectWorkerReports",
		statusValues: ["completed", "blocked", "failed"],
		requiredFields: [
			"status",
			"workUnitRef",
			"changedFiles",
			"checksRun",
			"changes[].checkResults",
			"changes[].acceptanceEvidenceItems",
		],
		proofFields: [
			"changedFiles",
			"checksRun",
			"contentProofRefs",
			"headSha",
			"treeSha",
			"workingTreeDigest",
			"validationRef",
		],
		example: {
			status: "completed",
			workUnitRef: "trace:<planning-iteration>#work:<work-unit-id>",
			changedFiles: ["src/example.ts", "tests/example.test.mjs"],
			checksRun: ["node --test tests/example.test.mjs"],
			contentProofRefs: ["sha256:<working-tree-digest>"],
			residualRisks: [],
			blockers: [{ message: "", refs: [] }],
			notes: "",
			changes: [
				{
					id: "IC-worker-001",
					planningRefs: ["trace:<planning-iteration>#work:<work-unit-id>"],
					codePaths: ["src/example.ts"],
					testPaths: ["tests/example.test.mjs"],
					checkResults: [
						{
							command: "node --test tests/example.test.mjs",
							status: "pass",
						},
					],
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-001",
							summary: "Worker evidence satisfies acceptance criterion.",
							evidenceRefs: ["tests/example.test.mjs"],
						},
					],
				},
			],
		},
	};
}

function releaseInstructions(): RuntimeHandoffReleaseInstructions {
	return {
		failedStart: {
			helper: "createRuntimeFailedWorkerStartReleaseEvents",
			timing: "after_worker_start_failure",
		},
		completion: {
			helper: "createRuntimeWorkerCompletionReleaseEvents",
			timing: "after_wiki_implement_consumes_worker_results",
		},
	};
}

interface RuntimeHandoffClaimMetadata {
	workerId: string;
	claimId?: string;
	worktree?: WorktreeRef;
}

function claimMetadataByWorkUnit(
	claimEvents: TraceEvent[],
): Map<string, RuntimeHandoffClaimMetadata> {
	const metadata = new Map<string, RuntimeHandoffClaimMetadata>();
	for (const event of claimEvents) {
		const workUnitId = text(event.data?.workUnitId);
		const workerId = text(event.data?.workerId);
		if (!workUnitId || !workerId) continue;
		const worktree = worktreeRef(event.data?.worktree);
		metadata.set(workUnitId, {
			workerId,
			...(text(event.data?.claimId)
				? { claimId: text(event.data?.claimId) }
				: {}),
			...(worktree ? { worktree } : {}),
		});
	}
	return metadata;
}

function worktreePlanByWorkUnit(
	plans: RuntimeWorkUnitClaimPolicyDecision["worktrees"],
): Map<string, RuntimeWorkUnitClaimPolicyDecision["worktrees"][number]> {
	return new Map(plans.map((plan) => [plan.workUnitId, plan]));
}

function worktreeRef(value: unknown): WorktreeRef | undefined {
	if (!value || typeof value !== "object") return undefined;
	const record = value as Record<string, unknown>;
	const path = text(record.path);
	if (!path) return undefined;
	return {
		path,
		...(text(record.branch) ? { branch: text(record.branch) } : {}),
		...(text(record.baseRef) ? { baseRef: text(record.baseRef) } : {}),
		...(text(record.baseSha) ? { baseSha: text(record.baseSha) } : {}),
	};
}

function text(value: unknown): string {
	return String(value || "").trim();
}
