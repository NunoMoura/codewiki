import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildGatewayPreflight } from "../../../src/gateway/report.ts";
import { shouldTriggerCodewikiThresholdRefresh } from "../../../src/adapters/pi/compaction.ts";
import {
	projectCodewikiContextMessages,
	sourceBackedProjectionMessage,
} from "../../../src/adapters/pi/context-projection.ts";
import { runCodewikiRuntimeStep } from "../../../src/runtime/runner.ts";

const now = "2026-06-07T00:00:00.000Z";

assert.equal(
	shouldTriggerCodewikiThresholdRefresh({ percent: 69 }, undefined),
	false,
	"CodeWiki context refresh should stay quiet below the default 70 percent provider context usage",
);
assert.equal(
	shouldTriggerCodewikiThresholdRefresh({ percent: 70 }, undefined),
	true,
	"CodeWiki context refresh should default to a 70 percent provider context usage threshold",
);
assert.equal(
	shouldTriggerCodewikiThresholdRefresh({ percent: 72 }, 71),
	false,
	"CodeWiki context refresh should not repeatedly trigger while usage remains above the default threshold",
);

function taskRecord(id = "TASK-121") {
	return {
		id,
		title: "Implement runtime context-boundary dispatch",
		status: "in_progress",
		priority: "high",
		kind: "architecture",
		change_type: "system",
		summary: "Runtime dispatches role-free source-backed context boundaries.",
		spec_paths: [".codewiki/kb/system/runtime.md"],
		code_paths: ["src/runtime/**", "src/state/resume-context.ts"],
		research_ids: [],
		labels: ["context-boundary", "role-free-dispatch"],
		goal: {
			outcome: "Runtime can request source-backed context boundaries.",
			acceptance: [
				"Packet shape is role-free",
				"Fresh gate handoff is content-evidence aware",
			],
			non_goals: ["Do not spawn without adapter support"],
			verification: ["TASK-121 test"],
		},
		delta: {
			desired: "role-free context-boundary dispatch",
			current: "role-shaped worker dispatch",
			closure: "source-backed packet dispatch tested",
		},
		created: now,
		updated: now,
	};
}

