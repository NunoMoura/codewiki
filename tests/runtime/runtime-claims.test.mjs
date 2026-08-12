import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { planningQualityStandards } from "../helpers/canonical-loop-events.mjs";
import {
	createRuntimeClaimEvent,
	createRuntimeClaimReleaseEvent,
} from "../../src/runtime/claims/events.ts";
import {
	appendTraceRecords,
	assertValidTraceRecord,
	createTraceHead,
	readTrace,
	traceFilePath,
} from "../../src/api/traces.ts";
import { createRuntimeWorkerCompletionReleaseEvents } from "../../src/runtime/claims/work-unit-events.ts";
import {
	appendRuntimeLeaseExpirations,
	planRuntimeLeaseExpirations,
} from "../../src/runtime/claims/leases.ts";
import { buildWorkQueueView } from "../../src/views/work-queue.ts";

function planningEvent() {
	return {
		type: "trace_event",
		id: "TRACE-runtime:planning:iteration:1",
		parentId: null,
		traceId: "TRACE-runtime",
		sequence: 1,
		loop: "planning",
		event: "work_units_created",
		refs: [
			"trace:TRACE-runtime:decision:iteration:1#change:CHG-runtime",
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
						changeRefs: [
							"trace:TRACE-runtime:decision:iteration:1#change:CHG-runtime",
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
		assert.equal(claim.loop, undefined);
		assert.equal(claim.event, "runtime.work_unit.claimed");
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
		assert.equal(release.event, "runtime.work_unit.claim.released");
		assert.equal(release.data?.reason, "worker finished or lease released");

		const queue = buildWorkQueueView({ records: [planning, claim, release] });
		assert.equal(queue.items[0].id, "WU-runtime");
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
		assert.equal(release.event, "runtime.work_unit.claim.released");
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

	it("does not release a newer claim with the same work unit", () => {
		const planning = planningEvent();
		const planningRef = planningWorkRef(planning);
		const oldClaim = createRuntimeClaimEvent({
			traceId: "TRACE-runtime",
			id: "TRACE-runtime:runtime:claim:old",
			parentId: planningRef,
			sequence: 2,
			createdAt: "2026-06-11T00:00:02.000Z",
			claimId: "claim-old",
			workerId: "worker-old",
			workUnitId: "WU-runtime",
			planningRefs: [planningRef],
			pathScopes: ["src/runtime"],
		});
		const newClaim = createRuntimeClaimEvent({
			traceId: "TRACE-runtime",
			id: "TRACE-runtime:runtime:claim:new",
			parentId: planningRef,
			sequence: 3,
			createdAt: "2026-06-11T00:00:04.000Z",
			claimId: "claim-new",
			workerId: "worker-new",
			workUnitId: "WU-runtime",
			planningRefs: [planningRef],
			pathScopes: ["src/runtime"],
		});
		const release = createRuntimeClaimReleaseEvent({
			traceId: "TRACE-runtime",
			id: "TRACE-runtime:runtime:release:old",
			parentId: oldClaim.id,
			sequence: 4,
			createdAt: "2026-06-11T00:00:04.000Z",
			claimId: "claim-old",
			workerId: "worker-old",
			workUnitId: "WU-runtime",
			planningRefs: [planningRef],
			pathScopes: ["src/runtime"],
			reason: "lease_expired",
		});
		const queue = buildWorkQueueView({
			records: [planning, oldClaim, newClaim, release],
			generatedAt: "2026-06-11T00:00:04.000Z",
		});

		assert.equal(queue.items[0].status, "claimed");
		assert.equal(queue.items[0].claimedBy, "worker-new");
	});

	it("plans expired lease releases without noisy heartbeat events", () => {
		const planning = planningEvent();
		const planningRef = planningWorkRef(planning);
		const expired = createRuntimeClaimEvent({
			traceId: "TRACE-runtime",
			id: "TRACE-runtime:runtime:claim:expired",
			parentId: planningRef,
			sequence: 2,
			createdAt: "2026-06-11T00:00:02.000Z",
			claimId: "claim-expired",
			workerId: "worker-expired",
			workUnitId: "WU-runtime",
			planningRefs: [planningRef],
			pathScopes: ["src/runtime"],
			expiresAt: "2026-06-11T00:00:04.000Z",
		});
		const active = createRuntimeClaimEvent({
			traceId: "TRACE-runtime",
			id: "TRACE-runtime:runtime:claim:active",
			parentId: planningRef,
			sequence: 3,
			createdAt: "2026-06-11T00:00:03.000Z",
			claimId: "claim-active",
			workerId: "worker-active",
			workUnitId: "WU-runtime-active",
			planningRefs: [planningRef],
			pathScopes: ["src/runtime"],
			expiresAt: "2026-06-11T00:00:10.000Z",
		});
		const alreadyReleased = createRuntimeClaimEvent({
			traceId: "TRACE-runtime",
			id: "TRACE-runtime:runtime:claim:released",
			parentId: planningRef,
			sequence: 4,
			createdAt: "2026-06-11T00:00:04.000Z",
			claimId: "claim-released",
			workerId: "worker-released",
			workUnitId: "WU-runtime-released",
			planningRefs: [planningRef],
			pathScopes: ["src/runtime"],
			expiresAt: "2026-06-11T00:00:04.000Z",
		});
		const release = createRuntimeClaimReleaseEvent({
			traceId: "TRACE-runtime",
			id: "TRACE-runtime:runtime:release:released",
			parentId: alreadyReleased.id,
			sequence: 5,
			createdAt: "2026-06-11T00:00:05.000Z",
			claimId: "claim-released",
			workerId: "worker-released",
			workUnitId: "WU-runtime-released",
			planningRefs: [planningRef],
			pathScopes: ["src/runtime"],
			reason: "worker_completed",
		});
		const batch = planRuntimeLeaseExpirations(
			[planning, expired, active, alreadyReleased, release],
			{
				generatedAt: "2026-06-11T00:00:05.000Z",
				nextSequenceByTrace: { "TRACE-runtime": 6 },
			},
		);

		assert.equal(batch.events.length, 1);
		assert.equal(batch.events[0].event, "runtime.work_unit.claim.expired");
		assert.equal(batch.events[0].parentId, expired.id);
		assert.equal(batch.events[0].data?.claimId, "claim-expired");
		assert.equal(batch.events[0].data?.reason, "lease_expired");
		assert.equal(batch.events[0].data?.expiresAt, "2026-06-11T00:00:04.000Z");
		assert.deepEqual(batch.nextSequenceByTrace, { "TRACE-runtime": 7 });
	});

	it("appends expired lease releases with trace byte preflight", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-lease-expiry-"));
		try {
			const planning = planningEvent();
			const planningRef = planningWorkRef(planning);
			const claim = createRuntimeClaimEvent({
				traceId: "TRACE-runtime",
				id: "TRACE-runtime:runtime:claim:expired",
				parentId: planningRef,
				sequence: 2,
				createdAt: "2026-06-11T00:00:02.000Z",
				claimId: "claim-expired",
				workerId: "worker-expired",
				workUnitId: "WU-runtime",
				planningRefs: [planningRef],
				pathScopes: ["src/runtime"],
				expiresAt: "2026-06-11T00:00:04.000Z",
			});
			const head = createTraceHead({
				traceId: "TRACE-runtime",
				title: "Runtime lease expiry",
				createdAt: "2026-06-11T00:00:00.000Z",
			});
			const seed = await appendTraceRecords(root, [head, planning, claim], 0);
			const batch = planRuntimeLeaseExpirations([head, planning, claim], {
				generatedAt: "2026-06-11T00:00:05.000Z",
				nextSequenceByTrace: { "TRACE-runtime": 3 },
			});
			const append = await appendRuntimeLeaseExpirations(batch, {
				repoRoot: root,
				expectedBytesByTrace: { "TRACE-runtime": seed.nextBytes },
			});
			const readBack = await readTrace(
				join(root, traceFilePath("TRACE-runtime")),
			);
			const queue = buildWorkQueueView({
				records: readBack.records,
				generatedAt: "2026-06-11T00:00:05.000Z",
			});

			assert.equal(append.events.length, 1);
			assert.equal(
				readBack.records.at(-1).event,
				"runtime.work_unit.claim.expired",
			);
			assert.equal(queue.items[0].status, "ready");
			await assert.rejects(
				() =>
					appendRuntimeLeaseExpirations(batch, {
						repoRoot: root,
						expectedBytesByTrace: { "TRACE-runtime": seed.nextBytes },
					}),
				/append conflict/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
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
