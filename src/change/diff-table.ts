import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
	normalizeDiffTableUserAction,
	type CodewikiDiffTableRowInput,
	type CodewikiDiffTableUserAction,
} from "./types.ts";
import type { WikiProject } from "../project/types.ts";
import { nowIso } from "../shared/utils.ts";

export type DiffTableRowAction = CodewikiDiffTableUserAction;

export type DiffTableBatchRowAction =
	| "accept"
	| "reject"
	| "defer"
	| "alternative"
	| "edit";

export interface CodewikiDiffTableRowActionInput {
	row_id: string;
	action: DiffTableBatchRowAction;
	row?: CodewikiDiffTableRowInput;
	alternative?: string;
}

export interface CodewikiDiffTableRowActionFailure {
	row_id: string;
	action: string;
	error: string;
}

export interface RuntimeDiffTableRow extends CodewikiDiffTableRowInput {
	id: string;
	user_action: DiffTableRowAction | string;
	alternatives: string[];
}

export interface RuntimeDiffTable {
	id: string;
	summary: string;
	source: string;
	status: "pending" | "compiled" | "archived";
	scope?: { kind: "roadmap" | "sprint" | "task"; id?: string };
	rows: RuntimeDiffTableRow[];
	created_at: string;
	updated_at: string;
}

export interface RuntimeDiffTablesFile {
	version: number;
	updated_at: string;
	tables: RuntimeDiffTable[];
}

export interface CodewikiDiffTableToolInput {
	repoPath?: string;
	action: "propose" | "revise" | "accept" | "reject" | "defer" | "alternative" | "archive" | "list";
	table_id?: string;
	row_id?: string;
	row_ids?: string[];
	row_actions?: CodewikiDiffTableRowActionInput[];
	summary?: string;
	source?: string;
	scope?: { kind: "roadmap" | "sprint" | "task"; id?: string };
	rows?: CodewikiDiffTableRowInput[];
	alternative?: string;
}

export function diffTableStorePath(project: WikiProject): string {
	return resolve(project.root, ".codewiki/runtime/diff-tables.json");
}

export function normalizeDiffTableRows(rows: CodewikiDiffTableRowInput[] = []): RuntimeDiffTableRow[] {
	return rows.map((row, index) => {
		const currentState = String(row.current_state || row.current_project_state || "").trim();
		const desiredState = String(row.desired_state || row.expected_final_state || row.agreed_change || "").trim();
		const userAction = normalizeDiffTableUserAction(row.user_action);
		return {
			id: String(row.id || `DTR-${String(index + 1).padStart(3, "0")}`).trim(),
			current_state: currentState,
			current_project_state: String(row.current_project_state || currentState).trim(),
			desired_state: desiredState,
			agreed_change: String(row.agreed_change || desiredState).trim(),
			expected_final_state: String(row.expected_final_state || desiredState).trim(),
			validated_final_state: String(row.validated_final_state || "").trim(),
			status: normalizeDiffTableUserAction(row.status, userAction),
			proof_refs: normalizeStringList(row.proof_refs),
			rationale: String(row.rationale || "").trim(),
			affected_layers: normalizeStringList(row.affected_layers),
			risk: String(row.risk || "medium").trim(),
			user_action: userAction,
			alternatives: normalizeStringList(row.alternatives),
		};
	}).filter((row) => row.current_state && row.desired_state && row.rationale);
}

export async function readRuntimeDiffTables(project: WikiProject): Promise<RuntimeDiffTablesFile> {
	try {
		const raw = JSON.parse(await readFile(diffTableStorePath(project), "utf8"));
		return {
			version: Number(raw.version || 1),
			updated_at: String(raw.updated_at || ""),
			tables: Array.isArray(raw.tables) ? raw.tables.map(normalizeRuntimeTable).filter(Boolean) as RuntimeDiffTable[] : [],
		};
	} catch {
		return { version: 1, updated_at: nowIso(), tables: [] };
	}
}