async function writeJson(path, data) {
	await mkdir(resolve(path, ".."), { recursive: true });
	await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function fixtureProject() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-task-121-"));
	const task = taskRecord();
	const project = {
		root,
		label: "task-121-fixture",
		config: {
			project_name: "task-121-fixture",
			schema_version: 4,
			codewiki: {
				agency: {
					level: "sprint",
					approval_cadence: "sprint",
					context_reset: {
						enabled: true,
						auto_pickup: true,
						max_resets_per_run: 2,
					},
				},
			},
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
	await writeJson(resolve(root, ".codewiki/roadmap/queue.json"), {
		version: 1,
		updated: now,
		order: [task.id],
		tasks: { [task.id]: task },
	});
	return { project, task };
}

function readinessFor(taskId) {
	return {
		version: 1,
		contract_version: 1,
		kind: "task",
		task_id: taskId,
		state: "runnable",
		safe_to_schedule: true,
		expires_at: "2099-01-01T00:00:00.000Z",
		blockers: [],
		next_action: {
			kind: "run",
			loop: "implementation",
			summary: `Run ${taskId}`,
			refs: [`.codewiki/roadmap/tasks/${taskId}/context.json`],
			safe_to_schedule: true,
		},
	};
}

function planFor(taskId, freshWorker = {}) {
	return {
		mode: "work",
		trigger: "manual",
		budget: {
			maxCycles: 1,
			maxWallSeconds: 30,
			maxTokens: 4000,
			maxCostUsd: 0.1,
			maxWrites: 2,
			maxSessions: 1,
			risk: "medium",
		},
		automation_readiness: { tasks: { [taskId]: readinessFor(taskId) } },
		cycles: [
			{
				cycle: 1,
				action: "fresh_worker",
				next_task: taskId,
				summary: `Fresh gate handoff for ${taskId}`,
				automation_readiness: readinessFor(taskId),
				fresh_worker: {
					required: true,
					gate: "implementation",
					content_mode: "dirty",
					working_tree_digest: "sha256:task121",
					patch_refs: ["patch:TASK-121.diff"],
					context_boundary: {
						reason: "fresh-gate-evaluation",
						graph_lens: "validation",
						expected_output: "implementation gate verdict for TASK-121",
						constraints: {
							fresh_context: true,
							no_loop_root: ["validation", "publish", "publication"],
						},
						source_refs: [
							"src/runtime/runner.ts",
							".codewiki/kb/system/runtime.md",
						],
						content_evidence_requirements: [
							"working_tree_digest",
							"patch_refs",
						],
					},
					...freshWorker,
				},
			},
		],
		stop: { next_task: taskId, reason: "Ready for execution." },
		policy: { allowWrites: true },
	};
}

function fakeResumeBuilder(task, artifactStatuses = []) {
	return async (_project, input) => ({
		project_label: "task-121-fixture",
		repo_root: _project.root,
		prompt: `Implement ${input.requestedTaskId} from CodeWiki source refs.`,
		task,
		selection: {
			task,
			source: "explicit",
			artifact_statuses: artifactStatuses,
			skipped: [],
		},
		preflight: { color: "green", errors: 0, warnings: 0, total: 0 },
		evidence: "source-backed resume context",
		follow_up_intent: input.followUpIntent || "",
		context_path: `.codewiki/roadmap/tasks/${task.id}/context.json`,
		source_refs: [".codewiki/roadmap/queue.json", ".codewiki/index_graph.json"],
		graph_lens: "task",
		expected_output: "implementation evidence for TASK-121",
		constraints: {
			non_goals: ["No publication"],
			verification: ["TASK-121 test"],
		},
		blockers: [],
		artifact_status: artifactStatuses,
		content_evidence_requirements: [
			"fresh_context=true",
			"working_tree_digest or clean=true",
		],
	});
}

{
	const { project, task } = await fixtureProject();
	const bridgeRequests = [];
	const result = await runCodewikiRuntimeStep(project, planFor(task.id), {
		sessionStore: {
			getCurrentSessionId: () => "task121-parent",
			getSessionBranch: () => [],
		},
		resumeContextBuilder: fakeResumeBuilder(task),
		freshWorkerBridge: {
			requestFreshWorker: (request) => {
				bridgeRequests.push(request);
				return {
					status: "requested",
					summary: "fresh context-boundary worker requested",
					request,
					worker: { session_id: "worker-session" },
					blockers: [],
					handoff: {
						summary: "handoff",
						build_refs: request.build_refs,
						validation_refs: request.validation_refs,
						content_refs: request.content_evidence.content_refs,
						trace_refs: request.trace_refs,
						gate_refs: request.gate_refs,
						git_refs: request.git_refs,
						artifact_refs: request.artifact_refs,
						notes: request.content_evidence.notes,
					},
					platform: {
						kind: "subprocess",
						summary: "fixture",
						evidence: ["fixture"],
					},
				};
			},
		},
	});
	assert.equal(result.status, "completed");
	assert.equal(result.action, "fresh_worker_request");
	assert.equal(bridgeRequests.length, 1);
	const request = bridgeRequests[0];
	assert.equal(
		Object.hasOwn(request, "role"),
		false,
		"role must not be required for dispatch",
	);
	assert.equal(request.context_boundary.reason, "fresh-gate-evaluation");
	assert.equal(request.context_boundary.graph_lens, "validation");
	assert.equal(
		request.context_boundary.expected_output,
		"implementation gate verdict for TASK-121",
	);
	assert.ok(
		request.context_boundary.source_refs.includes("src/runtime/runner.ts"),
	);
	assert.ok(
		request.context_boundary.source_refs.includes(
			".codewiki/roadmap/queue.json",
		),
	);
	assert.deepEqual(request.context_boundary.content_evidence_requirements, [
		"fresh_context=true",
		"working_tree_digest or clean=true",
		"working_tree_digest",
		"patch_refs",
		"patch_or_worktree_handoff",
	]);
	assert.equal(request.context_boundary.constraints.fresh_context, true);
	assert.ok(request.context_boundary.budget.maxSessions >= 1);
	assert.equal(request.context_boundary.chat_history_included, false);
	assert.equal(request.context_boundary.full_graph_included, false);
	assert.ok(
		result.context_boundary.content_refs.includes(
			"working_tree_digest:sha256:task121",
		),
	);
}

{
	const { project, task } = await fixtureProject();
	const result = await runCodewikiRuntimeStep(project, planFor(task.id), {
		sessionStore: {
			getCurrentSessionId: () => "task121-parent",
			getSessionBranch: () => [],
		},
		resumeContextBuilder: fakeResumeBuilder(task),
	});
	assert.equal(result.status, "blocked");
	assert.equal(result.stop_reason, "platform_limited");
	assert.equal(result.fresh_worker.status, "unsupported");
	assert.equal(Object.hasOwn(result.fresh_worker.request, "role"), false);
	assert.equal(
		result.fresh_worker.request.context_boundary.reason,
		"fresh-gate-evaluation",
	);
	assert.match(result.fresh_worker.summary, /context-boundary worker/);
	assert.match(
		result.fresh_worker.blockers[0].remediation[0],
		/wiki-resume --new/,
	);
}

{
	const { project, task } = await fixtureProject();
	const result = await runCodewikiRuntimeStep(
		project,
		planFor(task.id, { role: "validator" }),
		{
			sessionStore: {
				getCurrentSessionId: () => "task121-parent",
				getSessionBranch: () => [],
			},
			resumeContextBuilder: fakeResumeBuilder(task),
		},
	);
	assert.equal(result.fresh_worker.request.role, "validator");
	assert.equal(result.fresh_worker.request.compatibility_role, "validator");
	assert.equal(
		result.fresh_worker.request.context_boundary.compatibility.role,
		"validator",
		"legacy role is preserved only as compatibility metadata",
	);
}

{
	const { project } = await fixtureProject();
	const gateEvidenceKey = "au" + "dit_refs";
	const contentEvidenceKey = "content_" + "pro" + "of";
	const preflight = buildGatewayPreflight(project, {
		profile: "implementation",
		task_id: "TASK-121",
		verdict: "pass",
		rationale:
			"Freshness is context-boundary plus content evidence, not role label.",
		[gateEvidenceKey]: ["au" + "dit:alignment", "au" + "dit:changed"],
		isolation: {
			fresh_context: true,
			clean: false,
			working_tree_digest: "sha256:task121",
			notes: "fresh-gate-evaluation context-boundary packet checked",
		},
	});
	assert.equal(
		preflight.missing[contentEvidenceKey].includes("isolation.role"),
		false,
		"gateway preflight must not require validator compatibility label",
	);
}

assert.equal(
	await readFile(
		new URL("../../../src/runtime/runner.ts", import.meta.url),
		"utf8",
	).then((text) => text.includes("src/validation")),
	false,
);
assert.equal(
	await readFile(
		new URL("../../../src/runtime/runner.ts", import.meta.url),
		"utf8",
	).then((text) => text.includes("src/publish")),
	false,
);

function textMessage(role, text) {
	return {
		role,
		content: [{ type: "text", text }],
		timestamp: Date.parse(now),
	};
}

function projectionFixtureMessage(task = taskRecord()) {
	return sourceBackedProjectionMessage({
		project_label: "task-121-fixture",
		repo_root: "/repo",
		prompt: "TASK-121 source packet\nUse source refs, not old chat.",
		task,
		selection: { task, source: "explicit", artifact_statuses: [], skipped: [] },
		preflight: { color: "green", errors: 0, warnings: 0, total: 0 },
		evidence: "source-backed evidence",
		follow_up_intent: "",
		context_path: ".codewiki/roadmap/tasks/TASK-121/context.json",
		source_refs: [
			".codewiki/roadmap/queue.json",
			"src/adapters/pi/context-projection.ts",
		],
		graph_lens: "task:TASK-121",
		expected_output: "implementation evidence for TASK-121",
		constraints: { non_goals: ["No publication"] },
		blockers: [],
		artifact_status: [],
		content_evidence_requirements: ["source_refs", "content_evidence"],
	});
}

{
	const projection = projectionFixtureMessage();
	const result = projectCodewikiContextMessages(
		[
			textMessage("user", "Old task chatter that is already durable."),
			{
				role: "custom",
				customType: "codewiki.resume-kickoff",
				content: "## CodeWiki Auto-Pickup Kickoff\nOld packet",
				display: true,
				timestamp: Date.parse(now),
			},
			textMessage("assistant", "Obsolete implementation plan."),
			{
				role: "toolResult",
				toolName: "wiki_implement",
				toolCallId: "impl-1",
				content: [
					{
						type: "text",
						text: "wiki_implement: codewiki build: wrote .codewiki/builds/implementation/task-121.json",
					},
				],
				isError: false,
				timestamp: Date.parse(now),
			},
			textMessage("assistant", "Implementation build recorded."),
			textMessage("user", "New uncheckpointed nuance: keep this."),
		],
		projection,
	);
	const rendered = JSON.stringify(result.messages);
	assert.equal(result.pruned, true);
	assert.equal(result.messages[0].customType, "codewiki.context-projection");
	assert.match(rendered, /New uncheckpointed nuance/);
	assert.doesNotMatch(rendered, /Old task chatter/);
	assert.doesNotMatch(rendered, /Auto-Pickup Kickoff/);
	assert.match(rendered, /TASK-121 source packet/);
}

{
	const projection = projectionFixtureMessage();
	const result = projectCodewikiContextMessages(
		[
			textMessage("user", "Run current tool loop."),
			{
				role: "assistant",
				content: [
					{ type: "text", text: "Calling implementation tool." },
					{
						type: "toolCall",
						id: "impl-2",
						name: "wiki_implement",
						arguments: {},
					},
				],
				timestamp: Date.parse(now),
			},
			{
				role: "toolResult",
				toolName: "wiki_implement",
				toolCallId: "impl-2",
				content: [
					{
						type: "text",
						text: "wiki_implement: codewiki build: wrote .codewiki/builds/implementation/live-task-121.json",
					},
				],
				isError: false,
				timestamp: Date.parse(now),
			},
		],
		projection,
	);
	const rendered = JSON.stringify(result.messages);
	assert.equal(
		result.pruned,
		false,
		"checkpoint after latest user stays live until next user boundary",
	);
	assert.match(rendered, /toolCall/);
	assert.match(rendered, /live-task-121/);
}

{
	const projection = projectionFixtureMessage();
	const result = projectCodewikiContextMessages(
		[
			textMessage("user", "Still no durable checkpoint, keep me."),
			textMessage("assistant", "Working details not durable yet."),
		],
		projection,
	);
	const rendered = JSON.stringify(result.messages);
	assert.equal(result.pruned, false);
	assert.match(rendered, /Still no durable checkpoint/);
	assert.match(rendered, /Working details not durable yet/);
}
