import type {
	CodewikiColdTraceCatalogEntryV1,
	CodewikiLifecycleTraceV1,
	CodewikiTraceCatalogV1,
} from "../../telemetry/types.ts";
import { unique } from "../../shared/utils.ts";

interface TraceArtifactInput {
	path: string;
	data: unknown;
}

interface TraceCatalogInput {
	path: string;
	data: unknown;
}

interface RuntimeProjectionInput {
	active_claim_count?: number;
	warning_count?: number;
	conflict_count?: number;
	pending_waiter_count?: number;
	ready_waiter_count?: number;
	artifact_statuses?: unknown[];
}

export interface BuildTraceDagProjectionInput {
	traces?: TraceArtifactInput[];
	catalog?: TraceCatalogInput | null;
	runtime?: RuntimeProjectionInput;
}

type JsonRecord = Record<string, unknown>;

interface TraceProjectionRecord extends JsonRecord {
	trace_id: string;
	source_ref: string;
	cold: boolean;
	pointer_refs: Record<string, string>;
	task_refs: string[];
	sprint_refs: string[];
	path_refs: string[];
	gate_refs: string[];
}

function isRecord(value: unknown): value is JsonRecord {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordField(value: unknown, key: string): JsonRecord {
	if (!isRecord(value)) return {};
	const next = value[key];
	return isRecord(next) ? next : {};
}

function arrayField(value: unknown, key: string): unknown[] {
	if (!isRecord(value)) return [];
	const next = value[key];
	return Array.isArray(next) ? next : [];
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function traceRefList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => {
			if (typeof item === "string") return item;
			if (isRecord(item)) return String(item.ref || "").trim();
			return "";
		})
		.filter(Boolean);
}

function normalizeRef(value: unknown): string {
	return String(value || "")
		.trim()
		.replace(/\\/g, "/");
}

function hotPointer(path: string, pointer: string): string {
	return `${normalizeRef(path)}#${pointer}`;
}

function coldBase(entry: Partial<CodewikiColdTraceCatalogEntryV1>): string {
	const restore: JsonRecord = isRecord(entry.restore) ? entry.restore : {};
	const originalPath = normalizeRef(restore.original_path);
	const commitSha = normalizeRef(restore.commit_sha);
	if (commitSha && originalPath) return `git:${commitSha}:${originalPath}`;
	return originalPath || `catalog:${normalizeRef(entry.trace_id)}`;
}

function coldPointer(
	entry: Partial<CodewikiColdTraceCatalogEntryV1>,
	pointer: string,
): string {
	return `${coldBase(entry)}#${pointer}`;
}

function compactActiveLoops(value: unknown): JsonRecord[] {
	return arrayField(value, "active_loops")
		.map((loop) => recordField({ loop }, "loop"))
		.map((loop) => ({
			loop: String(loop.loop || "").trim(),
			run_id: String(loop.run_id || "").trim(),
			state: String(loop.state || "").trim(),
			cursor: String(loop.cursor || "").trim() || undefined,
			next_action: String(loop.next_action || "").trim() || undefined,
		}))
		.filter((loop) => loop.loop && loop.run_id && loop.state);
}

function compactRefs(refs: unknown): string[] {
	return unique(
		[...stringList(refs), ...traceRefList(refs)]
			.map(normalizeRef)
			.filter(Boolean),
	);
}

function sectionGateRefs(section: unknown): string[] {
	return unique([
		...compactRefs(arrayField(section, "gate_refs")),
		...compactRefs(arrayField(section, "gate_history")),
		...compactRefs(arrayField(section, "gate_evidence")),
	]);
}

function compactPlanningEvidenceRows(
	planning: unknown,
	path: string,
	key: "decision_coverage" | "roadmap_reconciliation",
): JsonRecord[] {
	return arrayField(planning, key).map((item, index) => {
		const row = recordField({ item }, "item");
		return {
			...row,
			pointer_ref: hotPointer(path, `/planning/${key}/${index}`),
		};
	});
}

function tracePointerRefs(path: string): Record<string, string> {
	return {
		root: hotPointer(path, ""),
		lifecycle: hotPointer(path, "/lifecycle"),
		relations: hotPointer(path, "/relations"),
		scope: hotPointer(path, "/scope"),
		decision: hotPointer(path, "/decision"),
		decision_table: hotPointer(path, "/decision/decision_table"),
		planning: hotPointer(path, "/planning"),
		implementation: hotPointer(path, "/implementation"),
		accountability: hotPointer(path, "/accountability"),
	};
}

