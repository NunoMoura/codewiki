import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildChangeClaimState, mutateChangeClaims } from "../../src/application/claims.ts";
import { writeImplementationBuild, writeValidationReport } from "../../src/application/builds.ts";
import { buildGraph } from "../../src/application/graph.ts";
import { createRoleWorktreePlan } from "../../src/application/worktree-isolation.ts";

const root = await mkdtemp(join(tmpdir(), "codewiki-role-worktree-"));

const project = {
	root,
	label: "role-worktree-smoke",
	config: {
		project_name: "role-worktree-smoke",
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

const fakeGitCache = { getDirtyPaths: () => [] };

try {
	const claimResult = await mutateChangeClaims(project, {
		action: "claim",
		mode: "write",
		role: "builder",
		taskId: "TASK-070",
		summary: "Build role/worktree metadata.",
		worktree: {
			worktree_path: "/tmp/codewiki-builder",
			branch: "cw/TASK-070-builder",
			base_sha: "abc1234",
			head_sha: "def5678",
			clean: true,
		},
		scopes: [{ layer: "code", path: "src/application/claims.ts" }],
	}, { sessionId: "builder-session", agentName: "Builder" });

	assert.equal(claimResult.claim.role, "builder");
	assert.equal(claimResult.claim.worktree.worktree_path, "/tmp/codewiki-builder");
	assert.equal(claimResult.claim.worktree.head_sha, "def5678");
	assert.match(claimResult.summary, /role=builder/);

	const factoryPlan = createRoleWorktreePlan(project, {
		task_id: "TASK-071",
		role: "validator",
		session_id: "validator-session",
		base_sha: "abc1234",
	});
	assert.equal(factoryPlan.branch, "codewiki/TASK-071/validator/validator-session");
	assert.ok(factoryPlan.worktree_path.endsWith(".codewiki-worktrees/role-worktree-smoke/TASK-071/validator/validator-session"));
	assert.deepEqual(factoryPlan.commands.prepare, ["git worktree add -B codewiki/TASK-071/validator/validator-session <worktree_path> abc1234"]);
	assert.match(factoryPlan.commands.verify.at(-1), /git status --porcelain/);
	assert.match(factoryPlan.commands.cleanup.at(-1), /git worktree remove/);

	const factoryClaim = await mutateChangeClaims(project, {
		action: "claim",
		mode: "write",
		role: "validator",
		taskId: "TASK-071",
		summary: "Auto factory metadata for validator role.",
		scopes: [{ layer: "code", path: "src/application/builds.ts" }],
	}, { sessionId: "validator-session", agentName: "Validator" });
	assert.equal(factoryClaim.claim.worktree.branch, "codewiki/TASK-071/validator/validator-session");
	assert.ok(factoryClaim.claim.worktree.worktree_path.endsWith(".codewiki-worktrees/role-worktree-smoke/TASK-071/validator/validator-session"));
	assert.match(factoryClaim.claim.worktree.notes, /factory=role-worktree/);

	const waiterResult = await mutateChangeClaims(project, {
		action: "wait",
		mode: "write",
		role: "builder",
		taskId: "TASK-071",
		summary: "Wait for exact validator blocker.",
		scopes: [{ layer: "code", path: "src/application/builds.ts" }],
	}, { sessionId: "waiting-builder", agentName: "Waiting Builder" });
	assert.equal(waiterResult.waiter.status, "pending");
	assert.deepEqual(waiterResult.waiter.blocked_by_claim_ids, [factoryClaim.claim.id]);
	assert.equal(waiterResult.waiter.blockers[0].claim_id, factoryClaim.claim.id);
	assert.equal(waiterResult.waiter.blockers[0].branch, factoryClaim.claim.worktree.branch);
	assert.match(waiterResult.waiter.blockers[0].next_safe_action, /Wait for CLAIM-\d+ release.*codewiki\/TASK-071\/validator\/validator-session/);
	assert.match(waiterResult.waiter.blocker_summary, /CLAIM-\d+.*codewiki\/TASK-071\/validator\/validator-session/);

	const stateWithWaiter = buildChangeClaimState(JSON.parse(await readFile(join(root, ".codewiki/session/queue.json"), "utf8")));
	const statusForBuilds = stateWithWaiter.artifact_statuses.find((status) => status.artifact.path === "src/application/builds.ts");
	assert.equal(statusForBuilds.status, "in-use");
	assert.equal(statusForBuilds.holders[0].worktree.branch, factoryClaim.claim.worktree.branch);
	assert.match(statusForBuilds.waiters[0].next_safe_action, /Wait for CLAIM-\d+ release/);

	const releaseResult = await mutateChangeClaims(project, {
		action: "release",
		claimId: factoryClaim.claim.id,
	}, { sessionId: "validator-session", agentName: "Validator" });
	const readyWaiter = releaseResult.waiters.find((waiter) => waiter.id === waiterResult.waiter.id);
	assert.equal(readyWaiter.status, "ready");
	assert.deepEqual(readyWaiter.blocked_by_claim_ids, []);
	assert.deepEqual(readyWaiter.blockers, []);
	assert.match(readyWaiter.next_safe_action, /Re-read CodeWiki state.*mark scopes/i);

	const implementation = await writeImplementationBuild(project, {
		kind: "implementation",
		summary: "Implement role worktree path.",
		source_planning_build: ".codewiki/builds/planning/accepted-plan.json",
		task_id: "TASK-071",
		test_files: ["tests/smoke/role-worktree-isolation.test.mjs"],
		code_files: ["src/application/worktree-isolation.ts", "src/application/claims.ts"],
		checks_run: ["node ./tests/smoke/role-worktree-isolation.test.mjs"],
		acceptance_mapping: [{ criterion: "Publisher queue exists", evidence: "Implementation build contains publisher_queue." }],
		closure_brief: {
			user_intent: "Implement role worktree path.",
			implemented_changes: ["Added role worktree factory and publisher queue evidence."],
			acceptance_evidence: ["Publisher queue exists"],
			checks: ["node ./tests/smoke/role-worktree-isolation.test.mjs"],
		},
	});
	const implementationData = JSON.parse(await readFile(join(root, implementation.path), "utf8"));
	assert.equal(implementationData.publication.publisher_queue.status, "waiting_validation");
	assert.equal(implementationData.publication.publisher_queue.task_id, "TASK-071");
	assert.ok(implementationData.publication.publisher_queue.inputs.builder_refs.includes("src/application/worktree-isolation.ts"));
	assert.ok(implementationData.publication.publisher_queue.required_steps.includes("refresh generated CodeWiki state"));
	assert.ok(implementationData.publication.publisher_queue.result.required_proof.includes("published_sha"));

	const validationResult = await writeValidationReport(project, {
		profile: "implementation",
		task_id: "TASK-070",
		verdict: "pass",
		rationale: "Validated from a clean fresh validator worktree.",
		checks: ["npm test"],
		source: ".codewiki/builds/implementation/2026-05-12-task-070.json",
		isolation: {
			role: "validator",
			fresh_context: true,
			worktree_path: "/tmp/codewiki-validator",
			branch: "validate/TASK-070",
			base_sha: "abc1234",
			head_sha: "def5678",
			validated_sha: "def5678",
			clean: true,
			builder_session_id: "builder-session",
			builder_claim_id: claimResult.claim.id,
			related_claim_ids: [claimResult.claim.id],
		},
	});

	const report = JSON.parse(await readFile(join(root, validationResult.path), "utf8"));
	assert.equal(report.isolation.role, "validator");
	assert.equal(report.isolation.fresh_context, true);
	assert.equal(report.isolation.validated_sha, "def5678");
	assert.equal(report.isolation.builder_claim_id, claimResult.claim.id);

	const claimsFile = JSON.parse(await readFile(join(root, ".codewiki/session/queue.json"), "utf8"));
	const graph = buildGraph({
		project,
		docs: [],
		research: [],
		roadmapEntries: [],
		gitCache: fakeGitCache,
		builds: [],
		validations: [{ path: validationResult.path, taskId: "TASK-070", verdict: "pass", data: report }],
		testFiles: [],
		claims: claimsFile,
	});

	const claimNode = graph.nodes.find((node) => node.id === `claim:${claimResult.claim.id}`);
	assert.equal(claimNode.role, "builder");
	assert.equal(claimNode.worktree.branch, "cw/TASK-070-builder");
	assert.equal(graph.views.claims.by_role.builder, 1);
	assert.equal(graph.views.claims.isolation[0].head_sha, "def5678");

	const validationNode = graph.nodes.find((node) => node.id === `validation:${validationResult.path}`);
	assert.equal(validationNode.isolation_status, "isolated");
	assert.equal(validationNode.isolation.validated_sha, "def5678");
	assert.equal(graph.views.validation.isolation[0].status, "isolated");
	assert.equal(graph.views.validation.isolation[0].builder_claim_id, claimResult.claim.id);
} finally {
	await rm(root, { recursive: true, force: true });
}
