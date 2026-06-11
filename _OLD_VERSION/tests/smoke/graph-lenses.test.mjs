import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGraph } from "../../src/state/graph.ts";
import { readCodewikiState } from "../../src/state/reader.ts";
import { loadProject } from "../../src/project/context.ts";
import { decisionTableFixture } from "../decision-table-fixture.mjs";

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
	await mkdir(join(root, ".codewiki/roadmap"), { recursive: true });
	await writeFile(
		join(root, ".codewiki/roadmap/queue.json"),
		JSON.stringify(
			{
				version: 1,
				updated: "2026-05-20T00:00:00Z",
				order: ["TASK-100", "TASK-101", "TASK-102"],
				tasks: {
					"TASK-100": task,
					"TASK-101": missingTask,
					"TASK-102": sprintSiblingTask,
				},
				sprints: {
					"SPRINT-900": {
						id: "SPRINT-900",
						title: "Lens sprint",
						status: "active",
						outcome: "Exercise focused graph lenses.",
						task_ids: ["TASK-100", "TASK-102"],
						gates: ["implementation"],
					},
				},
			},
			null,
			2,
		),
	);

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
			decision_table: decisionTableFixture([
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
					id: "ROW-UNMAPPED",
					current_state: "Unmapped rows are not visible.",
					desired_state: "Unmapped planning coverage is reported.",
					user_action: "approved",
					affected_layers: ["code"],
				},
				{
					id: "ROW-DEFERRED",
					current_state: "No-code planning deferral is hidden.",
					desired_state: "No-code deferred planning state is visible.",
					user_action: "approved",
					affected_layers: ["knowledge"],
				},
				{
					id: "ROW-NOWORK",
					current_state: "No-work decisions look unmapped.",
					desired_state: "No-work decisions are explicitly classified.",
					user_action: "approved",
					affected_layers: ["knowledge"],
				},
				{
					id: "ROW-REJECTED",
					current_state: "Rejected rows vanish.",
					desired_state: "Rejected rows are listed as excluded.",
					user_action: "rejected",
					affected_layers: ["task"],
				},
			]),
			approved_decision_rows: [
				"ROW-LENS",
				"ROW-MISSING",
				"ROW-UNMAPPED",
				"ROW-DEFERRED",
				"ROW-NOWORK",
			],
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
				{
					row_id: "ROW-UNMAPPED",
					knowledge_refs: [".codewiki/kb/system/graph.md"],
					evidence:
						"Fixture maps unmapped row to docs but leaves planning coverage open.",
				},
				{
					row_id: "ROW-DEFERRED",
					knowledge_refs: [".codewiki/kb/system/graph.md"],
					evidence: "Fixture maps deferred row to docs.",
				},
				{
					row_id: "ROW-NOWORK",
					knowledge_refs: [".codewiki/kb/system/graph.md"],
					evidence: "Fixture maps no-work row to docs.",
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
				{
					row_id: "ROW-DEFERRED",
					resolution: "deferred",
					owner: "maintainers",
					trigger: "future graph UI work",
					rationale:
						"No-code trace labeling is deferred until UI work resumes.",
					evidence: "ROW-DEFERRED has an accepted no-code deferral.",
				},
				{
					row_id: "ROW-NOWORK",
					resolution: "non-executable",
					knowledge_refs: [".codewiki/kb/system/graph.md"],
					evidence: "ROW-NOWORK needs no roadmap work.",
				},
			],
			decision_coverage: [
				{
					row_id: "ROW-LENS",
					status: "implemented",
					task_ids: ["TASK-100"],
					evidence: "Planning records ROW-LENS as implemented by TASK-100.",
				},
				{
					row_id: "ROW-MISSING",
					status: "active-roadmap",
					task_ids: ["TASK-101"],
					evidence: "Planning records ROW-MISSING as active roadmap work.",
				},
			],
			roadmap_reconciliation: [
				{
					status: "replanned",
					task_ids: ["TASK-100", "TASK-101"],
					evidence:
						"Existing roadmap work was replanned into TASK-100 and TASK-101.",
				},
				{
					status: "superseded",
					task_ids: ["TASK-102"],
					evidence: "Sprint sibling TASK-102 is superseded by TASK-100 scope.",
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
	const tracePath = ".codewiki/telemetry/TRACE-graph-lens.json";
	const lifecycleTrace = {
		schema_version: 1,
		trace_id: "TRACE-graph-lens",
		title: "Graph lens trace",
		summary: "Trace-primary projection fixture.",
		lifecycle: {
			status: "active",
			active_loops: [
				{
					loop: "implementation",
					run_id: "RUN-graph-lens",
					state: "active",
					next_action: "Validate graph projection.",
				},
			],
			blockers: [{ severity: "medium", summary: "Fixture blocker." }],
			next_safe_actions: ["Validate graph projection."],
		},
		relations: [
			{
				target_trace: "TRACE-cold-graph-lens",
				rel: "follow_up_to",
				state: "active",
			},
		],
		scope: {
			task_refs: ["TASK-100"],
			sprint_refs: ["SPRINT-900"],
			knowledge_refs: [".codewiki/kb/system/graph.md"],
			source_refs: ["src/state/graph.ts"],
			test_refs: ["tests/smoke/graph-lenses.test.mjs"],
			gate_refs: [validationPath],
			path_scopes: ["src/state/**"],
		},
		decision: { status: "approved" },
		planning: {
			status: "gate_passed",
			decision_coverage: [
				{
					row_id: "ROW-LENS",
					status: "implemented",
					task_ids: ["TASK-100"],
					evidence: "Trace records ROW-LENS planning coverage.",
				},
			],
			roadmap_reconciliation: [
				{
					status: "replanned",
					task_ids: ["TASK-100"],
					evidence: "Trace records existing roadmap reconciliation.",
				},
			],
		},
		implementation: {
			status: "active",
			code_refs: ["src/state/graph.ts"],
			test_refs: ["tests/smoke/graph-lenses.test.mjs"],
			gate_history: [{ ref: validationPath, kind: "gate_attestation" }],
			publication: { mode: "off", status: "not_configured" },
		},
		accountability: {
			content_proofs: [{ ref: checkedDigest, kind: "content_digest" }],
		},
	};
	const traceCatalog = {
		schema_version: 1,
		updated_at: "2026-05-20T00:00:00Z",
		entries: [
			{
				trace_id: "TRACE-cold-graph-lens",
				title: "Cold graph lens trace",
				summary: "Cold trace projection fixture.",
				lifecycle_status: "closed",
				task_refs: ["TASK-100"],
				source_refs: ["src/state/reader.ts"],
				path_scopes: ["src/state/**"],
				relations: [
					{
						target_trace: "TRACE-graph-lens",
						rel: "depends_on",
						state: "satisfied",
					},
				],
				restore: {
					original_path: ".codewiki/telemetry/TRACE-cold-graph-lens.json",
					commit_sha: "abc123",
					tree_sha: "def456",
					content_digest: "sha256:cold-trace",
				},
			},
		],
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
		lifecycleTraces: [{ path: tracePath, data: lifecycleTrace }],
		traceCatalog: {
			path: ".codewiki/telemetry/catalog.json",
			data: traceCatalog,
		},
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
	const traceDag = graph.views.trace_dag;
	assert.equal(traceDag.source, "generated:trace-dag-projection");
	assert.equal(traceDag.trace_count, 2, "hot and cold traces should project");
	assert.equal(
		traceDag.status.active_trace_ids.includes("TRACE-graph-lens"),
		true,
		"status projection includes active traces",
	);
	assert.equal(
		traceDag.decision_queue[0].trace_id,
		"TRACE-graph-lens",
		"decision queue projects open decision work",
	);
	assert.ok(
		traceDag.lineage.some(
			(row) =>
				row.from_trace === "TRACE-graph-lens" &&
				row.to_trace === "TRACE-cold-graph-lens" &&
				row.rel === "follow_up_to",
		),
		"lineage projects semantic trace relations",
	);
	assert.ok(
		traceDag.task["TASK-100"].some(
			(row) => row.trace_id === "TRACE-graph-lens",
		),
		"task index projects trace refs",
	);
	assert.ok(
		traceDag.path["src/state/**"].some(
			(row) => row.trace_id === "TRACE-cold-graph-lens" && row.cold === true,
		),
		"path index projects cold catalog refs",
	);
	assert.ok(
		traceDag.path["src/state/**"]
			.find((row) => row.trace_id === "TRACE-cold-graph-lens")
			.pointer_ref.startsWith(
				"git:abc123:.codewiki/telemetry/TRACE-cold-graph-lens.json#",
			),
		"cold catalog pointers use git commit restore refs",
	);
	assert.equal(
		traceDag.runtime.durable_truth,
		false,
		"runtime projection remains hot coordination input, not durable trace truth",
	);
	assert.equal(
		traceDag.status.active_trace_ids.some((trace) => trace.kind === "trace"),
		false,
		"trace-primary records must not expose redundant kind:trace identity",
	);
	assert.deepEqual(
		traceDag.deferred_views,
		[],
		"required trace-primary views are implemented in this slice",
	);
	assert.equal(
		graph.views.lenses.status.data.trace_dag.active_trace_ids.includes(
			"TRACE-graph-lens",
		),
		true,
		"status lens consumes trace DAG projection",
	);
	assert.equal(
		graph.views.lenses.resume.data.trace_dag.active_traces[0].pointer_refs
			.decision,
		`${tracePath}#/decision`,
		"resume lens exposes exact JSON pointer refs",
	);
	assert.equal(
		traceLens.trace_dag,
		traceDag,
		"trace lens exposes trace-DAG projection by ref",
	);
	assert.ok(
		traceDag.planning_coverage.decision_coverage.some(
			(row) =>
				row.trace_id === "TRACE-graph-lens" &&
				row.row_id === "ROW-LENS" &&
				row.pointer_ref === `${tracePath}#/planning/decision_coverage/0`,
		),
		"trace DAG preserves planning decision_coverage rows with pointer refs",
	);
	assert.ok(
		traceDag.planning_coverage.roadmap_reconciliation.some(
			(row) =>
				row.trace_id === "TRACE-graph-lens" &&
				row.pointer_ref === `${tracePath}#/planning/roadmap_reconciliation/0`,
		),
		"trace DAG preserves planning roadmap_reconciliation rows with pointer refs",
	);

	const auditLens = graph.views.lenses.audit;
	assert.ok(
		auditLens.validation_reports.some((row) => row.path === validationPath),
		"gate-evidence lens should expose gate reports",
	);
	assert.ok(
		auditLens.audit_evidence_refs.includes("audit:alignment"),
		"gate-evidence lens should expose linter evidence refs",
	);
	assert.ok(
		auditLens.content_proof_refs.includes(checkedDigest),
		"gate-evidence lens should expose content evidence refs",
	);

	for (const lensId of [
		"status",
		"resume",
		"task",
		"sprint",
		"validation",
		"runtime",
		"automation-readiness",
	]) {
		const lens = graph.views.lenses[lensId];
		assert.equal(lens.id, lensId, `${lensId} lens should be addressable`);
		assert.ok(
			Array.isArray(lens.source_refs) && lens.source_refs.length > 0,
			`${lensId} lens should expose source refs`,
		);
		assert.equal(
			typeof lens.omitted_counts,
			"object",
			`${lensId} lens should expose omitted counts`,
		);
		assert.equal(
			typeof lens.next_safe_action,
			"object",
			`${lensId} lens should expose next safe action`,
		);
		assert.ok(Array.isArray(lens.blockers), `${lensId} blockers are explicit`);
		assert.equal(
			lens.freshness.status,
			"fresh",
			`${lensId} lens should expose freshness metadata`,
		);
		assert.ok(
			Array.isArray(lens.expansion_hints) && lens.expansion_hints.length > 0,
			`${lensId} lens should expose expansion hints`,
		);
	}
	assert.ok(
		graph.views.lenses.status.data.open_task_count >= 2,
		"status lens summarizes work instead of dumping graph nodes",
	);
	assert.ok(
		graph.views.lenses.validation.data.validation_reports.some(
			(row) => row.path === validationPath,
		),
		"validation lens exposes compact validation subset",
	);
	assert.equal(
		typeof graph.views.lenses["automation-readiness"].data.ready,
		"boolean",
		"automation readiness lens should expose a deterministic readiness signal",
	);

	const planningCoverage = graph.views.planning_coverage;
	assert.equal(
		planningCoverage.summary.residual_count,
		1,
		"planning coverage reports unmapped accepted rows/questions",
	);
	assert.ok(
		planningCoverage.decision_coverage.some(
			(row) => row.id === "ROW-LENS" && row.state === "implemented",
		),
		"planning coverage distinguishes implemented decision rows",
	);
	assert.ok(
		planningCoverage.decision_coverage.some(
			(row) => row.id === "ROW-MISSING" && row.state === "active-roadmap",
		),
		"planning coverage distinguishes active roadmap coverage",
	);
	assert.ok(
		planningCoverage.decision_coverage.some(
			(row) => row.id === "ROW-DEFERRED" && row.state === "deferred",
		),
		"planning coverage distinguishes deferred rows",
	);
	assert.ok(
		planningCoverage.decision_coverage.some(
			(row) => row.id === "ROW-NOWORK" && row.state === "no-work",
		),
		"planning coverage distinguishes no-work rows",
	);
	assert.ok(
		planningCoverage.roadmap_reconciliation.some(
			(row) =>
				row.state === "superseded" && row.roadmap_task_ids.includes("TASK-102"),
		),
		"planning coverage preserves superseded roadmap reconciliation state",
	);
	assert.ok(
		planningCoverage.roadmap_reconciliation.some(
			(row) =>
				row.state === "replanned" && row.roadmap_task_ids.includes("TASK-100"),
		),
		"planning coverage preserves replanned roadmap reconciliation state",
	);
	assert.equal(
		traceLens.planning_coverage,
		planningCoverage,
		"trace lens exposes planning coverage by ref",
	);
	assert.equal(
		auditLens.planning_coverage.summary.residual_count,
		1,
		"gate-evidence lens reports planning coverage gaps",
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
		5,
		"trace lens exposes closure report",
	);
	assert.equal(
		auditLens.semantic_execution_closure.summary.gap_count,
		2,
		"gate-evidence lens exposes closure gaps",
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
		"state gate-evidence include should expose gate reports",
	);
	assert.ok(
		state.audit.content_proof_refs.includes(checkedDigest),
		"state gate-evidence include should expose content evidence",
	);

	const ports = {
		fileStore: {},
		rebuildRunner: { run: async () => {} },
		sessionStore: { getSessionBranch: () => [] },
	};
	const statusState = await readCodewikiState(
		project,
		{ include: ["summary"], taskId: undefined, refresh: false, lens: "status" },
		ports,
	);
	assert.equal(statusState.lens.id, "status");
	assert.ok(statusState.lens.source_refs.includes(project.roadmapPath));
	assert.ok(statusState.lens.freshness.generated_at);
	assert.ok(Array.isArray(statusState.lens.expansion_hints));
	assert.equal(typeof statusState.lens.next_safe_action, "object");
	assert.equal(typeof statusState.lens.omitted_counts, "object");

	const traceState = await readCodewikiState(
		project,
		{
			include: ["summary"],
			taskId: undefined,
			refresh: false,
			view: "trace",
			ref: "REQ-LENS",
		},
		ports,
	);
	assert.equal(traceState.lens.id, "trace");
	assert.ok(
		traceState.lens.data.requirement_rows.some(
			(row) => row.requirement_id === "REQ-LENS",
		),
		"trace lens read should honor ref focus",
	);

	const taskState = await readCodewikiState(
		project,
		{
			include: ["summary"],
			taskId: "TASK-100",
			refresh: false,
			lens: "task",
		},
		ports,
	);
	assert.equal(taskState.lens.data.focus_task_id, "TASK-100");
	assert.equal(taskState.lens.data.task.id, "TASK-100");

	const sprintState = await readCodewikiState(
		project,
		{
			include: ["summary"],
			taskId: undefined,
			refresh: false,
			lens: "sprint",
			focus: { sprintId: "SPRINT-900" },
		},
		ports,
	);
	assert.equal(sprintState.lens.data.focus_sprint_id, "SPRINT-900");
	assert.ok(
		sprintState.lens.data.tasks.some((row) => row.id === "TASK-100"),
		"sprint lens should expose focused sprint tasks",
	);

	const validationState = await readCodewikiState(
		project,
		{
			include: ["summary"],
			taskId: undefined,
			refresh: false,
			lens: "validation",
		},
		ports,
	);
	assert.ok(
		validationState.lens.data.recent_reports.some(
			(row) => row.path === validationPath,
		),
		"validation lens read exposes compact validation reports",
	);

	const runtimeState = await readCodewikiState(
		project,
		{
			include: ["summary"],
			taskId: undefined,
			refresh: false,
			lens: "runtime",
		},
		ports,
	);
	assert.equal(runtimeState.lens.id, "runtime");
	assert.equal(runtimeState.lens.data.parallel.active_claim_count, 0);

	const automationState = await readCodewikiState(
		project,
		{
			include: ["summary"],
			taskId: undefined,
			refresh: false,
			lens: "automation-readiness",
		},
		ports,
	);
	assert.equal(automationState.lens.id, "automation-readiness");
	assert.ok(Array.isArray(automationState.lens.data.stop_reasons));
} finally {
	await rm(root, { recursive: true, force: true });
}

console.log("✓ graph lenses smoke passed");
