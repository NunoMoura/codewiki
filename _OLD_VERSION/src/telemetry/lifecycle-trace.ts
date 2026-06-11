import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
	CODEWIKI_DECISION_TABLE_ROW_APPROVAL_STATUS_VALUES,
	CODEWIKI_DECISION_TABLE_STATUS_VALUES,
	CODEWIKI_LIFECYCLE_TRACE_SCHEMA_VERSION,
	CODEWIKI_TRACE_CATALOG_SCHEMA_VERSION,
	CODEWIKI_TRACE_DECISION_STATUS_VALUES,
	CODEWIKI_TRACE_IMPLEMENTATION_STATUS_VALUES,
	CODEWIKI_TRACE_LIFECYCLE_STATUS_VALUES,
	CODEWIKI_TRACE_LOOP_RUN_STATE_VALUES,
	CODEWIKI_TRACE_LOOP_VALUES,
	CODEWIKI_TRACE_PLANNING_STATUS_VALUES,
	CODEWIKI_TRACE_PUBLICATION_MODE_VALUES,
	CODEWIKI_TRACE_PUBLICATION_STATUS_VALUES,
	CODEWIKI_TRACE_REF_KIND_VALUES,
	CODEWIKI_TRACE_RELATION_VALUES,
	CODEWIKI_TRACE_RISK_VALUES,
	type CodewikiColdTraceCatalogEntryV1,
	type CodewikiDecisionTableRowV1,
	type CodewikiLifecycleTraceV1,
	type CodewikiTraceCatalogV1,
	type CodewikiTraceRef,
	type CodewikiTraceRestoreRef,
} from "./types.ts";

export interface LifecycleTraceValidationIssue {
	path: string;
	message: string;
}

export interface LifecycleTraceValidationResult<T> {
	ok: boolean;
	issues: LifecycleTraceValidationIssue[];
	value?: T;
}

const FORBIDDEN_EMBEDDED_PAYLOAD_KEYS = new Set([
	"raw_transcript",
	"transcript",
	"conversation",
	"raw_diff",
	"diff",
	"patch",
	"kb_doc",
	"kb_docs",
	"source_snapshot",
	"source_snapshots",
	"file_snapshot",
	"file_snapshots",
]);

const TRACE_PATH_PATTERN =
	/^\.codewiki\/telemetry\/TRACE-[A-Za-z0-9._-]+\.json$/;
const CATALOG_PATH = ".codewiki/telemetry/catalog.json";

export function lifecycleTracePath(traceId: string): string {
	const normalized = traceId.trim();
	if (!/^TRACE-[A-Za-z0-9._-]+$/.test(normalized)) {
		throw new Error(`Invalid lifecycle trace id: ${traceId}`);
	}
	return `.codewiki/telemetry/${normalized}.json`;
}

export function validateCodewikiLifecycleTraceV1(
	value: unknown,
): LifecycleTraceValidationResult<CodewikiLifecycleTraceV1> {
	const issues: LifecycleTraceValidationIssue[] = [];
	if (!isRecord(value)) {
		return invalid("$", "Lifecycle trace must be a JSON object.");
	}
	if (value.schema_version !== CODEWIKI_LIFECYCLE_TRACE_SCHEMA_VERSION) {
		issue(
			issues,
			"$.schema_version",
			"Expected lifecycle trace schema_version 1.",
		);
	}
	stringRequired(issues, value, "trace_id", "$");
	if (
		typeof value.trace_id === "string" &&
		!/^TRACE-[A-Za-z0-9._-]+$/.test(value.trace_id)
	) {
		issue(
			issues,
			"$.trace_id",
			"Trace id must start with TRACE- and be path-safe.",
		);
	}
	stringRequired(issues, value, "title", "$");
	stringRequired(issues, value, "summary", "$");
	validateLifecycle(issues, recordField(value, "lifecycle"));
	validateRelations(issues, value.relations, "$.relations");
	validateScope(issues, recordField(value, "scope"), "$.scope");
	validateDecision(issues, recordField(value, "decision"));
	validatePlanning(issues, recordField(value, "planning"));
	validateImplementation(issues, recordField(value, "implementation"));
	validateAccountability(issues, recordField(value, "accountability"));
	validateNoEmbeddedPayloads(issues, value, "$", []);
	return {
		ok: issues.length === 0,
		issues,
		...(issues.length === 0
			? { value: value as unknown as CodewikiLifecycleTraceV1 }
			: {}),
	};
}

