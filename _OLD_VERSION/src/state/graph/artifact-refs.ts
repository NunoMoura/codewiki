import { unique } from "../../shared/utils.ts";

export interface BuildArtifactRefSource {
	path: string;
	kind?: string;
	taskId?: string;
	data?: unknown;
}

type JsonRecord = Record<string, unknown>;

type ProducedRefKey =
	| "knowledge"
	| "roadmap"
	| "code"
	| "tests"
	| "validation"
	| "publication"
	| "closure";

function isRecord(value: unknown): value is JsonRecord {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordField(value: unknown, key: string): JsonRecord {
	if (!isRecord(value)) return {};
	const next = value[key];
	return isRecord(next) ? next : {};
}

function field(value: unknown, key: string): unknown {
	return isRecord(value) ? value[key] : undefined;
}

export function stringList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map((item) => String(item || "").trim()).filter(Boolean);
	}
	const single = String(value || "").trim();
	return single ? [single] : [];
}

export function normalizeCodewikiRef(value: unknown): string {
	const ref = String(value || "")
		.trim()
		.replace(/\\/g, "/");
	if (!ref) return "";
	if (ref.startsWith(".codewiki/")) return ref;
	if (ref.startsWith("codewiki/")) return `.${ref}`;
	if (ref.startsWith("builds/") || ref.startsWith("validation/")) {
		return `.codewiki/${ref}`;
	}
	return ref;
}

export function normalizeEvidenceRef(value: unknown): string {
	return String(value || "")
		.trim()
		.replace(/\\/g, "/");
}

export function buildRefs(
	data: unknown,
	key: "decision" | "planning" | "implementation",
): string[] {
	return [
		...stringList(recordField(field(data, "linked_builds"), key)),
		...stringList(recordField(field(data, "consumes"), key)),
	]
		.map(normalizeCodewikiRef)
		.filter(Boolean);
}

export function consumedBuildRefs(data: unknown): string[] {
	const consumes = recordField(data, "consumes");
	return [
		...stringList(field(data, "source_decision_build")),
		...stringList(field(data, "source_planning_build")),
		...stringList(consumes.decision),
		...stringList(consumes.planning),
		...stringList(consumes.implementation),
	]
		.map(normalizeCodewikiRef)
		.filter(Boolean);
}

export function producedRefs(data: unknown, key: ProducedRefKey): string[] {
	return stringList(recordField(data, "produces")[key])
		.map(normalizeCodewikiRef)
		.filter(Boolean);
}

export function buildTaskIds(build: BuildArtifactRefSource): string[] {
	const data = isRecord(build.data) ? build.data : {};
	return Array.from(
		new Set(
			[
				...stringList(build.taskId),
				...stringList(data.task_id),
				...stringList(data.taskId),
				...stringList(field(data.task, "id")),
				...stringList(data.roadmap_work_items),
				...stringList(data.task_ids),
				...stringList(field(data.consumes, "roadmap")),
				...stringList(field(data.produces, "roadmap")),
			]
				.map((id) => id.trim())
				.filter((id) => /^TASK-/.test(id)),
		),
	);
}

export function canonicalSourceRefsForBuild(
	build: BuildArtifactRefSource,
): string[] {
	const data = build.data;
	return unique(
		[
			normalizeCodewikiRef(build.path),
			...consumedBuildRefs(data),
			...stringList(recordField(data, "consumes").source).map(
				normalizeCodewikiRef,
			),
			...stringList(field(data, "source")).map(normalizeCodewikiRef),
			...producedRefs(data, "knowledge"),
			...producedRefs(data, "roadmap"),
			...producedRefs(data, "code"),
			...producedRefs(data, "tests"),
			...stringList(field(data, "code_files")).map(normalizeCodewikiRef),
			...stringList(field(data, "test_files")).map(normalizeCodewikiRef),
			...buildTaskIds(build),
		]
			.map(normalizeEvidenceRef)
			.filter(Boolean),
	);
}