export async function writeRuntimeDiffTables(project: WikiProject, file: RuntimeDiffTablesFile): Promise<void> {
	const path = diffTableStorePath(project);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify({ ...file, updated_at: nowIso() }, null, 2) + "\n", "utf8");
}

export async function executeDiffTableAction(project: WikiProject, input: CodewikiDiffTableToolInput) {
	const file = await readRuntimeDiffTables(project);
	if (input.action === "list") return { changed: false, tables: file.tables };
	const now = nowIso();
	if (input.action === "propose") {
		const id = String(input.table_id || `DT-${now.slice(0, 10)}-${file.tables.length + 1}`).trim();
		const table: RuntimeDiffTable = {
			id,
			summary: String(input.summary || "Pending decision diff table").trim(),
			source: String(input.source || "wiki_diff_table tool").trim(),
			status: "pending",
			...(input.scope ? { scope: input.scope } : {}),
			rows: normalizeDiffTableRows(input.rows || []),
			created_at: now,
			updated_at: now,
		};
		if (!table.rows.length) throw new Error("diff_table propose requires rows.");
		file.tables = [table, ...file.tables.filter((existing) => existing.id !== id)];
		await writeRuntimeDiffTables(project, file);
		return { changed: true, table };
	}
	const table = file.tables.find((item) => item.id === input.table_id);
	if (!table) throw new Error(`Diff table not found: ${input.table_id || ""}`);
	const batchActions = buildBatchActions(input);
	if (batchActions.length) {
		const failures = validateBatchActions(table, batchActions);
		if (failures.length) {
			return {
				changed: false,
				table,
				changed_refs: [] as string[],
				changed_row_ids: [] as string[],
				failed_row_ids: failures.map((failure) => failure.row_id),
				failures,
				recovery:
					"No batch row actions were applied. Fix failed row ids/actions and retry the same phase call.",
			};
		}
		for (const action of batchActions) applyRowAction(table, action);
		table.updated_at = now;
		await writeRuntimeDiffTables(project, file);
		return {
			changed: true,
			table,
			changed_refs: [diffTableStorePath(project)],
			changed_row_ids: Array.from(
				new Set(batchActions.map((action) => action.row_id)),
			),
			failed_row_ids: [] as string[],
			failures: [] as CodewikiDiffTableRowActionFailure[],
		};
	}
	if (input.action === "revise") {
		table.rows = normalizeDiffTableRows(input.rows || table.rows);
	} else if (input.action === "archive") {
		table.status = "archived";
	} else {
		const action = singleRowAction(input);
		const row = table.rows.find((item) => item.id === action.row_id);
		if (!row) throw new Error(`Diff row not found: ${action.row_id}`);
		const failure = validateRowAction(table, action);
		if (failure) throw new Error(failure.error);
		applyRowAction(table, action);
	}
	table.updated_at = now;
	await writeRuntimeDiffTables(project, file);
	return { changed: true, table };
}

function singleRowAction(
	input: CodewikiDiffTableToolInput,
): CodewikiDiffTableRowActionInput {
	const rowId = String(input.row_id || "").trim();
	if (!rowId) throw new Error("diff_table row action requires row_id.");
	if (input.action === "accept") return { action: "accept", row_id: rowId };
	if (input.action === "reject") return { action: "reject", row_id: rowId };
	if (input.action === "defer") return { action: "defer", row_id: rowId };
	if (input.action === "alternative") {
		return { action: "alternative", row_id: rowId, alternative: input.alternative };
	}
	throw new Error(`Unsupported diff_table row action: ${input.action}`);
}

