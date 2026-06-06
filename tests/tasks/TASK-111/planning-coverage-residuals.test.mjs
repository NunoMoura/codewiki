import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeDecisionBuild, writePlanningBuild } from "../../../src/build/writer.ts";
import { buildGatewayPreflight, writeGatewayReport } from "../../../src/gateway/report.ts";

function projectFixture(root) {
	return {
		root,
		label: "task-111-fixture",
		config: { project_name: "task-111-fixture", schema_version: 4 },
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

const root = await mkdtemp(join(tmpdir(), "codewiki-task-111-"));
const project = projectFixture(root);

try {
	const decision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accept planning coverage fixture.",
		decision_table: [
			{
				id: "ROW-PLAN-COVERAGE",
				current_state: "Planning coverage can be prose-only.",
				desired_state: "Planning coverage is structured and residual-aware.",
				agreed_change: "Require typed planning decision coverage and roadmap reconciliation.",
				expected_final_state: "Planning gate blocks prose-only or unresolved residuals.",
				rationale: "Accepted rows must not disappear.",
				affected_layers: ["planning", "roadmap", "gateway"],
				user_action: "approved",
			},
		],
		approved_decision_rows: ["ROW-PLAN-COVERAGE"],
		row_to_kb_mappings: [
			{
				row_id: "ROW-PLAN-COVERAGE",
				knowledge_refs: [".codewiki/kb/system/flows/decision-to-planning.md"],
				evidence: "Planning docs require structured coverage.",
			},
		],
		propagation: {
			direction: "system-first",
			no_product_impact: "Fixture only changes system planning semantics.",
			downstream_planning_questions: ["How should planning coverage be represented?"],
		},
		knowledge_changes: [".codewiki/kb/system/flows/decision-to-planning.md"],
	});
	await writeGatewayReport(project, {
		profile: "decision",
		verdict: "pass",
		rationale: "Decision fixture validated.",
		source: decision.path,
		audit_refs: ["audit:alignment", "audit:stale-reference"],
		checks: ["explicit approval by user: fixture"],
	});

	const fullPlan = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Plan structured coverage.",
		source_decision_build: decision.path,
		task_ids: ["TASK-111"],
		task_changes: ["TASK-111 owns structured planning coverage."],
		decision_row_resolutions: [
			{
				row_id: "ROW-PLAN-COVERAGE",
				resolution: "roadmap-task",
				task_ids: ["TASK-111"],
				evidence: "TASK-111 implements the accepted row.",
				source_refs: [decision.path],
			},
		],
		downstream_question_resolutions: [
			{
				question: "How should planning coverage be represented?",
				resolution: "roadmap-task",
				task_ids: ["TASK-111"],
				evidence: "TASK-111 defines structured coverage representation.",
				source_refs: [decision.path],
			},
		],
		roadmap_reconciliation: [
			{
				state: "active-roadmap",
				row_ids: ["ROW-PLAN-COVERAGE"],
				task_ids: ["TASK-111"],
				evidence: "Existing roadmap reviewed; TASK-111 is the active owner.",
				source_refs: [decision.path],
			},
		],
	});
	const rowCoverage = fullPlan.data.decision_coverage.find(
		(entry) => entry.row_id === "ROW-PLAN-COVERAGE",
	);
	assert.ok(rowCoverage, "row-level decision coverage is projected");
	assert.equal(rowCoverage.state, "active-roadmap");
	assert.ok(
		fullPlan.data.decision_coverage.some(
			(entry) => entry.question === "How should planning coverage be represented?",
		),
		"downstream question coverage is projected",
	);
	assert.equal(fullPlan.data.roadmap_reconciliation[0].state, "active-roadmap");
	assert.equal(fullPlan.data.roadmap_reconciliation[0].row_ids[0], "ROW-PLAN-COVERAGE");
	const fullPreflight = buildGatewayPreflight(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Structured coverage and reconciliation can pass.",
		source: fullPlan.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(fullPreflight.status, "ready");
	assert.deepEqual(fullPreflight.missing.decision_coverage, []);
	assert.deepEqual(fullPreflight.missing.roadmap_reconciliation, []);

	const proseOnlyPlan = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Plan with prose-only roadmap reconciliation.",
		source_decision_build: decision.path,
		task_ids: ["TASK-111"],
		task_changes: ["TASK-111 owns the row."],
		decision_row_resolutions: [
			{
				row_id: "ROW-PLAN-COVERAGE",
				resolution: "roadmap-task",
				task_ids: ["TASK-111"],
				evidence: "TASK-111 owns the row.",
			},
		],
		evidence_mapping: [
			{
				criterion: "Roadmap reconciliation",
				evidence: "Existing roadmap was reviewed in prose only.",
			},
		],
	});
	const proseOnlyPreflight = buildGatewayPreflight(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Prose-only reconciliation should block.",
		source: proseOnlyPlan.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(proseOnlyPreflight.status, "blocked");
	assert.ok(
		proseOnlyPreflight.missing.roadmap_reconciliation.some((entry) =>
			entry.includes("missing_structured_entries"),
		),
	);

	const partialResidualPlan = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Plan with unresolved partial residual.",
		source_decision_build: decision.path,
		decision_row_resolutions: [
			{
				row_id: "ROW-PLAN-COVERAGE",
				resolution: "roadmap-task",
				task_ids: ["TASK-111"],
				evidence: "TASK-111 owns part of the row.",
			},
		],
		roadmap_reconciliation: [
			{
				state: "partial",
				row_ids: ["ROW-PLAN-COVERAGE"],
				task_ids: ["TASK-111"],
				evidence: "Only part of the row is covered.",
			},
		],
	});
	const partialPreflight = buildGatewayPreflight(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Partial residual needs owner trigger rationale.",
		source: partialResidualPlan.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(partialPreflight.status, "blocked");
	assert.ok(
		partialPreflight.missing.roadmap_reconciliation.some((entry) =>
			entry.includes("partial") && entry.includes("missing_owner"),
		),
	);
} finally {
	await rm(root, { recursive: true, force: true });
}
