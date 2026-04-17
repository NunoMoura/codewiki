---
id: spec.extension.roadmap-ui
title: Roadmap State and TUI
state: active
summary: Derived roadmap-state metadata and first-party Pi widget rules for compact roadmap and task visibility inside codebase-wiki.
owners:
- engineering
updated: '2026-04-17'
code_paths:
- extensions/codebase-wiki/index.ts
- extensions/codebase-wiki/templates.ts
- scripts/rebuild_docs_meta.py
---

# Roadmap State and TUI

## Intent

codebase-wiki should keep roadmap and task truth in `docs/roadmap.json`, but it should also expose a stable read model and a compact first-party TUI so users can track active work without leaving Pi or dumping the entire roadmap every turn.

## Canonical truth vs read model

Canonical write surfaces remain:

- `docs/roadmap.json`
- Pi session JSONL plus codebase-wiki custom task-link entries
- derived `.docs/task-session-index.json`

The extension should also generate a read-only UI model at `.docs/roadmap-state.json`.

That file exists so:

- the built-in codebase-wiki widget can render quickly
- other UI extensions can consume roadmap state without mutating canonical files
- roadmap/task/session data can be denormalized for display without changing the source model

## `.docs/roadmap-state.json` contract

The derived state should be versioned and include enough denormalized data for UI consumers to render roadmap summaries without reparsing multiple canonical files.

Minimum expectations:

- generation timestamp
- deterministic wiki health snapshot (`green`, `yellow`, `red`) derived from lint output
- summary counts for total/open tasks plus status and priority counts
- ordered task id views for open, in-progress, todo, blocked, done, and recently updated tasks
- per-task denormalized display data including title, status, priority, kind, summary, labels, spec/code links, and last session metadata when available

Other extensions may read this file, but codebase-wiki remains the only writer.

## Widget behavior

The first-party roadmap widget should stay ambient and compact.

Default behavior:

- render above the editor when roadmap state exists
- show wiki health plus compact counts
- show only a small working set instead of the full roadmap
- prefer the current session's focused task when known
- then show other in-progress tasks
- then show next todo tasks
- end with overflow text like `… and N more open tasks` when needed

## Progressive disclosure rule

The full roadmap remains available in docs and generated roadmap views, but the default Pi widget should not dump every task. The TUI should optimize for the question:

- what is focused now?
- what is already in progress?
- what is next?
- how much work is left?

## Compatibility rule

The public command surface stays:

- `/wiki-bootstrap`
- `/wiki-status`
- `/wiki-fix`
- `/wiki-review`

Roadmap/task TUI improvements should not require new public commands. Richer UI affordances may be added later, but they should consume the same canonical roadmap/task/session model and the same derived `.docs/roadmap-state.json` read contract.

## Related docs

- [Extension Runtime](overview.md)
- [Product](../product.md)
- [System Overview](../system/overview.md)
- [Templates and Rebuild](../templates/overview.md)
- [Roadmap](../../roadmap.md)
