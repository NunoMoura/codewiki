import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { CodewikiDiffTableRowInput } from "../domain/build/types.ts";
import type { WikiProject } from "../domain/project/types.ts";
import { nowIso } from "../domain/shared/utils.ts";

export type DiffTableRowAction = "pending" | "approved" | "rejected" | "deferred" | "edited";

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
	return rows.map((row, index) => ({
		id: String(row.id || `DTR-${String(index + 1).padStart(3, "0")}`).trim(),
		current_state: String(row.current_state || "").trim(),
		desired_state: String(row.desired_state || "").trim(),
		rationale: String(row.rationale || "").trim(),
		affected_layers: Array.isArray(row.affected_layers) ? row.affected_layers.map(String).map((v) => v.trim()).filter(Boolean) : [],
		risk: String(row.risk || "medium").trim(),
		user_action: String(row.user_action || "pending").trim() || "pending",
		alternatives: Array.isArray(row.alternatives) ? row.alternatives.map(String).map((v) => v.trim()).filter(Boolean) : [],
	})).filter((row) => row.current_state && row.desired_state && row.rationale);
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
			source: String(input.source || "codewiki_diff_table tool").trim(),
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
	if (input.action === "revise") {
		table.rows = normalizeDiffTableRows(input.rows || table.rows);
	} else if (input.action === "archive") {
		table.status = "archived";
	} else {
		const row = table.rows.find((item) => item.id === input.row_id);
		if (!row) throw new Error(`Diff row not found: ${input.row_id || ""}`);
		if (input.action === "accept") row.user_action = "approved";
		if (input.action === "reject") row.user_action = "rejected";
		if (input.action === "defer") row.user_action = "deferred";
		if (input.action === "alternative") {
			const alternative = String(input.alternative || "").trim();
			if (!alternative) throw new Error("diff_table alternative requires alternative text.");
			row.alternatives = [...(row.alternatives || []), alternative];
			row.user_action = "edited";
		}
	}
	table.updated_at = now;
	await writeRuntimeDiffTables(project, file);
	return { changed: true, table };
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
