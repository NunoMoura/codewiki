import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildValidationPreflight, writeDecisionBuild, writeImplementationBuild, writePlanningBuild, writeValidationReport } from "../../src/application/builds.ts";

const root = await mkdtemp(join(tmpdir(), "codewiki-validation-preflight-"));

const project = {
	root,
	label: "validation-preflight-smoke",
	config: {
		project_name: "validation-preflight-smoke",
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
const publicationAuditRefs = ["audit:alignment", "audit:package", "audit:security"];

try {
	const decision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accept validation preflight risk policy.",
		diff_table: [{ id: "VAL-PREFLIGHT", current_state: "Validation preflight is weaker.", desired_state: "Validation preflight enforces semantic metadata.", rationale: "Smoke coverage needs accepted intent.", affected_layers: ["system", "roadmap", "code"], user_action: "approved" }],
		row_to_kb_mappings: [{ row_id: "VAL-PREFLIGHT", knowledge_refs: [".codewiki/kb/system/validation-gateway.md"], evidence: "Validation gateway docs capture accepted intent." }],
		propagation: { direction: "system-first", product_impact: ["Agents see stricter validation routes."], downstream_planning_questions: ["Plan TASK-777 implementation."] },
		knowledge_changes: [".codewiki/kb/system/validation-gateway.md"],
		roadmap_changes: ["TASK-777"],
	});
	const planning = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Plan validation preflight risk policy.",
		source_decision_build: decision.path,
		task_ids: ["TASK-777"],
		task_changes: ["TASK-777 covers validation preflight."],
		decision_row_resolutions: [{ row_id: "VAL-PREFLIGHT", resolution: "roadmap-task", task_ids: ["TASK-777"], evidence: "TASK-777 implements accepted validation preflight policy.", source_refs: [decision.path, "TASK-777"] }],
		downstream_question_resolutions: [{ question: "Plan TASK-777 implementation.", resolution: "roadmap-task", task_ids: ["TASK-777"], evidence: "TASK-777 is the implementation route for the downstream question.", source_refs: [decision.path, "TASK-777"] }],
		tdd_plan: ["Add gateway/preflight smoke coverage."],
		candidate_test_files: ["tests/smoke/validation-preflight.test.mjs"],
		candidate_code_paths: ["src/application/builds.ts"],
	});

	const semanticImplementation = await writeImplementationBuild(project, {
		kind: "implementation",
		summary: "Implement semantic validation preflight.",
		source_planning_build: planning.path,
		task_id: "TASK-777",
		change_type: "system",
		test_files: ["tests/smoke/validation-preflight.test.mjs"],
		code_files: ["src/application/builds.ts", "src/application/tools/validation.ts"],
		checks_run: ["node tests/smoke/validation-preflight.test.mjs"],
		acceptance_mapping: [{ criterion: "Preflight reports missing metadata", evidence: "Smoke assertions cover missing audit/content/source evidence." }],
		closure_brief: {
			user_intent: "Implement validation preflight.",
			implemented_changes: ["Added validation preflight risk policy."],
			acceptance_evidence: ["Preflight smoke assertions pass."],
			checks: ["node tests/smoke/validation-preflight.test.mjs"],
		},
		publication: {
			safe_to_push: true,
			secret_scan: "pass",
			remote_visibility: "pass",
			private_evidence: "pass",
		},
	});

	const missingMetadata = buildValidationPreflight(project, {
		profile: "implementation",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Preflight only.",
		source: semanticImplementation.path,
	});
	assert.equal(missingMetadata.status, "blocked");
	assert.ok(missingMetadata.missing.audit_evidence.includes("audit:alignment"));
	assert.ok(missingMetadata.missing.audit_evidence.includes("audit:changed"));
	assert.ok(missingMetadata.missing.content_proof.includes("fresh_context=true"));
	assert.equal(missingMetadata.risk.tier, "semantic-system");
	assert.ok(missingMetadata.risk.approval_evidence.some((entry) => entry.includes(planning.path)));

	const staleSource = buildValidationPreflight(project, {
		profile: "implementation",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Preflight only.",
		source: ".codewiki/builds/implementation/missing.json",
		audit_refs: implementationAuditRefs,
		isolation: { role: "validator", fresh_context: true, clean: false, working_tree_digest: "sha256:dirty" },
	});
	assert.equal(staleSource.status, "blocked");
	assert.ok(staleSource.missing.stale_refs.some((entry) => entry.includes("missing.json")));

	const unresolvedDecision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accept unresolved propagation fixture.",
		diff_table: [{ id: "UNMAPPED-ROW", current_state: "Question-only planning can pass.", desired_state: "Question-only planning must fail.", rationale: "Regression fixture.", affected_layers: ["roadmap", "code"], user_action: "approved" }],
		row_to_kb_mappings: [{ row_id: "UNMAPPED-ROW", knowledge_refs: [".codewiki/kb/system/validation-gateway.md"], evidence: "Gateway docs capture the rule." }],
		propagation: { direction: "system-first", product_impact: ["Planning validates stricter mapping."], downstream_planning_questions: ["Who owns UNMAPPED-ROW?" ] },
		knowledge_changes: [".codewiki/kb/system/validation-gateway.md"],
	});
	const unresolvedPlan = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Leave propagation unresolved.",
		source_decision_build: unresolvedDecision.path,
		open_questions: ["Who owns UNMAPPED-ROW?"],
		tdd_plan: ["Prove planning validation blocks unmapped rows."],
	});
	const propagationBlocked = buildValidationPreflight(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Planning cannot pass with unmapped accepted row.",
		source: unresolvedPlan.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(propagationBlocked.status, "blocked");
	assert.ok(propagationBlocked.missing.decision_propagation.some((entry) => entry.includes("UNMAPPED-ROW")));
	assert.equal(propagationBlocked.routing.failure_class, "planning_gap");
	assert.equal(propagationBlocked.routing.recommended_next_loop, "planning");
	const propagationBlockedReport = await writeValidationReport(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Planning cannot pass with unmapped accepted row.",
		source: unresolvedPlan.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(propagationBlockedReport.data.verdict, "block");
	assert.equal(propagationBlockedReport.data.failure_class, "planning_gap");
	assert.equal(propagationBlockedReport.data.recommended_next_loop, "planning");

	const explicitRouteReport = await writeValidationReport(project, {
		profile: "decision",
		verdict: "fail",
		rationale: "Validator found a planning-only gap.",
		failure_class: "planning_gap",
		recommended_next_loop: "planning",
		stop_reason: "Planner must refine roadmap work before retry.",
	});
	assert.equal(explicitRouteReport.data.failure_class, "planning_gap");
	assert.equal(explicitRouteReport.data.recommended_next_loop, "planning");
	assert.equal(explicitRouteReport.data.stop_reason, "Planner must refine roadmap work before retry.");

	const deferredDecision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accept knowledge-only and deferred propagation fixture.",
		diff_table: [
			{ id: "KNOWLEDGE-ONLY", current_state: "Docs are unclear.", desired_state: "Docs are updated only.", rationale: "No executable work.", affected_layers: ["knowledge"], user_action: "approved" },
			{ id: "EXPLICIT-DEFER", current_state: "Migration target undecided.", desired_state: "Migration can be deferred with owner and trigger.", rationale: "No safe target yet.", affected_layers: ["roadmap"], user_action: "approved" },
		],
		row_to_kb_mappings: [
			{ row_id: "KNOWLEDGE-ONLY", knowledge_refs: [".codewiki/kb/system/change-lifecycle.md"], evidence: "Lifecycle docs capture knowledge-only resolution." },
			{ row_id: "EXPLICIT-DEFER", knowledge_refs: [".codewiki/kb/system/change-lifecycle.md"], evidence: "Lifecycle docs capture deferral policy." },
		],
		propagation: { direction: "system-first", product_impact: ["Agents can record no-op/deferred planning."], downstream_planning_questions: ["When should EXPLICIT-DEFER resume?"] },
		knowledge_changes: [".codewiki/kb/system/change-lifecycle.md"],
	});
	const deferredPlan = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Resolve knowledge-only and deferred rows.",
		source_decision_build: deferredDecision.path,
		decision_row_resolutions: [
			{ row_id: "KNOWLEDGE-ONLY", resolution: "knowledge-only", knowledge_refs: [".codewiki/kb/system/change-lifecycle.md"], evidence: "The accepted row is complete in KB only.", source_refs: [deferredDecision.path] },
			{ row_id: "EXPLICIT-DEFER", resolution: "deferred", owner: "maintainers", trigger: "first migration target approved", rationale: "Migration target needs a later decision.", evidence: "Deferred record has owner, trigger, and rationale.", source_refs: [deferredDecision.path] },
		],
		downstream_question_resolutions: [{ question: "When should EXPLICIT-DEFER resume?", resolution: "deferred", owner: "maintainers", trigger: "first migration target approved", rationale: "Same as EXPLICIT-DEFER row deferral.", evidence: "Question is explicitly deferred with owner and trigger.", source_refs: [deferredDecision.path] }],
	});
	const deferredPreflight = buildValidationPreflight(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Knowledge-only and deferred rows are fully resolved.",
		source: deferredPlan.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(deferredPreflight.status, "ready");
	assert.deepEqual(deferredPreflight.missing.decision_propagation, []);

	const mechanicalImplementation = await writeImplementationBuild(project, {
		kind: "implementation",
		summary: "Refresh generated graph.",
		task_id: "TASK-778",
		change_class: "mechanical",
		test_design_evidence: ["Generated refresh reviewed by graph parity audit."],
		code_files: [".codewiki/index_graph.json"],
		checks_run: ["codewiki_state refresh=true"],
		acceptance_mapping: [{ criterion: "Graph refreshed", evidence: "Generated output was refreshed." }],
		closure_brief: {
			user_intent: "Refresh generated graph.",
			implemented_changes: ["Regenerated graph output."],
			acceptance_evidence: ["Generated graph refresh completed."],
			checks: ["codewiki_state refresh=true"],
		},
	});
	const mechanicalPreflight = buildValidationPreflight(project, {
		profile: "implementation",
		task_id: "TASK-778",
		verdict: "pass",
		rationale: "Mechanical fast path.",
		source: mechanicalImplementation.path,
		audit_refs: implementationAuditRefs,
		isolation: { role: "validator", fresh_context: true, clean: false, working_tree_digest: "sha256:mechanical" },
	});
	assert.equal(mechanicalPreflight.status, "ready");
	assert.equal(mechanicalPreflight.risk.tier, "mechanical-docs");
	assert.equal(mechanicalPreflight.risk.approval_required, false);
	assert.equal(mechanicalPreflight.risk.fast_path.eligible, true);

	const mechanicalReport = await writeValidationReport(project, {
		profile: "implementation",
		task_id: "TASK-778",
		verdict: "pass",
		rationale: "Mechanical fast path remains gateway validated.",
		source: mechanicalImplementation.path,
		audit_refs: implementationAuditRefs,
		isolation: { role: "validator", fresh_context: true, clean: false, working_tree_digest: "sha256:mechanical" },
	});
	assert.equal(mechanicalReport.data.verdict, "pass");
	assert.equal(mechanicalReport.data.preflight.risk.fast_path.eligible, true);

	const publicationPreflight = buildValidationPreflight(project, {
		profile: "publication",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Publication needs approval.",
		source: semanticImplementation.path,
		audit_refs: publicationAuditRefs,
		isolation: { role: "validator", fresh_context: true, clean: true, published_sha: "def5678", package_digest: "sha256:package" },
	});
	assert.equal(publicationPreflight.status, "escalate");
	assert.equal(publicationPreflight.risk.tier, "security-migration-publication");
	assert.ok(publicationPreflight.missing.user_approval.includes("user_approval:security-migration-publication"));

	const publicationBlocked = await writeValidationReport(project, {
		profile: "publication",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Publication cannot pass without explicit user approval.",
		source: semanticImplementation.path,
		audit_refs: publicationAuditRefs,
		isolation: { role: "validator", fresh_context: true, clean: true, published_sha: "def5678", package_digest: "sha256:package" },
	});
	assert.equal(publicationBlocked.data.verdict, "block");
	assert.ok(publicationBlocked.data.failed_criteria.includes("risk_approval"));
	assert.equal(publicationBlocked.data.failure_class, "risk_approval_missing");
	assert.equal(publicationBlocked.data.recommended_next_loop, "decision");

	const publicationPassed = await writeValidationReport(project, {
		profile: "publication",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Publication approval and proof present.",
		source: semanticImplementation.path,
		audit_refs: [...publicationAuditRefs, "approval:user"],
		isolation: { role: "validator", fresh_context: true, clean: true, published_sha: "def5678", package_digest: "sha256:package" },
	});
	assert.equal(publicationPassed.data.verdict, "pass");
	assert.equal(publicationPassed.data.preflight.risk.approval_evidence.includes("approval:user"), true);

	const destructivePreflight = buildValidationPreflight(project, {
		profile: "implementation",
		policy_profile: "destructive",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Destructive work requires approval.",
		source: semanticImplementation.path,
		audit_refs: implementationAuditRefs,
		isolation: { role: "validator", fresh_context: true, clean: false, working_tree_digest: "sha256:dirty" },
	});
	assert.equal(destructivePreflight.status, "escalate");
	assert.equal(destructivePreflight.risk.tier, "destructive");
} finally {
	await rm(root, { recursive: true, force: true });
}

console.log("✓ validation preflight smoke passed");
