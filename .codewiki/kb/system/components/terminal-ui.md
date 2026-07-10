---
type: Concept
title: Pi Terminal and Dashboard UX
description: CodeWiki keeps the Pi session focused on user-agent communication while a local browser dashboard provides read-only Sprints Queue observability over trace-backed work.
tags:
  - codewiki
  - system
  - terminal
  - ui
timestamp: 2026-07-01T00:00:00Z
---
# Pi Terminal and Dashboard UX

CodeWiki keeps the Pi terminal session focused on the decision-host conversation. The user should be able to keep talking to the agent, add decisions, and approve loop output without a persistent terminal widget competing for screen space. Read-only work observability moves to a local browser dashboard opened by `/wiki-dashboard`.

The dashboard is trace-first. It renders each active unit of work as a Sprint Trace inside the Sprints Queue. The trace JSONL files remain workflow truth; the dashboard is only a live projection over `.codewiki/traces/TRACE-*.jsonl` and derived in-memory views.

## Command-triggered surfaces

Active command direction is intentionally small. Each command has one direct slash form for Pi discovery; the older grouped namespace command is deprecated:

| Command | Purpose |
| --- | --- |
| `/wiki-dashboard [--no-open] [--json]` | Start or reuse the local read-only browser dashboard for the Sprints Queue. |
| `/wiki-resume` | Continue from the trace-derived resume view, latest loop outputs, unmet Ready Checks, and source refs. |
| `/wiki-explain [target]` | Explain the whole project, a component, a flow, or a path from KB, OKF source ownership, mapped tests, trace refs, and quality summaries. |
| `/wiki-bootstrap` | Start CodeWiki in a greenfield or brownfield repository through explicit backend setup/bootstrap calls, then render a human ready summary. |
| `/wiki-config` | Inspect CodeWiki preferences/configuration; writes require explicit confirmation. |

There is no separate public status command or state alias. `wiki_state` remains an internal agent read tool. The user-facing state surface is the read-only dashboard. `/wiki-resume` remains the high-frequency user continuation command.

## Sprints Queue lifecycle

A Sprint Proposal contains Decisions that the user validates. When the Decisions are approved and Decision Ready Checks pass, CodeWiki appends trace records. The resulting Sprint Trace appears in the Sprints Queue. Planning turns approved Decisions into parallel-safe Tasks, and implementation progress updates the same Sprint Trace from appended evidence.

A Sprint Trace is a horizontal completion bar backed by trace state. It foregrounds the questions users ask most often:

- What is currently active?
- How much work appears to remain?
- Which loop is running now?
- What are workers doing?
- What is blocked?

The bar is segmented by lifecycle phase: Decision, Planning, Implementation, and Archive. Filled segments have exited, the pulsing segment is current, and blocked phases show a blocker marker. Progress is deterministic and coarse; it is derived from trace status, planned work, worker claims, completed work items, blockers, and closure state. It must not pretend to be precise timing.

Expanding a Sprint Trace opens Trace Detail. Trace Detail shows title, current action, workers, work items, blockers, paths, decision refs, planning refs, and work-unit refs. The dashboard may support navigation, search, filtering, and copying refs or `/wiki-resume --trace <id>` commands. It must not append traces or make workflow decisions directly.

## Local dashboard host

`/wiki-dashboard` starts a local HTTP server bound to `127.0.0.1` with a random URL token. The server exposes static browser assets, `GET /api/state`, and `GET /api/events` for live refresh. It watches `.codewiki/traces` and rebuilds dashboard state from project trace files.

Security boundaries:

- bind only to loopback;
- include a random token in API URLs;
- keep dashboard APIs read-only by default;
- do not enable CORS;
- keep trace writes and approvals in the Pi decision-host session.

The visual style should be retro console inspired rather than pure ASCII: monospace layout, strong color semantics, high-contrast panels, and low-noise horizontal bars. The browser gives scroll, click, keyboard navigation, search, and split-screen observability without fighting terminal width or mouse limitations.

## Tool and trace rendering

Bootstrap keeps rich command rendering because it runs before a project has useful trace state. Explicit read commands such as `/wiki-resume`, `/wiki-explain`, and `/wiki-config` may render their requested view. After bootstrap, `wiki_*` tools should return compact agent handles; they should not own rich user observability or render preview output as product UX.

The durable user-facing observability path is append-driven:

```text
approve Sprint Proposal -> append trace records -> update derived view -> render Sprints Queue / Sprint Trace surface
```

Preview results are agent-private validation drafts. Only appended trace records should update post-bootstrap user observability.

`src/pi/tui/index.ts` is a pure renderer facade for command renderers plus the CodeWiki footer status and legacy card renderers. It may be imported by commands/tests without writing state or depending on the Pi SDK. The active progress surface is the dashboard; no terminal widget state may become workflow truth.

Rendered terminal output should continue to use display-width-aware truncation so Pi notifications never exceed terminal width. Bootstrap and footer rendering should expose the active extension artifact so dogfood users can distinguish local checkout, project-local package, and non-project package execution. Rendered output is not canonical truth and must not create hidden UI-only state.

## Diagram rendering

Canonical diagrams live under `.codewiki/kb/system/diagrams/**` as YAML. Terminal renderers read those YAML files or generated view lenses derived from them.

Diagram rendering should prioritize interpretation over fidelity:

- architecture/component maps render as grouped lanes or focused neighborhoods,
- sequence flows render as ordered steps or simple swimlanes,
- state lifecycle maps render as states plus transitions,
- source maps render as trees,
- data models render as entity cards plus relation lists.

The renderer should use Unicode box drawing by default and ASCII fallback when needed. Renderer output is not canonical truth and must not create hidden UI-only state.

## Non-goals

- No persistent terminal widgets for CodeWiki state.
- No dashboard trace writes in the MVP.
- No status panel or dock UI.
- No standalone Board or Map product UI.
- No Product/System navigation panel work.
- No full generated graph renderer by default.
- No hidden terminal-only workflow state.

## Related docs

- [Product TUI Diagram Rendering](../../product/uis/terminal.md)
- [Loop Model](loop-model.md)
- [API Tool Surface](api-tools.md)
