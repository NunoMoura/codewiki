import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	mutateChangeClaims,
	claimsFilePath,
} from "../../src/session/claims.ts";
import { planParallelWorktreeDispatch } from "../../src/session/worktree-dispatcher.ts";
import { selectRoadmapDispatchCandidates } from "../../src/roadmap/selection.ts";

function project(root) {
	return {
		root,
		label: "worktree-dispatcher-smoke",
		config: { project_name: "worktree-dispatcher-smoke", schema_version: 4 },
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

function task(id, priority, codePaths, specPaths = []) {
	return {
		id,
		title: `${id} title`,
		status: "todo",
		priority,
		kind: "agent-workflow",
		summary: `${id} summary`,
		spec_paths: specPaths,
		code_paths: codePaths,
		research_ids: [],
		labels: [],
		goal: {
			outcome: `${id} outcome`,
			acceptance: [`${id} acceptance`],
			non_goals: [],
			verification: ["targeted dispatcher test"],
		},
		delta: { desired: "desired", current: "current", closure: "closure" },
		created: "2026-05-29",
		updated: "2026-05-29",
	};
}

function roadmap(tasks, sprints = {}) {
	return {
		version: 1,
		updated: "2026-05-29T00:00:00.000Z",
		order: tasks.map((item) => item.id),
		tasks: Object.fromEntries(tasks.map((item) => [item.id, item])),
		sprints,
	};
}

async function withProject(fn) {
	const root = await mkdtemp(join(tmpdir(), "codewiki-worktree-dispatch-"));
	const proj = project(root);
	try {
		await fn(proj);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

await withProject(async (proj) => {
	const file = roadmap(
		[
			task("TASK-101", "high", ["src/a.ts"], [".codewiki/kb/system/a.md"]),
			task("TASK-102", "medium", ["src/b.ts"]),
			task("TASK-103", "high", ["src/a.ts"]),
			task("TASK-104", "low", ["src/d.ts"]),
		],
		{
			"SPRINT-100": {
				id: "SPRINT-100",
				title: "Dispatch sprint",
				status: "active",
				outcome: "Parallel dispatch",
				task_ids: ["TASK-101", "TASK-102", "TASK-103", "TASK-104"],
				created: "2026-05-29",
				updated: "2026-05-29",
			},
		},
	);
	const selected = selectRoadmapDispatchCandidates(file);
	assert.deepEqual(
		selected.candidates.map((candidate) => candidate.task.id),
		["TASK-101", "TASK-103", "TASK-102", "TASK-104"],
		"selection should use priority first and roadmap order second",
	);
	const plan = await planParallelWorktreeDispatch(proj, {
		roadmap: file,
		max_workers: 2,
		session_id_prefix: "dispatch-smoke",
		base_sha: "abc1234",
	});
	assert.equal(plan.status, "partial");
	assert.deepEqual(
		plan.assignments.map((assignment) => assignment.task_id),
		["TASK-101", "TASK-102"],
		"dispatcher should allocate independent tasks only",
	);
	assert.equal(plan.assignments[0].sprint_ids[0], "SPRINT-100");
	assert.equal(plan.assignments[0].artifact_claim.action, "mark");
	assert.equal(plan.assignments[0].artifact_claim.role, "builder");
	assert.ok(
		plan.assignments[0].artifact_claim.scopes.some(
			(scope) => scope.task_id === "TASK-101",
		),
	);
	assert.match(
		plan.assignments[0].worktrees.builder.branch,
		/TASK-101\/builder/,
	);
	assert.equal(
		plan.assignments[0].worktrees.builder.metadata.base_sha,
		"abc1234",
	);
	assert.equal(plan.assignments[0].resume_packet.chat_context_shared, false);
	assert.ok(
		plan.assignments[0].resume_packet.source_refs.includes(
			".codewiki/roadmap/tasks/TASK-101/task.json",
		),
	);
	assert.match(
		plan.assignments[0].resume_packet.follow_up_intent,
		/do not use parent chat context/i,
	);
	assert.equal(plan.assignments[0].fresh_worker_request.role, "builder");
	assert.equal(
		plan.assignments[0].fresh_worker_request.chat_context_shared,
		false,
	);
	assert.ok(
		plan.assignments[0].fresh_worker_request.trace_refs.includes(
			".codewiki/roadmap/tasks/TASK-101/task.json",
		),
	);
	assert.deepEqual(plan.assignments[0].fresh_worker_request.gate_refs, [
		"gate:implementation",
	]);
	assert.match(
		plan.assignments[0].fresh_worker_request.content_requirements[0],
		/working_tree_digest/,
	);
	assert.deepEqual(
		plan.blocked.map((item) => [item.task_id, item.reason]),
		[
			["TASK-103", "partition_conflict"],
			["TASK-104", "max_sessions"],
		],
	);
	assert.deepEqual(plan.blocked[0].blocked_by_task_ids, ["TASK-101"]);
	assert.ok(plan.evidence.dispatch_id.startsWith("dispatch-"));
	assert.deepEqual(plan.evidence.selected_task_ids, ["TASK-101", "TASK-102"]);
	assert.ok(
		plan.evidence.pause_reasons.some((reason) =>
			reason.includes("TASK-103: partition_conflict"),
		),
	);
	const repeat = await planParallelWorktreeDispatch(proj, {
		roadmap: file,
		max_workers: 2,
		session_id_prefix: "dispatch-smoke",
		base_sha: "abc1234",
	});
	assert.equal(
		repeat.evidence.dispatch_id,
		plan.evidence.dispatch_id,
		"dispatch evidence should be deterministic",
	);
});

await withProject(async (proj) => {
	const blockedTask = task("TASK-201", "high", ["src/blocked.ts"]);
	await mutateChangeClaims(
		proj,
		{
			action: "claim",
			mode: "write",
			role: "builder",
			taskId: "TASK-200",
			summary: "Hold dispatcher blocker.",
			scopes: [{ layer: "code", path: "src/blocked.ts" }],
		},
		{ sessionId: "holder", agentName: "Holder" },
	);
	const plan = await planParallelWorktreeDispatch(proj, {
		roadmap: roadmap([blockedTask]),
		max_workers: 1,
	});
	assert.equal(plan.status, "blocked");
	assert.equal(plan.blocked[0].task_id, "TASK-201");
	assert.equal(plan.blocked[0].reason, "artifact_claim");
	assert.equal(plan.blocked[0].blockers[0].claim_id, "CLAIM-001");
	assert.equal(plan.blocked[0].wait.action, "wait");
});

await withProject(async (proj) => {
	await mutateChangeClaims(
		proj,
		{
			action: "claim",
			mode: "write",
			role: "builder",
			taskId: "TASK-300",
			summary: "Stale holder should not block.",
			scopes: [{ layer: "code", path: "src/stale.ts" }],
		},
		{ sessionId: "holder", agentName: "Holder" },
	);
	const queue = JSON.parse(await readFile(claimsFilePath(proj), "utf8"));
	queue.claims[0].expires_at = new Date(Date.now() - 60_000).toISOString();
	await writeFile(claimsFilePath(proj), JSON.stringify(queue, null, 2) + "\n");
	const plan = await planParallelWorktreeDispatch(proj, {
		roadmap: roadmap([task("TASK-301", "high", ["src/stale.ts"])]),
		max_workers: 1,
	});
	assert.equal(plan.status, "ready");
	assert.deepEqual(
		plan.assignments.map((assignment) => assignment.task_id),
		["TASK-301"],
	);
	assert.equal(plan.blocked.length, 0);
});

await withProject(async (proj) => {
	const plan = await planParallelWorktreeDispatch(proj, {
		roadmap: roadmap([
			{ ...task("TASK-401", "high", ["src/a.ts"]), status: "blocked" },
			task("TASK-402", "medium", ["src/b.ts"]),
		]),
		budget: { maxSubagents: 1, maxSessions: 3 },
	});
	assert.equal(plan.evidence.budget.max_workers, 1);
	assert.deepEqual(
		plan.assignments.map((assignment) => assignment.task_id),
		["TASK-402"],
	);
	assert.ok(
		plan.evidence.skipped.some(
			(skip) => skip.task_id === "TASK-401" && skip.reason === "blocked",
		),
	);
});

console.log("✓ worktree dispatcher smoke passed");
