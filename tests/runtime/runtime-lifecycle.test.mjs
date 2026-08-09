import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { appendDevLogEntry, readDevLog } from "../../src/runtime/persistence/dev-log.ts";
import {
	appendRuntimeHostLifecycleEvents,
	createRuntimeHostLifecycleEvent,
} from "../../src/runtime/lifecycle.ts";
import { appendTraceRecord } from "../../src/traces/append.ts";
import { createTraceHead } from "../../src/traces/writer.ts";

it("cleans Dev Log only after durable trace-host closure", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-runtime-close-"));
	const traceId = "TRACE-runtime-close";
	try {
		const head = createTraceHead({
			traceId,
			title: "Runtime close",
			createdAt: "2026-07-12T00:00:00.000Z",
		});
		const appended = await appendTraceRecord(root, head, 0);
		await appendDevLogEntry(root, {
			id: "dev-close-1",
			timestamp: "2026-07-12T00:00:01.000Z",
			traceId,
			category: "runtime",
			action: "runtime.observed",
			status: "info",
		});
		const event = createRuntimeHostLifecycleEvent({
			traceId,
			role: "trace",
			state: "closed",
			sequence: 1,
			parentId: null,
			createdAt: "2026-07-12T00:00:02.000Z",
		});
		await appendRuntimeHostLifecycleEvents(
			{ events: [event], nextSequenceByTrace: { [traceId]: 2 } },
			{
				repoRoot: root,
				expectedBytesByTrace: { [traceId]: appended.nextBytes },
			},
		);
		assert.deepEqual(await readDevLog(root, traceId), []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
