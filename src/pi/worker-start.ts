import {
	runWikiRuntime,
	type RunWikiRuntimeInput,
	type RunWikiRuntimeResult,
} from "../api/wiki-runtime.ts";
import type { WorktreeRef } from "../git/worktrees.ts";
import {
	appendRuntimeWorkUnitClaims,
	createRuntimeFailedWorkerStartReleaseEvents,
	type RuntimeWorkUnitClaimAppendResult,
	type RuntimeWorkUnitClaimEventBatch,
} from "../runtime/work-unit-claims.ts";
import type {
	RuntimeWorkUnitClaimCandidate,
	RuntimeWorkUnitClaimSelection,
} from "../runtime/work-unit-claim-selection.ts";
import type { TraceEvent } from "../traces/types.ts";
import type { WorkerExecutionPolicySnapshot } from "../runtime/execution-policy.ts";

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
	executionPolicy?: WorkerExecutionPolicySnapshot;
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
	executionPolicy?: WorkerExecutionPolicySnapshot;
	prompt: string;
}

export interface PiWorkerStartOptions {
	claimEvents: TraceEvent[];
	sessionFactory: PiWorkerSessionFactory;
	promptPrefix?: string;
	promptSuffix?: string;
	disposeSessions?: boolean;
	promptOptions?: unknown;
}

export interface PiWorkerStartResult {
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

export interface PiRuntimeWorkerStartOptions
	extends Omit<PiWorkerStartOptions, "claimEvents"> {
	runtime: RunWikiRuntimeInput;
	releaseFailedStarts?: boolean;
	failedStartReleaseCreatedAt?: string;
	failedStartReleaseIdPrefix?: string;
}

export interface PiRuntimeWorkerStartResult {
	runtime: RunWikiRuntimeResult;
	workers: PiWorkerStartResult[];
	failedStartReleaseBatch?: RuntimeWorkUnitClaimEventBatch;
	failedStartReleaseAppend?: RuntimeWorkUnitClaimAppendResult;
	skippedReason?: "runtime_mode_not_append" | "no_claim_events";
}

export async function startPiRuntimeWorkers(
	options: PiRuntimeWorkerStartOptions,
): Promise<PiRuntimeWorkerStartResult> {
	const runtime = await runWikiRuntime(options.runtime);
	if (runtime.mode !== "append") {
		return { runtime, workers: [], skippedReason: "runtime_mode_not_append" };
	}
	const claimEvents = runtime.append?.events || [];
	if (claimEvents.length === 0) {
		return { runtime, workers: [], skippedReason: "no_claim_events" };
	}
	const workers = await startPiWorkers(runtime.plan, {
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

export async function startPiWorkers(
	plan: RuntimeWorkUnitClaimSelection,
	options: PiWorkerStartOptions,
): Promise<PiWorkerStartResult[]> {
	const claimMetadata = claimMetadataByWorkUnit(options.claimEvents);
	return Promise.all(
		plan.selected.map((item) => {
			const metadata = claimMetadata.get(item.workUnitId);
			return startPiWorker({
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
	item: RuntimeWorkUnitClaimCandidate,
	options: Pick<PiWorkerStartOptions, "promptPrefix" | "promptSuffix"> = {},
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
		`- For each change, include checkResults and acceptanceEvidenceItems mapped to planning acceptance criterion ids.`,
		`- Worker output is evidence only; do not close the implementation loop or claim exit.`,
		`- Keep trace refs canonical; commands and prose belong in evidence data, not refs.`,
		``,
		`Report shape:`,
		"```codewiki-worker-report",
		`{`,
		`  "status": "completed",`,
		`  "workUnitRef": "trace:<planning-iteration>#work:${item.workUnitId}",`,
		`  "changedFiles": ["src/example.ts", "tests/example.test.mjs"],`,
		`  "checksRun": ["node --test tests/example.test.mjs"],`,
		`  "contentProofRefs": ["sha256:<working-tree-digest>"],`,
		`  "residualRisks": [],`,
		`  "blockers": [{ "message": "", "refs": [] }],`,
		`  "notes": "",`,
		`  "changes": [`,
		`    {`,
		`      "id": "IC-${item.workUnitId}",`,
		`      "planningRefs": ["trace:<planning-iteration>#work:${item.workUnitId}"],`,
		`      "codePaths": ["src/example.ts"],`,
		`      "testPaths": ["tests/example.test.mjs"],`,
		`      "checkResults": [`,
		`        { "command": "node --test tests/example.test.mjs", "status": "pass" }`,
		`      ],`,
		`      "acceptanceEvidenceItems": [`,
		`        {`,
		`          "criterionId": "AC-001",`,
		`          "summary": "Acceptance criterion satisfied.",`,
		`          "evidenceRefs": ["tests/example.test.mjs"]`,
		`        }`,
		`      ]`,
		`    }`,
		`  ]`,
		`}`,
		"```",
		options.promptSuffix,
	]
		.filter((line): line is string => typeof line === "string")
		.join("\n");
}

async function startPiWorker(input: {
	item: RuntimeWorkUnitClaimCandidate;
	workerId: string;
	claimId?: string;
	options: PiWorkerStartOptions;
}): Promise<PiWorkerStartResult> {
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
	workers: PiWorkerStartResult[];
	claimEvents: TraceEvent[];
	createdAt?: string;
	releaseIdPrefix?: string;
}): Promise<
	Pick<
		PiRuntimeWorkerStartResult,
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
	const append = await appendRuntimeWorkUnitClaims(batch, {
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
