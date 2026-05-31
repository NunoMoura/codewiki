---
id: spec.system.components.state-engine
title: State Engine Component
state: active
component_id: state_engine
diagram_refs:
  - component-map:state_engine
  - file-structure-map:state_graph_resume_concept_root_boundary
source_roots:
  - src/state/**
owners:
  - architecture
updated: "2026-06-01"
summary: Generated graph, roadmap/task views, resume context packets, and read-model builders.
---

# State Engine Component

## Responsibility

The state engine reads canonical CodeWiki sources and emits generated read models. It builds `.codewiki/index_graph.json`, task context shards, status summaries, semantic closure views, and resume context packets.

## Owned paths

- `src/state/**` owns readers, graph builders, lenses, local rebuild runner, and resume context assembly.
- `.codewiki/index_graph.json` and `.codewiki/roadmap/tasks/**` are generated outputs.

## Contracts

- Generated views are never canonical truth.
- Agents use graph state for routing and then read linked sources directly before semantic edits.
- Resume context is source-backed and preferred over chat-history compaction or VCC recall.

## Flow links

- [Resume context boundary](../flows/resume-context-boundary.md)
- [Implementation, validation, and close](../flows/implementation-validation-close.md)
