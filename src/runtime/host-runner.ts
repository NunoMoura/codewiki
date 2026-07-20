import {
	collectGitStatusSnapshot,
	runtimeWorktreeInputsFromGitStatus,
	type GitStatusSnapshot,
	type GitStatusSnapshotInput,
} from "../git/status.ts";
import {
	executeRuntimeWorktreeCommands,
	type RuntimeWorktreePlan,
	type WorktreeCommandExecutionRecord,
	type WorktreeCommandExecutionResult,
	type WorktreeCommandRunner,
	type WorktreeCommandStep,
} from "../git/worktrees.ts";
import {
	runWikiImplement,
	type RunWikiImplementInput,
	type RunWikiImplementResult,
} from "../api/wiki-implement.ts";
import {
	runWikiRuntime,
	type RunWikiRuntimeInput,
	type RunWikiRuntimeResult,
} from "../api/wiki-runtime.ts";
import {
	startPiWorkers,
	type PiWorkerStartResult,
	type PiWorkerSessionFactory,
} from "../pi/worker-start.ts";
import {
	collectPiWorkerOutputFiles,
	collectPiWorkerResults,
	type PiWorkerCompletionInput,
} from "../pi/worker-results.ts";
import type { ImplementationWorkerResultInput } from "../implementation/workers.ts";
import { resolveWikiConfig } from "../project/config.ts";
import { buildProjectWorkState } from "../work-state/project.ts";
import type { TraceEvent } from "../traces/types.ts";
import {
	resolveExecutionPolicy,
	workerExecutionPolicySnapshot,
	type ExecutionPolicyContext,
	type WorkerExecutionPolicySnapshot,
} from "./execution-policy.ts";
import { appendDevLogEntry } from "./dev-log.ts";
import {
	appendRuntimeWorkUnitClaims,
	createRuntimeFailedWorkerStartReleaseEvents,
	createRuntimeWorkerCompletionReleaseEvents,
	type RuntimeWorkUnitClaimAppendResult,
	type RuntimeWorkUnitClaimEventBatch,
} from "./work-unit-claims.ts";
import {
	createRuntimeHandoffManifest,
	type RuntimeDisposableWorkerStatus,
	type RuntimeHandoffManifest,
} from "./handoff.ts";
import {
	createCodewikiHostError,
	type CodewikiHostError,
	type CodewikiHostErrorKind,
} from "../error-handling/host-errors.ts";

interface PreviewRuntimeHostHandoffInput {
	runtime: RunWikiRuntimeInput;
	gitStatus?: GitStatusSnapshotInput | GitStatusSnapshot | false;
	promptPrefix?: string;
	promptSuffix?: string;
}

interface PreviewRuntimeHostHandoffResult {
	mode: "preview";
	gitStatus?: GitStatusSnapshot;
	runtime: RunWikiRuntimeResult;
	handoff: RuntimeHandoffManifest;
}

type RuntimeHostCompletionCollector = (input: {
	runtime: RunWikiRuntimeResult;
	handoff: RuntimeHandoffManifest;
	workers: PiWorkerStartResult[];
}) => Promise<PiWorkerCompletionInput[]> | PiWorkerCompletionInput[];

type RuntimeHostImplementationInput = Omit<
	RunWikiImplementInput,
	"repoRoot" | "expectedWorkStateDigest" | "mode" | "workerResults"
>;

type RuntimeHostWorktreeCommandMode = "skip" | "dry-run" | "execute";
type RuntimeHostWorktreePhase = "prepare" | "cleanup";
const WORKTREE_PREPARE_PHASE: RuntimeHostWorktreePhase = "prepare";
const WORKTREE_CLEANUP_PHASE: RuntimeHostWorktreePhase = "cleanup";

interface ResumeRuntimeHostWorkerSessionsInput {
	sessionFactory: PiWorkerSessionFactory;
	workerStatuses: RuntimeDisposableWorkerStatus[];
	supervision?: RuntimeHostSupervision;
	currentExecutionPoliciesByWorkUnit?: Record<
		string,
		WorkerExecutionPolicySnapshot
	>;
}

interface ResumeRuntimeHostWorkerSessionsResult {
	workerStatuses: RuntimeDisposableWorkerStatus[];
}

export interface WatchRuntimeHostWorkerSessionsInput
	extends ResumeRuntimeHostWorkerSessionsInput {}

export interface WatchRuntimeHostWorkerSessionsResult {
	workerStatuses: RuntimeDisposableWorkerStatus[];
	completions: PiWorkerCompletionInput[];
	workerResults: ImplementationWorkerResultInput[];
	hostErrors: CodewikiHostError[];
	releaseCheck: RuntimeHostReleaseCheck;
	remediation?: RuntimeHostRemediation;
}

interface RuntimeHostSupervision {
	attached: boolean;
	monitoring: boolean;
}

type WorkerExecutionContextOverrides = Partial<
	Omit<ExecutionPolicyContext, "target" | "pathScopes">
>;

interface RunRuntimeHostOnceInput {
	runtime: RunWikiRuntimeInput;
	implementation?: RuntimeHostImplementationInput;
	sessionFactory: PiWorkerSessionFactory;
	completionCollector?: RuntimeHostCompletionCollector;
	gitStatus?: GitStatusSnapshotInput | GitStatusSnapshot | false;
	promptPrefix?: string;
	promptSuffix?: string;
	disposeSessions?: boolean;
	promptOptions?: unknown;
	worktreeRunner?: WorktreeCommandRunner;
	worktreeCommandMode?: RuntimeHostWorktreeCommandMode;
	worktreeCleanupMode?: RuntimeHostWorktreeCommandMode;
	appendImplementation?: boolean;
	appendReleases?: boolean;
	releaseExpectedBytesByTrace?: Record<string, number>;
	releaseCreatedAt?: string;
	releaseIdPrefix?: string;
	supervision?: RuntimeHostSupervision;
	workerExecutionContexts?: Record<string, WorkerExecutionContextOverrides>;
	expectedWorkerPolicyDigests?: Record<string, string>;
}

interface RuntimeHostReleaseCheck {
	status: "ready" | "blocked";
	reason: string;
	blockers: string[];
}

type RuntimeHostRemediationRoute =
	| "retry_worker"
	| "planning"
	| "decision"
	| "user";

interface RuntimeHostRemediation {
	reason: string;
	route: RuntimeHostRemediationRoute;
	blockers: string[];
	refs: string[];
	suggestedActions: string[];
	hostErrors?: CodewikiHostError[];
}

interface RunRuntimeHostOnceResult {
	mode: "append";
	hostErrors?: CodewikiHostError[];
	gitStatus?: GitStatusSnapshot;
	runtime: RunWikiRuntimeResult;
	handoff: RuntimeHandoffManifest;
	workers: PiWorkerStartResult[];
	completions: PiWorkerCompletionInput[];
	workerResults: ImplementationWorkerResultInput[];
	workerStatuses: RuntimeDisposableWorkerStatus[];
	implementationPreviews: RunWikiImplementResult[];
	implementationAppends?: RunWikiImplementResult[];
	worktreePrepare?: WorktreeCommandExecutionResult;
	worktreeCleanup?: WorktreeCommandExecutionResult;
	releaseCheck: RuntimeHostReleaseCheck;
	remediation?: RuntimeHostRemediation;
	releaseBatch?: RuntimeWorkUnitClaimEventBatch;
	releaseAppend?: RuntimeWorkUnitClaimAppendResult;
	failedStartReleaseBatch?: RuntimeWorkUnitClaimEventBatch;
}

