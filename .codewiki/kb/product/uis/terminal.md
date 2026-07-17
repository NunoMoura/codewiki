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

CodeWiki is backend-first for the current architecture wave. The retained near-term UI direction is a focused Pi session plus a local browser dashboard. The Pi terminal remains the user-agent communication channel. The browser dashboard provides read-only observability over trace-backed work.

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

The product control and progress surface is a local retro console-inspired browser dashboard that opens automatically once when an eligible Pi TUI session starts. Its primary area is one Work Pipeline combining proposed Change cards with Sprint Trace cards without merging their canonical truth. A Change card is replaced by its linked Sprint Trace after Decision acceptance; Configuration remains a secondary area for effective model, budget, autonomy, isolation, and runtime policy. `/wiki-dashboard` remains the explicit reopen/recovery command and `/wiki-dashboard --stop` stops the local host.

## Dashboard principles

- Truth-backed: Change records are mutable pre-Decision truth, trace JSONL is accepted execution truth, and every dashboard view is a projection.
- Live: Change revisions and trace appends stream into the open dashboard immediately; bounded polling recovers automatically from missed or disconnected event streams without requiring reload.
- Guarded: navigation and observability are read-only; allowed Change, configuration, and supervised runtime-session commands call guarded core APIs with exact same-origin capabilities, optimistic state or session guards, bounded input, idempotency, audit receipts, stale-state lockout, and secret redaction. Runtime controls never approve semantic output directly.
- Local-private: the server binds to loopback, endpoint metadata is user-only, the launch capability travels in a URL fragment rather than the request URL, and responses deny framing, referrers, and external resource connections.
- Lifecycle first: each Pipeline Card foregrounds title, current action, and one parent rail containing five equal independent stage bars: Change orange, Decision yellow, Planning green, Implementation blue, and Committed teal.
- Deterministic progress: each stage bar fills left-to-right from its own bounded completion signal. Unfilled space remains grey, and the Sprint is complete only when all five bars are full.
- Accessible stage identity: stage text is visually hidden on the rail. Hover and keyboard focus expose the stage name, state, and progress through tooltips and accessible names, so color is never the only semantic channel.
- Ready Checks on demand: selecting a started stage opens its attached stage-colored detail container, where per-standard Ready Checks explain that stage's deterministic fill. Future stages remain disabled.
- Blockers preserve stage color: blocked work appears only in the action line as `✕ Blocked — reason`; red is not a stage identity or progress fill.
- Brand and interaction color: one midpoint logo teal (`#4A9293`) owns ordinary interactive and focus accents, with `#58AAA7` for hover, while Add Change and the Sprint `+` action use the same darker logo-blue primary-action style with white text.
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

Trace Detail keeps one authoritative Implementation Loop per Sprint Trace. Parallel workers appear beneath that loop as Work Item Assignment attempts; they do not become additional semantic loops. The Implementation view separates worker execution from Integration and Exit Review so users can distinguish local worker progress from aggregate acceptance, conflict, quality, and content-proof validation.

The default Activity Feed is a deterministic narrative projection over durable trace events and bounded live observations. Each meaningful item explains what happened, why it matters, and what happens next. Repeated low-value updates are coalesced, unknown raw payloads are omitted, and missing context is described honestly rather than inferred.

The Dev Log is a developer diagnostic layer for permitted externally observable actions. It is bounded, redacted before write, correlated to Sprint, Work Item, worker, and attempt, and stored under runtime temp. It never exposes prompts, chain-of-thought, secrets, raw source contents, or unbounded output; it cannot satisfy quality standards or override trace truth. Blocked and failed work retains diagnostics, while successful trace-host closure removes them.

## Sprint actions

The Sprint `+` action exposes exactly Resume, Change, and Resolve Blocker. When CodeWiki runs as a Pi extension, guarded requests deliver an allowlisted trace-scoped user message directly to the active in-process Pi session through `pi.sendUserMessage()`. Busy sessions use steering semantics. Actions never require copy/paste, synthetic Enter, an SDK child session, or an RPC session. Missing or stale session bridges disable the action with an explanation.

Change creates or reinforces mutable intent linked to the selected Sprint. It does not create a trace. Only exact validation and accepted Decision authority may create an amendment Sprint with `origin.kind: "amendment"` and `parentTraceId`. Retries, route-backs, and blocker remediation stay inside the original Sprint event tree.

## Knowledge alignment

Each Sprint displays one generated topic-scoped alignment state: Aligned, Review Needed, Misaligned, or Unknown. A relevant Knowledge topic digest change yields Review Needed, never Misaligned by itself. Misaligned requires an explicit grounded contradiction with affected layer, source-of-truth refs, rationale, and recommended next semantic loop. Legacy or insufficiently grounded Sprints report Unknown. Topic filters and Sprint detail must show the same projection.

## Configuration

The settings button opens a grouped accessible form covering every field already authorized by `DashboardEditableConfig`: workers, worktree isolation, automation, agency, budgets, model routing, and Pi host state. Controls show effective values, active limits, disabled authority-raising choices, validation errors, save state, and restart guidance. Form values compile to the existing allowlisted bounded patch; untouched values remain unchanged. Raw editable JSON and Close Dashboard are not settings UX.

Dashboard chrome must always communicate loading, live, stale/reconnecting, stopped, or failed/retrying state. Pi session startup opens the browser only once for the initial TUI startup; reload, session replacement, and stream reconnection reuse or restore the endpoint without spawning repeated tabs. Closing a browser tab does not mutate workflow truth. Host shutdown remains a Pi lifecycle concern rather than a dashboard settings action. `/wiki-dashboard` health-checks and reopens the view, and an explicit command may stop its local host. If the installed runtime differs from the code already loaded in Pi, reopening requires a full Pi process restart because `/reload` cannot replace cached package modules reliably.

## Success signals

- Backend architecture work does not depend on product UI surfaces.
- System diagrams can be rendered in Pi TUI as readable ASCII/Unicode.
- Diagram rendering stays source-backed and compact.
- One Work Pipeline uses a shared card shell while clearly labeling mutable Changes and independently executing Traces.
- Header chrome keeps one compact, optically centered row: a vertically centered logo, a bounded-width persistent search field with an integrated lifecycle-scope picker, a solid dark-blue Add Change CTA, and one settings control opening the grouped bounded form. Equal visual gutters separate the logo from the control group and the settings control from the header edge.
- The scope picker keeps its selected label readable, renders the trace count as smaller midpoint-teal secondary information, and applies the text query only within the selected All, Changes Backlog, Decision, Planning, Implementation, Committed, Blocked, or dynamically projected Product/System Knowledge topic scope; declared Sprint topics also appear as clickable card tags, and `/` focuses the same field.
- Pipeline Cards use a neutral outline, vertical-dot options, an explicit action line, five equal stage-owned progress bars with hidden accessible labels, and attached stage-colored detail. Overview, Knowledge Base, and Files remain Sprint-level panels.
- Open stage detail, focus, filters, and controls survive periodic state refreshes.
- Add Change and Sprint `+` share one primary-action component and interaction states.
- Open dashboards reflect durable trace progress automatically and recover from transient stream failures without opening duplicate tabs.
- No renderer output becomes source of truth.

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
