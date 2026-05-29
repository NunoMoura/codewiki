import "../setup-env.mjs";
import assert from "node:assert/strict";
import { planAgencyAutoPickup } from "../../src/agency/auto-pickup.ts";
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
	assert.equal(decision.kickoff?.customType, CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE);
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
	assert.match(decision.fallback?.reason || "", /hard replacement-session pickup is unavailable/);
	assert.equal(decision.kickoff?.customType, CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE);
}

console.log("✓ agency auto-pickup smoke passed");
