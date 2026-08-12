---
type: System Component
title: API
description: Defines one transport-neutral versioned command, query, operation, and event contract over semantic owners.
status: stable
tags: [system, component]
codewiki_component: api
codewiki_source_patterns: ["src/api/**"]
codewiki_test_patterns: ["tests/runtime/api-protocol.test.mjs"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/agent/retrieve-bounded-context.md
    rationale: API supplies bounded snapshot-bound project queries.
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: API supplies typed idempotent access to authoritative Runtime operations.
---
# API

API defines stable typed commands, bounded queries, durable operation responses, and projected events through `codewiki.host-client@1.0.0`. Host transports, first-party Clients, and internal callers use the same semantic contract; no binding invents independent commands or lifecycle state.

Host-attached request context keeps accountable actor identity separate from Client transport identity. `actorId` and `authenticatedIdentityRef` answer who Runtime authorizes. `clientKind`, `clientInstanceId`, and `authenticationRef` answer how the request arrived. `delegationRef` records an explicit grant when an Agent or service Client acts for an actor; a Client interface is never itself the actor and cannot silently inherit actor authority.

Command envelopes bind repository identity, target, expected digest, actor-scoped semantic idempotency key, expiry, requested capability, and bounded payload. Payloads cannot supply identity, authentication, delegation, authority, Runtime time, route, Verification outcome, or effect receipt. Accepted asynchronous commands return durable operation identity. Host transport deduplication is scoped to Client instance and transport request, while Runtime semantic idempotency is scoped to actor and complete command meaning; changing Clients does not change accountable command identity.

Queries and events identify exact snapshot, provenance, coverage, truncation, staleness, and redaction. Cursor gaps trigger a fresh bounded snapshot rather than guessed replay. API delegates semantics and authority to owners and never becomes a second scheduler, store, policy engine, Loop, or execution engine.
