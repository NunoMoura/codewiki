---
id: spec.system.components.api-facade
title: API Facade Component
state: active
component_id: api_facade
diagram_refs:
  - component-map:api
  - file-structure-map:api_facade
source_roots:
  - src/api/**
owners:
  - architecture
updated: "2026-06-01"
summary: Stable harness-independent facade for CodeWiki tools and package API entrypoints.
---

# API Facade Component

## Responsibility

The API facade is the stable boundary that exposes CodeWiki operations to adapters, scripts, UI surfaces, skills, CLI/MCP wrappers, and future harness integrations. It converts external requests into typed CodeWiki capabilities and keeps callers away from direct `.codewiki/` file mutation.

## Owned paths

- `src/api/**` re-exports stable use-case entrypoints.
- Concept roots such as `src/state/**`, `src/roadmap/**`, `src/session/**`, `src/build/**`, `src/gateway/**`, `src/runtime/**`, and `src/gc/**` own behavior behind the facade.

## Contracts

- Public agent tools use the `wiki_<name>` convention.
- Results should be compact envelopes with status, changed refs, artifact refs, next actions, and blocking questions.
- Large machine payloads belong in source refs, not chat output.
- Generated state is rebuilt through the state engine and is never hand-edited.

## Flow links

- [Decision to planning](../flows/decision-to-planning.md)
- [Planning to implementation](../flows/planning-to-implementation.md)
- [Resume context boundary](../flows/resume-context-boundary.md)
