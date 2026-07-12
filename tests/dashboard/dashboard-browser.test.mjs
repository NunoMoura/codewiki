import assert from "node:assert/strict";
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
		assert.doesNotThrow(() => new Function(script));
		assert.match(script, /function renderImplementationPanel/);
		assert.match(script, /function renderWorkerAttempts/);
		assert.match(script, /function renderImplementationReview/);
		assert.match(script, /function renderNarrativeFeed/);
		assert.match(script, /function renderDevLog/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /integration and exit review/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /Semantic trace evidence remains authoritative/);
	});

	it("provides explicit loading and terminal recovery content instead of a blank shell", () => {
		assert.match(CODEWIKI_DASHBOARD_HTML, /Loading CodeWiki pipeline state/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /failed · retrying/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /stale · reconnecting/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /fully restart Pi/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /setInterval\(load, 1000\)/);
	});
});
