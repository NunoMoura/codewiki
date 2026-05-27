#!/usr/bin/env node
import "../setup-env.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE,
	buildCodewikiCompactionSummary,
	buildCodewikiResumeKickoff,
	evaluateCodewikiAutoPickupBoundary,
	evaluateCodewikiResetLifecycleBoundary,
	formatCodewikiCompactionInstruction,
	formatCodewikiContextRefreshDeferredNotice,
	requestCodewikiContextRefresh,
	shouldTriggerCodewikiThresholdRefresh,
	takePendingCodewikiContextRefresh,
} from "../../src/adapters/pi/compaction.ts";
import { loadProject } from "../../src/project/context.ts";

assert.equal(
	shouldTriggerCodewikiThresholdRefresh(undefined, undefined),
	false,
	"missing usage should not trigger CodeWiki compaction",
);
assert.equal(
	shouldTriggerCodewikiThresholdRefresh({ percent: null }, undefined),
	false,
	"unknown usage should not trigger CodeWiki compaction",
);
assert.equal(
	shouldTriggerCodewikiThresholdRefresh({ percent: 79 }, undefined, 80),
	false,
	"usage below threshold should not trigger CodeWiki compaction",
);
assert.equal(
	shouldTriggerCodewikiThresholdRefresh({ percent: 80 }, undefined, 80),
	true,
	"first observed threshold crossing should trigger CodeWiki compaction",
);
assert.equal(
	shouldTriggerCodewikiThresholdRefresh({ percent: 82 }, 79, 80),
	true,
	"crossing threshold from below should trigger CodeWiki compaction",
);
assert.equal(
	shouldTriggerCodewikiThresholdRefresh({ percent: 85 }, 83, 80),
	false,
	"remaining above threshold should not repeatedly trigger CodeWiki compaction",
);

requestCodewikiContextRefresh({
	reason: " implementation-build-boundary ",
	taskId: " TASK-001 ",
	followUpIntent: " continue validation ",
	requestedAt: "2026-05-20T00:00:00.000Z",
});
const pending = takePendingCodewikiContextRefresh();
assert.deepEqual(
	pending,
	{
		reason: "implementation-build-boundary",
		taskId: "TASK-001",
		followUpIntent: "continue validation",
		requestedAt: "2026-05-20T00:00:00.000Z",
	},
	"pending CodeWiki context refresh request should be normalized",
);
assert.equal(
	takePendingCodewikiContextRefresh(),
	null,
	"pending CodeWiki context refresh request should be consumed once",
);
assert.equal(
	formatCodewikiCompactionInstruction({
		reason: "implementation-build-boundary",
		taskId: "TASK-001",
		followUpIntent: "continue validation",
	}),
	"CodeWiki context refresh: implementation-build-boundary; task=TASK-001; intent=continue validation",
	"CodeWiki compaction instruction should preserve boundary metadata",
);

const deferredNotice = formatCodewikiContextRefreshDeferredNotice(
	{
		reason: "implementation-build-boundary",
		taskId: "TASK-001",
		followUpIntent: "continue validation",
		requestedAt: "2026-05-20T00:00:00Z",
	},
	"agent is not idle",
	null,
);
assert.equal(deferredNotice.shouldNotify, true, "first non-idle deferred refresh should notify");
assert.equal(deferredNotice.level, "info", "normal non-idle deferred refresh should not be a warning");
assert.equal(
	formatCodewikiContextRefreshDeferredNotice(
		{
			reason: "implementation-build-boundary",
			taskId: "TASK-001",
			followUpIntent: "continue validation",
			requestedAt: "2026-05-20T00:00:00Z",
		},
		"agent is not idle",
		deferredNotice.key,
	).shouldNotify,
	false,
	"repeated non-idle deferred refresh for same request should be debounced",
);
assert.equal(
	formatCodewikiContextRefreshDeferredNotice(
		{
			reason: "validation-pass",
			taskId: "TASK-001",
			requestedAt: "2026-05-20T00:01:00Z",
		},
		"agent is not idle",
		deferredNotice.key,
	).shouldNotify,
	true,
	"new deferred refresh request should notify once",
);
assert.equal(
	formatCodewikiContextRefreshDeferredNotice(
		{ reason: "implementation-build-boundary", requestedAt: "2026-05-20T00:00:00Z" },
		"adapter cannot report idle boundary",
		null,
	).level,
	"warning",
	"adapter capability deferrals should remain warnings",
);

