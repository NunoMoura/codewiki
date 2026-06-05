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
import { decisionTableFixture } from "../decision-table-fixture.mjs";
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
		decision_table: decisionTableFixture([
			{
				id: "VAL-PREFLIGHT",
				current_state: "Gateway preflight is weaker.",
				desired_state: "Gateway preflight enforces semantic metadata.",
				rationale: "Smoke coverage needs accepted intent.",
				affected_layers: ["system", "roadmap", "code"],
				user_action: "approved",
			},
		]),
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
	assert.equal(missingMetadata.remediation.retry_class, "same_loop");
	assert.equal(missingMetadata.remediation.remediation_route, "implementation");
	assert.ok(
		missingMetadata.remediation.affected_refs.includes("audit:alignment"),
	);
	assert.ok(
		missingMetadata.diagnostics.every((diagnostic) => diagnostic.retry_class),
	);
	assert.ok(
		missingMetadata.diagnostics.every(
			(diagnostic) => diagnostic.affected_refs.length > 0,
		),
	);

	const taskCloseWithoutShipReady = buildGatewayPreflight(project, {
		profile: "task-close",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Task close needs implementation validation and ship-ready.",
		source: semanticImplementation.path,
		audit_refs: taskCloseAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			published_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			tree_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		},
	});
	assert.equal(taskCloseWithoutShipReady.status, "blocked");
	assert.ok(
		taskCloseWithoutShipReady.missing.validation_evidence.includes(
			"implementation_validation:pass",
		),
	);
	assert.ok(
		taskCloseWithoutShipReady.missing.task_close_ship_ready.includes(
			"ship_ready_validation:task:TASK-777",
		),
	);

	const noTestImplementation = await writeImplementationBuild(project, {
		kind: "implementation",
		summary: "Code change without executable tests.",
		source_planning_build: planning.path,
		task_id: "TASK-777",
		change_type: "code",
		code_files: ["src/no-test-fixture.ts"],
		checks_run: ["npm run typecheck: pass"],
		acceptance_mapping: [
			{
				criterion: "Executable code tests required",
				evidence: "Typecheck alone is insufficient for code behavior.",
			},
		],
		closure_brief: {
			user_intent: "Prove task-close blocks missing tests.",
			implemented_changes: ["Changed executable code without tests."],
			acceptance_evidence: ["Preflight blocks missing tests."],
			checks: ["npm run typecheck: pass"],
		},
	});
	const noTestTaskClose = buildGatewayPreflight(project, {
		profile: "task-close",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Code-changing task-close needs executable test evidence.",
		source: noTestImplementation.path,
		audit_refs: taskCloseAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			head_sha: "notest",
			tree_sha: "notest-tree",
		},
	});
	assert.equal(noTestTaskClose.status, "blocked");
	assert.ok(
		noTestTaskClose.missing.code_tests.includes("code_tests:test_files"),
	);
	assert.ok(
		noTestTaskClose.missing.code_tests.includes(
			"code_tests:passing_test_check",
		),
	);

	const failedTestImplementation = await writeImplementationBuild(project, {
		kind: "implementation",
		summary: "Code change with failed executable tests.",
		source_planning_build: planning.path,
		task_id: "TASK-777",
		change_type: "code",
		test_files: ["tests/failing-fixture.test.mjs"],
		code_files: ["src/failing-fixture.ts"],
		checks_run: ["node tests/failing-fixture.test.mjs: fail"],
		acceptance_mapping: [
			{
				criterion: "Executable code tests required",
				evidence: "tests/failing-fixture.test.mjs covers the behavior.",
			},
		],
		closure_brief: {
			user_intent: "Prove task-close blocks failed tests.",
			implemented_changes: ["Changed executable code with failed tests."],
			acceptance_evidence: ["Preflight blocks failed tests."],
			checks: ["node tests/failing-fixture.test.mjs: fail"],
		},
	});
	const failedTestTaskClose = buildGatewayPreflight(project, {
		profile: "task-close",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Failed executable tests block task-close.",
		source: failedTestImplementation.path,
		audit_refs: taskCloseAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			head_sha: "failedtest",
			tree_sha: "failedtest-tree",
		},
	});
	assert.equal(failedTestTaskClose.status, "blocked");
	assert.ok(
		failedTestTaskClose.missing.code_tests.includes(
			"code_tests:failed_test_check",
		),
	);

	await writeGatewayReport(project, {
		profile: "implementation",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Implementation validation pass fixture.",
		source: semanticImplementation.path,
		audit_refs: implementationAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: false,
			working_tree_digest: "sha256:semantic-dirty",
		},
	});
	await writeGatewayReport(project, {
		profile: "ship-ready",
		task_id: "TASK-777",
		verdict: "pass",
		rationale:
			"Ship-ready validates the exact content candidate without approving publication.",
		source: semanticImplementation.path,
		audit_refs: [
			"audit:alignment",
			"audit:package",
			"audit:security",
			"audit:stale-reference",
		],
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			tree_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		},
	});
	const taskCloseReady = buildGatewayPreflight(project, {
		profile: "task-close",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Task close has implementation validation and ship-ready.",
		source: semanticImplementation.path,
		audit_refs: taskCloseAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			published_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			tree_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		},
	});
	assert.equal(taskCloseReady.status, "ready");
	assert.deepEqual(taskCloseReady.missing.code_tests, []);
	assert.deepEqual(taskCloseReady.missing.validation_evidence, []);
	assert.deepEqual(taskCloseReady.missing.task_close_ship_ready, []);

	const mismatchedTaskClose = buildGatewayPreflight(project, {
		profile: "task-close",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Task close ship-ready must match exact content.",
		source: semanticImplementation.path,
		audit_refs: taskCloseAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			head_sha: "cccccccccccccccccccccccccccccccccccccccc",
			published_sha: "cccccccccccccccccccccccccccccccccccccccc",
			tree_sha: "dddddddddddddddddddddddddddddddddddddddd",
		},
	});
	assert.equal(mismatchedTaskClose.status, "blocked");
	assert.ok(
		mismatchedTaskClose.missing.task_close_ship_ready.includes(
			"ship_ready_validation:content_mismatch",
		),
	);

	const shipReadyCandidate = buildGatewayPreflight(project, {
		profile: "ship-ready",
		task_id: "TASK-777",
		verdict: "pass",
		rationale: "Ship-ready checks quality, not publication approval.",
		source: semanticImplementation.path,
		audit_refs: [
			"audit:alignment",
			"audit:package",
			"audit:security",
			"audit:stale-reference",
		],
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			tree_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		},
	});
	assert.equal(shipReadyCandidate.status, "ready");
	assert.notEqual(
		shipReadyCandidate.risk.tier,
		"security-migration-publication",
	);
	assert.deepEqual(shipReadyCandidate.missing.user_approval, []);

	const localOnlyShipReadyImplementation = await writeImplementationBuild(
		project,
		{
			kind: "implementation",
			summary: "Local-only ship-ready fixture.",
			source_planning_build: planning.path,
			task_id: "TASK-777",
			change_type: "code",
			test_files: ["tests/smoke/gateway-preflight.test.mjs"],
			code_files: ["src/local-only-ship-ready.ts"],
			checks_run: ["npm run typecheck: pass"],
			acceptance_mapping: [
				{
					criterion: "Ship-ready validates local content quality",
					evidence:
						"npm run typecheck passes without implying package publication.",
				},
			],
			closure_brief: {
				user_intent: "Validate local content without publication approval.",
				implemented_changes: ["Changed local-only package source."],
				acceptance_evidence: ["Ship-ready preflight is ready."],
				checks: ["npm run typecheck: pass"],
			},
			publication: {
				push_readiness: {
					safe_to_push: false,
					blocked_reasons: ["remote approval not requested"],
				},
			},
		},
	);
	const localOnlyShipReady = buildGatewayPreflight(project, {
		profile: "ship-ready",
		task_id: "TASK-777",
		verdict: "pass",
		rationale:
			"Ship-ready validates commit quality but does not imply package or remote publication.",
		source: localOnlyShipReadyImplementation.path,
		audit_refs: [
			"audit:alignment",
			"audit:package",
			"audit:security",
			"audit:stale-reference",
		],
		checks: ["npm run typecheck: pass"],
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			tree_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		},
	});
	assert.equal(localOnlyShipReady.status, "ready");
	assert.deepEqual(localOnlyShipReady.missing.ship_ready, []);
	assert.deepEqual(localOnlyShipReady.missing.close_publication_blockers, []);

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
			published_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			tree_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
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
	assert.ok(semanticClosureBlocked.diagnostics.length > 0);
	assert.ok(
		semanticClosureBlocked.findings.some(
			(finding) => finding.category === "semantic-closure",
		),
	);
	assert.ok(
		semanticClosureBlocked.remediation.next_safe_actions.some((action) =>
			action.includes("planning"),
		),
	);

	await writeFile(
		join(root, project.graphPath),
		JSON.stringify(
			{
				views: {
					roadmap: { version: 1 },
					semantic_execution_closure: {
						version: 1,
						invariant: "generated_view_not_canonical_truth",
						scopes: { tasks: {} },
					},
				},
			},
			null,
			2,
		),
	);
	await mkdir(join(root, ".codewiki/roadmap"), { recursive: true });
	await writeFile(
		join(root, project.roadmapPath),
		JSON.stringify(
			{
				version: 1,
				updated: "2026-06-02T00:00:00Z",
				order: ["TASK-070", "TASK-777", "TASK-778"],
				tasks: {
					"TASK-070": {
						id: "TASK-070",
						title: "Daemon worker follow-up fixture",
						status: "done",
						priority: "medium",
						kind: "testing",
						summary: "Known task mapping fixture.",
						spec_paths: [],
						code_paths: ["src/daemon.ts"],
						research_ids: [],
						labels: ["daemon"],
						goal: {
							outcome: "done",
							acceptance: ["done"],
							non_goals: [],
							verification: ["test"],
						},
						delta: { desired: "", current: "", closure: "" },
						created: "2026-06-02",
						updated: "2026-06-02",
					},
					"TASK-777": {
						id: "TASK-777",
						title: "Gateway fixture",
						status: "done",
						priority: "high",
						kind: "testing",
						summary: "Gateway fixture done.",
						spec_paths: [],
						code_paths: ["src/gateway/report.ts"],
						research_ids: [],
						labels: ["gateway"],
						goal: {
							outcome: "done",
							acceptance: ["done"],
							non_goals: [],
							verification: ["test"],
						},
						delta: { desired: "", current: "", closure: "" },
						created: "2026-06-02",
						updated: "2026-06-02",
					},
					"TASK-778": {
						id: "TASK-778",
						title: "Cancelled fixture",
						status: "cancelled",
						priority: "medium",
						kind: "testing",
						summary: "Cancelled fixture.",
						spec_paths: [],
						code_paths: [],
						research_ids: [],
						labels: ["gateway"],
						goal: {
							outcome: "cancelled",
							acceptance: ["cancelled"],
							non_goals: [],
							verification: ["review"],
						},
						delta: { desired: "", current: "", closure: "" },
						created: "2026-06-02",
						updated: "2026-06-02",
					},
				},
				sprints: {
					"SPRINT-777": {
						id: "SPRINT-777",
						title: "Gateway sprint fixture",
						status: "active",
						outcome:
							"Gateway sprint closes only after shared outcome reconciliation.",
						task_ids: ["TASK-777", "TASK-778"],
						budget: { risk: "medium" },
						gates: ["sprint-close", "ship-ready"],
						created: "2026-06-02",
						updated: "2026-06-02",
					},
				},
			},
			null,
			2,
		),
	);
	const sprintWithoutShipReady = buildGatewayPreflight(project, {
		profile: "sprint-close",
		sprint_id: "SPRINT-777",
		verdict: "pass",
		rationale: "Sprint close needs reconciliation and ship-ready quality.",
		source: semanticImplementation.path,
		audit_refs: ["audit:alignment", "audit:changed", "audit:generated-parity"],
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			head_sha: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
			published_sha: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
			tree_sha: "ffffffffffffffffffffffffffffffffffffffff",
		},
	});
	assert.equal(sprintWithoutShipReady.status, "blocked");
	assert.ok(
		sprintWithoutShipReady.missing.sprint_close.includes(
			"sprint:SPRINT-777:risk_reconciliation_evidence",
		),
	);
	assert.ok(
		sprintWithoutShipReady.missing.sprint_close.includes(
			"sprint:SPRINT-777:ship_ready_validation",
		),
	);

	await writeGatewayReport(project, {
		profile: "ship-ready",
		sprint_id: "SPRINT-777",
		verdict: "pass",
		rationale:
			"Sprint content candidate is ship-ready; no publication implied.",
		source: semanticImplementation.path,
		audit_refs: [
			"audit:alignment",
			"audit:package",
			"audit:security",
			"audit:stale-reference",
		],
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			head_sha: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
			tree_sha: "ffffffffffffffffffffffffffffffffffffffff",
		},
	});
	const sprintReady = buildGatewayPreflight(project, {
		profile: "sprint-close",
		sprint_id: "SPRINT-777",
		verdict: "pass",
		rationale:
			"Sprint close has closed tasks, reconciliation, and ship-ready quality.",
		source: semanticImplementation.path,
		checks: ["sprint risk reconciliation: shared outcome and risks reconciled"],
		audit_refs: ["audit:alignment", "audit:changed", "audit:generated-parity"],
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			head_sha: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
			published_sha: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
			tree_sha: "ffffffffffffffffffffffffffffffffffffffff",
		},
	});
	assert.equal(sprintReady.status, "ready");
	assert.deepEqual(sprintReady.missing.sprint_close, []);

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
		decision_table: decisionTableFixture([
			{
				id: "UNMAPPED-ROW",
				current_state: "Question-only planning can pass.",
				desired_state: "Question-only planning must fail.",
				rationale: "Regression fixture.",
				affected_layers: ["roadmap", "code"],
				user_action: "approved",
			},
		]),
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
		decision_table: decisionTableFixture([
			{
				id: "PENDING-APPROVED",
				current_state: "Pending rows can be promoted.",
				desired_state: "Pending rows cannot be promoted.",
				rationale: "Regression fixture.",
				affected_layers: ["system"],
				user_action: "pending",
			},
		]),
		approved_decision_rows: ["PENDING-APPROVED"],
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
			entry.includes("approval_not_approved"),
		),
	);
	assert.equal(
		pendingApprovedPreflight.routing.recommended_next_loop,
		"decision",
	);

	const deferredDecision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accept knowledge-only and deferred propagation fixture.",
		decision_table: decisionTableFixture([
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
				current_state: "Non-executable policy target undecided.",
				desired_state:
					"Non-executable policy note can be deferred with owner and trigger.",
				rationale: "No safe target yet.",
				affected_layers: ["knowledge"],
				user_action: "approved",
			},
		]),
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
		rationale:
			"Knowledge-only and non-executable deferred rows are fully resolved.",
		source: deferredPlan.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(deferredPreflight.status, "ready");
	assert.deepEqual(deferredPreflight.missing.decision_propagation, []);

	const executableDeferredDecision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accept daemon worker scheduling follow-up fixture.",
		decision_table: decisionTableFixture([
			{
				id: "DAEMON-WORKER-FOLLOWUP",
				current_state:
					"Daemon execution graph follow-up can hide in build-only deferral after TASK-070.",
				desired_state:
					"Daemon execution graph and worker scheduling follow-up must have durable roadmap/sprint work.",
				rationale: "TASK-072 regression fixture.",
				affected_layers: ["runtime", "graph", "code"],
				user_action: "approved",
			},
		]),
		row_to_kb_mappings: [
			{
				row_id: "DAEMON-WORKER-FOLLOWUP",
				knowledge_refs: [".codewiki/kb/system/graph.md"],
				evidence:
					"Graph docs capture daemon execution graph and worker scheduling follow-up.",
			},
		],
		propagation: {
			direction: "system-first",
			product_impact: ["Agents see daemon follow-up planning gaps."],
			downstream_planning_questions: [
				"How should daemon worker scheduling follow-up continue after TASK-070?",
			],
		},
		knowledge_changes: [".codewiki/kb/system/graph.md"],
	});
	await writeGatewayPass("decision", executableDeferredDecision.path);
	const executableDeferredPlan = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Defer daemon worker scheduling follow-up without roadmap work.",
		source_decision_build: executableDeferredDecision.path,
		decision_row_resolutions: [
			{
				row_id: "DAEMON-WORKER-FOLLOWUP",
				resolution: "deferred",
				owner: "runtime-maintainers",
				trigger: "TASK-070 runtime scheduler foundation validates",
				rationale: "Wait for TASK-070 proof before follow-up.",
				evidence:
					"Build-only deferred daemon execution graph / worker scheduling follow-up after TASK-070.",
				source_refs: [
					"TASK-070",
					".codewiki/builds/implementation/2026-05-31-implemented-task-070-runtime-scheduler-foundatio.json",
				],
			},
		],
		downstream_question_resolutions: [
			{
				question:
					"How should daemon worker scheduling follow-up continue after TASK-070?",
				resolution: "deferred",
				owner: "runtime-maintainers",
				trigger: "TASK-070 runtime scheduler foundation validates",
				rationale: "Same deferral as row.",
				evidence: "Question is deferred in build evidence only.",
				source_refs: ["TASK-070"],
			},
		],
	});
	const executableDeferredBlocked = buildGatewayPreflight(project, {
		profile: "planning",
		verdict: "pass",
		rationale:
			"Executable deferred rows must map to durable roadmap/sprint work.",
		source: executableDeferredPlan.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(executableDeferredBlocked.status, "blocked");
	assert.ok(
		executableDeferredBlocked.missing.decision_propagation.some(
			(entry) =>
				entry.includes("DAEMON-WORKER-FOLLOWUP") &&
				entry.includes("executable_requires_task_or_sprint"),
		),
	);
	assert.equal(executableDeferredBlocked.routing.failure_class, "planning_gap");
	const executableMappedPlan = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Map daemon worker scheduling follow-up to roadmap work.",
		source_decision_build: executableDeferredDecision.path,
		decision_row_resolutions: [
			{
				row_id: "DAEMON-WORKER-FOLLOWUP",
				resolution: "roadmap-task",
				task_ids: ["TASK-070"],
				evidence:
					"TASK-070 owns durable daemon execution graph and worker scheduling follow-up.",
				source_refs: ["TASK-070"],
			},
		],
		downstream_question_resolutions: [
			{
				question:
					"How should daemon worker scheduling follow-up continue after TASK-070?",
				resolution: "roadmap-task",
				task_ids: ["TASK-070"],
				evidence: "TASK-070 is the durable follow-up route.",
				source_refs: ["TASK-070"],
			},
		],
	});
	const executableMappedPreflight = buildGatewayPreflight(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Executable rows with task mapping can pass.",
		source: executableMappedPlan.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(executableMappedPreflight.status, "ready");
	assert.deepEqual(executableMappedPreflight.missing.decision_propagation, []);

	await mkdir(join(root, ".codewiki/kb/system/diagrams"), { recursive: true });
	await writeFile(
		join(root, ".codewiki/kb/system/diagrams/file-structure-map.yaml"),
		`version: 1\nid: file-structure-map\ntitle: File structure\ncategories: [approved_migration_delta]\nnodes:\n  - id: deferred_concept_roots\n    label: Deferred concept roots after agency pilot\n    group: drift\n    kind: policy\n    status: accepted_target\n    defer_status: trigger_satisfied_needs_followup_planning\n    trigger_state: satisfied_by_TASK_015_task_close\n    trigger: agency pilot task-close validation and compatibility evidence\n    paths: [src/audit/**]\nedges: []\n`,
	);
	const triggerSatisfiedDecision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accept trigger-satisfied deferred propagation fixture.",
		decision_table: decisionTableFixture([
			{
				id: "TRIGGER-DEFER",
				current_state: "Deferred work can remain hidden after trigger.",
				desired_state: "Satisfied deferral trigger routes to planning.",
				rationale: "Regression fixture.",
				affected_layers: ["knowledge"],
				user_action: "approved",
			},
		]),
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
			published_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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
			published_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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
			published_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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
