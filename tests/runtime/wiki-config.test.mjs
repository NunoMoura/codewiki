import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	DEFAULT_WIKI_CONFIG,
	resolveWikiConfig,
	runWikiConfig,
} from "../../src/api/wiki-config.ts";

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
		assert.deepEqual(config.runtime.stopConditions, ["risk_escalation"]);
		assert.equal(
			config.retention.archiveRefPrefix,
			"refs/codewiki/archive/custom/",
		);
		assert.equal(config.retention.hotTraceLimit, 3);
		assert.equal(config.retention.requireCloseRecord, true);
		assert.equal(config.retention.hydrateOnDemand, false);
		assert.equal(config.hosts.cli.enabled, true);
		assert.equal(config.hosts.pi.enabled, true);
		assert.equal(config.hosts.mcp.enabled, true);
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
