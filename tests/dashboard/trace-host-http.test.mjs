import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { startCodewikiDashboardServer } from "../../src/dashboard/server.ts";

function fakeControl() {
	const commands = [];
	let shutdowns = 0;
	return {
		commands,
		get shutdowns() {
			return shutdowns;
		},
		control: {
			status: async () => ({
				generatedAt: "2026-07-12T12:00:00.000Z",
				supervisorId: "dashboard:test",
				policy: {
					piHostEnabled: true,
					automation: "manual",
					agency: "assist",
				},
				traces: [],
			}),
			execute: async (command) => {
				commands.push(command);
				return {
					replayed: false,
					receipt: { commandId: command.commandId },
					state: { traces: [] },
				};
			},
			heartbeat: async () => undefined,
			shutdown: async () => {
				shutdowns += 1;
			},
		},
	};
}

async function json(response) {
	return { status: response.status, body: await response.json() };
}

function requestStatus(url, headers, body) {
	return new Promise((resolve, reject) => {
		const outgoing = request(url, { method: "POST", headers }, (response) => {
			response.resume();
			response.once("end", () => resolve(response.statusCode));
		});
		outgoing.once("error", reject);
		outgoing.end(body);
	});
}

describe("dashboard trace host HTTP control", () => {
	it("requires token, same-origin browser authority, JSON, and bounded command bodies", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-dashboard-control-"));
		const fake = fakeControl();
		let handle;
		try {
			await mkdir(join(root, ".codewiki", "traces"), { recursive: true });
			handle = await startCodewikiDashboardServer({
				repoRoot: root,
				open: false,
				keepAlive: false,
				inProcess: true,
				persistent: false,
				traceHostControl: fake.control,
			});
			const statusUrl = `${handle.origin}/api/trace-hosts?token=${encodeURIComponent(handle.token)}`;
			const status = await json(await fetch(statusUrl));
			assert.equal(status.status, 200);
			assert.equal(status.body.supervisorId, "dashboard:test");
			assert.equal(
				(await fetch(`${handle.origin}/api/trace-hosts`)).status,
				403,
			);

			const commandUrl = `${handle.origin}/api/trace-hosts/commands?token=${encodeURIComponent(handle.token)}`;
			const command = {
				action: "start",
				commandId: "command-http-001",
				traceId: "TRACE-http",
				expectedStateDigest: `sha256:${"a".repeat(64)}`,
			};
			const missingOrigin = await json(
				await fetch(commandUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(command),
				}),
			);
			assert.equal(missingOrigin.status, 403);

			const wrongOrigin = await json(
				await fetch(commandUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Origin: "http://127.0.0.1:1",
					},
					body: JSON.stringify(command),
				}),
			);
			assert.equal(wrongOrigin.status, 403);

			const wrongHostFallback = await requestStatus(
				commandUrl,
				{
					Host: "127.0.0.1:1",
					"Content-Type": "application/json",
					"Sec-Fetch-Site": "same-origin",
				},
				JSON.stringify(command),
			);
			assert.equal(wrongHostFallback, 403);

			const crossSite = await json(
				await fetch(commandUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Origin: handle.origin,
						"Sec-Fetch-Site": "cross-site",
					},
					body: JSON.stringify(command),
				}),
			);
			assert.equal(crossSite.status, 403);

			const browserCommand = {
				...command,
				commandId: "command-http-browser-001",
			};
			const browserSameOrigin = await json(
				await fetch(commandUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Sec-Fetch-Site": "same-origin",
					},
					body: JSON.stringify(browserCommand),
				}),
			);
			assert.equal(browserSameOrigin.status, 200);
			assert.equal(
				browserSameOrigin.body.receipt.commandId,
				"command-http-browser-001",
			);

			const wrongType = await json(
				await fetch(commandUrl, {
					method: "POST",
					headers: { Origin: handle.origin, "Content-Type": "text/plain" },
					body: JSON.stringify(command),
				}),
			);
			assert.equal(wrongType.status, 400);

			const invalidJson = await json(
				await fetch(commandUrl, {
					method: "POST",
					headers: {
						Origin: handle.origin,
						"Content-Type": "application/json",
					},
					body: "{",
				}),
			);
			assert.equal(invalidJson.status, 400);

			const wrongToken = await json(
				await fetch(`${handle.origin}/api/trace-hosts/commands?token=wrong`, {
					method: "POST",
					headers: {
						Origin: handle.origin,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(command),
				}),
			);
			assert.equal(wrongToken.status, 403);

			const oversized = await json(
				await fetch(commandUrl, {
					method: "POST",
					headers: {
						Origin: handle.origin,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ payload: "x".repeat(17_000) }),
				}),
			);
			assert.equal(oversized.status, 400);

			const accepted = await json(
				await fetch(commandUrl, {
					method: "POST",
					headers: {
						Origin: handle.origin,
						"Content-Type": "application/json; charset=utf-8",
					},
					body: JSON.stringify(command),
				}),
			);
			assert.equal(accepted.status, 200);
			assert.equal(accepted.body.receipt.commandId, "command-http-001");
			assert.deepEqual(fake.commands, [browserCommand, command]);

			const shutdownUrl = `${handle.origin}/api/shutdown?token=${encodeURIComponent(handle.token)}`;
			assert.equal((await fetch(shutdownUrl, { method: "POST" })).status, 403);
			assert.equal(
				(
					await fetch(shutdownUrl, {
						method: "POST",
						headers: {
							Origin: handle.origin,
							"Content-Type": "application/json",
						},
						body: "{}",
					})
				).status,
				200,
			);
			await new Promise((resolve) => setTimeout(resolve, 50));
			assert.equal(fake.shutdowns, 1);
			handle = undefined;
		} finally {
			if (handle) await handle.close();
			await rm(root, { recursive: true, force: true });
		}
		assert.equal(fake.shutdowns, 1);
	});
});