export async function reviveRuntimeHostWorkerSessions(
	input: ResumeRuntimeHostWorkerSessionsInput,
): Promise<ResumeRuntimeHostWorkerSessionsResult> {
	assertAttachedSupervision(input.supervision);
	if (!input.sessionFactory.resume) {
		return {
			workerStatuses: input.workerStatuses.map((status) =>
				detachedWorkerStatus(status, "No session resume adapter configured."),
			),
		};
	}
	const workerStatuses = await Promise.all(
		input.workerStatuses.map(async (status) => {
			try {
				const executionPolicy = resumableWorkerExecutionPolicy(input, status);
				const resumed = await input.sessionFactory.resume?.({
					workerId: status.workerId,
					workUnitId: status.workUnitId,
					traceId: status.traceId,
					...(status.sessionId ? { sessionId: status.sessionId } : {}),
					...(status.sessionFile ? { sessionFile: status.sessionFile } : {}),
					...(status.outputRef ? { outputFile: status.outputRef } : {}),
					...(status.pid ? { pid: status.pid } : {}),
					executionPolicy,
				});
				return {
					...status,
					state: resumed?.state || "detached",
					...(resumed?.pid ? { pid: resumed.pid } : {}),
					...(resumed?.sessionId ? { sessionId: resumed.sessionId } : {}),
					...(resumed?.sessionFile ? { sessionFile: resumed.sessionFile } : {}),
					...(resumed?.outputFile ? { outputRef: resumed.outputFile } : {}),
				};
			} catch (error) {
				return detachedWorkerStatus(status, errorMessage(error));
			}
		}),
	);
	return { workerStatuses };
}

export async function watchRuntimeHostWorkerSessions(
	input: WatchRuntimeHostWorkerSessionsInput,
): Promise<WatchRuntimeHostWorkerSessionsResult> {
	const revived = await reviveRuntimeHostWorkerSessions(input);
	const terminal = revived.workerStatuses.filter(isTerminalWorkerStatus);
	if (terminal.length === 0) {
		return {
			workerStatuses: revived.workerStatuses,
			completions: [],
			workerResults: [],
			hostErrors: detachedHostErrors(revived.workerStatuses),
			releaseCheck: {
				status: "blocked",
				reason: "workers_still_running",
				blockers: ["No terminal worker sessions are ready to collect."],
			},
		};
	}
	const completions = await collectPiWorkerOutputFiles(
		terminal.map(workerStartFromStatus),
	);
	const workerResults = collectPiWorkerResults(completions);
	const hostErrors = completionHostErrors(completions, workerResults);
	const releaseCheck = releaseCheckForHostCompletion(workerResults, []);
	return {
		workerStatuses: mergeWatchedWorkerResults(
			revived.workerStatuses,
			workerResults,
			hostErrors,
		),
		completions,
		workerResults,
		hostErrors,
		releaseCheck,
		...optionalRemediation(
			remediationForHostCompletion(releaseCheck, workerResults, [], hostErrors),
		),
	};
}

function resumableWorkerExecutionPolicy(
	input: ResumeRuntimeHostWorkerSessionsInput,
	status: RuntimeDisposableWorkerStatus,
): WorkerExecutionPolicySnapshot {
	const persisted = status.executionPolicy;
	const current = input.currentExecutionPoliciesByWorkUnit?.[status.workUnitId];
	if (!persisted || !current) {
		throw new Error(
			`Worker ${status.workUnitId} cannot resume without persisted and current execution policy.`,
		);
	}
	if (persisted.digest !== current.digest) {
		throw new Error(
			`Worker ${status.workUnitId} execution policy changed; start a reviewed attempt.`,
		);
	}
	return current;
}

function isTerminalWorkerStatus(
	status: RuntimeDisposableWorkerStatus,
): boolean {
	return ["completed", "blocked", "failed"].includes(status.state);
}

function detachedHostErrors(
	statuses: RuntimeDisposableWorkerStatus[],
): CodewikiHostError[] {
	return statuses.flatMap((status) => status.remediation?.hostErrors || []);
}

function workerStartFromStatus(
	status: RuntimeDisposableWorkerStatus,
): PiWorkerStartResult {
	return {
		workerId: status.workerId,
		workUnitId: status.workUnitId,
		traceId: status.traceId,
		planningRefs: [...(status.planningRefs || [])],
		...(status.claimId ? { claimId: status.claimId } : {}),
		...(status.sessionId ? { sessionId: status.sessionId } : {}),
		...(status.sessionFile ? { sessionFile: status.sessionFile } : {}),
		...(status.outputRef ? { outputFile: status.outputRef } : {}),
		...(status.pid ? { pid: status.pid } : {}),
		status: status.state === "failed" ? "failed" : "started",
	};
}

function mergeWatchedWorkerResults(
	statuses: RuntimeDisposableWorkerStatus[],
	workerResults: ImplementationWorkerResultInput[],
	hostErrors: CodewikiHostError[],
): RuntimeDisposableWorkerStatus[] {
	const results = new Map(
		workerResults.map((result) => [
			hostErrorKey(result.workerId, result.workUnitId),
			result,
		]),
	);
	const errors = hostErrorMap(hostErrors);
	return statuses.map((status) => {
		const result = results.get(
			hostErrorKey(status.workerId, status.workUnitId),
		);
		if (!result) return status;
		const state = workerStatus(result);
		const error = errors.get(hostErrorKey(status.workerId, status.workUnitId));
		return {
			...status,
			state,
			planningRefs:
				result.planningRefs ?? result.planning_refs ?? status.planningRefs,
			...((result.sessionId ?? result.session_id)
				? { sessionId: result.sessionId ?? result.session_id }
				: {}),
			...((result.sessionFile ?? result.session_file)
				? { sessionFile: result.sessionFile ?? result.session_file }
				: {}),
			...(error ? { remediation: workerResultRemediation(error) } : {}),
		};
	});
}

function workerResultRemediation(error: CodewikiHostError) {
	return {
		reason: "worker_completion_error",
		route: "retry_worker",
		blockers: [error.message],
		refs: [...error.refs],
		suggestedActions: [
			"Inspect worker output and session references.",
			"Release the claim before retrying a failed worker.",
		],
		hostErrors: [error],
	};
}

function optionalRemediation(remediation: RuntimeHostRemediation | undefined): {
	remediation?: RuntimeHostRemediation;
} {
	return remediation ? { remediation } : {};
}

