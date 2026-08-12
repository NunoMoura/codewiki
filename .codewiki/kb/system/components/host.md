---
type: System Component
title: Host Service
description: Owns long-lived local client transport, pairing, project discovery, channel delivery, and protocol bindings without owning project meaning.
status: stable
tags: [system, component]
codewiki_component: host
codewiki_source_patterns: ["src/host/**"]
codewiki_test_patterns: ["tests/host/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Host Service keeps accepted work reachable and reconnectable across interaction surfaces.
---
# Host Service

Host Service is the long-lived local front door for CodeWiki App, CLI, Pi, MCP Agent Clients, and collaboration channels. It owns protocol negotiation, client authentication, pairing, project registry, Runtime discovery, transport-level deduplication, reconnect cursors, deep links, redaction, and durable outbound delivery.

The executable `codewiki.host-registry@1.0.0` foundation persists one strict machine-level snapshot of actors, paired Client instances, authenticated-identity references, repository identities, and per-project Runtime route references. Writes use private files, an exclusive writer lock, atomic replacement, directory synchronization, and expected-generation CAS. Reads use one no-follow descriptor for metadata and bytes. Registry transitions preserve prior actor, pairing, and project records; cannot reassign stable identity, Client proof, repository route, or immutable timestamps; require audited update-time advancement for mutable state; and cannot reactivate disabled or revoked records. Reads and resolution reject unknown fields, malformed or oversized state, duplicate stable identities, ambiguous active Client pairings, unknown actors, disabled or revoked records, expired pairings, stale generations, future-dated snapshots, authentication-assertion drift, and unknown projects. A stale writer lock remains fail-closed until a trusted Host lifecycle owner proves recovery; elapsed local time alone does not grant lock removal authority.

Host authenticates the paired Client connection, resolves the accountable actor through stable Host mappings, and attaches separate actor and Client transport context before forwarding `codewiki.host-client@1.0.0` requests. The actor remains the same user or service across App, CLI, Pi, MCP, and channel Clients. Client kind and instance identify only the interface and paired installation or process. Registry resolution consumes only a trusted authentication-adapter assertion and never accepts a caller-supplied actor ID; matching an opaque authentication reference is not itself credential verification. When an Agent or service Client acts for a user, Host attaches an exact explicit delegation reference; it never derives authority from the interface or accepts self-declared actor context from an untrusted Client.

Each command also carries repository identity, target, expected digest, actor-scoped semantic idempotency key, expiry, requested capability, and bounded payload. Host owns Client-instance transport deduplication and authentication assertions; the selected per-project Runtime validates actor/delegation binding and determines authority, admission, route, and effects. Host never starts worker sessions, prepares worktrees from a handoff manifest, interprets completion helper names, or releases Claims on its own. It is not a scheduler, semantic Loop, project store, policy engine, delegation authority, Git mutator, Check evaluator, or model executor. Authentication adapters, credential storage, pairing issuance and revocation commands, delegation records, endpoint binding, origin and token enforcement, reconnect cursors, and durable delivery remain pending.

MCP 2026-07-28 is the preferred stateless Agent Client binding where supported. HTTP commands and queries plus cursor-based events serve first-party Clients. Collaboration adapters expose only capabilities they can represent safely. Closing a browser, terminal, or channel connection does not stop accepted Runtime work; reconnecting clients recover from durable operation identity and bounded snapshots rather than hidden conversation state.
