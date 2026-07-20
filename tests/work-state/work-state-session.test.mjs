import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { changeTraceId } from "../../src/changes/change-trace.ts";
import {
	addChangeEvidence,
	createChangeRecord,
} from "../../src/changes/records.ts";
import { ChangeTraceStore } from "../../src/changes/trace-store.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { WorkStateSession } from "../../src/work-state/session.ts";
import { acceptedChangeFixture } from "../helpers/accepted-change.mjs";

const roots = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function project() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-work-state-session-"));
	roots.push(root);
	return root;
}

describe("WorkState session", () => {
	it("loads once, tails appended JSONL, and removes deleted traces", async () => {
		const root = await project();
		const store = new ChangeTraceStore({ repoRoot: root });
		const initial = createChangeRecord(
			acceptedChangeFixture({ id: "CHG-session-cache" }),
		);
		const created = await store.write({
			expectedHead: null,
			records: [initial],
			message: "Persist Change",
			actor: "maintainer",
			createdAt: "2026-08-03T00:00:00.000Z",
		});
		const session = new WorkStateSession(root);

		const loaded = await session.refresh("2026-08-03T00:00:01.000Z");
		assert.deepEqual(loaded.loadedTraceIds, [changeTraceId(initial.change.id)]);
		assert.deepEqual(loaded.tailedTraceIds, []);
		assert.equal(loaded.workState.changes[0].record.recordRevision, 1);

		const reused = await session.refresh("2026-08-03T00:00:02.000Z");
		assert.deepEqual(reused.reusedTraceIds, [changeTraceId(initial.change.id)]);
		assert.deepEqual(reused.loadedTraceIds, []);

		const revised = addChangeEvidence(initial, {
			sourceRefs: ["kb:system/components/runtime.md"],
			proofRefs: ["proof:incremental-jsonl-✓"],
			updatedBy: "maintainer",
			updatedAt: "2026-08-03T00:00:03.000Z",
		});
		await store.write({
			expectedHead: created.head,
			records: [revised],
			message: "Append evidence",
			actor: "maintainer",
			createdAt: "2026-08-03T00:00:03.000Z",
		});

		const tailed = await session.refresh("2026-08-03T00:00:04.000Z");
		assert.deepEqual(tailed.tailedTraceIds, [changeTraceId(initial.change.id)]);
		assert.deepEqual(tailed.loadedTraceIds, []);
		assert.equal(tailed.workState.changes[0].record.recordRevision, 2);
		assert.equal(
			tailed.workState.changes[0].record.change.evidence.proofRefs.includes(
				"proof:incremental-jsonl-✓",
			),
			true,
		);

		await rm(join(root, traceFilePath(changeTraceId(initial.change.id))));
		const removed = await session.refresh("2026-08-03T00:00:05.000Z");
		assert.deepEqual(removed.removedTraceIds, [
			changeTraceId(initial.change.id),
		]);
		assert.deepEqual(removed.workState.changes, []);
	});
});
