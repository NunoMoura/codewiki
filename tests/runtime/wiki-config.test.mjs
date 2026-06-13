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
			runtime: { maxWorkers: 3, worktreeIsolation: "auto" },
		});
		const result = runWikiConfig({
			current,
			patch: { runtime: { automation: "assist" } },
		});

		assert.equal(DEFAULT_WIKI_CONFIG.project, "codewiki");
		assert.equal(result.changed, true);
		assert.equal(result.config.project, "demo");
		assert.equal(result.config.runtime.maxWorkers, 3);
		assert.equal(result.config.runtime.worktreeIsolation, "auto");
		assert.equal(result.config.runtime.automation, "assist");
	});

	it("rejects invalid runtime and retention settings", () => {
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
			() => resolveWikiConfig({ retention: { archiveRefPrefix: "" } }),
			/archiveRefPrefix/,
		);
	});
});
