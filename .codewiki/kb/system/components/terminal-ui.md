---
type: Concept
title: Pi Terminal and Dashboard UX
description: CodeWiki uses the main Pi session for Change brainstorming and validation while independent trace runners execute accepted work and the local dashboard projects Changes, Traces, and Configuration.
tags:
  - codewiki
  - system
  - terminal
  - ui
timestamp: 2026-07-01T00:00:00Z
---
# Pi Terminal and Dashboard UX

CodeWiki keeps the main Pi session focused on user-agent communication. The conversation itself is the interaction workspace: the user and agent brainstorm possible Changes, persist useful candidates through `wiki_change`, validate exact revisions, and invoke `wiki_decide` without a persistent terminal widget competing for screen space. There is no separate Ideas Workspace.

The local dashboard opened by `/wiki-dashboard` has three product areas: Changes, Traces, and Configuration. Changes projects the durable Changes Backlog. Traces renders each accepted independent unit of work as a Sprint Trace and expands it into Trace Detail. Configuration exposes effective model, budget, autonomy, isolation, and runtime policy. The dashboard is a projection and guarded command surface over core APIs; it never owns workflow truth or writes source directly.

## Command-triggered surfaces

Active command direction is intentionally small. Each command has one direct slash form for Pi discovery; the older grouped namespace command is deprecated:

| Command | Purpose |
| --- | --- |
| `/wiki-dashboard [--no-open] [--json]` | Start or reuse the local Changes, Traces, and Configuration dashboard. |
| `/wiki-resume` | Continue from the trace-derived resume view, latest loop outputs, unmet Ready Checks, and source refs. |
| `/wiki-explain [target]` | Explain the whole project, a component, a flow, or a path from KB, OKF source ownership, mapped tests, trace refs, and quality summaries. |
| `/wiki-bootstrap` | Start CodeWiki in a greenfield or brownfield repository through explicit backend setup/bootstrap calls, then render a human ready summary. |
| `/wiki-config` | Inspect CodeWiki preferences/configuration; writes require explicit confirmation. |

There is no separate public status command or state alias. `wiki_state` remains an internal agent read tool. The user-facing state surface is the dashboard; allowed mutations still pass through guarded core capabilities rather than browser-owned state. `/wiki-resume` remains the high-frequency user continuation command.

## Change-to-trace lifecycle

The main session creates or refines mutable Changes in the Changes Backlog. Validation binds an exact Change revision and digest without creating a trace. When the user approves the exact Decision proposal and Decision Ready Checks pass, `wiki_decide` freezes the Change snapshot, creates the trace, and appends `decision.changes_approved` through the guarded runtime boundary.

The resulting Sprint Trace appears in the Traces queue and becomes independent from the main conversation. A trace-scoped runner performs Planning, coordinates parallel-safe Tasks and workers, integrates results, and runs authoritative Implementation validation. The user can continue brainstorming other Changes while one or more traces execute within configured concurrency, budget, isolation, and supervision limits.

A Sprint Trace is a horizontal completion bar backed by trace state. It foregrounds the questions users ask most often:

- What is currently active?
- How much work appears to remain?
- Which loop is running now?
- What are workers doing?
- What is blocked?

The bar is segmented by lifecycle phase: Decision, Planning, Implementation, and Archive. Filled segments have exited, the pulsing segment is current, and blocked phases show a blocker marker. Progress is deterministic and coarse; it is derived from trace status, planned work, worker claims, completed work items, blockers, and closure state. It must not pretend to be precise timing.

Expanding a Sprint Trace opens Trace Detail. Trace Detail shows title, current action, workers, work items, blockers, paths, decision refs, planning refs, and work-unit refs. The dashboard may support navigation, search, filtering, copying refs or `/wiki-resume --trace <id>` commands, and starting or stopping a supervised trace execution session. Runtime controls operate through exact state and session guards; they do not append traces or make workflow decisions directly. Semantic approvals remain separate and bound to exact rendered proposals.

## Local dashboard host

`/wiki-dashboard` starts a local HTTP server bound to `127.0.0.1` with a random URL token. The server exposes static browser assets, state and event streams for live refresh, and a narrow guarded command plane for allowed Change, configuration, and supervised runtime-session actions. It watches `.codewiki/traces` and the Changes Backlog ref, then rebuilds dashboard projections from core APIs.

Security boundaries:

- bind only to loopback;
- include a random token in API URLs;
- keep reads public only within the tokenized same-origin session;
- route any Change validation, configuration, or runtime-session command through guarded core APIs with exact same-origin capability checks, optimistic revision/digest or session guards, bounded input, idempotency, audit receipts, stale-state lockout, and secret redaction;
- do not enable CORS;
- never grant dashboard shell, direct source-write, merge, publication, source-promotion, controller-advancement, or kernel-relaxation authority;
- keep final Decision approval explicit and bound to the exact rendered proposal.

The visual style should be retro console inspired rather than pure ASCII: monospace layout, strong color semantics, high-contrast panels, and low-noise horizontal bars. The browser gives scroll, click, keyboard navigation, search, and split-screen observability without fighting terminal width or mouse limitations.

## Tool and trace rendering

Bootstrap keeps rich command rendering because it runs before a project has useful trace state. Explicit read commands such as `/wiki-resume`, `/wiki-explain`, and `/wiki-config` may render their requested view. After bootstrap, `wiki_*` tools should return compact agent handles; they should not own rich user observability or render preview output as product UX.

The durable user-facing path is state-boundary driven:

```text
main conversation -> wiki_change -> Changes Backlog
validated Change -> wiki_decide -> independent trace
trace append -> derived view -> Traces / Trace Detail surface
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
