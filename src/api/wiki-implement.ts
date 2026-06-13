import {
	createWorkingTreeContentProof,
	type ContentProof,
} from "../git/content-proof.ts";
import type { FileStructureMapContract } from "../knowledge/file-structure-map.ts";
import {
	changedPaths as implementationChangedPaths,
	normalizeImplementationChanges,
} from "../implementation/evidence.ts";
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
import {
	aggregateImplementationWorkerResults,
	type ImplementationWorkerResultInput,
} from "../implementation/workers.ts";
import {
	collectProjectSnapshot,
	type ProjectSnapshot,
} from "../project/snapshot.ts";
import {
	appendSemanticLoopIteration,
	assertSemanticLoopIterationBatch,
	type AppendSemanticLoopIterationResult,
} from "../traces/orchestrator.ts";
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
	componentMap?: FileStructureMapContract;
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
	append?: AppendSemanticLoopIterationResult<ImplementationIterationResult>["append"];
}

export async function runWikiImplement(
	input: RunWikiImplementInput,
): Promise<RunWikiImplementResult> {
	const mode = input.mode || "preview";
	const nextSequence = input.nextSequence ?? 1;
	if (!Number.isInteger(nextSequence) || nextSequence < 1) {
		throw new Error("wiki_implement requires nextSequence >= 1.");
	}
	const snapshot = await collectProjectSnapshot({
		root: input.repoRoot,
		roots: input.snapshotRoots,
		exclude: input.snapshotExclude,
	});
	const changes = implementationChangesForRun(input);
	const proofPaths = implementationProofPaths(input, changes);
	const aggregateContentProof =
		input.aggregateContentProof ??
		(proofPaths.length > 0
			? await createWorkingTreeContentProof({
					root: input.repoRoot,
					paths: proofPaths,
					exclude: input.snapshotExclude,
				})
			: undefined);
	const loopInput = implementationIterationInput(input, {
		changes: changesWithLocalProof(changes, aggregateContentProof),
		existingPaths: snapshot.paths,
		aggregateContentProof,
	});
	if (mode === "append") {
		const expectedBytes = requiredExpectedBytes(input.expectedBytes);
		const result = await appendSemanticLoopIteration({
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
	const iterationEvent = assertSemanticLoopIterationBatch({
		records: loopResult.traceRecords,
		loop: "implementation",
		nextSequence,
		expectedTraceId: input.expectedTraceId ?? input.traceId,
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

function implementationProofPaths(
	input: RunWikiImplementInput,
	changes: ImplementationChange[],
): string[] {
	return normalizePaths(
		input.proofPaths ?? [
			...(input.changedPaths || []),
			...changes.flatMap(implementationChangedPaths),
			...(input.evidencePaths || []),
		],
	);
}

function requiredExpectedBytes(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw new Error("wiki_implement append mode requires expectedBytes >= 0.");
	}
	return value;
}

function normalizePaths(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => normalizePath(value)).filter(Boolean)),
	).sort((left, right) => left.localeCompare(right));
}

function normalizePath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/^\.\//, "")
		.replace(/\/$/, "")
		.trim();
}
