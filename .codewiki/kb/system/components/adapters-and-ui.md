---
id: spec.system.components.adapters-and-ui
title: Adapters and UI Component
state: active
component_id: adapters_ui
diagram_refs:
  - component-map:adapters
  - component-map:control_room_ui
  - file-structure-map:current_adapters
  - file-structure-map:current_ui
source_roots:
  - src/adapters/**
  - src/ui/**
owners:
  - architecture
updated: "2026-06-01"
summary: Host adapters and user interfaces that delegate CodeWiki semantics to the API facade.
---

# Adapters and UI Component

## Responsibility

Adapters and UI surfaces translate host commands, panels, tools, and local views into CodeWiki API calls. They do not own canonical semantics; they preserve the same behavior across Pi TUI/chat, legacy browser UI, CLI/MCP wrappers, and future harnesses.

## Owned paths

- `src/adapters/**` owns host integration and tool/command registration.
- `src/ui/**` owns UI read models and compatibility views.

## Contracts

- Host-specific capabilities must fail closed when unsupported.
- Browser Control Room is compatibility-only; new user-facing semantics should target terminal-first Pi surfaces and shared API contracts.
- UI actions must route through CodeWiki tools rather than editing source truth directly.

## Flow links

- [Resume context boundary](../flows/resume-context-boundary.md)
- [Artifact claim wait/wake](../flows/artifact-claim-wait-wake.md)
