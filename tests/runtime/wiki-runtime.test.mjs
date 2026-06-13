import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runWikiRuntime } from "../../src/api/wiki-runtime.ts";
import { appendTraceRecord } from "../../src/traces/append.ts";
import { readTrace } from "../../src/traces/reader.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { createTraceHead } from "../../src/traces/writer.ts";

function queue() {
	return {
		traceIds: ["TRACE-runtime"],
		summary: {
			backlog: 0,
			waiting: 0,
			ready: 2,
			claimed: 0,
			blocked: 0,
			done: 0,
		},
		items: [
			{
				id: "WU-runtime-a",
				kind: "work-unit",
				status: "ready",
				traceId: "TRACE-runtime",
				title: "Runtime A",
				traceRefs: ["TRACE-runtime:planning:work:1"],
				decisionRefs: ["TRACE-runtime:decision:row:1"],
				planningRefs: ["TRACE-runtime:planning:work:1"],
				componentRefs: ["runtime"],
				pathScopes: ["src/runtime/a.ts"],
				dependsOn: [],
				blockers: [],
				sourceEventId: "TRACE-runtime:planning:work:1",
			},
			{
				id: "WU-runtime-b",
				kind: "work-unit",
				status: "ready",
				traceId: "TRACE-runtime",
				title: "Runtime B",
				traceRefs: ["TRACE-runtime:planning:work:2"],
				decisionRefs: ["TRACE-runtime:decision:row:1"],
				planningRefs: ["TRACE-runtime:planning:work:2"],
				componentRefs: ["runtime"],
				pathScopes: ["src/runtime/b.ts"],
				dependsOn: [],
				blockers: [],
				sourceEventId: "TRACE-runtime:planning:work:2",
			},
		],
	};
}

describe("wiki_runtime core facade", () => {
	it("previews dispatch plans and claim events", async () => {
		const result = await runWikiRuntime({
			mode: "preview",
			queue: queue(),
			maxWorkers: 1,
			createdAt: "2026-06-11T00:00:01.000Z",
			nextSequenceByTrace: { "TRACE-runtime": 1 },
		});

		assert.equal(result.mode, "preview");
		assert.equal(result.plan.dispatch.length, 1);
		assert.equal(result.plan.held.length, 1);
		assert.equal(result.batch?.events.length, 1);
		assert.equal(result.batch?.events[0].event, "runtime.work.claimed");
		assert.deepEqual(result.batch?.nextSequenceByTrace, { "TRACE-runtime": 2 });
		assert.equal(result.append, undefined);
	});

	it("appends runtime claim events across trace files", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-wiki-runtime-"));
		try {
			const head = createTraceHead({
				traceId: "TRACE-runtime",
				title: "Runtime dispatch",
				createdAt: "2026-06-11T00:00:00.000Z",
			});
			const first = await appendTraceRecord(root, head, 0);
			const result = await runWikiRuntime({
				repoRoot: root,
				mode: "append",
				queue: queue(),
				maxWorkers: 2,
				createdAt: "2026-06-11T00:00:01.000Z",
				nextSequenceByTrace: { "TRACE-runtime": 1 },
				expectedBytesByTrace: { "TRACE-runtime": first.nextBytes },
			});
			const readBack = await readTrace(
				join(root, traceFilePath("TRACE-runtime")),
			);

			assert.equal(result.mode, "append");
			assert.equal(result.batch?.events.length, 2);
			assert.equal(result.append?.events.length, 2);
			assert.equal(readBack.records.at(-1)?.type, "trace_event");
			assert.equal(readBack.records.at(-1)?.event, "runtime.work.claimed");
			await assert.rejects(
				() => runWikiRuntime({ mode: "append", queue: queue() }),
				/nextSequenceByTrace/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
