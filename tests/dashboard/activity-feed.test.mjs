import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildActivityFeed } from "../../src/dashboard/activity-feed.ts";

function event(id, eventName, data = {}, sequence = 1) {
	return {
		type: "trace_event",
		id,
		parentId: null,
		traceId: "TRACE-feed",
		sequence,
		event: eventName,
		refs: [`trace:${id}`],
		createdAt: `2026-07-12T12:00:0${sequence}.000Z`,
		data,
	};
}

describe("Activity Feed narration", () => {
	it("explains worker execution, impact, and next action with friendly Work Item titles", () => {
		const feed = buildActivityFeed(
			[
				event("claim-1", "runtime.work_unit.claimed", {
					claimId: "claim-1",
					workerId: "worker-001",
					workUnitId: "WU-feed",
				}),
				event(
					"release-1",
					"runtime.work_unit.claim.released",
					{
						claimId: "claim-1",
						workerId: "worker-001",
						workUnitId: "WU-feed",
						status: "completed",
					},
					2,
				),
			],
			new Map([["WU-feed", "Build human Activity Feed"]]),
		);
		assert.equal(feed[0].headline, "Build human Activity Feed completed");
		assert.match(feed[0].impact, /aggregate Implementation review/);
		assert.match(feed[0].nextAction, /integration checks/);
		assert.equal(feed[0].source, "durable");
		assert.equal(feed[1].headline, "Build human Activity Feed started");
	});

	it("coalesces repeated semantic updates and omits unknown raw events", () => {
		const feed = buildActivityFeed([
			event("decision-1", "changes_approved", {
				output: { approvedChanges: [{ id: "A" }] },
			}),
			event(
				"decision-2",
				"changes_approved",
				{ output: { approvedChanges: [{ id: "B" }] } },
				2,
			),
			event("raw-3", "internal.unrecognized", { raw: "dry payload" }, 3),
		]);
		assert.equal(feed.length, 1);
		assert.equal(feed[0].id, "decision-2");
		assert.doesNotMatch(feed[0].detail, /internal\.unrecognized|dry payload/);
	});
});