function catalogPointerRefs(
	entry: Partial<CodewikiColdTraceCatalogEntryV1>,
	index: number,
): Record<string, string> {
	const entryPointer = `/entries/${index}`;
	return {
		root: coldPointer(entry, ""),
		catalog_entry: `.codewiki/telemetry/catalog.json#${entryPointer}`,
		lifecycle: coldPointer(entry, "/lifecycle"),
		relations: coldPointer(entry, "/relations"),
		scope: coldPointer(entry, "/scope"),
		decision: coldPointer(entry, "/decision"),
		planning: coldPointer(entry, "/planning"),
		implementation: coldPointer(entry, "/implementation"),
		accountability: coldPointer(entry, "/accountability"),
	};
}

function compactHotTrace(
	input: TraceArtifactInput,
): TraceProjectionRecord | null {
	if (!isRecord(input.data)) return null;
	const trace = input.data as Partial<CodewikiLifecycleTraceV1>;
	const traceId = normalizeRef(trace.trace_id);
	if (!traceId) return null;
	const lifecycle = recordField(trace, "lifecycle");
	const scope = recordField(trace, "scope");
	const decision = recordField(trace, "decision");
	const planning = recordField(trace, "planning");
	const implementation = recordField(trace, "implementation");
	const publication = recordField(implementation, "publication");
	const blockerRows = arrayField(lifecycle, "blockers").map(
		(blocker, index) => ({
			trace_id: traceId,
			severity: String(
				recordField({ blocker }, "blocker").severity || "",
			).trim(),
			summary: String(recordField({ blocker }, "blocker").summary || "").trim(),
			pointer_ref: hotPointer(input.path, `/lifecycle/blockers/${index}`),
		}),
	);
	const routeBackRows = arrayField(lifecycle, "route_back").map(
		(route, index) => ({
			trace_id: traceId,
			to_loop: String(recordField({ route }, "route").to_loop || "").trim(),
			reason: String(recordField({ route }, "route").reason || "").trim(),
			pointer_ref: hotPointer(input.path, `/lifecycle/route_back/${index}`),
		}),
	);
	const taskRefs = compactRefs(scope.task_refs);
	const sprintRefs = compactRefs(scope.sprint_refs);
	const sourceRefs = compactRefs(scope.source_refs);
	const testRefs = compactRefs(scope.test_refs);
	const pathRefs = unique([
		...compactRefs(scope.path_scopes),
		...sourceRefs,
		...testRefs,
	]);
	const gateRefs = unique([
		...compactRefs(scope.gate_refs),
		...sectionGateRefs(decision),
		...sectionGateRefs(planning),
		...sectionGateRefs(implementation),
	]);
	return {
		trace_id: traceId,
		title: String(trace.title || traceId).trim(),
		summary: String(trace.summary || "").trim(),
		lifecycle_status: String(lifecycle.status || "").trim(),
		active_loops: compactActiveLoops(lifecycle),
		next_safe_actions: stringList(lifecycle.next_safe_actions),
		decision_status: String(decision.status || "").trim() || undefined,
		planning_status: String(planning.status || "").trim() || undefined,
		planning_decision_coverage: compactPlanningEvidenceRows(
			planning,
			input.path,
			"decision_coverage",
		),
		planning_roadmap_reconciliation: compactPlanningEvidenceRows(
			planning,
			input.path,
			"roadmap_reconciliation",
		),
		implementation_status:
			String(implementation.status || "").trim() || undefined,
		publication_status: String(publication.status || "").trim() || undefined,
		source_ref: normalizeRef(input.path),
		cold: false,
		pointer_refs: tracePointerRefs(input.path),
		task_refs: taskRefs,
		sprint_refs: sprintRefs,
		knowledge_refs: compactRefs(scope.knowledge_refs),
		source_refs: sourceRefs,
		test_refs: testRefs,
		path_refs: pathRefs,
		gate_refs: gateRefs,
		blockers: blockerRows,
		route_backs: routeBackRows,
	};
}

