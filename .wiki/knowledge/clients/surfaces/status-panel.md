---
id: spec.extension.status-dock
title: Status Surfaces v4
state: active
summary: "`/wiki-status` and `Alt+W` open one live panel organized as Wiki | Roadmap | Agents | Channels, with a repo-plus-traffic-light header, an optional one-line footer summary, and separate `/wiki-config` configuration."
owners:
- engineering
updated: '2026-04-21'
code:
- extensions/codewiki/index.ts
- extensions/codewiki/templates.ts
- scripts/rebuild_docs_meta.py
---

# Status Surfaces v4

## Intent

codewiki should expose the minimum project status needed for humans and agents to answer four questions quickly:

- how aligned is intended wiki truth with current reality?
- what roadmap work is translating that truth into product-ready delivery?
- which agents or sessions are doing what right now?
- how and where will progress be communicated?

The primary status surface should therefore center on four tabs:

- `Wiki`
- `Roadmap`
- `Agents`
- `Channels`

`Wiki` is the tab users should visit most. It translates intent under `.wiki/knowledge/` into a compact inspection surface that shows each major bucket, its alignment state, and the specific drift note that explains why it needs attention.

## Primary UX rule

The first-party status surface is one live panel opened by either `Alt+W` or `/wiki-status`.

- `Alt+W` is the interactive shortcut.
- `/wiki-status` is the canonical public status command.
- both entrypoints should open the same live surface and the same repo context.
- when no repo-local wiki exists yet, `/wiki-status` may offer bootstrap or adopt guidance, but `/wiki-bootstrap` remains the explicit setup command.
- `/wiki-config` remains the separate configuration entrypoint.
- `/wiki-resume` is the canonical execution-resume command and should resume roadmap work according to current repo and focus.
- status tabs may link conceptually to configuration later, but the panel does not own configuration directly.

## Minimal header rule

The persistent panel header should stay minimal and show only:

1. repo name, with a repo switch affordance when multiple repos are available
2. one traffic-light circle for health

The header should not carry current-task text, progress bars, dense metrics, or long narrative text. Section-specific detail belongs inside the active tab.

## Source of truth rule

Canonical write surfaces remain:

- `.wiki/knowledge/**`
- `.wiki/roadmap.json`
- Pi session task-link entries and related lifecycle events for live execution context

Deterministic read models for status work include:

- `.wiki/graph.json` as primary derived relationship graph and shared view substrate
- `.wiki/lint.json`
- `.wiki/roadmap-state.json`
- `.wiki/status-state.json`

`.wiki/status-state.json` is the deterministic status read model consumed by the footer summary, the live panel, and any future third-party UI. It should denormalize repo status for display, but it should not become a second source of truth.

User-owned delivery preferences, repo pinning, and external channel secrets are runtime configuration, not repo-owned wiki truth.

## `.wiki/status-state.json` contract

The generated status read model should remain deterministic and should not require an LLM. It should contain enough structured data to render:

- repo header state:
  - repo label
  - health circle color
  - candidate repo switch targets when known
- `wiki` section:
  - three talkable groups: `Product`, `System`, and `Clients`
  - all relevant authored docs distributed across those groups in a three-column layout
  - circle-only drift indicators for each doc row
  - linked spec path
  - compact mapped code area
  - related roadmap task ids
  - short drift explanation on the row when needed
  - `wiki/shared` may remain authored separately on disk but should be surfaced under the `System` talkable section until a broader taxonomy migration happens
- `roadmap` section:
  - fixed kanban columns for `Todo`, `Research`, `Implement`, `Verify`, and `Done`
  - task cards ordered implicitly within those columns
  - per-card title, low-emphasis task id, current agent name when known, blocker light, and compact verification or evidence cue when useful
  - arrow-key cursor movement within columns, including empty columns
  - Enter opens a reusable detail window for the selected task
- `agents` section:
  - active named agent rows
  - stable generated agent name rather than raw session id as the primary label
  - current task title with low-emphasis task id
  - execution mode (`manual`, `autonomous`, or `policy_driven`)
  - current status such as active, idle, blocked, waiting, or done
  - last meaningful action
  - compact constraint summary such as token budget, event trigger, or review gate
- `channels` section:
  - add-channel affordance
  - list of already added channels
  - compact status or target summary when known
