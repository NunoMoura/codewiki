import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeDecisionBuild, writePlanningBuild } from "../../../src/build/writer.ts";
import { buildGatewayPreflight, writeGatewayReport } from "../../../src/gateway/report.ts";
import { decisionTableFixture } from "../../decision-table-fixture.mjs";

const root = await mkdtemp(join(tmpdir(), "codewiki-task-107-planning-gate-"));

const project = {
	root,
	label: "task-107-planning-gate",
	config: {
		project_name: "task-107-planning-gate",
		schema_version: 4,
		specs_root: ".codewiki/kb",
		generated_files: [".codewiki/index_graph.json"],
	},
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

try {
	const decision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accept planning coverage enforcement fixture.",
		decision_table: decisionTableFixture([
			{
				id: "PLAN-COVERAGE",
				current_state: "Planning can map rows without checking existing roadmap.",
				desired_state:
					"Planning must map rows and record existing-roadmap reconciliation.",
				rationale: "TASK-107 regression fixture.",
				affected_layers: ["roadmap", "code"],
				user_action: "approved",
			},
		]),
		row_to_kb_mappings: [
			{
				row_id: "PLAN-COVERAGE",
				knowledge_refs: [".codewiki/kb/system/validation-gateway.md"],
				evidence: "Validation gateway docs capture planning coverage policy.",
			},
		],
		propagation: {
			direction: "system-first",
			product_impact: ["Agents see planning coverage findings."],
			downstream_planning_questions: [
				"Which roadmap work owns PLAN-COVERAGE?",
			],
		},
		knowledge_changes: [".codewiki/kb/system/validation-gateway.md"],
	});
	await writeGatewayReport(project, {
		profile: "decision",
		verdict: "pass",
		rationale: "Decision fixture passes.",
		source: decision.path,
		audit_refs: ["audit:alignment", "audit:stale-reference"],
	});

	const mappedWithoutReconciliation = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Map row/question without existing roadmap reconciliation.",
		source_decision_build: decision.path,
		decision_row_resolutions: [
			{
				row_id: "PLAN-COVERAGE",
				resolution: "roadmap-task",
				task_ids: ["TASK-900"],
				evidence: "TASK-900 implements planning coverage policy.",
				source_refs: ["TASK-900"],
			},
		],
		downstream_question_resolutions: [
			{
				question: "Which roadmap work owns PLAN-COVERAGE?",
				resolution: "roadmap-task",
				task_ids: ["TASK-900"],
				evidence: "TASK-900 is the owner.",
				source_refs: ["TASK-900"],
			},
		],
	});
	const missing = buildGatewayPreflight(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Row/question mappings alone are insufficient.",
		source: mappedWithoutReconciliation.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(missing.status, "blocked");
	assert.deepEqual(missing.missing.decision_propagation, []);
	assert.ok(
		missing.missing.roadmap_reconciliation.some((entry) =>
			entry.includes("missing_evidence"),
		),
	);
	assert.equal(missing.routing.failure_class, "planning_gap");
	assert.equal(missing.routing.recommended_next_loop, "planning");
	const missingReport = await writeGatewayReport(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Written report routes roadmap reconciliation remediation.",
		source: mappedWithoutReconciliation.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(missingReport.data.verdict, "block");
	assert.ok(missingReport.data.failed_criteria.includes("roadmap_reconciliation"));
	assert.equal(missingReport.data.recommended_next_loop, "planning");

	const mappedWithReconciliation = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Map row/question with existing roadmap reconciliation.",
		source_decision_build: decision.path,
		decision_row_resolutions: [
			{
				row_id: "PLAN-COVERAGE",
				resolution: "roadmap-task",
				task_ids: ["TASK-900"],
				evidence: "TASK-900 implements planning coverage policy.",
				source_refs: ["TASK-900"],
			},
		],
		downstream_question_resolutions: [
			{
				question: "Which roadmap work owns PLAN-COVERAGE?",
				resolution: "roadmap-task",
				task_ids: ["TASK-900"],
				evidence: "TASK-900 is the owner.",
				source_refs: ["TASK-900"],
			},
		],
		roadmap_reconciliation: [
			{
				status: "reviewed",
				evidence:
					"Existing roadmap reviewed; TASK-900 is the single owner and no duplicate task is needed.",
				task_ids: ["TASK-900"],
			},
		],
	});
	const ready = buildGatewayPreflight(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Complete planning coverage can pass.",
		source: mappedWithReconciliation.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(ready.status, "ready");
	assert.deepEqual(ready.missing.decision_propagation, []);
	assert.deepEqual(ready.missing.roadmap_reconciliation, []);
} finally {
	await rm(root, { recursive: true, force: true });
}

console.log("✓ TASK-107 planning coverage gate test passed");
