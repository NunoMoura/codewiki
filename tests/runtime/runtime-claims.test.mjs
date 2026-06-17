import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planningQualityStandards } from "../../src/planning/quality-standards.ts";
import {
	createRuntimeClaimEvent,
	createRuntimeClaimReleaseEvent,
} from "../../src/runtime/claims.ts";
import { assertValidTraceRecord } from "../../src/api/traces.ts";
import {
	createRuntimeFailedWorkerStartReleaseEvents,
	createRuntimeWorkerCompletionReleaseEvents,
} from "../../src/runtime/dispatcher.ts";
import { buildWorkQueueView } from "../../src/views/work-queue.ts";

function planningEvent() {
	return {
		type: "trace_event",
		id: "TRACE-runtime:planning:iteration:1",
		parentId: null,
		traceId: "TRACE-runtime",
		sequence: 1,
		loop: "planning",
		event: "planning.iteration",
		refs: [
			"trace:TRACE-runtime:decision:iteration:1#row:DTR-runtime",
			"src/runtime",
		],
		createdAt: "2026-06-11T00:00:01.000Z",
		data: {
			exit: { status: "exit", targetLoop: "implementation" },
			output: {
				qualityStandards: planningQualityStandards([]),
				workItems: [
					{
						id: "WU-runtime",
						title: "Schedule runtime work",
						decisionRefs: [
							"trace:TRACE-runtime:decision:iteration:1#row:DTR-runtime",
						],
						componentRefs: ["component.runtime"],
						pathScopes: ["src/runtime"],
						dependsOn: [],
					},
				],
			},
		},
	};
}

function planningWorkRef(event) {
	return `trace:${event.id}#work:WU-runtime`;
}

