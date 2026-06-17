import {
	runWikiRuntime,
	type RunWikiRuntimeInput,
	type RunWikiRuntimeResult,
} from "../api/wiki-runtime.ts";
import type { WorktreeRef } from "../git/worktrees.ts";
import {
	appendRuntimeDispatchClaims,
	createRuntimeFailedWorkerStartReleaseEvents,
	type RuntimeDispatchClaimAppendResult,
	type RuntimeDispatchClaimBatch,
} from "../runtime/dispatcher.ts";
import type {
	RuntimeDispatchItem,
	RuntimeDispatchPlan,
} from "../runtime/scheduler.ts";
import type { TraceEvent } from "../traces/types.ts";

export interface PiWorkerSession {
	prompt(text: string, options?: unknown): Promise<void>;
	dispose?(): void | Promise<void>;
	sessionId?: string;
	sessionFile?: string;
	outputFile?: string;
	pid?: number;
}

export interface PiWorkerSessionFactory {
	create(input: PiWorkerSessionInput): Promise<PiWorkerSession>;
	resume?(
		input: PiWorkerSessionResumeInput,
	): Promise<PiWorkerSessionResumeResult> | PiWorkerSessionResumeResult;
}

export type PiWorkerSessionResumeState =
	| "running"
	| "completed"
	| "failed"
	| "detached";

export interface PiWorkerSessionResumeInput {
	workerId: string;
	workUnitId: string;
	traceId: string;
	sessionId?: string;
	sessionFile?: string;
	outputFile?: string;
	pid?: number;
}

export interface PiWorkerSessionResumeResult {
	state: PiWorkerSessionResumeState;
	sessionId?: string;
	sessionFile?: string;
	outputFile?: string;
	pid?: number;
	message?: string;
}

export interface PiWorkerSessionInput {
	workerId: string;
	workUnitId: string;
	traceId: string;
	planningRefs: string[];
	pathScopes: string[];
	componentRefs: string[];
	worktree?: WorktreeRef;
	prompt: string;
}

export interface PiWorkerDispatchOptions {
	claimEvents: TraceEvent[];
	sessionFactory: PiWorkerSessionFactory;
	promptPrefix?: string;
	promptSuffix?: string;
	disposeSessions?: boolean;
	promptOptions?: unknown;
}

export interface PiWorkerDispatchResult {
	workUnitId: string;
	workerId: string;
	traceId: string;
	planningRefs: string[];
	claimId?: string;
	sessionId?: string;
	sessionFile?: string;
	outputFile?: string;
	pid?: number;
	status: "started" | "failed";
	error?: string;
}

export interface PiRuntimeWorkerDispatchOptions
	extends Omit<PiWorkerDispatchOptions, "claimEvents"> {
	runtime: RunWikiRuntimeInput;
	releaseFailedStarts?: boolean;
	failedStartReleaseCreatedAt?: string;
	failedStartReleaseIdPrefix?: string;
}

export interface PiRuntimeWorkerDispatchResult {
	runtime: RunWikiRuntimeResult;
	workers: PiWorkerDispatchResult[];
	failedStartReleaseBatch?: RuntimeDispatchClaimBatch;
	failedStartReleaseAppend?: RuntimeDispatchClaimAppendResult;
	skippedReason?: "runtime_mode_not_append" | "no_claim_events";
}

export async function dispatchPiRuntimeWorkers(
	options: PiRuntimeWorkerDispatchOptions,
): Promise<PiRuntimeWorkerDispatchResult> {
	const runtime = await runWikiRuntime(options.runtime);
	if (runtime.mode !== "append") {
		return { runtime, workers: [], skippedReason: "runtime_mode_not_append" };
	}
	const claimEvents = runtime.append?.events || [];
	if (claimEvents.length === 0) {
		return { runtime, workers: [], skippedReason: "no_claim_events" };
	}
	const workers = await dispatchPiWorkers(runtime.plan, {
		claimEvents,
		sessionFactory: options.sessionFactory,
		promptPrefix: options.promptPrefix,
		promptSuffix: options.promptSuffix,
		disposeSessions: options.disposeSessions,
		promptOptions: options.promptOptions,
	});
	if (options.releaseFailedStarts === false) return { runtime, workers };
	const release = await releaseFailedWorkerStarts({
		runtime,
		repoRoot: options.runtime.repoRoot,
		workers,
		claimEvents,
		createdAt: options.failedStartReleaseCreatedAt,
		releaseIdPrefix: options.failedStartReleaseIdPrefix,
	});
	return { runtime, workers, ...release };
}

export async function dispatchPiWorkers(
	plan: RuntimeDispatchPlan,
	options: PiWorkerDispatchOptions,
): Promise<PiWorkerDispatchResult[]> {
	const claimMetadata = claimMetadataByWorkUnit(options.claimEvents);
	return Promise.all(
		plan.dispatch.map((item) => {
			const metadata = claimMetadata.get(item.workUnitId);
			return dispatchPiWorker({
				item: {
					...item,
					...(metadata?.worktree ? { worktree: metadata.worktree } : {}),
				},
				workerId: metadata?.workerId || item.workUnitId,
				claimId: metadata?.claimId,
				options,
			});
		}),
	);
}

