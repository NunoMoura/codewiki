---
id: spec.product.uis.graph-navigation
title: Deprecated Map Navigation UI
state: deprecated
summary: Deprecated Map/graph navigation UI expectations retained only as historical context during backend-first migration.
owners:
- product
- design
updated: '2026-06-04'
code_paths:
- src/adapters/pi/ui/manager.ts
- src/adapters/pi/commands
code_paths_mode: explicit_override
---

# Map Navigation UI

This UI surface is deprecated for now. CodeWiki is backend-first in the current architecture wave. The only retained UI direction is future Pi TUI ASCII/Unicode rendering of source-backed system diagrams. Do not add implementation or tests for this UI surface unless a new accepted decision reactivates it.


The Map navigation UI is the user-facing view over generated graph relationships. It should help users understand how CodeWiki knowledge, roadmap work, builds, validation, tests, and code paths relate without exposing `Graph` as the primary product label or turning generated state into hidden truth.

Terminal UI is the primary host for Map and trace views. Compact host panels may show smaller Map summaries or route to focused `/wiki trace` or `/wiki diagram` commands.

Agent navigation belongs to the system graph/API contract; this document covers the visual experience.

Product expectations:

- use `Map` as the user-facing label; keep graph terminology for source/advanced detail when needed,
- default to decision and KB relationships rather than the whole generated graph,
- show product docs, system docs, roadmap tasks, builds, validation, tests, and code paths around the current working set,
- offer broader graph slices, build DAG edges, stale links, drift, and artifact-kind filters as secondary controls,
- explain why a node, edge, missing link, or stale link matters,
- show affected product, system, roadmap, build, validation, test, and code layers,
- avoid broad context dumps,
- route from user intent to Decision Table rows, knowledge, roadmap work, builds, validation reports, tests, and code,
- make canonical source links visible through collapsed source disclosure,
- show sprint/task scoped map slices when agency is bounded to a cohort or single task.

The Map is an inspection surface, not an editor. Selecting a node or edge opens an inline detail card with source paths, relationship meaning, freshness, and smallest useful next reads. Canonical edits still flow through CodeWiki tools, API actions, and compiler loops.

## Success signals

- Users can see how KB docs relate to current work without understanding generated graph internals.
- Users can distinguish generated Map state from durable product/system truth.
- Map defaults to docs relationships and only expands to broader graph data by explicit control.
- UI panels use graph-backed relationships rather than duplicating canonical truth.
- Visual Map navigation supports horizontal and vertical alignment linters.

## Related docs

- [Low-Token Navigation](../stories/navigation.md)
- [Terminal UI](terminal.md)
- [Pi TUI Diagram Rendering](terminal.md)
- [Graph](../../system/graph.md)