export function validateCodewikiTraceCatalogV1(
	value: unknown,
): LifecycleTraceValidationResult<CodewikiTraceCatalogV1> {
	const issues: LifecycleTraceValidationIssue[] = [];
	if (!isRecord(value)) {
		return invalid("$", "Trace catalog must be a JSON object.");
	}
	if (value.schema_version !== CODEWIKI_TRACE_CATALOG_SCHEMA_VERSION) {
		issue(
			issues,
			"$.schema_version",
			"Expected trace catalog schema_version 1.",
		);
	}
	stringRequired(issues, value, "updated_at", "$");
	if (!Array.isArray(value.entries)) {
		issue(issues, "$.entries", "Trace catalog entries must be an array.");
	} else {
		value.entries.forEach((entry, index) =>
			validateCatalogEntry(issues, entry, `$.entries[${index}]`),
		);
	}
	validateNoEmbeddedPayloads(issues, value, "$", []);
	return {
		ok: issues.length === 0,
		issues,
		...(issues.length === 0
			? { value: value as unknown as CodewikiTraceCatalogV1 }
			: {}),
	};
}

export function assertValidCodewikiLifecycleTraceV1(
	value: unknown,
): CodewikiLifecycleTraceV1 {
	const result = validateCodewikiLifecycleTraceV1(value);
	if (!result.ok || !result.value) throw validationError(result.issues);
	return result.value;
}

export function assertValidCodewikiTraceCatalogV1(
	value: unknown,
): CodewikiTraceCatalogV1 {
	const result = validateCodewikiTraceCatalogV1(value);
	if (!result.ok || !result.value) throw validationError(result.issues);
	return result.value;
}

export async function readCodewikiLifecycleTraceFile(
	repoRoot: string,
	path: string,
): Promise<CodewikiLifecycleTraceV1> {
	const normalized = normalizeRepoPath(path);
	if (!TRACE_PATH_PATTERN.test(normalized)) {
		throw new Error(
			`Lifecycle traces must be read from .codewiki/telemetry/TRACE-*.json, not ${path}`,
		);
	}
	return assertValidCodewikiLifecycleTraceV1(
		JSON.parse(await readFile(resolve(repoRoot, normalized), "utf8")),
	);
}

export async function writeCodewikiLifecycleTraceFile(
	repoRoot: string,
	trace: CodewikiLifecycleTraceV1,
	path = lifecycleTracePath(trace.trace_id),
): Promise<string> {
	const normalized = normalizeRepoPath(path);
	if (!TRACE_PATH_PATTERN.test(normalized)) {
		throw new Error(
			`Lifecycle traces must be written to .codewiki/telemetry/TRACE-*.json, not ${path}`,
		);
	}
	const valid = assertValidCodewikiLifecycleTraceV1(trace);
	await mkdir(dirname(resolve(repoRoot, normalized)), { recursive: true });
	await writeFile(resolve(repoRoot, normalized), `${stableJson(valid)}\n`);
	return normalized;
}

export async function readCodewikiTraceCatalogFile(
	repoRoot: string,
	path = CATALOG_PATH,
): Promise<CodewikiTraceCatalogV1> {
	const normalized = normalizeRepoPath(path);
	if (normalized !== CATALOG_PATH) {
		throw new Error(
			`Trace catalog must be read from ${CATALOG_PATH}, not ${path}`,
		);
	}
	return assertValidCodewikiTraceCatalogV1(
		JSON.parse(await readFile(resolve(repoRoot, normalized), "utf8")),
	);
}

export async function writeCodewikiTraceCatalogFile(
	repoRoot: string,
	catalog: CodewikiTraceCatalogV1,
	path = CATALOG_PATH,
): Promise<string> {
	const normalized = normalizeRepoPath(path);
	if (normalized !== CATALOG_PATH) {
		throw new Error(
			`Trace catalog must be written to ${CATALOG_PATH}, not ${path}`,
		);
	}
	const valid = assertValidCodewikiTraceCatalogV1(catalog);
	await mkdir(dirname(resolve(repoRoot, normalized)), { recursive: true });
	await writeFile(resolve(repoRoot, normalized), `${stableJson(valid)}\n`);
	return normalized;
}

