import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { startCodewikiAppServer } from "../../../src/server/app/server.ts";
import { parseDashboardPreviewCommand } from "../../../src/preview/dashboard-control.ts";

const digest = `sha256:${"a".repeat(64)}`;
const targetDigest = `sha256:${"b".repeat(64)}`;

function fakePreviewControl() {
	const commands = [];
	const statuses = [
		{
			targetId: "dashboard-detail",
			targetDigest,
			profileId: "web",
			profileDigest: digest,
			traceIds: ["TRACE-preview"],
			changeIds: ["CHG-preview"],
			sprintIds: ["SPR-preview"],
			workItemIds: ["WU-preview"],
			viewports: ["desktop"],
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
				targetId: "dashboard-detail",
				expectedTargetDigest: targetDigest,
				expectedProfileDigest: digest,
			}),
			{
				action: "restart",
				targetId: "dashboard-detail",
				expectedTargetDigest: targetDigest,
				expectedProfileDigest: digest,
			},
		);
		assert.deepEqual(
			parseDashboardPreviewCommand({
				action: "capture",
				targetId: "dashboard-detail",
				expectedTargetDigest: targetDigest,
				expectedProfileDigest: digest,
			}),
			{
				action: "capture",
				targetId: "dashboard-detail",
				expectedTargetDigest: targetDigest,
				expectedProfileDigest: digest,
			},
		);
		assert.throws(
			() =>
				parseDashboardPreviewCommand({
					action: "shell",
					targetId: "dashboard-detail",
				}),
			/start, open, capture, restart, or stop/,
		);
		assert.throws(
			() =>
				parseDashboardPreviewCommand({ action: "stop", targetId: "../web" }),
			/safe identifier/,
		);
		assert.throws(
			() =>
				parseDashboardPreviewCommand({
					action: "stop",
					targetId: "dashboard-detail",
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
			dashboard = await startCodewikiAppServer({
				repoRoot: root,
				open: false,
				keepAlive: false,
				inProcess: true,
				persistent: false,
				previewControl,
			});
			const authorization = `Bearer ${dashboard.sessionCredential}`;
			assert.match(new URL(dashboard.url).hash, /^#session=/);
			assert.equal(
				(await fetch(`${dashboard.origin}/api/previews?token=stale`)).status,
				403,
			);
			const established = await fetch(`${dashboard.origin}/api/session`, {
				method: "POST",
				headers: {Authorization: authorization, "Content-Type": "application/json", Origin: dashboard.origin},
				body: "{}",
			});
			assert.equal(established.status, 200);
			assert.match(established.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
			const cookie = established.headers.get("set-cookie").split(";", 1)[0];
			assert.equal((await fetch(`${dashboard.origin}/api/previews`, {
				headers: {Authorization: `Bearer 2.${dashboard.sessionCredential.split(".")[1]}`, Cookie: cookie},
			})).status, 403);
			const statusResponse = await fetch(`${dashboard.origin}/api/previews`, {
				headers: {Cookie: cookie},
			});
			assert.equal(statusResponse.status, 200);
			assert.equal((await statusResponse.json())[0].state, "ready");

			const commandResponse = await fetch(
				`${dashboard.origin}/api/previews/commands`,
				{
					method: "POST",
					headers: {
						Cookie: cookie,
						"Content-Type": "application/json",
						Origin: dashboard.origin,
					},
					body: JSON.stringify({
						action: "restart",
						targetId: "dashboard-detail",
						expectedTargetDigest: targetDigest,
						expectedProfileDigest: digest,
					}),
				},
			);
			assert.equal(commandResponse.status, 200);
			assert.equal(previewControl.commands.length, 1);
			assert.equal(previewControl.commands[0].action, "restart");

			const captureResponse = await fetch(
				`${dashboard.origin}/api/previews/commands`,
				{
					method: "POST",
					headers: {
						Cookie: cookie,
						"Content-Type": "application/json",
						Origin: dashboard.origin,
					},
					body: JSON.stringify({
						action: "capture",
						targetId: "dashboard-detail",
						expectedTargetDigest: targetDigest,
						expectedProfileDigest: digest,
					}),
				},
			);
			assert.equal(captureResponse.status, 200);
			assert.equal(previewControl.commands.length, 2);
			assert.deepEqual(previewControl.commands[1], {
				action: "capture",
				targetId: "dashboard-detail",
				expectedTargetDigest: targetDigest,
				expectedProfileDigest: digest,
			});
		} finally {
			await dashboard?.close();
			await rm(root, { recursive: true, force: true });
		}
	});
});
