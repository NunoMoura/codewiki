import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildGraph } from "../../src/state/graph.ts";
import { buildLintReport } from "../../src/state/lint.ts";
import { decisionTableFixture } from "../decision-table-fixture.mjs";

const project = {
	root: "/tmp/codewiki-alignment-graph",
	label: "alignment-graph-smoke",
	config: {
		project_name: "alignment-graph-smoke",
		schema_version: 4,
		specs_root: ".codewiki/kb",
		generated_files: [".codewiki/index_graph.json"],
		codewiki: { gateway: { generated_readonly_paths: [".codewiki/index_graph.json"] } },
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
};

const gitCache = { getDirtyPaths: () => [] };
const claims = { version: 1, claims: [] };
const docs = [
	{
		path: ".codewiki/kb/system/alignment.md",
		title: "Alignment",
		doc_type: "spec",
		links: [],
		code_paths: ["src/state/graph.ts"],
	},
];

function baseGraph(overrides = {}) {
	return buildGraph({
		project,
		docs,
		research: [],
		roadmapEntries: [],
		roadmapSprints: [],
		archivedTaskIds: [],
		gitCache,
		builds: [],
		validations: [],
		testFiles: [],
		claims,
		lintReport: { issues: [], counts: {}, status: "green" },
		...overrides,
	});
}

const decisionPath = ".codewiki/builds/decision/decision.json";
const planningPath = ".codewiki/builds/planning/plan.json";
const implementationPath = ".codewiki/builds/implementation/impl.json";
const validationPath = ".codewiki/validation/impl-pass.json";
const checkedSha = "abc1234def5678abc1234def5678abc1234def5678";

const decisionBuild = {
	path: decisionPath,
	kind: "decision_build",
	status: "accepted",
	data: {
		kind: "decision_build",
		lifecycle: { state: "accepted" },
		decision_table: decisionTableFixture([{ id: "CHANGE-001", desired_state: "Align all layers.", user_action: "approved" }]),
		approved_decision_rows: ["CHANGE-001"],
		knowledge_changes: [".codewiki/kb/system/alignment.md"],
		row_to_kb_mappings: [{ row_id: "CHANGE-001", knowledge_refs: [".codewiki/kb/system/alignment.md"], evidence: "Alignment doc captures change." }],
		propagation: { direction: "system-first", product_impact: ["User-visible alignment behavior changes."] },
		produces: { knowledge: [".codewiki/kb/system/alignment.md"], roadmap: ["TASK-900"] },
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
		task_ids: ["TASK-900"],
		decision_row_resolutions: [{ row_id: "CHANGE-001", resolution: "roadmap-task", task_ids: ["TASK-900"], evidence: "TASK-900 implements CHANGE-001.", source_refs: [decisionPath, "TASK-900"] }],
		produces: { roadmap: ["TASK-900"] },
	},
};
const implementationBuild = {
	path: implementationPath,
	kind: "implementation_build",
	taskId: "TASK-900",
	status: "accepted",
	data: {
		kind: "implementation_build",
		lifecycle: { state: "accepted" },
		source_planning_build: planningPath,
		task_id: "TASK-900",
		produces: {
			code: ["src/state/graph.ts"],
			tests: ["tests/smoke/alignment-graph.test.mjs"],
			publication: ["package:codewiki"],
		},
		code_files: ["src/state/graph.ts"],
		test_files: ["tests/smoke/alignment-graph.test.mjs"],
		audit_refs: ["audit:file-structure"],
	},
};
const validationReport = {
	path: validationPath,
	taskId: "TASK-900",
	verdict: "pass",
	data: {
		profile: "implementation",
		verdict: "pass",
		source: implementationPath,
		audit_refs: ["audit:file-structure"],
		isolation: { role: "validator", fresh_context: true, clean: true, validated_sha: checkedSha },
	},
};

{
	const graph = baseGraph({
		roadmapEntries: [
			{ id: "TASK-900", title: "Implement graph", status: "todo", priority: "critical", kind: "architecture", summary: "Graph work.", spec_paths: [".codewiki/kb/system/alignment.md"], code_paths: ["src/state/graph.ts"], research_ids: [] },
		],
		builds: [decisionBuild, planningBuild, implementationBuild],
		validations: [validationReport],
	});
	const alignment = graph.views.alignment;
	assert.equal(alignment.model, "derived-vertical-state-machine");
	assert.deepEqual(alignment.precedence.slice(0, 2), ["content_proof", "canonical_source"], "Content proof must outrank validation reports and graph state");
	assert.ok(alignment.canonical_source_refs.includes(implementationPath), "Build path should appear as canonical source ref");
	assert.ok(alignment.audit_evidence_refs.includes("audit:file-structure"), "Audit evidence should be indexed separately");
	assert.ok(alignment.content_proof_refs.includes(checkedSha), "Validation checked SHA should be indexed as content proof");
	assert.ok(alignment.validation_attestations.some((row) => row.path === validationPath && row.content_proof_refs.includes(checkedSha)), "Validation report should be an attestation over content proof");
	assert.ok(graph.nodes.some((node) => node.id === `content_proof:${checkedSha}` && node.kind === "content_proof"), "Content proof node missing");
	assert.ok(graph.edges.some((edge) => edge.kind === "validation_content_proof" && edge.to === `content_proof:${checkedSha}`), "Validation should link to content proof node");
}

{
	const graph = baseGraph({ builds: [decisionBuild] });
	assert.ok(graph.views.reconciliation.items.some((item) => item.source_id === `build:${decisionPath}` && item.next_loop === "planning"), "Accepted decision without planning should route to planning");
}

{
	const graph = baseGraph({
		gitCache: { getDirtyPaths: () => ["src/state/graph.ts"] },
		builds: [],
	});
	const row = graph.views.traceability.semantic_change_gaps.find((entry) => entry.path === "src/state/graph.ts");
	assert.equal(row?.change_type, "code");
	assert.ok(row?.gaps.includes("missing_accepted_build_coverage"), "Dirty semantic code should require accepted build coverage");
	assert.ok(graph.views.reconciliation.items.some((item) => item.id === "reconcile:semantic-build:src/state/graph.ts"), "Graph should route missing semantic build coverage");
}

{
	const graph = baseGraph({
		gitCache: { getDirtyPaths: () => ["src/state/graph.ts"] },
		builds: [implementationBuild],
	});
	assert.ok(!graph.views.traceability.semantic_change_gaps.some((entry) => entry.path === "src/state/graph.ts"), "Accepted implementation build should cover dirty semantic code");
}

{
	const graph = baseGraph({ builds: [decisionBuild] });
	assert.ok(graph.views.reconciliation.items.some((item) => item.source_id === `build:${decisionPath}` && item.next_loop === "planning"), "Decision build should route to planning when no planning evidence exists");
}

{
	const missingDecisionLint = buildLintReport("/tmp/codewiki-alignment-graph", project, [], [], [], {
		builds: [{ path: ".codewiki/builds/planning/current-plan.json", kind: "planning_build", data: { schema_version: 2, kind: "planning_build", traceability: { upstream_loop: "decision" }, task_ids: ["TASK-900"], produces: { roadmap: ["TASK-900"] }, tdd_plan: ["Test first."] } }],
	});
	assert.ok(missingDecisionLint.issues.some((issue) => issue.kind === "planning-build-missing-decision-source"), "Current planning v2 builds should require a decision source");

	const legacyUpstreamLint = buildLintReport("/tmp/codewiki-alignment-graph", project, [], [], [], {
		builds: [{ path: ".codewiki/builds/planning/legacy-plan.json", kind: "planning_build", data: { schema_version: 2, kind: "planning_build", traceability: { upstream_loop: "legacy" }, task_ids: ["TASK-900"], produces: { roadmap: ["TASK-900"] }, tdd_plan: ["Test first."] } }],
	});
	assert.ok(!legacyUpstreamLint.issues.some((issue) => issue.kind === "planning-build-missing-decision-source"), "Explicit non-decision upstream loops are historical artifacts and should not fail current graph health");
}

{
	const graph = baseGraph({
		roadmapEntries: [
			{ id: "TASK-900", title: "Implement graph", status: "todo", priority: "critical", kind: "architecture", summary: "Graph work.", spec_paths: [".codewiki/kb/system/alignment.md"], code_paths: ["src/state/graph.ts"], research_ids: [] },
		],
		builds: [decisionBuild, planningBuild],
	});
	assert.ok(graph.views.reconciliation.items.some((item) => item.task_id === "TASK-900" && item.next_loop === "implementation"), "Open roadmap task should route to implementation");
}

{
	const graph = baseGraph({
		roadmapEntries: [
			{ id: "TASK-900", title: "Implement graph", status: "todo", priority: "critical", kind: "architecture", summary: "Graph work.", spec_paths: [".codewiki/kb/system/alignment.md"], code_paths: ["src/state/graph.ts"], research_ids: [] },
		],
		builds: [decisionBuild, planningBuild, implementationBuild],
	});
	assert.ok(graph.views.reconciliation.items.some((item) => item.source_id === `build:${implementationPath}` && item.next_loop === "validation"), "Accepted implementation build without validation should route to validation");
	assert.ok(graph.views.reconciliation.items.some((item) => item.id === `reconcile:publication-proof:${implementationPath}` && item.next_loop === "validation"), "Publication claim without content proof should route to validation");
	const row = graph.views.traceability.rows.find((entry) => entry.requirement_id === "CHANGE-001");
	assert.ok(row?.gaps.includes("missing_publication_content_proof"), "Traceability should expose missing publication/content-proof edge");
}

{
	const graph = baseGraph({
		roadmapEntries: [
			{ id: "TASK-900", title: "Implement graph", status: "todo", priority: "critical", kind: "architecture", summary: "Graph work.", spec_paths: [], code_paths: [], research_ids: [] },
			{ id: "TASK-CLOSED", title: "Closed", status: "done", priority: "low", kind: "testing", summary: "Closed task.", spec_paths: [], code_paths: [], research_ids: [] },
		],
		validations: [
			{ path: ".codewiki/validation/open-fail.json", taskId: "TASK-900", verdict: "fail", data: { profile: "implementation", verdict: "fail" } },
			{ path: ".codewiki/validation/closed-fail.json", taskId: "TASK-CLOSED", verdict: "fail", data: { profile: "implementation", verdict: "fail" } },
		],
	});
	assert.ok(graph.views.reconciliation.items.some((item) => item.source_id === "validation:.codewiki/validation/open-fail.json"), "Active-task fail validation should route drift");
	assert.ok(!graph.views.reconciliation.items.some((item) => item.source_id === "validation:.codewiki/validation/closed-fail.json"), "Closed-task fail validation should not route current drift");
}

{
	const graph = baseGraph({
		validations: [
			{ path: ".codewiki/validation/unscoped-block.json", verdict: "block", data: { profile: "decision", verdict: "block", source: ".codewiki/builds/decision/old.json" } },
			{ path: ".codewiki/validation/unscoped-pass.json", verdict: "pass", data: { profile: "decision", verdict: "pass", source: ".codewiki/builds/decision/old.json" } },
		],
	});
	assert.ok(!graph.views.reconciliation.items.some((item) => item.source_id === "validation:.codewiki/validation/unscoped-block.json"), "Unscoped superseded block validation should not route current decision drift");
}

{
	const graph = baseGraph({
		validations: [
			{ path: ".codewiki/validation/unscoped-fail.json", verdict: "fail", data: { profile: "decision", verdict: "fail" } },
		],
	});
	assert.ok(graph.views.reconciliation.items.some((item) => item.source_id === "validation:.codewiki/validation/unscoped-fail.json"), "Unscoped fail validation should still route decision drift");
}

{
	const fileStructureDecisionPath = ".codewiki/builds/decision/file-structure.json";
	const fileStructurePlanPath = ".codewiki/builds/planning/task-010-plan.json";
	const fileStructureDecision = {
		path: fileStructureDecisionPath,
		kind: "decision_build",
		status: "accepted",
		data: {
			kind: "decision_build",
			lifecycle: { state: "accepted" },
			decision_table: decisionTableFixture([
				{ id: "FS-HUMAN-DRIVEN-SURFACE", desired_state: "Humans need a file-structure review surface.", affected_layers: ["roadmap", "ui"], user_action: "approved" },
				{ id: "FS-ROOT-CONCEPTS", desired_state: "Concept-root migration needs a first boundary.", affected_layers: ["roadmap", "source"], user_action: "approved" },
			]),
			approved_decision_rows: ["FS-HUMAN-DRIVEN-SURFACE", "FS-ROOT-CONCEPTS"],
			row_to_kb_mappings: [
				{ row_id: "FS-HUMAN-DRIVEN-SURFACE", knowledge_refs: [".codewiki/kb/system/file-structure.md"], evidence: "KB captures review surface." },
				{ row_id: "FS-ROOT-CONCEPTS", knowledge_refs: [".codewiki/kb/system/file-structure.md"], evidence: "KB captures migration direction." },
			],
			propagation: { direction: "system-first", product_impact: ["Maintainers review drift."], downstream_planning_questions: ["Which concept root should migrate first?"] },
		},
	};
	const incompleteFileStructurePlan = {
		path: fileStructurePlanPath,
		kind: "planning_build",
		status: "accepted",
		data: {
			kind: "planning_build",
			lifecycle: { state: "accepted" },
			source_decision_build: fileStructureDecisionPath,
			task_ids: ["TASK-010"],
			open_questions: ["Which concept root should migrate first?"],
			produces: { roadmap: ["TASK-010"] },
		},
	};
	const graph = baseGraph({ builds: [fileStructureDecision, incompleteFileStructurePlan], roadmapEntries: [] });
	assert.equal(graph.views.decision_propagation.residual_count, 3, "TASK-010 regression should expose two unmapped rows plus one still-open downstream question");
	assert.ok(graph.views.decision_propagation.residuals.some((entry) => entry.id === "FS-HUMAN-DRIVEN-SURFACE"));
	assert.ok(graph.views.decision_propagation.residuals.some((entry) => entry.id === "FS-ROOT-CONCEPTS"));
	assert.ok(graph.views.reconciliation.items.some((item) => item.id.includes("decision-propagation") && item.next_loop === "planning"), "Residual decision propagation should route back to planning");
}

{
	rmSync(project.root, { recursive: true, force: true });
	mkdirSync(join(project.root, ".codewiki/kb/system/diagrams"), { recursive: true });
	writeFileSync(join(project.root, ".codewiki/kb/system/diagrams/file-structure-map.yaml"), `version: 1\nid: file-structure-map\ntitle: File structure\ncategories: [approved_migration_delta]\nnodes:\n  - id: deferred_concept_roots\n    label: Deferred concept roots after agency pilot\n    group: drift\n    kind: policy\n    status: accepted_target\n    defer_status: trigger_satisfied_needs_followup_planning\n    trigger_state: satisfied_by_TASK_015_task_close\n    trigger: agency pilot task-close validation and compatibility evidence\n    paths: [src/audit/**]\nedges: []\n`);
	const deferredDecisionPath = ".codewiki/builds/decision/deferred-trigger.json";
	const deferredPlanPath = ".codewiki/builds/planning/deferred-trigger-plan.json";
	const deferredDecision = {
		path: deferredDecisionPath,
		kind: "decision_build",
		status: "accepted",
		data: {
			kind: "decision_build",
			lifecycle: { state: "accepted" },
			decision_table: decisionTableFixture([{ id: "TRIGGER-DEFER", desired_state: "Satisfied deferred roots route to planning.", affected_layers: ["roadmap"], user_action: "approved" }]),
			approved_decision_rows: ["TRIGGER-DEFER"],
			row_to_kb_mappings: [{ row_id: "TRIGGER-DEFER", knowledge_refs: [".codewiki/kb/system/file-structure.md"], evidence: "KB captures deferral." }],
			propagation: { direction: "system-first", product_impact: ["Deferred trigger is visible."], downstream_planning_questions: ["When should TRIGGER-DEFER resume?"] },
		},
	};
	const deferredPlan = {
		path: deferredPlanPath,
		kind: "planning_build",
		status: "accepted",
		data: {
			kind: "planning_build",
			lifecycle: { state: "accepted" },
			source_decision_build: deferredDecisionPath,
			decision_row_resolutions: [{ row_id: "TRIGGER-DEFER", resolution: "deferred", owner: "maintainers", trigger: "agency pilot task-close validation and compatibility evidence", rationale: "Wait for pilot close.", evidence: "Deferred root waits on agency pilot.", source_refs: ["file-structure-map:deferred_concept_roots"] }],
			downstream_question_resolutions: [{ question: "When should TRIGGER-DEFER resume?", resolution: "deferred", owner: "maintainers", trigger: "agency pilot task-close validation and compatibility evidence", rationale: "Same deferral as row.", evidence: "Deferred question points at the same trigger.", source_refs: ["file-structure-map:deferred_concept_roots"] }],
		},
	};
	const graph = baseGraph({ builds: [deferredDecision, deferredPlan] });
	assert.equal(graph.views.decision_propagation.residual_count, 2, "Satisfied deferred row and downstream question should route back to planning");
	assert.ok(graph.views.decision_propagation.residuals.every((entry) => entry.gaps.some((gap) => gap.includes("trigger_satisfied"))));
	assert.ok(graph.views.reconciliation.items.some((item) => item.id.includes("decision-propagation") && item.next_loop === "planning" && item.reason.includes("trigger_satisfied")), "Trigger-satisfied deferral should route to planning");
}

console.log("✓ alignment graph smoke passed");
