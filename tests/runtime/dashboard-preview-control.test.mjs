import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { startCodewikiDashboardServer } from "../../src/dashboard/server.ts";
import { parseDashboardPreviewCommand } from "../../src/preview/dashboard-control.ts";

const digest = `sha256:${"a".repeat(64)}`;

function fakePreviewControl() {
	const commands = [];
	const statuses = [
		{
			profileId: "web",
			profileDigest: digest,
			traceIds: ["TRACE-preview"],
			state: "ready",
			url: "http://127.0.0.1:4173",
			readyUrl: "http://127.0.0.1:4173/ready",
			managed: true,
			browser: "none",
			logs: [],
		},
	];
	return {
		commands,
		async status() {
			return statuses;
		},
		async execute(command) {
			commands.push(command);
			return statuses;
		},
	};
}

describe("dashboard preview control", () => {
	it("parses only bounded preview operations", () => {
		assert.deepEqual(
			parseDashboardPreviewCommand({
				action: "restart",
				profileId: "web",
				expectedProfileDigest: digest,
			}),
			{ action: "restart", profileId: "web", expectedProfileDigest: digest },
		);
		assert.deepEqual(
			parseDashboardPreviewCommand({
				action: "capture",
				profileId: "web",
				traceId: "TRACE-preview",
				expectedProfileDigest: digest,
			}),
			{
				action: "capture",
				profileId: "web",
				traceId: "TRACE-preview",
				expectedProfileDigest: digest,
			},
		);
		assert.throws(
			() => parseDashboardPreviewCommand({ action: "shell", profileId: "web" }),
			/start, open, capture, restart, or stop/,
		);
		assert.throws(
			() =>
				parseDashboardPreviewCommand({ action: "stop", profileId: "../web" }),
			/safe identifier/,
		);
		assert.throws(
			() =>
				parseDashboardPreviewCommand({
					action: "capture",
					profileId: "web",
				}),
			/traceId/,
		);
		assert.throws(
			() =>
				parseDashboardPreviewCommand({
					action: "stop",
					profileId: "web",
					command: "rm",
				}),
			/not supported/,
		);
	});

	it("projects preview state and accepts guarded same-origin commands", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-dashboard-preview-"));
		const previewControl = fakePreviewControl();
		let dashboard;
		try {
			await mkdir(join(root, ".codewiki", "traces"), { recursive: true });
			dashboard = await startCodewikiDashboardServer({
				repoRoot: root,
				open: false,
				keepAlive: false,
				inProcess: true,
				persistent: false,
				previewControl,
			});
			const token = new URL(dashboard.url).hash.slice("#token=".length);
			const statusResponse = await fetch(
				`${dashboard.origin}/api/previews?token=${encodeURIComponent(token)}`,
			);
			assert.equal(statusResponse.status, 200);
			assert.equal((await statusResponse.json())[0].state, "ready");

			const commandResponse = await fetch(
				`${dashboard.origin}/api/previews/commands?token=${encodeURIComponent(token)}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Origin: dashboard.origin,
					},
					body: JSON.stringify({
						action: "restart",
						profileId: "web",
						expectedProfileDigest: digest,
					}),
				},
			);
			assert.equal(commandResponse.status, 200);
			assert.equal(previewControl.commands.length, 1);
			assert.equal(previewControl.commands[0].action, "restart");

			const captureResponse = await fetch(
				`${dashboard.origin}/api/previews/commands?token=${encodeURIComponent(token)}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Origin: dashboard.origin,
					},
					body: JSON.stringify({
						action: "capture",
						profileId: "web",
						traceId: "TRACE-preview",
						expectedProfileDigest: digest,
					}),
				},
			);
			assert.equal(captureResponse.status, 200);
			assert.equal(previewControl.commands.length, 2);
			assert.deepEqual(previewControl.commands[1], {
				action: "capture",
				profileId: "web",
				traceId: "TRACE-preview",
				expectedProfileDigest: digest,
			});
		} finally {
			await dashboard?.close();
			await rm(root, { recursive: true, force: true });
		}
	});
});