export async function previewRuntimeHostHandoff(
	input: PreviewRuntimeHostHandoffInput,
): Promise<PreviewRuntimeHostHandoffResult> {
	if (input.runtime.mode === "append") {
		throw new Error("previewRuntimeHostHandoff only supports preview mode.");
	}
	const gitStatus = await resolveGitStatus(input.gitStatus);
	const runtime = await runWikiRuntime({
		...(gitStatus ? runtimeWorktreeInputsFromGitStatus(gitStatus) : {}),
		...input.runtime,
		mode: "preview",
	});
	return {
		mode: "preview",
		...(gitStatus ? { gitStatus } : {}),
		runtime,
		handoff: createRuntimeHandoffManifest({
			runtime,
			promptPrefix: input.promptPrefix,
			promptSuffix: input.promptSuffix,
		}),
	};
}

export async function runRuntimeHostOnce(
	input: RunRuntimeHostOnceInput,
): Promise<RunRuntimeHostOnceResult> {
	assertAttachedSupervision(input.supervision);
	if (input.runtime.mode !== "append") {
		throw new Error("runRuntimeHostOnce requires runtime append mode.");
	}
	const workerStartContext = await prepareHostWorkerStart(input);
	await recordClaimObservations(input, workerStartContext.claimEvents);
	if (workerStartContext.worktreePrepareError) {
		return worktreeFailureHostResult(
			input,
			workerStartContext,
			WORKTREE_PREPARE_PHASE,
		);
	}
	const workers = await startHostWorkers(input, workerStartContext);
	await recordWorkerStarts(input, workers);
	const failedStartResult = await failedStartHostResult(
		input,
		workerStartContext,
		workers,
	);
	const result =
		failedStartResult ||
		(await completeRuntimeHostOnce(input, workerStartContext, workers));
	const completed = await withWorktreeCleanup(
		input,
		workerStartContext,
		result,
	);
	await recordWorkerOutcomes(input, completed.workerStatuses);
	return completed;
}

interface RuntimeHostWorkerStartContext {
	gitStatus?: GitStatusSnapshot;
	runtime: RunWikiRuntimeResult;
	executionPoliciesByWorkUnit: Record<string, WorkerExecutionPolicySnapshot>;
	claimEvents: TraceEvent[];
	handoff: RuntimeHandoffManifest;
	worktreePrepare?: WorktreeCommandExecutionResult;
	worktreePrepareError?: unknown;
}

async function prepareHostWorkerStart(
	input: RunRuntimeHostOnceInput,
): Promise<RuntimeHostWorkerStartContext> {
	const gitStatus = await resolveGitStatus(input.gitStatus);
	const runtimeInput = {
		...(gitStatus ? runtimeWorktreeInputsFromGitStatus(gitStatus) : {}),
		...input.runtime,
	};
	const preview = await runWikiRuntime({ ...runtimeInput, mode: "preview" });
	const executionPoliciesByWorkUnit = resolveWorkerExecutionPolicies(
		input,
		preview,
	);
	const runtime = await runWikiRuntime({ ...runtimeInput, mode: "append" });
	assertStableWorkerSelection(preview, runtime);
	const claimEvents = runtime.append?.events || [];
	const handoff = createRuntimeHandoffManifest({
		runtime,
		claimEvents,
		promptPrefix: input.promptPrefix,
		promptSuffix: input.promptSuffix,
		executionPoliciesByWorkUnit,
	});
	const worktreePrepare = await captureHostWorktreeCommands(
		input,
		runtime,
		WORKTREE_PREPARE_PHASE,
	);
	return {
		...(gitStatus ? { gitStatus } : {}),
		runtime,
		executionPoliciesByWorkUnit,
		claimEvents,
		handoff,
		...(worktreePrepare.result
			? { worktreePrepare: worktreePrepare.result }
			: {}),
		...(worktreePrepare.error
			? { worktreePrepareError: worktreePrepare.error }
			: {}),
	};
}

function startHostWorkers(
	input: RunRuntimeHostOnceInput,
	workerStartContext: RuntimeHostWorkerStartContext,
): Promise<PiWorkerStartResult[]> {
	return startPiWorkers(workerStartContext.runtime.plan, {
		claimEvents: workerStartContext.claimEvents,
		sessionFactory: policyAwareSessionFactory(
			input.sessionFactory,
			workerStartContext.executionPoliciesByWorkUnit,
		),
		promptPrefix: input.promptPrefix,
		promptSuffix: input.promptSuffix,
		disposeSessions: input.disposeSessions,
		promptOptions: input.promptOptions,
	});
}

function assertAttachedSupervision(
	supervision: RuntimeHostSupervision | undefined,
): void {
	if (!supervision?.attached || !supervision.monitoring) {
		throw new Error(
			"Worker execution requires attached supervision and active monitoring.",
		);
	}
}

function resolveWorkerExecutionPolicies(
	input: RunRuntimeHostOnceInput,
	runtime: RunWikiRuntimeResult,
): Record<string, WorkerExecutionPolicySnapshot> {
	const config = resolveWikiConfig(input.runtime.config || {});
	return Object.fromEntries(
		runtime.plan.selected.map((item) => {
			const overrides = input.workerExecutionContexts?.[item.workUnitId] || {};
			const policy = resolveExecutionPolicy(config, {
				target: "worker",
				risk: overrides.risk || "high",
				pathScopes: [...item.pathScopes],
				requiredTools: overrides.requiredTools || [
					"bash",
					"edit",
					"read",
					"write",
				],
				estimatedInputTokens:
					overrides.estimatedInputTokens ||
					config.runtime.modelRouting.estimatedInputTokens,
				estimatedOutputTokens:
					overrides.estimatedOutputTokens ||
					config.runtime.modelRouting.estimatedOutputTokens,
				workerProfile: overrides.workerProfile || "implementation_worker",
				...(overrides.changeType ? { changeType: overrides.changeType } : {}),
				...(overrides.priorUsage ? { priorUsage: overrides.priorUsage } : {}),
				...(overrides.previousAttempts
					? { previousAttempts: overrides.previousAttempts }
					: {}),
			});
			const snapshot = workerExecutionPolicySnapshot(policy);
			const expected = input.expectedWorkerPolicyDigests?.[item.workUnitId];
			if (expected && expected !== snapshot.digest) {
				throw new Error(
					`Worker execution policy changed for ${item.workUnitId}; refresh before dispatch.`,
				);
			}
			return [item.workUnitId, snapshot];
		}),
	);
}

function assertStableWorkerSelection(
	preview: RunWikiRuntimeResult,
	append: RunWikiRuntimeResult,
): void {
	const previewIds = preview.plan.selected.map((item) => item.workUnitId);
	const appendIds = append.plan.selected.map((item) => item.workUnitId);
	if (JSON.stringify(previewIds) !== JSON.stringify(appendIds)) {
		throw new Error(
			"Worker selection changed after execution policy resolution.",
		);
	}
}

function policyAwareSessionFactory(
	factory: PiWorkerSessionFactory,
	policies: Record<string, WorkerExecutionPolicySnapshot>,
): PiWorkerSessionFactory {
	return {
		create(sessionInput) {
			const executionPolicy = policies[sessionInput.workUnitId];
			if (!executionPolicy) {
				throw new Error(
					`Worker ${sessionInput.workUnitId} has no resolved execution policy.`,
				);
			}
			return factory.create({ ...sessionInput, executionPolicy });
		},
		...(factory.resume ? { resume: factory.resume.bind(factory) } : {}),
	};
}

