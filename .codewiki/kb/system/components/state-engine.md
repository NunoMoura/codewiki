---
id: spec.system.components.state-engine
title: Graph Engine Component
state: active
component_id: state_engine
diagram_refs:
  - component-map:state_engine
  - file-structure-map:state_graph_resume_concept_root_boundary
source_roots:
  - src/graph/**
  - src/state/**
owners:
  - architecture
updated: "2026-06-03"
summary: Generated graph, lenses, freshness, drift, routing, and resume context read models.
---

# Graph Engine Component

## Responsibility

The graph engine reads CodeWiki source refs and emits generated read models. It builds `.codewiki/index_graph.json`, trace/task routing lenses, status summaries, semantic closure views, automation-readiness contracts, and resume context packets.

## Owned paths

Target source is `src/graph/**`. Current compatibility source is `src/state/**` until the structure migration moves graph-only behavior and routes non-graph concerns to their owning roots.

Generated outputs are `.codewiki/index_graph.json` and compatibility task shards under `.codewiki/roadmap/tasks/**`.

## Contracts

- Generated views are never canonical truth.
- Agents use graph lenses for routing, then read linked sources directly before semantic edits or gate verdicts.
- The graph indexes KB, telemetry traces, source/test facts, runtime coordination, and Git refs.
- Compiler output can refresh graph state as pending evidence; only gate pass promotes loops.
- Resume context is source-backed and preferred over chat-history compaction or VCC recall.

## Flow links

- [Resume context boundary](../flows/resume-context-boundary.md)
- [Implementation, validation, and close](../flows/implementation-validation-close.md)

## Related docs

- [System overview](../overview.md)
- [Graph](../graph.md)
- [File structure](../file-structure.md)
- [Component map](../diagrams/component-map.yaml)
