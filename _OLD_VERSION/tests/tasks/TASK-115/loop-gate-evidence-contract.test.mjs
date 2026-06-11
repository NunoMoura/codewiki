import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	writeDecisionBuild,
	writeImplementationBuild,
	writePlanningBuild,
} from "../../../src/build/writer.ts";
import {
	buildGatewayPreflight,
	writeGatewayReport,
} from "../../../src/gateway/report.ts";
import {
	loopGateOwnershipContracts,
	loopGateOwnershipFor,
} from "../../../src/gateway/loop-contracts.ts";

function projectFixture(root) {
	return {
		root,
		label: "task-115-fixture",
		config: { project_name: "task-115-fixture", schema_version: 4 },
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

const root = await mkdtemp(join(tmpdir(), "codewiki-task-115-"));
const project = projectFixture(root);

try {
	await mkdir(resolve(root, ".codewiki/kb/system/diagrams"), {
		recursive: true,
	});
	await writeFile(
		resolve(root, ".codewiki/kb/system/source.md"),
		"---\nid: spec.system.source\ntitle: Source\nstate: active\n---\n",
	);

	const catalog = loopGateOwnershipContracts();
	assert.deepEqual(
		catalog.loops.map((contract) => contract.loop),
		["decision", "planning", "implementation"],
	);
	assert.equal(catalog.publication_owner, "implementation");
	assert.equal(catalog.dogfood_special_case_allowed, false);
	assert.ok(catalog.evidence_providers.includes("tests"));
	assert.ok(catalog.evidence_providers.includes("linters"));
	assert.ok(catalog.forbidden_loop_roots.includes("src/validation"));
	assert.ok(catalog.forbidden_loop_roots.includes("src/publish"));
	assert.equal(loopGateOwnershipFor("decision").semantic_truth_owner, true);
	assert.equal(loopGateOwnershipFor("planning").work_truth_owner, true);
	assert.equal(
		loopGateOwnershipFor("implementation").code_evidence_owner,
		true,
	);
	for (const forbidden of catalog.forbidden_loop_roots) {
		assert.equal(
			existsSync(resolve(process.cwd(), forbidden)),
			false,
			forbidden,
		);
	}

	const noImpactDecision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accept a no-KB-impact semantic decision.",
		decision_table: [
			{
				id: "ROW-NO-KB",
				current_state: "Decision gate requires KB mapping only.",
				desired_state:
					"Decision gate also accepts explicit no-KB-impact rationale.",
				agreed_change:
					"Allow no-KB-impact rationale when no semantic KB change is required.",
				expected_final_state: "Decision can pass without invented KB edits.",
				rationale:
					"Some accepted choices only affect roadmap or evidence ownership.",
				affected_layers: ["decision", "gateway"],
				user_action: "approved",
			},
		],
		approved_decision_rows: ["ROW-NO-KB"],
		row_to_kb_mappings: [
			{
				row_id: "ROW-NO-KB",
				knowledge_refs: [],
				diagram_refs: [],
				no_kb_impact: "This fixture row only proves gate ownership behavior.",
				evidence: "No semantic KB update needed for fixture.",
			},
		],
		propagation: {
			direction: "system-first",
			no_product_impact: "Fixture only changes gate semantics.",
		},
		non_goals: [
			"Do not implement source changes during decision fixture setup.",
		],
		risks: ["Fixture risk: no-impact decisions can be over-constrained."],
	});
	const noImpactPreflight = buildGatewayPreflight(project, {
		profile: "decision",
		verdict: "pass",
		rationale: "No-KB-impact mapping should pass decision preflight.",
		source: noImpactDecision.path,
		audit_refs: ["audit:alignment", "audit:stale-reference"],
		checks: ["explicit approval by user: fixture"],
	});
	assert.equal(noImpactPreflight.status, "ready");
	assert.deepEqual(noImpactPreflight.missing.decision_mappings, []);

	const missingMappingDecision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accept an unmapped semantic decision.",
		decision_table: [
			{
				id: "ROW-MISSING-KB",
				current_state: "Decision gate can pass without mapping.",
				desired_state: "Decision gate blocks missing KB/no-impact mapping.",
				agreed_change: "Require mapping or no-impact rationale.",
				expected_final_state: "Decision gate reports missing mapping.",
				rationale: "Semantic truth needs ownership.",
				affected_layers: ["decision", "gateway"],
				user_action: "approved",
			},
		],
		approved_decision_rows: ["ROW-MISSING-KB"],
		row_to_kb_mappings: [
			{
				row_id: "ROW-MISSING-KB",
				knowledge_refs: [],
				diagram_refs: [],
				evidence: "Missing ownership rationale.",
			},
		],
		propagation: {
			direction: "system-first",
			no_product_impact: "Fixture only changes gate semantics.",
		},
	});
	const missingMappingPreflight = buildGatewayPreflight(project, {
		profile: "decision",
		verdict: "pass",
		rationale: "Missing mapping should block.",
		source: missingMappingDecision.path,
		audit_refs: ["audit:alignment", "audit:stale-reference"],
		checks: ["explicit approval by user: fixture"],
	});
	assert.equal(missingMappingPreflight.status, "blocked");
	assert.ok(
		missingMappingPreflight.missing.decision_mappings.includes(
			"decision_row:ROW-MISSING-KB:missing_knowledge_or_no_impact_mapping",
		),
	);

	const stalePlanning = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Planning found stale semantic truth.",
		source_decision_build: noImpactDecision.path,
		open_questions: ["KB current state conflicts with approved decision row."],
		decision_row_resolutions: [
			{
				row_id: "ROW-NO-KB",
				resolution: "roadmap-task",
				task_ids: ["TASK-115"],
				evidence: "Planning needs decision route-back before implementation.",
			},
		],
		roadmap_reconciliation: [
			{
				state: "active-roadmap",
				row_ids: ["ROW-NO-KB"],
				task_ids: ["TASK-115"],
				evidence: "Roadmap owner exists.",
			},
		],
	});
	const stalePlanningPreflight = buildGatewayPreflight(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Planning with open semantic questions routes back to decision.",
		source: stalePlanning.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(stalePlanningPreflight.status, "blocked");
	assert.ok(stalePlanningPreflight.missing.ambiguity.length > 0);

	const executableDecision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accepted executable row needs planning-owned work.",
		decision_mode: "accepted",
		decision_table: [
			{
				id: "ROW-EXEC",
				current_state: "Gateway contract is implicit.",
				desired_state: "Gateway contract is enforced in source.",
				status: "approved",
				rationale: "Executable source change accepted.",
				affected_layers: ["code"],
			},
		],
		approved_decision_rows: ["ROW-EXEC"],
		row_to_kb_mappings: [
			{
				row_id: "ROW-EXEC",
				knowledge_refs: [".codewiki/kb/system/validation-gateway.md"],
				diagram_refs: [".codewiki/kb/system/diagrams/component-map.yaml"],
				evidence: "Semantic gate ownership maps to gateway docs and diagrams.",
			},
		],
		propagation: {
			direction: "system-first",
			system_impact: ["Gateway source contract changes."],
			no_product_impact: "Fixture changes package workflow internals only.",
			downstream_planning_questions: ["Plan TASK-115 gateway contract work."],
		},
		knowledge_changes: [".codewiki/kb/system/validation-gateway.md"],
		non_goals: [
			"Do not implement source changes during decision fixture setup.",
		],
		risks: [
			"Fixture risk: executable gate work can lack durable planning ownership.",
		],
	});
	await writeGatewayReport(project, {
		profile: "decision",
		verdict: "pass",
		rationale: "Executable decision has semantic KB/diagram ownership.",
		source: executableDecision.path,
		audit_refs: ["audit:alignment", "audit:stale-reference"],
		checks: ["explicit approval by user: fixture"],
	});
	const executableWithoutWork = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Executable row incorrectly marked knowledge-only.",
		source_decision_build: executableDecision.path,
		decision_row_resolutions: [
			{
				row_id: "ROW-EXEC",
				resolution: "knowledge-only",
				evidence: "Fixture tries to avoid planning-owned work.",
				source_refs: [executableDecision.path],
			},
		],
		roadmap_reconciliation: [
			{
				state: "active-roadmap",
				row_ids: ["ROW-EXEC"],
				evidence:
					"Missing task/sprint/work-unit ownership is intentional fixture drift.",
			},
		],
	});
	const executableWithoutWorkPreflight = buildGatewayPreflight(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Executable rows need planning-owned work.",
		source: executableWithoutWork.path,
		audit_refs: ["audit:alignment"],
	});
	assert.equal(executableWithoutWorkPreflight.status, "blocked");
	assert.ok(
		executableWithoutWorkPreflight.missing.decision_propagation.some((entry) =>
			entry.includes("ROW-EXEC:executable_requires_task_or_sprint"),
		),
	);

	const executablePlan = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Executable row owns roadmap work.",
		source_decision_build: executableDecision.path,
		decision_row_resolutions: [
			{
				row_id: "ROW-EXEC",
				resolution: "roadmap-task",
				task_ids: ["TASK-115"],
				evidence: "TASK-115 owns executable gate/source contract work.",
				source_refs: [executableDecision.path],
			},
		],
		roadmap_reconciliation: [
			{
				state: "active-roadmap",
				row_ids: ["ROW-EXEC"],
				task_ids: ["TASK-115"],
				evidence: "Roadmap work is owned by TASK-115.",
			},
		],
		task_ids: ["TASK-115"],
		candidate_code_paths: ["src/gateway/loop-contracts.ts"],
		candidate_test_files: [
			"tests/tasks/TASK-115/loop-gate-evidence-contract.test.mjs",
		],
	});
	await writeGatewayReport(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Planning owns executable decomposition.",
		source: executablePlan.path,
		audit_refs: ["audit:alignment"],
	});
	await writeFile(
		resolve(root, ".codewiki/index_graph.json"),
		JSON.stringify(
			{
				lenses: {
					lint: {
						issues: [
							{
								severity: "warning",
								kind: "source-contract",
								path: "src/validation/index.ts",
								message:
									"Validation loop/root drift lacks durable roadmap coverage.",
								refs: ["src/gateway/loop-contracts.ts"],
							},
						],
					},
				},
			},
			null,
			2,
		) + "\n",
	);
	const implementation = await writeImplementationBuild(project, {
		kind: "implementation",
		summary: "Implement TASK-115 gate/source contract.",
		source_planning_build: executablePlan.path,
		task_id: "TASK-115",
		code_files: ["src/gateway/loop-contracts.ts"],
		test_files: ["tests/tasks/TASK-115/loop-gate-evidence-contract.test.mjs"],
		checks_run: [
			"node --experimental-strip-types tests/tasks/TASK-115/loop-gate-evidence-contract.test.mjs",
		],
		acceptance_mapping: [
			{
				criterion: "Loop gate ownership contract is source-owned.",
				evidence:
					"Implementation build cites source contract and targeted tests.",
			},
		],
		closure_brief: {
			user_intent: "Implement loop-owned gate/source-of-truth contracts.",
			implemented_changes: ["Gateway contract source and tests updated."],
			acceptance_evidence: ["Targeted TASK-115 test fixture."],
			checks: ["targeted TASK-115 test"],
		},
	});
	const implementationPreflight = buildGatewayPreflight(project, {
		profile: "implementation",
		task_id: "TASK-115",
		verdict: "pass",
		rationale:
			"Unowned source-contract drift should block implementation close.",
		source: implementation.path,
		audit_refs: ["audit:alignment", "audit:changed"],
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: false,
			working_tree_digest: "sha256:task-115-fixture",
		},
	});
	assert.equal(implementationPreflight.status, "blocked");
	assert.ok(
		implementationPreflight.missing.residual_issue_coverage.some((entry) =>
			entry.includes("source-contract:src/validation/index.ts"),
		),
	);
	assert.equal(
		implementationPreflight.loop_gate_ownership.criteria_owner_loop,
		"implementation",
	);
	assert.deepEqual(
		implementationPreflight.loop_gate_ownership.evidence_provider_role,
		{
			tests: "evidence-provider",
			linters: "evidence-provider",
			audits: "evidence-provider",
			criteria_owner: "implementation",
		},
	);

	const publicationPreflight = buildGatewayPreflight(project, {
		profile: "publication",
		task_id: "TASK-115",
		verdict: "pass",
		rationale: "Publication compatibility stays implementation-owned.",
		source: implementation.path,
		audit_refs: ["audit:package", "audit:security"],
		checks: ["approval:user fixture"],
		isolation: {
			role: "publisher",
			fresh_context: true,
			clean: true,
			published_sha: "abc1234",
			package_digest: "sha256:package-fixture",
		},
	});
	assert.equal(
		publicationPreflight.loop_gate_ownership.criteria_owner_loop,
		"implementation",
	);
	assert.equal(
		publicationPreflight.loop_gate_ownership.compatibility_gate,
		"ship-ready",
	);
	assert.equal(
		publicationPreflight.loop_gate_ownership.publication_owner,
		"implementation",
	);
} finally {
	await rm(root, { recursive: true, force: true });
}