async function withWorktreeCleanup(
	input: RunRuntimeHostOnceInput,
	workerStartContext: RuntimeHostWorkerStartContext,
	result: RunRuntimeHostOnceResult,
): Promise<RunRuntimeHostOnceResult> {
	const worktreeCleanup = await captureHostWorktreeCommands(
		input,
		workerStartContext.runtime,
		WORKTREE_CLEANUP_PHASE,
	);
	if (worktreeCleanup.error) {
		return {
			...result,
			remediation: worktreeFailureRemediation(
				WORKTREE_CLEANUP_PHASE,
				worktreeCleanup.error,
			),
		};
	}
	return worktreeCleanup.result
		? { ...result, worktreeCleanup: worktreeCleanup.result }
		: result;
}

async function captureHostWorktreeCommands(
	input: RunRuntimeHostOnceInput,
	runtime: RunWikiRuntimeResult,
	phase: RuntimeHostWorktreePhase,
): Promise<{
	result?: WorktreeCommandExecutionResult;
	error?: unknown;
}> {
	try {
		const result = await executeHostWorktreeCommands(input, runtime, phase);
		return result ? { result } : {};
	} catch (error) {
		return { error };
	}
}

async function executeHostWorktreeCommands(
	input: RunRuntimeHostOnceInput,
	runtime: RunWikiRuntimeResult,
	phase: RuntimeHostWorktreePhase,
): Promise<WorktreeCommandExecutionResult | undefined> {
	const mode = hostWorktreeCommandMode(input, phase);
	const plans = requiredWorktreePlans(runtime.policy.worktrees);
	if (mode === "skip" || plans.length === 0) return undefined;
	return await executeRuntimeWorktreeCommands(plans, {
		dryRun: mode !== "execute",
		steps: worktreeStepsForPhase(phase),
		runner: input.worktreeRunner,
	});
}

function hostWorktreeCommandMode(
	input: RunRuntimeHostOnceInput,
	phase: RuntimeHostWorktreePhase,
): RuntimeHostWorktreeCommandMode {
	if (phase === WORKTREE_PREPARE_PHASE)
		return input.worktreeCommandMode || "dry-run";
	return input.worktreeCleanupMode || input.worktreeCommandMode || "dry-run";
}

function requiredWorktreePlans(
	plans: RuntimeWorktreePlan[],
): RuntimeWorktreePlan[] {
	return plans.filter((plan) => plan.required);
}

function worktreeStepsForPhase(
	phase: RuntimeHostWorktreePhase,
): WorktreeCommandStep[] {
	return phase === WORKTREE_PREPARE_PHASE
		? ["worktree.prepare", "worktree.verify"]
		: ["worktree.cleanup"];
}

function worktreeFailureHostResult(
	input: RunRuntimeHostOnceInput,
	workerStartContext: RuntimeHostWorkerStartContext,
	phase: RuntimeHostWorktreePhase,
): RunRuntimeHostOnceResult {
	const remediation = worktreeFailureRemediation(
		phase,
		workerStartContext.worktreePrepareError,
	);
	return hostOnceResult(input, {
		gitStatus: workerStartContext.gitStatus,
		runtime: workerStartContext.runtime,
		handoff: workerStartContext.handoff,
		workers: [],
		completions: [],
		workerResults: [],
		implementationPreviews: [],
		hostErrors: remediation.hostErrors,
		releaseCheck: {
			status: "blocked",
			reason: `worktree_${phase}_failed`,
			blockers: remediation.blockers,
		},
		remediation,
	});
}

async function failedStartHostResult(
	input: RunRuntimeHostOnceInput,
	workerStartContext: RuntimeHostWorkerStartContext,
	workers: PiWorkerStartResult[],
): Promise<RunRuntimeHostOnceResult | undefined> {
	const failedStartReleaseBatch = failedStartBatch(
		input,
		workerStartContext.runtime,
		workers,
		workerStartContext.claimEvents,
	);
	if (!failedStartReleaseBatch) return undefined;
	const releaseCheck = failedStartReleaseCheck(workers);
	const remediation = failedStartRemediation(releaseCheck, workers);
	const releaseAppend = await maybeAppendFailedStartReleases(
		input,
		workerStartContext,
		failedStartReleaseBatch,
	);
	return hostOnceResult(input, {
		gitStatus: workerStartContext.gitStatus,
		runtime: workerStartContext.runtime,
		handoff: workerStartContext.handoff,
		...(workerStartContext.worktreePrepare
			? { worktreePrepare: workerStartContext.worktreePrepare }
			: {}),
		workers,
		completions: [],
		workerResults: [],
		implementationPreviews: [],
		hostErrors: remediation.hostErrors,
		releaseCheck,
		remediation,
		failedStartReleaseBatch,
		...(releaseAppend ? { releaseAppend } : {}),
	});
}

async function maybeAppendFailedStartReleases(
	input: RunRuntimeHostOnceInput,
	workerStartContext: RuntimeHostWorkerStartContext,
	releaseBatch: RuntimeWorkUnitClaimEventBatch,
): Promise<RuntimeWorkUnitClaimAppendResult | undefined> {
	if (!input.appendReleases) return undefined;
	return await appendRuntimeWorkUnitClaims(releaseBatch, {
		repoRoot: requiredRepoRoot(
			input.runtime.repoRoot,
			"failed-start release append",
		),
		expectedBytesByTrace: releaseExpectedBytesByTrace(
			input,
			workerStartContext.runtime,
		),
	});
}

async function completeRuntimeHostOnce(
	input: RunRuntimeHostOnceInput,
	workerStartContext: RuntimeHostWorkerStartContext,
	workers: PiWorkerStartResult[],
): Promise<RunRuntimeHostOnceResult> {
	const completions = await collectHostWorkerCompletions(
		input,
		workerStartContext,
		workers,
	);
	const workerResults = collectPiWorkerResults(completions);
	const hostErrors = completionHostErrors(completions, workerResults);
	const implementationPreviews = await implementationPreviewsForHostOnce(
		input,
		workerStartContext.claimEvents,
		completions,
		workerResults,
	);
	return await hostCompletionResult(input, workerStartContext, {
		workers,
		completions,
		workerResults,
		implementationPreviews,
		hostErrors,
	});
}

async function collectHostWorkerCompletions(
	input: RunRuntimeHostOnceInput,
	workerStartContext: RuntimeHostWorkerStartContext,
	workers: PiWorkerStartResult[],
): Promise<PiWorkerCompletionInput[]> {
	if (input.completionCollector) {
		return await input.completionCollector({
			runtime: workerStartContext.runtime,
			handoff: workerStartContext.handoff,
			workers,
		});
	}
	return await collectPiWorkerOutputFiles(workers);
}

