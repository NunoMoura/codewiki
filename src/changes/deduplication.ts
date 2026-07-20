import type { ChangeRecord } from "./records.ts";
import type { Change } from "./types.ts";

export type FeedbackDuplicateMethod = "change_id" | "source_ref" | "semantic";

interface FeedbackDuplicateMatch {
	record: ChangeRecord;
	method: FeedbackDuplicateMethod;
	score: number;
}

export function findFeedbackDuplicate(
	records: ChangeRecord[],
	candidate: Change,
): FeedbackDuplicateMatch | undefined {
	const pending = records
		.filter((record) => record.change.status === "pending")
		.sort((left, right) => left.change.id.localeCompare(right.change.id));
	const sameId = pending.find((record) => record.change.id === candidate.id);
	if (sameId) return { record: sameId, method: "change_id", score: 1 };
	const sameReporter = candidate.provenance.createdBy.startsWith("feedback:")
		? pending.find(
				(record) =>
					record.change.provenance.createdBy === candidate.provenance.createdBy,
			)
		: undefined;
	if (sameReporter)
		return { record: sameReporter, method: "source_ref", score: 1 };
	const candidateSources = new Set(
		candidate.evidence.sourceRefs.filter(isExactSourceRef),
	);
	const sameSource = pending.find((record) =>
		record.change.evidence.sourceRefs.some(
			(ref) => isExactSourceRef(ref) && candidateSources.has(ref),
		),
	);
	if (sameSource) return { record: sameSource, method: "source_ref", score: 1 };
	const candidateTokens = semanticTokens(candidate);
	const targetRefs = new Set(candidate.classification.targetRefs);
	const matches = pending
		.map((record) => ({
			record,
			score: jaccard(candidateTokens, semanticTokens(record.change)),
			targetOverlap: record.change.classification.targetRefs.some((ref) =>
				targetRefs.has(ref),
			),
		}))
		.filter(
			(match) =>
				match.score >= 0.72 && (match.targetOverlap || match.score >= 0.9),
		)
		.sort(
			(left, right) =>
				right.score - left.score ||
				left.record.change.id.localeCompare(right.record.change.id),
		);
	const best = matches[0];
	return best
		? { record: best.record, method: "semantic", score: best.score }
		: undefined;
}

function isExactSourceRef(ref: string): boolean {
	return (
		ref.startsWith("trace:") ||
		ref.startsWith("git:") ||
		ref.startsWith("sha256:")
	);
}

function semanticTokens(change: Change): Set<string> {
	const text = [
		change.intent.question,
		change.intent.currentState,
		change.intent.desiredState,
		change.intent.rationale,
		...change.classification.targetRefs,
	]
		.join(" ")
		.normalize("NFKC")
		.toLowerCase();
	return new Set(
		text
			.split(/[^a-z0-9._/-]+/)
			.map((token) => token.trim())
			.filter((token) => token.length >= 3),
	);
}

function jaccard(left: Set<string>, right: Set<string>): number {
	if (!left.size && !right.size) return 1;
	let intersection = 0;
	for (const value of left) if (right.has(value)) intersection += 1;
	return intersection / (left.size + right.size - intersection);
}
