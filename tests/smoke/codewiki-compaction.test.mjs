#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	formatCodewikiCompactionInstruction,
	requestCodewikiContextRefresh,
	shouldTriggerCodewikiThresholdRefresh,
	takePendingCodewikiContextRefresh,
} from "../../src/adapters/pi/compaction.ts";

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

console.log("✓ codewiki compaction smoke passed");
