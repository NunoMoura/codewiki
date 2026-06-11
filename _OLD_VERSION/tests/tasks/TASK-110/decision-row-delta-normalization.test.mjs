import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeDecisionBuild } from "../../../src/build/writer.ts";
import { acceptedDecisionRows } from "../../../src/build/decision-propagation.ts";
import {
	decisionStateDeltaGaps,
	normalizeDecisionStateDeltaRows,
} from "../../../src/decision/state-delta.ts";
import { buildGatewayPreflight } from "../../../src/gateway/report.ts";

function projectFixture(root) {
	return {
		root,
		label: "task-110-fixture",
		config: { project_name: "task-110-fixture", schema_version: 4 },
		docsRoot: ".codewiki/kb",
		specsRoot: ".codewiki/kb",
		evidenceRoot: ".codewiki/evidence",
		researchRoot: ".codewiki/research",
		indexPath: ".codewiki/index.md",
		roadmapPath: ".codewiki/roadmap/queue.json",
		roadmapDocPath: ".codewiki/roadmap.md",
		roadmapEventsPath: "",
		metaRoot: ".codewiki",
		viewsRoot: ".codewiki/views",
		graphPath: ".codewiki/index_graph.json",
		lintPath: ".codewiki/index_graph.json",
		roadmapStatePath: ".codewiki/index_graph.json",
		statusStatePath: ".codewiki/index_graph.json",
		eventsPath: "",
		configPath: ".codewiki/config.json",
	};
}

const root = await mkdtemp(join(tmpdir(), "codewiki-task-110-"));
const project = projectFixture(root);

try {
	const current = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accept explicit decision row delta contract.",
		decision_table: [
			{
				id: "ROW-CURRENT",
				current_state: "Rows only describe desired state.",
				desired_state: "Rows describe exact state deltas.",
				agreed_change: "Require explicit decision row state deltas.",
				expected_final_state: "Planning reads exact row deltas.",
				validated_final_state: "Decision gate checked row delta contract.",
				rationale: "Planning needs stable semantics.",
				affected_layers: ["decision", "planning"],
				user_action: "approved",
			},
		],
		approved_decision_rows: ["ROW-CURRENT"],
		row_to_kb_mappings: [
			{
				row_id: "ROW-CURRENT",
				knowledge_refs: [".codewiki/kb/system/trace-graph.md"],
				evidence: "Trace graph docs describe row-level state deltas.",
			},
		],
		propagation: {
			direction: "system-first",
			no_product_impact: "Fixture only changes system decision semantics.",
		},
		knowledge_changes: [".codewiki/kb/system/trace-graph.md"],
	});

	const currentRows = normalizeDecisionStateDeltaRows(current.data);
	assert.equal(currentRows.length, 1);
	assert.deepEqual(
		{
			id: currentRows[0].id,
			current_project_state: currentRows[0].current_project_state,
			change_delta: currentRows[0].change_delta,
			expected_final_state: currentRows[0].expected_final_state,
			validated_final_state: currentRows[0].validated_final_state,
			source_format: currentRows[0].source_format,
		},
		{
			id: "ROW-CURRENT",
			current_project_state: "Rows only describe desired state.",
			change_delta: "Require explicit decision row state deltas.",
			expected_final_state: "Planning reads exact row deltas.",
			validated_final_state: "Decision gate checked row delta contract.",
			source_format: "decision_table",
		},
	);
	assert.deepEqual(decisionStateDeltaGaps(current.data), []);

	const legacy = {
		kind: "decision_build",
		approved_decision_rows: ["ROW-LEGACY"],
		diff_table: [
			{
				id: "ROW-LEGACY",
				current_project_state: "Legacy builds store raw diff_table rows.",
				agreed_change: "Normalize legacy rows into decision state deltas.",
				expected_final_state: "Planning reads legacy rows by stable row ID.",
				validated_final_state: "",
				status: "approved",
				rationale: "Legacy recovery must keep working.",
				affected_layers: ["decision", "trace"],
			},
		],
	};
	const legacyRows = normalizeDecisionStateDeltaRows(legacy);
	assert.equal(legacyRows.length, 1);
	assert.equal(legacyRows[0].id, "ROW-LEGACY");
	assert.equal(
		legacyRows[0].current_project_state,
		"Legacy builds store raw diff_table rows.",
	);
	assert.equal(
		legacyRows[0].change_delta,
		"Normalize legacy rows into decision state deltas.",
	);
	assert.equal(legacyRows[0].source_format, "diff_table");
	assert.deepEqual(
		acceptedDecisionRows(legacy).map((row) => row.id),
		["ROW-LEGACY"],
	);
	assert.equal(
		acceptedDecisionRows(legacy)[0].text,
		legacyRows[0].change_delta,
	);

	const malformedPath = ".codewiki/builds/decision/malformed-delta.json";
	await mkdir(join(root, ".codewiki/builds/decision"), { recursive: true });
	await writeFile(
		join(root, malformedPath),
		JSON.stringify(
			{
				kind: "decision_build",
				status: "accepted",
				lifecycle: { state: "accepted" },
				summary: "Malformed decision delta.",
				change_type: "system",
				traceability: { change_type: "system", semantic: true },
				approved_decision_rows: ["ROW-BAD"],
				decision_table: {
					rows: [
						{
							id: "ROW-BAD",
							approval: { status: "approved" },
							rationale: "Missing current and change delta.",
							impact: { system: ["decision"] },
						},
					],
				},
				row_to_kb_mappings: [
					{
						row_id: "ROW-BAD",
						knowledge_refs: [".codewiki/kb/system/trace-graph.md"],
						evidence: "Mapping exists, but row delta is malformed.",
					},
				],
			},
			null,
			2,
		),
	);

	const preflight = buildGatewayPreflight(project, {
		profile: "decision",
		verdict: "pass",
		rationale: "Decision delta gate should block malformed rows.",
		source: malformedPath,
		audit_refs: ["audit:alignment", "audit:stale-reference"],
		checks: ["explicit approval by user: malformed delta fixture"],
		isolation: { role: "validator", fresh_context: true, clean: false },
	});
	assert.equal(preflight.status, "blocked");
	assert.ok(
		preflight.missing.decision_mappings.includes(
			"decision_row:ROW-BAD:missing_current_project_state",
		),
	);
	assert.ok(
		preflight.missing.decision_mappings.includes(
			"decision_row:ROW-BAD:missing_change_delta",
		),
	);
	assert.ok(
		preflight.missing.decision_mappings.includes(
			"decision_row:ROW-BAD:missing_expected_final_state",
		),
	);
} finally {
	await rm(root, { recursive: true, force: true });
}
