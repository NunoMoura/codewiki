#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const { executeCodewikiBuildTool, executeCodewikiDecisionTool, executeCodewikiDiffTableTool } = await import(
	pathToFileURL(resolve(repoRoot, "src", "api", "tools.ts")).href
);
const { readRuntimeDiffTables } = await import(
	pathToFileURL(resolve(repoRoot, "src", "change", "diff-table.ts")).href
);

const runtimeRoot = mkdtempSync(resolve(tmpdir(), "codewiki-task-069-"));
const project = {
	root: runtimeRoot,
	graphPath: resolve(runtimeRoot, ".codewiki/index_graph.json"),
	config: {},
	roadmapPath: ".codewiki/roadmap/queue.json",
};

const row = (id, current, desired) => ({
	id,
	current_state: current,
	desired_state: desired,
	rationale: `TASK-069 test row ${id}`,
	affected_layers: ["api"],
	risk: "low",
});

try {
	await executeCodewikiDiffTableTool(project, {
		action: "propose",
		table_id: "DT-TASK-069",
		summary: "Batch decision test",
		rows: [
			row("ROW-A", "A pending", "A approved"),
			row("ROW-B", "B pending", "B rejected"),
			row("ROW-C", "C pending", "C deferred"),
			row("ROW-D", "D pending", "D edited"),
		],
	});

	const batch = await executeCodewikiDecisionTool(project, {
		action: "rows",
		table_id: "DT-TASK-069",
		row_actions: [
			{ row_id: "ROW-A", action: "accept" },
			{ row_id: "ROW-B", action: "reject" },
			{ row_id: "ROW-C", action: "defer" },
			{
				row_id: "ROW-D",
				action: "edit",
				row: {
					current_state: "D pending",
					desired_state: "D approved after edit",
					rationale: "Edited and approved in one batch phase",
					user_action: "approve",
				},
			},
		],
	});
	assert.equal(batch.summary, "codewiki decide: rows");
	assert.equal(batch.result.changed, true);
	assert.deepEqual(batch.result.changed_row_ids, ["ROW-A", "ROW-B", "ROW-C", "ROW-D"]);
	assert.deepEqual(batch.result.failed_row_ids, []);
	let runtime = await readRuntimeDiffTables(project);
	let table = runtime.tables.find((item) => item.id === "DT-TASK-069");
	assert.ok(table, "batch table should exist");
	const rowsById = Object.fromEntries(table.rows.map((item) => [item.id, item]));
	assert.equal(rowsById["ROW-A"].user_action, "approved");
	assert.equal(rowsById["ROW-B"].user_action, "rejected");
	assert.equal(rowsById["ROW-C"].user_action, "deferred");
	assert.equal(rowsById["ROW-D"].user_action, "approved");
	assert.equal(rowsById["ROW-D"].desired_state, "D approved after edit");

	await executeCodewikiDiffTableTool(project, {
		action: "propose",
		table_id: "DT-TASK-069-ROW-IDS",
		summary: "Batch row_ids test",
		rows: [row("RID-A", "RID A", "Approved"), row("RID-B", "RID B", "Approved")],
	});
	const rowIds = await executeCodewikiDiffTableTool(project, {
		action: "accept",
		table_id: "DT-TASK-069-ROW-IDS",
		row_ids: ["RID-A", "RID-B"],
	});
	assert.equal(rowIds.result.changed, true);
	runtime = await readRuntimeDiffTables(project);
	table = runtime.tables.find((item) => item.id === "DT-TASK-069-ROW-IDS");
	assert.ok(table, "row_ids table should exist");
	assert.deepEqual(
		table.rows.map((item) => item.user_action),
		["approved", "approved"],
	);

	await executeCodewikiDiffTableTool(project, {
		action: "propose",
		table_id: "DT-TASK-069-FAIL",
		summary: "Batch failure test",
		rows: [row("FAIL-A", "A pending", "A should stay pending")],
	});
	const beforeFailure = JSON.stringify(await readRuntimeDiffTables(project));
	const failed = await executeCodewikiDecisionTool(project, {
		action: "rows",
		table_id: "DT-TASK-069-FAIL",
		row_actions: [
			{ row_id: "FAIL-A", action: "accept" },
			{ row_id: "MISSING", action: "reject" },
		],
	});
	assert.equal(failed.result.changed, false);
	assert.deepEqual(failed.result.changed_row_ids, []);
	assert.deepEqual(failed.result.failed_row_ids, ["MISSING"]);
	assert.match(failed.result.recovery, /No batch row actions were applied/);
	const afterFailure = JSON.stringify(await readRuntimeDiffTables(project));
	assert.equal(afterFailure, beforeFailure, "failed batch must not partially write");

	const build = await executeCodewikiBuildTool(project, {
		kind: "decision",
		summary: "Gateway approval normalization test",
		source: "TASK-069 test",
		change_type: "system",
		decision_mode: "accepted",
		produces: { knowledge: [".codewiki/kb/system/api.md"] },
		diff_table: [
			{
				id: "ROW-APPROVE",
				current_state: "Approval alias",
				desired_state: "Gateway-normalized approval",
				rationale: "Gateway expects user_action=approved",
				user_action: "approve",
			},
		],
		approved_diff_rows: ["ROW-APPROVE"],
		row_to_kb_mappings: [
			{
				row_id: "ROW-APPROVE",
				knowledge_refs: [".codewiki/kb/system/api.md"],
				evidence: "TASK-069 normalized approve alias to approved",
			},
		],
		propagation: {
			direction: "system-first",
			system_impact: ["Gateway-compatible approval normalization"],
			no_product_impact: "Approval normalization is an internal workflow-tool concern.",
		},
		refresh: false,
	});
	const writtenBuild = JSON.parse(readFileSync(resolve(runtimeRoot, build.result.path), "utf8"));
	assert.equal(writtenBuild.diff_table[0].user_action, "approved");
	assert.deepEqual(writtenBuild.approved_diff_rows, ["ROW-APPROVE"]);
} finally {
	rmSync(runtimeRoot, { recursive: true, force: true });
}
