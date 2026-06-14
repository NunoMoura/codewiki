import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runDecisionIteration } from "../../src/decision/iteration.ts";
import { createDecisionTable } from "../../src/decision/table.ts";
import {
	TraceAppendConflictError,
	appendSemanticLoopIteration,
	appendTraceRecord,
	appendTraceRecords,
	createLoopIterationEvent,
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
	TRACE_LOOP_VALUES,
} from "../../src/api/traces.ts";
import { decisionQualityFields } from "../helpers/decision-row.mjs";

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
		assert.deepEqual(
			[...TRACE_LOOP_VALUES],
			["decision", "planning", "implementation"],
		);
		assert.throws(
			() =>
				parseTraceText(formatTraceText([{ ...records[1], loop: "runtime" }])),
			/decision, planning, or implementation/,
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

	it("creates target loop iteration trace events", () => {
		const event = createLoopIterationEvent({
			traceId: "TRACE-20260611-traces",
			loop: "implementation",
			id: "evt-iteration-0001",
			parentId: "evt-planning-0001",
			sequence: 2,
			refs: [
				"src/traces/events.ts",
				"src/traces/events.ts",
				"tests/traces/traces-jsonl.test.mjs",
			],
			createdAt: "2026-06-11T00:00:03.000Z",
			iteration: 1,
			trigger: "worker_results",
			output: { changedPaths: ["src/traces/events.ts"] },
			exit: {
				status: "route_back",
				targetLoop: "planning",
				nextAction: "Repair work scope before implementation continues.",
				conditions: [
					{
						id: "implementation.scope.coverage",
						status: "unmet",
						refs: ["trace:evt-planning-0001", "trace:evt-planning-0001"],
					},
				],
			},
			progress: {
				changedRefs: ["src/traces/events.ts", "src/traces/events.ts"],
				newlyMetConditions: ["implementation.content.proof"],
				repeatedFailures: [],
				nextSafeAction: "Rerun planning iteration.",
			},
		});

		assert.equal(event.event, "implementation.iteration");
		assert.deepEqual(event.refs, [
			"src/traces/events.ts",
			"tests/traces/traces-jsonl.test.mjs",
		]);
		assert.deepEqual(event.data.exit.conditions[0].refs, [
			"trace:evt-planning-0001",
		]);
		assert.deepEqual(event.data.progress.changedRefs, ["src/traces/events.ts"]);
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

	it("appends semantic loop iterations as one checked batch", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-loop-append-"));
		try {
			const head = createTraceHead({
				traceId: "TRACE-20260611-loop-append",
				title: "Append semantic loop iteration",
				createdAt: "2026-06-11T00:00:00.000Z",
			});
			const first = await appendTraceRecord(root, head, 0);
			const table = createDecisionTable({
				id: "DT-loop-append",
				createdAt: "2026-06-11T00:00:01.000Z",
				updatedAt: "2026-06-11T00:00:01.000Z",
				rows: [
					{
						id: "DTR-loop-append",
						currentState: "Loop writes are assembled before append.",
						desiredState: "Loop iteration append is one checked batch.",
						rationale: "Avoid partial durable semantic state.",
						...decisionQualityFields(),
						approval: "approved",
						sourceRefs: ["kb:system/traces.md"],
					},
				],
			});
			const result = await appendSemanticLoopIteration({
				repoRoot: root,
				loop: "decision",
				expectedBytes: first.nextBytes,
				nextSequence: 1,
				expectedTraceId: head.traceId,
				run: ({ startSequence }) =>
					runDecisionIteration({
						traceId: head.traceId,
						table,
						startSequence,
						createdAt: "2026-06-11T00:00:01.000Z",
					}),
			});
			const readBack = await readTrace(join(root, traceFilePath(head.traceId)));
			const state = replayTrace(readBack.records);

			assert.equal(result.iterationEvent.event, "decision.iteration");
			assert.equal(result.iterationEvent.sequence, 1);
			assert.equal(result.append.records.length, 2);
			assert.equal(state.events.at(-1)?.id, result.iterationEvent.id);
			assert.equal(state.latestCheckpoint?.parentId, result.iterationEvent.id);
			assert.equal(readBack.records.length, 3);
			await assert.rejects(
				() =>
					appendSemanticLoopIteration({
						repoRoot: root,
						loop: "planning",
						expectedBytes: result.append.nextBytes,
						nextSequence: 5,
						expectedTraceId: head.traceId,
						run: ({ startSequence }) =>
							runDecisionIteration({
								traceId: head.traceId,
								table,
								startSequence,
								createdAt: "2026-06-11T00:00:02.000Z",
							}),
					}),
				/exactly one planning\.iteration/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("appends exit batches atomically", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-trace-batch-"));
		try {
			const records = sampleRecords();
			const first = await appendTraceRecords(root, records.slice(0, 2), 0);
			const second = await appendTraceRecords(
				root,
				[records[2]],
				first.nextBytes,
			);
			const readBack = await readTrace(
				join(root, traceFilePath(records[0].traceId)),
			);

			assert.equal(first.previousBytes, 0);
			assert.equal(second.previousBytes, first.nextBytes);
			assert.equal(readBack.records.length, 3);
			await assert.rejects(
				() => appendTraceRecords(root, [records[2]], first.nextBytes),
				TraceAppendConflictError,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("creates cold-retention stubs without a catalog", () => {
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