function completionHostErrors(
	completions: PiWorkerCompletionInput[],
	workerResults: ImplementationWorkerResultInput[],
): CodewikiHostError[] {
	return workerResults.flatMap((result, index): CodewikiHostError[] => {
		const completion = completions[index];
		const kind = completionHostErrorKind(completion, result);
		if (!kind) return [];
		const workerStart = completion?.workerStart;
		return [
			createCodewikiHostError({
				role: "worker",
				kind,
				traceId: workerStart?.traceId,
				workUnitId: result.workUnitId || workerStart?.workUnitId,
				workerId: result.workerId || workerStart?.workerId,
				claimId: result.claimId ?? result.claim_id ?? workerStart?.claimId,
				message: completionHostErrorMessage(completion, result),
				suggestedAction: "release_claim",
				refs: [
					result.sessionId ?? result.session_id,
					result.sessionFile ?? result.session_file,
					...(result.refs || []),
				].filter((ref): ref is string => Boolean(ref)),
			}),
		];
	});
}

function completionHostErrorKind(
	completion: PiWorkerCompletionInput | undefined,
	result: ImplementationWorkerResultInput,
): CodewikiHostErrorKind | undefined {
	const message = String(result.message || completion?.error || "");
	if (completion?.error) {
		return /denied|permission|eacces/i.test(message)
			? "permission_denied"
			: "output_missing";
	}
	if (
		/missing a codewiki-worker-report block|not valid JSON|multiple codewiki-worker-report blocks|completion status .* invalid|completion_guard/i.test(
			message,
		)
	) {
		return "output_malformed";
	}
	return undefined;
}

function completionHostErrorMessage(
	completion: PiWorkerCompletionInput | undefined,
	result: ImplementationWorkerResultInput,
): string {
	return [
		result.workUnitId || completion?.workerStart.workUnitId,
		result.message,
	]
		.filter(Boolean)
		.join(": ");
}

async function resolveGitStatus(
	input: PreviewRuntimeHostHandoffInput["gitStatus"],
): Promise<GitStatusSnapshot | undefined> {
	if (!input) return undefined;
	if (isGitStatusSnapshot(input)) return input;
	return await collectGitStatusSnapshot(input);
}

async function implementationPreviewsForHostOnce(
	input: RunRuntimeHostOnceInput,
	_claimEvents: TraceEvent[],
	completions: PiWorkerCompletionInput[],
	workerResults: ImplementationWorkerResultInput[],
): Promise<RunWikiImplementResult[]> {
	return await runHostImplementationReports(
		input,
		"preview",
		completions,
		workerResults,
	);
}

async function implementationAppendsForHostOnce(
	input: RunRuntimeHostOnceInput,
	_runtime: RunWikiRuntimeResult,
	_claimEvents: TraceEvent[],
	completions: PiWorkerCompletionInput[],
	workerResults: ImplementationWorkerResultInput[],
): Promise<RunWikiImplementResult[]> {
	return await runHostImplementationReports(
		input,
		"append",
		completions,
		workerResults,
	);
}

async function runHostImplementationReports(
	input: RunRuntimeHostOnceInput,
	mode: "preview" | "append",
	_completions: PiWorkerCompletionInput[],
	workerResults: ImplementationWorkerResultInput[],
): Promise<RunWikiImplementResult[]> {
	if (!input.implementation) return [];
	const repoRoot = requiredRepoRoot(input.runtime.repoRoot, "implementation");
	const initialWorkState = await buildProjectWorkState({ repoRoot });
	const resultsByChange = new Map<string, ImplementationWorkerResultInput[]>();
	for (const result of workerResults.filter(hasImplementationEvidence)) {
		const item = initialWorkState.workItems.find(
			(candidate) => candidate.id === result.workUnitId,
		);
		if (!item?.owningChangeId) continue;
		resultsByChange.set(item.owningChangeId, [
			...(resultsByChange.get(item.owningChangeId) || []),
			result,
		]);
	}
	const explicitEvidence = input.implementation.evidence || [];
	const evidenceByChange = new Map<
		string,
		typeof input.implementation.evidence
	>();
	for (const evidence of explicitEvidence) {
		const item = initialWorkState.workItems.find(
			(candidate) => candidate.id === evidence.workItemId,
		);
		if (!item?.owningChangeId) continue;
		evidenceByChange.set(item.owningChangeId, [
			...(evidenceByChange.get(item.owningChangeId) || []),
			evidence,
		]);
	}
	const changeIds = [
		...new Set([...resultsByChange.keys(), ...evidenceByChange.keys()]),
	];
	const reports: RunWikiImplementResult[] = [];
	for (const changeId of changeIds) {
		const workState = await buildProjectWorkState({ repoRoot });
		reports.push(
			await runWikiImplement({
				...input.implementation,
				evidence: evidenceByChange.get(changeId),
				repoRoot,
				expectedWorkStateDigest: workState.snapshotDigest,
				mode,
				workerResults: resultsByChange.get(changeId) || [],
			}),
		);
	}
	return reports;
}

function hasImplementationEvidence(
	result: ImplementationWorkerResultInput,
): boolean {
	return (
		result.status === "blocked" ||
		[result.changeInputs, result.change_inputs, result.changes].some(
			(value) => Array.isArray(value) && value.length > 0,
		)
	);
}

async function hostCompletionResult(
	input: RunRuntimeHostOnceInput,
	workerStartContext: RuntimeHostWorkerStartContext,
	completed: Pick<
		RunRuntimeHostOnceResult,
		| "workers"
		| "completions"
		| "workerResults"
		| "implementationPreviews"
		| "hostErrors"
	>,
): Promise<RunRuntimeHostOnceResult> {
	const releaseCheck = releaseCheckForHostCompletion(
		completed.workerResults,
		completed.implementationPreviews,
	);
	const implementationAppends = await maybeAppendImplementation(
		input,
		workerStartContext,
		completed,
		releaseCheck,
	);
	const releaseBatch = releaseBatchForHostCompletion(
		input,
		workerStartContext,
		completed,
		releaseCheck,
		implementationAppends,
	);
	const remediation = remediationForHostCompletion(
		releaseCheck,
		completed.workerResults,
		completed.implementationPreviews,
		completed.hostErrors,
	);
	const releaseAppend = await maybeAppendReleases(
		input,
		workerStartContext,
		releaseBatch,
		implementationAppends,
	);
	return hostOnceResult(input, {
		gitStatus: workerStartContext.gitStatus,
		runtime: workerStartContext.runtime,
		handoff: workerStartContext.handoff,
		...(workerStartContext.worktreePrepare
			? { worktreePrepare: workerStartContext.worktreePrepare }
			: {}),
		...completed,
		...(implementationAppends ? { implementationAppends } : {}),
		releaseCheck,
		...(remediation ? { remediation } : {}),
		...(releaseBatch ? { releaseBatch } : {}),
		...(releaseAppend ? { releaseAppend } : {}),
	});
}

