import "../setup-env.mjs";
import assert from "node:assert/strict";
import { planAgencyAutoPickup } from "../../src/agency/auto-pickup.ts";
import { agencyHardStopReasons } from "../../src/agency/planning.ts";
import { effectiveAgencyPolicy } from "../../src/agency/types.ts";
import { buildAutomationReadinessIndex } from "../../src/state/automation-readiness.ts";
import { CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE } from "../../src/state/resume-kickoff.ts";

function project(agency = {}) {
	return {
		root: "/tmp/codewiki-agency-auto-pickup",
		label: "agency-auto-pickup",
		config: {
			project_name: "agency-auto-pickup",
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
					budgets: {
						default: { maxCycles: 2, maxSessions: 2, maxTokens: 2000 },
					},
					...agency,
				},
			},
		},
	};
}

const resume = {
	prompt: "Implement roadmap task TASK-053 from CodeWiki source refs.",
	taskId: "TASK-053",
	contextPath: ".codewiki/roadmap/tasks/TASK-053/context.json",
	sourceRefs: [
		".codewiki/roadmap/tasks/TASK-053/task.json",
		".codewiki/kb/system/agency.md",
	],
	followUpIntent: "Continue bounded agency auto-pickup.",
};

function readinessTask(id, status = "in_progress") {
	return {
		id,
		title: `${id} readiness fixture`,
		status,
		priority: "high",
		kind: "agent-workflow",
		change_type: "system",
		summary: `${id} summary`,
		spec_paths: [".codewiki/kb/system/agency.md"],
		code_paths: ["src/agency/planning.ts"],
		research_ids: [],
		labels: ["automation-readiness"],
		goal: {
			outcome: `${id} outcome`,
			acceptance: [`${id} acceptance`],
			non_goals: [],
			verification: ["readiness fixture"],
		},
		delta: { desired: "ready", current: "manual", closure: "tested" },
		created: "2026-06-01T00:00:00.000Z",
		updated: "2026-06-01T00:00:00.000Z",
	};
}

function planningBuild(taskId) {
	return {
		path: `.codewiki/builds/planning/${taskId}.json`,
		kind: "planning_build",
		status: "accepted",
		taskId,
		data: {
			kind: "planning_build",
			status: "accepted",
			task_ids: [taskId],
			traceability: {
				accepted_build_refs: [`.codewiki/builds/decision/${taskId}.json`],
			},
			consumes: { decision: [`.codewiki/builds/decision/${taskId}.json`] },
			policy: { required_audits: ["alignment"] },
		},
	};
}

function implementationBuild(taskId) {
	return {
		path: `.codewiki/builds/implementation/${taskId}.json`,
		kind: "implementation_build",
		status: "accepted",
		taskId,
		data: { kind: "implementation_build", status: "accepted", task_id: taskId },
	};
}

{
	const decision = planAgencyAutoPickup(project(), {
		boundary: "soft-compaction",
		reason: "implementation-gateway-pass-boundary",
		resume,
		adapterCanDeliver: true,
		lifecycleSafe: true,
		intentStored: true,
		activeBuildRefs: [
			".codewiki/builds/implementation/2026-05-29-task-053.json",
		],
		visibleToolResults: ["validation pass visible before compaction"],
		stopConditions: [],
	});
	assert.equal(decision.allowed, true);
	assert.equal(decision.action, "auto_pickup");
	assert.equal(
		decision.kickoff?.customType,
		CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE,
	);
	assert.equal(decision.taskId, "TASK-053");
	assert.deepEqual(decision.preserved.visible_tool_results, [
		"validation pass visible before compaction",
	]);
	assert.deepEqual(decision.preserved.active_build_refs, [
		".codewiki/builds/implementation/2026-05-29-task-053.json",
	]);
	assert.equal(decision.agency.approval_cadence, "sprint");
	assert.equal(decision.budget.maxSessions, 2);
}

{
	const decision = planAgencyAutoPickup(
		project({ context_reset: { enabled: true, auto_pickup: false } }),
		{
			boundary: "soft-compaction",
			reason: "policy-test",
			resume,
			adapterCanDeliver: true,
			lifecycleSafe: true,
			intentStored: true,
		},
	);
	assert.equal(decision.allowed, false);
	assert.match(decision.reason, /auto-pickup disabled/);
}

{
	const decision = planAgencyAutoPickup(project(), {
		boundary: "runtime-context-refresh",
		reason: "budget-test",
		resume,
		budget: { maxSessions: 1 },
		used: { sessions: 1 },
		adapterCanDeliver: true,
		lifecycleSafe: true,
		intentStored: true,
	});
	assert.equal(decision.allowed, false);
	assert.equal(decision.reason, "session budget exhausted");
}

{
	const decision = planAgencyAutoPickup(project({ level: "task" }), {
		boundary: "soft-compaction",
		reason: "approval-test",
		resume,
		adapterCanDeliver: true,
		lifecycleSafe: true,
		intentStored: true,
		approvalBoundary: "sprint",
	});
	assert.equal(decision.allowed, false);
	assert.match(decision.reason, /approval cadence boundary/);
}

{
	const decision = planAgencyAutoPickup(project(), {
		boundary: "soft-compaction",
		reason: "mid-loop-test",
		resume: { prompt: "Continue from chat memory only." },
		adapterCanDeliver: true,
		lifecycleSafe: true,
		intentStored: false,
	});
	assert.equal(decision.allowed, false);
	assert.match(decision.reason, /intent is not stored/);
}

