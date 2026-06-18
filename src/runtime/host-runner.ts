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
	dispatchPiWorkers,
	type PiWorkerDispatchResult,
	type PiWorkerSessionFactory,
} from "../pi/dispatcher.ts";
import {
	collectPiWorkerOutputFiles,
	collectPiWorkerResults,
	type PiWorkerCompletionInput,
} from "../pi/worker-results.ts";
import type { ImplementationWorkerResultInput } from "../implementation/workers.ts";
import type { TraceEvent } from "../traces/types.ts";
import {
	appendRuntimeDispatchClaims,
	createRuntimeFailedWorkerStartReleaseEvents,
	createRuntimeWorkerCompletionReleaseEvents,
	type RuntimeDispatchClaimAppendResult,
	type RuntimeDispatchClaimBatch,
} from "./dispatcher.ts";
import {
	createRuntimeHandoffManifest,
	type RuntimeDisposableWorkerStatus,
	type RuntimeHandoffManifest,
} from "./handoff.ts";

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
	workers: PiWorkerDispatchResult[];
}) => Promise<PiWorkerCompletionInput[]> | PiWorkerCompletionInput[];

type RuntimeHostImplementationInput = Omit<
	RunWikiImplementInput,
	"mode" | "workerResults" | "claimEvents"
>;

type RuntimeHostWorktreeCommandMode = "skip" | "dry-run" | "execute";
type RuntimeHostWorktreePhase = "prepare" | "cleanup";
const WORKTREE_PREPARE_PHASE: RuntimeHostWorktreePhase = "prepare";
const WORKTREE_CLEANUP_PHASE: RuntimeHostWorktreePhase = "cleanup";

interface ResumeRuntimeHostWorkerSessionsInput {
	sessionFactory: PiWorkerSessionFactory;
	workerStatuses: RuntimeDisposableWorkerStatus[];
}

interface ResumeRuntimeHostWorkerSessionsResult {
	workerStatuses: RuntimeDisposableWorkerStatus[];
}

interface RunRuntimeHostOnceInput {
	runtime: RunWikiRuntimeInput;
	implementationInputs: RuntimeHostImplementationInput[];
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
	implementationExpectedBytesByTrace?: Record<string, number>;
	releaseExpectedBytesByTrace?: Record<string, number>;
	releaseCreatedAt?: string;
	releaseIdPrefix?: string;
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
}

interface RunRuntimeHostOnceResult {
	mode: "append";
	gitStatus?: GitStatusSnapshot;
	runtime: RunWikiRuntimeResult;
	handoff: RuntimeHandoffManifest;
	workers: PiWorkerDispatchResult[];
	completions: PiWorkerCompletionInput[];
	workerResults: ImplementationWorkerResultInput[];
	workerStatuses: RuntimeDisposableWorkerStatus[];
	implementationPreviews: RunWikiImplementResult[];
	implementationAppends?: RunWikiImplementResult[];
	worktreePrepare?: WorktreeCommandExecutionResult;
	worktreeCleanup?: WorktreeCommandExecutionResult;
	releaseCheck: RuntimeHostReleaseCheck;
	remediation?: RuntimeHostRemediation;
	releaseBatch?: RuntimeDispatchClaimBatch;
	releaseAppend?: RuntimeDispatchClaimAppendResult;
	failedStartReleaseBatch?: RuntimeDispatchClaimBatch;
}

