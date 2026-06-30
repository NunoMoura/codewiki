---
type: Concept
title: Adapters and UI Component
description: Adapters and UI surfaces translate host commands, panels, tools, and local views into CodeWiki API calls. They do not own canonical semantics; they preserve the same behavior across Pi chat/status docks, optional CLI/MCP wrappers, and future harnesses.
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

Adapters and UI surfaces translate host commands, panels, tools, and local views into CodeWiki API calls. They do not own canonical semantics; they preserve the same behavior across Pi chat/status docks, optional CLI/MCP wrappers, and future harnesses.

## Owned paths

- `src/adapters/**` owns host integration, tool/command registration, and current Pi-hosted status/config panels.

## Contracts

- Host-specific capabilities must fail closed when unsupported.
- Browser Control Room source has been removed; new user-facing semantics should target terminal-first Pi surfaces and shared API contracts.
- UI actions must route through CodeWiki tools rather than editing source truth directly.

## Flow links

- [Resume context boundary](../flows/resume-context-boundary.md)
- [Artifact claim wait/heartbeat](../flows/artifact-claim-wait-heartbeat.md)

## Related docs

- [System overview](../overview.md)
- [Source map](../source-map.md)
- [Component map](../diagrams/component-map.yaml)
