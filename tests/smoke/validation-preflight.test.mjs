import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildValidationPreflight, writeImplementationBuild, writePlanningBuild, writeValidationReport } from "../../src/application/builds.ts";

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
	const planning = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Plan validation preflight risk policy.",
		source_decision_build: ".codewiki/builds/decision/accepted-validation-preflight.json",
		task_ids: ["TASK-777"],
		task_changes: ["TASK-777 covers validation preflight."],
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
