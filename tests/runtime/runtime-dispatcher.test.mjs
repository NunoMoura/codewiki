import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	appendRuntimeDispatchClaims,
	createRuntimeDispatchClaimEvents,
} from "../../src/runtime/dispatcher.ts";
import { planningQualityStandards } from "../../src/planning/quality-standards.ts";
import { planRuntimeDispatch } from "../../src/runtime/scheduler.ts";
import {
	TraceAppendConflictError,
	appendTraceRecords,
	assertValidTraceRecord,
	createTraceHead,
	readTrace,
	traceFilePath,
} from "../../src/api/traces.ts";
import { buildWorkQueueView } from "../../src/views/work-queue.ts";

function planningEvent(traceId, workUnitId, pathScope, sequence = 1) {
	const decisionRef = `trace:${traceId}:decision:iteration:1#row:DTR-${workUnitId}`;
	return {
		type: "trace_event",
		id: `${traceId}:planning:iteration:${sequence}`,
		parentId: null,
		traceId,
		sequence,
		loop: "planning",
		event: "planning.iteration",
		refs: [decisionRef, pathScope],
		createdAt: "2026-06-11T00:00:01.000Z",
		data: {
			exit: { status: "exit", targetLoop: "implementation" },
			output: {
				qualityStandards: planningQualityStandards([]),
				workItems: [
					{
						id: workUnitId,
						title: `Work ${workUnitId}`,
						decisionRefs: [decisionRef],
						componentRefs: ["component.runtime"],
						pathScopes: [pathScope],
						dependsOn: [],
					},
				],
			},
		},
	};
}

function planningWorkRef(event, workUnitId) {
	return `trace:${event.id}#work:${workUnitId}`;
}

async function seedTrace(root, event) {
	return appendTraceRecords(
		root,
		[
			createTraceHead({
				traceId: event.traceId,
				title: `Trace ${event.traceId}`,
				createdAt: "2026-06-11T00:00:00.000Z",
			}),
			event,
		],
		0,
	);
}