{
	const decision = planAgencyAutoPickup(project(), {
		boundary: "hard-new-session",
		reason: "new-session-test",
		resume,
		adapterCanDeliver: false,
		lifecycleSafe: true,
		intentStored: true,
	});
	assert.equal(decision.allowed, false);
	assert.equal(decision.fallback?.mode, "manual-visible-instructions");
	assert.match(
		decision.fallback?.reason || "",
		/hard replacement-session pickup is unavailable/,
	);
	assert.equal(
		decision.kickoff?.customType,
		CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE,
	);
}

{
	const tasks = [
		readinessTask("TASK-101"),
		readinessTask("TASK-102"),
		readinessTask("TASK-103"),
		readinessTask("TASK-104", "blocked"),
		readinessTask("TASK-105"),
	];
	const index = buildAutomationReadinessIndex({
		now: "2026-06-01T00:00:00.000Z",
		tasks,
		sprints: [
			{
				id: "SPRINT-READY",
				title: "Readiness sprint",
				status: "active",
				task_ids: tasks.map((task) => task.id),
			},
		],
		builds: [
			planningBuild("TASK-101"),
			planningBuild("TASK-103"),
			planningBuild("TASK-104"),
			implementationBuild("TASK-104"),
			planningBuild("TASK-105"),
			implementationBuild("TASK-105"),
		],
		validations: [
			{
				path: ".codewiki/validation/retry.json",
				taskId: "TASK-104",
				verdict: "fail",
				data: {
					task_id: "TASK-104",
					isolation: {
						working_tree_digest: "sha256:dirty104",
						tree_sha: "tree104",
					},
				},
			},
			{
				path: ".codewiki/validation/promote.json",
				taskId: "TASK-105",
				verdict: "pass",
				data: { task_id: "TASK-105" },
			},
		],
		artifact_statuses: [
			{
				artifact: { layer: "roadmap", task_id: "TASK-103" },
				status: "in-use",
				holders: [
					{
						record_id: "CLAIM-WAIT",
						session_id: "holder-session",
						agent_name: "Holder",
						mode: "write",
						role: "builder",
						task_id: "TASK-103",
						worktree: { branch: "codewiki/TASK-103/builder/holder" },
						next_safe_action:
							"Wait for CLAIM-WAIT release or branch codewiki/TASK-103/builder/holder.",
					},
				],
				waiters: [],
				conflict_ids: [],
			},
		],
	});
	assert.equal(index.tasks["TASK-101"].state, "runnable");
	assert.equal(index.tasks["TASK-102"].state, "blocked");
	assert.equal(index.tasks["TASK-103"].state, "waiting");
	assert.equal(index.tasks["TASK-103"].blockers[0].lease_ids[0], "CLAIM-WAIT");
	assert.match(index.tasks["TASK-103"].next_action.summary, /CLAIM-WAIT/);
	assert.equal(index.tasks["TASK-104"].state, "retryable");
	assert.deepEqual(index.tasks["TASK-104"].next_action.gate_refs, [
		".codewiki/validation/retry.json",
	]);
	assert.deepEqual(index.tasks["TASK-104"].next_action.git_refs, [
		"git_tree:tree104",
		"worktree_digest:sha256:dirty104",
	]);
	assert.equal(index.tasks["TASK-105"].state, "promotable");
	assert.equal(index.tasks["TASK-105"].gate_policy.next_loop, "implementation");
	assert.equal(index.tasks["TASK-105"].gate_policy.next_gate, "task-close");
	assert.equal(index.tasks["TASK-105"].next_action.loop, "implementation");
	assert.ok(
		index.tasks["TASK-105"].next_action.gate_refs.includes("gate:task-close"),
	);
	assert.deepEqual(index.sprints["SPRINT-READY"].runnable_task_ids, [
		"TASK-101",
	]);
	assert.deepEqual(index.sprints["SPRINT-READY"].retryable_task_ids, [
		"TASK-104",
	]);
	assert.deepEqual(index.sprints["SPRINT-READY"].promotable_task_ids, [
		"TASK-105",
	]);
	assert.equal(index.tasks["TASK-104"].blockers[0].retry_class, "same_loop");
	assert.equal(
		index.tasks["TASK-104"].blockers[0].remediation_route,
		"implementation",
	);
}

{
	const task = readinessTask("TASK-106", "blocked");
	const index = buildAutomationReadinessIndex({
		now: "2026-06-01T00:00:00.000Z",
		tasks: [task],
		builds: [planningBuild("TASK-106"), implementationBuild("TASK-106")],
		validations: [
			{
				path: ".codewiki/validation/decision-needed.json",
				taskId: "TASK-106",
				verdict: "block",
				data: {
					task_id: "TASK-106",
					failure_class: "decision_ambiguity",
					remediation: {
						retry_class: "route_decision",
						remediation_route: "decision",
						next_safe_actions: ["Route to decision approval."],
					},
				},
			},
		],
	});
	assert.equal(index.tasks["TASK-106"].state, "blocked");
	assert.equal(index.tasks["TASK-106"].safe_to_schedule, false);
	assert.equal(
		index.tasks["TASK-106"].blockers[0].kind,
		"validation_hard_stop",
	);
	assert.equal(
		index.tasks["TASK-106"].blockers[0].retry_class,
		"route_decision",
	);
	assert.equal(index.tasks["TASK-106"].next_action.loop, "planning");
}

{
	const policy = effectiveAgencyPolicy(project().config);
	const base = {
		policy,
		trigger: "manual",
		health: { errors: 2 },
		claims: {},
		nextStep: { reason: "semantic decision gate" },
		budget: { risk: "medium" },
	};
	assert.deepEqual(agencyHardStopReasons(base), [
		"validation/blocking health gate active",
		"semantic decision gate active",
	]);
	assert.deepEqual(
		agencyHardStopReasons({ ...base, allowScopedContinuation: true }),
		[],
	);
}

console.log("✓ agency auto-pickup smoke passed");
