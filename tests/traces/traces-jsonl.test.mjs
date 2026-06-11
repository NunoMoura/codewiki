import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	TraceAppendConflictError,
	appendTraceRecord,
	createTailCheckpoint,
	createTraceHead,
	formatTraceText,
	parseTraceText,
	readTrace,
	replayTrace,
	traceFilePath,
	traceHasEvent,
	traceRefs,
	buildTraceRetentionStub,
} from "../../src/api/traces.ts";

function sampleRecords() {
	const head = createTraceHead({
		traceId: "TRACE-20260611-traces",
		title: "Migrate trace JSONL core",
		createdAt: "2026-06-11T00:00:00.000Z",
	});
	const event = {
		type: "trace_event",
		id: "evt-0001",
		parentId: null,
		traceId: head.traceId,
		sequence: 1,
		loop: "decision",
		event: "decision.approved",
		refs: ["kb:system/traces.md", "src/traces/schema.ts"],
		createdAt: "2026-06-11T00:00:01.000Z",
		data: { rowId: "DTR-001" },
	};
	const checkpoint = createTailCheckpoint({
		id: "tail-0001",
		parentId: event.id,
		traceId: head.traceId,
		firstKeptRecordId: event.id,
		summary: "Decision approved; planning next.",
		createdAt: "2026-06-11T00:00:02.000Z",
		data: { refs: ["git:tree:abc123"] },
	});
	return [head, event, checkpoint];
}

describe("trace JSONL core", () => {
	it("round-trips trace records with validation", () => {
		const records = sampleRecords();
		const parsed = parseTraceText(formatTraceText(records));

		assert.deepEqual(parsed, records);
		assert.throws(
			() => parseTraceText('{"type":"trace_event","id":"bad"}\n'),
			/TraceValidationError|Trace event/,
		);
	});

	it("replays ordered records into current trace state", () => {
		const records = sampleRecords();
		const state = replayTrace(records);

		assert.equal(state.head.traceId, "TRACE-20260611-traces");
		assert.equal(state.events.length, 1);
		assert.equal(state.latestCheckpoint?.id, "tail-0001");
		assert.deepEqual(state.refs, [
			"kb:system/traces.md",
			"src/traces/schema.ts",
		]);
		assert.equal(traceHasEvent(records, "decision.approved"), true);
		assert.deepEqual(traceRefs(records), [
			"kb:system/traces.md",
			"src/traces/schema.ts",
			"git:tree:abc123",
		]);
	});

	it("appends with byte-offset compare-and-swap", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-traces-"));
		try {
			const [head, event] = sampleRecords();
			const first = await appendTraceRecord(root, head, 0);
			const second = await appendTraceRecord(root, event, first.nextBytes);
			const readBack = await readTrace(join(root, traceFilePath(head.traceId)));

			assert.equal(first.previousBytes, 0);
			assert.equal(second.previousBytes, first.nextBytes);
			assert.equal(readBack.records.length, 2);
			await assert.rejects(
				() => appendTraceRecord(root, event, first.nextBytes),
				TraceAppendConflictError,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("builds cold-retention stubs without a catalog", () => {
		const records = sampleRecords();
		const stub = buildTraceRetentionStub({
			records,
			gitRestoreRef: "git:restore:TRACE-20260611-traces",
		});

		assert.deepEqual(stub, {
			traceId: "TRACE-20260611-traces",
			title: "Migrate trace JSONL core",
			headRef: "TRACE-20260611-traces",
			gitRestoreRef: "git:restore:TRACE-20260611-traces",
			firstKeptRecordId: "evt-0001",
			summary: "Decision approved; planning next.",
			createdAt: "2026-06-11T00:00:00.000Z",
		});
	});
});
