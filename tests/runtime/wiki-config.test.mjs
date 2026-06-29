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
		assert.equal(result.config.quality.judge.enabled, false);
		assert.equal(result.config.quality.judge.provider, "none");
		assert.equal(result.config.quality.review.enabled, true);
		assert.equal(result.config.quality.review.autoEvidence, true);
		assert.equal(result.config.quality.review.includeCachedEvidence, true);
		assert.deepEqual(result.config.quality.review.enabledPacks, [
			"tsjs.typescript",
			"tsjs.lint",
			"python.ruff",
			"python.pyright",
			"go.test",
			"go.vet",
			"rust.cargo-test",
			"rust.cargo-clippy",
			"shell.shellcheck",
		]);
		assert.deepEqual(result.config.quality.review.requiredPacks, []);
	});

	it("documents review pack configuration recipes", async () => {
		const readme = await readFile("README.md", "utf8");
		const loopContracts = await readFile(
			".codewiki/kb/system/loop-contracts.md",
			"utf8",
		);
		const docs = `${readme}\n${loopContracts}`;

		for (const packId of DEFAULT_WIKI_CONFIG.quality.review.enabledPacks) {
			assert.match(docs, new RegExp(escapeRegExp(packId)));
		}
		assert.match(readme, /Review evidence configuration/);
		assert.match(readme, /autoEvidence/);
		assert.match(readme, /includeCachedEvidence/);
		assert.match(readme, /requiredPacks/);
		assert.match(readme, /skippedPacks/);
		assert.match(readme, /Explicit `reviewEvidenceReports`/);
		assert.match(loopContracts, /Review pack recipes/);
		assert.match(loopContracts, /requiredPacks/);
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
		const judged = resolveWikiConfig({
			quality: {
				judge: {
					enabled: true,
					provider: "http",
					endpoint: "http://127.0.0.1:8080/judge",
					promptVersion: "judge.test.v1",
					timeoutMs: 1234,
				},
			},
		});
		assert.equal(judged.quality.judge.enabled, true);
		assert.equal(judged.quality.judge.provider, "http");
		assert.equal(judged.quality.judge.promptVersion, "judge.test.v1");
		assert.equal(judged.quality.judge.timeoutMs, 1234);
		const reviewed = resolveWikiConfig({
			quality: {
				review: {
					autoEvidence: false,
					includeCachedEvidence: false,
					timeoutMs: 2222,
					fastTimeoutMs: 333,
					maxCachedEvidenceAgeMs: 4444,
					enabledPacks: ["tsjs.typescript", "tsjs.typescript"],
					disabledPacks: ["tsjs.lint", ""],
					requiredPacks: ["tsjs.typescript", ""],
				},
			},
		});
		assert.equal(reviewed.quality.review.autoEvidence, false);
		assert.equal(reviewed.quality.review.includeCachedEvidence, false);
		assert.equal(reviewed.quality.review.timeoutMs, 2222);
		assert.equal(reviewed.quality.review.fastTimeoutMs, 333);
		assert.equal(reviewed.quality.review.maxCachedEvidenceAgeMs, 4444);
		assert.deepEqual(reviewed.quality.review.enabledPacks, ["tsjs.typescript"]);
		assert.deepEqual(reviewed.quality.review.disabledPacks, ["tsjs.lint"]);
		assert.deepEqual(reviewed.quality.review.requiredPacks, [
			"tsjs.typescript",
		]);
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
		assert.throws(
			() =>
				resolveWikiConfig({
					quality: { judge: { provider: "stdio" } },
				}),
			/quality\.judge\.provider/,
		);
		assert.throws(
			() =>
				resolveWikiConfig({
					quality: { judge: { enabled: true, provider: "http" } },
				}),
			/quality\.judge\.endpoint/,
		);
		assert.throws(
			() =>
				resolveWikiConfig({
					quality: { review: { autoEvidence: "yes" } },
				}),
			/quality\.review\.autoEvidence/,
		);
		assert.throws(
			() =>
				resolveWikiConfig({
					quality: { review: { timeoutMs: 0 } },
				}),
			/quality\.review\.timeoutMs/,
		);
		assert.throws(
			() =>
				resolveWikiConfig({
					quality: {
						review: {
							disabledPacks: ["tsjs.typescript"],
							requiredPacks: ["tsjs.typescript"],
						},
					},
				}),
			/quality\.review\.requiredPacks/,
		);
		assert.throws(
			() =>
				resolveWikiConfig({
					quality: {
						review: {
							enabledPacks: ["tsjs.lint"],
							requiredPacks: ["tsjs.typescript"],
						},
					},
				}),
			/quality\.review\.requiredPacks/,
		);
	});
});

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
