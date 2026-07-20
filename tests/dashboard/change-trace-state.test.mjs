import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { buildWikiState } from "../../src/api/state.ts";
import {
	acceptChangeRecord,
	createChangeRecord,
} from "../../src/changes/records.ts";
import { ChangeTraceStore } from "../../src/changes/trace-store.ts";
import { loadDashboardChangesState } from "../../src/dashboard/changes-state.ts";
import { buildCodewikiDashboardState } from "../../src/dashboard/state.ts";
import { readProjectTraceRecords } from "../../src/work-state/project.ts";
import { acceptedChangeFixture } from "../helpers/accepted-change.mjs";

const roots = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function project() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-change-dashboard-"));
	roots.push(root);
	return root;
}

async function dashboardState(root) {
	const records = await readProjectTraceRecords(root);
	return buildCodewikiDashboardState(
		buildWikiState({ records }),
		root,
		records,
		{
			changes: await loadDashboardChangesState(root),
		},
	);
}

describe("Change-rooted dashboard state", () => {
	it("projects one Pipeline Card for one Change Trace across approval", async () => {
		const root = await project();
		const store = new ChangeTraceStore({ repoRoot: root });
		const pending = createChangeRecord(
			acceptedChangeFixture({ id: "CHG-dashboard-journey" }),
		);
		const created = await store.write({
			expectedHead: null,
			records: [pending],
			message: "Persist Change",
			actor: "maintainer",
			createdAt: pending.change.provenance.createdAt,
		});

		const before = await dashboardState(root);
		assert.equal(before.summary.pipeline, 1);
		assert.equal(before.summary.backlog, 1);
		assert.equal(before.sprintsQueue.length, 1);
		assert.deepEqual(before.sprintsQueue[0].changeIds, [pending.change.id]);
		assert.deepEqual(before.sprintsQueue[0].sprintIds, []);
		assert.equal(before.sprintsQueue[0].stage, "decision");
		assert.equal(before.sprintsQueue[0].status, "needs_decision");
		assert.equal(before.sprintsQueue[0].blockerCount, 0);
		assert.equal(before.sprintsQueue[0].progress, 30);

		const approved = acceptChangeRecord(pending, {
			changedBy: "maintainer",
			changedAt: "2026-08-01T03:01:00.000Z",
			authority: "user",
			ref: "approval:CHG-dashboard-journey:1",
		});
		await store.write({
			expectedHead: created.head,
			records: [approved],
			message: "Approve exact Change",
			actor: "maintainer",
			createdAt: "2026-08-01T03:01:00.000Z",
		});

		const after = await dashboardState(root);
		assert.equal(after.summary.pipeline, 1);
		assert.equal(after.summary.backlog, 0);
		assert.equal(after.sprintsQueue.length, 1);
		assert.equal(after.sprintsQueue[0].stage, "planning");
		assert.equal(after.sprintsQueue[0].status, "needs_planning");
		assert.equal(after.sprintsQueue[0].progress, 40);
		assert.match(after.sprintsQueue[0].currentAction, /Planning horizon/);
	});
});
