import {
	createWorkingTreeContentProof,
	type ContentProof,
} from "../git/content-proof.ts";
import { changedPaths as implementationChangedPaths } from "./evidence.ts";
import type { ImplementationChange } from "./types.ts";
import {
	aggregateImplementationWorkerResults,
	type ImplementationWorkerResultInput,
} from "./workers.ts";
import { workerProofRefs } from "./worker-proof.ts";

export interface ImplementationMergeContentProofInput {
	repoRoot: string;
	changes?: ImplementationChange[];
	workerResults?: ImplementationWorkerResultInput[];
	proofPaths?: string[];
	changedPaths?: string[];
	evidencePaths?: string[];
	exclude?: string[];
	aggregateContentProof?: ContentProof;
}

export interface ImplementationMergeContentProof {
	proofPaths: string[];
	aggregateContentProof?: ContentProof;
	workerIds: string[];
	workUnitIds: string[];
	workerProofDigests: string[];
	workerProofRefs: string[];
}

export async function createImplementationMergeContentProof(
	input: ImplementationMergeContentProofInput,
): Promise<ImplementationMergeContentProof> {
	const workerProofs = aggregateImplementationWorkerResults(
		input.workerResults,
	).workerProofs;
	const proofPaths = implementationMergeProofPaths(input, workerProofs);
	return {
		proofPaths,
		aggregateContentProof:
			input.aggregateContentProof ??
			(proofPaths.length > 0
				? await createWorkingTreeContentProof({
						root: input.repoRoot,
						paths: proofPaths,
						exclude: input.exclude,
					})
				: undefined),
		workerIds: unique(workerProofs.map((proof) => proof.workerId)),
		workUnitIds: unique(workerProofs.map((proof) => proof.workUnitId)),
		workerProofDigests: unique(workerProofs.map((proof) => proof.digest)),
		workerProofRefs: unique(workerProofs.flatMap(workerProofRefs)),
	};
}

function implementationMergeProofPaths(
	input: ImplementationMergeContentProofInput,
	workerProofs: ReturnType<
		typeof aggregateImplementationWorkerResults
	>["workerProofs"],
): string[] {
	if (input.proofPaths) return normalizePaths(input.proofPaths);
	return normalizePaths([
		...(input.changedPaths || []),
		...(input.changes || []).flatMap(implementationChangedPaths),
		...(input.evidencePaths || []),
		...workerProofs.flatMap((proof) => proof.changedPaths),
	]);
}

function normalizePaths(paths: string[]): string[] {
	return unique(paths.map(normalizePath));
}

function normalizePath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/^\.\//, "")
		.replace(/\/$/, "")
		.trim();
}

function unique(values: Array<string | undefined>): string[] {
	const strings = values.flatMap((value) => (value ? [value] : []));
	return Array.from(new Set(strings)).sort((left, right) =>
		left.localeCompare(right),
	);
}