function validateLifecycle(
	issues: LifecycleTraceValidationIssue[],
	value: Record<string, unknown>,
): void {
	enumRequired(
		issues,
		value,
		"status",
		CODEWIKI_TRACE_LIFECYCLE_STATUS_VALUES,
		"$.lifecycle",
	);
	if (!Array.isArray(value.active_loops) || value.active_loops.length === 0) {
		issue(
			issues,
			"$.lifecycle.active_loops",
			"Lifecycle active_loops must be a non-empty array.",
		);
	} else {
		value.active_loops.forEach((loop, index) => {
			const item = recordField({ loop }, "loop");
			enumRequired(
				issues,
				item,
				"loop",
				CODEWIKI_TRACE_LOOP_VALUES,
				`$.lifecycle.active_loops[${index}]`,
			);
			stringRequired(
				issues,
				item,
				"run_id",
				`$.lifecycle.active_loops[${index}]`,
			);
			enumRequired(
				issues,
				item,
				"state",
				CODEWIKI_TRACE_LOOP_RUN_STATE_VALUES,
				`$.lifecycle.active_loops[${index}]`,
			);
		});
	}
}

function validateRelations(
	issues: LifecycleTraceValidationIssue[],
	value: unknown,
	path: string,
): void {
	if (!Array.isArray(value)) {
		issue(issues, path, "Relations must be an array.");
		return;
	}
	value.forEach((relation, index) => {
		const item = recordField({ relation }, "relation");
		stringRequired(issues, item, "target_trace", `${path}[${index}]`);
		enumRequired(
			issues,
			item,
			"rel",
			CODEWIKI_TRACE_RELATION_VALUES,
			`${path}[${index}]`,
		);
	});
}

function validateScope(
	issues: LifecycleTraceValidationIssue[],
	value: Record<string, unknown>,
	path: string,
): void {
	for (const field of [
		"task_refs",
		"sprint_refs",
		"knowledge_refs",
		"diagram_refs",
		"source_refs",
		"test_refs",
		"gate_refs",
		"path_scopes",
	]) {
		optionalStringArray(issues, value, field, path);
	}
}

function validateDecision(
	issues: LifecycleTraceValidationIssue[],
	value: Record<string, unknown>,
): void {
	enumRequired(
		issues,
		value,
		"status",
		CODEWIKI_TRACE_DECISION_STATUS_VALUES,
		"$.decision",
	);
	if (value.decision_table !== undefined) {
		validateDecisionTable(
			issues,
			value.decision_table,
			"$.decision.decision_table",
		);
	}
	optionalTraceRefs(issues, value, "compiler_output_refs", "$.decision");
	optionalTraceRefs(issues, value, "approvals", "$.decision");
	optionalTraceRefs(issues, value, "kb_patch_refs", "$.decision");
	optionalTraceRefs(issues, value, "row_to_kb_mappings", "$.decision");
	optionalTraceRefs(issues, value, "gate_history", "$.decision");
}

function validatePlanning(
	issues: LifecycleTraceValidationIssue[],
	value: Record<string, unknown>,
): void {
	enumRequired(
		issues,
		value,
		"status",
		CODEWIKI_TRACE_PLANNING_STATUS_VALUES,
		"$.planning",
	);
	optionalTraceRefs(issues, value, "compiler_output_refs", "$.planning");
	optionalTraceRefs(issues, value, "gate_history", "$.planning");
}

function validateImplementation(
	issues: LifecycleTraceValidationIssue[],
	value: Record<string, unknown>,
): void {
	enumRequired(
		issues,
		value,
		"status",
		CODEWIKI_TRACE_IMPLEMENTATION_STATUS_VALUES,
		"$.implementation",
	);
	optionalTraceRefs(issues, value, "compiler_output_refs", "$.implementation");
	optionalTraceRefs(issues, value, "gate_evidence", "$.implementation");
	optionalTraceRefs(issues, value, "gate_history", "$.implementation");
	optionalStringArray(issues, value, "code_refs", "$.implementation");
	optionalStringArray(issues, value, "test_refs", "$.implementation");
	if (value.publication !== undefined) {
		const publication = recordField(value, "publication");
		enumRequired(
			issues,
			publication,
			"mode",
			CODEWIKI_TRACE_PUBLICATION_MODE_VALUES,
			"$.implementation.publication",
		);
		enumRequired(
			issues,
			publication,
			"status",
			CODEWIKI_TRACE_PUBLICATION_STATUS_VALUES,
			"$.implementation.publication",
		);
	}
}

