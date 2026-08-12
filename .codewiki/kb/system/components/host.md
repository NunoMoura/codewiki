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

Each command carries protocol version, authenticated principal, project identity, target, expected digest, idempotency key, expiry, requested capability, and bounded payload. Host authenticates external principals and binds transport assertions; the selected per-project Runtime determines actor identity, authority, admission, route, and effects. Host never becomes a scheduler, semantic Loop, project store, policy engine, Git mutator, Check evaluator, or model executor.

MCP 2026-07-28 is the preferred stateless Agent Client binding where supported. HTTP commands and queries plus cursor-based events serve first-party Clients. Collaboration adapters expose only capabilities they can represent safely. Closing a browser, terminal, or channel connection does not stop accepted Runtime work; reconnecting clients recover from durable operation identity and bounded snapshots rather than hidden conversation state.
