import type { TraceEvent } from "../traces/types.ts";
import type { ImplementationChange, ImplementationChangeInput } from "./types.ts";

export function normalizeImplementationChanges(
	changes: ImplementationChangeInput[],
): ImplementationChange[] {
	return changes.map((change) => ({
		id: text(change.id),
		planningRefs: unique([...stringList(change.planningRefs), ...stringList(change.planning_refs)]),
		codePaths: unique([...stringList(change.codePaths), ...stringList(change.code_paths)]),
		docPaths: unique([...stringList(change.docPaths), ...stringList(change.doc_paths)]),
		testPaths: unique([...stringList(change.testPaths), ...stringList(change.test_paths)]),
		checks: unique([...stringList(change.checks), ...stringList(change.checks_run)]),
		acceptanceEvidence: unique([
			...stringList(change.acceptanceEvidence),
			...stringList(change.acceptance_evidence),
		]),
		contentProof: change.contentProof ?? change.content_proof,
		publicationRefs: unique([
			...stringList(change.publicationRefs),
			...stringList(change.publication_refs),
		]),
	}));
}

export function planningRefsFromEvents(events: TraceEvent[]): string[] {
	return unique(
		events
			.filter((event) => event.loop === "planning" && event.event === "planning.work-unit.materialized")
			.map((event) => event.id),
	);
}

export function implementationEvidenceRefs(change: ImplementationChange): string[] {
	return unique([
		...change.planningRefs,
		...change.codePaths,
		...change.docPaths,
		...change.testPaths,
		...change.checks,
		...change.acceptanceEvidence,
		...contentProofRefs(change),
		...change.publicationRefs,
	]);
}

export function contentProofRefs(change: ImplementationChange): string[] {
	return unique([
		change.contentProof?.commit,
		change.contentProof?.tree,
		change.contentProof?.workingTreeDigest,
	]);
}

export function changedPaths(change: ImplementationChange): string[] {
	return unique([...change.codePaths, ...change.docPaths, ...change.testPaths]);
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function stringList(value: unknown): string[] {
	return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
}

function unique(values: Array<string | undefined>): string[] {
	return Array.from(new Set(values.map((value) => text(value)).filter(Boolean)));
}