function compactColdTrace(
	entry: Partial<CodewikiColdTraceCatalogEntryV1>,
	index: number,
): TraceProjectionRecord | null {
	const traceId = normalizeRef(entry.trace_id);
	if (!traceId) return null;
	const sourceRefs = compactRefs(entry.source_refs);
	const testRefs = compactRefs(entry.test_refs);
	return {
		trace_id: traceId,
		title: String(entry.title || traceId).trim(),
		summary: String(entry.summary || "").trim(),
		lifecycle_status: String(entry.lifecycle_status || "").trim(),
		active_loops: compactActiveLoops(entry),
		source_ref: coldBase(entry),
		cold: true,
		pointer_refs: catalogPointerRefs(entry, index),
		task_refs: compactRefs(entry.task_refs),
		sprint_refs: compactRefs(entry.sprint_refs),
		knowledge_refs: compactRefs(entry.knowledge_refs),
		source_refs: sourceRefs,
		test_refs: testRefs,
		path_refs: unique([
			...compactRefs(entry.path_scopes),
			...sourceRefs,
			...testRefs,
		]),
		gate_refs: compactRefs(entry.gate_refs),
		restore_ref: recordField(entry, "restore"),
	};
}

function lineageRows(
	recordsById: Map<string, TraceProjectionRecord>,
	traces: TraceArtifactInput[],
	catalogEntries: Partial<CodewikiColdTraceCatalogEntryV1>[],
): JsonRecord[] {
	const rows: JsonRecord[] = [];
	for (const input of traces) {
		if (!isRecord(input.data)) continue;
		const traceId = normalizeRef(input.data.trace_id);
		arrayField(input.data, "relations").forEach((relation, index) => {
			const row = recordField({ relation }, "relation");
			const targetTrace = normalizeRef(row.target_trace);
			const rel = normalizeRef(row.rel);
			if (!traceId || !targetTrace || !rel) return;
			rows.push({
				from_trace: traceId,
				to_trace: targetTrace,
				rel,
				state: normalizeRef(row.state) || undefined,
				rationale: normalizeRef(row.rationale) || undefined,
				pointer_ref: hotPointer(input.path, `/relations/${index}`),
				target_available: recordsById.has(targetTrace),
			});
		});
	}
	catalogEntries.forEach((entry, entryIndex) => {
		const traceId = normalizeRef(entry.trace_id);
		arrayField(entry, "relations").forEach((relation, index) => {
			const row = recordField({ relation }, "relation");
			const targetTrace = normalizeRef(row.target_trace);
			const rel = normalizeRef(row.rel);
			if (!traceId || !targetTrace || !rel) return;
			rows.push({
				from_trace: traceId,
				to_trace: targetTrace,
				rel,
				state: normalizeRef(row.state) || undefined,
				pointer_ref: `.codewiki/telemetry/catalog.json#/entries/${entryIndex}/relations/${index}`,
				target_available: recordsById.has(targetTrace),
			});
		});
	});
	return rows;
}

function indexRecords(
	records: TraceProjectionRecord[],
	field: "task_refs" | "path_refs",
): Record<string, JsonRecord[]> {
	const result: Record<string, JsonRecord[]> = {};
	for (const record of records) {
		for (const ref of record[field]) {
			if (!result[ref]) result[ref] = [];
			result[ref].push({
				trace_id: record.trace_id,
				lifecycle_status: record.lifecycle_status,
				cold: record.cold,
				pointer_ref: record.pointer_refs.scope,
			});
		}
	}
	return result;
}

function decisionQueue(records: TraceProjectionRecord[]): JsonRecord[] {
	return records
		.filter((record) => {
			const decisionStatus = String(record.decision_status || "");
			if (!decisionStatus || decisionStatus === "not_started") return false;
			if (["gate_passed", "kb_applied"].includes(decisionStatus)) return false;
			return !["closed", "published"].includes(
				String(record.lifecycle_status || ""),
			);
		})
		.map((record) => ({
			trace_id: record.trace_id,
			decision_status: record.decision_status,
			lifecycle_status: record.lifecycle_status,
			pointer_ref: record.pointer_refs.decision,
			decision_table_ref: record.pointer_refs.decision_table,
		}));
}

function blockerRows(records: TraceProjectionRecord[]): JsonRecord[] {
	return records.flatMap((record) => [
		...(Array.isArray(record.blockers) ? record.blockers : []),
		...(Array.isArray(record.route_backs) ? record.route_backs : []),
	]);
}

function gateRows(records: TraceProjectionRecord[]): JsonRecord[] {
	return records.flatMap((record) =>
		record.gate_refs.map((gateRef) => ({
			trace_id: record.trace_id,
			gate_ref: gateRef,
			pointer_ref: record.pointer_refs.implementation,
		})),
	);
}

function publicationRows(records: TraceProjectionRecord[]): JsonRecord[] {
	return records
		.filter((record) => record.publication_status)
		.map((record) => ({
			trace_id: record.trace_id,
			publication_status: record.publication_status,
			lifecycle_status: record.lifecycle_status,
			pointer_ref: record.pointer_refs.implementation,
		}));
}