export function createPiWorkerPrompt(
	item: RuntimeDispatchItem,
	options: Pick<PiWorkerDispatchOptions, "promptPrefix" | "promptSuffix"> = {},
): string {
	return [
		options.promptPrefix,
		`You are a CodeWiki implementation worker assigned one planning work unit.`,
		``,
		`Work unit: ${item.workUnitId}`,
		`Trace: ${item.traceId}`,
		`Title: ${item.title}`,
		`Planning refs:`,
		...bulletList(item.planningRefs),
		`Component refs:`,
		...bulletList(item.componentRefs),
		`Path scopes:`,
		...bulletList(item.pathScopes),
		...(item.worktree
			? [
					`Worktree:`,
					`- path: ${item.worktree.path}`,
					...(item.worktree.branch
						? [`- branch: ${item.worktree.branch}`]
						: []),
					...(item.worktree.baseRef
						? [`- base: ${item.worktree.baseRef}`]
						: []),
				]
			: []),
		``,
		`Rules:`,
		`- Stay inside assigned path scopes unless you must report a blocker.`,
		`- Worker owns local TDD: write or update tests, show red evidence when required, then make green.`,
		`- Map checks and acceptance evidence to planning acceptance criterion ids.`,
		`- Submit exactly one fenced codewiki-worker-report JSON block with status, workUnitRef, changedFiles, checksRun, contentProofRefs, residualRisks, blockers, notes, and changes.`,
		`- Worker output is evidence only; do not close the implementation loop or claim exit.`,
		`- Keep trace refs canonical; commands and prose belong in evidence data, not refs.`,
		``,
		`Report shape:`,
		"```codewiki-worker-report",
		`{`,
		`  "status": "completed | blocked | failed",`,
		`  "workUnitRef": "trace:<planning-iteration>#work:${item.workUnitId}",`,
		`  "changedFiles": [],`,
		`  "checksRun": [],`,
		`  "contentProofRefs": [],`,
		`  "residualRisks": [],`,
		`  "blockers": [],`,
		`  "notes": "",`,
		`  "changes": []`,
		`}`,
		"```",
		options.promptSuffix,
	]
		.filter((line): line is string => typeof line === "string")
		.join("\n");
}

async function dispatchPiWorker(input: {
	item: RuntimeDispatchItem;
	workerId: string;
	claimId?: string;
	options: PiWorkerDispatchOptions;
}): Promise<PiWorkerDispatchResult> {
	const prompt = createPiWorkerPrompt(input.item, input.options);
	let session: PiWorkerSession | undefined;
	try {
		session = await input.options.sessionFactory.create({
			workerId: input.workerId,
			workUnitId: input.item.workUnitId,
			traceId: input.item.traceId,
			planningRefs: input.item.planningRefs,
			pathScopes: input.item.pathScopes,
			componentRefs: input.item.componentRefs,
			...(input.item.worktree ? { worktree: input.item.worktree } : {}),
			prompt,
		});
		await session.prompt(prompt, input.options.promptOptions);
		return {
			workUnitId: input.item.workUnitId,
			workerId: input.workerId,
			traceId: input.item.traceId,
			planningRefs: [...input.item.planningRefs],
			...(input.claimId ? { claimId: input.claimId } : {}),
			...(session.sessionId ? { sessionId: session.sessionId } : {}),
			...(session.sessionFile ? { sessionFile: session.sessionFile } : {}),
			...(session.outputFile ? { outputFile: session.outputFile } : {}),
			...(session.pid ? { pid: session.pid } : {}),
			status: "started",
		};
	} catch (error) {
		return {
			workUnitId: input.item.workUnitId,
			workerId: input.workerId,
			traceId: input.item.traceId,
			planningRefs: [...input.item.planningRefs],
			...(input.claimId ? { claimId: input.claimId } : {}),
			...(session?.sessionId ? { sessionId: session.sessionId } : {}),
			...(session?.sessionFile ? { sessionFile: session.sessionFile } : {}),
			...(session?.outputFile ? { outputFile: session.outputFile } : {}),
			...(session?.pid ? { pid: session.pid } : {}),
			status: "failed",
			error: errorMessage(error),
		};
	} finally {
		if (input.options.disposeSessions) await session?.dispose?.();
	}
}

async function releaseFailedWorkerStarts(input: {
	runtime: RunWikiRuntimeResult;
	repoRoot?: string;
	workers: PiWorkerDispatchResult[];
	claimEvents: TraceEvent[];
	createdAt?: string;
	releaseIdPrefix?: string;
}): Promise<
	Pick<
		PiRuntimeWorkerDispatchResult,
		"failedStartReleaseBatch" | "failedStartReleaseAppend"
	>
> {
	const failures = input.workers.filter((worker) => worker.status === "failed");
	if (failures.length === 0) return {};
	const batch = createRuntimeFailedWorkerStartReleaseEvents(
		failures,
		input.claimEvents,
		{
			createdAt: input.createdAt || new Date().toISOString(),
			nextSequenceByTrace: input.runtime.batch?.nextSequenceByTrace || {},
			releaseIdPrefix: input.releaseIdPrefix,
		},
	);
	const append = await appendRuntimeDispatchClaims(batch, {
		repoRoot: requiredRepoRoot(input.repoRoot),
		expectedBytesByTrace: input.runtime.append?.nextBytesByTrace || {},
	});
	return { failedStartReleaseBatch: batch, failedStartReleaseAppend: append };
}

function requiredRepoRoot(repoRoot: string | undefined): string {
	if (!repoRoot) throw new Error("failed start release requires repoRoot.");
	return repoRoot;
}

interface ClaimMetadata {
	workerId: string;
	claimId?: string;
	worktree?: WorktreeRef;
}

function claimMetadataByWorkUnit(
	claimEvents: TraceEvent[],
): Map<string, ClaimMetadata> {
	const metadata = new Map<string, ClaimMetadata>();
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

function bulletList(values: string[]): string[] {
	return values.length > 0 ? values.map((value) => `- ${value}`) : ["- none"];
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function text(value: unknown): string {
	return String(value || "").trim();
}