- optional footer summary state:
  - one-line text intended only for the Pi footer
  - visibility mode such as `auto`, `pin`, or `off`

## Wiki tab rule

`Wiki` is the default and highest-signal tab.

It should show three top-level groups:

- `Product`
- `System`
- `Clients`

Each group should contain the relevant authored docs as compact rows, ordered by importance and risk rather than alphabetically.

Each row should show:

- one traffic-light circle
- spec title and linked path
- compact code-area or ownership hint
- related roadmap task chips when present
- one short explanation only when it helps disambiguate the row

The tab should avoid a repeated gray explanatory preamble above the content. If a reminder is ever needed, it should be one short line directly under the tabs, not one per section.

For now the authored folder name remains `wiki/ux` on disk, but the panel should speak in terms of `Clients` so human, CLI, MCP, and agent-facing consumption layers live under one clearer concept.

## Roadmap tab rule

`Roadmap` should answer:

- what state is each task in right now?
- what is blocked?
- who owns each moving task?
- what needs research, implementation, or verification next?

The tab should use a kanban-style board organized by the same progression users see in task status:

- `Todo`
- `Research`
- `Implement`
- `Verify`
- `Done`

Each task card should show:

- title
- low-emphasis task id
- assigned agent name when known
- blocker state via traffic-light circle only
- compact evidence or verification cue when useful

The roadmap tab should render as the kanban board itself with no extra prose summary above or below the columns. Heartbeat jargon should not appear in the user-facing roadmap surface. `Blocked` is a task signal shown through the traffic-light system on the card, not a separate board column competing with the main progression model. Selected tasks should open a reusable detail window that can show fuller task context and task-local actions such as resume or block.

## Agents tab rule

`Agents` should answer: who is doing what and when?

The first version should at least surface current Pi session activity as a named agent row, even if all work is still manual.

Rows should make it easy to tell:

- which named agent owns the work
- which task title it is working on, with the task id de-emphasized
- whether execution is manual, autonomous, or policy-driven
- whether it is currently active, blocked, researching, implementing, verifying, or idle
- what constraint or trigger is shaping the work

The panel should not require users to inspect raw Pi session files to understand execution ownership.

## Channels tab rule

`Channels` should answer: which channels already exist, and how can a new one be added?

The first version should stay intentionally small:

- one add-channel affordance
- the list of channels already added

Pluggable routing still matters underneath, but the panel should not dump transport internals or configuration controls into the status surface. Hitting Enter on the add affordance should not bounce users into `/wiki-config`; channel creation and edits should happen through the same reusable detail-window pattern used elsewhere in the panel. Private delivery credentials remain outside repo-owned wiki files.

## Footer summary rule

The optional always-on status summary belongs only in the Pi footer.

It should stay one line and should only show the minimum ambient context needed outside the panel, such as:

- health color
- repo name
- current task title or next action

It should not duplicate the richer four-tab inspection surface.

## Panel configuration rule

Configuration remains a separate surface reached through `/wiki-config`.

That command should cover runtime concerns such as:

- footer summary visibility
- repo pinning or repo switching behavior
- panel density
- later tab-linked configuration when those behaviors are stable enough to deserve dedicated controls

Status tabs may link conceptually to those settings, but the live status panel does not own configuration directly.

## Session behavior

The footer summary and live panel should refresh on:

- session start
- turn start
- deterministic rebuild completion
- roadmap mutations
- task focus changes
- agent or session lifecycle changes
- channel routing changes
- footer visibility or panel density changes

When repo context and actionable work are clear at session start, codewiki should proactively surface the status panel or a compact resume card instead of waiting for manual status requests.

## Compatibility rule

Long-term public status and execution entrypoints should converge on:

- `/wiki-bootstrap`
- `/wiki-status`
- `/wiki-resume`
- `/wiki-config`
- `Alt+W` as the interactive shortcut for `/wiki-status`

Deprecated public commands should not define the long-term public workflow once bootstrap, status, resume, and config are stable.

## Related docs

- [Clients Overview](../overview.md)
- [Roadmap Surface](roadmap.md)
- [Package Surface](../../system/package/overview.md)
- [Extension Runtime](../../system/extension/overview.md)
- [Roadmap](../../../../wiki/roadmap.md)
