---
id: spec.extension.overview
title: Extension Runtime
state: active
summary: Extension owns setup, bootstrap, rebuild, lint, status, and semantic audit prompting for repo-local codebase wikis discovered from current cwd.
owners:
- engineering
updated: '2026-04-17'
code_paths:
- extensions/codebase-wiki/index.ts
- extensions/codebase-wiki/bootstrap.ts
- extensions/codebase-wiki/templates.ts
---

# Extension Runtime

## Commands and tools

Extension should provide:

- `/wiki-setup`
- `/wiki-bootstrap`
- `/wiki-rebuild`
- `/wiki-lint`
- `/wiki-status`
- `/wiki-self-drift`
- `/wiki-code-drift`
- `/wiki-task`
- `codebase_wiki_setup`
- `codebase_wiki_bootstrap`
- `codebase_wiki_rebuild`
- `codebase_wiki_status`
- `codebase_wiki_roadmap_append`
- `codebase_wiki_task_session_link`

## Runtime responsibilities

- resolve wiki root from the nearest ancestor containing `.docs/config.json`
- target enclosing git repo root for setup/bootstrap when no wiki exists yet, else current working directory
- infer first-pass brownfield boundary specs from repo structure during setup/bootstrap
- load `.docs/config.json`
- run configured rebuild command
- read generated registry and lint outputs
- compose semantic audit prompts from configured scopes
- append Pi custom session entries that link task work to current session
- maintain derived `.docs/task-session-index.json` metadata

## Drift audit expectation

Audit commands should treat roadmap as current delta tracker. Findings that represent real unresolved work should be emitted as structured task objects and appended through `codebase_wiki_roadmap_append` when they are genuinely new.

## Session linkage expectation

When a Pi session starts, focuses, progresses, blocks, or completes task work, the extension should link that session to the task through Pi custom session entries instead of modifying Pi's native session JSONL format.

## Related docs

- [Product](../product.md)
- [Package Surface](../package/overview.md)
- [Templates and Rebuild](../templates/overview.md)
- [Shared Rules](../shared/overview.md)
- [Roadmap](../../roadmap.md)
