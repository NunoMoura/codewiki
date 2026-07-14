import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
	createDashboardChangeControl,
	parseDashboardChangeCommand,
} from "../../src/dashboard/change-control.ts";
import { startCodewikiDashboardServer } from "../../src/dashboard/server.ts";
import { changeContentDigest } from "../../src/changes/digest.ts";
import { acceptedChangeFixture } from "../helpers/accepted-change.mjs";

function fakeTraceHostControl() {
	return {
		status: async () => ({
			generatedAt: "2026-07-14T00:00:00.000Z",
			supervisorId: "dashboard:test",
			policy: { piHostEnabled: false, automation: "manual", agency: "assist" },
			traces: [],
		}),
		execute: async () => assert.fail("Trace Host command not expected"),
		heartbeat: async () => undefined,
		shutdown: async () => undefined,
	};
}

describe("dashboard Change control", () => {
	it("enforces CAS, idempotency, lifecycle scope, and bounded receipts", async () => {
		const root = await mkdtemp(
			join(tmpdir(), "codewiki-dashboard-change-control-"),
		);
		try {
			await mkdir(join(root, ".codewiki", "kb"), { recursive: true });
			execFileSync("git", ["init", "-q"], { cwd: root });
			const control = createDashboardChangeControl({
				repoRoot: root,
				actor: "dashboard:test",
				now: () => new Date("2026-07-14T09:30:00.000Z"),
			});
			const initial = await control.status();
			const draft = {
				action: "draft",
				commandId: "change-command-001",
				expectedStateDigest: initial.stateDigest,
				expectedHead: null,
				change: acceptedChangeFixture({ id: "CHG-dashboard-command" }),
			};
			const created = await control.execute(draft);
			assert.equal(created.receipt.action, "draft");
			assert.equal(created.receipt.changeId, "CHG-dashboard-command");
			assert.equal(created.state.records.length, 1);
			assert.equal(created.replayed, false);
			assert.equal(JSON.stringify(created.receipt).length < 2_000, true);

			const replayed = await control.execute(draft);
			assert.equal(replayed.replayed, true);
			assert.equal(replayed.receipt.receiptId, created.receipt.receiptId);
			await assert.rejects(
				control.execute({
					...draft,
					change: {
						...draft.change,
						intent: { ...draft.change.intent, question: "Different payload?" },
					},
				}),
				/Command id was already used for different input/,
			);
			await assert.rejects(
				control.execute({ ...draft, commandId: "change-command-stale" }),
				/Changes Backlog state changed/,
			);

			let current = await control.status();
			let card = current.records[0];
			const revisedChange = structuredClone(draft.change);
			revisedChange.revision = 2;
			revisedChange.intent.desiredState = "Dashboard command revision is persisted.";
			revisedChange.provenance.updatedAt = "2026-07-14T09:30:00.000Z";
			revisedChange.validation = {
				...revisedChange.validation,
				state: "valid",
				validatedRevision: 2,
				validatedDigest: changeContentDigest(revisedChange),
			};
			const revised = await control.execute({
				action: "revise",
				commandId: "change-command-002",
				expectedStateDigest: current.stateDigest,
				expectedHead: current.head,
				changeId: card.identity.changeId,
				expectedRecordRevision: card.identity.recordRevision,
				change: revisedChange,
			});
			assert.equal(revised.state.records[0].identity.revision, 2);
			assert.equal(revised.state.records[0].identity.recordRevision, 2);
			current = revised.state;
			card = current.records[0];
			const validated = await control.execute({
				action: "validate",
				commandId: "change-command-003",
				expectedStateDigest: current.stateDigest,
				expectedHead: current.head,
				changeId: card.identity.changeId,
				expectedRecordRevision: card.identity.recordRevision,
			});
			assert.equal(validated.receipt.validationReady, true);
			assert.equal(validated.state.head, current.head);

			const withdrawn = await control.execute({
				action: "withdraw",
				commandId: "change-command-004",
				expectedStateDigest: validated.state.stateDigest,
				expectedHead: validated.state.head,
				changeId: card.identity.changeId,
				expectedRecordRevision: card.identity.recordRevision,
				reason: "Superseded during review.",
			});
			assert.equal(withdrawn.state.records[0].identity.status, "withdrawn");
			assert.equal(withdrawn.receipt.headAfter, withdrawn.state.head);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects unsupported authority and protects HTTP commands", async () => {
		assert.throws(
			() => parseDashboardChangeCommand({ action: "accept" }),
			/Dashboard Change action must be draft, revise, validate, or withdraw/,
		);
		const root = await mkdtemp(
			join(tmpdir(), "codewiki-dashboard-change-http-"),
		);
		let handle;
		try {
			await mkdir(join(root, ".codewiki", "kb"), { recursive: true });
			execFileSync("git", ["init", "-q"], { cwd: root });
			handle = await startCodewikiDashboardServer({
				repoRoot: root,
				open: false,
				keepAlive: false,
				inProcess: true,
				persistent: false,
				traceHostControl: fakeTraceHostControl(),
			});
			const changesUrl = `${handle.origin}/api/changes?token=${encodeURIComponent(handle.token)}`;
			assert.equal((await fetch(changesUrl)).status, 200);
			assert.equal((await fetch(`${handle.origin}/api/changes`)).status, 403);
			const dashboardState = await (
				await fetch(`${handle.origin}/api/state?token=${encodeURIComponent(handle.token)}`)
			).json();
			assert.equal(dashboardState.changes.available, true);
			const state = await (await fetch(changesUrl)).json();
			const commandUrl = `${handle.origin}/api/changes/commands?token=${encodeURIComponent(handle.token)}`;
			const command = {
				action: "draft",
				commandId: "change-http-001",
				expectedStateDigest: state.stateDigest,
				expectedHead: null,
				change: acceptedChangeFixture({ id: "CHG-http-draft" }),
			};
			assert.equal(
				(
					await fetch(commandUrl, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(command),
					})
				).status,
				403,
			);
			const accepted = await fetch(commandUrl, {
				method: "POST",
				headers: {
					Origin: handle.origin,
					"Sec-Fetch-Site": "same-origin",
					"Content-Type": "application/json",
				},
				body: JSON.stringify(command),
			});
			assert.equal(accepted.status, 200);
			const result = await accepted.json();
			assert.equal(result.receipt.changeId, "CHG-http-draft");
			assert.equal(
				(
					await fetch(commandUrl, {
						method: "POST",
						headers: {
							Origin: handle.origin,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ payload: "x".repeat(17_000) }),
					})
				).status,
				400,
			);
		} finally {
			if (handle) await handle.close();
			await rm(root, { recursive: true, force: true });
		}
	});
});
