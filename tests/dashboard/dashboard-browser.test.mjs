import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { CODEWIKI_DASHBOARD_HTML } from "../../src/dashboard/assets.ts";

function inlineScript(html) {
	const match = html.match(/<script>([\s\S]*?)<\/script>/);
	assert.ok(match, "dashboard inline script exists");
	return match[1];
}

describe("dashboard browser observability", () => {
	it("ships syntactically valid worker, narrative, aggregate, and Dev Log renderers", () => {
		const script = inlineScript(CODEWIKI_DASHBOARD_HTML);
		assert.doesNotThrow(() =>
			execFileSync(process.execPath, ["--check", "-"], {
				input: script,
				stdio: ["pipe", "pipe", "pipe"],
			}),
		);
		assert.match(script, /function renderImplementationPanel/);
		assert.match(script, /function renderWorkerAttempts/);
		assert.match(script, /function renderImplementationReview/);
		assert.match(script, /function renderNarrativeFeed/);
		assert.match(script, /function renderDevLog/);
		assert.match(script, /function renderExecutionControl/);
		assert.match(script, /function executeTraceHostCommand/);
		assert.match(script, /function renderChanges/);
		assert.match(script, /function executeChangeCommand/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /Changes Backlog/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /Current state/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /Proposed change/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /Agent opinion/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /integration and exit review/);
		assert.match(
			CODEWIKI_DASHBOARD_HTML,
			/Semantic trace evidence remains authoritative/,
		);
		assert.match(CODEWIKI_DASHBOARD_HTML, /Start trace execution/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /Resume execution/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /does not grant semantic approval/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /Semantic approvals remain separate/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /Approval required:/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /resume session/);
	});

	it("provides explicit loading and terminal recovery content instead of a blank shell", () => {
		assert.match(CODEWIKI_DASHBOARD_HTML, /Loading CodeWiki pipeline state/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /failed · retrying/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /stale · reconnecting/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /fully restart Pi/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /setInterval\(load, 1000\)/);
	});
});