const compactionSource = readFileSync(
	new URL("../../src/adapters/pi/compaction.ts", import.meta.url),
	"utf8",
);
assert.match(
	compactionSource,
	/pi\.on\("agent_end"/,
	"CodeWiki compaction should trigger after the agent loop, not mid-turn",
);
assert.doesNotMatch(
	compactionSource,
	/pi\.on\("turn_end"/,
	"CodeWiki compaction should not trigger from turn_end",
);
assert.match(
	compactionSource,
	/CodeWiki context refresh.*starting/s,
	"CodeWiki compaction should visibly notify when it starts",
);
assert.match(
	compactionSource,
	/skipped: no source-backed resume packet/,
	"CodeWiki compaction should skip when no source-backed packet exists",
);
assert.match(
	compactionSource,
	/ctx\.compact[\s\S]*formatCodewikiCompactionInstruction/,
	"CodeWiki context refresh should own compact instructions",
);
assert.match(
	compactionSource,
	/pi\.sendMessage\(\s*summary\.kickoff,\s*\{[\s\S]*triggerTurn:\s*true,[\s\S]*deliverAs:\s*"followUp"[\s\S]*\}\s*\)/,
	"same-session auto-pickup should trigger from a custom kickoff follow-up boundary",
);
assert.doesNotMatch(
	compactionSource,
	/deliverAs:\s*"nextTurn"[\s\S]*triggerTurn:\s*true|triggerTurn:\s*true[\s\S]*deliverAs:\s*"nextTurn"/,
	"context reset must not rely on nextTurn because pi ignores triggerTurn for that mode",
);
assert.doesNotMatch(
	compactionSource,
	/sendUserMessage\(\s*[`'"]\/wiki-resume/,
	"context reset must not inject slash commands through follow-up chat",
);
assert.doesNotMatch(
	compactionSource,
	/role:\s*[`'"]assistant/,
	"context reset must not synthesize assistant-role continuation leaves",
);

const safeProject = {
	config: {
		codewiki: {
			agency: {
				level: "sprint",
				approval_cadence: "sprint",
				context_reset: { enabled: true, auto_pickup: true },
			},
		},
	},
};
const safeCtx = { isIdle: () => true, hasPendingMessages: () => false };
assert.equal(
	evaluateCodewikiResetLifecycleBoundary(safeCtx, safeProject).allowed,
	true,
	"idle session with no queued messages is reset-safe",
);
assert.equal(
	evaluateCodewikiAutoPickupBoundary(safeCtx, safeProject, {
		canSendMessage: true,
	}).allowed,
	true,
	"custom-message adapter can auto-pick up safely",
);
assert.equal(
	evaluateCodewikiAutoPickupBoundary(safeCtx, safeProject, {
		canSendMessage: false,
	}).allowed,
	false,
	"missing custom-message capability should refuse auto-pickup",
);
assert.match(
	evaluateCodewikiAutoPickupBoundary(safeCtx, safeProject, {
		canSendMessage: false,
	}).reason,
	/custom kickoff/,
	"unsafe adapter refusal should explain protocol-safe kickoff gap",
);
assert.equal(
	evaluateCodewikiAutoPickupBoundary(
		{ isIdle: () => true, hasPendingMessages: () => true },
		safeProject,
		{ canSendMessage: true },
	).allowed,
	false,
	"pending queued messages should block reset pickup",
);

const kickoff = buildCodewikiResumeKickoff({
	prompt: "Implement roadmap task TASK-001 from source refs.",
	reason: "test-reset",
	projectRoot: "/tmp/repo",
	taskId: "TASK-001",
	contextPath: ".codewiki/roadmap/tasks/TASK-001/context.json",
	sourceRefs: [".codewiki/roadmap/tasks/TASK-001/task.json"],
	policy: evaluateCodewikiAutoPickupBoundary(safeCtx, safeProject, {
		canSendMessage: true,
	}).policy,
});
assert.equal(
	kickoff.customType,
	CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE,
	"kickoff should be a CodeWiki custom message",
);
assert.equal(
	kickoff.display,
	true,
	"kickoff should be visible in the transcript",
);
assert.match(
	kickoff.content,
	/CodeWiki Auto-Pickup Kickoff/,
	"kickoff should identify the reset boundary",
);
assert.match(
	kickoff.content,
	/Source refs:/,
	"kickoff should carry source refs",
);

function staleTaskContext(taskId = "TASK-999") {
	return {
		hasUI: false,
		ui: { notify() {}, setStatus() {} },
		sessionManager: {
			getSessionId: () => "compaction-smoke-session",
			getBranch: () => [
				{
					type: "custom",
					customType: "codewiki.task-link",
					data: { taskId, action: "focus", summary: "stale task focus" },
				},
			],
		},
	};
}

async function createCompactionFixture({ openTask = true } = {}) {
	const root = await mkdtemp(join(tmpdir(), "codewiki-compaction-"));
	await mkdir(join(root, ".codewiki/kb/system"), { recursive: true });
	await mkdir(join(root, ".codewiki/roadmap"), { recursive: true });
	await writeFile(
		join(root, ".codewiki/config.json"),
		JSON.stringify(
			{
				project_name: openTask ? "compaction-open" : "compaction-empty",
				schema_version: 4,
				docs_root: ".codewiki/kb",
			},
			null,
			2,
		),
	);
	await writeFile(
		join(root, ".codewiki/kb/system/graph.md"),
		[
			"---",
			"id: spec.system.graph",
			"title: Graph",
			"state: active",
			"summary: Generated graph fixture.",
			"---",
			"",
			"# Graph",
			"",
			"Fixture spec for context refresh tests.",
		].join("\n"),
	);
	const tasks = openTask
		? {
				"TASK-001": {
					id: "TASK-001",
					title: "Open compaction task",
					status: "todo",
					priority: "high",
					kind: "bug",
					summary: "Exercise stale task fallback.",
					spec_paths: [".codewiki/kb/system/graph.md"],
					code_paths: ["src/adapters/pi/compaction.ts"],
					research_ids: [],
					labels: ["compaction"],
					goal: {
						outcome: "Fallback selects this task.",
						acceptance: ["Context refresh works."],
						non_goals: [],
						verification: [],
					},
					created: "2026-05-20",
					updated: "2026-05-20",
				},
			}
		: {};
	await writeFile(
		join(root, ".codewiki/roadmap/queue.json"),
		JSON.stringify(
			{
				version: 2,
				updated: "2026-05-20T00:00:00Z",
				order: openTask ? ["TASK-001"] : [],
				tasks,
			},
			null,
			2,
		),
	);
	return { root, project: await loadProject(root) };
}

{
	const { root, project } = await createCompactionFixture({ openTask: true });
	try {
		const summary = await buildCodewikiCompactionSummary(
			project,
			staleTaskContext("TASK-999"),
			{ reason: "threshold" },
			null,
		);
		assert.equal(
			summary?.details.taskId,
			"TASK-001",
			"stale active session task should not become explicit resume request",
		);
		const explicitStale = await buildCodewikiCompactionSummary(
			project,
			staleTaskContext("TASK-999"),
			{ reason: "manual", taskId: "TASK-999" },
			null,
		);
		assert.equal(
			explicitStale?.details.taskId,
			"TASK-001",
			"stale explicit context refresh task should fall back to open roadmap task",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

{
	const { root, project } = await createCompactionFixture({ openTask: false });
	try {
		const summary = await buildCodewikiCompactionSummary(
			project,
			staleTaskContext("TASK-999"),
			{ reason: "manual", taskId: "TASK-999" },
			null,
		);
		assert.equal(
			summary,
			null,
			"stale context refresh with no open roadmap task should no-op instead of throwing",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

console.log("✓ codewiki compaction smoke passed");
