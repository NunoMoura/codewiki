import { createCodewikiApiError } from "../error-handling/api-errors.ts";
import {
	assertKnownInputKeys,
	requiredArrayField,
	requiredStringField,
} from "./input-validation.ts";
import type { ContentProof } from "../git/content-proof.ts";
import type { SourceMapContract } from "../knowledge/source-map.ts";
import { normalizeImplementationChanges } from "../implementation/evidence.ts";
import {
	runImplementationIteration,
	type ImplementationIterationInput,
	type ImplementationIterationResult,
} from "../implementation/iteration.ts";
import type {
	ImplementationChange,
	ImplementationChangeInput,
	ImplementationWorkerClaim,
} from "../implementation/types.ts";
import { createImplementationMergeContentProof } from "../implementation/merge-proof.ts";
import {
	aggregateImplementationWorkerResults,
	type ImplementationWorkerResultInput,
} from "../implementation/workers.ts";
import {
	collectProjectSnapshot,
	type ProjectSnapshot,
} from "../project/snapshot.ts";
import {
	appendSemanticLoopReport,
	assertSemanticLoopReportBatch,
	type AppendSemanticLoopReportResult,
} from "../runtime/trace-writer.ts";
import type { TraceEvent } from "../traces/types.ts";

export type WikiImplementMode = "preview" | "append";

export interface RunWikiImplementInput {
	repoRoot: string;
	traceId: string;
	planningEvents: TraceEvent[];
	changes?: ImplementationChange[];
	changeInputs?: ImplementationChangeInput[];
	workerResults?: ImplementationWorkerResultInput[];
	workerClaims?: ImplementationWorkerClaim[];
	claimEvents?: TraceEvent[];
	expectedWorkerBaseSha?: string;
	componentMap?: SourceMapContract;
	requireTddEvidence?: boolean;
	parentId?: string | null;
	createdAt?: string;
	mode?: WikiImplementMode;
	expectedBytes?: number;
	nextSequence?: number;
	expectedTraceId?: string;
	snapshotRoots?: string[];
	snapshotExclude?: string[];
	proofPaths?: string[];
	changedPaths?: string[];
	evidencePaths?: string[];
	aggregateContentProof?: ContentProof;
}

export interface RunWikiImplementResult {
	mode: WikiImplementMode;
	traceId: string;
	proofPaths: string[];
	snapshot: ProjectSnapshot;
	aggregateContentProof?: ContentProof;
	loopResult: ImplementationIterationResult;
	iterationEvent: TraceEvent;
	append?: AppendSemanticLoopReportResult<ImplementationIterationResult>["append"];
}

const WIKI_IMPLEMENT_INPUT_KEYS = [
	"repoRoot",
	"traceId",
	"planningEvents",
	"changes",
	"changeInputs",
	"workerResults",
	"workerClaims",
	"claimEvents",
	"expectedWorkerBaseSha",
	"componentMap",
	"requireTddEvidence",
	"parentId",
	"createdAt",
	"mode",
	"expectedBytes",
	"nextSequence",
	"expectedTraceId",
	"snapshotRoots",
	"snapshotExclude",
	"proofPaths",
	"changedPaths",
	"evidencePaths",
	"aggregateContentProof",
] as const;

