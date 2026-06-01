---
id: spec.system.components.adapters-and-ui
title: Adapters and UI Component
state: active
component_id: adapters_ui
diagram_refs:
  - component-map:adapters
  - component-map:terminal_ui
  - file-structure-map:current_adapters
  - file-structure-map:current_ui
source_roots:
  - src/adapters/**
owners:
  - architecture
updated: "2026-06-01"
summary: Host adapters and user interfaces that delegate CodeWiki semantics to the API facade.
---

# Adapters and UI Component

## Responsibility

Adapters and UI surfaces translate host commands, panels, tools, and local views into CodeWiki API calls. They do not own canonical semantics; they preserve the same behavior across Pi chat/status panels, optional CLI/MCP wrappers, and future harnesses.

## Owned paths

- `src/adapters/**` owns host integration, tool/command registration, and current Pi-hosted status/config panels.

## Contracts

- Host-specific capabilities must fail closed when unsupported.
- Browser Control Room source has been removed; new user-facing semantics should target terminal-first Pi surfaces and shared API contracts.
- UI actions must route through CodeWiki tools rather than editing source truth directly.

## Flow links

- [Resume context boundary](../flows/resume-context-boundary.md)
- [Artifact claim wait/wake](../flows/artifact-claim-wait-wake.md)

## Related docs

- [System overview](../overview.md)
- [File structure](../file-structure.md)
- [Component map](../diagrams/component-map.yaml)
