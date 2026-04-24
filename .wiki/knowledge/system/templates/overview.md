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

- `.wiki/config.json`
- `.wiki/events.jsonl`
- `.wiki/sources/`
- `.wiki/knowledge/**`
- inferred first-pass boundary `overview.md` files when bootstrap can recognize meaningful brownfield ownership seams
- `.wiki/evidence/*.jsonl`
- `.wiki/roadmap.json`
- `scripts/rebuild_docs_meta.py`

## Generated outputs

Rebuild should deterministically produce:

- `wiki/index.md`
- `wiki/roadmap.md`
- `.wiki/graph.json` as the primary derived relationship graph and shared view substrate
- `.wiki/lint.json`
- `.wiki/roadmap-state.json` as a generated read-only roadmap/task UI model
- `.wiki/status-state.json` as a generated read-only status summary/panel UI model

## History strategy

Bootstrap should seed `.wiki/events.jsonl`, and rebuild should preserve `.wiki/events.jsonl` plus `.wiki/roadmap-events.jsonl` as lightweight machine-readable history streams. The package should not generate a separate compact-history file by default; repos should rely on git for full diffs and these JSONL logs for concise event trails.

## Roadmap mutation support

Runtime should be able to append new roadmap tasks, update existing tasks, close existing tasks, preserve explicit task order, log event metadata, and rebuild generated outputs in one safe step. Starter roadmap seeds should use canonical `TASK-###` ids for task records.

## Session link support

Runtime should be able to append Pi custom session entries for task work, read active task context from Pi at runtime, generate `.wiki/roadmap-state.json` plus `.wiki/status-state.json`, and surface current-session focus in the status summary or panel without changing Pi's native session JSONL schema. Generated roadmap and status-surface flows should tolerate legacy `ROADMAP-###` task ids while repos migrate to canonical `TASK-###` ids.

## Lint responsibilities

Rebuild should validate:

- required spec frontmatter
- roadmap entry shape and path references
- research entry shape and source links
- local markdown link health
- referenced code path existence

## Related docs

- [Product](../../product/overview.md)
- [System Overview](../overview.md)
- [Extension Runtime](../extension/overview.md)
- [System Rules](../rules/overview.md)
- [Roadmap](../../../../wiki/roadmap.md)
