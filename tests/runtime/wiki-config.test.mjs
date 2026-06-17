import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	DEFAULT_WIKI_CONFIG,
	resolveWikiConfig,
	runWikiConfig,
} from "../../src/api/wiki-config.ts";
import {
	loadWikiConfigFile,
	resolveWikiConfigFile,
	updateWikiConfigFile,
} from "../../src/project/config-file.ts";

describe("wiki_config core facade", () => {
	it("resolves defaults and deep patches config", () => {
		const current = resolveWikiConfig({
			project: "demo",
			runtime: {
				maxWorkers: 3,
				worktreeIsolation: "auto",
				budgets: { maxIterations: 2 },
			},
		});
		const result = runWikiConfig({
			current,
			patch: {
				runtime: {
					automation: "assist",
					approval: { cadence: "on_risk" },
					budgets: { maxChangedFiles: 12 },
				},
			},
		});

		assert.equal(DEFAULT_WIKI_CONFIG.project, "codewiki");
		assert.equal(result.changed, true);
		assert.equal(result.config.project, "demo");
		assert.equal(result.config.runtime.maxWorkers, 3);
		assert.equal(result.config.runtime.worktreeIsolation, "auto");
		assert.deepEqual(result.config.runtime.worktreeSetupCommands, []);
		assert.equal(result.config.runtime.automation, "assist");
		assert.equal(result.config.runtime.agency, "assist");
		assert.equal(result.config.runtime.approval.cadence, "on_risk");
		assert.equal(result.config.runtime.approval.destructiveAction, "ask");
		assert.equal(result.config.runtime.budgets.maxIterations, 2);
		assert.equal(result.config.runtime.budgets.maxChangedFiles, 12);
	});

	it("normalizes retention, host, and stop-condition policy", () => {
		const config = resolveWikiConfig({
			runtime: {
				agency: "delegate",
				worktreeSetupCommands: ["npm install", "npm install", ""],
				stopConditions: ["risk_escalation", "risk_escalation", ""],
			},
			retention: {
				archiveRefPrefix: " refs/codewiki/archive/custom/ ",
				hotTraceLimit: 3,
				hydrateOnDemand: false,
			},
			hosts: {
				pi: { enabled: true },
				mcp: { enabled: true },
			},
		});

		assert.equal(config.runtime.agency, "delegate");
		assert.deepEqual(config.runtime.worktreeSetupCommands, ["npm install"]);
		assert.deepEqual(config.runtime.stopConditions, ["risk_escalation"]);
		assert.equal(
			config.retention.archiveRefPrefix,
			"refs/codewiki/archive/custom/",
		);
		assert.equal(config.retention.hotTraceLimit, 3);
		assert.equal(config.retention.requireCloseRecord, true);
		assert.equal(config.retention.hydrateOnDemand, false);
		assert.deepEqual(Object.keys(config.hosts).sort(), ["mcp", "pi"]);
		assert.equal(config.hosts.pi.enabled, true);
		assert.equal(config.hosts.mcp.enabled, true);
	});

	it("loads and saves project config files", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-config-"));
		try {
			const missing = await loadWikiConfigFile(root);
			assert.equal(missing.project, "codewiki");

			await mkdir(join(root, ".codewiki"), { recursive: true });
			await writeFile(
				join(root, ".codewiki", "config.json"),
				JSON.stringify({
					project_name: "legacy-demo",
					codewiki: {
						agency: {
							parallelism: { max_sessions: 4 },
							approval_cadence: "risk",
							stop_gates: ["semantic_decision", "risk_escalation"],
						},
					},
				}),
			);
			const loaded = await loadWikiConfigFile(root);
			assert.equal(loaded.project, "legacy-demo");
			assert.equal(loaded.runtime.maxWorkers, 4);
			assert.equal(loaded.runtime.approval.cadence, "on_risk");
			assert.deepEqual(loaded.runtime.stopConditions, [
				"semantic_decision",
				"risk_escalation",
			]);

			const resolved = await resolveWikiConfigFile(root, {
				patch: { retention: { hotTraceLimit: 7 } },
			});
			assert.equal(resolved.written, false);
			assert.equal(resolved.config.retention.hotTraceLimit, 7);

			const saved = await updateWikiConfigFile(root, {
				patch: { runtime: { automation: "assist" } },
			});
			assert.equal(saved.written, true);
			const disk = JSON.parse(
				await readFile(join(root, ".codewiki", "config.json"), "utf8"),
			);
			assert.equal(disk.project, "legacy-demo");
			assert.equal(disk.runtime.automation, "assist");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects invalid runtime, approval, retention, and host settings", () => {
		assert.throws(
			() => resolveWikiConfig({ runtime: { maxWorkers: -1 } }),
			/maxWorkers/,
		);
		assert.throws(
			() =>
				resolveWikiConfig({
					runtime: { worktreeIsolation: "always" },
				}),
			/worktreeIsolation/,
		);
		assert.throws(
			() => resolveWikiConfig({ runtime: { agency: "owner" } }),
			/runtime\.agency/,
		);
		assert.throws(
			() =>
				resolveWikiConfig({
					runtime: { worktreeSetupCommands: ["npm install\nnpm test"] },
				}),
			/worktreeSetupCommands/,
		);
		assert.throws(
			() =>
				resolveWikiConfig({
					runtime: { budgets: { maxIterations: 0 } },
				}),
			/maxIterations/,
		);
		assert.throws(
			() =>
				resolveWikiConfig({
					runtime: { approval: { cadence: "per_task" } },
				}),
			/approval\.cadence/,
		);
		assert.throws(
			() => resolveWikiConfig({ retention: { archiveRefPrefix: "" } }),
			/archiveRefPrefix/,
		);
		assert.throws(
			() => resolveWikiConfig({ retention: { hotTraceLimit: -1 } }),
			/hotTraceLimit/,
		);
		assert.throws(
			() =>
				resolveWikiConfig({
					hosts: { pi: { enabled: "yes" } },
				}),
			/hosts\.pi\.enabled/,
		);
	});
});
