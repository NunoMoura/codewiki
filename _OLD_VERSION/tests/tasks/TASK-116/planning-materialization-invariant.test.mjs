import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	writeDecisionBuild,
	writePlanningBuild,
} from "../../../src/build/writer.ts";
import {
	buildGatewayPreflight,
	writeGatewayReport,
} from "../../../src/gateway/report.ts";

function projectFixture(root) {
	return {
		root,
		label: "task-116-fixture",
		config: {
			project_name: "task-116-fixture",
			schema_version: 4,
			specs_root: ".codewiki/kb",
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
}

async function seedRoadmap(root) {
	await mkdir(join(root, ".codewiki/roadmap"), { recursive: true });
	await writeFile(
		join(root, ".codewiki/roadmap/queue.json"),
		JSON.stringify(
			{
				version: 1,
				order: ["TASK-900", "TASK-901"],
				tasks: {
					"TASK-900": {
						id: "TASK-900",
						title: "Durable blocked runtime owner",
						status: "blocked",
						priority: "high",
						labels: ["runtime", "materialization"],
					},
					"TASK-901": {
						id: "TASK-901",
						title: "Ordered last runtime work",
						status: "todo",
						priority: "medium",
						labels: ["runtime", "materialization"],
					},
				},
				sprints: {
					"SPRINT-900": {
						id: "SPRINT-900",
						title: "Materialization fixture sprint",
						status: "active",
						task_ids: ["TASK-900", "TASK-901"],
					},
				},
				views: { sprint_ids: ["SPRINT-900"] },
			},
			null,
			2,
		) + "\n",
		"utf8",
	);
}

async function writeDecision(project, { summary, rows, questions = [] }) {
	const planningQuestions = questions.length
		? questions
		: rows.map((row) => `Plan accepted work for ${row.id}.`);
	const decision = await writeDecisionBuild(project, {
		kind: "decision",
		summary,
		decision_table: rows.map((row) => ({
			id: row.id,
			current_state: row.current_state ?? "Current fixture state.",
			desired_state: row.desired_state,
			agreed_change: row.desired_state,
			expected_final_state: row.desired_state,
			rationale: row.rationale ?? "Fixture row needs planning propagation.",
			affected_layers: row.affected_layers ?? [],
			user_action: "approved",
		})),
		approved_decision_rows: rows.map((row) => row.id),
		row_to_kb_mappings: rows.map((row) => ({
			row_id: row.id,
			knowledge_refs: [".codewiki/kb/system/validation-gateway.md"],
			evidence: `${row.id} is represented in accepted fixture knowledge.`,
		})),
		propagation: {
			direction: "system-first",
			no_product_impact:
				"Fixture only validates planning materialization semantics.",
			downstream_planning_questions: planningQuestions,
		},
		knowledge_changes: [".codewiki/kb/system/validation-gateway.md"],
		non_goals: [
			"Do not implement source changes during decision fixture setup.",
		],
		risks: [
			"Fixture risk: planning materialization handoff can be under-specified.",
		],
	});
	await writeGatewayReport(project, {
		profile: "decision",
		verdict: "pass",
		rationale: "Decision fixture validated.",
		source: decision.path,
		audit_refs: ["audit:alignment", "audit:stale-reference"],
		checks: ["fixture decision rows approved"],
	});
	return decision;
}

function planningPreflight(project, plan) {
	return buildGatewayPreflight(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Planning materialization invariant fixture.",
		source: plan.path,
		audit_refs: ["audit:alignment"],
	});
}

const root = await mkdtemp(join(tmpdir(), "codewiki-task-116-"));
const project = projectFixture(root);

try {
	await seedRoadmap(root);

	const missingDecision = await writeDecision(project, {
		summary: "Accept executable row that must not become build-only deferral.",
		rows: [
			{
				id: "EXEC-BUILD-ONLY",
				desired_state:
					"Runtime scheduling code changes are planned as visible executable work.",
				affected_layers: ["runtime", "code"],
			},
		],
		questions: ["Which roadmap task owns the runtime scheduler code change?"],
	});
	const buildOnlyDeferral = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Defer executable row without roadmap ownership.",
		source_decision_build: missingDecision.path,
		decision_row_resolutions: [
			{
				row_id: "EXEC-BUILD-ONLY",
				resolution: "deferred",
				owner: "runtime-maintainers",
				trigger: "later scheduling window",
				rationale: "Ordered later but not materialized.",
				evidence:
					"Build-only deferral has owner metadata but no task, sprint, or work-unit id.",
				source_refs: [missingDecision.path],
			},
		],
		downstream_question_resolutions: [
			{
				question: "Which roadmap task owns the runtime scheduler code change?",
				resolution: "deferred",
				owner: "runtime-maintainers",
				trigger: "later scheduling window",
				rationale: "Question answer is ordered later but not materialized.",
				evidence:
					"Executable downstream question has owner metadata but no task, sprint, or work-unit id.",
				source_refs: [missingDecision.path],
			},
		],
		roadmap_reconciliation: [
			{
				status: "reviewed",
				evidence: "Roadmap was reviewed but no durable owner was recorded.",
				rationale:
					"Queue and sprint order unchanged despite executable accepted work.",
			},
		],
	});
	const buildOnlyPreflight = planningPreflight(project, buildOnlyDeferral);
	assert.equal(buildOnlyPreflight.status, "blocked");
	assert.ok(
		buildOnlyPreflight.missing.decision_propagation.some(
			(entry) =>
				entry.includes("EXEC-BUILD-ONLY") &&
				entry.includes("executable_requires_task_or_sprint"),
		),
		"executable build-only deferral must block planning pass",
	);
	assert.ok(
		buildOnlyPreflight.missing.decision_propagation.some(
			(entry) =>
				entry.includes("question:Q1") &&
				entry.includes("executable_requires_task_or_sprint"),
		),
		"executable downstream question deferral must block planning pass",
	);

	const blockedDecision = await writeDecision(project, {
		summary: "Accept executable row that is blocked but roadmap-owned.",
		rows: [
			{
				id: "EXEC-BLOCKED-OWNED",
				desired_state:
					"Validation gateway code change is blocked but owned by visible roadmap work.",
				affected_layers: ["validation", "code"],
			},
		],
	});
	const blockedOwnedPlan = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Map blocked executable row to roadmap ownership.",
		source_decision_build: blockedDecision.path,
		task_ids: ["TASK-900"],
		decision_row_resolutions: [
			{
				row_id: "EXEC-BLOCKED-OWNED",
				resolution: "blocked",
				task_ids: ["TASK-900"],
				sprint_ids: ["SPRINT-900"],
				owner: "TASK-900",
				trigger: "upstream dependency clears",
				rationale: "Blocked work remains visible in queue and sprint scope.",
				evidence: "TASK-900 owns the blocked executable accepted row.",
				source_refs: ["TASK-900", blockedDecision.path],
			},
		],
		roadmap_reconciliation: [
			{
				status: "reviewed",
				evidence:
					"Existing roadmap reviewed; TASK-900 remains blocked owner in SPRINT-900 and TASK-901 stays ordered last.",
				task_ids: ["TASK-900", "TASK-901"],
				sprint_ids: ["SPRINT-900"],
				rationale:
					"Blocked work stays before TASK-901 because dependency order prevents execution now.",
			},
		],
	});
	const blockedOwnedPreflight = planningPreflight(project, blockedOwnedPlan);
	assert.equal(blockedOwnedPreflight.status, "ready");
	assert.deepEqual(blockedOwnedPreflight.missing.decision_propagation, []);

	const workUnitDecision = await writeDecision(project, {
		summary: "Accept executable row that is owned by a planning work unit.",
		rows: [
			{
				id: "EXEC-WORK-UNIT",
				desired_state:
					"Runtime worker update is decomposed into explicit planning work-unit ownership.",
				affected_layers: ["runtime", "worker", "code"],
			},
		],
	});
	const workUnitPlan = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Map executable row to work-unit ownership.",
		source_decision_build: workUnitDecision.path,
		decision_row_resolutions: [
			{
				row_id: "EXEC-WORK-UNIT",
				resolution: "deferred",
				work_unit_ids: ["WU-RUNTIME-1"],
				owner: "runtime-maintainers",
				trigger: "SPRINT-900 wave opens",
				rationale:
					"Work is ordered last but still has execution graph ownership.",
				evidence: "WU-RUNTIME-1 owns the executable row until the wave opens.",
				source_refs: [workUnitDecision.path],
			},
		],
		execution_graph: {
			work_units: [
				{
					id: "WU-RUNTIME-1",
					task_id: "TASK-901",
					summary:
						"Implement runtime worker update after current blocker clears.",
					wave: "last",
				},
			],
			waves: [
				{
					id: "last",
					summary: "Ordered after blocked TASK-900 work.",
					work_unit_ids: ["WU-RUNTIME-1"],
				},
			],
		},
		roadmap_reconciliation: [
			{
				status: "reviewed",
				evidence:
					"Existing roadmap reviewed; TASK-900 remains first and WU-RUNTIME-1 keeps executable work visible under TASK-901.",
				task_ids: ["TASK-900", "TASK-901"],
				sprint_ids: ["SPRINT-900"],
				work_unit_ids: ["WU-RUNTIME-1"],
				rationale:
					"Queue order keeps TASK-901 after TASK-900 while retaining work-unit ownership.",
			},
		],
	});
	const workUnitPreflight = planningPreflight(project, workUnitPlan);
	assert.equal(workUnitPreflight.status, "ready");
	assert.deepEqual(workUnitPreflight.missing.decision_propagation, []);
	assert.deepEqual(workUnitPlan.data.decision_coverage[0].work_unit_ids, [
		"WU-RUNTIME-1",
	]);

	const noWorkDecision = await writeDecision(project, {
		summary: "Accept knowledge-only, no-work, and already-landed rows.",
		rows: [
			{
				id: "KNOWLEDGE-ONLY",
				desired_state: "Knowledge text states the accepted target.",
				affected_layers: ["knowledge"],
			},
			{
				id: "NO-WORK",
				desired_state: "Accepted target already needs no further action.",
				affected_layers: ["knowledge"],
			},
			{
				id: "ALREADY-IMPLEMENTED",
				desired_state:
					"Gateway code already implements the accepted executable target.",
				affected_layers: ["gateway", "code"],
			},
		],
	});
	const noWorkPlan = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Resolve knowledge-only, no-work, and already-landed rows.",
		source_decision_build: noWorkDecision.path,
		decision_row_resolutions: [
			{
				row_id: "KNOWLEDGE-ONLY",
				resolution: "knowledge-only",
				knowledge_refs: [".codewiki/kb/system/validation-gateway.md"],
				evidence: "Knowledge document already owns the accepted row.",
				source_refs: [noWorkDecision.path],
			},
			{
				row_id: "NO-WORK",
				resolution: "no-work",
				evidence: "No executable work is needed for this accepted row.",
				source_refs: [noWorkDecision.path],
			},
			{
				row_id: "ALREADY-IMPLEMENTED",
				resolution: "already-implemented",
				evidence:
					"Existing gateway source already proves the accepted executable target landed.",
				source_refs: ["src/gateway/report.ts", noWorkDecision.path],
			},
		],
		roadmap_reconciliation: [
			{
				status: "reviewed",
				evidence:
					"Existing roadmap reviewed; TASK-900, TASK-901, and SPRINT-900 need no queue change for knowledge-only, no-work, and already-landed rows.",
				task_ids: ["TASK-900", "TASK-901"],
				sprint_ids: ["SPRINT-900"],
				rationale:
					"No queue or sprint reorder is needed because no executable work remains.",
			},
		],
	});
	const noWorkPreflight = planningPreflight(project, noWorkPlan);
	assert.equal(noWorkPreflight.status, "ready");
	assert.deepEqual(noWorkPreflight.missing.decision_propagation, []);
	assert.equal(
		noWorkPlan.data.decision_coverage.find(
			(entry) => entry.row_id === "ALREADY-IMPLEMENTED",
		)?.state,
		"already-implemented",
	);

	const routeBackDecision = await writeDecision(project, {
		summary:
			"Accept executable row that routes back without roadmap ownership.",
		rows: [
			{
				id: "EXEC-ROUTE-BACK",
				desired_state:
					"Runtime code change needs a clarified semantic decision before implementation.",
				affected_layers: ["runtime", "code"],
			},
		],
	});
	const routeBackPlan = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Route executable row back without durable ownership.",
		source_decision_build: routeBackDecision.path,
		decision_row_resolutions: [
			{
				row_id: "EXEC-ROUTE-BACK",
				resolution: "route-back",
				evidence:
					"Planning found the semantic target unclear and routed it back without roadmap ownership.",
				source_refs: [routeBackDecision.path],
			},
		],
		roadmap_reconciliation: [
			{
				status: "reviewed",
				evidence:
					"Existing roadmap reviewed; no owner was created for the route-back blocker.",
				rationale:
					"Queue order cannot be reconciled until a durable owner or accepted semantic correction exists.",
			},
		],
	});
	const routeBackPreflight = planningPreflight(project, routeBackPlan);
	assert.equal(routeBackPreflight.status, "blocked");
	assert.ok(
		routeBackPreflight.missing.decision_propagation.some(
			(entry) =>
				entry.includes("EXEC-ROUTE-BACK") &&
				entry.includes("executable_requires_task_or_sprint"),
		),
		"executable route-back blocker still needs durable roadmap ownership",
	);

	const reorderDecision = await writeDecision(project, {
		summary: "Accept executable row that needs reorder rationale.",
		rows: [
			{
				id: "EXEC-REORDER",
				desired_state:
					"Gateway code update is inserted into existing queue order.",
				affected_layers: ["gateway", "code", "roadmap"],
			},
		],
	});
	const missingReorderRationalePlan = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Map executable row without reorder rationale.",
		source_decision_build: reorderDecision.path,
		task_ids: ["TASK-901"],
		decision_row_resolutions: [
			{
				row_id: "EXEC-REORDER",
				resolution: "roadmap-task",
				task_ids: ["TASK-901"],
				evidence: "TASK-901 owns the executable row.",
				source_refs: ["TASK-901", reorderDecision.path],
			},
		],
		roadmap_reconciliation: [
			{
				status: "reviewed",
				evidence: "Existing roadmap reviewed; TASK-901 owns the accepted row.",
				task_ids: ["TASK-901"],
			},
		],
	});
	const missingReorderPreflight = planningPreflight(
		project,
		missingReorderRationalePlan,
	);
	assert.equal(missingReorderPreflight.status, "blocked");
	assert.ok(
		missingReorderPreflight.missing.roadmap_reconciliation.some((entry) =>
			entry.includes("missing_reorder_rationale"),
		),
		"planning gate should require queue/sprint-wave reorder rationale",
	);
} finally {
	await rm(root, { recursive: true, force: true });
}

console.log("✓ TASK-116 planning materialization invariant test passed");
