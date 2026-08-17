import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	assertExternalProjectRoot,
	parseDashboardDevArgs,
	runDashboardDev,
} from "../../scripts/dashboard-dev.mjs";

describe("dashboard development harness", () => {
	it("requires an explicit external project and bounded browser adapter", () => {
		assert.deepEqual(
			parseDashboardDevArgs([
				"--project",
				"/tmp/fixture",
				"--browser",
				"playwright",
			]),
			{ browser: "playwright", project: "/tmp/fixture" },
		);
		assert.deepEqual(
			parseDashboardDevArgs(["--project", "/tmp/fixture", "--no-open"]),
			{
				browser: "none",
				project: "/tmp/fixture",
			},
		);
		assert.throws(() => parseDashboardDevArgs([]), /requires --project/);
		assert.throws(
			() =>
				parseDashboardDevArgs([
					"--project",
					"/tmp/fixture",
					"--browser",
					"remote",
				]),
			/system, or playwright/,
		);
	});

	it("rejects source-root dogfooding and accepts a separate fixture", () => {
		assert.throws(
			() =>
				assertExternalProjectRoot("/workspace/codewiki", "/workspace/codewiki"),
			/outside the CodeWiki source repository/,
		);
		assert.throws(
			() =>
				assertExternalProjectRoot(
					"/workspace/codewiki",
					"/workspace/codewiki/fixture",
				),
			/outside the CodeWiki source repository/,
		);
		assert.throws(
			() => assertExternalProjectRoot("/workspace/codewiki", "/workspace"),
			/outside the CodeWiki source repository/,
		);
		assert.doesNotThrow(() =>
			assertExternalProjectRoot("/workspace/codewiki", "/tmp/codewiki-fixture"),
		);
	});

	it("serves live-reload dashboard assets from source against an external fixture", async () => {
		const fixture = await mkdtemp(join(tmpdir(), "codewiki-dashboard-dev-"));
		let runtime;
		try {
			await mkdir(join(fixture, ".codewiki", "traces"), { recursive: true });
			runtime = await runDashboardDev({ browser: "none", project: fixture });
			assert.equal(runtime.browser.opened, false);
			assert.match(runtime.url, /[?&]dev=1/);
			const response = await fetch(runtime.url);
			assert.equal(response.status, 200);
			const html = await response.text();
			assert.match(html, /const dashboardDevMode =/);
			assert.doesNotMatch(html, /__CODEWIKI_ASSET_DIGEST__/);
		} finally {
			await runtime?.close();
			await rm(fixture, { recursive: true, force: true });
		}
	});
});
