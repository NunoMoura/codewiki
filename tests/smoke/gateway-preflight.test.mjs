import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	writeDecisionBuild,
	writeImplementationBuild,
	writePlanningBuild,
} from "../../src/build/writer.ts";
import {
	buildGatewayPreflight,
	writeGatewayReport,
} from "../../src/gateway/report.ts";

const root = await mkdtemp(join(tmpdir(), "codewiki-gateway-preflight-"));

const project = {
	root,
	label: "gateway-preflight-smoke",
	config: {
		project_name: "gateway-preflight-smoke",
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

const implementationAuditRefs = ["audit:alignment", "audit:changed"];
const decisionAuditRefs = ["audit:alignment", "audit:stale-reference"];
const planningAuditRefs = ["audit:alignment"];
const taskCloseAuditRefs = [
	"audit:alignment",
	"audit:changed",
	"audit:task",
	"audit:generated-parity",
];
const publicationAuditRefs = [
	"audit:alignment",
	"audit:package",
	"audit:security",
];

async function writeGatewayPass(profile, source, options = {}) {
	return writeGatewayReport(project, {
		profile,
		verdict: "pass",
		rationale: `${profile} gateway pass for fixture ${source}.`,
		source,
		audit_refs:
			options.audit_refs ??
			(profile === "decision"
				? decisionAuditRefs
				: profile === "planning"
					? planningAuditRefs
					: implementationAuditRefs),
		task_id: options.task_id,
		isolation: options.isolation,
	});
}

try {
	const decision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accept gateway preflight risk policy.",
		diff_table: [
			{
				id: "VAL-PREFLIGHT",
				current_state: "Gateway preflight is weaker.",
				desired_state: "Gateway preflight enforces semantic metadata.",
				rationale: "Smoke coverage needs accepted intent.",
				affected_layers: ["system", "roadmap", "code"],
				user_action: "approved",
			},
		],
		row_to_kb_mappings: [
			{
				row_id: "VAL-PREFLIGHT",
				knowledge_refs: [".codewiki/kb/system/validation-gateway.md"],
				evidence: "Validation gateway docs capture accepted intent.",
			},
		],
		propagation: {
			direction: "system-first",
			product_impact: ["Agents see stricter validation routes."],
			downstream_planning_questions: ["Plan TASK-777 implementation."],
		},
		knowledge_changes: [".codewiki/kb/system/validation-gateway.md"],
		roadmap_changes: ["TASK-777"],
	});
	await writeGatewayPass("decision", decision.path);
	const planning = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Plan gateway preflight risk policy.",
		source_decision_build: decision.path,
		task_ids: ["TASK-777"],
		task_changes: ["TASK-777 covers gateway preflight."],
		decision_row_resolutions: [
			{
				row_id: "VAL-PREFLIGHT",
				resolution: "roadmap-task",
				task_ids: ["TASK-777"],
				evidence: "TASK-777 implements accepted gateway preflight policy.",
				source_refs: [decision.path, "TASK-777"],
			},
		],
		downstream_question_resolutions: [
			{
				question: "Plan TASK-777 implementation.",
				resolution: "roadmap-task",
				task_ids: ["TASK-777"],
				evidence:
					"TASK-777 is the implementation route for the downstream question.",
				source_refs: [decision.path, "TASK-777"],
			},
		],
		tdd_plan: ["Add gateway/preflight smoke coverage."],
		candidate_test_files: ["tests/smoke/gateway-preflight.test.mjs"],
		candidate_code_paths: ["src/build/writer.ts"],
	});

	const planningWithoutGatewayImplementation = await writeImplementationBuild(
		project,
		{
			kind: "implementation",
			summary: "Implement before planning gateway.",
			source_planning_build: planning.path,
			task_id: "TASK-777",
			change_type: "system",
			test_files: ["tests/smoke/gateway-preflight.test.mjs"],
			code_files: ["src/build/writer.ts"],
			checks_run: ["node tests/smoke/gateway-preflight.test.mjs"],
			acceptance_mapping: [
				{
					criterion: "Planning gateway required",
					evidence: "Preflight blocks missing planning gateway pass.",
				},
			],
			closure_brief: {
				user_intent: "Prove planning gateway is required.",
				implemented_changes: ["Added fixture before planning pass."],
				acceptance_evidence: ["Preflight blocks missing planning pass."],
				checks: ["node tests/smoke/gateway-preflight.test.mjs"],
			},
		},
	);
	const missingPlanningGateway = buildGatewayPreflight(project, {
		profile: "implementation",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Planning gateway pass is required.",
		source: planningWithoutGatewayImplementation.path,
		audit_refs: implementationAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: false,
			working_tree_digest: "sha256:dirty",
		},
	});
	assert.ok(
		missingPlanningGateway.missing.upstream_builds.some((entry) =>
			entry.includes("missing_planning_validation_pass"),
		),
	);
	const missingPlanningGatewayReport = await writeGatewayReport(project, {
		profile: "implementation",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Planning gateway pass is required.",
		source: planningWithoutGatewayImplementation.path,
		audit_refs: implementationAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: false,
			working_tree_digest: "sha256:dirty",
		},
	});
	assert.equal(missingPlanningGatewayReport.data.verdict, "block");
	assert.ok(
		missingPlanningGatewayReport.data.failed_criteria.includes(
			"upstream_gateway",
		),
	);
	await writeGatewayPass("planning", planning.path);

	const semanticImplementation = await writeImplementationBuild(project, {
		kind: "implementation",
		summary: "Implement semantic gateway preflight.",
		source_planning_build: planning.path,
		task_id: "TASK-777",
		change_type: "system",
		test_files: ["tests/smoke/gateway-preflight.test.mjs"],
		code_files: ["src/build/writer.ts", "src/gateway/tool.ts"],
		checks_run: ["node tests/smoke/gateway-preflight.test.mjs"],
		acceptance_mapping: [
			{
				criterion: "Preflight reports missing metadata",
				evidence:
					"Smoke assertions cover missing audit/content/source evidence.",
			},
		],
		closure_brief: {
			user_intent: "Implement gateway preflight.",
			implemented_changes: ["Added gateway preflight risk policy."],
			acceptance_evidence: ["Preflight smoke assertions pass."],
			checks: ["node tests/smoke/gateway-preflight.test.mjs"],
		},
		publication: {
			safe_to_push: true,
			secret_scan: "pass",
			remote_visibility: "pass",
			private_evidence: "pass",
		},
	});

	const missingMetadata = buildGatewayPreflight(project, {
		profile: "implementation",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Preflight only.",
		source: semanticImplementation.path,
	});
	assert.equal(missingMetadata.status, "blocked");
	assert.ok(missingMetadata.missing.audit_evidence.includes("audit:alignment"));
	assert.ok(missingMetadata.missing.audit_evidence.includes("audit:changed"));
	assert.ok(
		missingMetadata.missing.content_proof.includes("fresh_context=true"),
	);
	assert.equal(missingMetadata.risk.tier, "semantic-system");
	assert.equal(missingMetadata.risk.fresh_context.required, true);
	assert.equal(missingMetadata.risk.fresh_context.recommended, true);
	assert.ok(
		missingMetadata.risk.approval_evidence.some((entry) =>
			entry.includes(planning.path),
		),
	);

	await writeFile(
		join(root, project.graphPath),
		JSON.stringify(
			{
				views: {
					semantic_execution_closure: {
						version: 1,
						invariant: "generated_view_not_canonical_truth",
						scopes: {
							tasks: {
								"TASK-777": {
									gaps: ["VAL-PREFLIGHT:missing_validation_report"],
									deviations: ["VAL-PREFLIGHT:non_passing_validation_report"],
									remaining_risks: ["close reviewer must confirm row evidence"],
									implementation_builds: [semanticImplementation.path],
									validation_reports: [],
									content_proof_refs: [],
								},
							},
						},
					},
				},
			},
			null,
			2,
		),
	);
	const semanticClosureBlocked = buildGatewayPreflight(project, {
		profile: "task-close",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Task close must cite clean semantic closure evidence.",
		source: semanticImplementation.path,
		audit_refs: taskCloseAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			published_sha: "def5678",
			tree_sha: "tree5678",
		},
	});
	assert.equal(semanticClosureBlocked.status, "blocked");
	assert.ok(
		semanticClosureBlocked.checks.includes("semantic execution closure report"),
	);
	assert.ok(
		semanticClosureBlocked.missing.semantic_closure.some((entry) =>
			entry.includes("missing_validation_report"),
		),
	);
	assert.ok(
		semanticClosureBlocked.missing.semantic_closure_risks.some((entry) =>
			entry.includes("close reviewer"),
		),
	);
	assert.equal(semanticClosureBlocked.routing.failure_class, "planning_gap");

	const staleSource = buildGatewayPreflight(project, {
		profile: "implementation",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Preflight only.",
		source: ".codewiki/builds/implementation/missing.json",
		audit_refs: implementationAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: false,
			working_tree_digest: "sha256:dirty",
		},
	});
	assert.equal(staleSource.status, "blocked");
	assert.ok(
		staleSource.missing.stale_refs.some((entry) =>
			entry.includes("missing.json"),
		),
	);

	const unresolvedDecision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accept unresolved propagation fixture.",
		diff_table: [
			{
				id: "UNMAPPED-ROW",
				current_state: "Question-only planning can pass.",
				desired_state: "Question-only planning must fail.",
				rationale: "Regression fixture.",
				affected_layers: ["roadmap", "code"],
				user_action: "approved",
			},
		],
		row_to_kb_mappings: [
			{
				row_id: "UNMAPPED-ROW",
				knowledge_refs: [".codewiki/kb/system/validation-gateway.md"],
				evidence: "Gateway docs capture the rule.",
			},
		],
		propagation: {
			direction: "system-first",
			product_impact: ["Planning validates stricter mapping."],
			downstream_planning_questions: ["Who owns UNMAPPED-ROW?"],
		},
		knowledge_changes: [".codewiki/kb/system/validation-gateway.md"],
	});
	await writeGatewayPass("decision", unresolvedDecision.path);
	const unresolvedPlan = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Leave propagation unresolved.",
		source_decision_build: unresolvedDecision.path,
		open_questions: ["Who owns UNMAPPED-ROW?"],
		tdd_plan: ["Prove planning validation blocks unmapped rows."],
	});
	const propagationBlocked = buildGatewayPreflight(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Planning cannot pass with unmapped accepted row.",
		source: unresolvedPlan.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(propagationBlocked.status, "blocked");
	assert.ok(
		propagationBlocked.missing.decision_propagation.some((entry) =>
			entry.includes("UNMAPPED-ROW"),
		),
	);
	assert.equal(propagationBlocked.routing.failure_class, "planning_gap");
	assert.equal(propagationBlocked.routing.recommended_next_loop, "planning");
	const propagationBlockedReport = await writeGatewayReport(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Planning cannot pass with unmapped accepted row.",
		source: unresolvedPlan.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(propagationBlockedReport.data.verdict, "block");
	assert.equal(propagationBlockedReport.data.failure_class, "planning_gap");
	assert.equal(propagationBlockedReport.data.recommended_next_loop, "planning");

	const explicitRouteReport = await writeGatewayReport(project, {
		profile: "decision",
		verdict: "fail",
		rationale: "Validator found a planning-only gap.",
		failure_class: "planning_gap",
		recommended_next_loop: "planning",
		stop_reason: "Planner must refine roadmap work before retry.",
	});
	assert.equal(explicitRouteReport.data.failure_class, "planning_gap");
	assert.equal(explicitRouteReport.data.recommended_next_loop, "planning");
	assert.equal(
		explicitRouteReport.data.stop_reason,
		"Planner must refine roadmap work before retry.",
	);

	const pendingApprovedDecision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accept pending approved id fixture.",
		diff_table: [
			{
				id: "PENDING-APPROVED",
				current_state: "Pending rows can be promoted.",
				desired_state: "Pending rows cannot be promoted.",
				rationale: "Regression fixture.",
				affected_layers: ["system"],
				user_action: "pending",
			},
		],
		approved_diff_rows: ["PENDING-APPROVED"],
		row_to_kb_mappings: [
			{
				row_id: "PENDING-APPROVED",
				knowledge_refs: [".codewiki/kb/system/validation-gateway.md"],
				evidence: "Mapping alone is not enough without approved row action.",
			},
		],
		propagation: {
			direction: "system-first",
			product_impact: ["Agents see precise approval state."],
		},
		knowledge_changes: [".codewiki/kb/system/validation-gateway.md"],
	});
	const pendingApprovedPreflight = buildGatewayPreflight(project, {
		profile: "decision",
		verdict: "pass",
		rationale: "Pending approved rows must block.",
		source: pendingApprovedDecision.path,
		audit_refs: decisionAuditRefs,
	});
	assert.equal(pendingApprovedPreflight.status, "blocked");
	assert.ok(
		pendingApprovedPreflight.missing.decision_mappings.some((entry) =>
			entry.includes("user_action_not_approved"),
		),
	);
	assert.equal(
		pendingApprovedPreflight.routing.recommended_next_loop,
		"decision",
	);

	const deferredDecision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accept knowledge-only and deferred propagation fixture.",
		diff_table: [
			{
				id: "KNOWLEDGE-ONLY",
				current_state: "Docs are unclear.",
				desired_state: "Docs are updated only.",
				rationale: "No executable work.",
				affected_layers: ["knowledge"],
				user_action: "approved",
			},
			{
				id: "EXPLICIT-DEFER",
				current_state: "Migration target undecided.",
				desired_state: "Migration can be deferred with owner and trigger.",
				rationale: "No safe target yet.",
				affected_layers: ["roadmap"],
				user_action: "approved",
			},
		],
		row_to_kb_mappings: [
			{
				row_id: "KNOWLEDGE-ONLY",
				knowledge_refs: [".codewiki/kb/system/change-lifecycle.md"],
				evidence: "Lifecycle docs capture knowledge-only resolution.",
			},
			{
				row_id: "EXPLICIT-DEFER",
				knowledge_refs: [".codewiki/kb/system/change-lifecycle.md"],
				evidence: "Lifecycle docs capture deferral policy.",
			},
		],
		propagation: {
			direction: "system-first",
			product_impact: ["Agents can record no-op/deferred planning."],
			downstream_planning_questions: ["When should EXPLICIT-DEFER resume?"],
		},
		knowledge_changes: [".codewiki/kb/system/change-lifecycle.md"],
	});
	await writeGatewayPass("decision", deferredDecision.path);
	const deferredPlan = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Resolve knowledge-only and deferred rows.",
		source_decision_build: deferredDecision.path,
		decision_row_resolutions: [
			{
				row_id: "KNOWLEDGE-ONLY",
				resolution: "knowledge-only",
				knowledge_refs: [".codewiki/kb/system/change-lifecycle.md"],
				evidence: "The accepted row is complete in KB only.",
				source_refs: [deferredDecision.path],
			},
			{
				row_id: "EXPLICIT-DEFER",
				resolution: "deferred",
				owner: "maintainers",
				trigger: "first migration target approved",
				rationale: "Migration target needs a later decision.",
				evidence: "Deferred record has owner, trigger, and rationale.",
				source_refs: [deferredDecision.path],
			},
		],
		downstream_question_resolutions: [
			{
				question: "When should EXPLICIT-DEFER resume?",
				resolution: "deferred",
				owner: "maintainers",
				trigger: "first migration target approved",
				rationale: "Same as EXPLICIT-DEFER row deferral.",
				evidence: "Question is explicitly deferred with owner and trigger.",
				source_refs: [deferredDecision.path],
			},
		],
	});
	const deferredPreflight = buildGatewayPreflight(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Knowledge-only and deferred rows are fully resolved.",
		source: deferredPlan.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(deferredPreflight.status, "ready");
	assert.deepEqual(deferredPreflight.missing.decision_propagation, []);

	await mkdir(join(root, ".codewiki/kb/system/diagrams"), { recursive: true });
	await writeFile(
		join(root, ".codewiki/kb/system/diagrams/file-structure-map.yaml"),
		`version: 1\nid: file-structure-map\ntitle: File structure\ncategories: [approved_migration_delta]\nnodes:\n  - id: deferred_concept_roots\n    label: Deferred concept roots after agency pilot\n    group: drift\n    kind: policy\n    status: accepted_target\n    defer_status: trigger_satisfied_needs_followup_planning\n    trigger_state: satisfied_by_TASK_015_task_close\n    trigger: agency pilot task-close validation and compatibility evidence\n    paths: [src/audit/**]\nedges: []\n`,
	);
	const triggerSatisfiedDecision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accept trigger-satisfied deferred propagation fixture.",
		diff_table: [
			{
				id: "TRIGGER-DEFER",
				current_state: "Deferred work can remain hidden after trigger.",
				desired_state: "Satisfied deferral trigger routes to planning.",
				rationale: "Regression fixture.",
				affected_layers: ["roadmap"],
				user_action: "approved",
			},
		],
		row_to_kb_mappings: [
			{
				row_id: "TRIGGER-DEFER",
				knowledge_refs: [".codewiki/kb/system/file-structure.md"],
				evidence: "File-structure docs capture deferred trigger policy.",
			},
		],
		propagation: {
			direction: "system-first",
			product_impact: ["Agents see triggered deferred work."],
			downstream_planning_questions: ["When should TRIGGER-DEFER resume?"],
		},
		knowledge_changes: [".codewiki/kb/system/file-structure.md"],
	});
	await writeGatewayPass("decision", triggerSatisfiedDecision.path);
	const triggerSatisfiedPlan = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Resolve trigger-satisfied row as deferred fixture.",
		source_decision_build: triggerSatisfiedDecision.path,
		decision_row_resolutions: [
			{
				row_id: "TRIGGER-DEFER",
				resolution: "deferred",
				owner: "maintainers",
				trigger:
					"agency pilot task-close validation and compatibility evidence",
				rationale: "Wait for pilot close.",
				evidence: "Deferred root waits on agency pilot.",
				source_refs: ["file-structure-map:deferred_concept_roots"],
			},
		],
		downstream_question_resolutions: [
			{
				question: "When should TRIGGER-DEFER resume?",
				resolution: "deferred",
				owner: "maintainers",
				trigger:
					"agency pilot task-close validation and compatibility evidence",
				rationale: "Same deferral as row.",
				evidence: "Deferred question points at the same trigger.",
				source_refs: ["file-structure-map:deferred_concept_roots"],
			},
		],
	});
	const triggerSatisfiedPreflight = buildGatewayPreflight(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Satisfied deferral triggers must not pass as resolved.",
		source: triggerSatisfiedPlan.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(triggerSatisfiedPreflight.status, "blocked");
	assert.ok(
		triggerSatisfiedPreflight.missing.decision_propagation.some(
			(entry) =>
				entry.includes("TRIGGER-DEFER") && entry.includes("trigger_satisfied"),
		),
	);
	assert.equal(triggerSatisfiedPreflight.routing.failure_class, "planning_gap");

	const mechanicalImplementation = await writeImplementationBuild(project, {
		kind: "implementation",
		summary: "Refresh generated graph.",
		task_id: "TASK-778",
		change_class: "mechanical",
		test_design_evidence: ["Generated refresh reviewed by graph parity audit."],
		code_files: [".codewiki/index_graph.json"],
		checks_run: ["wiki_state refresh=true"],
		acceptance_mapping: [
			{
				criterion: "Graph refreshed",
				evidence: "Generated output was refreshed.",
			},
		],
		closure_brief: {
			user_intent: "Refresh generated graph.",
			implemented_changes: ["Regenerated graph output."],
			acceptance_evidence: ["Generated graph refresh completed."],
			checks: ["wiki_state refresh=true"],
		},
	});
	const mechanicalPreflight = buildGatewayPreflight(project, {
		profile: "implementation",
		task_id: "TASK-778",
		verdict: "pass",
		rationale: "Mechanical fast path.",
		source: mechanicalImplementation.path,
		audit_refs: implementationAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: false,
			working_tree_digest: "sha256:mechanical",
		},
	});
	assert.equal(mechanicalPreflight.status, "ready");
	assert.equal(mechanicalPreflight.risk.tier, "mechanical-docs");
	assert.equal(mechanicalPreflight.risk.approval_required, false);
	assert.equal(mechanicalPreflight.risk.fast_path.eligible, true);

	const mechanicalReport = await writeGatewayReport(project, {
		profile: "implementation",
		task_id: "TASK-778",
		verdict: "pass",
		rationale: "Mechanical fast path remains gateway validated.",
		source: mechanicalImplementation.path,
		audit_refs: implementationAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: false,
			working_tree_digest: "sha256:mechanical",
		},
	});
	assert.equal(mechanicalReport.data.verdict, "pass");
	assert.equal(mechanicalReport.data.preflight.risk.fast_path.eligible, true);
	assert.equal(
		mechanicalReport.data.context_boundary.trigger,
		"post-gateway-pass",
	);
	assert.equal(
		mechanicalReport.data.context_boundary.mode,
		"codewiki-context-refresh",
	);
	assert.ok(
		mechanicalReport.data.context_boundary.source_refs.includes(
			mechanicalImplementation.path,
		),
	);
	assert.equal(mechanicalReport.data.checkpoint_commit.recommended, true);
	assert.equal(mechanicalReport.data.checkpoint_commit.local_only, true);
	assert.equal(
		mechanicalReport.data.checkpoint_commit.remote_publication,
		false,
	);
	assert.equal(
		mechanicalReport.data.checkpoint_commit.separate_close_publication_commit,
		true,
	);
	assert.equal(mechanicalReport.data.reload_guidance.required, false);

	const reloadImplementation = await writeImplementationBuild(project, {
		kind: "implementation",
		summary: "Update Pi adapter and skills.",
		task_id: "TASK-779",
		change_class: "mechanical",
		test_design_evidence: [
			"Reload guidance path classification covers Pi-facing files.",
		],
		code_files: [
			"src/adapters/pi/index.ts",
			"skills/codewiki-implementation/SKILL.md",
		],
		checks_run: ["node tests/smoke/gateway-preflight.test.mjs"],
		acceptance_mapping: [
			{
				criterion: "Reload guidance appears for Pi-facing changes",
				evidence: "Validation report reload_guidance.required is true.",
			},
		],
		closure_brief: {
			user_intent: "Show reload guidance for live extension paths.",
			implemented_changes: ["Changed Pi adapter and skill fixtures."],
			acceptance_evidence: ["Reload guidance report metadata present."],
			checks: ["node tests/smoke/gateway-preflight.test.mjs"],
		},
	});
	const reloadReport = await writeGatewayReport(project, {
		profile: "implementation",
		task_id: "TASK-779",
		verdict: "pass",
		rationale:
			"Reload guidance should be emitted for Pi-facing source changes.",
		source: reloadImplementation.path,
		audit_refs: implementationAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: false,
			working_tree_digest: "sha256:reload",
		},
	});
	assert.equal(reloadReport.data.verdict, "pass");
	assert.equal(reloadReport.data.reload_guidance.required, true);
	assert.ok(
		reloadReport.data.reload_guidance.paths.includes(
			"src/adapters/pi/index.ts",
		),
	);
	assert.match(reloadReport.data.reload_guidance.message, /\/reload/);

	const publicationPreflight = buildGatewayPreflight(project, {
		profile: "publication",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Publication needs approval.",
		source: semanticImplementation.path,
		audit_refs: publicationAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			published_sha: "def5678",
			package_digest: "sha256:package",
		},
	});
	assert.equal(publicationPreflight.status, "escalate");
	assert.equal(
		publicationPreflight.risk.tier,
		"security-migration-publication",
	);
	assert.ok(
		publicationPreflight.missing.user_approval.includes(
			"user_approval:security-migration-publication",
		),
	);

	const publicationBlocked = await writeGatewayReport(project, {
		profile: "publication",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Publication cannot pass without explicit user approval.",
		source: semanticImplementation.path,
		audit_refs: publicationAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			published_sha: "def5678",
			package_digest: "sha256:package",
		},
	});
	assert.equal(publicationBlocked.data.verdict, "block");
	assert.ok(publicationBlocked.data.failed_criteria.includes("risk_approval"));
	assert.equal(publicationBlocked.data.failure_class, "risk_approval_missing");
	assert.equal(publicationBlocked.data.recommended_next_loop, "decision");

	const publicationPassed = await writeGatewayReport(project, {
		profile: "publication",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Publication approval and proof present.",
		source: semanticImplementation.path,
		audit_refs: [...publicationAuditRefs, "approval:user"],
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			published_sha: "def5678",
			package_digest: "sha256:package",
		},
	});
	assert.equal(publicationPassed.data.verdict, "pass");
	assert.equal(
		publicationPassed.data.preflight.risk.approval_evidence.includes(
			"approval:user",
		),
		true,
	);

	const destructivePreflight = buildGatewayPreflight(project, {
		profile: "implementation",
		policy_profile: "destructive",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Destructive work requires approval.",
		source: semanticImplementation.path,
		audit_refs: implementationAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: false,
			working_tree_digest: "sha256:dirty",
		},
	});
	assert.equal(destructivePreflight.status, "escalate");
	assert.equal(destructivePreflight.risk.tier, "destructive");
} finally {
	await rm(root, { recursive: true, force: true });
}

console.log("✓ gateway preflight smoke passed");
