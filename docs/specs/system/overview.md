---
id: spec.system.overview
title: System Overview
state: active
summary: codewiki is organized around package surface, extension runtime, starter templates, and generated metadata.
owners:
- architecture
updated: '2026-04-17'
---

# System Overview

## Main boundaries

- package surface: one Pi extension plus one Pi skill
- extension runtime: four public commands, internal tools, rebuild orchestration, and prompt generation
- starter templates: canonical bootstrap contract for docs, config, roadmap, and rebuild script
- generated metadata: registry, backlinks, lint report, index, roadmap view, and roadmap-state read model

## Repo mapping

Current code maps into these owning areas:

- `extensions/codewiki/` owns runtime behavior and scaffolding helpers
- `skills/codewiki/` owns agent usage guidance
- `scripts/` owns smoke testing and generated rebuild helper in bootstrapped repos
- `docs/` owns desired-state contract for this package itself

## Runtime binding rule

- package may be installed globally or project-locally
- runtime binds to the nearest ancestor containing `.docs/config.json`
- `/wiki-bootstrap` targets enclosing git repo root when no wiki exists yet, else current working directory

## Simplified wiki model

This package now optimizes for only three canonical artifact classes:

- research JSONL for evidence
- specs markdown for desired state
- roadmap JSON as the top-level container for tracked delta/work
- task records inside roadmap as atomic work units with canonical `TASK-###` ids
- Pi sessions as native execution history linked to tasks through custom entries and live runtime reads
- `.docs/roadmap-state.json` as a read-only denormalized UI model layered on top of canonical roadmap and lint data, with active session focus overlaid at runtime

Legacy top-level buckets like plans, drift, decisions, and archive are intentionally collapsed or localized.

## Brownfield rule

For existing repos, bootstrap should infer first-pass ownership boundaries from actual code structure. Not every folder deserves a spec. Each stable boundary should have one canonical `overview.md` before deeper splits, and humans should then refine or collapse the inferred folders until they match real architecture seams.

## Related docs

- [Product](../product.md)
- [Package Surface](../package/overview.md)
- [Extension Runtime](../extension/overview.md)
- [Templates and Rebuild](../templates/overview.md)
- [Shared Rules](../shared/overview.md)
- [Roadmap](../../roadmap.md)
