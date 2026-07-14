import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
	filterDashboardChanges,
	loadDashboardChangesState,
} from "../../src/dashboard/changes-state.ts";
import { createChangeRecord } from "../../src/changes/records.ts";
import {
	acceptedChangeFixture,
	seedChangeAcceptance,
} from "../helpers/accepted-change.mjs";

describe("dashboard Changes Backlog state", () => {
	it("projects deterministic bounded cards and independent filters", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-dashboard-changes-"));
		try {
			const seeded = await seedChangeAcceptance(root, {
				id: "CHG-dashboard-alpha",
				question: "Should alpha become visible?",
			});
			const beta = createChangeRecord(
				acceptedChangeFixture({
					id: "CHG-dashboard-beta",
					question: "Should beta remain separately filterable?",
				}),
			);
			await seeded.store.write({
				expectedHead: seeded.changeAcceptance.expectedHead,
				records: [beta],
				message: "Seed beta",
				actor: "test",
				createdAt: "2026-06-25T00:00:03.000Z",
			});

			const state = await loadDashboardChangesState(root);
			assert.equal(state.records.length, 2);
			assert.deepEqual(
				state.records.map((record) => record.identity.changeId),
				["CHG-dashboard-alpha", "CHG-dashboard-beta"],
			);
			assert.equal(state.summary.pending, 2);
			assert.equal(state.summary.valid, 2);
			assert.match(state.stateDigest, /^sha256:[a-f0-9]{64}$/);
			assert.deepEqual(
				filterDashboardChanges(state, {
					validationState: "valid",
					text: "beta",
				}).map((record) => record.identity.changeId),
				["CHG-dashboard-beta"],
			);
			assert.deepEqual(
				filterDashboardChanges(state, { status: "accepted" }),
				[],
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
