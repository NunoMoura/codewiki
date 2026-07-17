import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
	createDashboardSessionActionControl,
	parseDashboardSessionActionCommand,
} from "../../src/dashboard/session-actions.ts";
import { startCodewikiDashboardServer } from "../../src/dashboard/server.ts";
import { createPiDashboardSessionActionControl } from "../../src/pi/dashboard-session-actions.ts";

function command(state, overrides = {}) {
	return {
		commandId: "session-action-001",
		traceId: "TRACE-session-actions",
		action: "resume",
		expectedStateDigest: state.stateDigest,
		...overrides,
	};
}

function fakeTraceHostControl() {
	return {
		status: async () => ({
			generatedAt: "2026-07-16T00:00:00.000Z",
			supervisorId: "dashboard:test",
			policy: { piHostEnabled: false, automation: "manual", agency: "assist" },
			traces: [],
		}),
		execute: async () => assert.fail("Trace Host command not expected"),
		heartbeat: async () => undefined,
		shutdown: async () => undefined,
	};
}

describe("dashboard same-session Sprint actions", () => {
	it("delivers only fixed trace-scoped messages with idle and steering semantics", async () => {
		const deliveries = [];
		let idle = true;
		const control = createDashboardSessionActionControl({
			bridge: {
				isAvailable: () => true,
				isIdle: () => idle,
				sendUserMessage: (message, options) =>
					deliveries.push({ message, options }),
			},
			now: () => new Date("2026-07-16T10:00:00.000Z"),
		});
		const initial = control.status();
		assert.deepEqual(initial.actions, ["resume", "change", "resolve_blocker"]);
		const resume = await control.execute(command(initial));
		assert.equal(resume.receipt.deliveredAs, "immediate");
		assert.match(
			deliveries[0].message,
			/Resume CodeWiki Sprint TRACE-session-actions/,
		);
		assert.equal(deliveries[0].options, undefined);
		assert.equal((await control.execute(command(initial))).replayed, true);

		idle = false;
		const busy = control.status();
		const changed = await control.execute(
			command(busy, {
				commandId: "session-action-002",
				action: "change",
			}),
		);
		assert.equal(changed.receipt.deliveredAs, "steer");
		assert.deepEqual(deliveries[1].options, { deliverAs: "steer" });
		assert.match(deliveries[1].message, /linked mutable Change/);
		assert.match(deliveries[1].message, /explicit Decision approval/);
	});

	it("fails closed for unavailable, stale, malformed, or broadened commands", async () => {
		const control = createDashboardSessionActionControl({});
		const state = control.status();
		await assert.rejects(
			control.execute(command(state)),
			/active Pi(?: TUI)? session/i,
		);
		assert.throws(
			() =>
				parseDashboardSessionActionCommand({
					...command(state),
					prompt: "run shell",
				}),
			/Unsupported session action field prompt/,
		);
		assert.throws(
			() =>
				parseDashboardSessionActionCommand(
					command(state, { traceId: "../bad" }),
				),
			/canonical TRACE/,
		);
		await assert.rejects(
			control.execute(
				command(state, { expectedStateDigest: "sha256:" + "0".repeat(64) }),
			),
			/state changed/i,
		);
	});

	it("adapts Pi sendUserMessage without creating another session", async () => {
		const deliveries = [];
		let current = true;
		const control = createPiDashboardSessionActionControl(
			{
				registerTool() {},
				registerCommand() {},
				sendUserMessage: (message, options) =>
					deliveries.push({ message, options }),
			},
			{ cwd: "/tmp/project", isIdle: () => false },
			() => current,
		);
		const state = control.status();
		await control.execute(
			command(state, {
				commandId: "session-action-pi",
				action: "resolve_blocker",
			}),
		);
		assert.equal(deliveries.length, 1);
		assert.deepEqual(deliveries[0].options, { deliverAs: "steer" });
		current = false;
		assert.equal(control.status().available, false);
	});

	it("protects the HTTP action bridge with token, same-origin, and state guards", async () => {
		const root = await mkdtemp(
			join(tmpdir(), "codewiki-session-actions-http-"),
		);
		const deliveries = [];
		const control = createDashboardSessionActionControl({
			bridge: {
				isAvailable: () => true,
				isIdle: () => true,
				sendUserMessage: (message, options) =>
					deliveries.push({ message, options }),
			},
		});
		let handle;
		try {
			await mkdir(join(root, ".codewiki", "traces"), { recursive: true });
			handle = await startCodewikiDashboardServer({
				repoRoot: root,
				open: false,
				keepAlive: false,
				inProcess: true,
				persistent: false,
				traceHostControl: fakeTraceHostControl(),
				sessionActionControl: control,
			});
			const state = control.status();
			const url = `${handle.origin}/api/session-actions/commands?token=${encodeURIComponent(handle.token)}`;
			assert.equal(
				(
					await fetch(url, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(command(state)),
					})
				).status,
				403,
			);
			const response = await fetch(url, {
				method: "POST",
				headers: { Origin: handle.origin, "Content-Type": "application/json" },
				body: JSON.stringify(command(state)),
			});
			assert.equal(response.status, 200);
			assert.equal((await response.json()).receipt.action, "resume");
			assert.equal(deliveries.length, 1);
		} finally {
			if (handle) await handle.close();
			await rm(root, { recursive: true, force: true });
		}
	});
});
