---
type: Concept
title: Adapters and UI Component
description: Pi adapters and the local dashboard translate main-session Change work, guarded commands, and trace-backed views into CodeWiki API calls without owning canonical semantics.
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
- `src/dashboard/**` owns the local Changes, Traces, and Configuration browser projections, transport, and fail-closed command adapter.
- `src/cli/**` remains a temporary development harness, not a product adapter.

## Contracts

- Host-specific capabilities must fail closed when unsupported.
- The browser dashboard derives Changes from the Change Store and execution state from trace-backed API projections.
- Allowed Change/configuration mutations must call guarded CodeWiki APIs with same-origin capabilities, optimistic guards, idempotency, audit receipts, stale-state lockout, and secret redaction.
- The dashboard cannot gain shell, direct source-write, trace-append, merge, publication, source-promotion, controller-advancement, or kernel-relaxation authority.
- Repo-local CodeWiki extension loading stays disabled until the pinned-baseline self-dogfood gate passes.

## Flow links

- [Resume context boundary](../flows/resume-context-boundary.md)
- [Artifact claim wait/heartbeat](../flows/artifact-claim-wait-heartbeat.md)

## Related docs

- [System overview](overview.md)
- [Source map](source-map.md)
- [Component map](../diagrams/component-map.yaml)
