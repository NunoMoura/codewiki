import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { CODEWIKI_APP_HTML } from "../../../src/clients/app/shell.ts";

function inlineScript(html) {
	const match = html.match(/<script>([\s\S]*?)<\/script>/);
	assert.ok(match, "dashboard inline script exists");
	return match[1];
}

describe("CodeWiki App browser shell", () => {
	it("ships syntactically valid neutral pipeline cards, scoped header search, and guarded options", () => {
		const script = inlineScript(CODEWIKI_APP_HTML);
		assert.doesNotThrow(() =>
			execFileSync(process.execPath, ["--check", "-"], {
				input: script,
				stdio: ["pipe", "pipe", "pipe"],
			}),
		);
		assert.match(script, /function renderImplementationPanel/);
		assert.match(script, /function renderWorkerAttempts/);
		assert.match(script, /function renderImplementationReview/);
		assert.match(script, /function renderDevLog/);
		assert.doesNotMatch(script, /function renderExecutionControl/);
		assert.doesNotMatch(script, /function executeTraceHostCommand/);
		assert.doesNotMatch(script, /\/api\/trace-hosts/);
		assert.match(script, /function renderPipeline/);
		assert.match(script, /function renderTracePipelineCard/);
		assert.match(script, /function renderChangePipelineCard/);
		assert.match(script, /function renderPipelineRail/);
		assert.match(script, /function renderKnowledgeTopics/);
		assert.match(script, /function renderKnowledgeAlignment/);
		assert.match(script, /function knowledgeTopicLabel/);
		assert.doesNotMatch(script, /function renderSprintActions/);
		assert.doesNotMatch(script, /function executeSessionAction/);
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
		assert.match(script, /function renderActivities/);
		assert.doesNotMatch(script, /function renderNarrativeFeed|Why it matters:|item\.nextAction/);
		assert.doesNotMatch(script, /function executeChangeCommand/);
		assert.match(script, /function renderConfiguration/);
		assert.doesNotMatch(script, /function executeConfigCommand/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /dashboard-title/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, />Add Change<\/button>/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /\+ Add Change/);
		assert.match(CODEWIKI_APP_HTML, /--logo-blue-dark: #315561/);
		assert.match(CODEWIKI_APP_HTML, /--interactive: #4a9293/);
		assert.match(CODEWIKI_APP_HTML, /--interactive-hover: #58aaa7/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /#62c6c2/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /\.add-change/);
		assert.match(
			CODEWIKI_APP_HTML,
			/id="search" class="pipeline-search"/,
		);
		assert.match(
			CODEWIKI_APP_HTML,
			/id="search-filter" class="search-filter"/,
		);
		assert.match(CODEWIKI_APP_HTML, /Filter search scope/);
		assert.match(CODEWIKI_APP_HTML, /class="scope-count"/);
		assert.match(CODEWIKI_APP_HTML, /class="scope-menu"/);
		assert.match(CODEWIKI_APP_HTML, /Changes Backlog/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /search-dialog/);
		assert.match(CODEWIKI_APP_HTML, /Dashboard settings/);
		assert.match(CODEWIKI_APP_HTML, /Trace options/);
		assert.match(CODEWIKI_APP_HTML, /⋮/);
		assert.match(CODEWIKI_APP_HTML, /segment-label/);
		assert.match(CODEWIKI_APP_HTML, /--progress-inactive/);
		assert.match(CODEWIKI_APP_HTML, /--stage-change/);
		assert.match(CODEWIKI_APP_HTML, /--stage-decision/);
		assert.match(CODEWIKI_APP_HTML, /--stage-planning/);
		assert.match(CODEWIKI_APP_HTML, /--stage-implementation/);
		assert.match(CODEWIKI_APP_HTML, /--stage-committed/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /--progress-blocked/);
		assert.match(CODEWIKI_APP_HTML, /function renderSearchFilter/);
		assert.match(CODEWIKI_APP_HTML, /state\.summary\.backlog/);
		assert.match(CODEWIKI_APP_HTML, /state\.summary\.committed/);
		assert.match(CODEWIKI_APP_HTML, /Five-stage Change journey progress/);
		assert.match(CODEWIKI_APP_HTML, /aria-disabled/);
		assert.match(CODEWIKI_APP_HTML, /✕ Blocked —/);
		assert.match(CODEWIKI_APP_HTML, /Execution configuration/);
		assert.match(CODEWIKI_APP_HTML, /Read only/);
		assert.match(CODEWIKI_APP_HTML, /Observation only/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /Save configuration/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /CONFIG_BUDGET_FIELDS/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /config-route/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /\/api\/changes\/commands/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /\/api\/configuration\/commands/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /\/api\/session-actions/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /Active Pi session bridge/);
		assert.match(CODEWIKI_APP_HTML, /knowledge-alignment\.review_needed/);
		assert.match(CODEWIKI_APP_HTML, /knowledge-alignment\.misaligned/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /Close Dashboard/);
		assert.doesNotMatch(
			CODEWIKI_APP_HTML,
			/Paste a bounded execution configuration patch JSON/,
		);
		assert.match(CODEWIKI_APP_HTML, /Current state/);
		assert.match(CODEWIKI_APP_HTML, /Proposed change/);
		assert.match(CODEWIKI_APP_HTML, /Agent opinion/);
		assert.match(CODEWIKI_APP_HTML, /integration and exit review/);
		assert.match(
			CODEWIKI_APP_HTML,
			/Semantic trace evidence remains authoritative/,
		);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /Start trace execution/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /Resume execution/);
		assert.match(CODEWIKI_APP_HTML, /dashboardDevMode/);
		assert.match(CODEWIKI_APP_HTML, /reloadChangedDashboardAssets/);
		assert.match(CODEWIKI_APP_HTML, /renderLivePreview/);
		assert.match(CODEWIKI_APP_HTML, /LIVE PREVIEW TARGETS/i);
		assert.match(CODEWIKI_APP_HTML, /expectedTargetDigest/);
		assert.match(
			CODEWIKI_APP_HTML,
			/Profile processes are shared across targets/,
		);
		assert.match(CODEWIKI_APP_HTML, /renderPreviewEvidence/);
		assert.match(CODEWIKI_APP_HTML, /\/api\/previews\/commands/);
		assert.match(CODEWIKI_APP_HTML, /Capture evidence/);
		assert.match(CODEWIKI_APP_HTML, /CLI unavailable/);
		assert.match(CODEWIKI_APP_HTML, /browser not opened/);
		assert.match(
			CODEWIKI_APP_HTML,
			/Evidence never grants semantic approval/,
		);
		assert.match(CODEWIKI_APP_HTML, /__CODEWIKI_ASSET_DIGEST__/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /Approval required:/);
		assert.doesNotMatch(CODEWIKI_APP_HTML, /resume session/);
	});

	it("provides explicit loading and terminal recovery content instead of a blank shell", () => {
		assert.match(CODEWIKI_APP_HTML, /Loading CodeWiki pipeline state/);
		assert.match(CODEWIKI_APP_HTML, /failed · retrying/);
		assert.match(CODEWIKI_APP_HTML, /stale · reconnecting/);
		assert.match(CODEWIKI_APP_HTML, /fully restart Pi/);
		assert.match(CODEWIKI_APP_HTML, /setInterval\(load, 1000\)/);
	});
});
