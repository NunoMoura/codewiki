import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	appendProjectServerWorkUnitClaims,
	createProjectServerWorkUnitClaimEvents,
} from "../../src/project-server/claims/work-unit-events.ts";
import { planningQualityStandards } from "../helpers/canonical-loop-events.mjs";
import { selectProjectServerWorkUnitClaims } from "../../src/project-server/claims/work-unit-selection.ts";
import {TraceAppendConflictError} from "../../src/changes/trace/storage-errors.ts";
import {appendTraceRecords} from "../../src/changes/trace/append.ts";
import {readTrace} from "../../src/changes/trace/reader.ts";
import {assertValidTraceRecord, traceFilePath} from "../../src/changes/trace/schema.ts";
import {createTraceHead} from "../../src/changes/trace/writer.ts";
import { buildWorkQueueView } from "../../src/work-state/work-queue.ts";

function planningEvent(traceId, workUnitId, pathScope, sequence = 1) {
	const changeRef = `trace:${traceId}:decision:iteration:1#change:CHG-${workUnitId}`;
	return {
		type: "trace_event",
		id: `${traceId}:planning:iteration:${sequence}`,
		parentId: null,
		traceId,
		sequence,
		loop: "planning",
		event: "work_units_created",
		refs: [changeRef, pathScope],
		createdAt: "2026-06-11T00:00:01.000Z",
		data: {
			exit: { status: "exit", targetLoop: "implementation" },
			output: {
				qualityStandards: planningQualityStandards([]),
				workUnits: [
					{
						id: workUnitId,
						title: `Work ${workUnitId}`,
						changeRefs: [changeRef],
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

describe("runtime work-unit claim helper claim batch", () => {
	it("turns work-unit claim selection items into runtime claim trace events", () => {
		const first = planningEvent("TRACE-claim-a", "WU-a", "src/runtime");
		const second = planningEvent("TRACE-claim-b", "WU-b", "src/work-state");
		const queue = buildWorkQueueView({ records: [first, second] });
		const plan = selectProjectServerWorkUnitClaims(queue, { maxWorkers: 2 });
		const batch = createProjectServerWorkUnitClaimEvents(plan, {
			createdAt: "2026-06-11T00:00:02.000Z",
			expiresAt: "2026-06-11T00:10:02.000Z",
			nextSequenceByTrace: {
				"TRACE-claim-a": 2,
				"TRACE-claim-b": 4,
			},
			workerIdPrefix: "impl-worker",
			claimIdPrefix: "claim",
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
					"TRACE-claim-a",
					2,
					"runtime.work_unit.claimed",
					"impl-worker-001",
					"claim-WU-a-001",
				],
				[
					"TRACE-claim-b",
					4,
					"runtime.work_unit.claimed",
					"impl-worker-002",
					"claim-WU-b-002",
				],
			],
		);
		assert.deepEqual(batch.nextSequenceByTrace, {
			"TRACE-claim-a": 3,
			"TRACE-claim-b": 5,
		});
		const firstWorkRef = planningWorkRef(first, "WU-a");
		assert.equal(batch.events[0].parentId, first.id);
		assert.deepEqual(batch.events[0].refs, [firstWorkRef, "src/runtime"]);
		assert.equal(batch.events[0].refs.includes("impl-worker-001"), false);
		assert.deepEqual(batch.events[0].data?.componentRefs, [
			"component.runtime",
		]);
	});

	it("does not select work-unit claims when planning quality standards are missing or blocked", () => {
		const missing = planningEvent(
			"TRACE-quality-missing",
			"WU-quality-missing",
			"src/runtime",
		);
		delete missing.data.output.qualityStandards;
		const blocked = planningEvent(
			"TRACE-quality-blocked",
			"WU-quality-blocked",
			"src/work-state",
		);
		blocked.data.output.qualityStandards =
			blocked.data.output.qualityStandards.map((standard) =>
				standard.id === "acceptance_clarity"
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
		const plan = selectProjectServerWorkUnitClaims(queue, { maxWorkers: 2 });
		const byId = Object.fromEntries(queue.items.map((item) => [item.id, item]));

		assert.equal(byId["WU-quality-missing"].status, "blocked");
		assert.equal(byId["WU-quality-blocked"].status, "blocked");
		assert.equal(
			byId["WU-quality-missing"].qualityStandards.some(
				(standard) => standard.status === "missing",
			),
			true,
		);
		assert.deepEqual(plan.selected, []);
	});

	it("marks selected work claimed when events are folded back into the queue", () => {
		const planning = planningEvent("TRACE-claim", "WU-claim", "src/runtime");
		const queue = buildWorkQueueView({ records: [planning] });
		const plan = selectProjectServerWorkUnitClaims(queue, { maxWorkers: 1 });
		const batch = createProjectServerWorkUnitClaimEvents(plan, {
			createdAt: "2026-06-11T00:00:02.000Z",
			nextSequenceByTrace: { "TRACE-claim": 2 },
			workerIds: { "WU-claim": "worker-custom" },
		});
		const claimedQueue = buildWorkQueueView({
			records: [planning, ...batch.events],
		});

		assert.equal(claimedQueue.items[0].status, "claimed");
		assert.equal(claimedQueue.items[0].claimedBy, "worker-custom");
	});

	it("appends claim events across trace files after byte preflight", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-claim-"));
		try {
			const first = planningEvent("TRACE-append-a", "WU-a", "src/runtime");
			const second = planningEvent("TRACE-append-b", "WU-b", "src/work-state");
			const firstSeed = await seedTrace(root, first);
			const secondSeed = await seedTrace(root, second);
			const plan = selectProjectServerWorkUnitClaims(
				buildWorkQueueView({ records: [first, second] }),
				{ maxWorkers: 2 },
			);
			const batch = createProjectServerWorkUnitClaimEvents(plan, {
				createdAt: "2026-06-11T00:00:02.000Z",
				nextSequenceByTrace: {
					"TRACE-append-a": 2,
					"TRACE-append-b": 2,
				},
			});
			const append = await appendProjectServerWorkUnitClaims(batch, {
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
			assert.equal(
				firstRead.records.at(-1)?.event,
				"runtime.work_unit.claimed",
			);
			assert.equal(
				secondRead.records.at(-1)?.event,
				"runtime.work_unit.claimed",
			);
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

	it("preflights every trace before appending work-unit claims", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-claim-conflict-"));
		try {
			const first = planningEvent("TRACE-preflight-a", "WU-a", "src/runtime");
			const second = planningEvent("TRACE-preflight-b", "WU-b", "src/work-state");
			const firstSeed = await seedTrace(root, first);
			await seedTrace(root, second);
			const plan = selectProjectServerWorkUnitClaims(
				buildWorkQueueView({ records: [first, second] }),
				{ maxWorkers: 2 },
			);
			const batch = createProjectServerWorkUnitClaimEvents(plan, {
				createdAt: "2026-06-11T00:00:02.000Z",
				nextSequenceByTrace: {
					"TRACE-preflight-a": 2,
					"TRACE-preflight-b": 2,
				},
			});

			await assert.rejects(
				() =>
					appendProjectServerWorkUnitClaims(batch, {
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
		const plan = selectProjectServerWorkUnitClaims(queue, { maxWorkers: 1 });

		assert.throws(
			() =>
				createProjectServerWorkUnitClaimEvents(plan, {
					createdAt: "2026-06-11T00:00:02.000Z",
					nextSequenceByTrace: {},
				}),
			/Missing next trace sequence for TRACE-missing-seq\./,
		);
	});
});
