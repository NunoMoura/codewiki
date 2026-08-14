import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { TraceRecord } from "../changes/trace/types.ts";

export type KnowledgeAlignmentState =
	| "aligned"
	| "review_needed"
	| "misaligned"
	| "unknown";

export interface KnowledgeTopicBaselineEntry {
	ref: string;
	digest: string;
}

export interface KnowledgeAlignmentBaseline {
	capturedAt: string;
	topics: KnowledgeTopicBaselineEntry[];
}

export interface KnowledgeAlignmentFinding {
	affectedLayer: string;
	sourceRefs: string[];
	rationale: string;
	recommendedNextLoop: "decision" | "planning" | "implementation";
}

export interface KnowledgeAlignmentProjection {
	state: KnowledgeAlignmentState;
	label: "Aligned" | "Review Needed" | "Misaligned" | "Unknown";
	rationale: string;
	topicRefs: string[];
	findings: KnowledgeAlignmentFinding[];
}

export async function captureKnowledgeAlignmentBaseline(
	repoRoot: string,
	refs: string[],
	capturedAt: string,
): Promise<KnowledgeAlignmentBaseline> {
	const topics = await readKnowledgeTopicDigests(repoRoot, refs);
	return {
		capturedAt,
		topics: [...topics.entries()].map(([ref, digest]) => ({ ref, digest })),
	};
}

export async function readKnowledgeTopicDigests(
	repoRoot: string,
	refs: string[],
): Promise<Map<string, string>> {
	const entries = await Promise.all(
		unique(refs).map(async (ref) => {
			const path = knowledgeTopicPath(repoRoot, ref);
			if (!path) return undefined;
			try {
				return [ref, digest(await readFile(path))] as const;
			} catch {
				return undefined;
			}
		}),
	);
	return new Map(
		entries.filter(
			(entry): entry is readonly [string, string] => entry !== undefined,
		),
	);
}

export function knowledgeTopicRefsFromRecords(
	records: TraceRecord[],
): string[] {
	return unique(
		records.flatMap((record) => {
			if (record.type !== "trace_event" || record.loop !== "decision")
				return [];
			const output = objectRecord(record.data?.output);
			const changeRecord = objectRecord(output?.changeRecord);
			const change = objectRecord(changeRecord?.change);
			const knowledge = objectRecord(change?.knowledge);
			return stringList(knowledge?.topicRefs).filter(isKnowledgeTopicRef);
		}),
	);
}

export function projectKnowledgeAlignment(input: {
	records: TraceRecord[];
	topicRefs: string[];
	noKnowledgeImpactReason?: string;
	currentDigests?: ReadonlyMap<string, string>;
}): KnowledgeAlignmentProjection {
	const topicRefs = unique(input.topicRefs).filter(isKnowledgeTopicRef);
	const findings = groundedFindings(input.records);
	if (findings.length > 0) {
		return {
			state: "misaligned",
			label: "Misaligned",
			rationale:
				findings[findings.length - 1]?.rationale ||
				"Grounded contradiction recorded.",
			topicRefs,
			findings,
		};
	}
	if (topicRefs.length === 0 && input.noKnowledgeImpactReason?.trim()) {
		return {
			state: "aligned",
			label: "Aligned",
			rationale: input.noKnowledgeImpactReason.trim(),
			topicRefs,
			findings: [],
		};
	}
	const baseline = latestBaseline(input.records);
	if (!baseline || !input.currentDigests || topicRefs.length === 0) {
		return {
			state: "unknown",
			label: "Unknown",
			rationale:
				"Topic scope or validated baseline is insufficient for an alignment claim.",
			topicRefs,
			findings: [],
		};
	}
	const baselineByRef = new Map(
		baseline.topics.map((topic) => [topic.ref, topic.digest]),
	);
	if (
		topicRefs.some(
			(ref) => !baselineByRef.has(ref) || !input.currentDigests?.has(ref),
		)
	) {
		return {
			state: "unknown",
			label: "Unknown",
			rationale:
				"At least one declared Knowledge topic lacks baseline or current digest evidence.",
			topicRefs,
			findings: [],
		};
	}
	const changed = topicRefs.filter(
		(ref) => baselineByRef.get(ref) !== input.currentDigests?.get(ref),
	);
	if (changed.length > 0) {
		return {
			state: "review_needed",
			label: "Review Needed",
			rationale: `${changed.length} declared Knowledge topic${changed.length === 1 ? " has" : "s have"} changed since the validated baseline.`,
			topicRefs,
			findings: [],
		};
	}
	return {
		state: "aligned",
		label: "Aligned",
		rationale: "Declared Knowledge topics match the validated scoped baseline.",
		topicRefs,
		findings: [],
	};
}

function latestBaseline(
	records: TraceRecord[],
): KnowledgeAlignmentBaseline | undefined {
	for (let index = records.length - 1; index >= 0; index -= 1) {
		const record = records[index];
		if (record?.type !== "trace_event" || record.loop !== "decision") continue;
		const output = objectRecord(record.data?.output);
		const value = objectRecord(output?.knowledgeAlignmentBaseline);
		const capturedAt = stringValue(value?.capturedAt);
		const topics = arrayValue(value?.topics).flatMap((item) => {
			const topic = objectRecord(item);
			const ref = stringValue(topic?.ref);
			const topicDigest = stringValue(topic?.digest);
			return isKnowledgeTopicRef(ref) &&
				/^sha256:[a-f0-9]{64}$/.test(topicDigest)
				? [{ ref, digest: topicDigest }]
				: [];
		});
		if (capturedAt && topics.length > 0) return { capturedAt, topics };
	}
	return undefined;
}

function groundedFindings(records: TraceRecord[]): KnowledgeAlignmentFinding[] {
	return records.flatMap((record) => {
		if (record.type !== "trace_event") return [];
		const data = objectRecord(record.data) || {};
		const values = [
			...arrayValue(data.knowledgeAlignmentFindings),
			...(data.knowledgeAlignmentFinding
				? [data.knowledgeAlignmentFinding]
				: []),
		];
		return values.flatMap((value) => {
			const finding = objectRecord(value);
			const affectedLayer = stringValue(finding?.affectedLayer);
			const sourceRefs = stringList(finding?.sourceRefs);
			const rationale = stringValue(finding?.rationale);
			const recommendedNextLoop = stringValue(finding?.recommendedNextLoop);
			if (
				!affectedLayer ||
				sourceRefs.length === 0 ||
				!rationale ||
				!["decision", "planning", "implementation"].includes(
					recommendedNextLoop,
				)
			) {
				return [];
			}
			return [
				{
					affectedLayer,
					sourceRefs,
					rationale,
					recommendedNextLoop:
						recommendedNextLoop as KnowledgeAlignmentFinding["recommendedNextLoop"],
				},
			];
		});
	});
}

function knowledgeTopicPath(repoRoot: string, ref: string): string | undefined {
	if (!isKnowledgeTopicRef(ref)) return undefined;
	const root = resolve(repoRoot, ".codewiki", "kb");
	const relativePath = ref.startsWith("kb:")
		? `.codewiki/kb/${ref.slice("kb:".length)}`
		: ref;
	const path = resolve(repoRoot, relativePath);
	return path.startsWith(`${root}${sep}`) ? path : undefined;
}

function isKnowledgeTopicRef(value: string): boolean {
	return (
		/^(?:\.codewiki\/kb\/|kb:)(?:product|system)\/[A-Za-z0-9._/-]+\.md$/.test(
			value,
		) && !value.split("/").includes("..")
	);
}

function digest(value: Buffer): string {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function arrayValue(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}
