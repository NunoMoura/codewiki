---
id: spec.shared.overview
title: Shared Rules
state: active
summary: Shared documentation contract for maintaining codebase-wiki itself with research, specs, and roadmap.
owners:
- docs
updated: '2026-04-16'
---

# Shared Rules

## Canonical artifacts

- `docs/research/*.jsonl`: compact evidence capture
- `docs/specs/**.md`: intended system truth
- `docs/roadmap.json`: canonical mutable roadmap state
- `docs/index.md`: generated navigation surface
- `docs/roadmap.md`: generated roadmap view
- `.docs/task-session-index.json`: derived task-to-session metadata
- `.docs/`: generated metadata and event log

## Responsibility split

### Research

Research records short synthesized findings plus source links. It should stay compact, appendable, and directly reusable by roadmap or specs.

### Specs

Specs describe desired state. They should mirror meaningful ownership boundaries and stay readable enough for humans while being concrete enough for agents to compare against code.

### Roadmap

Roadmap tracks numbered tasks that close the gap between specs and implementation reality. Plans and drift should default to roadmap items instead of separate top-level doc classes. Audit workflows should be able to append new roadmap items without manual prose translation.

### Sessions

Pi sessions record execution history. codebase-wiki should not replace Pi's session JSONL model. Instead it should append custom task-link entries and derive local `.docs/task-session-index.json` metadata from them.

## Local decisions

Cross-cutting or local decisions should live in owning specs. No global ADR bucket by default.

## Archive stance

Archive is deprecated by default. Prefer git history, `.docs/events.jsonl`, and compact roadmap/research updates over large historical doc buckets.

## Related docs

- [Product](../product.md)
- [System Overview](../system/overview.md)
- [Package Surface](../package/overview.md)
- [Extension Runtime](../extension/overview.md)
- [Templates and Rebuild](../templates/overview.md)
- [Roadmap](../../roadmap.md)