async function maybeAppendImplementation(
	input: RunRuntimeHostOnceInput,
	workerStartContext: RuntimeHostWorkerStartContext,
	completed: Pick<
		RunRuntimeHostOnceResult,
		"completions" | "workerResults" | "implementationPreviews"
	>,
	_releaseCheck: RuntimeHostReleaseCheck,
): Promise<RunWikiImplementResult[] | undefined> {
	if (!input.appendImplementation || !implementationPreviewsPassed(completed)) {
		return undefined;
	}
	return await implementationAppendsForHostOnce(
		input,
		workerStartContext.runtime,
		workerStartContext.claimEvents,
		completed.completions,
		completed.workerResults,
	);
}

function implementationPreviewsPassed(
	completed: Pick<RunRuntimeHostOnceResult, "implementationPreviews">,
): boolean {
	return (
		completed.implementationPreviews.length > 0 &&
		completed.implementationPreviews.every(
			(preview) => preview.loopResult.exit.passed,
		)
	);
}

function releaseBatchForHostCompletion(
	input: RunRuntimeHostOnceInput,
	workerStartContext: RuntimeHostWorkerStartContext,
	completed: Pick<
		RunRuntimeHostOnceResult,
		"completions" | "workerResults" | "hostErrors"
	>,
	releaseCheck: RuntimeHostReleaseCheck,
	implementationAppends?: RunWikiImplementResult[],
): RuntimeWorkUnitClaimEventBatch | undefined {
	if (releaseCheck.status !== "ready") return undefined;
	return createRuntimeWorkerCompletionReleaseEvents(
		releaseInputs(
			completed.completions,
			completed.workerResults,
			completed.hostErrors || [],
		),
		workerStartContext.claimEvents,
		{
			createdAt: input.releaseCreatedAt || new Date().toISOString(),
			nextSequenceByTrace: nextReleaseSequenceByTrace(
				workerStartContext.runtime,
				implementationAppends,
			),
			releaseIdPrefix: input.releaseIdPrefix,
		},
	);
}

async function maybeAppendReleases(
	input: RunRuntimeHostOnceInput,
	workerStartContext: RuntimeHostWorkerStartContext,
	releaseBatch: RuntimeWorkUnitClaimEventBatch | undefined,
	implementationAppends?: RunWikiImplementResult[],
): Promise<RuntimeWorkUnitClaimAppendResult | undefined> {
	if (!releaseBatch || !input.appendReleases) return undefined;
	return await appendRuntimeWorkUnitClaims(releaseBatch, {
		repoRoot: requiredRepoRoot(input.runtime.repoRoot, "release append"),
		expectedBytesByTrace: releaseExpectedBytesByTrace(
			input,
			workerStartContext.runtime,
			implementationAppends,
		),
	});
}

function failedStartReleaseCheck(
	workers: PiWorkerStartResult[],
): RuntimeHostReleaseCheck {
	return {
		status: "blocked",
		reason: "worker_start_failed",
		blockers: workers
			.filter((worker) => worker.status === "failed")
			.map(
				(worker) =>
					`${worker.workUnitId}: ${worker.error || "worker start failed"}`,
			),
	};
}

function worktreeFailureRemediation(
	phase: RuntimeHostWorktreePhase,
	error: unknown,
): RuntimeHostRemediation {
	const record = worktreeErrorRecord(error);
	const hostError = createCodewikiHostError({
		role: "worker",
		kind: "worktree_failed",
		traceId: record?.traceId,
		workUnitId: record?.workUnitId,
		workerId: record?.workerId,
		message: worktreeFailureMessage(phase, error, record),
		suggestedAction: "ask_user",
		data: {
			phase,
			...(record
				? {
						step: record.step,
						command: record.command,
						exitCode: record.exitCode,
					}
				: {}),
		},
	});
	return {
		reason: `worktree_${phase}_failed`,
		route: "user",
		blockers: [hostError.message],
		refs: [...hostError.refs],
		suggestedActions: [
			"Inspect the failed worktree command output.",
			"Fix or clean up the worktree manually, then rerun the host action.",
		],
		hostErrors: [hostError],
	};
}

function failedStartRemediation(
	releaseCheck: RuntimeHostReleaseCheck,
	workers: PiWorkerStartResult[],
): RuntimeHostRemediation {
	const hostErrors = workerStartHostErrors(workers);
	return {
		reason: releaseCheck.reason,
		route: "retry_worker",
		blockers: hostErrors.length
			? hostErrors.map((error) => error.message)
			: [...releaseCheck.blockers],
		refs: uniqueHostErrorRefs(hostErrors),
		suggestedActions: [
			"Inspect session factory or prompt failure output.",
			"Append the failed-start release batch if the claim should return to ready.",
			"Retry the worker after fixing the adapter failure.",
		],
		hostErrors,
	};
}

function workerStartHostErrors(
	workers: PiWorkerStartResult[],
): CodewikiHostError[] {
	return workers
		.filter((worker) => worker.status === "failed")
		.map((worker) =>
			createCodewikiHostError({
				role: "worker",
				kind: "spawn_failed",
				traceId: worker.traceId,
				workUnitId: worker.workUnitId,
				workerId: worker.workerId,
				claimId: worker.claimId,
				message: `${worker.workUnitId}: ${worker.error || "worker start failed"}`,
				suggestedAction: "release_claim",
				refs: stringRefs(worker.sessionId, worker.sessionFile),
			}),
		);
}

function remediationForHostCompletion(
	releaseCheck: RuntimeHostReleaseCheck,
	workerResults: ImplementationWorkerResultInput[],
	implementationPreviews: RunWikiImplementResult[],
	hostErrors: CodewikiHostError[] = [],
): RuntimeHostRemediation | undefined {
	if (releaseCheck.reason === "worker_failed") {
		return terminalWorkerRemediation(
			releaseCheck,
			workerResults,
			"retry_worker",
			hostErrors,
		);
	}
	if (releaseCheck.reason === "worker_blocked") {
		return terminalWorkerRemediation(
			releaseCheck,
			workerResults,
			"planning",
			hostErrors,
		);
	}
	if (releaseCheck.reason === "implementation_preview_missing") {
		return missingImplementationPreviewRemediation(releaseCheck);
	}
	if (releaseCheck.status === "blocked") {
		return implementationPreviewRemediation(
			releaseCheck,
			implementationPreviews,
		);
	}
	return undefined;
}

function missingImplementationPreviewRemediation(
	releaseCheck: RuntimeHostReleaseCheck,
): RuntimeHostRemediation {
	return {
		reason: releaseCheck.reason,
		route: "user",
		blockers: [...releaseCheck.blockers],
		refs: [],
		suggestedActions: [
			"Attach runtime Implementation handling before completing workers.",
			"Rerun the host action so worker evidence is correlated with runtime-selected Work Items before claims release.",
		],
	};
}

function implementationPreviewRemediation(
	releaseCheck: RuntimeHostReleaseCheck,
	implementationPreviews: RunWikiImplementResult[],
): RuntimeHostRemediation {
	return {
		reason: releaseCheck.reason,
		route: remediationRouteForImplementation(implementationPreviews),
		blockers: [...releaseCheck.blockers],
		refs: implementationPreviews.flatMap((preview) => [
			preview.traceId,
			...preview.loopResult.exit.findings.flatMap((finding) => finding.refs),
		]),
		suggestedActions: [
			"Send the blockers back to the worker as follow-up instructions.",
			"If blockers show planning or decision drift, route back to that loop instead of retrying.",
		],
	};
}

