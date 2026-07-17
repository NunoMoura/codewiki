import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
	createDashboardConfigControl,
	parseDashboardConfigCommand,
} from "../../src/dashboard/config-control.ts";
import { startCodewikiDashboardServer } from "../../src/dashboard/server.ts";
import {
	loadWikiConfigFile,
	writeWikiConfigFile,
} from "../../src/project/config-file.ts";
import { resolveWikiConfig } from "../../src/project/config.ts";

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

describe("dashboard execution configuration control", () => {
	it("applies guarded bounded patches with CAS, idempotency, and restart guidance", async () => {
		const root = await mkdtemp(
			join(tmpdir(), "codewiki-dashboard-config-control-"),
		);
		try {
			const active = resolveWikiConfig({
				runtime: {
					automation: "manual",
					agency: "delegate",
					budgets: { maxSeconds: 600, maxCostUsd: 2 },
					modelRouting: { qualityFloor: "high" },
				},
				hosts: { pi: { enabled: true } },
			});
			await writeWikiConfigFile(root, active);
			const control = createDashboardConfigControl({
				repoRoot: root,
				activeConfig: active,
				now: () => new Date("2026-07-14T10:00:00.000Z"),
			});
			const initial = await control.status();
			await assert.rejects(
				control.execute({
					commandId: "config-command-escalation",
					expectedStateDigest: initial.stateDigest,
					expectedConfigDigest: initial.configDigest,
					patch: { runtime: { automation: "assist" } },
				}),
				/cannot raise the runtime automation ceiling/,
			);
			await assert.rejects(
				control.execute({
					commandId: "config-command-quality",
					expectedStateDigest: initial.stateDigest,
					expectedConfigDigest: initial.configDigest,
					patch: { runtime: { modelRouting: { qualityFloor: "standard" } } },
				}),
				/cannot lower the model quality floor/,
			);
			await assert.rejects(
				control.execute({
					commandId: "config-command-workers",
					expectedStateDigest: initial.stateDigest,
					expectedConfigDigest: initial.configDigest,
					patch: { runtime: { maxWorkers: 17, worktreeIsolation: "worktree" } },
				}),
				/maxWorkers cannot exceed 16/,
			);
			await assert.rejects(
				control.execute({
					commandId: "config-command-escalations",
					expectedStateDigest: initial.stateDigest,
					expectedConfigDigest: initial.configDigest,
					patch: { runtime: { modelRouting: { maxEscalations: 17 } } },
				}),
				/maxEscalations cannot exceed 16/,
			);
			const command = {
				commandId: "config-command-001",
				expectedStateDigest: initial.stateDigest,
				expectedConfigDigest: initial.configDigest,
				patch: {
					runtime: {
						budgets: { maxSeconds: 900, maxCostUsd: 2.5 },
						modelRouting: { maxEscalations: 0 },
					},
				},
			};
			const result = await control.execute(command);
			assert.equal(result.replayed, false);
			assert.equal(result.state.editable.runtime.budgets.maxSeconds, 900);
			assert.equal(result.state.restartRequired, true);
			assert.match(result.state.restartGuidance, /fully exit and restart Pi/i);
			assert.equal(result.receipt.configDigestBefore, initial.configDigest);
			assert.equal(result.receipt.configDigestAfter, result.state.configDigest);
			assert.equal(JSON.stringify(result.receipt).length < 2_000, true);
			const replay = await control.execute(command);
			assert.equal(replay.replayed, true);
			assert.equal(replay.receipt.receiptId, result.receipt.receiptId);
			await assert.rejects(
				control.execute({
					...command,
					patch: { runtime: { automation: "assist" } },
				}),
				/Command id was already used for different input/,
			);
			await assert.rejects(
				control.execute({ ...command, commandId: "config-command-stale" }),
				/configuration state changed/i,
			);
			const persisted = await loadWikiConfigFile(root);
			assert.equal(persisted.runtime.budgets.maxSeconds, 900);
			assert.doesNotMatch(
				await readFile(join(root, ".codewiki", "config.json"), "utf8"),
				/apiKey|password|secret/i,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("protects configuration HTTP reads and writes", async () => {
		const root = await mkdtemp(
			join(tmpdir(), "codewiki-dashboard-config-http-"),
		);
		let handle;
		try {
			await writeWikiConfigFile(root, resolveWikiConfig());
			handle = await startCodewikiDashboardServer({
				repoRoot: root,
				open: false,
				keepAlive: false,
				inProcess: true,
				persistent: false,
				traceHostControl: fakeTraceHostControl(),
			});
			const url = `${handle.origin}/api/configuration?token=${encodeURIComponent(handle.token)}`;
			const state = await (await fetch(url)).json();
			assert.equal(state.validation, "valid");
			assert.equal(
				(await fetch(`${handle.origin}/api/configuration`)).status,
				403,
			);
			const commandUrl = `${handle.origin}/api/configuration/commands?token=${encodeURIComponent(handle.token)}`;
			const command = {
				commandId: "config-http-001",
				expectedStateDigest: state.stateDigest,
				expectedConfigDigest: state.configDigest,
				patch: { runtime: { budgets: { maxSeconds: 700 } } },
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
			const response = await fetch(commandUrl, {
				method: "POST",
				headers: { Origin: handle.origin, "Content-Type": "application/json" },
				body: JSON.stringify(command),
			});
			assert.equal(response.status, 200);
			assert.equal(
				(await response.json()).state.editable.runtime.budgets.maxSeconds,
				700,
			);
		} finally {
			if (handle) await handle.close();
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects authority escalation, secret fields, and unsupported settings", () => {
		const base = {
			commandId: "config-command-invalid",
			expectedStateDigest: "sha256:" + "1".repeat(64),
			expectedConfigDigest: "sha256:" + "2".repeat(64),
		};
		assert.throws(
			() =>
				parseDashboardConfigCommand({
					...base,
					patch: { runtime: { approval: { cadence: "never" } } },
				}),
			/Unsupported dashboard configuration field runtime.approval/,
		);
		assert.throws(
			() =>
				parseDashboardConfigCommand({
					...base,
					patch: { hosts: { mcp: { enabled: true } } },
				}),
			/Unsupported dashboard configuration field hosts.mcp/,
		);
		assert.throws(
			() =>
				parseDashboardConfigCommand({
					...base,
					patch: { runtime: { apiKey: "secret-value" } },
				}),
			/Unsupported dashboard configuration field runtime.apiKey/,
		);
	});
});