describe("runtime dispatcher claim batch", () => {
	it("turns dispatch plan items into runtime claim trace events", () => {
		const first = planningEvent("TRACE-dispatch-a", "WU-a", "src/runtime");
		const second = planningEvent("TRACE-dispatch-b", "WU-b", "src/views");
		const queue = buildWorkQueueView({ records: [first, second] });
		const plan = planRuntimeDispatch(queue, { maxWorkers: 2 });
		const batch = createRuntimeDispatchClaimEvents(plan, {
			createdAt: "2026-06-11T00:00:02.000Z",
			expiresAt: "2026-06-11T00:10:02.000Z",
			nextSequenceByTrace: {
				"TRACE-dispatch-a": 2,
				"TRACE-dispatch-b": 4,
			},
			workerIdPrefix: "impl-worker",
			claimIdPrefix: "dispatch-claim",
		});

		assert.equal(batch.events.length, 2);
		for (const event of batch.events) assertValidTraceRecord(event);
		assert.deepEqual(
			batch.events.map((event) => [
				event.traceId,
				event.sequence,
				event.event,
				event.data?.workerId,
				event.data?.claimId,
			]),
			[
				[
					"TRACE-dispatch-a",
					2,
					"runtime.work.claimed",
					"impl-worker-001",
					"dispatch-claim-WU-a-001",
				],
				[
					"TRACE-dispatch-b",
					4,
					"runtime.work.claimed",
					"impl-worker-002",
					"dispatch-claim-WU-b-002",
				],
			],
		);
		assert.deepEqual(batch.nextSequenceByTrace, {
			"TRACE-dispatch-a": 3,
			"TRACE-dispatch-b": 5,
		});
		const firstWorkRef = planningWorkRef(first, "WU-a");
		assert.equal(batch.events[0].parentId, first.id);
		assert.deepEqual(batch.events[0].refs, [firstWorkRef, "src/runtime"]);
		assert.equal(batch.events[0].refs.includes("impl-worker-001"), false);
		assert.deepEqual(batch.events[0].data?.componentRefs, [
			"component.runtime",
		]);
	});

	it("does not dispatch work when planning quality standards are missing or blocked", () => {
		const missing = planningEvent(
			"TRACE-quality-missing",
			"WU-quality-missing",
			"src/runtime",
		);
		delete missing.data.output.qualityStandards;
		const blocked = planningEvent(
			"TRACE-quality-blocked",
			"WU-quality-blocked",
			"src/views",
		);
		blocked.data.output.qualityStandards =
			blocked.data.output.qualityStandards.map((standard) =>
				standard.id === "uncertainty_resolved"
					? {
							...standard,
							status: "blocked",
							mode: "user",
							message: "User must resolve planning uncertainty.",
							refs: ["WU-quality-blocked"],
						}
					: standard,
			);
		const queue = buildWorkQueueView({ records: [missing, blocked] });
		const plan = planRuntimeDispatch(queue, { maxWorkers: 2 });
		const byId = Object.fromEntries(queue.items.map((item) => [item.id, item]));

		assert.equal(byId["WU-quality-missing"].status, "blocked");
		assert.equal(byId["WU-quality-blocked"].status, "blocked");
		assert.equal(
			byId["WU-quality-missing"].qualityStandards.some(
				(standard) => standard.status === "missing",
			),
			true,
		);
		assert.deepEqual(plan.dispatch, []);
	});

	it("marks dispatched work claimed when events are folded back into the queue", () => {
		const planning = planningEvent(
			"TRACE-dispatch",
			"WU-dispatch",
			"src/runtime",
		);
		const queue = buildWorkQueueView({ records: [planning] });
		const plan = planRuntimeDispatch(queue, { maxWorkers: 1 });
		const batch = createRuntimeDispatchClaimEvents(plan, {
			createdAt: "2026-06-11T00:00:02.000Z",
			nextSequenceByTrace: { "TRACE-dispatch": 2 },
			workerIds: { "WU-dispatch": "worker-custom" },
		});
		const claimedQueue = buildWorkQueueView({
			records: [planning, ...batch.events],
		});

		assert.equal(claimedQueue.items[0].status, "claimed");
		assert.equal(claimedQueue.items[0].claimedBy, "worker-custom");
	});

	it("appends claim events across trace files after byte preflight", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-dispatch-"));
		try {
			const first = planningEvent("TRACE-append-a", "WU-a", "src/runtime");
			const second = planningEvent("TRACE-append-b", "WU-b", "src/views");
			const firstSeed = await seedTrace(root, first);
			const secondSeed = await seedTrace(root, second);
			const plan = planRuntimeDispatch(
				buildWorkQueueView({ records: [first, second] }),
				{ maxWorkers: 2 },
			);
			const batch = createRuntimeDispatchClaimEvents(plan, {
				createdAt: "2026-06-11T00:00:02.000Z",
				nextSequenceByTrace: {
					"TRACE-append-a": 2,
					"TRACE-append-b": 2,
				},
			});
			const append = await appendRuntimeDispatchClaims(batch, {
				repoRoot: root,
				expectedBytesByTrace: {
					"TRACE-append-a": firstSeed.nextBytes,
					"TRACE-append-b": secondSeed.nextBytes,
				},
			});

			assert.deepEqual(append.nextBytesByTrace, {
				"TRACE-append-a": append.results[0].nextBytes,
				"TRACE-append-b": append.results[1].nextBytes,
			});
			const firstRead = await readTrace(
				join(root, traceFilePath(first.traceId)),
			);
			const secondRead = await readTrace(
				join(root, traceFilePath(second.traceId)),
			);
			assert.equal(firstRead.records.at(-1)?.event, "runtime.work.claimed");
			assert.equal(secondRead.records.at(-1)?.event, "runtime.work.claimed");
			assert.equal(
				buildWorkQueueView({
					records: [...firstRead.records, ...secondRead.records],
				}).summary.claimed,
				2,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("preflights every trace before appending dispatch claims", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-dispatch-conflict-"));
		try {
			const first = planningEvent("TRACE-preflight-a", "WU-a", "src/runtime");
			const second = planningEvent("TRACE-preflight-b", "WU-b", "src/views");
			const firstSeed = await seedTrace(root, first);
			await seedTrace(root, second);
			const plan = planRuntimeDispatch(
				buildWorkQueueView({ records: [first, second] }),
				{ maxWorkers: 2 },
			);
			const batch = createRuntimeDispatchClaimEvents(plan, {
				createdAt: "2026-06-11T00:00:02.000Z",
				nextSequenceByTrace: {
					"TRACE-preflight-a": 2,
					"TRACE-preflight-b": 2,
				},
			});

			await assert.rejects(
				() =>
					appendRuntimeDispatchClaims(batch, {
						repoRoot: root,
						expectedBytesByTrace: {
							"TRACE-preflight-a": firstSeed.nextBytes,
							"TRACE-preflight-b": 0,
						},
					}),
				TraceAppendConflictError,
			);
			const firstRead = await readTrace(
				join(root, traceFilePath(first.traceId)),
			);
			assert.equal(firstRead.records.length, 2);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("requires next sequence per trace before creating claim events", () => {
		const planning = planningEvent(
			"TRACE-missing-seq",
			"WU-seq",
			"src/runtime",
		);
		const queue = buildWorkQueueView({ records: [planning] });
		const plan = planRuntimeDispatch(queue, { maxWorkers: 1 });

		assert.throws(
			() =>
				createRuntimeDispatchClaimEvents(plan, {
					createdAt: "2026-06-11T00:00:02.000Z",
					nextSequenceByTrace: {},
				}),
			/Missing next trace sequence for TRACE-missing-seq\./,
		);
	});
});
