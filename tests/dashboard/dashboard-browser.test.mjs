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
	it("ships syntactically valid neutral pipeline cards, scoped header search, and guarded options", () => {
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
		assert.match(script, /function renderPipeline/);
		assert.match(script, /function renderTracePipelineCard/);
		assert.match(script, /function renderChangePipelineCard/);
		assert.match(script, /function renderPipelineRail/);
		assert.match(script, /function renderKnowledgeTopics/);
		assert.match(script, /function renderKnowledgeAlignment/);
		assert.match(script, /function knowledgeTopicLabel/);
		assert.match(script, /function renderSprintActions/);
		assert.match(script, /function executeSessionAction/);
		assert.match(script, /filter\.startsWith\('topic:'\)/);
		assert.match(script, /className = 'scope-group'/);
		assert.match(script, /topic\.category\.localeCompare/);
		assert.match(script, /declared Change topics/);
		assert.match(script, /function traceStateText/);
		assert.match(script, /function renderTraceOptions/);
		assert.match(script, /function openPipelineStage/);
		assert.match(script, /function openSearch/);
		assert.match(script, /function renderCommittedDetail/);
		assert.match(script, /function renderCollapsibleTerminalBlock/);
		assert.match(script, /function executeChangeCommand/);
		assert.match(script, /function renderConfiguration/);
		assert.match(script, /function executeConfigCommand/);
		assert.doesNotMatch(CODEWIKI_DASHBOARD_HTML, /dashboard-title/);
		assert.match(CODEWIKI_DASHBOARD_HTML, />Add Change<\/button>/);
		assert.doesNotMatch(CODEWIKI_DASHBOARD_HTML, /\+ Add Change/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /--logo-blue-dark: #315561/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /--interactive: #4a9293/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /--interactive-hover: #58aaa7/);
		assert.doesNotMatch(CODEWIKI_DASHBOARD_HTML, /#62c6c2/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /\.add-change:hover/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /\.add-change:focus-visible/);
		assert.match(
			CODEWIKI_DASHBOARD_HTML,
			/id="search" class="pipeline-search"/,
		);
		assert.match(
			CODEWIKI_DASHBOARD_HTML,
			/id="search-filter" class="search-filter"/,
		);
		assert.match(CODEWIKI_DASHBOARD_HTML, /Filter search scope/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /class="scope-count"/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /class="scope-menu"/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /Changes Backlog/);
		assert.doesNotMatch(CODEWIKI_DASHBOARD_HTML, /search-dialog/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /Dashboard settings/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /Trace options/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /⋮/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /segment-label/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /--progress-inactive/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /--stage-change/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /--stage-decision/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /--stage-planning/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /--stage-implementation/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /--stage-committed/);
		assert.doesNotMatch(CODEWIKI_DASHBOARD_HTML, /--progress-blocked/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /function renderSearchFilter/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /state\.summary\.backlog/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /state\.summary\.committed/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /Five-stage Change journey progress/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /aria-disabled/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /✕ Blocked —/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /Execution configuration/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /Save configuration/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /CONFIG_BUDGET_FIELDS/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /config-route/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /\['resume', 'Resume'\]/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /\['change', 'Change'\]/);
		assert.match(
			CODEWIKI_DASHBOARD_HTML,
			/\['resolve_blocker', 'Resolve Blocker'\]/,
		);
		assert.match(CODEWIKI_DASHBOARD_HTML, /knowledge-alignment\.review_needed/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /knowledge-alignment\.misaligned/);
		assert.doesNotMatch(CODEWIKI_DASHBOARD_HTML, /Close Dashboard/);
		assert.doesNotMatch(
			CODEWIKI_DASHBOARD_HTML,
			/Paste a bounded execution configuration patch JSON/,
		);
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
		assert.match(CODEWIKI_DASHBOARD_HTML, /dashboardDevMode/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /reloadChangedDashboardAssets/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /renderLivePreview/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /renderPreviewEvidence/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /\/api\/previews\/commands/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /Capture evidence/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /CLI unavailable/);
		assert.match(CODEWIKI_DASHBOARD_HTML, /browser not opened/);
		assert.match(
			CODEWIKI_DASHBOARD_HTML,
			/Evidence never grants semantic approval/,
		);
		assert.match(CODEWIKI_DASHBOARD_HTML, /__CODEWIKI_ASSET_DIGEST__/);
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