function validateAccountability(
	issues: LifecycleTraceValidationIssue[],
	value: Record<string, unknown>,
): void {
	optionalTraceRefs(issues, value, "user_approval_refs", "$.accountability");
	optionalTraceRefs(issues, value, "pi_session_refs", "$.accountability");
	optionalStringArray(issues, value, "agent_summaries", "$.accountability");
	optionalTraceRefs(issues, value, "content_proofs", "$.accountability");
}

function validateDecisionTable(
	issues: LifecycleTraceValidationIssue[],
	value: unknown,
	path: string,
): void {
	const table = recordField({ table: value }, "table");
	if (table.schema_version !== 1) {
		issue(
			issues,
			`${path}.schema_version`,
			"DecisionTableV1 schema_version must be 1.",
		);
	}
	stringRequired(issues, table, "id", path);
	stringRequired(issues, table, "title", path);
	enumRequired(
		issues,
		table,
		"status",
		CODEWIKI_DECISION_TABLE_STATUS_VALUES,
		path,
	);
	optionalTraceRefs(issues, table, "source_refs", path);
	if (!Array.isArray(table.rows) || table.rows.length === 0) {
		issue(
			issues,
			`${path}.rows`,
			"DecisionTableV1 rows must be a non-empty array.",
		);
		return;
	}
	table.rows.forEach((row, index) =>
		validateDecisionTableRow(issues, row, `${path}.rows[${index}]`),
	);
}

function validateDecisionTableRow(
	issues: LifecycleTraceValidationIssue[],
	value: unknown,
	path: string,
): void {
	const row = recordField(
		{ row: value },
		"row",
	) as Partial<CodewikiDecisionTableRowV1>;
	for (const field of [
		"id",
		"question",
		"proposed_change",
		"rationale",
	] as const) {
		stringRequired(issues, row, field, path);
	}
	const stateDelta = recordField(row, "state_delta");
	stringRequired(issues, stateDelta, "current", `${path}.state_delta`);
	stringRequired(issues, stateDelta, "desired", `${path}.state_delta`);
	if (row.risk) {
		enumValue(
			issues,
			row.risk.level,
			CODEWIKI_TRACE_RISK_VALUES,
			`${path}.risk.level`,
		);
	}
	if (row.approval) {
		enumValue(
			issues,
			row.approval.status,
			CODEWIKI_DECISION_TABLE_ROW_APPROVAL_STATUS_VALUES,
			`${path}.approval.status`,
		);
	}
	optionalTraceRefs(issues, row, "evidence_refs", path);
	optionalTraceRefs(issues, row, "follow_up_refs", path);
}

function validateCatalogEntry(
	issues: LifecycleTraceValidationIssue[],
	value: unknown,
	path: string,
): void {
	const entry = recordField(
		{ entry: value },
		"entry",
	) as Partial<CodewikiColdTraceCatalogEntryV1>;
	stringRequired(issues, entry, "trace_id", path);
	if (entry.trace_id && !/^TRACE-[A-Za-z0-9._-]+$/.test(entry.trace_id)) {
		issue(
			issues,
			`${path}.trace_id`,
			"Catalog trace id must be path-safe and start with TRACE-.",
		);
	}
	enumRequired(
		issues,
		entry,
		"lifecycle_status",
		CODEWIKI_TRACE_LIFECYCLE_STATUS_VALUES,
		path,
	);
	if (entry.active_loops !== undefined) {
		if (!Array.isArray(entry.active_loops)) {
			issue(
				issues,
				`${path}.active_loops`,
				"Expected an array of active loop records.",
			);
		} else {
			entry.active_loops.forEach((loop, index) => {
				const item = recordField({ loop }, "loop");
				enumRequired(
					issues,
					item,
					"loop",
					CODEWIKI_TRACE_LOOP_VALUES,
					`${path}.active_loops[${index}]`,
				);
				stringRequired(
					issues,
					item,
					"run_id",
					`${path}.active_loops[${index}]`,
				);
				enumRequired(
					issues,
					item,
					"state",
					CODEWIKI_TRACE_LOOP_RUN_STATE_VALUES,
					`${path}.active_loops[${index}]`,
				);
			});
		}
	}
	validateRestoreRef(issues, entry.restore, `${path}.restore`);
}