function terminalWorkerRemediation(
	releaseCheck: RuntimeHostReleaseCheck,
	workerResults: ImplementationWorkerResultInput[],
	route: RuntimeHostRemediationRoute,
	hostErrors: CodewikiHostError[] = [],
): RuntimeHostRemediation {
	return {
		reason: releaseCheck.reason,
		route,
		blockers: workerResults
			.filter((result) => workerStatus(result) !== "completed")
			.map(
				(result) =>
					`${result.workUnitId}: ${result.message || workerStatus(result)}`,
			),
		refs: uniqueHostErrorRefs(hostErrors).length
			? uniqueHostErrorRefs(hostErrors)
			: workerResults.flatMap((result) => [
					result.workUnitId,
					...(result.planningRefs || result.planning_refs || []),
					...(result.refs || []),
				]),
		suggestedActions:
			route === "planning"
				? [
						"Append the release batch so the claim is no longer active.",
						"Route the worker blocker back through planning.",
					]
				: [
						"Append the release batch so the claim is no longer active.",
						"Retry the worker after fixing the failure cause.",
					],
		...(hostErrors.length ? { hostErrors } : {}),
	};
}

function remediationRouteForImplementation(
	implementationPreviews: RunWikiImplementResult[],
): RuntimeHostRemediationRoute {
	const issueCodes = implementationPreviews.flatMap((preview) =>
		preview.loopResult.exit.issues.map((issue) => issue.code),
	);
	if (issueCodes.some((code) => code.includes("planning"))) return "planning";
	if (
		implementationPreviews.some(
			(preview) => preview.loopResult.exit.route === "decision",
		)
	) {
		return "decision";
	}
	if (
		implementationPreviews.some(
			(preview) => preview.loopResult.exit.route === "user",
		)
	) {
		return "user";
	}
	return "retry_worker";
}

function uniqueHostErrorRefs(errors: CodewikiHostError[]): string[] {
	return Array.from(new Set(errors.flatMap((error) => error.refs)));
}

function stringRefs(...values: Array<string | undefined>): string[] {
	return values.filter((value): value is string => Boolean(value));
}

function worktreeErrorRecord(
	error: unknown,
): WorktreeCommandExecutionRecord | undefined {
	return typeof error === "object" &&
		error !== null &&
		"record" in error &&
		isWorktreeCommandExecutionRecord(error.record)
		? error.record
		: undefined;
}

function isWorktreeCommandExecutionRecord(
	value: unknown,
): value is WorktreeCommandExecutionRecord {
	return (
		typeof value === "object" &&
		value !== null &&
		"workUnitId" in value &&
		"traceId" in value &&
		"workerId" in value &&
		"step" in value &&
		"command" in value
	);
}

function detachedWorkerStatus(
	status: RuntimeDisposableWorkerStatus,
	message: string,
): RuntimeDisposableWorkerStatus {
	const hostError = createCodewikiHostError({
		role: "worker",
		kind: "session_lost",
		traceId: status.traceId,
		workUnitId: status.workUnitId,
		workerId: status.workerId,
		claimId: status.claimId,
		message: `${status.workUnitId}: ${message}`,
		suggestedAction: "retry",
		refs: stringRefs(status.sessionId, status.sessionFile, status.outputRef),
	});
	return {
		...status,
		state: "detached",
		remediation: {
			reason: "worker_session_detached",
			route: "retry_worker",
			blockers: [hostError.message],
			refs: [...hostError.refs],
			suggestedActions: [
				"Inspect the worker session/output reference.",
				"Retry or manually recover the worker if the session cannot be revived.",
			],
			hostErrors: [hostError],
		},
	};
}

function worktreeFailureMessage(
	phase: RuntimeHostWorktreePhase,
	error: unknown,
	record?: WorktreeCommandExecutionRecord,
): string {
	if (record) {
		return `Worktree ${phase} failed for ${record.workUnitId} during ${record.step}: ${record.command}${record.stderr ? `: ${record.stderr}` : ""}`;
	}
	return error instanceof Error
		? error.message
		: `Worktree ${phase} command failed.`;
}

function releaseCheckForHostCompletion(
	workerResults: ImplementationWorkerResultInput[],
	implementationPreviews: RunWikiImplementResult[],
): RuntimeHostReleaseCheck {
	const terminal = terminalWorkerReleaseCheck(workerResults);
	return terminal || releaseCheckForImplementation(implementationPreviews);
}

function terminalWorkerReleaseCheck(
	workerResults: ImplementationWorkerResultInput[],
): RuntimeHostReleaseCheck | undefined {
	const statuses = workerResults.map((result) => workerStatus(result));
	if (statuses.includes("failed")) {
		return { status: "ready", reason: "worker_failed", blockers: [] };
	}
	if (statuses.includes("blocked")) {
		return { status: "ready", reason: "worker_blocked", blockers: [] };
	}
	return undefined;
}

function workerStatus(
	worker: ImplementationWorkerResultInput,
): "completed" | "blocked" | "failed" {
	const status = String(worker.status || "completed").toLowerCase();
	return status === "blocked" || status === "failed" ? status : "completed";
}

function releaseCheckForImplementation(
	implementationPreviews: RunWikiImplementResult[],
): RuntimeHostReleaseCheck {
	if (implementationPreviews.length === 0) {
		return {
			status: "blocked",
			reason: "implementation_preview_missing",
			blockers: [
				"No implementation preview was produced for worker completion.",
			],
		};
	}
	const blockers = implementationPreviews.flatMap((preview) =>
		preview.loopResult.exit.passed
			? []
			: preview.loopResult.exit.findings.map(
					(finding) => `${preview.traceId}: ${finding.message}`,
				),
	);
	return blockers.length > 0
		? {
				status: "blocked",
				reason: "implementation_preview_blocked",
				blockers,
			}
		: {
				status: "ready",
				reason: "implementation_exit_passed",
				blockers: [],
			};
}

function releaseInputs(
	completions: PiWorkerCompletionInput[],
	workerResults: ImplementationWorkerResultInput[],
	hostErrors: CodewikiHostError[],
) {
	const hostErrorsByWorker = hostErrorMap(hostErrors);
	return workerResults.map((result, index) => ({
		traceId: completions[index]?.workerStart.traceId,
		workerId: result.workerId,
		workUnitId: result.workUnitId,
		claimId: result.claimId ?? result.claim_id,
		planningRefs: result.planningRefs ?? result.planning_refs,
		status: result.status,
		message: result.message,
		refs: result.refs,
		sessionId: result.sessionId ?? result.session_id,
		sessionFile: result.sessionFile ?? result.session_file,
		hostError: hostErrorsByWorker.get(
			hostErrorKey(result.workerId, result.workUnitId),
		),
	}));
}

