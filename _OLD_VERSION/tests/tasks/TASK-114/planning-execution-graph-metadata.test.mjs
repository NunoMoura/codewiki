import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePlanningBuild } from "../../../src/build/writer.ts";
import { buildGraph } from "../../../src/state/graph.ts";
import { agencyExecutionGraphContext } from "../../../src/agency/planning.ts";

function projectFixture(root) {
	return {
		root,
		label: "task-114-fixture",
		config: {
			project_name: "task-114-fixture",
			schema_version: 4,
			codewiki: {
				agency: {
					level: "sprint",
					approval_cadence: "sprint",
					parallelism: { session_per_sprint: true, max_sessions: 3 },
					context_reset: { enabled: true, auto_pickup: true },
					stop_gates: ["validation_block", "artifact_conflict"],
				},
			},
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

function assertNoRoleKey(value, path = "root") {
	if (!value || typeof value !== "object") return;
	if (Array.isArray(value)) {
		value.forEach((item, index) => assertNoRoleKey(item, `${path}[${index}]`));
		return;
	}
	for (const [key, child] of Object.entries(value)) {
		assert.notEqual(
			key,
			"role",
			`${path}.${key} must not use role as metadata key`,
		);
		assert.notEqual(
			key,
			"roles",
			`${path}.${key} must not use roles as metadata key`,
		);
		assert.notEqual(
			key,
			"worker_role",
			`${path}.${key} must not use worker_role as metadata key`,
		);
		assertNoRoleKey(child, `${path}.${key}`);
	}
}

const root = await mkdtemp(join(tmpdir(), "codewiki-task-114-"));
const project = projectFixture(root);
const decisionPath =
	".codewiki/builds/decision/2026-06-07-role-free-dispatch.json";

try {
	const plan = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Plan role-free execution graph metadata.",
		source_decision_build: decisionPath,
		task_ids: ["TASK-114"],
		task_changes: ["TASK-114 owns role-free execution graph metadata."],
		decision_row_resolutions: [
			{
				row_id: "RCS-003-NO-CANONICAL-ROLES",
				resolution: "roadmap-task",
				task_ids: ["TASK-114"],
				evidence: "TASK-114 owns role-free execution graph metadata.",
			},
		],
		roadmap_reconciliation: [
			{
				state: "active-roadmap",
				row_ids: ["RCS-003-NO-CANONICAL-ROLES"],
				task_ids: ["TASK-114"],
				evidence: "Roadmap reviewed; TASK-114 is active owner.",
			},
		],
		execution_graph: {
			canonical_owner: "planning_build.trace",
			projection: "generated_read_model_only",
			work_units: [
				{
					id: "unit-task-114",
					task_id: "TASK-114",
					summary: "Implement role-free context-boundary metadata.",
					depends_on: ["TASK-113"],
					wave: "repair-wave-1",
					role: "validator",
					conflict_scopes: [{ layer: "code", path: "src/agency/planning.ts" }],
					lease_scopes: [{ layer: "code", path: "src/state/graph/**" }],
					required_gates: ["implementation", "task-close"],
					route_back_triggers: [
						{
							trigger: "semantic KB drift",
							target_loop: "decision",
							reason: "Decision owns semantic truth.",
						},
					],
					context_boundary: {
						reason: "context_bloat",
						expected_output: "implementation_build",
						graph_lens: "task",
						source_refs: [".codewiki/roadmap/tasks/TASK-114/context.json"],
						constraints: { max_tokens: 6000, role: "validator" },
						content_evidence_requirements: ["working_tree_digest"],
					},
					expected_output: "implementation_build",
					publication_serialization: {
						required: true,
						serialized_by: "implementation",
						queue: "publication-gate",
						reason: "Publication remains implementation-owned.",
						gates: ["ship-ready"],
					},
				},
			],
			dependencies: [
				{
					from: "TASK-113",
					to: "unit-task-114",
					reason:
						"File-structure accountability should precede dispatch metadata.",
				},
			],
			waves: [
				{
					id: "repair-wave-1",
					work_unit_ids: ["unit-task-114"],
					max_parallel: 1,
					required_gates: ["implementation"],
				},
			],
			conflict_scopes: [{ layer: "code", path: "src/agency/planning.ts" }],
			lease_plan: [
				{
					work_unit_id: "unit-task-114",
					mode: "write",
					reason: "Planning graph metadata touches agency and graph code.",
					scopes: [{ layer: "code", path: "src/state/graph/**" }],
				},
			],
			required_gates: ["implementation", "task-close"],
			route_back_triggers: [
				{
					trigger: "missing expected output",
					target_loop: "planning",
					reason: "Planning owns executable work decomposition.",
				},
			],
			context_boundaries: [
				{
					reason: "fresh_gate",
					expected_output: "gate_report",
					graph_lens: "validation",
					source_refs: [decisionPath],
				},
			],
			publication_serialization: {
				required: true,
				serialized_by: "implementation",
				queue: "publication-gate",
				reason: "Publication is serialized after implementation evidence.",
				gates: ["ship-ready"],
			},
		},
	});

	assert.equal(
		plan.data.execution_graph.canonical_owner,
		"planning_build.trace",
	);
	assert.equal(plan.data.execution_graph.durable_truth, false);
	assert.equal(
		plan.data.execution_graph.work_units[0].context_boundary.expected_output,
		"implementation_build",
	);
	assertNoRoleKey(plan.data.execution_graph);

	const task = {
		id: "TASK-114",
		title: "Encode role-free context-boundary execution graph metadata",
		status: "in_progress",
		priority: "medium",
		kind: "architecture",
		summary: "Fixture task.",
		spec_paths: [".codewiki/kb/system/trace-graph.md"],
		code_paths: ["src/agency/planning.ts", "src/state/graph/**"],
		research_ids: [],
		labels: ["role-free"],
	};
	const graph = buildGraph({
		project,
		docs: [],
		research: [],
		roadmapEntries: [task],
		roadmapSprints: [
			{ id: "SPRINT-025", task_ids: ["TASK-114"], status: "active" },
		],
		archivedTaskIds: [],
		gitCache: { getDirtyPaths: () => [] },
		builds: [
			{
				path: plan.path,
				kind: "planning_build",
				status: "accepted",
				data: plan.data,
			},
		],
		validations: [],
		lifecycleTraces: [],
		traceCatalog: null,
		testFiles: [
			"tests/tasks/TASK-114/planning-execution-graph-metadata.test.mjs",
		],
		claims: { version: 1, claims: [] },
		lintReport: { issues: [], counts: {}, status: "green" },
	});

	assert.equal(graph.views.execution_graph.durable_truth, false);
	assert.equal(graph.views.execution_graph.dispatch_axis, "context-boundary");
	assert.equal(graph.views.execution_graph.work_units[0].id, "unit-task-114");
	assert.equal(
		graph.views.execution_graph.work_units[0].pointer_ref,
		`${plan.path}#/execution_graph/work_units/0`,
	);
	assert.equal(
		graph.views.execution_graph.by_task["TASK-114"][0].id,
		"unit-task-114",
	);
	assert.equal(
		graph.views.lenses.runtime.data.execution_graph.durable_truth,
		false,
	);
	assert.equal(
		graph.views.lenses.task.data.execution_graph.selected_work_units[0].id,
		"unit-task-114",
	);
	assertNoRoleKey(graph.views.execution_graph);

	const agencyContext = agencyExecutionGraphContext(
		graph.views.execution_graph,
		["TASK-114"],
	);
	assert.equal(agencyContext.authorization_context_only, true);
	assert.equal(agencyContext.spawns_sessions, false);
	assert.equal(agencyContext.dispatch_axis, "context-boundary");
	assert.equal(agencyContext.selected_work_units[0].id, "unit-task-114");
	assertNoRoleKey(agencyContext);
} finally {
	await rm(root, { recursive: true, force: true });
}
