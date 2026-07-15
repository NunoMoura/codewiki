import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CODEWIKI_LOGO_DATA_URI = `data:image/png;base64,${readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), "assets", "codewiki-logo.png"),
).toString("base64")}`;

export const CODEWIKI_DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CodeWiki Sprints Queue</title>
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
	--logo-cyan: #62c6c2;
	--bar-skew: -12deg;
	--logo-progress-gradient: linear-gradient(90deg, var(--logo-red) 0%, var(--logo-orange) 22%, var(--logo-yellow) 48%, var(--logo-green) 72%, var(--logo-cyan) 100%);
	--atari-blue: var(--logo-cyan);
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
	overflow: hidden;
	border: 1px solid var(--line-strong);
	border-radius: var(--radius);
	background:
		radial-gradient(circle at 14% 0%, rgba(255,247,232,.10), transparent 24%),
		linear-gradient(180deg, #151412, #050505 72%);
	box-shadow: inset 0 0 0 1px #000, inset 0 -18px 32px rgba(0,0,0,.55);
	padding: 12px 14px;
	display: block;
	min-height: 124px;
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
	width: min(12rem, 24vw);
	display: flex;
	align-items: flex-start;
	justify-content: center;
	gap: 8px;
}
.brand-copy {
	min-width: 0;
	display: grid;
	justify-items: center;
	align-content: start;
	gap: 4px;
}
.codewiki-logo {
	display: block;
	width: clamp(88px, 9vw, 124px);
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
	position: absolute;
	top: 12px;
	left: 50%;
	transform: translateX(-50%);
	min-width: 0;
	width: min(640px, calc(100% - 440px));
	display: grid;
	grid-template-rows: auto auto;
	gap: 7px;
	align-content: start;
}
.header-controls {
	min-width: 0;
	display: grid;
	grid-template-columns: repeat(4, minmax(4.8rem, 1fr));
	gap: 6px;
}
.stat {
	border: 1px solid var(--line);
	border-radius: 8px;
	background: #090909;
	padding: 5px 6px;
	min-width: 0;
	min-height: 42px;
	text-align: center;
	cursor: pointer;
	display: grid;
	gap: 2px;
	align-content: center;
}
.stat:hover, .stat.active { border-color: var(--focus); background: var(--focus-soft); }
.stat b { display: block; color: var(--text); font-size: 18px; line-height: 1.05; }
.stat span { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
.search-wrap { min-width: 0; display: block; }
.search-wrap input {
	width: 100%;
	min-width: 0;
	border: 1px solid var(--line);
	border-radius: 8px;
	background: #050505;
	color: var(--text);
	padding: 7px 9px;
	outline: none;
}
.search-wrap input:focus { border-color: var(--focus); box-shadow: 0 0 0 1px #555; }
.queue-shell {
	max-width: 100%;
	display: grid;
	gap: 8px;
}
.view-switch { display: flex; gap: 6px; justify-content: flex-end; }
.view-switch button, .change-actions button, .changes-toolbar button {
	border: 1px solid var(--line);
	background: var(--panel-2);
	color: var(--text);
	border-radius: var(--radius);
	padding: 6px 9px;
	cursor: pointer;
}
.view-switch button.active { border-color: var(--focus); color: var(--focus); }
.change-list { display: grid; gap: 8px; }
.change-card { border: 1px solid var(--line); border-radius: var(--radius); padding: 12px; display: grid; gap: 10px; background: var(--panel); }
.change-card header { display: flex; gap: 8px; justify-content: space-between; align-items: start; }
.change-card h3, .change-card h4 { margin: 0; }
.change-card section { border-left: 2px solid var(--line-strong); padding-left: 9px; display: grid; gap: 4px; }
.change-card p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.change-identity, .change-authority { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.change-actions, .changes-toolbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.changes-toolbar { justify-content: space-between; }
.configuration-panel { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); padding: 12px; display: grid; gap: 10px; }
.configuration-panel pre { margin: 0; max-height: 60vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; background: #050505; border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px; }
.configuration-status { color: var(--muted); white-space: pre-wrap; }
[hidden] { display: none !important; }
.trace-list {
	max-width: 100%;
	display: grid;
	gap: 8px;
}
.trace {
	position: relative;
	overflow: hidden;
	max-width: 100%;
	min-width: 0;
	border: 1px solid var(--line);
	border-radius: var(--radius);
	background: rgba(10,10,10,.96);
	padding: 14px 12px 12px;
	cursor: pointer;
	transition: border-color .14s ease, background .14s ease, transform .14s ease;
}
.trace:hover, .trace.selected { border-color: var(--focus); background: #111; }
.trace:focus { outline: none; }
.trace:focus-visible { outline: 1px solid var(--focus); outline-offset: 2px; }
.trace-head {
	min-width: 0;
	display: grid;
	grid-template-columns: minmax(0, 1fr) max-content;
	gap: 12px;
	align-items: start;
}
.trace-title, .trace-now { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trace-title { color: var(--text); font-weight: 750; font-size: 15px; }
.badge {
	border: 1px solid var(--line);
	border-radius: 999px;
	background: #080808;
	color: var(--muted);
	padding: 2px 9px;
	font-weight: 800;
	text-transform: uppercase;
	font-size: 11px;
}
.trace-bar-row {
	min-width: 0;
	display: grid;
	grid-template-columns: minmax(0, 1fr) max-content;
	gap: 12px;
	align-items: center;
	margin-top: 9px;
}
.quality-caption {
	margin-top: 9px;
	color: var(--muted);
	font-size: 12px;
	font-weight: 800;
	letter-spacing: .03em;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.quality-strip {
	--check-width: 18px;
	--check-height: 24px;
	--check-gap: 3px;
	position: relative;
	min-width: 0;
	width: fit-content;
	max-width: calc(100% - 16px);
	display: flex;
	align-items: center;
	gap: var(--check-gap);
	min-height: 40px;
	overflow-x: auto;
	scrollbar-width: none;
	border: 2px solid var(--bar-ring);
	border-radius: var(--radius-sm);
	padding: 7px 10px;
	margin-left: 7px;
	transform: skewX(var(--bar-skew));
	transform-origin: left center;
	background:
		linear-gradient(180deg, rgba(255,247,232,.10), transparent 20%),
		repeating-linear-gradient(90deg, rgba(255,247,232,.025) 0 1px, transparent 1px 12px),
		#060605;
	box-shadow:
		inset 0 0 0 1px #171612,
		inset 0 0 20px rgba(0,0,0,.82),
		inset 0 -2px 0 rgba(255,247,232,.05);
}
.quality-strip::-webkit-scrollbar { display: none; }
.check {
	--check-color: #596161;
	position: relative;
	min-width: 0;
	flex: 0 0 var(--check-width);
	height: var(--check-height);
	overflow: hidden;
	border: 1px solid color-mix(in srgb, var(--check-color) 50%, #000 50%);
	border-radius: 3px;
	background-image:
		radial-gradient(130% 90% at 16% 0%, rgba(255,247,232,.18), transparent 62%),
		linear-gradient(to top,
			color-mix(in srgb, var(--check-color) 50%, #020202 50%) 0%,
			color-mix(in srgb, var(--check-color) 70%, #111 30%) 30%,
			var(--check-color) 58%,
			color-mix(in srgb, var(--check-color) 78%, #fff7e8 22%) 84%,
			color-mix(in srgb, var(--check-color) 66%, #fff7e8 34%) 100%);
	background-size: 100% 100%;
	background-repeat: no-repeat;
	box-shadow:
		inset 0 1px 0 rgba(255,247,232,.18),
		inset 0 -2px 0 rgba(0,0,0,.18),
		0 0 0 1px rgba(255,255,255,.035),
		0 0 10px color-mix(in srgb, var(--check-color) 28%, transparent);
}
.check::before {
	content: "";
	position: absolute;
	inset: 3px 5px auto 5px;
	height: 2px;
	border-radius: 999px;
	background: rgba(255,255,255,.13);
	opacity: .26;
}
.check::after {
	content: "";
	position: absolute;
	inset: 0;
	background: linear-gradient(90deg, rgba(255,255,255,.035), transparent 38%, rgba(0,0,0,.08));
	opacity: .18;
}
.check.pending { filter: saturate(.34) brightness(.54) contrast(.92); }
.check.verifying { animation: tick 1.1s steps(2) infinite; }
.check.passed { filter: saturate(1.08) brightness(1.02); }
.check.failed { background: linear-gradient(180deg, #ef756d, var(--logo-red) 58%, #7b1e21); border-color: var(--logo-red); outline: 2px solid var(--logo-red); outline-offset: -2px; filter: none; }
.check.skipped { background: linear-gradient(180deg, #8c9494, #596161); border-color: #8c9494; filter: saturate(.45); }
.quality-count {
	color: var(--text);
	border: 1px solid var(--line);
	border-radius: 999px;
	background: #080808;
	padding: 4px 8px;
	text-align: right;
	font-size: 12px;
	font-weight: 800;
	white-space: nowrap;
}
.trace-now { margin-top: 7px; color: var(--muted); }
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
	border-color: var(--logo-cyan);
	color: var(--text);
}
.detail-tab.active::before { color: var(--logo-cyan); }
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
	border: 1px solid var(--logo-cyan);
	border-radius: 5px;
	background: #0b1717;
	color: var(--text);
	padding: 7px 11px;
	font: inherit;
	font-weight: 800;
	cursor: pointer;
}
.execution-button.stop { border-color: var(--danger); background: #1b0d0d; }
.execution-button:disabled { border-color: var(--line); color: var(--dim); background: #080808; cursor: not-allowed; }
.execution-note { color: var(--muted); font-size: 12px; line-height: 1.5; }
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
.terminal-heading span:first-child::before { content: "$ "; color: var(--logo-cyan); }
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
.terminal-block-heading span:first-child::before { content: ":: "; color: var(--logo-cyan); }
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
@keyframes tick { 50% { filter: saturate(1.35) brightness(1.18); } }
@keyframes detail-open { from { opacity: .82; } to { opacity: 1; } }
@media (max-width: 980px) {
	.header { display: grid; grid-template-columns: 1fr; min-height: 0; gap: 10px; }
	.brand { width: 100%; }
	.header-dashboard { position: relative; top: auto; left: auto; transform: none; width: 100%; justify-self: stretch; }
	.header-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.trace-head { grid-template-columns: minmax(0, 1fr) max-content; }
}
@media (max-width: 560px) {
	#app { padding: 8px; }
	.header-controls { grid-template-columns: 1fr 1fr; }
	.trace { padding: 8px; }
	.kv { grid-template-columns: 1fr; gap: 3px; }
	.quality-strip { margin-left: 5px; max-width: calc(100% - 12px); }
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
				<div class="view-switch" aria-label="Dashboard section"><button id="view-traces" type="button" class="active">Sprints Queue</button><button id="view-changes" type="button">Changes Backlog</button><button id="view-configuration" type="button">Configuration</button></div>
				<div class="header-controls" id="summary"></div>
				<div class="search-wrap"><input id="search" aria-label="Filter traces" placeholder="filter traces…" /></div>
			</div>
		</header>
		<main class="queue-shell">
			<div class="trace-list" id="queue"><div class="load-state">Loading CodeWiki pipeline state…</div></div>
			<div class="change-list" id="changes" hidden><div class="load-state">Loading Changes Backlog…</div></div>
			<div class="configuration-panel" id="configuration" hidden><div class="load-state">Loading execution configuration…</div></div>
			<div class="footer-help">j/k move · enter expand · / search · r refresh · generated <span id="clock">loading…</span> · <span id="status">connecting</span></div>
		</main>
	</div>
</div>
<script>
const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get('token');
if (fragmentToken) sessionStorage.setItem('codewiki.dashboard.token', fragmentToken);
const token = fragmentToken || sessionStorage.getItem('codewiki.dashboard.token') || '';
if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
let state = null;
let traceHostState = null;
let loading = false;
let selected = 0;
let expandedTraceId = null;
let query = '';
let filter = 'active';
let dashboardView = 'traces';
const detailTabs = new Map();
const LOGO_PALETTE = ['#e85042', '#ef7b36', '#f3d55b', '#8ecb72', '#62c6c2'];
const els = {
	project: document.getElementById('project'),
	clock: document.getElementById('clock'),
	status: document.getElementById('status'),
	summary: document.getElementById('summary'),
	queue: document.getElementById('queue'),
	changes: document.getElementById('changes'),
	configuration: document.getElementById('configuration'),
	search: document.getElementById('search'),
	viewTraces: document.getElementById('view-traces'),
	viewChanges: document.getElementById('view-changes'),
	viewConfiguration: document.getElementById('view-configuration'),
};
function text(node, value) { node.textContent = value == null ? '' : String(value); }
function filtered() {
	const traces = state?.sprintsQueue || [];
	const q = query.trim().toLowerCase();
	return traces.filter(function(trace) {
		if (filter === 'active' && !isActiveTrace(trace)) return false;
		if (filter === 'blocked' && trace.blockerCount === 0) return false;
		if (filter === 'archived' && trace.closed === false) return false;
		if (!q) return true;
		return [trace.traceId, trace.title, trace.status, trace.loop, trace.currentAction].concat(trace.pathScopes || []).join(' ').toLowerCase().includes(q);
	}).sort(function(left, right) {
		return traceSortRank(left) - traceSortRank(right) || String(left.title || '').localeCompare(String(right.title || ''));
	});
}
function filteredChanges() {
	const records = state?.changes?.records || [];
	const q = query.trim().toLowerCase();
	return records.filter(function(card) {
		if (filter === 'pending' && card.identity.status !== 'pending') return false;
		if (filter === 'valid' && card.identity.validationState !== 'valid') return false;
		if (filter === 'accepted' && card.identity.status !== 'accepted') return false;
		if (!q) return true;
		return [card.identity.changeId, card.question, card.sections.currentState.text, card.sections.proposedChange.text].join(' ').toLowerCase().includes(q);
	});
}
function isActiveTrace(trace) { return !trace.closed && trace.loop !== 'waiting'; }
function traceSortRank(trace) {
	if (isActiveTrace(trace)) return 0;
	if (trace.blockerCount > 0 || trace.loop === 'blocked') return 1;
	if (trace.closed) return 2;
	return 3;
}
function render() {
	if (!state) return;
	const traces = filtered();
	selected = Math.max(0, Math.min(selected, Math.max(0, traces.length - 1)));
	if (expandedTraceId && !traces.some(function(trace) { return trace.traceId === expandedTraceId; })) expandedTraceId = null;
	text(els.project, state.projectName || 'CodeWiki');
	text(els.clock, state.generatedAt || new Date().toISOString());
	text(els.status, 'live');
	els.queue.hidden = dashboardView !== 'traces';
	els.changes.hidden = dashboardView !== 'changes';
	els.configuration.hidden = dashboardView !== 'configuration';
	els.viewTraces.className = dashboardView === 'traces' ? 'active' : '';
	els.viewChanges.className = dashboardView === 'changes' ? 'active' : '';
	els.viewConfiguration.className = dashboardView === 'configuration' ? 'active' : '';
	els.search.hidden = dashboardView === 'configuration';
	els.search.placeholder = dashboardView === 'traces' ? 'filter traces…' : 'filter changes…';
	els.search.setAttribute('aria-label', dashboardView === 'traces' ? 'Filter traces' : 'Filter changes');
	renderSummary();
	if (dashboardView === 'traces') renderQueue(traces);
	else if (dashboardView === 'changes') renderChanges(filteredChanges());
	else renderConfiguration();
}
function renderSummary() {
	els.summary.innerHTML = '';
	const changesSummary = state.changes && state.changes.summary;
	const configuration = state.configuration;
	const stats = dashboardView === 'configuration' && configuration ? [
		['restart', configuration.restartRequired ? 1 : 0],
		['workers', configuration.editable.runtime.maxWorkers],
		['automation', configuration.editable.runtime.automation],
		['agency', configuration.editable.runtime.agency],
	] : dashboardView === 'changes' && changesSummary ? [
		['pending', changesSummary.pending],
		['valid', changesSummary.valid],
		['accepted', changesSummary.accepted],
		['all', changesSummary.total],
	] : [
		['active', state.summary.active],
		['blocked', state.summary.blocked],
		['archived', state.summary.archived],
		['all', state.summary.traces],
	];
	stats.forEach(function(entry) {
		const label = entry[0];
		const div = document.createElement('button');
		div.type = 'button';
		div.className = 'stat' + (filter === label ? ' active' : '');
		div.onclick = function() { filter = label; selected = 0; render(); };
		const s = document.createElement('span'); text(s, label);
		const b = document.createElement('b'); text(b, entry[1]);
		div.append(s, b); els.summary.append(div);
	});
}
function badgeClass(loop) { return String(loop || '').replace(/[^a-z0-9_-]/gi, ''); }
function isInteractiveDashboardTarget(target) {
	return target instanceof Element && Boolean(target.closest('button, input, select, textarea, a, summary, [contenteditable="true"]'));
}
function toggleTrace(trace, index) {
	selected = index;
	expandedTraceId = expandedTraceId === trace.traceId ? null : trace.traceId;
	render();
	focusSelectedTrace();
}
function focusSelectedTrace() {
	const row = els.queue.querySelector('.trace.selected');
	if (!row) return;
	row.focus({ preventScroll: true });
	row.scrollIntoView({ block: 'nearest' });
}
function renderQueue(traces) {
	els.queue.innerHTML = '';
	if (!traces.length) { els.queue.innerHTML = '<div class="empty">No Sprint Traces found.</div>'; return; }
	traces.forEach(function(trace, index) {
		const row = document.createElement('article');
		row.className = 'trace' + (index === selected ? ' selected' : '');
		row.tabIndex = 0;
		row.setAttribute('aria-expanded', String(expandedTraceId === trace.traceId));
		row.onclick = function(event) {
			if (isInteractiveDashboardTarget(event.target)) return;
			toggleTrace(trace, index);
		};
		row.onkeydown = function(event) {
			if (event.target !== row || (event.key !== 'Enter' && event.key !== ' ')) return;
			event.preventDefault();
			event.stopPropagation();
			toggleTrace(trace, index);
		};
		const head = document.createElement('div'); head.className = 'trace-head';
		const title = document.createElement('div'); title.className = 'trace-title'; text(title, trace.title && trace.title !== trace.traceId ? trace.title : 'Untitled sprint trace');
		const badge = document.createElement('span'); badge.className = 'badge ' + badgeClass(trace.loop); text(badge, trace.loop);
		head.append(title, badge);
		const caption = document.createElement('div'); caption.className = 'quality-caption'; text(caption, trace.qualityCaption);
		const barRow = document.createElement('div'); barRow.className = 'trace-bar-row';
		const primaryChecks = trace.primaryQualityChecks || trace.qualityChecks || [];
		const primarySummary = trace.primaryQualitySummary || trace.qualitySummary || { total: primaryChecks.length, passed: 0 };
		const strip = renderQualityStrip(primaryChecks, trace.qualityCaption);
		const count = document.createElement('div'); count.className = 'quality-count'; text(count, qualityCountText(primarySummary));
		barRow.append(strip, count);
		row.append(head, caption, barRow);
		const workers = document.createElement('div'); workers.className = 'worker-strip'; text(workers, trace.workerCount + ' worker(s) · ' + (trace.items || []).length + ' work item(s)'); row.append(workers);
		if (expandedTraceId === trace.traceId) row.append(renderDetail(trace));
		els.queue.append(row);
	});
}
function renderChanges(cards) {
	els.changes.innerHTML = '';
	const toolbar = document.createElement('div'); toolbar.className = 'changes-toolbar';
	const authority = document.createElement('div'); authority.className = 'change-authority'; text(authority, 'Draft, revise, validate, or withdraw only. Acceptance and Decisions remain in the main session.');
	const draft = changeActionButton('Draft Change', function() { executeChangeCommand('draft'); });
	toolbar.append(authority, draft); els.changes.append(toolbar);
	if (!cards.length) { const empty = document.createElement('div'); empty.className = 'empty'; text(empty, 'No matching Changes found.'); els.changes.append(empty); return; }
	cards.forEach(function(card) {
		const node = document.createElement('article'); node.className = 'change-card';
		const header = document.createElement('header');
		const heading = document.createElement('h3'); text(heading, card.identity.changeId);
		const identity = document.createElement('div'); identity.className = 'change-identity'; text(identity, 'revision ' + card.identity.revision + ' · record ' + card.identity.recordRevision + ' · ' + card.identity.status + ' · ' + card.identity.validationState);
		header.append(heading, identity); node.append(header);
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
		node.append(actions); els.changes.append(node);
	});
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
function renderConfiguration() {
	els.configuration.innerHTML = '';
	const configuration = state && state.configuration;
	if (!configuration) { const empty = document.createElement('div'); empty.className = 'empty'; text(empty, 'Execution configuration is unavailable.'); els.configuration.append(empty); return; }
	const heading = document.createElement('h3'); text(heading, 'Execution configuration');
	const status = document.createElement('div'); status.className = 'configuration-status';
	text(status, 'Source: ' + configuration.sourcePath + '\nDigest: ' + configuration.configDigest + '\nValidation: ' + configuration.validation + '\n' + configuration.restartGuidance);
	const content = document.createElement('pre'); text(content, JSON.stringify(configuration.editable, null, 2));
	const apply = changeActionButton('Apply bounded patch', executeConfigCommand);
	const note = document.createElement('div'); note.className = 'change-authority'; text(note, 'Editable: worker limit, worktree isolation, automation, agency, budgets, model routing, and Pi host enablement. Approval, stop-condition, credential, publication, controller, and semantic authority settings are forbidden.');
	els.configuration.append(heading, status, content, apply, note);
}
async function executeConfigCommand() {
	const configuration = state && state.configuration;
	if (!configuration) return;
	const raw = window.prompt('Paste a bounded execution configuration patch JSON.');
	if (!raw) return;
	let patch;
	try { patch = JSON.parse(raw); } catch { text(els.status, 'invalid configuration JSON'); return; }
	const command = {
		commandId: 'dashboard-config-' + crypto.randomUUID(),
		expectedStateDigest: configuration.stateDigest,
		expectedConfigDigest: configuration.configDigest,
		patch: patch,
	};
	text(els.status, 'configuration command pending');
	try {
		const response = await fetch('/api/configuration/commands?token=' + encodeURIComponent(token), {
			method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || 'HTTP ' + response.status);
		state.configuration = result.state;
		text(els.status, 'completed · ' + result.receipt.receiptId);
		render();
	} catch (error) {
		text(els.status, 'rejected · ' + (error && error.message ? error.message : String(error)));
		await load();
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
function renderQualityStrip(checks, label) {
	const strip = document.createElement('div');
	strip.className = 'quality-strip';
	strip.setAttribute('aria-label', label || 'quality checks');
	checks.forEach(function(check, index) {
		const el = document.createElement('span');
		el.className = 'check ' + check.status;
		el.style.setProperty('--check-color', logoProgressColor(index, checks.length));
		el.title = check.loop + ' · ' + check.label + ' · ' + check.status + (check.message ? ': ' + check.message : '');
		strip.append(el);
	});
	return strip;
}
function qualityCountText(summary) {
	if (!summary || !summary.total) return '0 checks';
	return (summary.passed || 0) + '/' + summary.total + ' checks';
}
function logoProgressColor(index, total) {
	if (total <= 1) return LOGO_PALETTE[0];
	return logoColorAt(index / Math.max(1, total - 1));
}
function logoColorAt(ratio) {
	const clamped = clamp(ratio, 0, 1);
	const scaled = clamped * (LOGO_PALETTE.length - 1);
	const left = Math.floor(scaled);
	const right = Math.min(LOGO_PALETTE.length - 1, left + 1);
	return mixHex(LOGO_PALETTE[left], LOGO_PALETTE[right], scaled - left);
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function mixHex(left, right, ratio) {
	const a = hexToRgb(left);
	const b = hexToRgb(right);
	return 'rgb(' + [0, 1, 2].map(function(index) { return Math.round(a[index] + (b[index] - a[index]) * ratio); }).join(', ') + ')';
}
function hexToRgb(value) {
	const hex = value.replace('#', '');
	return [0, 2, 4].map(function(index) { return parseInt(hex.slice(index, index + 2), 16); });
}
function renderDetail(trace) {
	const detail = document.createElement('section'); detail.className = 'detail';
	detail.addEventListener('click', function(event) { event.stopPropagation(); });
	const sections = trace.loopSections || [];
	const tabs = detailTabEntries(trace, sections);
	const activeId = detailTabs.get(trace.traceId) || preferredDetailTab(trace, sections);
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
	return [{ id: 'execution', label: 'execution', render: function() { return renderExecutionControl(trace); } }].concat(sections.map(function(section) {
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
		{ id: 'kb', label: 'KB', render: function() { return renderKnowledgeSection(trace.touchedFiles || {}, true); } },
		{ id: 'files', label: 'Files', render: function() { return renderTouchedFilesSection(trace.touchedFiles || {}, true); } },
	]);
}
function renderExecutionControl(trace) {
	const box = document.createElement('section'); box.className = 'execution-control';
	const card = traceHostState && (traceHostState.traces || []).find(function(candidate) { return candidate.traceId === trace.traceId; });
	if (!card) {
		const note = document.createElement('div'); note.className = 'execution-note';
		text(note, traceHostState ? 'No execution control is available for this trace.' : 'Loading guarded execution status…');
		box.append(note); return box;
	}
	const result = card.session && card.session.result;
	const executionPolicy = card.executionPolicy;
	const selectedRoute = executionPolicy && executionPolicy.selected;
	const reportedModel = result && result.model ? (result.provider ? result.provider + '/' : '') + result.model : '';
	const executionModel = selectedRoute || card.session && card.session.executionModel;
	const routedModel = executionModel ? executionModel.provider + '/' + executionModel.model + ' · thinking ' + executionModel.thinking : '';
	const budget = executionPolicy && executionPolicy.budget;
	const observedUsage = result && result.usage ? result.usage : card.session && card.session.usage;
	const usage = observedUsage
		? observedUsage.totalTokens + (budget && budget.maxTokens ? '/' + budget.maxTokens : '') + ' tokens · $' + observedUsage.cost + (budget && budget.maxCostUsd ? '/$' + budget.maxCostUsd : '')
		: budget ? '0' + (budget.maxTokens ? '/' + budget.maxTokens : '') + ' tokens · $0' + (budget.maxCostUsd ? '/$' + budget.maxCostUsd : '') : 'not reported';
	const grid = document.createElement('div'); grid.className = 'execution-control-grid';
	[
		['trace state', card.traceStatus],
		['execution session', card.session ? card.session.state : 'not running'],
		['outcome', result ? result.outcome : 'pending'],
		['model', reportedModel ? reportedModel + (executionModel ? ' · thinking ' + executionModel.thinking : '') : routedModel || 'no eligible route'],
		['usage / budget', usage],
		['resume session', result && result.sessionId ? result.sessionId : 'not available'],
		['policy', traceHostState.policy.agency + ' · ' + traceHostState.policy.automation + ' · ' + (executionPolicy ? executionPolicy.qualityFloor : traceHostState.policy.qualityFloor)],
	].forEach(function(entry) {
		const item = document.createElement('div'); item.className = 'execution-control-item';
		const label = document.createElement('div'); label.className = 'execution-control-label'; text(label, entry[0]);
		const value = document.createElement('div'); value.className = 'execution-control-value'; text(value, readableStatus(entry[1]));
		item.append(label, value); grid.append(item);
	});
	const actions = document.createElement('div'); actions.className = 'execution-actions';
	const start = document.createElement('button'); start.type = 'button'; start.className = 'execution-button'; text(start, result ? 'Restart trace execution' : 'Start trace execution');
	start.disabled = !card.canStart;
	start.title = card.blockers.join(' ');
	start.onclick = function() { void executeTraceHostCommand('start', card); };
	const resume = document.createElement('button'); resume.type = 'button'; resume.className = 'execution-button'; text(resume, 'Resume execution');
	resume.disabled = !card.canResume;
	resume.title = (card.resumeBlockers || []).join(' ');
	resume.onclick = function() { void executeTraceHostCommand('resume', card); };
	const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'execution-button stop'; text(cancel, 'Stop execution');
	cancel.disabled = !card.canCancel;
	cancel.onclick = function() { void executeTraceHostCommand('cancel', card); };
	actions.append(start, resume, cancel);
	const note = document.createElement('div'); note.className = 'execution-note';
	const messages = [];
	if (result && result.summary) messages.push(result.summary);
	if (result && result.approval) {
		messages.push('Approval required: ' + result.approval.kind + ' · ' + result.approval.proposalDigest + (result.approval.proposalRef ? ' · ' + result.approval.proposalRef : ''));
	}
	if (executionPolicy && executionPolicy.rationale) messages.push(executionPolicy.rationale);
	if (card.blockers.length) messages.push(card.blockers.join(' '));
	if (!messages.length) messages.push('Commands use exact state guards and return auditable receipts. Semantic approvals remain separate.');
	text(note, messages.join(' '));
	box.append(grid, actions, note); return box;
}
async function executeTraceHostCommand(action, card) {
	const verb = action === 'start' ? 'start execution for' : action === 'resume' ? 'resume execution for' : 'stop execution for';
	const warning = action === 'resume' ? ' This confirms only that the external action was attempted; it does not grant semantic approval.' : '';
	if (!window.confirm('Confirm: ' + verb + ' ' + card.traceId + '?' + warning)) return;
	const command = {
		action: action,
		commandId: 'dashboard-' + Date.now() + '-' + Math.random().toString(16).slice(2),
		traceId: card.traceId,
		expectedStateDigest: card.stateDigest,
	};
	if (action === 'cancel' || action === 'resume') command.expectedSessionRef = card.session && card.session.sessionRef;
	if (action === 'resume') {
		command.resumeAcknowledgement = card.session && card.session.result && card.session.result.outcome === 'needs_approval'
			? 'approval_completed_externally'
			: 'blocker_resolved_externally';
	}
	text(els.status, 'command pending');
	try {
		const response = await fetch('/api/trace-hosts/commands?token=' + encodeURIComponent(token), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(command),
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || 'HTTP ' + response.status);
		traceHostState = result.state;
		text(els.status, 'accepted · ' + result.receipt.receiptId);
		render();
	} catch (error) {
		text(els.status, 'command rejected');
		console.error(error);
		await load();
	}
}
function preferredDetailTab(trace, sections) {
	return preferredOpenLoop(sections) || (sections[0] && sections[0].loop) || 'kb';
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
	stack.append(
		renderTerminalBlock('activity feed', renderNarrativeFeed(trace.activityFeed || []), (trace.activityFeed || []).length + ' meaningful update(s)'),
		renderTerminalBlock('worker attempts', renderWorkerAttempts(trace.workerAttempts || []), (trace.workerAttempts || []).length + ' attempt(s)'),
		renderTerminalBlock('integration and exit review', renderImplementationReview(trace.implementationReview || {}), readableStatus((trace.implementationReview || {}).status || 'waiting')),
		renderTerminalBlock('quality standards', renderQualityChecklist(section.qualityChecks || []), qualitySummaryText(section.qualitySummary)),
		renderTerminalBlock('dev log', renderDevLog(trace.devLog || { available: false, entryCount: 0, items: [] }), (trace.devLog || {}).entryCount ? trace.devLog.entryCount + ' action(s)' : 'diagnostics'),
	);
	node.append(stack);
	return node;
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
		renderTerminalBlock('quality standards', renderQualityChecklist(section.qualityChecks || []), qualitySummaryText(section.qualitySummary)),
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
function qualitySummaryText(summary) {
	if (!summary || !summary.total) return '0 checks';
	if (summary.failed) return summary.failed + ' failed · ' + summary.total + ' total';
	if (summary.verifying) return summary.verifying + ' verifying · ' + summary.total + ' total';
	if (summary.pending) return summary.pending + ' pending · ' + summary.total + ' total';
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
		.replace(/Sprint Proposal has at least one approved (?:row|change) and stable (?:row|change) ids\./gi, 'Decision loop output has at least one Decision and stable Decision ids.')
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
function renderKnowledgeSection(files, open) {
	return renderFileSection('knowledge base changes', [
		['product', files.kbProduct || []],
		['system', files.kbSystem || []],
	], open);
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
async function load() {
	if (loading) return;
	loading = true;
	try {
		const responses = await Promise.all([
			fetch('/api/state?token=' + encodeURIComponent(token)),
			fetch('/api/trace-hosts?token=' + encodeURIComponent(token)),
		]);
		if (!responses[0].ok || !responses[1].ok) throw new Error('HTTP ' + responses[0].status + '/' + responses[1].status);
		const payloads = await Promise.all([responses[0].json(), responses[1].json()]);
		state = payloads[0];
		traceHostState = payloads[1];
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
function setDashboardView(nextView) {
	dashboardView = nextView;
	filter = nextView === 'changes' ? 'pending' : 'active';
	query = '';
	els.search.value = '';
	selected = 0;
	render();
}
els.viewTraces.addEventListener('click', function() { setDashboardView('traces'); });
els.viewChanges.addEventListener('click', function() { setDashboardView('changes'); });
els.viewConfiguration.addEventListener('click', function() { setDashboardView('configuration'); });
els.search.addEventListener('input', function() { query = els.search.value; selected = 0; render(); });
document.addEventListener('keydown', function(event) {
	if (event.target === els.search) {
		if (event.key === 'Escape') els.search.blur();
		return;
	}
	if (isInteractiveDashboardTarget(event.target)) return;
	if (event.key === '/') { event.preventDefault(); els.search.focus(); return; }
	if (event.key === 'r') { event.preventDefault(); load(); return; }
	if (dashboardView !== 'traces') return;
	if (event.key === 'j' || event.key === 'ArrowDown') { event.preventDefault(); selected++; render(); focusSelectedTrace(); return; }
	if (event.key === 'k' || event.key === 'ArrowUp') { event.preventDefault(); selected--; render(); focusSelectedTrace(); return; }
	if (event.key === 'Enter') {
		const trace = filtered()[selected];
		if (trace) { event.preventDefault(); toggleTrace(trace, selected); }
	}
});
try {
	const events = new EventSource('/api/events?token=' + encodeURIComponent(token));
	events.onmessage = function(event) { state = JSON.parse(event.data); render(); };
	events.onerror = function() { text(els.status, 'reconnecting'); load(); };
} catch { load(); }
setInterval(load, 1000);
load();
</script>
</body>
</html>`;
