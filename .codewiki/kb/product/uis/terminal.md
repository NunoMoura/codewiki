---
type: Concept
title: Pi Session and Retro Dashboard UI
description: CodeWiki keeps the Pi session focused on conversation and uses a retro local browser dashboard for read-only Sprint Trace observability.
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

The product control and progress surface is `/wiki-dashboard`, a local retro console-inspired browser view with Changes, Traces, and Configuration areas. Changes projects the durable Changes Backlog; Traces renders ordered horizontal Sprint Trace bars and expands each trace into Trace Detail; Configuration shows effective model, budget, autonomy, isolation, and runtime policy.

## Dashboard principles

- Truth-backed: Change records are mutable pre-Decision truth, trace JSONL is accepted execution truth, and every dashboard view is a projection.
- Live: Change revisions and trace appends stream into the open dashboard immediately; bounded polling recovers automatically from missed or disconnected event streams without requiring reload.
- Guarded: navigation and observability are read-only; allowed Change, configuration, and supervised runtime-session commands call guarded core APIs with exact same-origin capabilities, optimistic state or session guards, bounded input, idempotency, audit receipts, stale-state lockout, and secret redaction. Runtime controls never approve semantic output directly.
- Local-private: the server binds to loopback, endpoint metadata is user-only, the launch capability travels in a URL fragment rather than the request URL, and responses deny framing, referrers, and external resource connections.
- High signal: each bar shows phase, progress, worker count, blocker count, and current action.
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

Backend status and continuation remain available to agents through internal `wiki_state`, generated views derived from traces, loop outputs, and Ready Checks. Users see active work through `/wiki-dashboard` and continue work through `/wiki-resume` or normal conversation in Pi.

## Implementation observability

Trace Detail keeps one authoritative Implementation Loop per Sprint Trace. Parallel workers appear beneath that loop as Task Assignment attempts; they do not become additional semantic loops. The Implementation view separates worker execution from Integration and Exit Review so users can distinguish local worker progress from aggregate acceptance, conflict, quality, and content-proof validation.

The default Activity Feed is a deterministic narrative projection over durable trace events and bounded live observations. Each meaningful item explains what happened, why it matters, and what happens next. Repeated low-value updates are coalesced, unknown raw payloads are omitted, and missing context is described honestly rather than inferred.

The Dev Log is a developer diagnostic layer for permitted externally observable actions. It is bounded, redacted before write, correlated to trace, Task, worker, and attempt, and stored under runtime temp. It never exposes prompts, chain-of-thought, secrets, raw source contents, or unbounded output; it cannot satisfy quality standards or override trace truth. Blocked and failed work retains diagnostics, while successful trace-host closure removes them.

Dashboard chrome must always communicate loading, live, stale/reconnecting, or failed/retrying state. `/wiki-dashboard` returns a URL only after its endpoint serves pipeline state. If the installed pinned runtime differs from the code already loaded in Pi, the command requires a full Pi process restart because `/reload` cannot replace cached package modules reliably.

## Success signals

- Backend architecture work does not depend on product UI surfaces.
- System diagrams can be rendered in Pi TUI as readable ASCII/Unicode.
- Diagram rendering stays source-backed and compact.
- The dashboard clearly separates mutable Changes from independently executing Traces.
- The Traces queue shows Sprint Trace bars with coarse progress, current loop state, workers, blockers, and Trace Detail.
- Open dashboards reflect durable trace progress automatically and recover from transient stream failures.
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
