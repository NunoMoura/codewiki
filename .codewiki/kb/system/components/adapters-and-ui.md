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
- `src/dashboard/**` owns the unified Work Pipeline and Configuration browser projections, transport, and fail-closed command adapter.
- `src/cli/**` remains a temporary development harness, not a product adapter.

## Contracts

- Host-specific capabilities must fail closed when unsupported.
- The browser dashboard renders Change Store records and trace-backed execution state through one tagged Pipeline Card projection without merging their canonical truth.
- Allowed Change, configuration, and supervised runtime-session mutations must call guarded CodeWiki APIs with exact same-origin capabilities, optimistic state or session guards, bounded input, idempotency, audit receipts, stale-state lockout, and secret redaction.
- Resume, Change, and Resolve Blocker may cross an optional in-process Pi bridge only as allowlisted trace-scoped user messages delivered through `pi.sendUserMessage()`. The bridge follows `session_start`/`session_shutdown`, uses steering while busy, and fails closed when stale or absent.
- Dashboard actions never create SDK/RPC sessions, accept arbitrary prompts, approve semantic output, or append trace truth directly.
- Change actions create or reinforce mutable intent; only exact validation and accepted Decision authority may create amendment lineage.
- Configuration UI compiles grouped bounded form values to the existing allowlisted patch and cannot raise automation, agency, model, tool, host, or budget ceilings.
- The dashboard cannot gain shell, direct source-write, trace-append, merge, publication, source-promotion, controller-advancement, or kernel-relaxation authority.
- The CodeWiki source repository does not load its own extension during stabilization. Extension behavior is tested through packed installs in disposable external projects and released only after stable gates pass.

## Flow links

- [Resume context boundary](../flows/resume-context-boundary.md)
- [Artifact claim wait/heartbeat](../flows/artifact-claim-wait-heartbeat.md)

## Related docs

- [System overview](overview.md)
- [Source map](source-map.md)
- [Component map](../diagrams/component-map.yaml)
