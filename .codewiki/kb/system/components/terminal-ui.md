---
type: Concept
title: Pi Terminal and Dashboard UX
description: CodeWiki uses the main Pi session for Change conversation while an automatically opened dashboard projects Change journeys, Planning-created Sprints, Work Items, Assignments, evidence, and guarded controls from WorkState.
tags:
  - codewiki
  - system
  - terminal
  - ui
timestamp: 2026-07-01T00:00:00Z
---
# Pi Terminal and Dashboard UX

CodeWiki keeps the main Pi session focused on user-agent communication. The conversation itself is the interaction workspace: the user and agent brainstorm possible Changes, persist useful candidates through `wiki_change`, validate exact revisions, and invoke `wiki_decide` without a persistent terminal widget competing for screen space. There is no separate Ideas Workspace.

An eligible Pi TUI session automatically starts the local dashboard and opens its browser view once on initial process startup. The primary Work Pipeline projects one card per Change journey, with attached Decision, Sprint, Work Item, Assignment, Implementation, Knowledge, file, preview, and outcome detail derived from WorkState. Configuration remains secondary. The dashboard is a projection and guarded command surface over core APIs; it never owns workflow truth or writes source directly.

## Automatic and command-triggered surfaces

Active command direction is intentionally small. Each command has one direct slash form for Pi discovery; the older grouped namespace command is deprecated:

| Command | Purpose |
| --- | --- |
| `/wiki-dashboard [--no-open] [--json] [--stop]` | Reopen/reuse the automatic Work Pipeline dashboard, return its URL without opening, or stop its local host. |
| `/wiki-resume` | Continue from the trace-derived resume view, latest loop outputs, unmet Ready Checks, and source refs. |
| `/wiki-explain [target]` | Explain the whole project, a component, a flow, or a path from KB, OKF source ownership, mapped tests, trace refs, and quality summaries. |
| `/wiki-bootstrap` | Start CodeWiki in a greenfield or brownfield repository through explicit backend setup/bootstrap calls, then render a human ready summary. |
| `/wiki-config` | Inspect CodeWiki preferences/configuration; writes require explicit confirmation. |

There is no separate public status command or state alias. `wiki_state` remains an internal agent read tool. The user-facing state surface is the automatically opened dashboard; `/wiki-dashboard` remains a reopen/recovery action rather than a prerequisite. Closing a browser tab leaves workflow truth untouched, the dashboard Close action or `/wiki-dashboard --stop` stops the local host, and a later `/wiki-dashboard` starts and reopens it. Allowed mutations still pass through guarded core capabilities rather than browser-owned state. `/wiki-resume` remains the high-frequency user continuation command.

## Change-to-outcome lifecycle

The main session explicitly persists useful intent through `wiki_change`. First persistence creates one Change Trace. Decision-loop iterations refine and validate complete semantic revisions in that trace. Exact user approval appends `decision.change_approved`; it does not create a Decision entity, Sprint, or second trace.

Before approval, the Change appears in the Changes Backlog view. After approval, the same Pipeline Card and Change identity continue through Planning and Implementation. Planning observes the relevant approved-Change portfolio and creates Sprints and Work Items. Runtime grants Assignments, coordinates workers/integration, and asks Implementation to accept or reject realization evidence. The main session may continue discussing other Changes while runtime remains supervised and event-driven.

A Pipeline Card is one Change Journey projection. It foregrounds the questions users ask most often:

- What is currently active?
- How much work appears to remain?
- Which loop is running now?
- What are workers doing?
- What is blocked?

The parent progress rail contains five equal independent bars: Change orange, Decision yellow, Planning green, Implementation blue, and Committed teal. Each bar preserves its stage color and fills left-to-right from bounded Change-level progress. Unfilled space remains grey. A Change journey is complete only when all required stages and outcome disposition are complete. Sprint progress remains an attached Planning/execution projection. Red never replaces stage identity.

Stage text is visually hidden on the rail. Every bar exposes its name, state, and progress through hover/focus tooltip and accessible name. Started stages are interactive; future stages are disabled. Selecting a stage opens one attached detail container whose tag and outline use that stage color. Ready Checks live inside the selected stage. Overview, Knowledge Base, and Files remain Sprint-level panels outside stage ownership.

Collapsed cards contain title, vertical-dot options, a current action line, the Change `+` primary action, and the parent rail. Non-zero active Sprint, Work Item, and worker facts may join the action line. Blocked work renders only as `✕ Blocked — reason`; it does not turn a stage red. Open detail, focus, filters, and controls survive refreshes.

