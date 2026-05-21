#!/usr/bin/env node
import "../setup-env.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildCodewikiCompactionSummary,
	formatCodewikiCompactionInstruction,
	requestCodewikiContextRefresh,
	shouldTriggerCodewikiThresholdRefresh,
	takePendingCodewikiContextRefresh,
} from "../../src/adapters/pi/compaction.ts";
import { loadProject } from "../../src/application/project.ts";

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

const compactionSource = readFileSync(new URL("../../src/adapters/pi/compaction.ts", import.meta.url), "utf8");
assert.match(compactionSource, /pi\.on\("agent_end"/, "CodeWiki compaction should trigger after the agent loop, not mid-turn");
assert.doesNotMatch(compactionSource, /pi\.on\("turn_end"/, "CodeWiki compaction should not trigger from turn_end");
assert.match(compactionSource, /CodeWiki context refresh.*starting/s, "CodeWiki compaction should visibly notify when it starts");
assert.match(compactionSource, /skipped: no source-backed resume packet/, "CodeWiki compaction should skip when no source-backed packet exists");
assert.match(compactionSource, /ctx\.compact[\s\S]*formatCodewikiCompactionInstruction/, "CodeWiki context refresh should own compact instructions");

function staleTaskContext(taskId = "TASK-999") {
	return {
		hasUI: false,
		ui: { notify() {}, setStatus() {} },
		sessionManager: {
			getSessionId: () => "compaction-smoke-session",
			getBranch: () => [{
				type: "custom",
				customType: "codewiki.task-link",
				data: { taskId, action: "focus", summary: "stale task focus" },
			}],
		},
	};
}

async function createCompactionFixture({ openTask = true } = {}) {
	const root = await mkdtemp(join(tmpdir(), "codewiki-compaction-"));
	await mkdir(join(root, ".codewiki/kb/system"), { recursive: true });
	await mkdir(join(root, ".codewiki/roadmap"), { recursive: true });
	await writeFile(join(root, ".codewiki/config.json"), JSON.stringify({
		project_name: openTask ? "compaction-open" : "compaction-empty",
		schema_version: 4,
		docs_root: ".codewiki/kb",
	}, null, 2));
	await writeFile(join(root, ".codewiki/kb/system/graph.md"), [
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
	].join("\n"));
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
	await writeFile(join(root, ".codewiki/roadmap/queue.json"), JSON.stringify({
		version: 2,
		updated: "2026-05-20T00:00:00Z",
		order: openTask ? ["TASK-001"] : [],
		tasks,
	}, null, 2));
	return { root, project: await loadProject(root) };
}

{
	const { root, project } = await createCompactionFixture({ openTask: true });
	try {
		const summary = await buildCodewikiCompactionSummary(project, staleTaskContext("TASK-999"), { reason: "threshold" }, null);
		assert.equal(summary?.details.taskId, "TASK-001", "stale active session task should not become explicit resume request");
		const explicitStale = await buildCodewikiCompactionSummary(project, staleTaskContext("TASK-999"), { reason: "manual", taskId: "TASK-999" }, null);
		assert.equal(explicitStale?.details.taskId, "TASK-001", "stale explicit context refresh task should fall back to open roadmap task");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

{
	const { root, project } = await createCompactionFixture({ openTask: false });
	try {
		const summary = await buildCodewikiCompactionSummary(project, staleTaskContext("TASK-999"), { reason: "manual", taskId: "TASK-999" }, null);
		assert.equal(summary, null, "stale context refresh with no open roadmap task should no-op instead of throwing");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

console.log("✓ codewiki compaction smoke passed");