function hostErrorMap(
	hostErrors: CodewikiHostError[],
): Map<string, CodewikiHostError> {
	return new Map(
		hostErrors.map((error) => [
			hostErrorKey(error.workerId || "", error.workUnitId || ""),
			error,
		]),
	);
}

function hostErrorKey(workerId: string, workUnitId: string): string {
	return `${workerId}\0${workUnitId}`;
}

function nextReleaseSequenceByTrace(
	runtime: RunWikiRuntimeResult,
	implementationAppends?: RunWikiImplementResult[],
): Record<string, number> {
	const nextSequenceByTrace = { ...(runtime.batch?.nextSequenceByTrace || {}) };
	for (const result of implementationAppends || []) {
		nextSequenceByTrace[result.traceId] = result.iterationEvent.sequence + 1;
	}
	return nextSequenceByTrace;
}

function releaseExpectedBytesByTrace(
	input: RunRuntimeHostOnceInput,
	runtime: RunWikiRuntimeResult,
	implementationAppends?: RunWikiImplementResult[],
): Record<string, number> {
	const expectedBytesByTrace = { ...(input.releaseExpectedBytesByTrace || {}) };
	for (const result of implementationAppends || []) {
		if (result.append && expectedBytesByTrace[result.traceId] === undefined) {
			expectedBytesByTrace[result.traceId] = result.append.nextBytes;
		}
	}
	for (const [traceId, nextBytes] of Object.entries(
		runtime.append?.nextBytesByTrace || {},
	)) {
		if (expectedBytesByTrace[traceId] === undefined) {
			expectedBytesByTrace[traceId] = nextBytes;
		}
	}
	return expectedBytesByTrace;
}

function failedStartBatch(
	input: RunRuntimeHostOnceInput,
	runtime: RunWikiRuntimeResult,
	workers: PiWorkerStartResult[],
	claimEvents: TraceEvent[],
): RuntimeWorkUnitClaimEventBatch | undefined {
	const failures = workers.filter((worker) => worker.status === "failed");
	if (failures.length === 0) return undefined;
	const hostErrors = new Map(
		workerStartHostErrors(failures).map((error) => [error.workerId, error]),
	);
	return createRuntimeFailedWorkerStartReleaseEvents(
		failures.map((failure) => ({
			...failure,
			hostError: hostErrors.get(failure.workerId),
		})),
		claimEvents,
		{
			createdAt: input.releaseCreatedAt || new Date().toISOString(),
			nextSequenceByTrace: runtime.batch?.nextSequenceByTrace || {},
			releaseIdPrefix: input.releaseIdPrefix,
		},
	);
}

function hostOnceResult(
	_input: RunRuntimeHostOnceInput,
	result: Omit<RunRuntimeHostOnceResult, "mode" | "workerStatuses"> & {
		workerStatuses?: RuntimeDisposableWorkerStatus[];
	},
): RunRuntimeHostOnceResult {
	return {
		mode: "append",
		...result,
		workerStatuses:
			result.workerStatuses || disposableWorkerStatusesFromResult(result),
	};
}

function disposableWorkerStatusesFromResult(
	result: Omit<RunRuntimeHostOnceResult, "mode" | "workerStatuses">,
): RuntimeDisposableWorkerStatus[] {
	if (result.workers.length === 0) return [...result.handoff.workerStatuses];
	const workerResults = new Map(
		result.workerResults.map((workerResult) => [
			workerResult.workerId,
			workerResult,
		]),
	);
	return result.workers.map((worker) => {
		const workerResult = workerResults.get(worker.workerId);
		const executionPolicy = result.handoff.workers.find(
			(candidate) => candidate.workerId === worker.workerId,
		)?.executionPolicy;
		const state = workerResult
			? workerStatus(workerResult)
			: worker.status === "failed"
				? "failed"
				: "running";
		return {
			workerId: worker.workerId,
			workUnitId: worker.workUnitId,
			traceId: worker.traceId,
			state,
			planningRefs: [...worker.planningRefs],
			...(worker.claimId ? { claimId: worker.claimId } : {}),
			...(worker.pid ? { pid: worker.pid } : {}),
			...(worker.sessionId ? { sessionId: worker.sessionId } : {}),
			...(worker.sessionFile ? { sessionFile: worker.sessionFile } : {}),
			...(worker.outputFile ? { outputRef: worker.outputFile } : {}),
			...(executionPolicy ? { executionPolicy } : {}),
			...(result.remediation && state !== "running"
				? { remediation: result.remediation }
				: {}),
		};
	});
}

async function recordClaimObservations(
	input: RunRuntimeHostOnceInput,
	claimEvents: TraceEvent[],
): Promise<void> {
	await Promise.all(
		claimEvents.map((event, index) =>
			recordHostDevLog(input, {
				id: `${event.traceId}:claim:${index}`,
				timestamp: event.createdAt,
				traceId: event.traceId,
				workUnitId: text(event.data?.workUnitId),
				workerId: text(event.data?.workerId),
				attemptId: text(event.data?.claimId),
				category: "worker",
				action: "worker.claimed",
				status: "success",
				refs: event.refs,
			}),
		),
	);
}

async function recordWorkerStarts(
	input: RunRuntimeHostOnceInput,
	workers: PiWorkerStartResult[],
): Promise<void> {
	await Promise.all(
		workers.map((worker, index) =>
			recordHostDevLog(input, {
				id: `${worker.traceId}:start:${index}`,
				timestamp: new Date().toISOString(),
				traceId: worker.traceId,
				workUnitId: worker.workUnitId,
				workerId: worker.workerId,
				attemptId: worker.claimId,
				category: "worker",
				action:
					worker.status === "started" ? "worker.started" : "worker.failed",
				status: worker.status === "started" ? "success" : "failure",
				refs: worker.planningRefs,
			}),
		),
	);
}

async function recordWorkerOutcomes(
	input: RunRuntimeHostOnceInput,
	workers: RuntimeDisposableWorkerStatus[],
): Promise<void> {
	await Promise.all(
		workers.map((worker, index) =>
			recordHostDevLog(input, {
				id: `${worker.traceId}:outcome:${index}`,
				timestamp: new Date().toISOString(),
				traceId: worker.traceId,
				workUnitId: worker.workUnitId,
				workerId: worker.workerId,
				attemptId: worker.claimId,
				category: "result",
				action: `worker.${worker.state}`,
				status:
					worker.state === "completed"
						? "success"
						: worker.state === "running"
							? "running"
							: "failure",
			}),
		),
	);
}

async function recordHostDevLog(
	input: RunRuntimeHostOnceInput,
	entry: Parameters<typeof appendDevLogEntry>[1],
): Promise<void> {
	const repoRoot = input.runtime.repoRoot;
	if (!repoRoot) return;
	await appendDevLogEntry(repoRoot, entry).catch(() => undefined);
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredRepoRoot(value: string | undefined, action: string): string {
	if (!value) throw new Error(`${action} requires repoRoot.`);
	return value;
}

function isGitStatusSnapshot(
	input: GitStatusSnapshotInput | GitStatusSnapshot,
): input is GitStatusSnapshot {
	return "isGitRepository" in input;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