Expanding a Change opens Trace Detail. Trace Detail shows revisions, exact approval, Sprint memberships, Work Items, Assignments, blockers, paths, loop refs, evidence, outcome disposition, and current action. The Change `+` action exposes exactly Resume, Change, and Resolve Blocker. With the optional in-process Pi bridge, the dashboard submits an allowlisted Change-scoped user message to the same active session through `pi.sendUserMessage()`. It never creates another session, submits arbitrary prompts, or treats delivery as semantic approval.

Change creates or reinforces intent in the current journey when accountable outcome remains stable; materially new intent creates a linked Change Trace. Retries, route-backs, and blocker remediation remain branches inside the original Change event tree.

Each Change exposes generated topic-scoped Knowledge alignment: Aligned, Review Needed, Misaligned, or Unknown. Digest change yields Review Needed only. Misaligned requires a grounded contradiction naming affected layer, source refs, rationale, and recommended loop. Topic filters, Change detail, and related Sprint views consume the same projection.

## Local dashboard host

Initial Pi TUI `session_start` starts a local HTTP server bound to `127.0.0.1` with a random URL token and opens the browser once. Reload and session replacement restore the same endpoint without opening duplicate tabs. `/wiki-dashboard` uses the same start/reuse path for explicit reopen; an explicit Pi command may stop the host, but dashboard settings do not own host shutdown. The server exposes static browser assets, state and event streams for live refresh, and a narrow guarded command plane for allowed Change, configuration, supervised runtime-session, and same-session action delivery. It watches `.codewiki/traces`, relevant KB/config/source/Git signals, and runtime observations, then rebuilds WorkState-backed dashboard projections through core APIs.

Security boundaries:

- bind only to loopback;
- include a random token in API URLs;
- keep reads public only within the tokenized same-origin session;
- route any Change validation, configuration, or runtime-session command through guarded core APIs with exact same-origin capability checks, optimistic revision/digest or session guards, bounded input, idempotency, audit receipts, stale-state lockout, and secret redaction. Mutation requests must carry an exact `Origin`; when the dashboard's `no-referrer` response policy causes Chromium to omit `Origin`, the server accepts only the browser fallback pair of exact loopback `Host` and `Sec-Fetch-Site: same-origin`. Missing, foreign, or contradictory authority metadata fails closed;
- do not enable CORS;
- never grant dashboard shell, direct source-write, merge, publication, source-promotion, controller-advancement, or kernel-relaxation authority;
- keep final Change approval explicit and bound to the exact rendered revision and digest.

The visual style should be retro console inspired rather than pure ASCII: monospace layout, high-contrast neutral cards, branded stage color, and low-noise horizontal bars. The compact header has no title or filter-tile row: it vertically centers the logo beside one bounded-width persistent search field, an integrated lifecycle/topic scope picker with a smaller midpoint-teal count, a solid dark logo-blue Add Change CTA, and one settings control. Add Change and Sprint `+` use the same primary-action component. The control group is optically centered with equal visual gutters. Search applies only within the selected lifecycle or Product/System Knowledge topic scope, and `/` focuses the same field.

Settings opens a grouped accessible form over every `DashboardEditableConfig` field: workers, worktree isolation, automation, agency, budgets, model routing, and Pi host state. Controls display effective values, active bounds, disabled authority-raising choices, validation errors, save progress, receipts, and restart guidance. Form serialization preserves untouched and unset values and compiles only to the existing allowlisted bounded patch. Raw editable JSON and Close Dashboard are removed from header UX.

## Tool and trace rendering

Bootstrap keeps rich command rendering because it runs before a project has useful trace state. Explicit read commands such as `/wiki-resume`, `/wiki-explain`, and `/wiki-config` may render their requested view. After bootstrap, `wiki_*` tools should return compact agent handles; they should not own rich user observability or render preview output as product UX.

The durable user-facing path is state-boundary driven:

```text
main conversation -> wiki_change -> Change Trace + Backlog view
exact Change approval -> same Change Journey advances
Planning epoch -> Sprint and Work Item views
Assignment/Implementation append -> realization progress
successful trace_close + Git restore ref -> Committed Change
```

Semantic loop preview results are agent-private validation drafts. Only appended trace records should update post-bootstrap lifecycle observability. Live frontend preview is a separate operational browser capability: it may project health and explicitly captured implementation evidence, but it cannot grant semantic approval or append trace truth directly.

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
- No dashboard semantic trace writes in the MVP; stopping the local dashboard host is lifecycle control, not workflow mutation.
- No status panel or dock UI.
- No standalone Board or Map product UI.
- No Product/System navigation panel work.
- No full generated graph renderer by default.
- No hidden terminal-only workflow state.

## Related docs

- [Product TUI Diagram Rendering](../../product/uis/terminal.md)
- [Loop Model](loop-model.md)
- [API Tool Surface](api-tools.md)
