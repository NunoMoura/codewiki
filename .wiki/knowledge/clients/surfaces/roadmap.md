---
id: spec.extension.roadmap-ui
title: Roadmap State and TUI
state: active
summary: Derived roadmap and status read models plus first-party Pi panel rules for a kanban-style roadmap surface with blockers, evidence, agent ownership, and resume visibility inside codewiki.
owners:
- engineering
updated: '2026-04-21'
code:
- extensions/codewiki/index.ts
- extensions/codewiki/templates.ts
- scripts/rebuild_docs_meta.py
---

# Roadmap State and TUI

## Intent

codewiki should keep roadmap and task truth in `.wiki/roadmap.json`, but it should also expose a stable read model and a compact first-party Pi surface so users can track the work that translates authored wiki truth into product-ready delivery. The roadmap should communicate accepted drift causally, not as a flat pile of disconnected tasks.

Inside the status panel, `Roadmap` should answer:

- what state is each task in?
- what is blocked?
- who owns each moving task?
- what needs research, implementation, or verification next?

## Canonical truth vs read model

Canonical truth remains:

- `.wiki/knowledge/**`
- `.wiki/roadmap.json`
- Pi session JSONL plus codewiki custom task-link entries

Read models remain:

- `.wiki/roadmap-state.json`
- `.wiki/status-state.json`

Those files exist so:

- the built-in codewiki footer summary and status panel can render quickly
- other UI extensions can consume status and roadmap state without mutating canonical files
- roadmap, task, and status data can be denormalized for display without changing the source model
- current session focus can be overlaid live from Pi without writing extra repo-owned caches
- accepted roadmap work stays distinct from lower-level heartbeat findings or draft proposals

## `.wiki/roadmap-state.json` contract

The derived roadmap read model should remain deterministic. It should expose at least:

- generation timestamp
- deterministic wiki health snapshot derived from lint output
- summary counts for total, open, blocked, in-progress, and done tasks
- ordered task id views for blocked, in-progress, todo, done, and recently updated tasks
- fixed task-state columns for `todo`, `research`, `implement`, `verify`, and `done`
- per-task denormalized display data including title, status, priority, kind, summary, labels, and spec or code links
- causal context linking tasks back to authored specs and next verification expectations when available
- current task state, latest evidence summary, and updated-at timestamp when available
- blocker signal and assigned agent name when known
- no repo-owned session index is required; current-session focus comes from Pi runtime state

## Surface behavior

The roadmap tab lives inside the same status panel opened by `/wiki-status` or `Alt+W`.

Default behavior should:

- keep the global header minimal and leave roadmap detail inside the tab
- render tasks as a kanban board grouped by the same task-state progression users see elsewhere instead of a prose working-set list
- show blocker state directly on task cards through the traffic-light system only
- show assigned agent names on cards when known
- avoid any extra prose summary above or below the board itself
- support cursor movement across columns, including empty columns, plus vertical scrolling through longer task stacks
- open a reusable detail window for the selected task when Enter is pressed
- let the detail window expose task-local actions such as resume or block without leaving the panel
- prefer the current session's focused task or current repo under cwd when relevant
- keep the most recently resolved wiki repo visible across global and new-session starts when cwd is outside a repo-local wiki root
- allow pinned fallback when Pi runs outside a repo-local wiki root
- surface one clear next action through resume behavior rather than a separate roadmap text block

## Progressive disclosure rule

The generated roadmap view remains available in docs, but the default Pi surfaces should not dump every task into the header or footer. The TUI should optimize for the questions:

- which tasks are in todo, research, implement, verify, or done now?
- what is blocked?
- who owns each active task?
- what should be resumed, researched, implemented, or verified next?

## Compatibility rule

The long-term public workflow should converge on:

- `/wiki-bootstrap`
- `/wiki-status`
- `/wiki-resume`
- `/wiki-config`
- `Alt+W` live panel toggle

Richer roadmap UI affordances may be added later, but they should consume the same canonical roadmap and task model, plus live Pi session focus, and the same derived `.wiki/roadmap-state.json` and `.wiki/status-state.json` contracts.

## Related docs

- [Extension Runtime](../../system/extension/overview.md)
- [Status Panel](status-panel.md)
- [Product](../../product/overview.md)
- [Clients Overview](../overview.md)
- [System Overview](../../system/overview.md)
- [Templates and Rebuild](../../system/templates/overview.md)
- [Roadmap](../../../../wiki/roadmap.md)
