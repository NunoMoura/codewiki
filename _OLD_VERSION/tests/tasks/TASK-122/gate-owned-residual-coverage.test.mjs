import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGatewayPreflight } from "../../../src/gateway/report.ts";
import { buildLintReport } from "../../../src/state/lint.ts";
import { lintHealth } from "../../../src/state/builders.ts";

function project(root) {
	return {
		root,
		label: "task-122-residual-coverage",
		config: { project_name: "task-122-residual-coverage", schema_version: 4 },
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

async function writeFixture(root, issue) {
	await mkdir(join(root, ".codewiki/roadmap"), { recursive: true });
	await mkdir(join(root, ".codewiki/builds/implementation"), {
		recursive: true,
	});
	await writeFile(
		join(root, ".codewiki/roadmap/queue.json"),
		JSON.stringify(
			{
				version: 2,
				tasks: {
					"TASK-999": {
						id: "TASK-999",
						status: "todo",
						title: "Own residual coverage fixture",
						summary: "Own gate-owned residual coverage fixture warnings.",
						labels: ["roadmap-missing-code-path"],
						spec_paths: [".codewiki/kb/system/validation-gateway.md"],
						code_paths: ["tests/tasks/TASK-999/**"],
					},
				},
				sprints: {},
			},
			null,
			2,
		),
	);
	await writeFile(
		join(root, ".codewiki/index_graph.json"),
		JSON.stringify(
			{
				version: 1,
				generated_at: "2026-06-07T00:00:00.000Z",
				nodes: [],
				edges: [],
				lenses: {
					lint: {
						generated_at: "2026-06-07T00:00:00.000Z",
						issues: [issue],
						counts: {},
					},
				},
			},
			null,
			2,
		),
	);
	const buildPath = ".codewiki/builds/implementation/fixture.json";
	await writeFile(
		join(root, buildPath),
		JSON.stringify(
			{
				kind: "implementation_build",
				task_id: "TASK-999",
				traceability: { semantic: false, exemption: "mechanical" },
				code_files: ["src/gateway/report.ts"],
				test_files: [
					"tests/tasks/TASK-122/gate-owned-residual-coverage.test.mjs",
				],
				checks_run: [
					"node --experimental-strip-types ./tests/tasks/TASK-122/gate-owned-residual-coverage.test.mjs",
				],
				acceptance_mapping: [
					{ criterion: "Residual coverage", evidence: "Fixture." },
				],
				closure_brief: {
					user_intent: "Validate residual coverage.",
					implemented_changes: ["Fixture."],
					acceptance_evidence: ["Fixture."],
					checks: ["Fixture."],
				},
			},
			null,
			2,
		),
	);
	return buildPath;
}

const root = await mkdtemp(join(tmpdir(), "codewiki-task-122-"));
try {
	const unownedIssue = {
		severity: "warning",
		kind: "source-contract",
		path: "src/gateway/report.ts",
		message: "Gate report source contract changed without residual coverage.",
	};
	const source = await writeFixture(root, unownedIssue);
	const baseInput = {
		profile: "implementation",
		task_id: "TASK-999",
		verdict: "pass",
		rationale: "Residual coverage fixture.",
		source,
		audit_refs: ["audit:alignment", "audit:changed"],
		isolation: {
			fresh_context: true,
			clean: false,
			working_tree_digest: "sha256:dirty",
		},
	};

	const missing = buildGatewayPreflight(project(root), baseInput);
	assert.equal(missing.status, "blocked");
	assert.ok(
		missing.missing.residual_issue_coverage.some((gap) =>
			gap.includes("source-contract"),
		),
		"unowned actionable finding in gate scope should block promotion",
	);
	assert.equal(
		missing.residual_issue_coverage.items[0].ownership_state,
		"unowned_actionable",
	);

	const covered = buildGatewayPreflight(project(root), {
		...baseInput,
		residual_issue_coverage: [
			{
				issue_kind: "source-contract",
				path: "src/gateway/report.ts",
				classification: "covered_by_task",
				task_id: "TASK-999",
				evidence:
					"TASK-999 owns this planned missing path until implementation creates it.",
			},
		],
	});
	assert.equal(covered.missing.residual_issue_coverage.length, 0);
	assert.equal(
		covered.residual_issue_coverage.items[0].ownership_state,
		"covered_by_task",
	);

	const timeOnly = buildGatewayPreflight(project(root), {
		...baseInput,
		residual_issue_coverage: [
			{
				issue_kind: "source-contract",
				path: "src/gateway/report.ts",
				classification: "accepted_compatibility",
				expires_at: "2026-12-31T00:00:00.000Z",
				evidence: "Time alone should not cover residual drift.",
			},
		],
	});
	assert.ok(
		timeOnly.missing.residual_issue_coverage.some((gap) =>
			gap.includes("source-contract"),
		),
		"time-only compatibility coverage must not satisfy residual ownership",
	);

	const outOfScopeRoot = await mkdtemp(
		join(tmpdir(), "codewiki-task-122-out-"),
	);
	const outOfScopeSource = await writeFixture(outOfScopeRoot, {
		severity: "warning",
		kind: "source-contract",
		path: "src/unrelated.ts",
		message: "Unrelated source contract warning.",
	});
	const outOfScope = buildGatewayPreflight(project(outOfScopeRoot), {
		...baseInput,
		source: outOfScopeSource,
	});
	assert.equal(
		outOfScope.missing.residual_issue_coverage.length,
		0,
		"residual coverage only applies to gate scope, not unrelated warnings",
	);
	await rm(outOfScopeRoot, { recursive: true, force: true });

	const lintReport = buildLintReport(
		root,
		project(root),
		[],
		[
			{
				id: "TASK-999",
				status: "todo",
				title: "Own residual coverage fixture",
				summary: "Own roadmap missing code path warnings.",
				priority: "high",
				kind: "architecture",
				labels: ["roadmap-missing-code-path"],
				spec_paths: [],
				code_paths: ["tests/tasks/TASK-999/**"],
				goal: { outcome: "", acceptance: [], non_goals: [], verification: [] },
			},
		],
		[],
	);
	const roadmapIssue = lintReport.issues.find(
		(issue) => issue.kind === "roadmap-missing-code-path",
	);
	assert.equal(roadmapIssue?.ownership_state, "covered_by_task");
	assert.deepEqual(roadmapIssue?.owner_refs, ["TASK-999"]);
	const health = lintHealth(lintReport);
	assert.equal(typeof health.unowned_actionable, "number");
} finally {
	await rm(root, { recursive: true, force: true });
}
