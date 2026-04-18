---
id: spec.extension.overview
title: Extension Runtime
state: active
summary: Extension owns intelligent bootstrap, status, fix, review, and internal roadmap/session operations for repo-local codebase wikis discovered from current cwd.
owners:
- engineering
updated: '2026-04-17'
code_paths:
- extensions/codewiki/index.ts
- extensions/codewiki/bootstrap.ts
- extensions/codewiki/templates.ts
---

# Extension Runtime

## Commands and tools

Public commands should stay intentionally small:

- `/wiki-bootstrap`
- `/wiki-status`
- `/wiki-fix`
- `/wiki-review`
- `/wiki-code`

Internal agent tools may remain more granular:

- `codewiki_setup`
- `codewiki_bootstrap`
- `codewiki_rebuild`
- `codewiki_status`
- `codewiki_roadmap_append`
- `codewiki_roadmap_update`
- `codewiki_task_session_link`

## Runtime responsibilities

- resolve wiki root from the nearest ancestor containing `.wiki/config.json`
- target enclosing git repo root for bootstrap when no wiki exists yet, else current working directory
- infer first-pass brownfield boundary specs and project shape from repo structure during bootstrap
- load `.wiki/config.json`
- run configured rebuild command
- read generated registry and lint outputs
- compose intelligent status, fix, and review prompts from configured scopes and live metadata
- treat roadmap as the top-level container and tasks as atomic work units
- append Pi custom session entries that link task work to current session
- read active task context from Pi session state at runtime
- generate derived `.wiki/roadmap-state.json` metadata for first-party and third-party UIs
- render a compact first-party roadmap widget from the derived roadmap state without expanding the public command surface
- generate new task ids as `TASK-###` while accepting legacy `ROADMAP-###` lookups during migration

## Drift and fix expectation

`/wiki-status` should classify wiki health as green, yellow, or red and list per-spec drift signals. `wiki-fix` should use repo evidence first, ask only high-value clarifying questions when needed, emit structured roadmap tasks through `codewiki_roadmap_append` only when unresolved work is genuinely new, and use `codewiki_roadmap_update` when an existing task already covers the delta but needs mutation.

`/wiki-code` should resume implementation from the current focused roadmap task when possible, otherwise pick the next actionable open task, then queue implementation grounded in roadmap + spec truth without requiring a separate user-facing wiki mutation command.

## Session linkage expectation

When a Pi session starts, focuses, progresses, blocks, or completes task work, the extension should link that session to the task through Pi custom session entries instead of modifying Pi's native session JSONL format.

## Related docs

- [Product](../product.md)
- [Package Surface](../package/overview.md)
- [Roadmap State and TUI](roadmap-ui.md)
- [Templates and Rebuild](../templates/overview.md)
- [Shared Rules](../shared/overview.md)
- [Roadmap](../../roadmap.md)
