import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGraph } from "../../src/state/graph.ts";
import { readCodewikiState } from "../../src/state/reader.ts";
import { loadProject } from "../../src/project/context.ts";
import {
	buildControlRoomGraphModel,
	buildControlRoomStateModel,
} from "../../src/ui/web/control-room.ts";

const root = await mkdtemp(join(tmpdir(), "codewiki-graph-lenses-"));
const decisionPath =
	".codewiki/builds/decision/2026-05-20-compact-lens-decision.json";
const planningPath =
	".codewiki/builds/planning/2026-05-20-compact-lens-plan.json";
const oldImplementationPath =
	".codewiki/builds/implementation/2026-05-20-compact-lens-impl-old.json";
const implementationPath =
	".codewiki/builds/implementation/2026-05-20-compact-lens-impl.json";
const validationPath = ".codewiki/validation/2026-05-20-compact-lens-pass.json";
const checkedDigest = "sha256:graph-lens-working-tree";

try {
	await mkdir(join(root, ".codewiki"), { recursive: true });
	await writeFile(
		join(root, ".codewiki/config.json"),
		JSON.stringify(
			{
				project_name: "graph-lenses-smoke",
				schema_version: 4,
				docs_root: ".codewiki/kb",
			},
			null,
			2,
		),
	);
	const project = await loadProject(root);
	const docs = [
		{
			path: ".codewiki/kb/system/graph.md",
			title: "Graph",
			doc_type: "spec",
			links: [],
			code_paths: ["src/state/graph.ts", "src/state/reader.ts"],
			frontmatter: {},
		},
	];
	const task = {
		id: "TASK-100",
		title: "Simplify graph lenses",
		status: "todo",
		priority: "medium",
		kind: "architecture",
		summary: "Expose compact graph lens.",
		spec_paths: [".codewiki/kb/system/graph.md"],
		code_paths: ["src/state/graph.ts", "src/state/reader.ts"],
		research_ids: [],
		labels: [],
	};
	const missingTask = {
		...task,
		id: "TASK-101",
		title: "Missing semantic closure implementation",
		status: "todo",
		summary: "Fixture task without implementation evidence.",
	};
	const sprintSiblingTask = {
		...task,
		id: "TASK-102",
		title: "Sprint sibling outside row scope",
		status: "todo",
		summary: "Fixture task sharing a sprint but not a row task mapping.",
	};
	const decisionBuild = {
		path: decisionPath,
		kind: "decision_build",
		status: "accepted",
		data: {
			kind: "decision_build",
			lifecycle: { state: "accepted" },
			requirements: [
				{
					id: "REQ-LENS",
					text: "Default graph state groups evidence into five compact families.",
				},
			],
			diff_table: [
				{
					id: "ROW-LENS",
					current_state: "Raw graph nodes dominate status.",
					desired_state: "Compact lens rows are closure-reviewable.",
					user_action: "approved",
					affected_layers: ["system", "code"],
				},
				{
					id: "ROW-MISSING",
					current_state: "No closure gap fixture exists.",
					desired_state: "Missing row execution is visible.",
					user_action: "approved",
					affected_layers: ["task"],
				},
				{
					id: "ROW-REJECTED",
					current_state: "Rejected rows vanish.",
					desired_state: "Rejected rows are listed as excluded.",
					user_action: "rejected",
					affected_layers: ["task"],
				},
			],
			approved_diff_rows: ["ROW-LENS", "ROW-MISSING"],
			row_to_kb_mappings: [
				{
					row_id: "ROW-LENS",
					knowledge_refs: [".codewiki/kb/system/graph.md"],
					evidence: "Fixture maps row to system graph docs.",
				},
				{
					row_id: "ROW-MISSING",
					knowledge_refs: [".codewiki/kb/system/graph.md"],
					evidence:
						"Fixture maps missing row to docs but leaves execution open.",
				},
			],
			produces: {
				knowledge: [".codewiki/kb/system/graph.md"],
				roadmap: ["TASK-100", "TASK-101"],
			},
		},
	};
	const planningBuild = {
		path: planningPath,
		kind: "planning_build",
		status: "accepted",
		data: {
			kind: "planning_build",
			lifecycle: { state: "accepted" },
			source_decision_build: decisionPath,
			task_ids: ["TASK-100", "TASK-101", "TASK-102"],
			decision_row_resolutions: [
				{
					row_id: "ROW-LENS",
					resolution: "roadmap-task",
					task_ids: ["TASK-100"],
					sprint_ids: ["SPRINT-900"],
					evidence: "ROW-LENS implemented by TASK-100.",
				},
				{
					row_id: "ROW-MISSING",
					resolution: "roadmap-task",
					task_ids: ["TASK-101"],
					evidence: "ROW-MISSING is planned but not implemented.",
				},
			],
			produces: { roadmap: ["TASK-100", "TASK-101", "TASK-102"] },
		},
	};
	const oldImplementationBuild = {
		path: oldImplementationPath,
		kind: "implementation_build",
		taskId: "TASK-100",
		status: "accepted",
		data: {
			kind: "implementation_build",
			lifecycle: { state: "accepted" },
			source_planning_build: planningPath,
			task_id: "TASK-100",
			risks: ["Superseded risk should not pollute current closure."],
			closure_brief: {
				user_intent: "Old closure attempt.",
				implemented_changes: ["Old graph lens mapping."],
				acceptance_evidence: ["Old evidence."],
				checks: ["old smoke"],
				remaining_risks: ["Superseded closure risk."],
			},
		},
	};
	const implementationBuild = {
		path: implementationPath,
		kind: "implementation_build",
		taskId: "TASK-100",
		status: "accepted",
		data: {
			kind: "implementation_build",
			lifecycle: { state: "accepted" },
			cycle: { supersedes: [oldImplementationPath] },
			source_planning_build: planningPath,
			task_id: "TASK-100",
			produces: {
				code: ["src/state/graph.ts", "src/state/reader.ts"],
				tests: ["tests/smoke/graph-lenses.test.mjs"],
			},
			code_files: ["src/state/graph.ts", "src/state/reader.ts"],
			test_files: ["tests/smoke/graph-lenses.test.mjs"],
			closure_brief: {
				user_intent: "Expose compact graph lens closure evidence.",
				implemented_changes: ["Generated graph lens closure mapping."],
				acceptance_evidence: ["ROW-LENS maps through TASK-100 and validation."],
				checks: ["graph lenses smoke"],
			},
			audit_refs: ["audit:alignment"],
			validation_refs: [validationPath],
		},
	};
	const validationReport = {
		path: validationPath,
		taskId: "TASK-100",
		verdict: "pass",
		data: {
			profile: "implementation",
			verdict: "pass",
			source: implementationPath,
			audit_refs: ["audit:alignment"],
			isolation: {
				role: "validator",
				fresh_context: true,
				clean: false,
				working_tree_digest: checkedDigest,
			},
		},
	};

	const graph = buildGraph({
		project,
		docs,
		research: [],
		roadmapEntries: [task, missingTask, sprintSiblingTask],
		roadmapSprints: [{ id: "SPRINT-900", task_ids: ["TASK-100", "TASK-102"] }],
		archivedTaskIds: [],
		gitCache: { getDirtyPaths: () => [] },
		builds: [
			decisionBuild,
			planningBuild,
			oldImplementationBuild,
			implementationBuild,
		],
		validations: [validationReport],
		testFiles: ["tests/smoke/graph-lenses.test.mjs"],
		claims: { version: 1, claims: [] },
		lintReport: { issues: [], counts: {}, status: "green" },
	});

	const defaultLens = graph.views.lenses.default;
	assert.equal(defaultLens.source, "generated:graph-default-lens");
	assert.deepEqual(
		defaultLens.families.map((family) => family.id),
		["decision", "knowledge", "work", "execution", "proof"],
	);
	assert.equal(
		defaultLens.requirement_rows,
		undefined,
		"default lens must not inline trace requirement rows",
	);
	assert.ok(
		defaultLens.badges.builds.collapsed >= 3,
		"build internals collapse to default badges",
	);
	assert.ok(
		defaultLens.badges.validations.collapsed >= 1,
		"validation internals collapse to default badges",
	);
	assert.equal(
		graph.nodes.find((node) => node.id === `build:${implementationPath}`)
			?.default_collapsed,
		true,
	);
	assert.equal(
		graph.nodes.find((node) => node.id === `validation:${validationPath}`)
			?.default_collapsed,
		true,
	);

	const traceLens = graph.views.lenses.trace;
	assert.ok(
		traceLens.requirement_rows.some(
			(row) =>
				row.requirement_id === "REQ-LENS" &&
				row.implementation_builds.includes(implementationPath),
		),
		"trace lens should expand requirement/build refs",
	);
	assert.ok(
		traceLens.canonical_source_refs.includes(implementationPath),
		"trace lens should expose exact canonical source refs",
	);
	assert.ok(
		traceLens.build_refs.some(
			(row) =>
				row.path === implementationPath &&
				row.source_refs.includes("src/state/graph.ts"),
		),
		"trace lens should expand build source refs",
	);

	const auditLens = graph.views.lenses.audit;
	assert.ok(
		auditLens.validation_reports.some((row) => row.path === validationPath),
		"audit lens should expose validation reports",
	);
	assert.ok(
		auditLens.audit_evidence_refs.includes("audit:alignment"),
		"audit lens should expose audit evidence refs",
	);
	assert.ok(
		auditLens.content_proof_refs.includes(checkedDigest),
		"audit lens should expose content proof refs",
	);

	const closureReport = graph.views.semantic_execution_closure;
	assert.equal(
		closureReport.invariant.includes("generated_view_not_canonical_truth"),
		true,
		"closure report must be explicit generated evidence",
	);
	const completeRow = closureReport.rows.find(
		(row) => row.row_id === "ROW-LENS",
	);
	assert.deepEqual(
		completeRow.roadmap_task_ids,
		["TASK-100"],
		"closure row maps to planned task id",
	);
	assert.deepEqual(
		completeRow.implementation_builds,
		[implementationPath],
		"closure row maps only to the current implementation build",
	);
	assert.deepEqual(
		completeRow.remaining_risks,
		[],
		"superseded implementation risks should not pollute current closure",
	);
	assert.equal(
		completeRow.validation_reports[0].path,
		validationPath,
		"closure row maps to validation report",
	);
	assert.ok(
		completeRow.content_proof_refs.includes(checkedDigest),
		"closure row maps to content proof when available",
	);
	assert.deepEqual(
		completeRow.gaps,
		[],
		"complete row should not display gaps",
	);
	const missingRow = closureReport.rows.find(
		(row) => row.row_id === "ROW-MISSING",
	);
	assert.ok(
		missingRow.gaps.includes("missing_implementation_build"),
		"missing row should display execution gap",
	);
	assert.ok(
		closureReport.excluded_rows.some((row) => row.row_id === "ROW-REJECTED"),
		"rejected rows should be highlighted outside execution mapping",
	);
	assert.equal(
		closureReport.scopes.tasks["TASK-100"].status,
		"complete",
		"task scope can be cited for close review",
	);
	assert.ok(
		closureReport.scopes.tasks["TASK-101"].gaps.includes(
			"ROW-MISSING:missing_implementation_build",
		),
		"task scope displays missing gap",
	);
	assert.equal(
		closureReport.scopes.tasks["TASK-102"],
		undefined,
		"task-scoped row should not expand to every sibling task in its sprint",
	);
	assert.ok(
		closureReport.scopes.sprints["SPRINT-900"].row_ids.includes("ROW-LENS"),
		"sprint scope still cites rows carrying the sprint id",
	);
	assert.equal(
		traceLens.semantic_execution_closure.summary.approved_row_count,
		2,
		"trace lens exposes closure report",
	);
	assert.equal(
		auditLens.semantic_execution_closure.summary.gap_count,
		1,
		"audit lens exposes closure gaps",
	);

	await writeFile(
		project.graphPath,
		JSON.stringify(
			{
				...graph,
				lenses: {
					lint: {
						summary: {
							color: "green",
							errors: 0,
							warnings: 0,
							total_issues: 0,
						},
						counts: {},
						issues: [],
					},
					status: {
						health: { color: "green", errors: 0, warnings: 0, total: 0 },
						summary: {
							open_task_count: 1,
							unmapped_specs: 0,
							tracked_specs: 1,
							blocked_specs: 0,
						},
						next_step: {
							kind: "code",
							task_id: "TASK-100",
							reason: "continue",
						},
						roadmap: { open_task_count: 1 },
						parallel: {
							active_claim_count: 0,
							claim_warning_count: 0,
							claim_conflict_count: 0,
						},
					},
					roadmap: {
						version: 1,
						generated_at: "2026-05-20T00:00:00Z",
						summary: { open_count: 1 },
						views: {
							open_task_ids: ["TASK-100"],
							in_progress_task_ids: [],
							blocked_task_ids: [],
						},
						tasks: { "TASK-100": task },
					},
				},
			},
			null,
			2,
		),
	);

	const state = await readCodewikiState(
		project,
		{ include: ["graph", "trace", "audit"], taskId: undefined, refresh: false },
		{
			fileStore: {},
			rebuildRunner: { run: async () => {} },
			sessionStore: { getSessionBranch: () => [] },
		},
	);
	assert.equal(state.graph.source, "graph:default-lens");
	assert.equal(
		state.graph.node_count,
		5,
		"default state graph should report lens families, not raw graph nodes",
	);
	assert.deepEqual(
		state.graph.families.map((family) => family.id),
		["decision", "knowledge", "work", "execution", "proof"],
	);
	assert.ok(
		state.trace.requirement_rows.some(
			(row) => row.requirement_id === "REQ-LENS",
		),
		"state trace include should expose exact requirements",
	);
	assert.ok(
		state.audit.validation_reports.some((row) => row.path === validationPath),
		"state audit include should expose validation reports",
	);
	assert.ok(
		state.audit.content_proof_refs.includes(checkedDigest),
		"state audit include should expose content proof",
	);

	const uiGraph = await buildControlRoomGraphModel(project);
	assert.equal(
		uiGraph.nodes.filter((node) => node.kind === "lens_family").length,
		5,
		"Control Room graph should expose default lens family nodes",
	);
	assert.equal(
		uiGraph.nodes.some((node) => node.id === `validation:${validationPath}`),
		false,
		"non-next validation internals stay collapsed by default",
	);

	const uiState = await buildControlRoomStateModel(project);
	assert.equal(
		uiState.graph.nodes,
		5,
		"Control Room status count should use default lens families",
	);
	assert.equal(
		uiState.gates.closure_gaps,
		1,
		"Control Room state should expose semantic closure gap count",
	);
} finally {
	await rm(root, { recursive: true, force: true });
}

console.log("✓ graph lenses smoke passed");
