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
  - tests/runtime/pi-extension.test.mjs
  - tests/runtime/pi-rpc-smoke.mjs
codewiki_role: browser_observability
codewiki_source_map:
  - id: dashboard
    source_patterns:
      - src/dashboard/**
    test_patterns:
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

The product progress surface is `/wiki-dashboard`, a local retro console-inspired browser view. It renders the Sprints Queue as ordered horizontal Sprint Trace bars and expands each Sprint Trace into Trace Detail.

## Dashboard principles

- Trace-first: trace JSONL is workflow truth, and Sprint Traces are projections over it.
- Read-only: dashboard navigation, search, filtering, and copy helpers do not append trace records.
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
- write-capable browser Control Room;
- archived status UI commands.

Backend status and continuation remain available to agents through internal `wiki_state`, generated views derived from traces, loop outputs, and Ready Checks. Users see active work through `/wiki-dashboard` and continue work through `/wiki-resume` or normal conversation in Pi.

## Success signals

- Backend architecture work does not depend on product UI surfaces.
- System diagrams can be rendered in Pi TUI as readable ASCII/Unicode.
- Diagram rendering stays source-backed and compact.
- The Sprints Queue shows Sprint Trace bars with coarse progress, current loop state, workers, blockers, and Trace Detail.
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
