---
type: Concept
title: Adapters and UI Component
description: Pi adapters and the local read-only dashboard translate host commands, tools, and trace-backed views into CodeWiki API calls without owning canonical semantics.
tags:
  - codewiki
  - system
  - components
  - adapters
  - and
  - ui
timestamp: 2026-06-30T00:00:00Z
---
# Adapters and UI Component

## Responsibility

Pi adapters and the local dashboard translate host commands, tools, and trace-backed views into CodeWiki API calls. They do not own canonical semantics; future CLI/MCP wrappers must preserve the same core behavior.

## Owned paths

- `src/pi/**` owns Pi host integration plus tool, command, prompt, and TUI registration.
- `src/dashboard/**` owns the local read-only Sprints Queue browser projection and transport.
- `src/cli/**` remains a temporary development harness, not a product adapter.

## Contracts

- Host-specific capabilities must fail closed when unsupported.
- The browser dashboard is read-only and must derive state from trace-backed API projections.
- Mutation remains in guarded CodeWiki tools and APIs; UI state cannot edit source truth directly.
- Repo-local CodeWiki extension loading stays disabled until the pinned-baseline self-dogfood gate passes.

## Flow links

- [Resume context boundary](../flows/resume-context-boundary.md)
- [Artifact claim wait/heartbeat](../flows/artifact-claim-wait-heartbeat.md)

## Related docs

- [System overview](overview.md)
- [Source map](source-map.md)
- [Component map](../diagrams/component-map.yaml)
