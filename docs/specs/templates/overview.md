---
id: spec.templates.overview
title: Templates and Rebuild
state: active
summary: Starter templates and rebuild script define canonical on-disk contract for bootstrapped repos.
owners:
- engineering
updated: '2026-04-17'
code_paths:
- extensions/codebase-wiki/templates.ts
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
- `.docs/task-session-index.json` when missing, and consume it when present
- `.docs/roadmap-state.json` as a generated read-only roadmap/task/session UI model

## Roadmap mutation support

Runtime should be able to mutate `docs/roadmap.json`, preserve explicit task order, log event metadata, and rebuild generated outputs in one safe step. Starter roadmap seeds should use canonical `TASK-###` ids for task records.

## Session link support

Runtime should be able to append Pi custom session entries for task work, update `.docs/task-session-index.json`, generate `.docs/roadmap-state.json`, and surface last-session metadata in generated roadmap views and widgets without changing Pi's native session JSONL schema. Generated roadmap views should tolerate legacy `ROADMAP-###` task-session keys while repos migrate to canonical `TASK-###` ids.

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
