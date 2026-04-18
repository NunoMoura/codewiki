---
id: spec.shared.overview
title: Shared Rules
state: active
summary: Shared documentation contract for maintaining codewiki itself with research, specs, and roadmap.
owners:
- docs
updated: '2026-04-17'
---

# Shared Rules

## Canonical artifacts

- `wiki/research/*.jsonl`: compact evidence capture
- `wiki/specs/**.md`: intended system truth
- `wiki/roadmap.json`: canonical mutable roadmap state
- `wiki/index.md`: generated navigation surface
- `wiki/roadmap.md`: generated roadmap view
- `.wiki/roadmap-state.json`: derived roadmap/task UI read model
- `.wiki/`: generated metadata and event log

## Responsibility split

### Research

Research records short synthesized findings plus source links. It should stay compact, appendable, and directly reusable by roadmap or specs.

### Specs

Specs describe desired state. They should mirror meaningful ownership boundaries and stay readable enough for humans while being concrete enough for agents to compare against code.

### Roadmap

Roadmap is the top-level container for numbered tasks that close the gap between specs and implementation reality. Tasks are the atomic work units and canonically use `TASK-###` ids. Plans and drift should default to roadmap tasks instead of separate top-level doc classes. Audit workflows should be able to append new roadmap tasks without manual prose translation.

### Sessions

Pi sessions record execution history. codewiki should not replace Pi's session JSONL model. Instead it should append custom task-link entries and read current task context from Pi at runtime.

## Local decisions

Cross-cutting or local decisions should live in owning specs. No global ADR bucket by default.

## Archive stance

Archive is deprecated by default. Prefer git history for full diffs, `.wiki/events.jsonl` for compact lifecycle events, `.wiki/roadmap-events.jsonl` for roadmap mutation history, and compact roadmap/research updates over large historical doc buckets.

By default the package should not generate a separate compact-history artifact. If a repo later needs richer historical analytics, that should be introduced as explicit follow-up scope rather than quietly reviving archive docs.

## Related docs

- [Product](../product.md)
- [System Overview](../system/overview.md)
- [Package Surface](../package/overview.md)
- [Extension Runtime](../extension/overview.md)
- [Templates and Rebuild](../templates/overview.md)
- [Roadmap](../../roadmap.md)