function planningEvidenceRows(
	records: TraceProjectionRecord[],
	key: "planning_decision_coverage" | "planning_roadmap_reconciliation",
): JsonRecord[] {
	return records.flatMap((record) =>
		(Array.isArray(record[key]) ? (record[key] as JsonRecord[]) : []).map(
			(row) => ({
				trace_id: record.trace_id,
				...row,
			}),
		),
	);
}

export function buildTraceDagProjection(
	input: BuildTraceDagProjectionInput,
): JsonRecord {
	const hotTraces = (input.traces || [])
		.map(compactHotTrace)
		.filter((record): record is TraceProjectionRecord => Boolean(record));
	const catalog = isRecord(input.catalog?.data)
		? (input.catalog.data as Partial<CodewikiTraceCatalogV1>)
		: null;
	const catalogEntries = Array.isArray(catalog?.entries)
		? (catalog.entries as Partial<CodewikiColdTraceCatalogEntryV1>[])
		: [];
	const coldTraces = catalogEntries
		.map((entry, index) => compactColdTrace(entry, index))
		.filter((record): record is TraceProjectionRecord => Boolean(record));
	const records = [...hotTraces, ...coldTraces];
	const recordsById = new Map(
		records.map((record) => [record.trace_id, record]),
	);
	const activeTraces = records.filter((record) =>
		[
			"active",
			"blocked",
			"production_ready_unpublished",
			"publish_blocked",
		].includes(String(record.lifecycle_status || "")),
	);
	const blockers = blockerRows(records);
	const lineage = lineageRows(recordsById, input.traces || [], catalogEntries);
	const planningDecisionCoverage = planningEvidenceRows(
		records,
		"planning_decision_coverage",
	);
	const planningRoadmapReconciliation = planningEvidenceRows(
		records,
		"planning_roadmap_reconciliation",
	);
	const sourceRefs = unique([
		...hotTraces.map((record) => record.source_ref),
		...(catalog
			? [
					normalizeRef(
						input.catalog?.path || ".codewiki/telemetry/catalog.json",
					),
				]
			: []),
	]);
	const runtime = input.runtime || {};
	return {
		version: 1,
		source: "generated:trace-dag-projection",
		invariant: "generated_view_not_canonical_truth",
		trace_count: records.length,
		hot_trace_count: hotTraces.length,
		cold_trace_count: coldTraces.length,
		source_refs: sourceRefs,
		status: {
			active_trace_ids: activeTraces.map((record) => record.trace_id),
			blocked_trace_ids: records
				.filter((record) => String(record.lifecycle_status) === "blocked")
				.map((record) => record.trace_id),
			blocker_count: blockers.length,
			next_safe_actions: unique(
				records.flatMap((record) => stringList(record.next_safe_actions)),
			),
			source_refs: sourceRefs,
		},
		resume: {
			active_traces: activeTraces.map((record) => ({
				trace_id: record.trace_id,
				title: record.title,
				lifecycle_status: record.lifecycle_status,
				active_loops: record.active_loops,
				pointer_refs: record.pointer_refs,
			})),
			context_boundary:
				"Expand trace sections only by pointer ref before semantic edits.",
		},
		decision_queue: decisionQueue(records),
		"decision-queue": decisionQueue(records),
		lineage,
		planning_coverage: {
			decision_coverage: planningDecisionCoverage,
			roadmap_reconciliation: planningRoadmapReconciliation,
		},
		work_ready: records
			.filter((record) => record.implementation_status === "active")
			.map((record) => ({
				trace_id: record.trace_id,
				task_refs: record.task_refs,
				path_refs: record.path_refs,
				gate_refs: record.gate_refs,
				pointer_ref: record.pointer_refs.implementation,
			})),
		blockers,
		task: indexRecords(records, "task_refs"),
		path: indexRecords(records, "path_refs"),
		gate: gateRows(records),
		runtime: {
			source_refs: [
				".codewiki/session/queue.json",
				".codewiki/runtime/jobs.json",
			],
			durable_truth: false,
			source_role: "hot_coordination_input",
			active_claim_count: Number(runtime.active_claim_count || 0),
			warning_count: Number(runtime.warning_count || 0),
			conflict_count: Number(runtime.conflict_count || 0),
			waiting_count: Number(runtime.pending_waiter_count || 0),
			ready_waiter_count: Number(runtime.ready_waiter_count || 0),
			artifact_statuses: (runtime.artifact_statuses || []).slice(0, 12),
		},
		publication: publicationRows(records),
		deferred_views: [],
	};
}
