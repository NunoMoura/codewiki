---
type: Concept
title: Pi Session and Retro Dashboard UI
description: CodeWiki keeps the Pi session focused on conversation and automatically opens a retro local browser dashboard for lifecycle-first pipeline observability.
tags:
  - codewiki
  - product
  - uis
  - terminal
timestamp: 2026-07-01T00:00:00Z
codewiki_component: dashboard
codewiki_components:
  - dashboard
codewiki_source_patterns:
  - src/dashboard/**
codewiki_test_patterns:
  - tests/dashboard/**
  - tests/runtime/pi-extension.test.mjs
  - tests/runtime/pi-rpc-smoke.mjs
codewiki_role: browser_observability
codewiki_source_map:
  - id: dashboard
    source_patterns:
      - src/dashboard/**
    test_patterns:
      - tests/dashboard/**
      - tests/runtime/pi-extension.test.mjs
      - tests/runtime/pi-rpc-smoke.mjs
    role: browser_observability
---
# Pi Session and Retro Dashboard UI

CodeWiki is backend-first for the current architecture wave. The retained near-term UI direction is a focused Pi session plus a local browser dashboard. The Pi terminal remains the user-agent communication channel. The browser dashboard provides trace-backed observability plus narrowly guarded Change, configuration, session-action, and preview controls.

## Scope

Pi TUI rendering may still show focused command output and source-backed system diagrams from canonical YAML files under `.codewiki/kb/system/diagrams/*.yaml`.

Allowed terminal outputs:

- bootstrap summaries;
- focused `/wiki-resume`, `/wiki-explain`, and `/wiki-config` views;
- architecture/component lanes;
- key-flow ordered steps;
- source ownership trees from OKF ownership frontmatter;
- state lifecycle transitions;
- data-model entity cards and relationships.

The product control and progress surface is a local retro console-inspired browser dashboard that opens automatically once when an eligible Pi TUI session starts. Its primary area is one Change-rooted Work Pipeline. Each card follows the same Change Trace from persisted intent through approval, Planning-created Sprints and Work Items, Assignments, realization, outcome disposition, and commitment. Configuration remains secondary. `/wiki-dashboard` reopens/reuses the view and `--stop` stops its local host.

## Dashboard principles

- Truth-backed: one JSONL Change Trace owns each persisted Change journey; WorkState and every dashboard screen are disposable projections over traces and current project truth.
- Live: Change revisions and trace appends stream into the open dashboard immediately; bounded polling recovers automatically from missed or disconnected event streams without requiring reload. The source-only dashboard development harness additionally reloads changed dashboard assets without loading the CodeWiki extension.
- Guarded: navigation and observability are read-only; allowed Change, configuration, supervised runtime-session, and preview commands call guarded core APIs with exact same-origin capabilities, optimistic state or session guards, bounded input, idempotency, audit receipts, stale-state lockout, and secret redaction. Runtime and preview controls never approve semantic output directly.
- Local-private: the server binds to loopback, endpoint metadata is user-only, the launch capability travels in a URL fragment rather than the request URL, and responses deny framing, referrers, and external resource connections.
- Lifecycle first: each Pipeline Card foregrounds title, current action, and one parent rail containing five equal independent stage bars: Change orange, Decision yellow, Planning green, Implementation blue, and Committed teal.
- Deterministic progress: each stage bar fills left-to-right from its own bounded completion signal. Unfilled space remains grey, and the Change journey is complete only when all required stages and outcome disposition are complete.
- Accessible stage identity: stage text is visually hidden on the rail. Hover and keyboard focus expose the stage name, state, and progress through tooltips and accessible names, so color is never the only semantic channel.
- Ready Checks on demand: selecting a started stage opens its attached stage-colored detail container, where per-standard Ready Checks explain that stage's deterministic fill. Future stages remain disabled.
- Blockers preserve stage color: blocked work appears only in the action line as `✕ Blocked — reason`; red is not a stage identity or progress fill.
- Brand and interaction color: one midpoint logo teal (`#4A9293`) owns ordinary interactive and focus accents, with `#58AAA7` for hover, while Add Change and the Change `+` action use the same darker logo-blue primary-action style with white text.
- Retro, not pure ASCII: use monospace typography, strong colors, pane borders, and low-noise horizontal bars.
- Split-screen friendly: users can keep Pi open while watching the pipeline in a browser.

## Deprecated UI surfaces

The following are not active product surfaces in this wave:

- persistent terminal card/widget stacks;
- status panel or status dock;
- standalone Board command or broad generated-view visualizer;
- Map or graph navigation UI;
- Product/System navigation panels;
- broad browser shell, direct source editor, or unrestricted Control Room;
- archived status UI commands.

Backend status and continuation remain available to agents through internal `wiki_state`, generated views derived from traces, loop outputs, and Ready Checks. Users see active work in the automatically opened dashboard, use `/wiki-dashboard` only to reopen or recover it, and continue work through `/wiki-resume` or normal conversation in Pi.

## Implementation observability

Trace Detail follows one Change Journey. Parallel workers appear as Assignment attempts beneath Planning-owned Work Items; they do not become additional semantic loops. Implementation detail separates worker execution from Integration and Exit Review so users can distinguish candidate work from accepted Change realization, conflict, quality, and content proof. Sprint views aggregate participating Change coverage without replacing Change accountability.

The default Activity Feed is a deterministic narrative projection over durable trace events and bounded live observations. Each meaningful item explains what happened, why it matters, and what happens next. Repeated low-value updates are coalesced, unknown raw payloads are omitted, and missing context is described honestly rather than inferred.

The Dev Log is a developer diagnostic layer for permitted externally observable actions. It is bounded, redacted before write, correlated to Change, Sprint, Work Item, worker, and attempt, and stored under runtime temp. It never exposes prompts, private reasoning, secrets, raw source contents, or unbounded output; it cannot satisfy quality standards or override trace truth. Retention follows runtime policy.

## Live preview

Planning binds frontend-impact Changes to canonical KB UI targets, routes, viewports, and approved project preview profiles. One profile may host several UI routes; several integrated Changes affecting the same UI share one target. When relevant Work Items reach Implementation, the extension-side Preview Coordinator starts or attaches to one project-owned loopback development server per profile/integration root, waits for readiness, and opens isolated browser sessions per requested target. Native development server owns rendering and HMR. CodeWiki owns target binding, supervision, target-specific browser opening, bounded logs, evidence capture, and cleanup.

Dashboard shows preview health, URL, target/UI ref, shared process ownership, browser adapter, exact integration Git/tree/working-tree state, contributing Changes, Sprints, and Work Items, requested viewports, failures, bounded logs, and target-specific Open/Capture plus profile-level Restart/Stop controls. Capture requires ready Playwright profile and verified browser. Manifest correlates screenshot, console, network, Git/integration tree, profile, target digest, route, viewport, contributing Change Trace refs, and latest relevant Implementation iterations. Only exited Planning data plus approved profile/target digests authorize startup. Captured evidence never approves an iteration automatically.

The baseline system-browser adapter is available to every supported installation. An optional Playwright CLI adapter opens an isolated headed session and enables explicit visual evidence without adding a `/wiki-preview` command. Before Open, CodeWiki runs a side-effect-free CLI probe. The dashboard distinguishes CLI unavailable, CLI ready but browser not opened, browser ready, and browser launch failure. Capture remains disabled until the browser session is verified. Missing capability shows explicit install guidance and Restart reruns the probe. CodeWiki does not silently install Playwright, Chromium, or another adapter. Preview lifecycle belongs to the extension-side coordinator rather than browser JavaScript, so closing the dashboard does not orphan managed resources. Trace closure, Pi session shutdown, or explicit Stop closes managed browser and server resources; captured operational manifests remain under `.codewiki/runtime/preview-evidence/`.

CodeWiki dashboard development uses `npm run dashboard:dev -- --project <external-project>` against a disposable fixture. The harness rejects source-root, ancestor, and descendant fixture paths, serves source assets with automatic reload, and invokes the same browser adapter without installing or loading CodeWiki in its own checkout.

## Change actions

The Change `+` action exposes exactly Resume, Change, and Resolve Blocker. Guarded requests deliver an allowlisted Change-scoped message to the active in-process Pi session through `pi.sendUserMessage()`. Busy sessions use steering semantics. Actions never require copy/paste, synthetic Enter, child SDK/RPC sessions, or semantic approval through delivery.

Change refines the current journey only while accountable outcome remains stable. Material new intent creates a linked Change Trace. Retries, route-backs, and blocker remediation stay inside the original Change event tree.

## Knowledge alignment

Each Change displays one generated topic-scoped alignment state: Aligned, Review Needed, Misaligned, or Unknown. Decision approval records scoped topic baseline; missing evidence yields Unknown. Relevant digest change yields Review Needed, never Misaligned alone. Misaligned requires grounded contradiction with affected layer, source refs, rationale, and recommended loop. Topic filters, Change detail, and related Sprint views show same projection.

## Configuration

The settings button opens a grouped accessible form covering every field already authorized by `DashboardEditableConfig`: workers, worktree isolation, automation, agency, budgets, model routing, and Pi host state. Controls show effective values, active limits, disabled authority-raising choices, validation errors, save state, and restart guidance. Form values compile to the existing allowlisted bounded patch; untouched values remain unchanged. Raw editable JSON and Close Dashboard are not settings UX.

Dashboard chrome must always communicate loading, live, stale/reconnecting, stopped, or failed/retrying state. Pi session startup opens the browser only once for the initial TUI startup; reload, session replacement, and stream reconnection reuse or restore the endpoint without spawning repeated tabs. Closing a browser tab does not mutate workflow truth. Host shutdown remains a Pi lifecycle concern rather than a dashboard settings action. `/wiki-dashboard` health-checks and reopens the view, and an explicit command may stop its local host. If the installed runtime differs from the code already loaded in Pi, reopening requires a full Pi process restart because `/reload` cannot replace cached package modules reliably.

## Success signals

- Backend architecture work does not depend on product UI surfaces.
- System diagrams can be rendered in Pi TUI as readable ASCII/Unicode.
- Diagram rendering stays source-backed and compact.
- One Work Pipeline uses one card per Change journey while clearly attaching Sprints, Work Items, Assignments, and evidence.
- Header chrome keeps one compact, optically centered row: a vertically centered logo, a bounded-width persistent search field with an integrated lifecycle-scope picker, a solid dark-blue Add Change CTA, and one settings control opening the grouped bounded form. Equal visual gutters separate the logo from the control group and the settings control from the header edge.
- The scope picker keeps its selected label readable, renders the trace count as smaller midpoint-teal secondary information, and applies the text query only within the selected All, Changes Backlog, Decision, Planning, Implementation, Committed, Blocked, or dynamically projected Product/System Knowledge topic scope; declared Sprint topics also appear as clickable card tags, and `/` focuses the same field.
- Pipeline Cards use a neutral outline, vertical-dot options, an explicit action line, five equal stage-owned progress bars with hidden accessible labels, and attached stage-colored detail. Overview, Knowledge Base, Files, Sprints, and previews remain Change-level attached panels.
- Open stage detail, focus, filters, and controls survive periodic state refreshes.
- Add Change and Change `+` share one primary-action component and interaction states.
- Open dashboards reflect durable trace progress automatically and recover from transient stream failures without opening duplicate tabs.
- Frontend-impact Sprints with approved `uiPreviewTargets[]` bindings reuse one loopback server per profile, open target-specific browser sessions when Implementation begins, and expose bounded health, integration, control, and evidence state in Sprint detail.
- The CodeWiki source dashboard can be tested live against an external fixture without self-installing the extension or creating active source-checkout traces.
- No renderer, preview, browser observation, or captured artifact becomes source of truth.

## Non-goals

- No persistent terminal widgets for CodeWiki state.
- No status panel or dock UI.
- No standalone Board or Map command surface; the Sprints Queue is a dashboard projection.
- No product/system navigation panel work.
- No broad generated-view visualizer.
- No dashboard trace mutation in the MVP.

## Related docs

- [System TUI and Dashboard UX](../../system/components/terminal-ui.md)
- [Loop Model](../../system/components/loop-model.md)
