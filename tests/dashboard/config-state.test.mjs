import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { loadDashboardConfigState } from "../../src/dashboard/config-state.ts";
import { writeWikiConfigFile } from "../../src/project/config-file.ts";
import { resolveWikiConfig } from "../../src/project/config.ts";

describe("dashboard configuration state", () => {
	it("projects bounded effective settings without secrets or authority policy", async () => {
		const root = await mkdtemp(
			join(tmpdir(), "codewiki-dashboard-config-state-"),
		);
		try {
			const config = resolveWikiConfig({
				runtime: {
					automation: "manual",
					agency: "delegate",
					budgets: { maxSeconds: 600, maxCostUsd: 2 },
				},
				hosts: { pi: { enabled: true } },
			});
			await writeWikiConfigFile(root, config);
			const state = await loadDashboardConfigState(root, config);
			assert.match(state.configDigest, /^sha256:[a-f0-9]{64}$/);
			assert.equal(state.activeConfigDigest, state.configDigest);
			assert.equal(state.restartRequired, false);
			assert.equal(state.effective.runtime.automation, "manual");
			assert.equal(state.effective.runtime.agency, "delegate");
			assert.equal(state.effective.hosts.pi.enabled, true);
			assert.equal(state.limits.maxWorkers, 16);
			assert.equal(state.limits.budgetMaxima.maxCostUsd, 1_000);
			assert.equal(state.limits.modelMaxima.maxRoutes, 32);
			assert.equal(state.limits.modelMaxima.maxEscalations, 16);
			assert.equal(state.limits.modelMaxima.maxEstimatedTokens, 10_000_000);
			assert.equal(state.limits.automationCeiling, "manual");
			assert.equal(state.limits.agencyCeiling, "delegate");
			assert.equal(state.limits.minimumQualityFloor, "standard");
			assert.equal(state.limits.piHostCanEnable, true);
			assert.deepEqual(state.limits.allowedTools, []);
			const serialized = JSON.stringify(state);
			assert.equal(serialized.includes("approval"), false);
			assert.equal(serialized.includes("stopConditions"), false);
			assert.equal(serialized.includes("worktreeSetupCommands"), false);
			assert.equal(serialized.includes("mcp"), false);
			assert.equal(serialized.includes("apiKey"), false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