export async function reviveRuntimeHostWorkerSessions(
	input: ResumeRuntimeHostWorkerSessionsInput,
): Promise<ResumeRuntimeHostWorkerSessionsResult> {
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
				const resumed = await input.sessionFactory.resume?.({
					workerId: status.workerId,
					workUnitId: status.workUnitId,
					traceId: status.traceId,
					...(status.sessionId ? { sessionId: status.sessionId } : {}),
					...(status.sessionFile ? { sessionFile: status.sessionFile } : {}),
					...(status.outputRef ? { outputFile: status.outputRef } : {}),
					...(status.pid ? { pid: status.pid } : {}),
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
	if (input.runtime.mode !== "append") {
		throw new Error("runRuntimeHostOnce requires runtime append mode.");
	}
	const dispatch = await prepareHostDispatch(input);
	if (dispatch.worktreePrepareError) {
		return worktreeFailureHostResult(input, dispatch, WORKTREE_PREPARE_PHASE);
	}
	const workers = await startHostWorkers(input, dispatch);
	const failedStartResult = await failedStartHostResult(input, dispatch, workers);
	const result =
		failedStartResult || (await completeRuntimeHostOnce(input, dispatch, workers));
	return await withWorktreeCleanup(input, dispatch, result);
}

interface RuntimeHostDispatchContext {
	gitStatus?: GitStatusSnapshot;
	runtime: RunWikiRuntimeResult;
	claimEvents: TraceEvent[];
	handoff: RuntimeHandoffManifest;
	worktreePrepare?: WorktreeCommandExecutionResult;
	worktreePrepareError?: unknown;
}

async function prepareHostDispatch(
	input: RunRuntimeHostOnceInput,
): Promise<RuntimeHostDispatchContext> {
	const gitStatus = await resolveGitStatus(input.gitStatus);
	const runtime = await runWikiRuntime({
		...(gitStatus ? runtimeWorktreeInputsFromGitStatus(gitStatus) : {}),
		...input.runtime,
		mode: "append",
	});
	const claimEvents = runtime.append?.events || [];
	const handoff = createRuntimeHandoffManifest({
		runtime,
		claimEvents,
		promptPrefix: input.promptPrefix,
		promptSuffix: input.promptSuffix,
	});
	const worktreePrepare = await captureHostWorktreeCommands(
		input,
		runtime,
		WORKTREE_PREPARE_PHASE,
	);
	return {
		...(gitStatus ? { gitStatus } : {}),
		runtime,
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
	dispatch: RuntimeHostDispatchContext,
): Promise<PiWorkerDispatchResult[]> {
	return dispatchPiWorkers(dispatch.runtime.plan, {
		claimEvents: dispatch.claimEvents,
		sessionFactory: input.sessionFactory,
		promptPrefix: input.promptPrefix,
		promptSuffix: input.promptSuffix,
		disposeSessions: input.disposeSessions,
		promptOptions: input.promptOptions,
	});
}

async function withWorktreeCleanup(
	input: RunRuntimeHostOnceInput,
	dispatch: RuntimeHostDispatchContext,
	result: RunRuntimeHostOnceResult,
): Promise<RunRuntimeHostOnceResult> {
	const worktreeCleanup = await captureHostWorktreeCommands(
		input,
		dispatch.runtime,
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
	dispatch: RuntimeHostDispatchContext,
	phase: RuntimeHostWorktreePhase,
): RunRuntimeHostOnceResult {
	const remediation = worktreeFailureRemediation(
		phase,
		dispatch.worktreePrepareError,
	);
	return hostOnceResult(input, {
		gitStatus: dispatch.gitStatus,
		runtime: dispatch.runtime,
		handoff: dispatch.handoff,
		workers: [],
		completions: [],
		workerResults: [],
		implementationPreviews: [],
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
	dispatch: RuntimeHostDispatchContext,
	workers: PiWorkerDispatchResult[],
): Promise<RunRuntimeHostOnceResult | undefined> {
	const failedStartReleaseBatch = failedStartBatch(
		input,
		dispatch.runtime,
		workers,
		dispatch.claimEvents,
	);
	if (!failedStartReleaseBatch) return undefined;
	const releaseCheck = failedStartReleaseCheck(workers);
	const releaseAppend = await maybeAppendFailedStartReleases(
		input,
		dispatch,
		failedStartReleaseBatch,
	);
	return hostOnceResult(input, {
		gitStatus: dispatch.gitStatus,
		runtime: dispatch.runtime,
		handoff: dispatch.handoff,
		...(dispatch.worktreePrepare
			? { worktreePrepare: dispatch.worktreePrepare }
			: {}),
		workers,
		completions: [],
		workerResults: [],
		implementationPreviews: [],
		releaseCheck,
		remediation: failedStartRemediation(releaseCheck, workers),
		failedStartReleaseBatch,
		...(releaseAppend ? { releaseAppend } : {}),
	});
}

async function maybeAppendFailedStartReleases(
	input: RunRuntimeHostOnceInput,
	dispatch: RuntimeHostDispatchContext,
	releaseBatch: RuntimeDispatchClaimBatch,
): Promise<RuntimeDispatchClaimAppendResult | undefined> {
	if (!input.appendReleases) return undefined;
	return await appendRuntimeDispatchClaims(releaseBatch, {
		repoRoot: requiredRepoRoot(
			input.runtime.repoRoot,
			"failed-start release append",
		),
		expectedBytesByTrace: releaseExpectedBytesByTrace(input, dispatch.runtime),
	});
}

async function completeRuntimeHostOnce(
	input: RunRuntimeHostOnceInput,
	dispatch: RuntimeHostDispatchContext,
	workers: PiWorkerDispatchResult[],
): Promise<RunRuntimeHostOnceResult> {
	const completions = await collectHostWorkerCompletions(
		input,
		dispatch,
		workers,
	);
	const workerResults = collectPiWorkerResults(completions);
	const implementationPreviews = await implementationPreviewsForHostOnce(
		input,
		dispatch.claimEvents,
		completions,
		workerResults,
	);
	return await hostCompletionResult(input, dispatch, {
		workers,
		completions,
		workerResults,
		implementationPreviews,
	});
}

async function collectHostWorkerCompletions(
	input: RunRuntimeHostOnceInput,
	dispatch: RuntimeHostDispatchContext,
	workers: PiWorkerDispatchResult[],
): Promise<PiWorkerCompletionInput[]> {
	if (input.completionCollector) {
		return await input.completionCollector({
			runtime: dispatch.runtime,
			handoff: dispatch.handoff,
			workers,
		});
	}
	return await collectPiWorkerOutputFiles(workers);
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
	claimEvents: TraceEvent[],
	completions: PiWorkerCompletionInput[],
	workerResults: ImplementationWorkerResultInput[],
): Promise<RunWikiImplementResult[]> {
	return await Promise.all(
		input.implementationInputs.map((implementationInput) =>
			runWikiImplement({
				...implementationInput,
				mode: "preview",
				claimEvents: claimEvents.filter(
					(event) => event.traceId === implementationInput.traceId,
				),
				workerResults: workerResultsForTrace(
					implementationInput.traceId,
					completions,
					workerResults,
				),
			}),
		),
	);
}

async function implementationAppendsForHostOnce(
	input: RunRuntimeHostOnceInput,
	runtime: RunWikiRuntimeResult,
	claimEvents: TraceEvent[],
	completions: PiWorkerCompletionInput[],
	workerResults: ImplementationWorkerResultInput[],
): Promise<RunWikiImplementResult[]> {
	return await Promise.all(
		input.implementationInputs.map((implementationInput) => {
			if (!Number.isInteger(implementationInput.nextSequence)) {
				throw new Error(
					`implementation append requires nextSequence for ${implementationInput.traceId}.`,
				);
			}
			return runWikiImplement({
				...implementationInput,
				mode: "append",
				expectedBytes: implementationExpectedBytes(
					input,
					runtime,
					implementationInput.traceId,
				),
				claimEvents: claimEvents.filter(
					(event) => event.traceId === implementationInput.traceId,
				),
				workerResults: workerResultsForTrace(
					implementationInput.traceId,
					completions,
					workerResults,
				),
			});
		}),
	);
}

function implementationExpectedBytes(
	input: RunRuntimeHostOnceInput,
	runtime: RunWikiRuntimeResult,
	traceId: string,
): number {
	const explicit = input.implementationExpectedBytesByTrace?.[traceId];
	if (isNonNegativeInteger(explicit)) return explicit;
	const inferred = runtime.append?.nextBytesByTrace[traceId];
	if (isNonNegativeInteger(inferred)) return inferred;
	throw new Error(
		`implementation append requires expected bytes for ${traceId}.`,
	);
}

function workerResultsForTrace(
	traceId: string,
	completions: PiWorkerCompletionInput[],
	workerResults: ImplementationWorkerResultInput[],
): ImplementationWorkerResultInput[] {
	return workerResults.filter(
		(_result, index) => completions[index]?.dispatch.traceId === traceId,
	);
}

async function hostCompletionResult(
	input: RunRuntimeHostOnceInput,
	dispatch: RuntimeHostDispatchContext,
	completed: Pick<
		RunRuntimeHostOnceResult,
		"workers" | "completions" | "workerResults" | "implementationPreviews"
	>,
): Promise<RunRuntimeHostOnceResult> {
	const releaseCheck = releaseCheckForHostCompletion(
		completed.workerResults,
		completed.implementationPreviews,
	);
	const implementationAppends = await maybeAppendImplementation(
		input,
		dispatch,
		completed,
		releaseCheck,
	);
	const releaseBatch = releaseBatchForHostCompletion(
		input,
		dispatch,
		completed,
		releaseCheck,
		implementationAppends,
	);
	const remediation = remediationForHostCompletion(
		releaseCheck,
		completed.workerResults,
		completed.implementationPreviews,
	);
	const releaseAppend = await maybeAppendReleases(
		input,
		dispatch,
		releaseBatch,
		implementationAppends,
	);
	return hostOnceResult(input, {
		gitStatus: dispatch.gitStatus,
		runtime: dispatch.runtime,
		handoff: dispatch.handoff,
		...(dispatch.worktreePrepare
			? { worktreePrepare: dispatch.worktreePrepare }
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
	dispatch: RuntimeHostDispatchContext,
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
		dispatch.runtime,
		dispatch.claimEvents,
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
	dispatch: RuntimeHostDispatchContext,
	completed: Pick<RunRuntimeHostOnceResult, "completions" | "workerResults">,
	releaseCheck: RuntimeHostReleaseCheck,
	implementationAppends?: RunWikiImplementResult[],
): RuntimeDispatchClaimBatch | undefined {
	if (releaseCheck.status !== "ready") return undefined;
	return createRuntimeWorkerCompletionReleaseEvents(
		releaseInputs(completed.completions, completed.workerResults),
		dispatch.claimEvents,
		{
			createdAt: input.releaseCreatedAt || new Date().toISOString(),
			nextSequenceByTrace: nextReleaseSequenceByTrace(
				dispatch.runtime,
				implementationAppends,
			),
			releaseIdPrefix: input.releaseIdPrefix,
		},
	);
}

async function maybeAppendReleases(
	input: RunRuntimeHostOnceInput,
	dispatch: RuntimeHostDispatchContext,
	releaseBatch: RuntimeDispatchClaimBatch | undefined,
	implementationAppends?: RunWikiImplementResult[],
): Promise<RuntimeDispatchClaimAppendResult | undefined> {
	if (!releaseBatch || !input.appendReleases) return undefined;
	return await appendRuntimeDispatchClaims(releaseBatch, {
		repoRoot: requiredRepoRoot(input.runtime.repoRoot, "release append"),
		expectedBytesByTrace: releaseExpectedBytesByTrace(
			input,
			dispatch.runtime,
			implementationAppends,
		),
	});
}

function failedStartReleaseCheck(
	workers: PiWorkerDispatchResult[],
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
	return {
		reason: `worktree_${phase}_failed`,
		route: "user",
		blockers: [worktreeFailureMessage(phase, error, record)],
		refs: record
			? [record.traceId, record.workUnitId, record.workerId].filter(Boolean)
			: [],
		suggestedActions: [
			"Inspect the failed worktree command output.",
			"Fix or clean up the worktree manually, then rerun the host action.",
		],
	};
}

function failedStartRemediation(
	releaseCheck: RuntimeHostReleaseCheck,
	workers: PiWorkerDispatchResult[],
): RuntimeHostRemediation {
	return {
		reason: releaseCheck.reason,
		route: "retry_worker",
		blockers: [...releaseCheck.blockers],
		refs: workers
			.filter((worker) => worker.status === "failed")
			.flatMap((worker) => [
				worker.traceId,
				worker.workUnitId,
				worker.workerId,
			]),
		suggestedActions: [
			"Inspect session factory or prompt failure output.",
			"Append the failed-start release batch if the claim should return to ready.",
			"Retry the worker after fixing the adapter failure.",
		],
	};
}

function remediationForHostCompletion(
	releaseCheck: RuntimeHostReleaseCheck,
	workerResults: ImplementationWorkerResultInput[],
	implementationPreviews: RunWikiImplementResult[],
): RuntimeHostRemediation | undefined {
	if (releaseCheck.reason === "worker_failed") {
		return terminalWorkerRemediation(
			releaseCheck,
			workerResults,
			"retry_worker",
		);
	}
	if (releaseCheck.reason === "worker_blocked") {
		return terminalWorkerRemediation(releaseCheck, workerResults, "planning");
	}
	if (releaseCheck.status === "blocked") {
		return implementationPreviewRemediation(
			releaseCheck,
			implementationPreviews,
		);
	}
	return undefined;
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
		refs: workerResults.flatMap((result) => [
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
	return {
		...status,
		state: "detached",
		remediation: {
			reason: "worker_session_detached",
			route: "retry_worker",
			blockers: [`${status.workUnitId}: ${message}`],
			refs: [
				status.traceId,
				status.workUnitId,
				status.workerId,
				status.sessionId || "",
				status.sessionFile || "",
				status.outputRef || "",
			].filter(Boolean),
			suggestedActions: [
				"Inspect the worker session/output reference.",
				"Retry or manually recover the worker if the session cannot be revived.",
			],
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
) {
	return workerResults.map((result, index) => ({
		traceId: completions[index]?.dispatch.traceId,
		workerId: result.workerId,
		workUnitId: result.workUnitId,
		claimId: result.claimId ?? result.claim_id,
		planningRefs: result.planningRefs ?? result.planning_refs,
		status: result.status,
		message: result.message,
		refs: result.refs,
		sessionId: result.sessionId ?? result.session_id,
		sessionFile: result.sessionFile ?? result.session_file,
	}));
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
	workers: PiWorkerDispatchResult[],
	claimEvents: TraceEvent[],
): RuntimeDispatchClaimBatch | undefined {
	const failures = workers.filter((worker) => worker.status === "failed");
	if (failures.length === 0) return undefined;
	return createRuntimeFailedWorkerStartReleaseEvents(failures, claimEvents, {
		createdAt: input.releaseCreatedAt || new Date().toISOString(),
		nextSequenceByTrace: runtime.batch?.nextSequenceByTrace || {},
		releaseIdPrefix: input.releaseIdPrefix,
	});
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
			...(worker.claimId ? { claimId: worker.claimId } : {}),
			...(worker.pid ? { pid: worker.pid } : {}),
			...(worker.sessionId ? { sessionId: worker.sessionId } : {}),
			...(worker.sessionFile ? { sessionFile: worker.sessionFile } : {}),
			...(worker.outputFile ? { outputRef: worker.outputFile } : {}),
			...(result.remediation && state !== "running"
				? { remediation: result.remediation }
				: {}),
		};
	});
}

function requiredRepoRoot(value: string | undefined, action: string): string {
	if (!value) throw new Error(`${action} requires repoRoot.`);
	return value;
}

function isNonNegativeInteger(value: number | undefined): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isGitStatusSnapshot(
	input: GitStatusSnapshotInput | GitStatusSnapshot,
): input is GitStatusSnapshot {
	return "isGitRepository" in input;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