function validateRestoreRef(
	issues: LifecycleTraceValidationIssue[],
	value: unknown,
	path: string,
): void {
	const restore = recordField(
		{ restore: value },
		"restore",
	) as Partial<CodewikiTraceRestoreRef>;
	stringRequired(issues, restore, "original_path", path);
	const restoreRefs = [
		restore.commit_sha,
		restore.tree_sha,
		restore.archive_ref,
		restore.remote_ref,
		restore.content_digest,
	].filter((item) => typeof item === "string" && item.trim());
	if (restoreRefs.length === 0) {
		issue(
			issues,
			path,
			"Cold trace restore refs require commit/tree/archive/remote/content digest evidence.",
		);
	}
}

function optionalTraceRefs(
	issues: LifecycleTraceValidationIssue[],
	value: Record<string, unknown>,
	field: string,
	path: string,
): void {
	if (value[field] === undefined) return;
	if (!Array.isArray(value[field])) {
		issue(issues, `${path}.${field}`, "Expected an array of trace refs.");
		return;
	}
	(value[field] as unknown[]).forEach((ref, index) => {
		const item = recordField({ ref }, "ref") as Partial<CodewikiTraceRef>;
		stringRequired(issues, item, "ref", `${path}.${field}[${index}]`);
		if (item.kind !== undefined) {
			enumValue(
				issues,
				item.kind,
				CODEWIKI_TRACE_REF_KIND_VALUES,
				`${path}.${field}[${index}].kind`,
			);
		}
	});
}

function optionalStringArray(
	issues: LifecycleTraceValidationIssue[],
	value: Record<string, unknown>,
	field: string,
	path: string,
): void {
	if (value[field] === undefined) return;
	if (
		!Array.isArray(value[field]) ||
		!(value[field] as unknown[]).every(
			(item) => typeof item === "string" && item.trim(),
		)
	) {
		issue(
			issues,
			`${path}.${field}`,
			"Expected an array of non-empty strings.",
		);
	}
}

function enumRequired<T extends readonly string[]>(
	issues: LifecycleTraceValidationIssue[],
	value: Record<string, unknown>,
	field: string,
	allowed: T,
	path: string,
): void {
	enumValue(issues, value[field], allowed, `${path}.${field}`);
}

function enumValue<T extends readonly string[]>(
	issues: LifecycleTraceValidationIssue[],
	value: unknown,
	allowed: T,
	path: string,
): void {
	if (typeof value !== "string" || !allowed.includes(value)) {
		issue(issues, path, `Expected one of: ${allowed.join(", ")}.`);
	}
}

function stringRequired(
	issues: LifecycleTraceValidationIssue[],
	value: Record<string, unknown>,
	field: string,
	path: string,
): void {
	if (typeof value[field] !== "string" || !String(value[field]).trim()) {
		issue(issues, `${path}.${field}`, "Expected a non-empty string.");
	}
}

function validateNoEmbeddedPayloads(
	issues: LifecycleTraceValidationIssue[],
	value: unknown,
	path: string,
	ancestors: string[],
): void {
	if (Array.isArray(value)) {
		value.forEach((item, index) =>
			validateNoEmbeddedPayloads(issues, item, `${path}[${index}]`, ancestors),
		);
		return;
	}
	if (!isRecord(value)) return;
	for (const [key, child] of Object.entries(value)) {
		if (FORBIDDEN_EMBEDDED_PAYLOAD_KEYS.has(key)) {
			issue(
				issues,
				`${path}.${key}`,
				"Lifecycle traces and catalogs are ref-first and must not embed raw transcripts, diffs, KB docs, or source snapshots.",
			);
		}
		validateNoEmbeddedPayloads(issues, child, `${path}.${key}`, [
			...ancestors,
			key,
		]);
	}
}

function recordField(
	value: Record<string, unknown>,
	field: string,
): Record<string, unknown> {
	const nested = value[field];
	return isRecord(nested) ? nested : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function issue(
	issues: LifecycleTraceValidationIssue[],
	path: string,
	message: string,
): void {
	issues.push({ path, message });
}

function invalid<T>(
	path: string,
	message: string,
): LifecycleTraceValidationResult<T> {
	return { ok: false, issues: [{ path, message }] };
}

function validationError(issues: LifecycleTraceValidationIssue[]): Error {
	return new Error(
		`Invalid CodeWiki lifecycle trace artifact: ${issues
			.map((item) => `${item.path}: ${item.message}`)
			.join("; ")}`,
	);
}

function normalizeRepoPath(path: string): string {
	return path.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function stableJson(value: unknown): string {
	return JSON.stringify(value, null, 2);
}
