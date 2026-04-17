---
id: spec.templates.overview
title: Templates and Rebuild
state: active
summary: Starter templates and rebuild script define canonical on-disk contract for bootstrapped repos.
owners:
- engineering
updated: '2026-04-17'
code_paths:
- extensions/codewiki/templates.ts
- scripts/rebuild_docs_meta.py
---

# Templates and Rebuild

## Bootstrap contract

Starter repos should receive:

- `.docs/config.json`
- `.docs/events.jsonl`
- `.docs/sources/`
- `docs/specs/**`
- inferred first-pass boundary `overview.md` files when bootstrap can recognize meaningful brownfield ownership seams
- `docs/research/*.jsonl`
- `docs/roadmap.json`
- `scripts/rebuild_docs_meta.py`

## Generated outputs

Rebuild should deterministically produce:

- `docs/index.md`
- `docs/roadmap.md`
- `.docs/registry.json`
- `.docs/backlinks.json`
- `.docs/lint.json`
- `.docs/roadmap-state.json` as a generated read-only roadmap/task UI model

## History strategy

Bootstrap should seed `.docs/events.jsonl`, and rebuild should preserve `.docs/events.jsonl` plus `.docs/roadmap-events.jsonl` as lightweight machine-readable history streams. The package should not generate a separate compact-history file by default; repos should rely on git for full diffs and these JSONL logs for concise event trails.

## Roadmap mutation support

Runtime should be able to append new roadmap tasks, update existing tasks, close existing tasks, preserve explicit task order, log event metadata, and rebuild generated outputs in one safe step. Starter roadmap seeds should use canonical `TASK-###` ids for task records.

## Session link support

Runtime should be able to append Pi custom session entries for task work, read active task context from Pi at runtime, generate `.docs/roadmap-state.json`, and surface current-session focus in widgets without changing Pi's native session JSONL schema. Generated roadmap and widget flows should tolerate legacy `ROADMAP-###` task ids while repos migrate to canonical `TASK-###` ids.

## Lint responsibilities

Rebuild should validate:

- required spec frontmatter
- roadmap entry shape and path references
- research entry shape and source links
- local markdown link health
- referenced code path existence

## Related docs

- [Product](../product.md)
- [System Overview](../system/overview.md)
- [Extension Runtime](../extension/overview.md)
- [Shared Rules](../shared/overview.md)
- [Roadmap](../../roadmap.md)
