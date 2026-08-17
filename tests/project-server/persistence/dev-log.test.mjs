import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	appendDevLogEntry,
	applyDevLogRetention,
	createDevLogEntry,
	devLogDirectory,
	readDevLog,
} from "../../../src/project-server/persistence/dev-log.ts";

function entry(index = 1, overrides = {}) {
	return {
		id: `dev-${index}`,
		timestamp: "2026-07-12T12:00:00.000Z",
		traceId: "TRACE-dev-log",
		workUnitId: "WU-dev-log",
		workerId: "worker-001",
		attemptId: "claim-001",
		category: "command",
		action: "command.finished",
		status: "success",
		durationMs: 42,
		exitCode: 0,
		summary: "Targeted tests passed.",
		refs: ["tests/project-server/persistence/dev-log.test.mjs"],
		...overrides,
	};
}

describe("bounded Dev Log", () => {
	it("writes ordered private entries and retains blocked diagnostics", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-dev-log-"));
		try {
			await Promise.all([
				appendDevLogEntry(root, entry(1)),
				appendDevLogEntry(root, entry(2, { action: "check.started", status: "running" })),
				appendDevLogEntry(root, entry(3, { action: "check.finished" })),
			]);
			const values = await readDevLog(root, "TRACE-dev-log");
			assert.deepEqual(values.map((value) => value.id), ["dev-1", "dev-2", "dev-3"]);
			assert.equal(values[0].schemaVersion, "codewiki.dev-log.v1");
			if (process.platform !== "win32") {
				assert.equal((await stat(devLogDirectory(root, "TRACE-dev-log"))).mode & 0o777, 0o700);
				assert.equal((await stat(join(devLogDirectory(root, "TRACE-dev-log"), "events.jsonl"))).mode & 0o777, 0o600);
			}
			await applyDevLogRetention(root, "TRACE-dev-log", "blocked");
			assert.equal((await readDevLog(root, "TRACE-dev-log")).length, 3);
			await applyDevLogRetention(root, "TRACE-dev-log", "completed");
			assert.deepEqual(await readDevLog(root, "TRACE-dev-log"), []);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects private, sensitive, traversing, and unbounded inputs before write", () => {
		for (const field of ["prompt", "chainOfThought", "rawOutput", "sourceContent", "environment"]) {
			assert.throws(() => createDevLogEntry(entry(1, { [field]: "private" })), new RegExp(`field ${field} is not allowed`));
		}
		assert.throws(
			() => createDevLogEntry(entry(1, { summary: "Authorization: Bearer abc123" })),
			/contains sensitive text/,
		);
		assert.throws(
			() => createDevLogEntry(entry(1, { refs: ["https://host/path?token=abc"] })),
			/contains sensitive text/,
		);
		assert.throws(
			() => createDevLogEntry(entry(1, { traceId: "../TRACE-other" })),
			/traceId is invalid/,
		);
		assert.throws(
			() => createDevLogEntry(entry(1, { summary: "x".repeat(513) })),
			/1 to 512 characters/,
		);
		assert.throws(
			() => createDevLogEntry(entry(1, { durationMs: 86_400_001 })),
			/durationMs is out of bounds/,
		);
	});

	it("bounds reads and rotates oversized logs", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-dev-log-rotate-"));
		try {
			const summary = "x".repeat(500);
			for (let index = 0; index < 1_700; index += 1) {
				await appendDevLogEntry(root, entry(index, { summary }));
			}
			const values = await readDevLog(root, "TRACE-dev-log", 10);
			assert.equal(values.length, 10);
			assert.equal(values.at(-1).id, "dev-1699");
			await stat(join(devLogDirectory(root, "TRACE-dev-log"), "events.1.jsonl"));
			await assert.rejects(() => readDevLog(root, "TRACE-dev-log", 10_001), /1 to 10000/);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
