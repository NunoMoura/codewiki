#!/usr/bin/env node
import assert from "node:assert/strict";
import { resolveImplementationTask } from "../../src/adapters/pi/commands/resume.ts";

function task(id, status, labels = [], codePaths = [], acceptance = []) {
	return {
		id,
		title: `${id} title`,
		status,
		priority: "high",
		kind: "testing",
		summary: labels.includes("umbrella") ? "Umbrella coordination task." : `${id} summary`,
		spec_paths: [],
		code_paths: codePaths,
		research_ids: [],
		labels,
		goal: { outcome: "", acceptance, non_goals: [], verification: [] },
		delta: { desired: "", current: "", closure: "" },
		created: "2026-05-16T00:00:00Z",
		updated: "2026-05-16T00:00:00Z",
	};
}

function roadmap(tasks) {
	return {
		version: 1,
		updated: "2026-05-16T00:00:00Z",
		order: tasks.map((item) => item.id),
		tasks: Object.fromEntries(tasks.map((item) => [item.id, item])),
	};
}

function state(claims = []) {
	return {
		generated_at: "2026-05-16T00:00:00Z",
		active_claim_count: claims.length,
		warning_count: 0,
		conflict_count: 0,
		pending_waiter_count: 0,
		ready_waiter_count: 0,
		claims,
		conflicts: [],
		waiters: [],
	};
}

const umbrella = task("TASK-077", "in_progress", ["umbrella"], ["src/application/graph.ts"]);
const delegatedContainer = task("TASK-082", "todo", [], ["src/roadmap/runtime.ts"], [
	"TASK-078 is closed with passing checks and evidence.",
	"TASK-079 is closed with passing checks and evidence.",
]);
const firstChild = task("TASK-083", "todo", [], ["skills/codewiki"]);
const secondChild = task("TASK-085", "todo", [], ["tests/fixtures"]);
const board = roadmap([umbrella, delegatedContainer, firstChild, secondChild]);

const selected = resolveImplementationTask(board, null, null, "TASK-077", state(), "session-helper");
assert.equal(selected.task?.id, "TASK-083", "implicit /wiki-resume should skip persisted container focus and delegated container tasks");
assert.ok(selected.skipped.some((item) => /TASK-077: non-executable container task/.test(item)), "selection should explain skipped container task");
assert.ok(selected.skipped.some((item) => /TASK-082: non-executable container task/.test(item)), "selection should explain delegated task-closure criteria");

assert.throws(
	() => resolveImplementationTask(board, null, "TASK-077", null, state(), "session-helper"),
	/not executable work/i,
	"explicit /wiki-resume TASK-### should reject container tasks",
);

const explicit = resolveImplementationTask(board, null, "TASK-083", "TASK-077", state(), "session-helper");
assert.equal(explicit.task?.id, "TASK-083", "explicit /wiki-resume TASK-### should honor requested child task");

const conflicting = state([
	{
		id: "CLAIM-999",
		session_id: "other-session",
		agent_name: "Other Agent",
		status: "active",
		mode: "write",
		summary: "Other session using skill artifacts.",
		task_id: "TASK-083",
		scopes: [{ layer: "code", path: "skills/codewiki/**" }],
		created_at: "2026-05-16T00:00:00Z",
		updated_at: "2026-05-16T00:00:00Z",
		expires_at: "2099-01-01T00:00:00Z",
	},
]);
const conflictSelection = resolveImplementationTask(board, null, null, "TASK-077", conflicting, "session-helper");
assert.equal(conflictSelection.task?.id, "TASK-085", "implicit /wiki-resume should skip artifacts in use by another session");
assert.ok(conflictSelection.skipped.some((item) => /TASK-083: Artifact conflict/.test(item)), "selection should explain artifact conflict");

assert.throws(
	() => resolveImplementationTask(board, null, "TASK-083", "TASK-077", conflicting, "session-helper"),
	/Artifact conflict/i,
	"explicit /wiki-resume TASK-### should block on real artifact conflict",
);

console.log("✓ resume scheduler smoke passed");
