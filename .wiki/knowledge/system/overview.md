---
id: spec.system.overview
title: System Overview
state: active
summary: codewiki is organized around package surface, extension runtime, starter templates, and generated metadata.
owners:
- architecture
code_paths:
- extensions/codewiki
- skills/codewiki
- scripts
- .wiki
updated: '2026-04-20'
---

# System Overview

## Main boundaries

- package surface: one Pi extension plus one Pi skill
- extension runtime: panel-first status, internal tools, rebuild orchestration, prompt generation, and task/session operations
- starter templates: canonical bootstrap contract for docs, config, roadmap, and rebuild script
- generated metadata: graph-first derived views, lint report, index, roadmap view, and status/roadmap read models
- control loop: heartbeat analysis, drift proposal, roadmap promotion, and closure verification

## Repo mapping

Current code maps into these owning areas:

- `extensions/codewiki/` owns runtime behavior and scaffolding helpers
- `skills/codewiki/` owns agent usage guidance
- `scripts/` owns smoke testing and generated rebuild helper in bootstrapped repos
- `.wiki/knowledge/` owns desired-state contract for this package itself

## Runtime binding rule

- package may be installed globally or project-locally
- runtime binds to the nearest ancestor containing `.wiki/config.json`
- `/wiki-bootstrap` targets enclosing git repo root when no wiki exists yet, else current working directory

## Simplified wiki model

This package now optimizes for authored intent plus machine-managed operational state:

- `.wiki/knowledge/product/**`, `.wiki/knowledge/clients/**`, and `.wiki/knowledge/system/**` for canonical knowledge truth
- `.wiki/evidence/*.jsonl` for machine-managed validation evidence and heartbeat findings
- `.wiki/roadmap.json` for accepted tracked delta
- task records inside roadmap as atomic work units with canonical `TASK-###` ids
- Pi sessions as native execution history linked to tasks through custom entries and live runtime reads
- `.wiki/roadmap-state.json` as a read-only denormalized roadmap/task UI model
- `.wiki/status-state.json` as a read-only denormalized status/resume UI model

Legacy top-level buckets like plans, drift, decisions, and archive are intentionally collapsed or localized.

## Brownfield rule

For existing repos, bootstrap should infer first-pass ownership boundaries from actual code structure. Not every folder deserves a spec. Each stable boundary should have one canonical `overview.md` before deeper splits, and humans should then refine or collapse the inferred folders until they match real architecture seams.

## Operational loop

The package should evolve around three heartbeat lanes whose output preserves causality back to authored intent:

- product ↔ system at lower cadence for strategic architecture drift
- system ↔ code at higher cadence for implementation drift
- product + system ↔ UX at medium cadence for user-visible behavior drift

Heartbeat output should not become an opaque pile of detector noise. The system should either attach new evidence to existing roadmap tasks or promote clear accepted delta into roadmap work that explains:

- which authored goals are affected
- which owning specs are involved
- which code areas or UX surfaces are implicated
- what verification would prove closure

New-session startup should prefer immediate resume from repo context, current task focus, and fresh-enough heartbeat state instead of making users rediscover where work stopped.

## Related docs

- [Product](../product/overview.md)
- [Package Surface](package/overview.md)
- [Extension Runtime](extension/overview.md)
- [Templates and Rebuild](templates/overview.md)
- [System Rules](rules/overview.md)
- [Roadmap](../../../wiki/roadmap.md)
