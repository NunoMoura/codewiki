---
type: System Component
title: API
description: Defines one transport-neutral versioned command, query, operation, and event contract over semantic owners.
status: stable
tags: [system, component]
codewiki_component: api
codewiki_source_patterns: ["src/api/**"]
codewiki_test_patterns: ["tests/api/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/agent/retrieve-bounded-context.md
    rationale: API supplies bounded snapshot-bound project queries.
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: API supplies typed idempotent access to authoritative Runtime operations.
---
# API

API defines stable typed commands, bounded queries, durable operation responses, and projected events. Host transports, first-party Clients, and internal callers use the same semantic contract; no binding invents independent commands or lifecycle state.

Mutation envelopes bind authenticated principal, project, target, expected state, idempotency, expiry, requested capability, and bounded payload. Callers cannot supply canonical identity, actor authority, time, route, Verification outcome, or effect receipt. Accepted asynchronous commands return durable operation identity. Transport deduplication and Runtime semantic idempotency remain distinct.

Queries and events identify exact snapshot, provenance, coverage, truncation, staleness, and redaction. Cursor gaps trigger a fresh bounded snapshot rather than guessed replay. API delegates semantics and authority to owners and never becomes a second scheduler, store, policy engine, Loop, or execution engine.
