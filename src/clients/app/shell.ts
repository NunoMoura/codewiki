import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CODEWIKI_LOGO_DATA_URI = `data:image/png;base64,${readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), "assets", "codewiki-logo.png"),
).toString("base64")}`;

export const CODEWIKI_APP_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CodeWiki Work Pipeline</title>
<style>
:root {
	color-scheme: dark;
	--bg: #050505;
	--panel: #0d0d0d;
	--panel-2: #171717;
	--line: #4a4a4a;
	--line-strong: #8a8a8a;
	--text: #f4f1e8;
	--muted: #a3a3a3;
	--dim: #626262;
	--focus: #f4f4f4;
	--focus-soft: #262626;
	--check-pending: #9aa3a4;
	--check-verifying: #ffd750;
	--check-passed: #67c66d;
	--check-failed: #d94848;
	--check-skipped: #7d8586;
	--bar-bg: #050605;
	--bar-ring: #7a7767;
	--radius-xl: 16px;
	--radius: 16px;
	--radius-sm: 10px;
	--logo-red: #e85042;
	--logo-orange: #ef7b36;
	--logo-yellow: #f3d55b;
	--logo-green: #8ecb72;
	--logo-blue-dark: #315561;
	--logo-blue-hover: #397375;
	--interactive: #4a9293;
	--interactive-hover: #58aaa7;
	--danger: #d94848;
	--progress-inactive: #353b3b;
	--stage-change: var(--logo-orange);
	--stage-decision: var(--logo-yellow);
	--stage-planning: var(--logo-green);
	--stage-implementation: #4d88b8;
	--stage-committed: var(--interactive);
	--atari-blue: var(--interactive);
	--atari-red: var(--logo-red);
	--atari-orange: var(--logo-orange);
	--atari-yellow: var(--logo-yellow);
	--atari-green: var(--logo-green);
	--brand-ink: #fff7e8;
}
* { box-sizing: border-box; }
html, body { min-width: 0; overflow-x: hidden; }
body {
	margin: 0;
	background:
		linear-gradient(rgba(255,255,255,.025) 50%, rgba(0,0,0,.025) 50%) 0 0 / 100% 4px,
		linear-gradient(180deg, #0a0a0a, var(--bg));
	color: var(--text);
	font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
	letter-spacing: .01em;
}
button, input { font: inherit; }
button { color: inherit; }
#app { min-height: 100vh; width: 100vw; padding: clamp(10px, 2vw, 20px); }
.shell {
	width: min(100%, 1440px);
	max-width: 100%;
	margin: 0 auto;
	display: grid;
	gap: 10px;
}
.header {
	position: relative;
	overflow: visible;
	border: 1px solid var(--line-strong);
	border-radius: var(--radius);
	background:
		radial-gradient(circle at 14% 0%, rgba(255,247,232,.10), transparent 24%),
		linear-gradient(180deg, #151412, #050505 72%);
	box-shadow: inset 0 0 0 1px #000, inset 0 -18px 32px rgba(0,0,0,.55);
	padding: 10px 18px;
	display: grid;
	grid-template-columns: 112px minmax(0, 1fr);
	align-items: center;
	gap: 18px;
	min-height: 0;
	max-width: 100%;
}
.header::before {
	content: "";
	position: absolute;
	inset: 0;
	background: repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 1px, transparent 1px 5px);
	pointer-events: none;
	opacity: .45;
}
.header > * { position: relative; z-index: 1; }
.brand {
	min-width: 0;
	width: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
}
.brand-copy {
	min-width: 0;
	display: grid;
	justify-items: center;
	align-content: center;
	gap: 3px;
}
.codewiki-logo {
	display: block;
	width: 112px;
	max-width: 100%;
	height: auto;
	border-radius: 8px;
	filter: drop-shadow(0 0 14px rgba(255,247,232,.10));
}
.repo-label {
	min-width: 0;
	max-width: 100%;
	color: var(--muted);
	font-size: 11px;
	font-weight: 900;
	letter-spacing: .10em;
	text-transform: uppercase;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	text-align: center;
}
.project {
	color: var(--text);
}
.header-dashboard {
	min-width: 0;
	width: min(100%, 900px);
	justify-self: center;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
}
.search-control {
	position: relative;
	min-width: 0;
	flex: 1 1 620px;
	max-width: 670px;
	height: 38px;
	display: flex;
	align-items: center;
	border: 1px solid var(--line);
	border-radius: 9px;
	background: #070707;
}
.search-control:focus-within { border-color: var(--interactive); box-shadow: 0 0 0 1px color-mix(in srgb, var(--interactive) 35%, transparent); }
.search-icon { position: relative; flex: 0 0 14px; width: 14px; height: 14px; margin-left: 12px; border: 2px solid var(--muted); border-radius: 50%; }
.search-icon::after { content: ""; position: absolute; width: 6px; height: 2px; right: -5px; bottom: -3px; border-radius: 2px; background: var(--muted); transform: rotate(45deg); transform-origin: left center; }
.search-control:focus-within .search-icon { border-color: var(--interactive); }
.search-control:focus-within .search-icon::after { background: var(--interactive); }
.pipeline-search {
	min-width: 0;
	flex: 1;
	height: 100%;
	border: 0;
	outline: 0;
	background: transparent;
	color: var(--text);
	padding: 0 11px;
}
.pipeline-search::placeholder { color: var(--dim); }
.search-filter {
	position: relative;
	align-self: stretch;
	flex: 0 0 184px;
	border-left: 1px solid var(--line);
	border-radius: 0 8px 8px 0;
	background: var(--panel-2);
}
.search-filter > summary {
	list-style: none;
	height: 100%;
	display: flex;
	align-items: center;
	gap: 7px;
	padding: 0 10px 0 11px;
	cursor: pointer;
	color: var(--muted);
	white-space: nowrap;
}
.search-filter > summary::-webkit-details-marker { display: none; }
.search-filter > summary::after {
	content: "";
	width: 7px;
	height: 7px;
	margin-left: auto;
	border-right: 1px solid currentColor;
	border-bottom: 1px solid currentColor;
	transform: translateY(-2px) rotate(45deg);
	transition: transform .14s ease;
}
.search-filter[open] > summary { color: var(--interactive); }
.search-filter[open] > summary::after { transform: translateY(2px) rotate(225deg); }
.scope-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.scope-count {
	flex: 0 0 auto;
	min-width: 20px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--interactive) 12%, transparent);
	color: var(--interactive);
	padding: 1px 6px;
	font-size: 10px;
	font-weight: 800;
	line-height: 1.5;
	text-align: center;
}
.search-filter:not([open]) .scope-menu { display: none; }
.scope-menu {
	position: absolute;
	top: calc(100% + 7px);
	right: 0;
	z-index: 60;
	width: 230px;
	border: 1px solid var(--line-strong);
	border-radius: 10px;
	background: #090909;
	box-shadow: 0 18px 50px rgba(0,0,0,.78);
	padding: 6px;
	display: grid;
	gap: 2px;
}
.scope-group { color: var(--dim); padding: 7px 9px 3px; font-size: 9px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
.scope-option {
	width: 100%;
	border: 0;
	border-radius: 7px;
	background: transparent;
	color: var(--text);
	padding: 8px 9px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	cursor: pointer;
	font: inherit;
	text-align: left;
}
.scope-option:hover, .scope-option:focus-visible { outline: 0; background: var(--focus-soft); }
.scope-option[aria-selected="true"] { color: var(--interactive); background: color-mix(in srgb, var(--interactive) 9%, #090909); }
.scope-option .scope-count { background: transparent; color: var(--dim); padding-inline: 0; }
.scope-option[aria-selected="true"] .scope-count { color: var(--interactive); }
.add-change, .icon-button, .change-actions button, .dialog-close, .options-action {
	border: 1px solid var(--line);
	background: var(--panel-2);
	color: var(--text);
	border-radius: 9px;
	padding: 7px 10px;
	cursor: pointer;
	font: inherit;
}
.add-change {
	flex: 0 0 auto;
	height: 38px;
	border-color: var(--logo-blue-hover);
	background: var(--logo-blue-dark);
	color: #fff;
	font-weight: 900;
	white-space: nowrap;
	transition: background .14s ease, border-color .14s ease, transform .14s ease, box-shadow .14s ease;
}
.add-change:hover {
	border-color: var(--interactive-hover);
	background: var(--logo-blue-hover);
	color: #fff;
	transform: translateY(-1px);
	box-shadow: 0 5px 14px rgba(0,0,0,.28);
}
.add-change:active { background: #294a55; transform: translateY(0); box-shadow: none; }
.add-change:focus-visible { outline: 2px solid var(--interactive); outline-offset: 2px; }
.icon-button { width: 38px; height: 38px; padding: 0; display: grid; place-items: center; color: var(--muted); font-size: 17px; }
.icon-button:hover { border-color: var(--interactive-hover); color: var(--interactive-hover); }
.icon-button:focus-visible { border-color: var(--interactive); color: var(--interactive); }
.global-options { position: relative; }
.global-options > summary { list-style: none; }
.global-options > summary::-webkit-details-marker { display: none; }
.options-menu {
	position: absolute;
	right: 0;
	top: calc(100% + 6px);
	z-index: 40;
	width: 190px;
	border: 1px solid var(--line-strong);
	border-radius: 10px;
	background: #0a0a0a;
	box-shadow: 0 16px 40px rgba(0,0,0,.65);
	padding: 6px;
	display: grid;
	gap: 4px;
}
.options-menu button { border: 0; border-radius: 7px; background: transparent; color: var(--text); padding: 8px 9px; text-align: left; cursor: pointer; font: inherit; }
.options-menu button:hover { background: var(--focus-soft); }
.options-menu button.danger { color: var(--check-failed); }
.queue-shell { max-width: 100%; display: grid; gap: 8px; }
.change-card { border: 1px solid var(--line); border-radius: var(--radius); padding: 12px; display: grid; gap: 10px; background: var(--panel); }
.change-card header { display: flex; gap: 8px; justify-content: space-between; align-items: start; }
.change-card h3, .change-card h4 { margin: 0; }
.change-card section { border-left: 2px solid var(--line-strong); padding-left: 9px; display: grid; gap: 4px; }
.change-card p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.change-identity, .change-authority { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.change-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.configuration-panel { border: 0; background: transparent; padding: 0; display: grid; gap: 12px; }
.configuration-status { color: var(--muted); white-space: pre-wrap; }
.configuration-form { display: grid; gap: 12px; }
.config-group { margin: 0; border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 11px; display: grid; gap: 10px; background: #070707; }
.config-group > legend { color: var(--interactive-hover); padding: 0 6px; font-weight: 900; text-transform: uppercase; letter-spacing: .07em; }
.config-group-note, .config-hint { color: var(--muted); font-size: 11px; }
.config-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px 12px; }
.config-control { min-width: 0; display: grid; gap: 4px; }
.config-control > span:first-child { color: var(--text); font-size: 12px; }
.config-control input, .config-control select { width: 100%; min-width: 0; border: 1px solid var(--line); border-radius: 7px; background: #050505; color: var(--text); padding: 7px 8px; }
.config-control input:focus, .config-control select:focus { border-color: var(--interactive); outline: 1px solid color-mix(in srgb, var(--interactive) 45%, transparent); }
.config-control input:disabled, .config-control select:disabled, .config-choice input:disabled + span { color: var(--dim); opacity: .7; }
.config-choice { display: flex; align-items: center; gap: 7px; color: var(--text); font-size: 12px; }
.config-choice input { accent-color: var(--interactive); }
.config-route { border-left: 2px solid var(--interactive); padding-left: 10px; display: grid; gap: 9px; }
.config-route-title { color: var(--interactive-hover); font-weight: 800; }
.config-tools { display: flex; flex-wrap: wrap; gap: 7px 12px; }
.config-actions { position: sticky; bottom: -14px; display: flex; align-items: center; gap: 9px; padding: 10px 0 0; background: linear-gradient(transparent, #0b0b0b 22%); }
.config-save { border-color: var(--logo-blue-hover); background: var(--logo-blue-dark); color: #fff; font-weight: 900; }
.config-save:hover { background: var(--logo-blue-hover); }
.config-validation { color: var(--muted); font-size: 11px; }
.config-validation.error { color: var(--check-failed); }
.dashboard-dialog {
	width: min(720px, calc(100vw - 28px));
	max-height: calc(100vh - 28px);
	border: 1px solid var(--line-strong);
	border-radius: 14px;
	background: #0b0b0b;
	color: var(--text);
	padding: 14px;
	box-shadow: 0 24px 80px rgba(0,0,0,.78);
}
.dashboard-dialog::backdrop { background: rgba(0,0,0,.72); backdrop-filter: blur(2px); }
.dialog-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.dialog-title { font-size: 15px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; }
[hidden] { display: none !important; }
.trace-list {
	max-width: 100%;
	display: grid;
	gap: 8px;
}
.trace {
	position: relative;
	overflow: visible;
	max-width: 100%;
	min-width: 0;
	border: 1px solid var(--line);
	border-radius: var(--radius);
	background: rgba(10,10,10,.96);
	padding: 12px;
	transition: border-color .14s ease, background .14s ease, box-shadow .14s ease;
}
.trace:hover { border-color: color-mix(in srgb, var(--interactive-hover) 55%, var(--line)); background: #101010; }
.trace.selected { border-color: color-mix(in srgb, var(--interactive) 55%, var(--line)); background: #101010; }
.trace:focus { outline: none; }
.trace:focus-visible { outline: 1px solid var(--interactive); outline-offset: 2px; }
.trace:has(.card-options[open]) { z-index: 30; }
.trace-head { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) max-content; gap: 12px; align-items: start; }
.trace-head-actions { display: flex; align-items: center; gap: 4px; }
.trace-title-button {
	min-width: 0;
	border: 0;
	background: transparent;
	color: var(--text);
	padding: 0;
	font: inherit;
	font-weight: 800;
	font-size: 15px;
	text-align: left;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	cursor: pointer;
}
.trace-title-button:hover { color: var(--interactive-hover); }
.card-options { position: relative; }
.card-options > summary {
	list-style: none;
	width: 30px;
	height: 28px;
	border: 1px solid transparent;
	border-radius: 7px;
	color: var(--muted);
	display: grid;
	place-items: center;
	font-size: 20px;
	line-height: 1;
	cursor: pointer;
}
.card-options > summary::-webkit-details-marker { display: none; }
.card-options > summary:hover { border-color: var(--interactive-hover); color: var(--interactive-hover); }
.card-options[open] > summary { border-color: var(--interactive); color: var(--interactive); }
.sprint-actions > summary { border-color: var(--logo-blue-hover); background: var(--logo-blue-dark); color: #fff; font-size: 18px; font-weight: 900; }
.sprint-actions > summary:hover, .sprint-actions[open] > summary { border-color: var(--interactive-hover); background: var(--logo-blue-hover); color: #fff; }
.card-options-panel {
	position: absolute;
	right: 0;
	top: calc(100% + 5px);
	z-index: 50;
	width: min(620px, calc(100vw - 42px));
	border: 1px solid var(--line-strong);
	border-radius: 10px;
	background: #090909;
	box-shadow: 0 18px 50px rgba(0,0,0,.78);
	padding: 10px;
	display: grid;
	gap: 9px;
}
.options-actions { display: flex; flex-wrap: wrap; gap: 7px; }
.options-action:hover { border-color: var(--interactive-hover); }
.trace-now { margin-top: 5px; color: var(--muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.knowledge-topics { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.knowledge-topic { border: 1px solid color-mix(in srgb, var(--interactive) 48%, var(--line)); border-radius: 999px; background: color-mix(in srgb, var(--interactive) 10%, transparent); color: var(--interactive-hover); padding: 2px 7px; font: inherit; font-size: 10px; cursor: pointer; }
.knowledge-topic:hover, .knowledge-topic:focus-visible { border-color: var(--interactive-hover); color: var(--text); outline: none; }
.knowledge-alignment { display: inline-flex; align-items: center; width: max-content; margin-top: 6px; border: 1px solid var(--line); border-radius: 999px; padding: 2px 7px; font-size: 10px; font-weight: 800; }
.knowledge-alignment.aligned { border-color: var(--check-passed); color: var(--check-passed); }
.knowledge-alignment.review_needed { border-color: var(--check-verifying); color: var(--check-verifying); }
.knowledge-alignment.misaligned { border-color: var(--check-failed); color: var(--check-failed); }
.knowledge-alignment.unknown { color: var(--muted); }
.pipeline-rail { min-width: 0; display: flex; align-items: center; gap: 6px; margin-top: 10px; }
.pipeline-segment {
	--stage-color: var(--progress-inactive);
	--segment-progress: 0%;
	position: relative;
	min-width: 0;
	height: 14px;
	flex: 1 1 0;
	border: 1px solid color-mix(in srgb, var(--stage-color) 45%, var(--line));
	border-radius: 5px;
	background: var(--progress-inactive);
	padding: 0;
	font: inherit;
	cursor: pointer;
	overflow: visible;
}
.pipeline-segment::after {
	content: "";
	position: absolute;
	inset: 0 auto 0 0;
	width: var(--segment-progress);
	border-radius: 4px;
	background: var(--stage-color);
	transition: width .18s ease;
}
.pipeline-segment.change { --stage-color: var(--stage-change); }
.pipeline-segment.decision { --stage-color: var(--stage-decision); }
.pipeline-segment.planning { --stage-color: var(--stage-planning); }
.pipeline-segment.implementation { --stage-color: var(--stage-implementation); }
.pipeline-segment.committed { --stage-color: var(--stage-committed); }
.pipeline-segment[aria-disabled="true"] { cursor: default; }
.pipeline-segment:focus-visible { outline: 2px solid var(--stage-color); outline-offset: 2px; }
.segment-label {
	position: absolute;
	left: 50%;
	bottom: calc(100% + 6px);
	z-index: 80;
	transform: translateX(-50%) translateY(2px);
	border: 1px solid var(--stage-color);
	border-radius: 6px;
	background: #050505;
	color: var(--text);
	padding: 3px 6px;
	font-size: 10px;
	font-weight: 800;
	text-transform: uppercase;
	white-space: nowrap;
	opacity: 0;
	pointer-events: none;
	transition: opacity .12s ease, transform .12s ease;
}
.pipeline-segment:hover .segment-label, .pipeline-segment:focus-visible .segment-label { opacity: 1; transform: translateX(-50%) translateY(0); }
.detail.stage-detail { border-color: color-mix(in srgb, var(--detail-stage-color) 62%, var(--line-strong)); box-shadow: inset 0 0 0 1px #000, inset 3px 0 0 var(--detail-stage-color), inset 0 0 24px rgba(0,0,0,.80); }
.detail.stage-change { --detail-stage-color: var(--stage-change); }
.detail.stage-decision { --detail-stage-color: var(--stage-decision); }
.detail.stage-planning { --detail-stage-color: var(--stage-planning); }
.detail.stage-implementation { --detail-stage-color: var(--stage-implementation); }
.detail.stage-committed { --detail-stage-color: var(--stage-committed); }

.worker-strip { margin-top: 8px; color: var(--muted); font-size: 12px; }
.observability-stack { display: grid; gap: 10px; }
.worker-lanes { display: grid; gap: 8px; }
.worker-attempt { border: 1px solid var(--line); border-radius: 6px; padding: 9px 10px; background: color-mix(in srgb, var(--panel) 88%, transparent); }
.worker-attempt-head, .review-row, .narrative-head, .dev-log-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.worker-attempt-title, .narrative-head { color: var(--bright); font-weight: 650; }
.worker-attempt-meta, .review-label, .dev-log-meta { color: var(--muted); font-size: 12px; }
.worker-attempt-status, .narrative-status { text-transform: uppercase; font-size: 11px; letter-spacing: .06em; color: var(--cyan); }
.worker-attempt-detail, .narrative-detail, .narrative-next, .dev-log-summary { margin-top: 5px; color: var(--text); }
.narrative-impact { margin-top: 4px; color: var(--muted); }
.narrative-next { color: var(--yellow); }
.implementation-review { display: grid; gap: 6px; }
.review-value { color: var(--bright); }
.dev-log-list { display: grid; gap: 5px; font-family: var(--mono); font-size: 12px; }
.dev-log-item { border-left: 2px solid var(--line-strong); padding: 4px 8px; }
.load-state { padding: 24px; color: var(--muted); text-align: center; border: 1px dashed var(--line); border-radius: 8px; }
.load-state.failed { color: var(--red); border-color: color-mix(in srgb, var(--red) 55%, var(--line)); }
.detail {
	margin-top: 10px;
	border: 1px solid var(--line-strong);
	border-radius: var(--radius-sm);
	background:
		repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 1px, transparent 1px 5px),
		#020202;
	padding: 10px;
	display: grid;
	gap: 16px;
	animation: detail-open .16s ease-out;
	box-shadow: inset 0 0 0 1px #000, inset 0 0 24px rgba(0,0,0,.80);
}
.detail-tabs {
	display: flex;
	gap: 14px;
	overflow-x: auto;
	padding: 0 0 6px;
	border-bottom: 1px solid var(--line);
	scrollbar-width: none;
}
.detail-tabs::-webkit-scrollbar { display: none; }
.detail-tab {
	flex: 0 0 auto;
	border: 0;
	border-bottom: 1px solid transparent;
	border-radius: 0;
	background: transparent;
	color: var(--muted);
	padding: 2px 0 5px;
	font-size: 11px;
	font-weight: 900;
	letter-spacing: .08em;
	text-transform: uppercase;
	cursor: pointer;
}
.detail-tab::before { content: ">"; color: var(--dim); margin-right: 4px; }
.detail-tab.active {
	border-color: var(--interactive);
	color: var(--text);
}
.detail-tab.active::before { color: var(--interactive); }
.detail-panel { min-width: 0; }
.execution-control {
	display: grid;
	gap: 12px;
	border: 1px solid var(--line);
	border-radius: var(--radius-sm);
	background: #080808;
	padding: 12px;
}
.execution-control-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; }
.execution-control-item { border: 1px dotted rgba(255,255,255,.18); padding: 8px; min-width: 0; }
.execution-control-label { color: var(--dim); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
.execution-control-value { margin-top: 4px; color: var(--text); overflow-wrap: anywhere; }
.execution-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.execution-button {
	border: 1px solid var(--interactive);
	border-radius: 5px;
	background: #0b1717;
	color: var(--text);
	padding: 7px 11px;
	font: inherit;
	font-weight: 800;
	cursor: pointer;
}
.execution-button:hover:not(.stop):not(:disabled) { border-color: var(--interactive-hover); background: color-mix(in srgb, var(--interactive) 10%, #0b1717); }
.execution-button.stop { border-color: var(--danger); background: #1b0d0d; }
.execution-button:disabled { border-color: var(--line); color: var(--dim); background: #080808; cursor: not-allowed; }
.execution-note { color: var(--muted); font-size: 12px; line-height: 1.5; }
.preview-control { display: grid; gap: 10px; }
.preview-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.preview-title { display: flex; align-items: center; gap: 8px; min-width: 0; font-weight: 900; }
.preview-state { color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-size: 11px; }
.preview-state::before { content: ""; display: inline-block; width: 8px; height: 8px; margin-right: 7px; border-radius: 50%; background: var(--dim); box-shadow: 0 0 0 2px rgba(255,255,255,.04); }
.preview-state.ready::before { background: var(--check-passed); }
.preview-state.starting::before { background: var(--decision); }
.preview-state.blocked::before, .preview-state.failed::before { background: var(--danger); }
.preview-url { color: var(--interactive-hover); overflow-wrap: anywhere; }
.preview-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; }
.preview-evidence { display: grid; gap: 8px; }
.preview-evidence-item { border-left: 2px solid var(--stage-implementation); background: #080808; padding: 9px 10px; min-width: 0; }
.preview-evidence-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.preview-evidence-title { color: var(--text); font-weight: 900; }
.preview-evidence-time { color: var(--dim); font-size: 11px; }
.preview-evidence-detail { margin-top: 5px; color: var(--muted); font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }
.preview-evidence-artifacts { display: grid; gap: 4px; margin-top: 7px; }
.preview-evidence-artifact { border: 1px dotted rgba(255,255,255,.18); padding: 6px 7px; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
.preview-log { max-height: 180px; overflow: auto; margin: 0; padding: 10px; background: var(--bg); color: var(--muted); white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: 11px; line-height: 1.5; }
.detail-section {
	border: 1px solid var(--line);
	border-radius: 0;
	background: #040404;
	overflow: hidden;
}
.detail-section[open] { border-color: var(--line-strong); }
.detail-section summary {
	cursor: pointer;
	list-style: none;
	padding: 11px 10px 9px;
	display: flex;
	justify-content: space-between;
	gap: 12px;
	align-items: center;
	font-weight: 900;
	text-transform: uppercase;
	letter-spacing: .06em;
	font-size: 12px;
	background: #0b0b0b;
}
.detail-section summary::-webkit-details-marker { display: none; }
.terminal-heading {
	padding: 11px 10px 9px;
	display: flex;
	justify-content: space-between;
	gap: 12px;
	align-items: center;
	font-weight: 900;
	text-transform: uppercase;
	letter-spacing: .06em;
	font-size: 12px;
	background: #0b0b0b;
	border-bottom: 1px solid var(--line);
}
.terminal-heading span:first-child::before { content: "$ "; color: var(--interactive); }
.section-state { color: var(--muted); font-size: 11px; }
.section-body { padding: 10px; display: grid; gap: 10px; }
.loop-panel { display: grid; gap: 10px; }
.loop-panel .section-body { padding: 0; gap: 28px; }
.loop-panel .terminal-block:first-child { border-top: 0; padding-top: 0; }
.loop-panel .terminal-block + .terminal-block { padding-top: 14px; }
.loop-section.blocked { box-shadow: inset 0 0 0 1px rgba(185,101,93,.2); }
.loop-section.skipped { opacity: .74; }
.terminal-block {
	border-top: 1px dotted rgba(255,255,255,.18);
	padding-top: 8px;
	display: grid;
	gap: 7px;
}
.terminal-block-heading {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	align-items: baseline;
	font-size: 11px;
	font-weight: 900;
	letter-spacing: .08em;
	text-transform: uppercase;
	color: var(--dim);
}
.terminal-block-heading span:first-child::before { content: ":: "; color: var(--interactive); }
details.terminal-block > summary { cursor: pointer; list-style-position: inside; }
details.terminal-block > .terminal-block-body { margin-top: 7px; }
.terminal-block-body { display: grid; gap: 7px; min-width: 0; }
.block-title { display: none; }
.quality-list { display: grid; gap: 12px; }
.quality-layer {
	position: relative;
	display: grid;
	gap: 8px;
	padding-left: 14px;
}
.quality-layer::before {
	content: "";
	position: absolute;
	left: 0;
	top: 2px;
	bottom: 2px;
	width: 2px;
	background: var(--line-strong);
	box-shadow: 0 0 10px rgba(255,247,232,.08);
}
.quality-layer.passed::before { background: var(--check-passed); }
.quality-layer.failed::before { background: var(--check-failed); }
.quality-layer.verifying::before { background: var(--check-verifying); }
.quality-layer.pending::before { background: var(--check-pending); }
.quality-layer.skipped::before { background: var(--dim); }
.quality-layer-head {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	align-items: baseline;
	font-size: 11px;
	letter-spacing: .08em;
	text-transform: uppercase;
	font-weight: 900;
	color: var(--muted);
}
.quality-layer-title { color: var(--text); }
.quality-layer-status { color: var(--dim); white-space: nowrap; }
.quality-layer.passed .quality-layer-status { color: var(--check-passed); }
.quality-layer.failed .quality-layer-status { color: var(--check-failed); }
.quality-layer.verifying .quality-layer-status { color: var(--check-verifying); }
.quality-layer.pending .quality-layer-status { color: var(--check-pending); }
.quality-layer-list { display: grid; gap: 5px; }
.quality-row {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 1.5rem;
	gap: 8px;
	align-items: start;
	color: var(--muted);
	border-bottom: 1px dotted rgba(255,255,255,.12);
	padding-bottom: 4px;
}
.quality-mark { color: var(--muted); font-weight: 900; justify-self: end; }
.quality-row.passed .quality-mark { color: var(--check-passed); }
.quality-row.failed .quality-mark { color: var(--check-failed); }
.quality-row.verifying .quality-mark { color: var(--check-verifying); }
.quality-name { color: var(--text); overflow-wrap: anywhere; }
.quality-type {
	display: inline-block;
	margin-right: 6px;
	color: var(--dim);
	font-size: 10px;
	font-weight: 900;
	letter-spacing: .06em;
	text-transform: uppercase;
}
.quality-type::before { content: "["; color: var(--muted); }
.quality-type::after { content: "]"; color: var(--muted); }
.quality-meta { color: var(--dim); font-size: 11px; margin-top: 2px; overflow-wrap: anywhere; }
.feed { display: grid; gap: 7px; }
.feed-item { border-left: 2px solid var(--line-strong); padding-left: 8px; display: grid; gap: 4px; }
.feed-head { color: var(--text); }
.feed-detail, .feed-feedback, .report-line, .file-line { color: var(--muted); overflow-wrap: anywhere; }
.feed-feedback { color: var(--text); }
.files-grid { display: grid; gap: 7px; }
.file-group { display: grid; gap: 3px; }
.file-group b { color: var(--text); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
.empty {
	border: 1px dashed var(--line);
	border-radius: var(--radius);
	color: var(--muted);
	padding: 22px;
	text-align: center;
}
.footer-help { color: var(--dim); font-size: 12px; text-align: right; }
@keyframes detail-open { from { opacity: .82; } to { opacity: 1; } }
@media (max-width: 980px) {
	.header { grid-template-columns: 88px minmax(0, 1fr); gap: 12px; padding-inline: 12px; }
	.codewiki-logo { width: 88px; }
	.search-filter { flex-basis: 164px; }
	.trace-head { grid-template-columns: minmax(0, 1fr) max-content; }
}
@media (max-width: 560px) {
	#app { padding: 8px; }
	.header { grid-template-columns: 62px minmax(0, 1fr); gap: 8px; padding: 8px; }
	.codewiki-logo { width: 62px; }
	.repo-label { display: none; }
	.header-dashboard { gap: 6px; }
	.search-control { height: 36px; }
	.search-icon { display: none; }
	.pipeline-search { padding-inline: 9px; }
	.search-filter { flex-basis: 62px; }
	.search-filter > summary { gap: 4px; padding-inline: 7px; }
	.search-filter .scope-label { display: none; }
	.scope-menu { width: min(220px, calc(100vw - 34px)); }
	.add-change { height: 36px; padding-inline: 8px; }
	.icon-button { width: 36px; height: 36px; }
	.trace { padding: 9px; }
	.trace-title-button, .trace-now { white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
	.trace-title-button { -webkit-line-clamp: 2; }
	.trace-now { -webkit-line-clamp: 2; line-height: 1.35; }
	.pipeline-rail { gap: 4px; }
	.pipeline-segment { height: 12px; }
	.config-grid { grid-template-columns: 1fr; }
	.card-options-panel { width: calc(100vw - 34px); }
	.kv { grid-template-columns: 1fr; gap: 3px; }
	.footer-help { text-align: center; font-size: 11px; }
}
</style>
</head>
<body>
<div id="app">
	<div class="shell">
		<header class="header">
			<div class="brand">
				<div class="brand-copy"><img class="codewiki-logo" src="${CODEWIKI_LOGO_DATA_URI}" alt="CodeWiki" width="517" height="338" /><div class="repo-label">Repo: <span id="project" class="project">codewiki</span></div></div>
			</div>
			<div class="header-dashboard">
				<div class="search-control">
					<span class="search-icon" aria-hidden="true"></span>
					<input id="search" class="pipeline-search" aria-label="Search pipeline" placeholder="Search all work…" autocomplete="off" />
					<details id="search-filter" class="search-filter">
						<summary aria-label="Filter search scope" title="Filter: All"><span id="scope-label" class="scope-label">All work</span><span id="scope-count" class="scope-count">0</span></summary>
						<div id="scope-menu" class="scope-menu" role="listbox" aria-label="Pipeline scope"></div>
					</details>
				</div>
				<button id="draft-change" class="add-change" type="button">Add Change</button>
				<button id="open-configuration" class="icon-button" type="button" aria-label="Dashboard settings" title="Dashboard settings">⚙</button>
			</div>
		</header>
		<main class="queue-shell">
			<div class="trace-list" id="queue"><div class="load-state">Loading CodeWiki pipeline state…</div></div>
			<div class="footer-help">j/k move · enter overview · / search · r refresh · generated <span id="clock">loading…</span> · <span id="status">connecting</span></div>
		</main>
		<dialog id="configuration-dialog" class="dashboard-dialog">
			<div class="dialog-head"><div class="dialog-title">Configuration</div><button id="close-configuration" class="dialog-close" type="button">Close</button></div>
			<div class="configuration-panel" id="configuration"><div class="load-state">Loading execution configuration…</div></div>
		</dialog>
	</div>
</div>
<script>
const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get('token');
if (fragmentToken) sessionStorage.setItem('codewiki.dashboard.token', fragmentToken);
const token = fragmentToken || sessionStorage.getItem('codewiki.dashboard.token') || '';
const dashboardAssetDigest = '__CODEWIKI_ASSET_DIGEST__';
const dashboardDevMode = new URLSearchParams(window.location.search).get('dev') === '1';
if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
let state = null;
let loading = false;
let dashboardStopped = false;
let eventStream = null;
let selected = 0;
let expandedEntryId = null;
let query = '';
let filter = 'all';
const detailTabs = new Map();
const PIPELINE_STAGE_ORDER = { implementation: 0, planning: 1, decision: 2, change: 3, committed: 4 };
const els = {
	project: document.getElementById('project'),
	clock: document.getElementById('clock'),
	status: document.getElementById('status'),
	queue: document.getElementById('queue'),
	configuration: document.getElementById('configuration'),
	configurationDialog: document.getElementById('configuration-dialog'),
	search: document.getElementById('search'),
	searchFilter: document.getElementById('search-filter'),
	scopeLabel: document.getElementById('scope-label'),
	scopeCount: document.getElementById('scope-count'),
	scopeMenu: document.getElementById('scope-menu'),
	openConfiguration: document.getElementById('open-configuration'),
	closeConfiguration: document.getElementById('close-configuration'),
	draftChange: document.getElementById('draft-change'),
};
function text(node, value) { node.textContent = value == null ? '' : String(value); }
function isBacklogChange(card) { return card.identity.status === 'pending' || card.identity.status === 'deferred'; }
function pipelineEntries() {
	const traces = state?.sprintsQueue || [];
	const linkedChangeIds = new Set(traces.flatMap(function(trace) { return trace.changeIds || []; }));
	const changes = (state?.changes?.records || []).filter(function(card) {
		return !linkedChangeIds.has(card.identity.changeId) && (isBacklogChange(card) || card.identity.status === 'accepted');
	});
	const entries = changes.map(function(card, index) {
		const stage = card.identity.status === 'accepted' ? 'decision' : 'change';
		return {
			kind: 'change', id: 'change:' + card.identity.changeId, stage: stage, card: card, sourceIndex: index,
			blocked: false,
			searchText: [card.identity.changeId, card.question, card.identity.status, card.identity.validationState, card.sections.currentState.text, card.sections.proposedChange.text].join(' ').toLowerCase(),
		};
	}).concat(traces.map(function(trace, index) {
		const stage = trace.stage || (trace.committed ? 'committed' : trace.loop === 'archived' ? 'committed' : trace.loop);
		const topicMetadata = trace.sprintPlan?.knowledgeTopics || [];
		const topics = topicMetadata.map(function(topic) { return topic.ref; });
		return {
			kind: 'trace', id: 'trace:' + trace.traceId, stage: stage, trace: trace, sourceIndex: index,
			blocked: trace.blockerCount > 0 || trace.loop === 'blocked', topics: topics,
			searchText: [trace.traceId, trace.title, trace.status, stage, trace.currentAction, trace.knowledgeAlignment?.label].concat(trace.pathScopes || [], topics, topicMetadata.map(knowledgeTopicLabel)).join(' ').toLowerCase(),
		};
	}));
	const q = query.trim().toLowerCase();
	return entries.filter(function(entry) {
		const topicFilter = filter.startsWith('topic:');
		if (topicFilter && (entry.kind !== 'trace' || !entry.topics.includes(filter.slice(6)))) return false;
		if (!topicFilter && filter === 'backlog' && (entry.kind !== 'change' || !isBacklogChange(entry.card))) return false;
		if (!topicFilter && filter === 'blocked' && !entry.blocked) return false;
		if (!topicFilter && filter !== 'all' && filter !== 'backlog' && filter !== 'blocked' && entry.stage !== filter) return false;
		return !q || entry.searchText.includes(q);
	}).sort(function(left, right) {
		if (left.blocked !== right.blocked) return left.blocked ? -1 : 1;
		return (PIPELINE_STAGE_ORDER[left.stage] ?? 9) - (PIPELINE_STAGE_ORDER[right.stage] ?? 9) || left.sourceIndex - right.sourceIndex;
	});
}
function render() {
	if (!state || dashboardStopped) return;
	const entries = pipelineEntries();
	selected = Math.max(0, Math.min(selected, Math.max(0, entries.length - 1)));
	if (expandedEntryId && !entries.some(function(entry) { return entry.id === expandedEntryId; })) expandedEntryId = null;
	text(els.project, state.projectName || 'CodeWiki');
	text(els.clock, state.generatedAt || new Date().toISOString());
	text(els.status, 'live');
	renderSearchFilter();
	renderPipeline(entries);
	if (els.configurationDialog.open) renderConfiguration();
}
function renderSearchFilter() {
	const topicCounts = new Map();
	(state.sprintsQueue || []).forEach(function(trace) {
		(trace.sprintPlan?.knowledgeTopics || []).forEach(function(topic) {
			const current = topicCounts.get(topic.ref);
			topicCounts.set(topic.ref, { topic: topic, count: (current?.count || 0) + 1 });
		});
	});
	const topicScopes = Array.from(topicCounts.values()).sort(function(left, right) {
		return left.topic.category.localeCompare(right.topic.category) || left.topic.label.localeCompare(right.topic.label);
	}).map(function(entry) {
		return { key: 'topic:' + entry.topic.ref, label: entry.topic.label, value: entry.count, group: titleCase(entry.topic.category) };
	});
	const scopes = [
		{ key: 'all', label: 'All work', value: state.summary.pipeline, group: 'Lifecycle' },
		{ key: 'backlog', label: 'Changes Backlog', value: state.summary.backlog, group: 'Lifecycle' },
		{ key: 'decision', label: 'Decision', value: state.summary.decision, group: 'Lifecycle' },
		{ key: 'planning', label: 'Planning', value: state.summary.planning, group: 'Lifecycle' },
		{ key: 'implementation', label: 'Implementation', value: state.summary.implementation, group: 'Lifecycle' },
		{ key: 'committed', label: 'Committed', value: state.summary.committed, group: 'Lifecycle' },
		{ key: 'blocked', label: 'Blocked', value: state.summary.blocked, group: 'Lifecycle' },
	].concat(topicScopes);
	const active = scopes.find(function(scope) { return scope.key === filter; }) || scopes[0];
	text(els.scopeLabel, active.label);
	text(els.scopeCount, active.value);
	els.searchFilter.querySelector('summary').title = 'Filter: ' + active.label;
	els.search.placeholder = 'Search ' + active.label.toLowerCase() + '…';
	const signature = filter + '|' + scopes.map(function(scope) { return scope.key + ':' + scope.value; }).join('|');
	if (els.scopeMenu.dataset.signature === signature) return;
	els.scopeMenu.dataset.signature = signature;
	els.scopeMenu.innerHTML = '';
	let previousGroup = '';
	scopes.forEach(function(scope) {
		if (scope.group !== previousGroup) {
			const heading = document.createElement('div'); heading.className = 'scope-group'; heading.setAttribute('role', 'presentation'); text(heading, scope.group); els.scopeMenu.append(heading); previousGroup = scope.group;
		}
		const option = document.createElement('button'); option.type = 'button'; option.className = 'scope-option'; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', String(scope.key === filter));
		const label = document.createElement('span'); text(label, scope.label);
		const count = document.createElement('span'); count.className = 'scope-count'; text(count, scope.value);
		option.append(label, count);
		option.onclick = function() { filter = scope.key; selected = 0; els.searchFilter.open = false; render(); openSearch(); };
		els.scopeMenu.append(option);
	});
}
function knowledgeTopicLabel(topic) {
	return titleCase(topic.category) + ' · ' + topic.label;
}
function badgeClass(value) { return String(value || '').replace(/[^a-z0-9_-]/gi, ''); }
function isInteractiveDashboardTarget(target) {
	return target instanceof Element && Boolean(target.closest('button, input, select, textarea, a, summary, [contenteditable="true"]'));
}
function focusSelectedPipelineCard() {
	const row = els.queue.querySelector('.trace.selected');
	if (!row) return;
	row.focus({ preventScroll: true });
	row.scrollIntoView({ block: 'nearest' });
}
function preparePipelineCard(row, entry, index) {
	row.className = 'trace' + (index === selected ? ' selected' : '');
	row.tabIndex = 0;
	row.setAttribute('aria-expanded', String(expandedEntryId === entry.id));
	row.onkeydown = function(event) {
		if (event.target !== row || (event.key !== 'Enter' && event.key !== ' ')) return;
		event.preventDefault();
		openEntryOverview(entry, index);
	};
}
function renderPipeline(entries) {
	els.queue.innerHTML = '';
	if (!entries.length) { els.queue.innerHTML = '<div class="empty">No matching pipeline work found.</div>'; return; }
	entries.forEach(function(entry, index) {
		els.queue.append(entry.kind === 'trace' ? renderTracePipelineCard(entry, index) : renderChangePipelineCard(entry, index));
	});
}
function renderTracePipelineCard(entry, index) {
	const trace = entry.trace;
	const row = document.createElement('article');
	preparePipelineCard(row, entry, index);
	const head = document.createElement('div'); head.className = 'trace-head';
	const title = document.createElement('button'); title.type = 'button'; title.className = 'trace-title-button'; text(title, trace.title && trace.title !== trace.traceId ? trace.title : 'Untitled Change');
	title.onclick = function() { openEntryOverview(entry, index); };
	const headActions = document.createElement('div'); headActions.className = 'trace-head-actions'; headActions.append(renderTraceOptions(entry, index));
	head.append(title, headActions); row.append(head);
	const now = document.createElement('div'); now.className = 'trace-now'; text(now, traceStateText(entry)); row.append(now);
	if (trace.sprintPlan?.knowledgeTopics?.length) row.append(renderKnowledgeTopics(trace.sprintPlan.knowledgeTopics));
	row.append(renderKnowledgeAlignment(trace.knowledgeAlignment));
	row.append(renderPipelineRail(trace.segments || [], entry, index));
	if (expandedEntryId === entry.id) row.append(renderDetail(trace));
	return row;
}
function renderChangePipelineCard(entry, index) {
	const card = entry.card;
	const row = document.createElement('article');
	preparePipelineCard(row, entry, index);
	const head = document.createElement('div'); head.className = 'trace-head';
	const title = document.createElement('button'); title.type = 'button'; title.className = 'trace-title-button'; text(title, card.question || card.identity.changeId);
	title.onclick = function() { openEntryOverview(entry, index); };
	head.append(title, renderChangeOptions(card)); row.append(head);
	const now = document.createElement('div'); now.className = 'trace-now'; text(now, 'Change — ' + changeCurrentAction(card)); row.append(now);
	row.append(renderPipelineRail(changePipelineSegments(entry.stage, card), entry, index));
	if (expandedEntryId === entry.id) row.append(renderChangeDetail(card));
	return row;
}
function renderKnowledgeTopics(topics) {
	const wrap = document.createElement('div'); wrap.className = 'knowledge-topics'; wrap.setAttribute('aria-label', 'Change Knowledge topics');
	topics.forEach(function(topic) {
		const button = document.createElement('button'); button.type = 'button'; button.className = 'knowledge-topic'; button.title = topic.ref; text(button, knowledgeTopicLabel(topic));
		button.onclick = function(event) { event.preventDefault(); event.stopPropagation(); filter = 'topic:' + topic.ref; selected = 0; render(); };
		wrap.append(button);
	});
	return wrap;
}
function renderKnowledgeAlignment(alignment) {
	const badge = document.createElement('span'); badge.className = 'knowledge-alignment ' + badgeClass(alignment?.state || 'unknown');
	badge.title = alignment?.rationale || 'Alignment evidence is unavailable.';
	text(badge, alignment?.label || 'Unknown'); return badge;
}
function openEntryOverview(entry, index) {
	selected = index;
	expandedEntryId = expandedEntryId === entry.id ? null : entry.id;
	if (entry.kind === 'trace') detailTabs.set(entry.trace.traceId, 'overview');
	render();
	focusSelectedPipelineCard();
}
async function executePreviewAction(action, binding, preview) {
	if (!binding) return;
	const command = {
		action: action,
		targetId: binding.targetId,
		expectedTargetDigest: preview?.targetDigest || binding.targetDigest,
		expectedProfileDigest: preview?.profileDigest || binding.profileDigest,
	};
	text(els.status, 'preview ' + action + ' pending');
	try {
		const response = await fetch('/api/previews/commands?token=' + encodeURIComponent(token), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(command),
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || 'HTTP ' + response.status);
		state.previews = result;
		text(els.status, 'preview ' + action + ' completed');
		await load();
	} catch (error) {
		text(els.status, 'preview ' + action + ' rejected · ' + (error && error.message ? error.message : String(error)));
		await load();
	}
}
function renderTraceOptions(entry, index) {
	const details = document.createElement('details'); details.className = 'card-options';
	const summary = document.createElement('summary'); summary.setAttribute('aria-label', 'Trace options'); summary.title = 'Trace options'; text(summary, '⋮');
	const panel = document.createElement('div'); panel.className = 'card-options-panel';
	const actions = document.createElement('div'); actions.className = 'options-actions';
	const overview = document.createElement('button'); overview.type = 'button'; overview.className = 'options-action'; text(overview, 'Open overview'); overview.onclick = function() { details.open = false; openEntryOverview(entry, index); };
	const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'options-action'; text(copy, 'Copy trace ID'); copy.onclick = function() { void copyText(entry.trace.traceId); };
	actions.append(overview, copy);
	panel.append(actions);
	details.append(summary, panel);
	return details;
}
function renderChangeOptions(card) {
	const details = document.createElement('details'); details.className = 'card-options';
	const summary = document.createElement('summary'); summary.setAttribute('aria-label', 'Change options'); summary.title = 'Change options'; text(summary, '⋮');
	const panel = document.createElement('div'); panel.className = 'card-options-panel';
	const identity = document.createElement('div'); identity.className = 'change-identity'; text(identity, card.identity.changeId + ' · revision ' + card.identity.revision + ' · ' + card.identity.validationState);
	const actions = document.createElement('div'); actions.className = 'change-actions';
	if (card.identity.status === 'pending') actions.append(changeActionButton('Revise', function() { executeChangeCommand('revise', card); }));
	if (card.identity.status !== 'accepted' && card.identity.status !== 'withdrawn') actions.append(changeActionButton('Validate', function() { executeChangeCommand('validate', card); }));
	if (card.identity.status === 'pending' || card.identity.status === 'deferred') actions.append(changeActionButton('Withdraw', function() { executeChangeCommand('withdraw', card); }));
	panel.append(identity, actions); details.append(summary, panel); return details;
}
async function copyText(value) {
	try { await navigator.clipboard.writeText(value); text(els.status, 'copied'); }
	catch { window.prompt('Copy value:', value); }
}
function traceStateText(entry) {
	const trace = entry.trace;
	const facts = [];
	if (trace.workerCount) facts.push(trace.workerCount + ' ' + pluralLabel(trace.workerCount, 'worker'));
	const taskCount = (trace.items || []).length;
	if (taskCount) facts.push(taskCount + ' ' + pluralLabel(taskCount, 'Work Item'));
	const action = entry.blocked
		? '✕ Blocked — ' + ((trace.blockers || [])[0] || trace.currentAction)
		: titleCase(entry.stage) + ' — ' + trace.currentAction;
	return action + (facts.length ? ' · ' + facts.join(' · ') : '');
}
function changeCurrentAction(card) {
	if (card.identity.status === 'accepted') return 'Change approved; waiting for Planning coverage.';
	if (card.identity.validationState === 'valid') return 'Validated proposal awaiting explicit Decision approval.';
	if (card.identity.validationState === 'stale') return 'Proposal changed; validate current revision.';
	if (card.identity.status === 'deferred') return 'Deferred in Changes Backlog.';
	return 'Refine and validate proposed Change.';
}
function changePipelineSegments(stage, card) {
	const changeProgress = card.identity.validationState === 'valid' ? 0.85 : card.identity.validationState === 'stale' ? 0.4 : 0.2;
	return [
		{ phase: 'change', label: 'Change', state: stage === 'change' ? 'active' : 'done', progress: stage === 'change' ? changeProgress : 1 },
		{ phase: 'decision', label: 'Decision', state: stage === 'decision' ? 'active' : 'todo', progress: stage === 'decision' ? 0.2 : 0 },
		{ phase: 'planning', label: 'Planning', state: 'todo', progress: 0 },
		{ phase: 'implementation', label: 'Implementation', state: 'todo', progress: 0 },
		{ phase: 'committed', label: 'Committed', state: 'todo', progress: 0 },
	];
}
function renderPipelineRail(segments, entry, index) {
	const rail = document.createElement('div'); rail.className = 'pipeline-rail'; rail.setAttribute('aria-label', 'Five-stage Change journey progress');
	segments.forEach(function(segment) {
		const node = document.createElement('button'); node.type = 'button'; node.className = 'pipeline-segment ' + badgeClass(segment.phase) + ' ' + badgeClass(segment.state);
		const progress = Math.max(0, Math.min(1, Number.isFinite(segment.progress) ? segment.progress : segment.state === 'done' ? 1 : 0));
		const percentage = Math.round(progress * 100);
		node.style.setProperty('--segment-progress', percentage + '%');
		node.setAttribute('aria-disabled', String(segment.state === 'todo'));
		node.setAttribute('aria-label', segment.label + ' · ' + percentage + '% complete · ' + segment.state);
		const label = document.createElement('span'); label.className = 'segment-label'; label.setAttribute('aria-hidden', 'true'); text(label, segment.label + ' · ' + percentage + '%');
		node.append(label); node.title = segment.label + ' · ' + percentage + '% complete';
		node.onclick = function(event) {
			event.stopPropagation();
			if (segment.state !== 'todo') openPipelineStage(entry, segment.phase, index);
		};
		rail.append(node);
	});
	return rail;
}
function openPipelineStage(entry, phase, index) {
	selected = index;
	expandedEntryId = entry.id;
	if (entry.kind === 'trace') detailTabs.set(entry.trace.traceId, phase);
	render();
	focusSelectedPipelineCard();
}
function pluralLabel(count, singular) { return count === 1 ? singular : singular + 's'; }
function renderChangeDetail(card) {
	const node = document.createElement('div'); node.className = 'detail stage-detail stage-change change-card';
	const identity = document.createElement('div'); identity.className = 'change-identity'; text(identity, 'revision ' + card.identity.revision + ' · record ' + card.identity.recordRevision + ' · ' + card.identity.status + ' · ' + card.identity.validationState); node.append(identity);
	node.append(changeSection('Current state', [card.sections.currentState.text]));
	node.append(changeSection('Proposed change', [card.sections.proposedChange.text, 'Rationale: ' + card.sections.proposedChange.rationale]));
	const opinion = [];
	(card.sections.agentOpinion.assessments || []).forEach(function(item) { opinion.push(item.actor + ' · ' + item.stance + ': ' + item.rationale); });
	(card.sections.agentOpinion.recommendations || []).forEach(function(item) { opinion.push(item.actor + ' recommends ' + item.value + ': ' + item.rationale); });
	(card.sections.agentOpinion.concerns || []).forEach(function(item) { opinion.push('Concern: ' + item); });
	node.append(changeSection('Agent opinion', opinion.length ? opinion : ['No agent assessment recorded.']));
	const actions = document.createElement('div'); actions.className = 'change-actions';
	if (card.identity.status === 'pending') actions.append(changeActionButton('Revise', function() { executeChangeCommand('revise', card); }));
	if (card.identity.status !== 'accepted' && card.identity.status !== 'withdrawn') actions.append(changeActionButton('Validate', function() { executeChangeCommand('validate', card); }));
	if (card.identity.status === 'pending' || card.identity.status === 'deferred') actions.append(changeActionButton('Withdraw', function() { executeChangeCommand('withdraw', card); }));
	node.append(actions);
	return node;
}
function changeSection(titleValue, values) {
	const sectionNode = document.createElement('section');
	const heading = document.createElement('h4'); text(heading, titleValue); sectionNode.append(heading);
	values.forEach(function(value) { const paragraph = document.createElement('p'); text(paragraph, value); sectionNode.append(paragraph); });
	return sectionNode;
}
function changeActionButton(label, handler) {
	const button = document.createElement('button'); button.type = 'button'; text(button, label); button.onclick = handler; return button;
}
async function executeChangeCommand(action, card) {
	const changes = state && state.changes;
	if (!changes) return;
	const command = {
		action: action,
		commandId: 'dashboard-change-' + crypto.randomUUID(),
		expectedStateDigest: changes.stateDigest,
		expectedHead: changes.head,
	};
	if (card) {
		command.changeId = card.identity.changeId;
		command.expectedRecordRevision = card.identity.recordRevision;
	}
	if (action === 'draft' || action === 'revise') {
		const raw = window.prompt(action === 'draft' ? 'Paste exact canonical Change JSON for a pending draft.' : 'Paste exact complete revised Change JSON.');
		if (!raw) return;
		try { command.change = JSON.parse(raw); } catch { text(els.status, 'invalid Change JSON'); return; }
	}
	if (action === 'withdraw') {
		const reason = window.prompt('Reason for withdrawal:');
		if (!reason) return;
		command.reason = reason;
	}
	text(els.status, 'change command pending');
	try {
		const response = await fetch('/api/changes/commands?token=' + encodeURIComponent(token), {
			method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || 'HTTP ' + response.status);
		state.changes = result.state;
		text(els.status, 'completed · ' + result.receipt.receiptId);
		render();
	} catch (error) {
		text(els.status, 'rejected · ' + (error && error.message ? error.message : String(error)));
		await load();
	}
}
const CONFIG_BUDGET_FIELDS = [
	['maxSeconds', 'Maximum seconds'],
	['maxIterations', 'Maximum iterations'],
	['maxChangedFiles', 'Maximum changed files'],
	['maxTraceBytes', 'Maximum trace bytes'],
	['maxTokens', 'Maximum tokens'],
	['maxCostUsd', 'Maximum cost (USD)'],
	['maxLatencyMs', 'Maximum latency (ms)'],
];
function renderConfiguration() {
	els.configuration.innerHTML = '';
	const configuration = state && state.configuration;
	if (!configuration) { const empty = document.createElement('div'); empty.className = 'empty'; text(empty, 'Execution configuration is unavailable.'); els.configuration.append(empty); return; }
	const heading = document.createElement('h3'); text(heading, 'Execution configuration');
	const status = document.createElement('div'); status.className = 'configuration-status';
	text(status, 'Source: ' + configuration.sourcePath + '\nDigest: ' + configuration.configDigest + '\nValidation: ' + configuration.validation + '\n' + configuration.restartGuidance);
	const form = document.createElement('form'); form.className = 'configuration-form'; form.id = 'configuration-form'; form.onsubmit = executeConfigCommand;
	form.append(renderExecutionConfigGroup(configuration), renderBudgetConfigGroup(configuration), renderModelConfigGroup(configuration), renderHostConfigGroup(configuration), renderPreviewConfigGroup(configuration));
	const actions = document.createElement('div'); actions.className = 'config-actions';
	const save = document.createElement('button'); save.type = 'submit'; save.className = 'options-action config-save'; text(save, 'Save configuration');
	const validation = document.createElement('span'); validation.id = 'config-validation'; validation.className = 'config-validation'; text(validation, 'Changes stay below active authority ceilings and require a full Pi restart when execution policy changes.');
	actions.append(save, validation); form.append(actions);
	const note = document.createElement('div'); note.className = 'change-authority'; text(note, 'Approval, stop-condition, credential, publication, controller, and semantic authority settings are not editable here.');
	els.configuration.append(heading, status, form, note);
}
function configGroup(titleValue, noteValue) {
	const group = document.createElement('fieldset'); group.className = 'config-group';
	const legend = document.createElement('legend'); text(legend, titleValue); group.append(legend);
	if (noteValue) { const note = document.createElement('div'); note.className = 'config-group-note'; text(note, noteValue); group.append(note); }
	return group;
}
function configGrid() { const grid = document.createElement('div'); grid.className = 'config-grid'; return grid; }
function renderPreviewConfigGroup(configuration) {
	const group = configGroup('Live Preview profiles', 'Profiles are file/API configuration. Planning must freeze exact profile and canonical UI-target digests before execution.');
	const profiles = configuration.previewProfiles || [];
	if (!profiles.length) { const empty = document.createElement('div'); empty.className = 'config-group-note'; text(empty, 'No preview profiles configured.'); group.append(empty); }
	profiles.forEach(function(profile) {
		const card = document.createElement('section'); card.className = 'execution-control';
		const title = document.createElement('div'); title.className = 'preview-title'; text(title, profile.id + ' · ' + profile.runner.kind + ':' + profile.runner.script);
		const grid = document.createElement('div'); grid.className = 'execution-control-grid';
		[
			['URL', profile.url + profile.readyPath],
			['browser', profile.browser],
			['auto open', profile.autoOpen ? 'enabled' : 'disabled'],
			['digest', profile.digest],
		].forEach(function(entry) {
			const item = document.createElement('div'); item.className = 'execution-control-item';
			const label = document.createElement('div'); label.className = 'execution-control-label'; text(label, entry[0]);
			const value = document.createElement('div'); value.className = 'execution-control-value'; text(value, entry[1]);
			item.append(label, value); grid.append(item);
		});
		card.append(title, grid); group.append(card);
	});
	const targets = configuration.uiPreviewTargets || [];
	if (!targets.length) { const empty = document.createElement('div'); empty.className = 'config-group-note'; text(empty, 'No canonical UI preview targets configured.'); group.append(empty); }
	targets.forEach(function(target) {
		const card = document.createElement('section'); card.className = 'execution-control';
		const title = document.createElement('div'); title.className = 'preview-title'; text(title, target.uiRef + ' · ' + target.id);
		const grid = document.createElement('div'); grid.className = 'execution-control-grid';
		[
			['profile', target.profileId],
			['route', target.route],
			['viewports', (target.viewports || []).join(', ')],
			['scenario', target.scenario || 'default'],
			['digest', target.digest],
		].forEach(function(entry) {
			const item = document.createElement('div'); item.className = 'execution-control-item';
			const label = document.createElement('div'); label.className = 'execution-control-label'; text(label, entry[0]);
			const value = document.createElement('div'); value.className = 'execution-control-value'; text(value, entry[1]);
			item.append(label, value); grid.append(item);
		});
		card.append(title, grid); group.append(card);
	});
	return group;
}
function configControl(labelValue, input, hintValue) {
	const label = document.createElement('label'); label.className = 'config-control';
	const caption = document.createElement('span'); text(caption, labelValue); label.append(caption, input);
	if (hintValue) { const hint = document.createElement('span'); hint.className = 'config-hint'; text(hint, hintValue); label.append(hint); }
	return label;
}
function configNumberInput(id, value, minimum, maximum, step) {
	const input = document.createElement('input'); input.id = id; input.type = 'number'; input.min = String(minimum); input.max = String(maximum); input.step = String(step || 1);
	if (value !== undefined && value !== null) input.value = String(value);
	return input;
}
function configTextInput(id, value) {
	const input = document.createElement('input'); input.id = id; input.type = 'text'; input.maxLength = 160; input.value = value || ''; return input;
}
function configSelect(id, value, options) {
	const select = document.createElement('select'); select.id = id;
	options.forEach(function(optionValue) {
		const option = document.createElement('option'); option.value = optionValue.value || optionValue; text(option, optionValue.label || titleCase(optionValue.value || optionValue)); option.disabled = Boolean(optionValue.disabled); select.append(option);
	});
	select.value = value; return select;
}
function renderExecutionConfigGroup(configuration) {
	const editable = configuration.editable.runtime;
	const limits = configuration.limits;
	const group = configGroup('Execution', 'Effective worker, isolation, automation, and agency policy. Choices above the active runtime ceiling are disabled.');
	const grid = configGrid();
	grid.append(
		configControl('Maximum workers', configNumberInput('config-max-workers', editable.maxWorkers, 0, limits.maxWorkers, 1), 'Active maximum: ' + limits.maxWorkers),
		configControl('Worktree isolation', configSelect('config-worktree-isolation', editable.worktreeIsolation, ['none', 'worktree', 'auto'])),
		configControl('Automation', configSelect('config-automation', editable.automation, rankedConfigOptions(['manual', 'assist', 'auto'], limits.automationCeiling, false)), 'Ceiling: ' + limits.automationCeiling),
		configControl('Agency', configSelect('config-agency', editable.agency, rankedConfigOptions(['observe', 'assist', 'delegate', 'auto'], limits.agencyCeiling, false)), 'Ceiling: ' + limits.agencyCeiling),
	);
	group.append(grid); return group;
}
function renderBudgetConfigGroup(configuration) {
	const group = configGroup('Budgets', 'Empty optional values remain unchanged. Every value is checked again by the server.');
	const grid = configGrid();
	CONFIG_BUDGET_FIELDS.forEach(function(field) {
		const key = field[0]; const maximum = configuration.limits.budgetMaxima[key]; const step = key === 'maxCostUsd' ? 0.000001 : 1;
		grid.append(configControl(field[1], configNumberInput('config-budget-' + key, configuration.editable.runtime.budgets[key], 0, maximum, step), 'Maximum: ' + maximum));
	});
	group.append(grid); return group;
}
function renderModelConfigGroup(configuration) {
	const routing = configuration.editable.runtime.modelRouting;
	const limits = configuration.limits;
	const group = configGroup('Model routing', 'Edit existing bounded routes. Tool choices are limited to authority already present when this Pi runtime started.');
	const grid = configGrid();
	grid.append(
		configControl('Quality floor', configSelect('config-quality-floor', routing.qualityFloor, rankedConfigOptions(['standard', 'high', 'critical'], limits.minimumQualityFloor, true)), 'Minimum: ' + limits.minimumQualityFloor),
		configControl('Maximum escalations', configNumberInput('config-max-escalations', routing.maxEscalations, 0, limits.modelMaxima.maxEscalations, 1)),
		configControl('Estimated input tokens', configNumberInput('config-estimated-input', routing.estimatedInputTokens, 0, limits.modelMaxima.maxEstimatedTokens, 1)),
		configControl('Estimated output tokens', configNumberInput('config-estimated-output', routing.estimatedOutputTokens, 0, limits.modelMaxima.maxEstimatedTokens, 1)),
	);
	group.append(grid);
	(routing.routes || []).forEach(function(route, routeIndex) { group.append(renderModelRoute(route, routeIndex, limits.allowedTools, limits.modelMaxima)); });
	if (!(routing.routes || []).length) { const empty = document.createElement('div'); empty.className = 'config-group-note'; text(empty, 'No model routes configured. Route creation remains a file/API operation.'); group.append(empty); }
	return group;
}
function renderModelRoute(route, routeIndex, allowedTools, modelMaxima) {
	const routeNode = document.createElement('section'); routeNode.className = 'config-route'; routeNode.dataset.routeIndex = String(routeIndex);
	const titleNode = document.createElement('div'); titleNode.className = 'config-route-title'; text(titleNode, 'Route ' + (routeIndex + 1) + ' · ' + route.id); routeNode.append(titleNode);
	const grid = configGrid();
	grid.append(
		configControl('Route id', configTextInput('config-route-' + routeIndex + '-id', route.id)),
		configControl('Provider', configTextInput('config-route-' + routeIndex + '-provider', route.provider)),
		configControl('Model', configTextInput('config-route-' + routeIndex + '-model', route.model)),
		configControl('Thinking', configSelect('config-route-' + routeIndex + '-thinking', route.thinking, ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])),
		configControl('Quality', configSelect('config-route-' + routeIndex + '-quality', route.quality, ['standard', 'high', 'critical'])),
		configControl('Latency', configSelect('config-route-' + routeIndex + '-latency', route.latency, ['fast', 'balanced', 'slow'])),
		configControl('Timeout (ms)', configNumberInput('config-route-' + routeIndex + '-timeout', route.timeoutMs, 1, modelMaxima.maxRouteTimeoutMs, 1)),
		configControl('Input USD / million', configNumberInput('config-route-' + routeIndex + '-price-input', route.pricing.inputUsdPerMillion, 0, modelMaxima.maxPricingUsdPerMillion, 0.000001)),
		configControl('Output USD / million', configNumberInput('config-route-' + routeIndex + '-price-output', route.pricing.outputUsdPerMillion, 0, modelMaxima.maxPricingUsdPerMillion, 0.000001)),
		configControl('Cache read USD / million', configNumberInput('config-route-' + routeIndex + '-price-cache-read', route.pricing.cacheReadUsdPerMillion, 0, modelMaxima.maxPricingUsdPerMillion, 0.000001)),
		configControl('Cache write USD / million', configNumberInput('config-route-' + routeIndex + '-price-cache-write', route.pricing.cacheWriteUsdPerMillion, 0, modelMaxima.maxPricingUsdPerMillion, 0.000001)),
	);
	routeNode.append(grid);
	const tools = document.createElement('div'); tools.className = 'config-tools';
	allowedTools.forEach(function(tool, toolIndex) {
		const label = document.createElement('label'); label.className = 'config-choice';
		const input = document.createElement('input'); input.type = 'checkbox'; input.id = 'config-route-' + routeIndex + '-tool-' + toolIndex; input.dataset.routeTool = tool; input.checked = (route.allowedTools || []).includes(tool);
		const caption = document.createElement('span'); text(caption, tool); label.append(input, caption); tools.append(label);
	});
	if (!allowedTools.length) { const note = document.createElement('span'); note.className = 'config-hint'; text(note, 'No tool authority is active.'); tools.append(note); }
	routeNode.append(tools); return routeNode;
}
function renderHostConfigGroup(configuration) {
	const group = configGroup('Pi host', 'Host enablement cannot be raised above the active runtime baseline.');
	const label = document.createElement('label'); label.className = 'config-choice';
	const input = document.createElement('input'); input.id = 'config-pi-enabled'; input.type = 'checkbox'; input.checked = configuration.editable.hosts.pi.enabled; input.disabled = !configuration.limits.piHostCanEnable && !input.checked;
	const caption = document.createElement('span'); text(caption, 'Pi host enabled'); label.append(input, caption); group.append(label); return group;
}
function rankedConfigOptions(values, boundary, minimum) {
	const boundaryIndex = values.indexOf(boundary);
	return values.map(function(value, index) { return { value: value, disabled: minimum ? index < boundaryIndex : index > boundaryIndex }; });
}
function requiredConfigNumber(id) {
	const input = document.getElementById(id); const value = Number(input.value);
	if (!input.value || !Number.isFinite(value)) throw new Error('Enter a valid value for ' + id.replace(/^config-/, '').replace(/-/g, ' ') + '.');
	return value;
}
function optionalConfigNumber(id) {
	const input = document.getElementById(id); if (!input.value) return undefined;
	const value = Number(input.value); if (!Number.isFinite(value)) throw new Error('Enter a valid value for ' + id.replace(/^config-/, '').replace(/-/g, ' ') + '.'); return value;
}
function configurationPatch(configuration) {
	const budgets = {};
	CONFIG_BUDGET_FIELDS.forEach(function(field) { const value = optionalConfigNumber('config-budget-' + field[0]); if (value !== undefined) budgets[field[0]] = value; });
	const routes = (configuration.editable.runtime.modelRouting.routes || []).map(function(_route, routeIndex) {
		const prefix = 'config-route-' + routeIndex + '-';
		return {
			id: document.getElementById(prefix + 'id').value.trim(), provider: document.getElementById(prefix + 'provider').value.trim(), model: document.getElementById(prefix + 'model').value.trim(),
			thinking: document.getElementById(prefix + 'thinking').value, quality: document.getElementById(prefix + 'quality').value, latency: document.getElementById(prefix + 'latency').value,
			timeoutMs: requiredConfigNumber(prefix + 'timeout'),
			pricing: { inputUsdPerMillion: requiredConfigNumber(prefix + 'price-input'), outputUsdPerMillion: requiredConfigNumber(prefix + 'price-output'), cacheReadUsdPerMillion: requiredConfigNumber(prefix + 'price-cache-read'), cacheWriteUsdPerMillion: requiredConfigNumber(prefix + 'price-cache-write') },
			allowedTools: Array.from(document.querySelectorAll('[id^="' + prefix + 'tool-"]')).filter(function(input) { return input.checked; }).map(function(input) { return input.dataset.routeTool; }),
		};
	});
	return { runtime: { maxWorkers: requiredConfigNumber('config-max-workers'), worktreeIsolation: document.getElementById('config-worktree-isolation').value, automation: document.getElementById('config-automation').value, agency: document.getElementById('config-agency').value, budgets: budgets, modelRouting: { qualityFloor: document.getElementById('config-quality-floor').value, maxEscalations: requiredConfigNumber('config-max-escalations'), estimatedInputTokens: requiredConfigNumber('config-estimated-input'), estimatedOutputTokens: requiredConfigNumber('config-estimated-output'), routes: routes } }, hosts: { pi: { enabled: document.getElementById('config-pi-enabled').checked } } };
}
async function executeConfigCommand(event) {
	if (event) event.preventDefault();
	const configuration = state && state.configuration;
	if (!configuration) return;
	const validation = document.getElementById('config-validation');
	let patch;
	try { patch = configurationPatch(configuration); validation.className = 'config-validation'; text(validation, 'Validating and saving…'); }
	catch (error) { validation.className = 'config-validation error'; text(validation, error.message || String(error)); return; }
	const command = { commandId: 'dashboard-config-' + crypto.randomUUID(), expectedStateDigest: configuration.stateDigest, expectedConfigDigest: configuration.configDigest, patch: patch };
	text(els.status, 'configuration command pending');
	try {
		const response = await fetch('/api/configuration/commands?token=' + encodeURIComponent(token), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || 'HTTP ' + response.status);
		state.configuration = result.state;
		text(els.status, 'completed · ' + result.receipt.receiptId);
		renderConfiguration();
	} catch (error) {
		validation.className = 'config-validation error'; text(validation, error && error.message ? error.message : String(error));
		text(els.status, 'rejected · ' + (error && error.message ? error.message : String(error)));
	}
}
function shortTime(value) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function readableStatus(status) {
	return String(status || '').replace(/_/g, ' ');
}
function renderDetail(trace) {
	const detail = document.createElement('section'); detail.className = 'detail';
	detail.addEventListener('click', function(event) { event.stopPropagation(); });
	const sections = trace.loopSections || [];
	const tabs = detailTabEntries(trace, sections);
	const activeId = detailTabs.get(trace.traceId) || preferredDetailTab(trace, sections);
	if (['change', 'decision', 'planning', 'implementation', 'committed'].includes(activeId)) detail.className += ' stage-detail stage-' + activeId;
	const nav = document.createElement('nav'); nav.className = 'detail-tabs'; nav.setAttribute('aria-label', 'Trace detail sections');
	tabs.forEach(function(tab) {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'detail-tab' + (tab.id === activeId ? ' active' : '');
		text(button, tab.label);
		button.onclick = function(event) {
			event.preventDefault();
			event.stopPropagation();
			const scrollX = window.scrollX;
			const scrollY = window.scrollY;
			detailTabs.set(trace.traceId, tab.id);
			render();
			window.scrollTo(scrollX, scrollY);
		};
		nav.append(button);
	});
	const panel = document.createElement('div'); panel.className = 'detail-panel';
	const active = tabs.find(function(tab) { return tab.id === activeId; }) || tabs[0];
	if (active) panel.append(active.render());
	detail.append(nav, panel);
	return detail;
}
function detailTabEntries(trace, sections) {
	return [
		{ id: 'overview', label: 'overview', render: function() { return renderTraceOverview(trace); } },
		{ id: 'change', label: 'change', render: function() { return renderTraceLineage(trace); } },
	].concat(sections.map(function(section) {
		return {
			id: section.loop,
			label: section.loop,
			render: function() {
				return section.loop === 'implementation'
					? renderImplementationPanel(trace, section)
					: renderLoopPanel(section);
			},
		};
	})).concat([
		{ id: 'committed', label: 'committed', render: function() { return renderCommittedDetail(trace); } },
		{ id: 'kb', label: 'KB', render: function() { return renderKnowledgeSection(trace.touchedFiles || {}, true, (trace.sprintPlan?.knowledgeTopics || []).map(function(topic) { return topic.ref; }), trace.knowledgeAlignment); } },
		{ id: 'files', label: 'Files', render: function() { return renderTouchedFilesSection(trace.touchedFiles || {}, true); } },
	]);
}
function renderTraceOverview(trace) {
	const body = document.createElement('div'); body.className = 'section-body';
	[
		['current action', trace.currentAction || 'No next action recorded.'],
		['stage', titleCase(trace.stage || trace.loop || 'waiting')],
		['workers', String(trace.workerCount || 0)],
		['Work Items', String((trace.items || []).length)],
		['blockers', String((trace.blockers || []).length)],
	].forEach(function(entry) {
		const row = document.createElement('div'); row.className = 'review-row';
		const label = document.createElement('span'); label.className = 'review-label'; text(label, entry[0]);
		const value = document.createElement('span'); value.className = 'review-value'; text(value, entry[1]);
		row.append(label, value); body.append(row);
	});
	if ((trace.blockers || []).length) {
		const blockers = document.createElement('div'); blockers.className = 'feed-feedback'; text(blockers, '✕ Blocked — ' + trace.blockers[0]); body.append(blockers);
	}
	const alignment = document.createElement('div'); alignment.className = 'feed-detail'; text(alignment, 'Knowledge alignment: ' + (trace.knowledgeAlignment?.label || 'Unknown') + ' — ' + (trace.knowledgeAlignment?.rationale || 'No evidence.')); body.append(alignment);
	return renderTerminalSection('Change overview', body, trace.committed ? 'committed' : readableStatus(trace.status || 'active'));
}
function renderTraceLineage(trace) {
	const body = document.createElement('div'); body.className = 'section-body';
	const ids = trace.changeIds || [];
	if (!ids.length) { const empty = document.createElement('div'); empty.className = 'feed-detail'; text(empty, 'No originating Change ids recorded.'); body.append(empty); }
	else ids.forEach(function(id) { const line = document.createElement('div'); line.className = 'file-line'; text(line, id); body.append(line); });
	return renderTerminalSection('originating Changes', body, ids.length + ' Change(s)');
}
function renderCommittedDetail(trace) {
	const body = document.createElement('div'); body.className = 'section-body';
	[['status', trace.committed ? 'committed' : 'not committed'], ['Git restore evidence', trace.commitRef || 'not available']].forEach(function(entry) {
		const row = document.createElement('div'); row.className = 'review-row';
		const label = document.createElement('span'); label.className = 'review-label'; text(label, entry[0]);
		const value = document.createElement('span'); value.className = 'review-value'; text(value, entry[1]); row.append(label, value); body.append(row);
	});
	return renderTerminalSection('commit and retention', body, trace.committed ? 'complete' : 'waiting');
}
function renderTerminalSection(label, body, aside) {
	const node = document.createElement('section'); node.className = 'detail-section';
	const heading = document.createElement('div'); heading.className = 'terminal-heading';
	const title = document.createElement('span'); text(title, label);
	const state = document.createElement('span'); state.className = 'section-state'; text(state, aside);
	heading.append(title, state); node.append(heading, body); return node;
}
function preferredDetailTab(trace, sections) {
	return preferredOpenLoop(sections) || (sections[0] && sections[0].loop) || 'change';
}
function preferredOpenLoop(sections) {
	const active = sections.find(function(section) { return section.state === 'active' || section.state === 'blocked'; });
	if (active) return active.loop;
	const latestWithFeed = sections.slice().reverse().find(function(section) { return (section.feed || []).length > 0; });
	return latestWithFeed ? latestWithFeed.loop : undefined;
}
function renderImplementationPanel(trace, section) {
	const node = document.createElement('section');
	node.className = 'loop-panel loop-section ' + section.state;
	const stack = document.createElement('div'); stack.className = 'section-body observability-stack';
	const preview = renderLivePreview(trace);
	if (preview) stack.append(preview);
	stack.append(
		renderTerminalBlock('activity feed', renderNarrativeFeed(trace.activityFeed || []), (trace.activityFeed || []).length + ' meaningful update(s)'),
		renderTerminalBlock('worker attempts', renderWorkerAttempts(trace.workerAttempts || []), (trace.workerAttempts || []).length + ' attempt(s)'),
		renderTerminalBlock('integration and exit review', renderImplementationReview(trace.implementationReview || {}), readableStatus((trace.implementationReview || {}).status || 'waiting')),
		renderCollapsibleTerminalBlock('quality standards', renderQualityChecklist(section.qualityChecks || []), qualitySummaryText(section.qualitySummary)),
		renderTerminalBlock('dev log', renderDevLog(trace.devLog || { available: false, entryCount: 0, items: [] }), (trace.devLog || {}).entryCount ? trace.devLog.entryCount + ' action(s)' : 'diagnostics'),
	);
	node.append(stack);
	return node;
}
function renderLivePreview(trace) {
	const bindings = trace.sprintPlan && trace.sprintPlan.uiPreviewTargets;
	if (!bindings || !bindings.length) return null;
	const group = document.createElement('div'); group.className = 'observability-stack';
	bindings.forEach(function(binding) {
		const preview = (trace.previews || []).find(function(candidate) { return candidate.targetId === binding.targetId; });
		group.append(renderLivePreviewTarget(binding, preview));
	});
	return renderTerminalBlock('live preview targets', group, bindings.length + ' target(s)');
}
function renderLivePreviewTarget(binding, preview) {
	const box = document.createElement('div'); box.className = 'preview-control';
	const head = document.createElement('div'); head.className = 'preview-head';
	const title = document.createElement('div'); title.className = 'preview-title'; text(title, (preview?.uiRef || binding.targetId) + ' · ' + binding.profileId);
	const status = document.createElement('div'); status.className = 'preview-state ' + (preview?.state || 'stopped'); text(status, readableStatus(preview?.state || 'waiting'));
	head.append(title, status); box.append(head);
	if (preview?.url) { const url = document.createElement('div'); url.className = 'preview-url'; text(url, preview.url); box.append(url); }
	const integration = preview?.integration;
	const meta = document.createElement('div'); meta.className = 'preview-meta';
	[
		['target', binding.targetId],
		['scenario', preview?.scenario || 'default'],
		['process', preview ? (preview.managed ? 'managed' : 'attached') : 'not started'],
		['browser', preview?.browser || 'pending'],
		['browser capability', previewBrowserCapabilityLabel(preview)],
		['viewports', (preview?.viewports || []).join(', ') || 'pending'],
		['Changes', (preview?.changeIds || binding.contributingChangeIds || []).join(', ') || 'not correlated'],
		['Sprint', (preview?.sprintIds || []).join(', ') || 'pending'],
		['Work Items', (preview?.workItemIds || binding.workItemIds || []).join(', ') || 'not correlated'],
		['integration', integration ? integration.visibility + ' · ' + String(integration.workingTreeDigest || '').slice(0, 19) : 'not observed'],
		['checkout', integration ? String(integration.gitHead || '').slice(0, 12) + (integration.dirty ? ' + dirty' : ' + clean') : 'pending'],
	].forEach(function(entry) {
		const item = document.createElement('div'); item.className = 'execution-control-item';
		const label = document.createElement('div'); label.className = 'execution-control-label'; text(label, entry[0]);
		const value = document.createElement('div'); value.className = 'execution-control-value'; text(value, entry[1]);
		item.append(label, value); meta.append(item);
	});
	box.append(meta);
	if (preview?.failure) { const failure = document.createElement('div'); failure.className = 'feed-feedback'; text(failure, preview.failure); box.append(failure); }
	const capability = preview?.browserCapability;
	if (preview?.browser === 'playwright' && capability?.reason) {
		const capabilityNote = document.createElement('div'); capabilityNote.className = capability.cliState === 'unavailable' || capability.sessionState === 'failed' ? 'feed-feedback' : 'execution-note'; text(capabilityNote, capability.reason); box.append(capabilityNote);
	}
	if (preview?.browser === 'playwright' && capability?.installHint) { const install = document.createElement('div'); install.className = 'execution-note'; text(install, capability.installHint); box.append(install); }
	const actions = document.createElement('div'); actions.className = 'execution-actions';
	const browserUnavailable = capability?.cliState === 'unavailable' || capability?.cliState === 'checking' || capability?.cliState === 'not_checked';
	const browserAlreadyOpen = capability?.sessionState === 'ready';
	const open = document.createElement('button'); open.type = 'button'; open.className = 'execution-button'; text(open, 'Open target'); open.disabled = preview?.state !== 'ready' || preview?.browser === 'none' || browserUnavailable || browserAlreadyOpen; open.title = capability?.installHint || capability?.reason || (preview?.browser === 'none' ? 'This profile has no browser adapter.' : 'Open this canonical UI target.'); open.onclick = function() { void executePreviewAction('open', binding, preview); };
	const capture = document.createElement('button'); capture.type = 'button'; capture.className = 'execution-button'; text(capture, 'Capture evidence'); capture.disabled = preview?.state !== 'ready' || !capability?.captureAvailable; capture.title = capability?.captureAvailable ? 'Capture target viewports, console messages, network requests, and exact integration state.' : capability?.installHint || capability?.reason || 'Capture requires a verified Playwright browser session.'; capture.onclick = function() { void executePreviewAction('capture', binding, preview); };
	const restart = document.createElement('button'); restart.type = 'button'; restart.className = 'execution-button'; text(restart, preview ? 'Restart profile' : 'Start profile'); restart.disabled = preview?.state === 'blocked' && /digest changed|not configured|conflicting/i.test(preview.failure || ''); restart.onclick = function() { void executePreviewAction(preview ? 'restart' : 'start', binding, preview); };
	const stop = document.createElement('button'); stop.type = 'button'; stop.className = 'execution-button stop'; text(stop, 'Stop profile'); stop.disabled = !preview || !['starting', 'ready', 'failed'].includes(preview.state); stop.onclick = function() { void executePreviewAction('stop', binding, preview); };
	actions.append(open, capture, restart, stop); box.append(actions);
	const note = document.createElement('div'); note.className = 'execution-note'; text(note, 'Profile processes are shared across targets. Capture remains target-specific. Evidence never grants semantic approval.'); box.append(note);
	if ((preview?.captures || []).length) box.append(renderPreviewEvidence(preview.captures));
	if ((preview?.logs || []).length) {
		const logs = document.createElement('pre'); logs.className = 'preview-log'; text(logs, preview.logs.join('\n'));
		box.append(renderCollapsibleTerminalBlock('preview logs', logs, preview.logs.length + ' bounded line(s)'));
	}
	return box;
}
function previewBrowserCapabilityLabel(preview) {
	if (!preview) return 'waiting';
	const capability = preview.browserCapability;
	if (!capability) return preview.browser === 'playwright' ? 'unknown' : 'not required';
	if (preview.browser !== 'playwright') return capability.sessionState === 'ready' ? 'browser opened' : 'not required';
	if (capability.cliState === 'checking') return 'checking CLI';
	if (capability.cliState === 'not_checked') return 'not checked';
	if (capability.cliState === 'unavailable') return 'CLI unavailable';
	if (capability.sessionState === 'ready') return 'CLI + browser ready';
	if (capability.sessionState === 'failed') return 'browser unavailable';
	return 'CLI ready · browser not opened';
}
function renderPreviewEvidence(captures) {
	const list = document.createElement('div'); list.className = 'preview-evidence';
	captures.slice().reverse().forEach(function(capture) {
		const item = document.createElement('article'); item.className = 'preview-evidence-item';
		const head = document.createElement('div'); head.className = 'preview-evidence-head';
		const title = document.createElement('div'); title.className = 'preview-evidence-title'; text(title, capture.id || 'preview capture');
		const time = document.createElement('div'); time.className = 'preview-evidence-time'; text(time, capture.capturedAt ? shortTime(capture.capturedAt) : 'captured');
		head.append(title, time); item.append(head);
		const correlation = document.createElement('div'); correlation.className = 'preview-evidence-detail';
		const integration = capture.integration || {};
		const iterations = (capture.implementation || []).map(function(entry) { return entry.implementationIterationId || entry.traceEventId || entry.traceId; }).join(', ') || 'before first Implementation iteration';
		text(correlation, 'target ' + capture.targetId + ' · Changes ' + (capture.changeIds || []).join(', ') + ' · Sprint ' + (capture.sprintIds || []).join(', ') + ' · ' + iterations + ' · git ' + String(integration.gitHead || '').slice(0, 12) + (integration.dirty ? ' + dirty worktree' : '') + ' · manifest ' + String(capture.manifestDigest || '').slice(0, 19));
		item.append(correlation);
		const observations = document.createElement('div'); observations.className = 'preview-evidence-detail';
		text(observations, 'console ' + (capture.console?.count || 0) + ' line(s) · network ' + (capture.network?.count || 0) + ' line(s) · ' + capture.manifestPath);
		item.append(observations);
		const artifacts = document.createElement('div'); artifacts.className = 'preview-evidence-artifacts';
		(capture.screenshots || []).forEach(function(screenshot) {
			const artifact = document.createElement('div'); artifact.className = 'preview-evidence-artifact';
			text(artifact, screenshot.viewport + ' ' + screenshot.width + '×' + screenshot.height + ' · ' + screenshot.path + ' · ' + String(screenshot.digest || '').slice(0, 19));
			artifacts.append(artifact);
		});
		item.append(artifacts); list.append(item);
	});
	return renderCollapsibleTerminalBlock('captured evidence', list, captures.length + ' capture(s)');
}
function renderNarrativeFeed(feed) {
	const box = document.createElement('div'); box.className = 'feed';
	if (!feed.length) { const empty = document.createElement('div'); empty.className = 'feed-detail'; text(empty, 'No meaningful activity recorded yet.'); box.append(empty); return box; }
	feed.forEach(function(item) {
		const row = document.createElement('article'); row.className = 'feed-item narrative ' + item.status;
		const head = document.createElement('div'); head.className = 'narrative-head';
		const title = document.createElement('span'); text(title, item.headline);
		const status = document.createElement('span'); status.className = 'narrative-status'; text(status, item.status + (item.createdAt ? ' · ' + shortTime(item.createdAt) : ''));
		head.append(title, status);
		const detail = document.createElement('div'); detail.className = 'narrative-detail'; text(detail, item.detail);
		const impact = document.createElement('div'); impact.className = 'narrative-impact'; text(impact, 'Why it matters: ' + item.impact);
		const next = document.createElement('div'); next.className = 'narrative-next'; text(next, 'Next: ' + item.nextAction);
		row.append(head, detail, impact, next); box.append(row);
	});
	return box;
}
function renderWorkerAttempts(attempts) {
	const box = document.createElement('div'); box.className = 'worker-lanes';
	if (!attempts.length) { const empty = document.createElement('div'); empty.className = 'feed-detail'; text(empty, 'No delegated worker attempts. Direct Implementation work remains visible in aggregate review.'); box.append(empty); return box; }
	attempts.forEach(function(attempt) {
		const row = document.createElement('article'); row.className = 'worker-attempt ' + attempt.status;
		const head = document.createElement('div'); head.className = 'worker-attempt-head';
		const title = document.createElement('div'); title.className = 'worker-attempt-title'; text(title, attempt.title);
		const status = document.createElement('div'); status.className = 'worker-attempt-status'; text(status, readableStatus(attempt.status));
		head.append(title, status);
		const meta = document.createElement('div'); meta.className = 'worker-attempt-meta'; text(meta, attempt.workerId + ' · attempt ' + attempt.attemptId + (attempt.freshness ? ' · ' + attempt.freshness : ''));
		const detail = document.createElement('div'); detail.className = 'worker-attempt-detail';
		const progress = attempt.progress ? ' · ' + attempt.progress.current + '/' + attempt.progress.total : '';
		text(detail, (attempt.phase ? readableStatus(attempt.phase) : 'Waiting for activity') + progress + (attempt.observedAt ? ' · observed ' + shortTime(attempt.observedAt) : ''));
		row.append(head, meta, detail);
		if (attempt.execution) {
			const execution = document.createElement('div'); execution.className = 'worker-attempt-detail';
			const usage = attempt.execution.usage;
			const tokenState = usage ? usage.totalTokens + (attempt.execution.budget.maxTokens !== undefined ? '/' + attempt.execution.budget.maxTokens + ' tokens' : ' tokens') : 'usage pending';
			const costState = usage ? '$' + usage.costUsd.toFixed(6) + (attempt.execution.budget.maxCostUsd !== undefined ? '/$' + attempt.execution.budget.maxCostUsd : '') : '';
			text(execution, attempt.execution.provider + '/' + attempt.execution.model + ' · ' + attempt.execution.thinking + ' · ' + attempt.execution.routeId + ' · ' + tokenState + (costState ? ' · ' + costState : '') + ' · ' + attempt.execution.policyDigest.slice(0, 19));
			row.append(execution);
		}
		box.append(row);
	});
	return box;
}
function renderImplementationReview(review) {
	const box = document.createElement('div'); box.className = 'implementation-review';
	[
		['results collected', (review.resultsCollected || 0) + '/' + (review.totalTasks || 0)],
		['acceptance evidence', readableStatus(review.acceptanceStatus || 'waiting')],
		['worker conflicts', String(review.conflictCount || 0)],
		['overall status', readableStatus(review.status || 'waiting')],
	].forEach(function(entry) {
		const row = document.createElement('div'); row.className = 'review-row';
		const label = document.createElement('span'); label.className = 'review-label'; text(label, entry[0]);
		const value = document.createElement('span'); value.className = 'review-value'; text(value, entry[1]);
		row.append(label, value); box.append(row);
	});
	return box;
}
function renderDevLog(devLog) {
	const box = document.createElement('div'); box.className = 'dev-log-list';
	if (!devLog.available) { const empty = document.createElement('div'); empty.className = 'feed-detail'; text(empty, 'Dev Log is unavailable for this trace. Semantic trace evidence remains authoritative.'); box.append(empty); return box; }
	if (!(devLog.items || []).length) { const empty = document.createElement('div'); empty.className = 'feed-detail'; text(empty, 'No observable agent actions recorded.'); box.append(empty); return box; }
	(devLog.items || []).forEach(function(item) {
		const row = document.createElement('div'); row.className = 'dev-log-item ' + item.status;
		const head = document.createElement('div'); head.className = 'dev-log-head';
		const action = document.createElement('span'); text(action, item.action);
		const meta = document.createElement('span'); meta.className = 'dev-log-meta'; text(meta, shortTime(item.timestamp) + ' · ' + item.status + (item.durationMs == null ? '' : ' · ' + item.durationMs + 'ms'));
		head.append(action, meta); row.append(head);
		if (item.summary) { const summary = document.createElement('div'); summary.className = 'dev-log-summary'; text(summary, item.summary); row.append(summary); }
		box.append(row);
	});
	return box;
}
function renderLoopPanel(section) {
	const node = document.createElement('section');
	node.className = 'loop-panel loop-section ' + section.state;
	node.append(renderLoopBody(section));
	return node;
}
function renderLoopBody(section) {
	const body = document.createElement('div'); body.className = 'section-body';
	body.append(
		renderTerminalBlock('feed', renderFeed(section.feed || [], false), feedTitleMeta(section)),
		renderCollapsibleTerminalBlock('quality standards', renderQualityChecklist(section.qualityChecks || []), qualitySummaryText(section.qualitySummary)),
	);
	return body;
}
function feedTitleMeta(section) {
	const parts = [section.statusLabel || section.state, (section.feed || []).length + ' event(s)'];
	if (section.iterationCount) parts.push(section.iterationCount + ' iteration(s)');
	return parts.filter(Boolean).join(' · ');
}
function renderTerminalBlock(label, content, aside) {
	const node = document.createElement('section'); node.className = 'terminal-block';
	const heading = document.createElement('div'); heading.className = 'terminal-block-heading';
	const title = document.createElement('span'); text(title, label);
	const state = document.createElement('span'); state.className = 'section-state'; text(state, aside || '');
	heading.append(title, state);
	const body = document.createElement('div'); body.className = 'terminal-block-body'; body.append(content);
	node.append(heading, body);
	return node;
}
function renderCollapsibleTerminalBlock(label, content, aside) {
	const node = document.createElement('details'); node.className = 'terminal-block';
	const heading = document.createElement('summary'); heading.className = 'terminal-block-heading';
	const title = document.createElement('span'); text(title, label);
	const state = document.createElement('span'); state.className = 'section-state'; text(state, aside || '');
	heading.append(title, state);
	const body = document.createElement('div'); body.className = 'terminal-block-body'; body.append(content);
	node.append(heading, body);
	return node;
}
function qualitySummaryText(summary) {
	if (!summary || !summary.total) return 'not started';
	if (summary.failed) return summary.failed + ' failed · ' + summary.passed + '/' + summary.total + ' passed';
	if (summary.verifying) return summary.verifying + ' verifying · ' + summary.passed + '/' + summary.total + ' passed';
	if (summary.pending) return summary.passed + '/' + summary.total + ' passed · ' + summary.pending + ' remaining';
	return summary.passed + '/' + summary.total + ' passed';
}
const QUALITY_LAYER_ORDER = [
	'hard_gate',
	'input_contract',
	'trace_fidelity',
	'coverage',
	'specificity',
	'scope_control',
	'evidence_quality',
	'risk_authority',
	'project_fit',
	'repairability',
	'pipeline_carryover',
	'exit_loss',
	'other',
];
const QUALITY_STANDARD_FALLBACKS = {
	sprint_proposal_ready: 'input_contract|loop_contract|hard',
	intention_understood: 'specificity|user_value|hard',
	user_value_clear: 'specificity|user_value|soft',
	cost_understood: 'project_fit|maintainability|soft',
	work_routing_classified: 'pipeline_carryover|scope_control|hard',
	loop_route_safe: 'pipeline_carryover|pipeline_carryover|hard',
	recommendation_justified: 'project_fit|project_fit|soft',
	intention_validated: 'project_fit|project_fit|soft',
	decision_semantically_sufficient: 'specificity|user_value|soft',
	cost_tradeoff_plausible: 'project_fit|maintainability|soft',
	risk_tier_plausible: 'risk_authority|risk_authority|soft',
	approval_safety: 'hard_gate|risk_authority|hard',
	current_state_grounded: 'trace_fidelity|trace_fidelity|hard',
	evidence_sufficient: 'trace_fidelity|evidence_quality|hard',
	risks_and_alternatives_considered: 'risk_authority|risk_authority|hard',
	active_trace_conflicts_resolved: 'hard_gate|scope_control|hard',
	knowledge_impact_accounted: 'trace_fidelity|trace_fidelity|soft',
	change_kind_classified: 'input_contract|loop_contract|hard',
	debug_decision_focused: 'specificity|loop_contract|soft',
	fix_decision_reproducible: 'specificity|loop_contract|soft',
	harden_decision_boundary: 'risk_authority|risk_authority|soft',
	improve_decision_outcome: 'specificity|user_value|soft',
	migrate_decision_equivalent: 'repairability|reversibility|soft',
	decision_coverage_complete: 'coverage|trace_fidelity|hard',
	worker_units_self_contained: 'input_contract|loop_contract|hard',
	technical_requirements_complete: 'specificity|user_value|soft',
	acceptance_and_verification_testable: 'evidence_quality|evidence_quality|hard',
	planning_depth_accounted: 'pipeline_carryover|scope_control|hard',
	worker_assignment_ready: 'project_fit|project_fit|soft',
	work_unit_atomic_judged: 'scope_control|scope_control|soft',
	acceptance_criteria_testable_judged: 'evidence_quality|evidence_quality|soft',
	scope_minimal_judged: 'scope_control|scope_control|soft',
	uncertainty_resolved: 'repairability|repairability|soft',
	work_unit_right_sized: 'project_fit|project_fit|soft',
	source_ownership_aligned: 'scope_control|scope_control|hard',
	dependency_order_clear: 'scope_control|scope_control|hard',
	triggers_valid: 'repairability|repairability|hard',
	resolutions_accounted: 'repairability|repairability|hard',
	traceability_refs_canonical: 'trace_fidelity|trace_fidelity|hard',
	planning_coverage_complete: 'coverage|trace_fidelity|hard',
	scope_controlled: 'scope_control|scope_control|hard',
	acceptance_evidence_complete: 'evidence_quality|evidence_quality|hard',
	verification_passed: 'hard_gate|robustness|hard',
	tdd_evidence_valid: 'evidence_quality|evidence_quality|hard',
	content_proof_recorded: 'evidence_quality|evidence_quality|hard',
	worker_claims_correlated: 'trace_fidelity|trace_fidelity|hard',
	production_quality_reviewed: 'project_fit|maintainability|soft',
	archive_disposition_ready: 'pipeline_carryover|trace_fidelity|hard',
	implementation_review_evidence_clean: 'hard_gate|robustness|hard',
	evidence_matches_claims_judged: 'evidence_quality|evidence_quality|soft',
	checks_relevant_judged: 'evidence_quality|robustness|soft',
	implementation_readiness_judged: 'project_fit|maintainability|soft',
	security_privacy_reviewed: 'risk_authority|security|soft',
	accessibility_ui_reviewed: 'risk_authority|user_value|soft',
	dependency_risk_controlled: 'risk_authority|robustness|soft',
	release_safety_approved: 'hard_gate|risk_authority|hard',
};
function renderQualityChecklist(checks) {
	const box = document.createElement('div'); box.className = 'quality-list';
	if (!checks.length) { const empty = document.createElement('div'); empty.className = 'feed-detail'; text(empty, 'No quality checks required for this loop.'); box.append(empty); return box; }
	qualityLayers(checks).forEach(function(layer) {
		const layerStatus = qualityAggregateStatus(layer.checks);
		const section = document.createElement('section'); section.className = 'quality-layer ' + layerStatus;
		const head = document.createElement('div'); head.className = 'quality-layer-head';
		const title = document.createElement('div'); title.className = 'quality-layer-title'; text(title, qualityLayerTitle(layer.key));
		const status = document.createElement('div'); status.className = 'quality-layer-status'; text(status, qualityAggregateStatusText(layerStatus, layer.checks));
		head.append(title, status);
		const list = document.createElement('div'); list.className = 'quality-layer-list';
		layer.checks.forEach(function(check) {
			const row = document.createElement('div'); row.className = 'quality-row ' + check.status;
			const content = document.createElement('div'); content.className = 'quality-check-content';
			const name = document.createElement('div'); name.className = 'quality-name';
			const standardType = document.createElement('span'); standardType.className = 'quality-type'; text(standardType, qualityStandardTypeLabel(check.standardType || 'other'));
			const description = document.createElement('span'); text(description, check.description || check.label);
			name.append(standardType, description);
			content.append(name);
			const metaText = qualityCheckMetaText(check);
			if (metaText) { const meta = document.createElement('div'); meta.className = 'quality-meta'; text(meta, metaText); content.append(meta); }
			const mark = document.createElement('div'); mark.className = 'quality-mark'; mark.title = check.status; text(mark, qualityMark(check.status));
			row.append(content, mark);
			list.append(row);
		});
		section.append(head, list);
		box.append(section);
	});
	return box;
}
function qualityLayers(checks) {
	const layers = [];
	const byLayer = new Map();
	checks.map(qualityCheckWithFallback).forEach(function(check, index) {
		const layerKey = check.layer || 'other';
		if (!byLayer.has(layerKey)) {
			const layer = { key: layerKey, firstIndex: index, checks: [] };
			byLayer.set(layerKey, layer);
			layers.push(layer);
		}
		byLayer.get(layerKey).checks.push(check);
	});
	return layers.sort(function(left, right) {
		const rank = qualityLayerRank(left.key) - qualityLayerRank(right.key);
		return rank || left.firstIndex - right.firstIndex;
	});
}
function qualityCheckWithFallback(check) {
	const fallback = QUALITY_STANDARD_FALLBACKS[check.id];
	if (!fallback) return { ...check, description: canonicalQualityText(check.description || check.label || '') };
	const parts = fallback.split('|');
	return {
		...check,
		layer: check.layer || parts[0],
		standardType: check.standardType || parts[1],
		gate: check.gate || parts[2],
		description: canonicalQualityText(check.description || check.label || ''),
		message: canonicalQualityText(check.message || ''),
	};
}
function canonicalQualityText(value) {
	return String(value || '')
		.replace(/Sprint Proposal has at least one approved (?:row|change) and stable (?:row|change) ids\./gi, 'Decision loop output approves one exact Change revision and digest.')
		.replace(/Approved rows\b/g, 'Decisions')
		.replace(/approved rows\b/g, 'Decisions')
		.replace(/Approved changes\b/g, 'Decisions')
		.replace(/approved changes\b/g, 'Decisions')
		.replace(/approved row\b/g, 'Decision')
		.replace(/approved change\b/g, 'Decision')
		.replace(/High-risk changes\b/g, 'High-risk Decisions')
		.replace(/high-risk changes\b/g, 'high-risk Decisions')
		.replace(/\brow ids\b/g, 'Decision ids')
		.replace(/\bchange ids\b/g, 'Decision ids')
		.replace(/\brows\b/g, 'Decisions')
		.replace(/\bRows\b/g, 'Decisions')
		.replace(/\brow\b/g, 'Decision')
		.replace(/\bRow\b/g, 'Decision')
		.replace(/\btables\b/g, 'decision lists')
		.replace(/\bTables\b/g, 'Decision lists')
		.replace(/\btable\b/g, 'decision list')
		.replace(/\bTable\b/g, 'Decision list');
}
function qualityLayerRank(key) {
	const rank = QUALITY_LAYER_ORDER.indexOf(key);
	return rank === -1 ? QUALITY_LAYER_ORDER.length : rank;
}
function qualityLayerTitle(key) {
	const rank = qualityLayerRank(key);
	const prefix = rank < QUALITY_LAYER_ORDER.length ? 'L' + String(rank + 1).padStart(2, '0') + ' ' : 'L?? ';
	return prefix + qualityLayerLabel(key);
}
function qualityLayerLabel(key) {
	const labels = {
		hard_gate: 'Hard gate',
		input_contract: 'Input contract',
		trace_fidelity: 'Trace fidelity',
		coverage: 'Coverage',
		specificity: 'Specificity',
		scope_control: 'Scope control',
		evidence_quality: 'Evidence quality',
		risk_authority: 'Risk + authority',
		project_fit: 'Project fit',
		repairability: 'Repairability',
		pipeline_carryover: 'Pipeline carryover',
		exit_loss: 'Exit loss',
		other: 'Other layer',
	};
	return labels[key] || titleCase(key.replace(/[_-]+/g, ' '));
}
function qualityStandardTypeLabel(key) {
	const labels = {
		loop_contract: 'Loop contract',
		user_value: 'User value',
		maintainability: 'Cost + maintainability',
		scope_control: 'Scope control',
		pipeline_carryover: 'Pipeline handoff',
		project_fit: 'Project fit',
		risk_authority: 'Risk + authority',
		trace_fidelity: 'Trace fidelity',
		evidence_quality: 'Evidence quality',
		repairability: 'Repairability',
		reversibility: 'Reversibility',
		accessibility: 'Accessibility',
		security_privacy: 'Security + privacy',
		dependency_risk: 'Dependency risk',
		robustness: 'Robustness',
		security: 'Security',
		other: 'Other checks',
	};
	return labels[key] || titleCase(key.replace(/[_-]+/g, ' '));
}
function titleCase(value) {
	return String(value || '').replace(/\b\w/g, function(letter) { return letter.toUpperCase(); });
}
function qualityAggregateStatus(checks) {
	if (checks.some(function(check) { return check.status === 'failed'; })) return 'failed';
	if (checks.some(function(check) { return check.status === 'verifying'; })) return 'verifying';
	if (checks.some(function(check) { return check.status === 'pending'; })) return 'pending';
	if (checks.every(function(check) { return check.status === 'skipped'; })) return 'skipped';
	return 'passed';
}
function qualityAggregateStatusText(status, checks) {
	const passed = checks.filter(function(check) { return check.status === 'passed'; }).length;
	const total = checks.length;
	const failFast = status === 'failed' && checks.some(function(check) { return check.gate === 'hard' && check.status === 'failed'; });
	const label = failFast ? 'Fail fast' : qualityAggregateStatusLabel(status);
	return label + ' · ' + passed + '/' + total;
}
function qualityAggregateStatusLabel(status) {
	if (status === 'passed') return 'Pass';
	if (status === 'failed') return 'Fail';
	if (status === 'verifying') return 'Verifying';
	if (status === 'skipped') return 'Skipped';
	return 'Pending';
}
function qualityCheckMetaText(check) {
	const parts = [];
	if (check.gate) parts.push(String(check.gate).replace(/[_-]+/g, ' ') + ' gate');
	if (typeof check.score === 'number') {
		parts.push('score ' + check.score + (typeof check.scoreThreshold === 'number' ? '/' + check.scoreThreshold : ''));
	}
	if (check.message) parts.push(check.message);
	return parts.join(' · ');
}
function qualityMark(status) {
	if (status === 'passed') return '✓';
	if (status === 'failed') return '✕';
	if (status === 'verifying') return '…';
	if (status === 'skipped') return '–';
	return '□';
}
function renderFeed(feed, includeLoop) {
	const box = document.createElement('div'); box.className = 'feed';
	if (!feed.length) { const empty = document.createElement('div'); empty.className = 'feed-detail'; text(empty, 'No events yet.'); box.append(empty); return box; }
	feed.forEach(function(item) {
		const row = document.createElement('div'); row.className = 'feed-item';
		const loop = includeLoop && item.loop ? item.loop + ' · ' : '';
		const head = document.createElement('div'); head.className = 'feed-head'; text(head, (item.createdAt ? shortTime(item.createdAt) + ' · ' : '') + loop + item.label + ' — ' + item.summary);
		row.append(head);
		(item.details || []).forEach(function(detail) { const line = document.createElement('div'); line.className = 'feed-detail'; text(line, '• ' + detail); row.append(line); });
		(item.feedback || []).forEach(function(feedback) { const line = document.createElement('div'); line.className = 'feed-feedback'; text(line, 'Feedback: ' + feedback); row.append(line); });
		box.append(row);
	});
	return box;
}
function renderKnowledgeSection(files, open, topics, alignment) {
	const node = renderFileSection('knowledge base refs', [
		['declared Change topics', topics || []],
		['changed product knowledge', files.kbProduct || []],
		['changed system knowledge', files.kbSystem || []],
	], open);
	const body = node.querySelector('.section-body');
	if (body) {
		const summary = document.createElement('div'); summary.className = 'file-group';
		const heading = document.createElement('b'); text(heading, 'topic-scoped alignment');
		const detail = document.createElement('div'); detail.className = 'file-line'; text(detail, (alignment?.label || 'Unknown') + ' — ' + (alignment?.rationale || 'No grounded alignment evidence.'));
		summary.append(heading, detail); body.prepend(summary);
	}
	return node;
}
function renderTouchedFilesSection(files, open) {
	return renderFileSection('touched files', [
		['code edits', files.codeEdits || []],
		['tests', files.tests || []],
		['other', files.other || []],
	], open);
}
function renderFileSection(label, groups, open) {
	const fileCount = groups.reduce(function(total, group) { return total + group[1].length; }, 0);
	const body = document.createElement('div'); body.className = 'section-body files-grid';
	groups.forEach(function(group) { if (!group[1].length) return; const wrap = document.createElement('div'); wrap.className = 'file-group'; const head = document.createElement('b'); text(head, group[0]); wrap.append(head); group[1].forEach(function(path) { const line = document.createElement('div'); line.className = 'file-line'; text(line, path); wrap.append(line); }); body.append(wrap); });
	if (!body.children.length) { const empty = document.createElement('div'); empty.className = 'file-line'; text(empty, 'No files recorded.'); body.append(empty); }
	if (open) {
		const node = document.createElement('section'); node.className = 'detail-section';
		const heading = document.createElement('div'); heading.className = 'terminal-heading';
		const title = document.createElement('span'); text(title, label);
		const state = document.createElement('span'); state.className = 'section-state'; text(state, fileCount + ' files');
		heading.append(title, state);
		node.append(heading, body);
		return node;
	}
	const node = document.createElement('details'); node.className = 'detail-section';
	const summary = document.createElement('summary'); const title = document.createElement('span'); text(title, label); const state = document.createElement('span'); state.className = 'section-state'; text(state, fileCount + ' files'); summary.append(title, state);
	node.append(summary, body); return node;
}
async function reloadChangedDashboardAssets() {
	if (!dashboardDevMode || dashboardStopped) return;
	try {
		const response = await fetch('/api/meta?token=' + encodeURIComponent(token));
		if (!response.ok) return;
		const meta = await response.json();
		if (meta.assetDigest && meta.assetDigest !== dashboardAssetDigest) window.location.reload();
	} catch {}
}
async function load() {
	if (loading || dashboardStopped) return;
	loading = true;
	try {
		const response = await fetch('/api/state?token=' + encodeURIComponent(token));
		if (!response.ok) throw new Error('HTTP ' + response.status);
		state = await response.json();
		render();
	} catch (error) {
		text(els.status, state ? 'stale · reconnecting' : 'failed · retrying');
		if (!state) {
			els.queue.innerHTML = '';
			const failure = document.createElement('div'); failure.className = 'load-state failed';
			text(failure, 'CodeWiki pipeline state is unavailable. Retrying automatically; if this persists, fully restart Pi and run /wiki-dashboard again.');
			els.queue.append(failure);
		}
		console.error(error);
	}
	finally { loading = false; }
}
function openSearch() {
	els.search.focus();
	els.search.select();
}
function openConfiguration() {
	renderConfiguration();
	if (!els.configurationDialog.open) els.configurationDialog.showModal();
}
function closeConfiguration() { if (els.configurationDialog.open) els.configurationDialog.close(); }
els.openConfiguration.addEventListener('click', openConfiguration);
els.closeConfiguration.addEventListener('click', closeConfiguration);
els.draftChange.addEventListener('click', function() { executeChangeCommand('draft'); });
els.search.addEventListener('input', function() { query = els.search.value; selected = 0; render(); });
els.search.addEventListener('keydown', function(event) {
	if (event.key === 'Enter') { event.preventDefault(); els.search.blur(); }
	if (event.key === 'Escape') {
		event.preventDefault();
		if (query) { query = ''; els.search.value = ''; selected = 0; render(); }
		else els.search.blur();
	}
});
els.searchFilter.addEventListener('keydown', function(event) { if (event.key === 'Escape') { event.preventDefault(); els.searchFilter.open = false; openSearch(); } });
els.configurationDialog.addEventListener('click', function(event) { if (event.target === els.configurationDialog) closeConfiguration(); });
document.addEventListener('click', function(event) { if (!els.searchFilter.contains(event.target)) els.searchFilter.open = false; });
document.addEventListener('keydown', function(event) {
	if (event.target === els.search) return;
	if (isInteractiveDashboardTarget(event.target)) return;
	if (event.key === '/') { event.preventDefault(); openSearch(); return; }
	if (event.key === 'r') { event.preventDefault(); load(); return; }
	if (event.key === 'j' || event.key === 'ArrowDown') { event.preventDefault(); selected++; render(); focusSelectedPipelineCard(); return; }
	if (event.key === 'k' || event.key === 'ArrowUp') { event.preventDefault(); selected--; render(); focusSelectedPipelineCard(); return; }
	if (event.key === 'Enter') {
		const entry = pipelineEntries()[selected];
		if (entry) { event.preventDefault(); openEntryOverview(entry, selected); }
	}
});
try {
	eventStream = new EventSource('/api/events?token=' + encodeURIComponent(token));
	eventStream.onmessage = function(event) { if (!dashboardStopped) { state = JSON.parse(event.data); render(); } };
	eventStream.onerror = function() { if (!dashboardStopped) { text(els.status, 'reconnecting'); load(); } };
} catch { load(); }
setInterval(load, 1000);
if (dashboardDevMode) setInterval(reloadChangedDashboardAssets, 500);
load();
</script>
</body>
</html>`;
