---
id: spec.system.components.roadmap-work-truth
title: Roadmap Work Truth Component
state: active
component_id: roadmap
component_ids:
  - roadmap
  - sprint_metadata
diagram_refs:
  - component-map:roadmap
  - file-structure-map:roadmap_concept_root_boundary
source_roots:
  - src/roadmap/**
owners:
  - architecture
  - product
updated: "2026-06-01"
summary: Canonical work queue, task lifecycle, sprint metadata, and task archive behavior.
---

# Roadmap Work Truth Component

## Responsibility

Roadmap truth records executable work, queue order, task status, sprint grouping, closure evidence, and archive records. It does not duplicate complete requirements or replace knowledge, builds, validation reports, or Git proof.

## Owned paths

- `src/roadmap/**` owns roadmap task mutation, status, store, and task-boundary helpers.
- `.codewiki/roadmap/queue.json` is canonical roadmap truth.
- `.codewiki/roadmap/tasks/**` is generated read-model state.

## Contracts

- Create or refine tasks through CodeWiki tools, not hand edits.
- Sprint metadata groups related executable tasks; it is not an umbrella task.
- Task close requires traceable intent, checks, implementation evidence, validation proof, and when policy requires it, clean immutable content proof.

## Flow links

- [Planning to implementation](../flows/planning-to-implementation.md)
- [Implementation, validation, and close](../flows/implementation-validation-close.md)

## Related docs

- [System overview](../overview.md)
- [File structure](../file-structure.md)
- [Component map](../diagrams/component-map.yaml)
