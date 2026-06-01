import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildGatewayPreflight } from "../../../src/gateway/report.ts";
import { VALIDATION_GATE_VALUES, normalizeValidationGate } from "../../../src/gateway/types.ts";

async function writeJson(path, data) {
	await mkdir(resolve(path, ".."), { recursive: true });
	await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

const root = await mkdtemp(resolve(tmpdir(), "codewiki-task-073-gates-"));
const project = {
	root,
	roadmapPath: ".codewiki/roadmap/queue.json",
	graphPath: ".codewiki/index_graph.json",
};
const buildPath = ".codewiki/builds/implementation/ship-ready-fixture.json";
const build = {
	kind: "implementation_build",
	status: "accepted",
	task_id: "TASK-200",
	change_type: "code",
	traceability: {
		exemption: "mechanical",
		semantic: false,
		requires_accepted_build: false,
	},
	code_files: ["package.json"],
	test_files: ["tests/smoke/policy-gate.test.mjs"],
	checks_run: ["npm run typecheck: pass", "npm run test:smoke: pass"],
	audit_refs: ["alignment", "package", "security", "stale-reference"],
	acceptance_mapping: [
		{ criterion: "ship-ready fixture", evidence: "package content ready" },
	],
	closure_brief: {
		user_intent: "ship-ready fixture",
		implemented_changes: ["prepared package content"],
		acceptance_evidence: ["package content ready"],
		checks: ["npm run typecheck", "npm run test:smoke"],
	},
	produces: { publication: ["package"] },
	publication: { target: "package" },
};
const baseIsolation = {
	fresh_context: true,
	clean: true,
	validated_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	tree_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
};

try {
	await writeJson(resolve(root, buildPath), build);
	await writeJson(resolve(root, ".codewiki/roadmap/queue.json"), {
		version: 1,
		order: ["TASK-OPEN"],
		tasks: {
			"TASK-OPEN": {
				id: "TASK-OPEN",
				title: "Open sprint task",
				status: "in_progress",
			},
		},
		sprints: {
			"SPRINT-200": {
				id: "SPRINT-200",
				title: "Gate fixture sprint",
				status: "active",
				outcome: "Close a sprint cohort only after tasks and shared risks clear.",
				task_ids: ["TASK-OPEN"],
				budget: { risk: "high" },
			},
			"SPRINT-201": {
				id: "SPRINT-201",
				title: "Closed fixture sprint",
				status: "active",
				outcome: "Closed cohort fixture.",
				task_ids: ["TASK-CLOSED"],
				budget: { risk: "low" },
			},
		},
	});
	await mkdir(resolve(root, ".codewiki/roadmap"), { recursive: true });
	await writeFile(
		resolve(root, ".codewiki/roadmap/archive.jsonl"),
		JSON.stringify({ id: "TASK-CLOSED", task: { id: "TASK-CLOSED", status: "closed" } }) + "\n",
		"utf8",
	);
	await writeJson(resolve(root, ".codewiki/index_graph.json"), {
		version: 1,
		views: {
			roadmap: { open_task_ids: ["TASK-OPEN"] },
			decision_propagation: { residuals: [], residual_count: 0 },
			semantic_execution_closure: { scopes: { tasks: {} } },
		},
	});

	assert.deepEqual(VALIDATION_GATE_VALUES, [
		"decision",
		"planning",
		"implementation",
		"task-close",
		"sprint-close",
		"ship-ready",
	]);
	assert.equal(normalizeValidationGate("publication"), "ship-ready");
	assert.equal(normalizeValidationGate("release"), "ship-ready");

	const compatibility = buildGatewayPreflight(project, {
		profile: "publication",
		verdict: "pass",
		rationale: "legacy publication profile remains accepted",
		source: buildPath,
		audit_refs: ["alignment", "package", "security"],
		checks: ["approval:user accepted ship-ready fixture", "target: package"],
		isolation: { ...baseIsolation, package_digest: "pkg123" },
	});
	assert.equal(compatibility.gate, "ship-ready");
	assert.equal(compatibility.input_profile, "publication");
	assert.equal(compatibility.status, "ready");
	assert.deepEqual(compatibility.missing.audit_evidence, []);

	const sprintBlocked = buildGatewayPreflight(project, {
		profile: "sprint-close",
		sprint_id: "SPRINT-200",
		verdict: "pass",
		rationale: "sprint cannot close with open task and shared risk",
		audit_refs: ["alignment", "changed", "generated-parity"],
		checks: [],
		isolation: { ...baseIsolation },
	});
	assert.equal(sprintBlocked.status, "blocked");
	assert.ok(
		sprintBlocked.missing.sprint_close.includes(
			"sprint:SPRINT-200:task:TASK-OPEN:not_closed",
		),
	);
	assert.ok(
		sprintBlocked.missing.sprint_close.includes(
			"sprint:SPRINT-200:shared_risk_approval",
		),
	);

	const sprintReady = buildGatewayPreflight(project, {
		profile: "sprint-close",
		sprint_id: "SPRINT-201",
		verdict: "pass",
		rationale: "closed sprint fixture can pass",
		audit_refs: ["alignment", "changed", "generated-parity"],
		checks: ["approval:user closed low-risk fixture"],
		isolation: { ...baseIsolation },
	});
	assert.equal(sprintReady.status, "ready");
	assert.deepEqual(sprintReady.missing.sprint_close, []);

	const shipMissingProof = buildGatewayPreflight(project, {
		profile: "ship-ready",
		verdict: "pass",
		rationale: "ship-ready package target requires package digest",
		source: buildPath,
		audit_refs: ["alignment", "package", "security", "stale-reference"],
		checks: ["approval:user accepted ship-ready fixture", "target: package"],
		isolation: { ...baseIsolation },
	});
	assert.equal(shipMissingProof.status, "blocked");
	assert.ok(shipMissingProof.missing.ship_ready.includes("package_digest"));

	const shipReady = buildGatewayPreflight(project, {
		profile: "ship-ready",
		verdict: "pass",
		rationale: "ship-ready package target has exact proof",
		source: buildPath,
		audit_refs: ["alignment", "package", "security", "stale-reference"],
		checks: ["approval:user accepted ship-ready fixture", "target: package"],
		isolation: { ...baseIsolation, package_digest: "pkg123" },
	});
	assert.equal(shipReady.status, "ready");
	assert.deepEqual(shipReady.missing.ship_ready, []);
} finally {
	await rm(root, { recursive: true, force: true });
}

console.log("✓ TASK-073 gateway gates smoke passed");