export async function runWikiImplement(
	input: RunWikiImplementInput,
): Promise<RunWikiImplementResult> {
	assertKnownInputKeys(
		"wiki_implement",
		input as unknown as Record<string, unknown>,
		WIKI_IMPLEMENT_INPUT_KEYS,
	);
	requiredStringField("wiki_implement", "repoRoot", input.repoRoot);
	const traceId = requiredStringField(
		"wiki_implement",
		"traceId",
		input.traceId,
	);
	requiredArrayField("wiki_implement", "planningEvents", input.planningEvents);
	const mode = input.mode || "preview";
	const nextSequence = input.nextSequence ?? 1;
	if (!Number.isInteger(nextSequence) || nextSequence < 1) {
		throw createCodewikiApiError({
			operation: "wiki_implement",
			code: "invalid_input",
			field: "nextSequence",
			message: "wiki_implement requires nextSequence >= 1.",
			data: { value: nextSequence },
		});
	}
	const snapshot = await collectProjectSnapshot({
		root: input.repoRoot,
		roots: input.snapshotRoots,
		exclude: input.snapshotExclude,
	});
	const changes = implementationChangesForRun(input);
	const mergeProof = await createImplementationMergeContentProof({
		repoRoot: input.repoRoot,
		changes,
		workerResults: input.workerResults,
		proofPaths: input.proofPaths,
		changedPaths: input.changedPaths,
		evidencePaths: input.evidencePaths,
		exclude: input.snapshotExclude,
		aggregateContentProof: input.aggregateContentProof,
	});
	const { proofPaths, aggregateContentProof } = mergeProof;
	const loopInput = implementationIterationInput(input, {
		changes: changesWithLocalProof(changes, aggregateContentProof),
		existingPaths: snapshot.paths,
		aggregateContentProof,
	});
	if (mode === "append") {
		const expectedBytes = requiredExpectedBytes(input.expectedBytes);
		const result = await appendSemanticLoopReport({
			repoRoot: input.repoRoot,
			loop: "implementation",
			expectedBytes,
			nextSequence,
			expectedTraceId: input.expectedTraceId ?? input.traceId,
			run: ({ startSequence }) =>
				runImplementationIteration({ ...loopInput, startSequence }),
		});
		return {
			mode,
			traceId: result.traceId,
			proofPaths,
			snapshot,
			aggregateContentProof,
			loopResult: result.loopResult,
			iterationEvent: result.iterationEvent,
			append: result.append,
		};
	}
	const loopResult = runImplementationIteration({
		...loopInput,
		startSequence: nextSequence,
	});
	const iterationEvent = assertSemanticLoopReportBatch({
		records: loopResult.traceRecords,
		loop: "implementation",
		nextSequence,
		expectedTraceId: input.expectedTraceId ?? traceId,
	});
	return {
		mode,
		traceId: iterationEvent.traceId,
		proofPaths,
		snapshot,
		aggregateContentProof,
		loopResult,
		iterationEvent,
	};
}

function implementationIterationInput(
	input: RunWikiImplementInput,
	prepared: {
		changes: ImplementationChange[];
		existingPaths: string[];
		aggregateContentProof?: ContentProof;
	},
): ImplementationIterationInput {
	return {
		traceId: input.traceId,
		planningEvents: input.planningEvents,
		changes: prepared.changes,
		workerResults: input.workerResults,
		workerClaims: input.workerClaims,
		claimEvents: input.claimEvents,
		expectedWorkerBaseSha: input.expectedWorkerBaseSha,
		componentMap: input.componentMap,
		requireTddEvidence: input.requireTddEvidence,
		parentId: input.parentId,
		createdAt: input.createdAt,
		existingPaths: prepared.existingPaths,
		aggregateContentProof: prepared.aggregateContentProof,
	};
}

function implementationChangesForRun(
	input: RunWikiImplementInput,
): ImplementationChange[] {
	if (input.changes) return input.changes;
	return normalizeImplementationChanges([
		...(input.changeInputs || []),
		...aggregateImplementationWorkerResults(input.workerResults).changeInputs,
	] as ImplementationChangeInput[]);
}

function changesWithLocalProof(
	changes: ImplementationChange[],
	proof?: ContentProof,
): ImplementationChange[] {
	if (!proof) return changes;
	return changes.map((change) => {
		if (change.contentProof || change.workerId || change.claimId) return change;
		return { ...change, contentProof: proof };
	});
}

function requiredExpectedBytes(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw createCodewikiApiError({
			operation: "wiki_implement",
			code: "invalid_input",
			field: "expectedBytes",
			message: "wiki_implement append mode requires expectedBytes >= 0.",
			data: { value },
		});
	}
	return value;
}
