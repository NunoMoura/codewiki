import assert from "node:assert/strict";
import test from "node:test";

import { ProjectCoordinatorEventJournal } from "../../src/runtime/project-coordinator-events.ts";

function event(state, observedAt, fields = {}) {
	return {
		generationId: "generation:events",
		state,
		observedAt,
		...fields,
	};
}

test("coordinator event journal replays ordered bounded events", async () => {
	const journal = new ProjectCoordinatorEventJournal("generation:events", 16);
	journal.append(event("client_connected", "2026-08-11T00:00:00.000Z", {
		clientId: "pi:one",
		clientKind: "pi",
	}));
	journal.append(event("execution_policy_changed", "2026-08-11T00:00:01.000Z"));
	const first = await journal.poll({ afterCursor: 0, maxEvents: 1 });
	assert.equal(first.schemaVersion, 1);
	assert.equal(first.generationId, "generation:events");
	assert.equal(first.latestCursor, 2);
	assert.equal(first.cursor, 1);
	assert.equal(first.resetRequired, false);
	assert.deepEqual(first.events.map((entry) => entry.cursor), [1]);
	const second = await journal.poll({ afterCursor: 1 });
	assert.deepEqual(second.events.map((entry) => entry.cursor), [2]);
	journal.close();
});

test("coordinator event journal wakes long polls and requires reset after overflow", async () => {
	const journal = new ProjectCoordinatorEventJournal("generation:events", 16);
	const pending = journal.poll({ afterCursor: 0, waitMs: 1_000 });
	setTimeout(() => {
		journal.append(event("job_completed", "2026-08-11T00:00:01.000Z", {
			idempotencyKey: "job:one",
			lane: "decision",
		}));
	}, 10);
	const delivered = await pending;
	assert.deepEqual(delivered.events.map((entry) => entry.state), ["job_completed"]);
	for (let index = 0; index < 20; index += 1) {
		journal.append(
			event("client_connected", `2026-08-11T00:00:${String(index + 2).padStart(2, "0")}.000Z`, {
				clientId: `test:${index}`,
				clientKind: "test",
			}),
		);
	}
	const stale = await journal.poll({ afterCursor: 1 });
	assert.equal(stale.resetRequired, true);
	assert.deepEqual(stale.events, []);
	journal.close();
});

test("coordinator event journal validates generation and poll bounds", async () => {
	const journal = new ProjectCoordinatorEventJournal("generation:events");
	assert.throws(
		() =>
			journal.append({
				generationId: "generation:other",
				state: "client_connected",
				observedAt: "2026-08-11T00:00:00.000Z",
			}),
		/generation does not match/,
	);
	await assert.rejects(
		journal.poll({ afterCursor: -1 }),
		/afterCursor must be an integer/,
	);
	journal.close();
});
