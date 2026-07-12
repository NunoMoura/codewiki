import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildCodewikiImplementationReview,
	buildCodewikiWorkerAttempts,
} from "../../src/dashboard/state.ts";
import { createWorkerObservation } from "../../src/runtime/worker-observation.ts";

function claim(sequence = 1) {
	return {
		type: "trace_event",
		id: "claim-001",
		parentId: null,
		traceId: "TRACE-workers",
		sequence,
		event: "runtime.work_unit.claimed",
		refs: ["trace:TRACE-workers:planning:iteration:1#work:WU-workers"],
		createdAt: "2026-07-12T12:00:00.000Z",
		data: {
			claimId: "claim-001",
			workerId: "worker-001",
			workUnitId: "WU-workers",
			planningRefs: ["trace:TRACE-workers:planning:iteration:1#work:WU-workers"],
			pathScopes: ["src/dashboard/state.ts"],
		},
	};
}

const item = {
	id: "WU-workers",
	title: "Project worker attempts",
	status: "claimed",
};

describe("dashboard worker projection", () => {
	it("combines durable claims with latest live observation", () => {
		const observedAt = new Date();
		const observation = createWorkerObservation({
			traceId: "TRACE-workers",
			workUnitId: "WU-workers",
			workerId: "worker-001",
			attemptId: "claim-001",
			phase: "running_checks",
			observedAt: observedAt.toISOString(),
			leaseExpiresAt: new Date(observedAt.getTime() + 60_000).toISOString(),
			progress: { current: 2, total: 3 },
		});
		const attempts = buildCodewikiWorkerAttempts([claim()], [item], [observation]);
		assert.equal(attempts.length, 1);
		assert.equal(attempts[0].title, "Project worker attempts");
		assert.equal(attempts[0].status, "running");
		assert.equal(attempts[0].phase, "running_checks");
		assert.equal(attempts[0].freshness, "live");
		assert.deepEqual(attempts[0].progress, { current: 2, total: 3 });
	});

	it("keeps aggregate review separate from worker attempts", () => {
		const release = {
			...claim(2),
			id: "release-001",
			event: "runtime.work_unit.claim.released",
			data: { ...claim().data, status: "completed" },
		};
		const attempts = buildCodewikiWorkerAttempts([claim(), release], [item], []);
		assert.equal(attempts[0].status, "completed");
		assert.deepEqual(
			buildCodewikiImplementationReview(attempts, [item], [], false),
			{
				status: "validating",
				resultsCollected: 1,
				totalTasks: 1,
				conflictCount: 0,
				acceptanceStatus: "ready",
			},
		);
		assert.equal(
			buildCodewikiImplementationReview(attempts, [item], ["Path conflict"], false).status,
			"blocked",
		);
	});
});
