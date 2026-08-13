import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runDecisionIteration } from "../helpers/canonical-loop-events.mjs";
import { canonicalChangeInput } from "../helpers/canonical-loop-events.mjs";
import { invalidTraceRefs } from "../../src/traces/refs.ts";
import {
	CodewikiError,
	codewikiErrorData,
	isCodewikiError,
} from "../../src/error-handling/codewiki-error.ts";
import {
	TraceAppendConflictError,
	TraceClosedAppendError,
} from "../../src/error-handling/trace-errors.ts";
import {appendSemanticLoopReport} from "../../src/runtime/persistence/trace.ts";
import {appendTraceRecord, appendTraceRecords} from "../../src/traces/append.ts";
import {createLoopIterationEvent} from "../../src/traces/events.ts";
import {
	parseTraceText,
	readLastTraceRecord,
	readTrace,
} from "../../src/traces/reader.ts";
import {replayTrace} from "../../src/traces/replay.ts";
import {
	buildTraceRetentionStub,
	createTraceCloseRecord,
} from "../../src/traces/retention.ts";
import {traceHasEvent, traceRefs} from "../../src/traces/queries.ts";
import {TRACE_LOOP_VALUES, traceFilePath} from "../../src/traces/schema.ts";
import {
	createTailCheckpoint,
	createTraceHead,
	createTriggerRunTraceHead,
	formatTraceText,
} from "../../src/traces/writer.ts";
import { decisionQualityFields } from "../helpers/proposed-change.mjs";

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
		event: "change_approved",
		refs: ["kb:system/components/traces.md", "src/traces/schema.ts"],
		createdAt: "2026-06-11T00:00:01.000Z",
		data: { changeId: "CHG-001" },
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

	it("records run lineage on trace heads", () => {
		const head = createTriggerRunTraceHead({
			traceId: "TRACE-20260611-run",
			title: "Run scheduled dependency check",
			triggerTraceId: "TRACE-20260611-trigger",
			triggerId: "TRG-dependency-check",
			planningRef:
				"trace:TRACE-20260611-trigger:planning:iteration:1#work:WU-trigger",
			runKey: "dependency-check:2026-W24",
			sourceRef: "kb:system/components/runtime.md",
			createdAt: "2026-06-11T00:00:00.000Z",
		});
		const parsed = parseTraceText(formatTraceText([head]));
		const state = replayTrace(parsed);

		assert.equal(parsed[0].origin.kind, "trigger_run");
		assert.equal(parsed[0].origin.parentTraceId, "TRACE-20260611-trigger");
		assert.equal(parsed[0].origin.triggerTraceId, "TRACE-20260611-trigger");
		assert.equal(parsed[0].origin.triggerId, "TRG-dependency-check");
		assert.equal(parsed[0].origin.runKey, "dependency-check:2026-W24");
		assert.deepEqual(state.refs, [
			"TRACE-20260611-trigger",
			"TRG-dependency-check",
			"trace:TRACE-20260611-trigger:planning:iteration:1#work:WU-trigger",
			"dependency-check:2026-W24",
			"kb:system/components/runtime.md",
		]);
		assert.throws(
			() =>
				parseTraceText(
					formatTraceText([
						{
							type: "trace_head",
							traceId: "TRACE-bad-run",
							title: "Bad run",
							createdAt: "2026-06-11T00:00:00.000Z",
							origin: {
								kind: "trigger_run",
								refs: [],
							},
						},
					]),
				),
			/triggerTraceId|triggerId|planningRef|runKey|refs/,
		);
	});

	it("replays ordered records into current trace state", () => {
		const records = sampleRecords();
		const state = replayTrace(records);

		assert.equal(state.head.traceId, "TRACE-20260611-traces");
		assert.equal(state.events.length, 1);
		assert.equal(state.latestCheckpoint?.id, "tail-0001");
		assert.deepEqual(state.refs, [
			"kb:system/components/traces.md",
			"src/traces/schema.ts",
		]);
		assert.equal(traceHasEvent(records, "change_approved"), true);
		assert.deepEqual(traceRefs(records), [
			"kb:system/components/traces.md",
			"src/traces/schema.ts",
			"git:tree:abc123",
		]);
	});

	it("treats active agent, config, and Pi settings paths as canonical refs", () => {
		assert.deepEqual(
			invalidTraceRefs([
				".agents/skills/codewiki-decide/SKILL.md",
				".codewiki/config.json",
				".pi/settings.json",
			]),
			[],
		);
		assert.deepEqual(invalidTraceRefs(["lab/decision/loop.ts"]), [
			"lab/decision/loop.ts",
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

		assert.equal(event.event, "route_back_requested");
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
			assert.deepEqual(
				await readLastTraceRecord(join(root, traceFilePath(head.traceId))),
				event,
			);
			await assert.rejects(
				() => appendTraceRecord(root, event, first.nextBytes),
				TraceAppendConflictError,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("normalizes append conflicts through CodewikiError", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-error-trace-"));
		try {
			const [head] = sampleRecords();
			const first = await appendTraceRecord(root, head, 0);
			await assert.rejects(
				() => appendTraceRecord(root, head, first.previousBytes),
				(error) => {
					assert.equal(error instanceof TraceAppendConflictError, true);
					assert.equal(error instanceof CodewikiError, true);
					assert.equal(isCodewikiError(error), true);
					assert.equal(error.domain, "trace");
					assert.equal(error.code, "append_conflict");
					assert.equal(error.suggestedAction, "refresh_trace");
					assert.equal(error.data.expectedBytes, first.previousBytes);
					assert.equal(error.data.actualBytes, first.nextBytes);
					assert.deepEqual(codewikiErrorData(error)?.refs, [error.path]);
					return true;
				},
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects invalid records before writing an append", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-invalid-append-"));
		try {
			const [head, event] = sampleRecords();
			const first = await appendTraceRecord(root, head, 0);
			await assert.rejects(
				() =>
					appendTraceRecord(
						root,
						{ ...event, event: "decision.iteration" },
						first.nextBytes,
					),
				/Semantic trace event decision\.iteration is not valid/,
			);
			const readBack = await readTrace(join(root, traceFilePath(head.traceId)));
			assert.equal(readBack.records.length, 1);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("appends semantic loop reports as one checked batch", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-loop-append-"));
		try {
			const head = createTraceHead({
				traceId: "TRACE-20260611-loop-append",
				title: "Append semantic loop iteration",
				createdAt: "2026-06-11T00:00:00.000Z",
			});
			const first = await appendTraceRecord(root, head, 0);
			const changeInput = canonicalChangeInput({
				id: "SP-loop-append",
				createdAt: "2026-06-11T00:00:01.000Z",
				updatedAt: "2026-06-11T00:00:01.000Z",
				changes: [
					{
						id: "CHG-loop-append",
						currentState: "Loop writes are assembled before append.",
						desiredState:
							"Runtime appends semantic loop reports as one checked batch.",
						rationale: "Avoid partial durable semantic state.",
						...decisionQualityFields(),
						approval: "approved",
						sourceRefs: ["kb:system/components/traces.md"],
					},
				],
			});
			const result = await appendSemanticLoopReport({
				repoRoot: root,
				loop: "decision",
				expectedBytes: first.nextBytes,
				nextSequence: 1,
				expectedTraceId: head.traceId,
				run: ({ startSequence }) =>
					runDecisionIteration({
						traceId: head.traceId,
						changeInput,
						startSequence,
						createdAt: "2026-06-11T00:00:01.000Z",
					}),
			});
			const readBack = await readTrace(join(root, traceFilePath(head.traceId)));
			const state = replayTrace(readBack.records);

			assert.equal(result.iterationEvent.event, "change_approved");
			assert.equal(result.iterationEvent.sequence, 1);
			assert.equal(result.append.records.length, 2);
			assert.equal(state.events.at(-1)?.id, result.iterationEvent.id);
			assert.equal(state.latestCheckpoint?.parentId, result.iterationEvent.id);
			assert.equal(readBack.records.length, 3);
			await assert.rejects(
				() =>
					appendSemanticLoopReport({
						repoRoot: root,
						loop: "planning",
						expectedBytes: result.append.nextBytes,
						nextSequence: 5,
						expectedTraceId: head.traceId,
						run: ({ startSequence }) =>
							runDecisionIteration({
								traceId: head.traceId,
								changeInput,
								startSequence,
								createdAt: "2026-06-11T00:00:02.000Z",
							}),
					}),
				/exactly one planning output event/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects appends after trace close", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-trace-closed-"));
		try {
			const records = sampleRecords();
			const close = createTraceCloseRecord({
				records,
				gitRestoreRef: "refs/codewiki/archive/TRACE-20260611-traces",
				createdAt: "2026-06-11T00:00:03.000Z",
				allowIncomplete: true,
			});
			await assert.rejects(
				() => appendTraceRecords(root, [...records, close, records[1]], 0),
				/after trace_close/,
			);
			const first = await appendTraceRecords(root, records, 0);
			const closed = await appendTraceRecord(root, close, first.nextBytes);

			await assert.rejects(
				() => appendTraceRecord(root, records[1], closed.nextBytes),
				TraceClosedAppendError,
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