describe("runtime claim events", () => {
	it("creates canonical runtime claim trace events", () => {
		const planningRef = planningWorkRef(planningEvent());
		const claim = createRuntimeClaimEvent({
			traceId: "TRACE-runtime",
			id: "TRACE-runtime:runtime:claim:1",
			parentId: planningRef,
			sequence: 2,
			createdAt: "2026-06-11T00:00:02.000Z",
			workerId: "worker-1",
			workUnitId: "WU-runtime",
			planningRefs: [planningRef],
			pathScopes: ["src/runtime"],
			expiresAt: "2026-06-11T00:10:02.000Z",
		});

		assertValidTraceRecord(claim);
		assert.equal(claim.loop, "implementation");
		assert.equal(claim.event, "runtime.work.claimed");
		assert.deepEqual(claim.refs, [planningRef, "src/runtime"]);
		assert.equal(claim.refs.includes("worker-1"), false);
		assert.equal(claim.data?.workerId, "worker-1");
		assert.equal(claim.data?.expiresAt, "2026-06-11T00:10:02.000Z");
	});

	it("creates claim release events that clear queue claims", () => {
		const planning = planningEvent();
		const planningRef = planningWorkRef(planning);
		const claim = createRuntimeClaimEvent({
			traceId: "TRACE-runtime",
			id: "TRACE-runtime:runtime:claim:1",
			parentId: planningRef,
			sequence: 2,
			createdAt: "2026-06-11T00:00:02.000Z",
			workerId: "worker-1",
			workUnitId: "WU-runtime",
			planningRefs: [planningRef],
			pathScopes: ["src/runtime"],
		});
		const release = createRuntimeClaimReleaseEvent({
			traceId: "TRACE-runtime",
			id: "TRACE-runtime:runtime:release:1",
			parentId: claim.id,
			sequence: 3,
			createdAt: "2026-06-11T00:00:03.000Z",
			workerId: "worker-1",
			workUnitId: "WU-runtime",
			planningRefs: [planningRef],
			pathScopes: ["src/runtime"],
			reason: "worker finished or lease released",
		});

		assertValidTraceRecord(release);
		assert.equal(release.event, "runtime.claim.released");
		assert.equal(release.data?.reason, "worker finished or lease released");

		const queue = buildWorkQueueView({ records: [planning, claim, release] });
		assert.equal(queue.items[0].id, "WU-runtime");
		assert.equal(queue.items[0].status, "ready");
	});

	it("creates failed-start release events with worker provenance", () => {
		const planning = planningEvent();
		const planningRef = planningWorkRef(planning);
		const claim = createRuntimeClaimEvent({
			traceId: "TRACE-runtime",
			id: "TRACE-runtime:runtime:claim:1",
			parentId: planningRef,
			sequence: 2,
			createdAt: "2026-06-11T00:00:02.000Z",
			claimId: "claim-WU-runtime",
			workerId: "worker-1",
			workUnitId: "WU-runtime",
			planningRefs: [planningRef],
			pathScopes: ["src/runtime"],
		});
		const batch = createRuntimeFailedWorkerStartReleaseEvents(
			[
				{
					traceId: "TRACE-runtime",
					workerId: "worker-1",
					workUnitId: "WU-runtime",
					planningRefs: [planningRef],
					error: "spawn failed",
					sessionId: "session-1",
					sessionFile: "/tmp/session-1.jsonl",
				},
			],
			[claim],
			{
				createdAt: "2026-06-11T00:00:03.000Z",
				nextSequenceByTrace: { "TRACE-runtime": 3 },
			},
		);
		const release = batch.events[0];

		assertValidTraceRecord(release);
		assert.equal(release.event, "runtime.claim.released");
		assert.equal(release.parentId, claim.id);
		assert.equal(release.sequence, 3);
		assert.equal(batch.nextSequenceByTrace["TRACE-runtime"], 4);
		assert.equal(release.data?.claimId, "claim-WU-runtime");
		assert.equal(release.data?.reason, "worker_start_failed");
		assert.equal(release.data?.failurePhase, "worker_start");
		assert.equal(release.data?.error, "spawn failed");
		assert.equal(release.data?.sessionId, "session-1");
		assert.equal(release.data?.sessionFile, "/tmp/session-1.jsonl");
		assert.equal(release.refs.includes("/tmp/session-1.jsonl"), false);
		const queue = buildWorkQueueView({ records: [planning, claim, release] });
		assert.equal(queue.items[0].status, "ready");
	});

	it("creates worker completion release events with session provenance", () => {
		const planning = planningEvent();
		const planningRef = planningWorkRef(planning);
		const claim = createRuntimeClaimEvent({
			traceId: "TRACE-runtime",
			id: "TRACE-runtime:runtime:claim:1",
			parentId: planningRef,
			sequence: 2,
			createdAt: "2026-06-11T00:00:02.000Z",
			claimId: "claim-WU-runtime",
			workerId: "worker-1",
			workUnitId: "WU-runtime",
			planningRefs: [planningRef],
			pathScopes: ["src/runtime"],
		});
		const batch = createRuntimeWorkerCompletionReleaseEvents(
			[
				{
					workerId: "worker-1",
					workUnitId: "WU-runtime",
					claimId: "claim-WU-runtime",
					status: "completed",
					message: "Worker evidence consumed by implementation.",
					sessionId: "session-1",
					sessionFile: "/tmp/session-1.jsonl",
					refs: ["tests/runtime/runtime-claims.test.mjs"],
				},
			],
			[claim],
			{
				createdAt: "2026-06-11T00:00:04.000Z",
				nextSequenceByTrace: { "TRACE-runtime": 3 },
			},
		);
		const release = batch.events[0];

		assertValidTraceRecord(release);
		assert.equal(release.event, "runtime.claim.released");
		assert.equal(release.parentId, claim.id);
		assert.equal(release.sequence, 3);
		assert.equal(batch.nextSequenceByTrace["TRACE-runtime"], 4);
		assert.equal(release.data?.claimId, "claim-WU-runtime");
		assert.equal(release.data?.reason, "worker_completed");
		assert.equal(release.data?.completionStatus, "completed");
		assert.equal(
			release.data?.message,
			"Worker evidence consumed by implementation.",
		);
		assert.equal(release.data?.sessionId, "session-1");
		assert.equal(release.data?.sessionFile, "/tmp/session-1.jsonl");
		assert.equal(
			release.refs.includes("tests/runtime/runtime-claims.test.mjs"),
			true,
		);
		assert.equal(release.refs.includes("/tmp/session-1.jsonl"), false);
		const queue = buildWorkQueueView({ records: [planning, claim, release] });
		assert.equal(queue.items[0].status, "ready");

		const statusBatch = createRuntimeWorkerCompletionReleaseEvents(
			[
				{
					traceId: "TRACE-runtime",
					workerId: "worker-2",
					workUnitId: "WU-blocked",
					planningRefs: [planningRef],
					status: "blocked",
				},
				{
					traceId: "TRACE-runtime",
					workerId: "worker-3",
					workUnitId: "WU-failed",
					planningRefs: [planningRef],
					status: "failed",
				},
			],
			[],
			{
				createdAt: "2026-06-11T00:00:05.000Z",
				nextSequenceByTrace: { "TRACE-runtime": 4 },
			},
		);
		assert.deepEqual(
			statusBatch.events.map((event) => event.data?.reason),
			["worker_blocked", "worker_failed"],
		);
	});

	it("marks work claimed from generated claim events", () => {
		const planning = planningEvent();
		const planningRef = planningWorkRef(planning);
		const claim = createRuntimeClaimEvent({
			traceId: "TRACE-runtime",
			id: "TRACE-runtime:runtime:claim:1",
			parentId: planningRef,
			sequence: 2,
			createdAt: "2026-06-11T00:00:02.000Z",
			workerId: "worker-1",
			workUnitId: "WU-runtime",
			planningRefs: [planningRef],
			pathScopes: ["src/runtime"],
			expiresAt: "2026-06-11T00:10:02.000Z",
		});
		const queue = buildWorkQueueView({
			records: [planning, claim],
			generatedAt: "2026-06-11T00:00:03.000Z",
		});

		assert.equal(queue.items[0].status, "claimed");
		assert.equal(queue.items[0].claimedBy, "worker-1");
		assert.equal(queue.items[0].claimExpiresAt, "2026-06-11T00:10:02.000Z");
	});
});
