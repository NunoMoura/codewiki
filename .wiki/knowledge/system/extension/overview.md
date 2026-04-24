---
id: spec.extension.overview
title: Extension Runtime
state: active
summary: Extension owns bootstrap, four-tab status rendering, resume execution, and internal roadmap and session operations for repo-local wikis discovered from current cwd or targeted explicitly by repo path or picker.
owners:
- engineering
updated: '2026-04-21'
code:
- extensions/codewiki/index.ts
- extensions/codewiki/bootstrap.ts
- extensions/codewiki/templates.ts
---

# Extension Runtime

## Commands and tools

Desired public entrypoints:

- `/wiki-bootstrap`
- `/wiki-status`
- `/wiki-resume`
- `/wiki-config`
- `Alt+W`

Deprecated public command affordances should not remain visible once the canonical bootstrap/status/resume/config surface is stable.

Internal agent tools should stay minimal and ownership-oriented:

- `codewiki_setup`
- `codewiki_bootstrap`
- `codewiki_state`
- `codewiki_task`
- `codewiki_session`

## Runtime responsibilities

The extension should:

- resolve wiki root from the nearest ancestor containing `.wiki/config.json`
- target the enclosing git repo root for bootstrap when no wiki exists yet, else the current working directory
- infer first-pass brownfield boundary specs and project shape from repo structure during bootstrap
- load `.wiki/config.json`
- read authored specs under `.wiki/knowledge/`
- rebuild generated metadata under `.wiki/`
- preserve causality from authored goals to affected specs, surfaces, code areas, and verification signals
- compose deterministic status and resume views from generated state plus live session context
- treat roadmap as the top-level container and tasks as atomic work units
- append Pi custom session entries that link task work to current session
- read active task context from Pi session state at runtime
- generate derived `.wiki/roadmap-state.json` metadata for first-party and third-party UIs
- generate derived `.wiki/status-state.json` metadata for first-party and third-party UIs, including a repo-plus-health-circle header plus `Wiki`, `Roadmap`, `Agents`, and `Channels` sections
- render an optional one-line footer summary plus a panel-first status surface from the same deterministic state
- expose current Pi session work as at least one named manual agent row inside the status model
- keep external channel routing and secrets out of repo-owned truth while still surfacing a minimal add-plus-list channel model in the read model
- support a strong task `todo -> research -> implement -> verify -> done` loop grounded in roadmap and spec truth
- generate new task ids as `TASK-###` while accepting legacy `ROADMAP-###` lookups during migration

## Drift and execution expectation

The primary status experience should live in the live panel opened by `/wiki-status` or toggled by `Alt+W`.

That panel should:

- use a minimal header with repo label or switcher plus one health circle
- default to `Wiki` as the first tab
- show `Product`, `System`, and `Clients` groups with compact gray explanations in `Wiki`
- show a kanban roadmap grouped by todo, research, implement, verify, and done in `Roadmap`
- show execution ownership, mode, and constraints in `Agents`, using stable generated agent names instead of raw session ids as the primary label
- show only an add-channel affordance plus the list of already added channels in `Channels`
- keep `/wiki-config` as the separate configuration command instead of owning config in the status panel
- fall back to deterministic text output when interactive UI is unavailable

Heartbeat analysis should still prefer evidence-backed proposal and roadmap promotion over making the user pick between manual fix modes. When unresolved work is genuinely new, the extension should emit structured roadmap tasks through `codewiki_task` with `action='create'`; when an existing task already covers the delta, it should use `codewiki_task` updates instead of creating duplicates.

Task execution should resume through `/wiki-resume` from the current focused roadmap task when possible, otherwise from the next actionable open task or strongest new proposal, then drive research, implementation, and verification grounded in roadmap and spec truth before landing in done.

## Session linkage expectation

When a Pi session starts, focuses, progresses, blocks, or completes task work, the extension should link that session to the task through Pi custom session entries instead of modifying Pi's native session JSONL format.

Resume state should preserve enough context to restart work with low friction: focused task, last meaningful action, touched files when available, latest deterministic verification summary, and current loop phase.

Sessions should also be visible as agent rows inside the status model so users can tell who is doing what without inspecting raw session history.

Parent-owned roadmap truth still applies: sessions or future workers may report evidence, but the extension remains the authority that advances loop phases, mutates roadmap truth, and closes tasks.

## Related docs

- [Product](../../product/overview.md)
- [Package Surface](../package/overview.md)
- [Status Panel](../../clients/surfaces/status-panel.md)
- [Roadmap Surface](../../clients/surfaces/roadmap.md)
- [Templates and Rebuild](../templates/overview.md)
- [System Rules](../rules/overview.md)
- [Roadmap](../../../../wiki/roadmap.md)