function buildBatchActions(
	input: CodewikiDiffTableToolInput,
): CodewikiDiffTableRowActionInput[] {
	const explicit = Array.isArray(input.row_actions) ? input.row_actions : [];
	if (explicit.length) {
		return explicit.map((action) => ({
			...action,
			row_id: String(action.row_id || "").trim(),
		}));
	}
	const rowIds = normalizeStringList(input.row_ids);
	if (!rowIds.length) return [];
	if (!["accept", "reject", "defer"].includes(input.action)) return [];
	return rowIds.map((row_id) => ({
		row_id,
		action: input.action as "accept" | "reject" | "defer",
	}));
}

function validateBatchActions(
	table: RuntimeDiffTable,
	actions: CodewikiDiffTableRowActionInput[],
): CodewikiDiffTableRowActionFailure[] {
	return actions
		.map((action) => validateRowAction(table, action))
		.filter((failure): failure is CodewikiDiffTableRowActionFailure =>
			Boolean(failure),
		);
}

function validateRowAction(
	table: RuntimeDiffTable,
	action: CodewikiDiffTableRowActionInput,
): CodewikiDiffTableRowActionFailure | null {
	const rowId = String(action.row_id || "").trim();
	if (!rowId) {
		return { row_id: "", action: String(action.action || ""), error: "row_id is required" };
	}
	const row = table.rows.find((item) => item.id === rowId);
	if (!row) {
		return {
			row_id: rowId,
			action: String(action.action || ""),
			error: `Diff row not found: ${rowId}`,
		};
	}
	if (!["accept", "reject", "defer", "alternative", "edit"].includes(action.action)) {
		return {
			row_id: rowId,
			action: String(action.action || ""),
			error: `Unsupported row action: ${String(action.action || "")}`,
		};
	}
	if (action.action === "alternative" && !String(action.alternative || "").trim()) {
		return {
			row_id: rowId,
			action: action.action,
			error: "diff_table alternative requires alternative text.",
		};
	}
	if (action.action === "edit") {
		const edited = normalizeDiffTableRows([{ ...row, ...(action.row || {}), id: row.id }]);
		if (!edited.length) {
			return {
				row_id: rowId,
				action: action.action,
				error: "diff_table edit produced an invalid row.",
			};
		}
	}
	return null;
}

function applyRowAction(
	table: RuntimeDiffTable,
	action: CodewikiDiffTableRowActionInput,
): void {
	const row = table.rows.find((item) => item.id === action.row_id);
	if (!row) return;
	if (action.action === "accept") {
		row.user_action = "approved";
		row.status = "approved";
		return;
	}
	if (action.action === "reject") {
		row.user_action = "rejected";
		row.status = "rejected";
		return;
	}
	if (action.action === "defer") {
		row.user_action = "deferred";
		row.status = "deferred";
		return;
	}
	if (action.action === "alternative") {
		const alternative = String(action.alternative || "").trim();
		row.alternatives = normalizeStringList([...(row.alternatives || []), alternative]);
		row.user_action = "edited";
		row.status = "edited";
		return;
	}
	const [edited] = normalizeDiffTableRows([
		{ ...row, ...(action.row || {}), id: row.id },
	]);
	if (!edited) return;
	Object.assign(row, edited);
}

function normalizeStringList(values: unknown): string[] {
	return Array.isArray(values) ? Array.from(new Set(values.map(String).map((value) => value.trim()).filter(Boolean))) : [];
}

function normalizeRuntimeTable(raw: any): RuntimeDiffTable | null {
	if (!raw || typeof raw !== "object") return null;
	const id = String(raw.id || "").trim();
	if (!id) return null;
	const status = ["pending", "compiled", "archived"].includes(String(raw.status)) ? raw.status : "pending";
	return {
		id,
		summary: String(raw.summary || id).trim(),
		source: String(raw.source || "runtime").trim(),
		status,
		...(raw.scope ? { scope: raw.scope } : {}),
		rows: normalizeDiffTableRows(raw.rows || []),
		created_at: String(raw.created_at || raw.updated_at || nowIso()),
		updated_at: String(raw.updated_at || nowIso()),
	};
}
