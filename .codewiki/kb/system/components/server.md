---
type: System Component
title: CodeWiki Server
description: Owns Client authentication, connections, pairing, transport, project routing, and delivery without owning project meaning.
status: stable
tags: [system, component]
codewiki_component: server
codewiki_source_patterns: ["src/server/**"]
codewiki_test_patterns: ["tests/server/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: CodeWiki Server keeps accepted work reachable and reconnectable across Clients.
---
# CodeWiki Server

CodeWiki Server is the long-lived protocol edge for the App, CLI, Pi, Claude Code, Codex, and collaboration channels. It is an architectural sibling of each Project Runtime. Server and Runtime may share a process or machine, but co-location grants neither ownership over the other. One logical Server may route many Clients to one authoritative Runtime per managed project.

Server owns authentication adapters, secure sessions, Client pairing, protocol negotiation and envelope validation, Client-instance transport deduplication, project registry and Runtime-route resolution, reconnect cursors, deep links, redaction, and durable outbound delivery. It calls a narrow Runtime gateway and never reads Runtime persistence internals or mutates canonical project state directly. Runtime imports neither Server nor Client implementations.

Authentication proves the identity connecting now. Pairing durably enrolls one Client installation for one actor. A session represents one temporary authenticated connection. Runtime authorization independently determines whether the accountable actor may perform an exact project operation. Pairing therefore grants connection eligibility, not project capability. Interactive browser login may use authentication and a secure session without durable pairing; installed CLI, Pi, or MCP Clients normally require explicit pairing.

Personal loopback mode uses local pairing. Team mode uses provider-neutral OIDC with GitHub or GitLab OAuth as first adapters and stores stable provider `(issuer, subject)` identity rather than mutable usernames. Repository access supplies coarse project membership but neither authenticates an App request nor replaces exact Runtime AuthZ. CodeWiki does not initially implement passwords. Clerk, WorkOS, or similar hosted identity lifecycle services remain optional later adapters rather than foundational dependencies. Server owns secure session rotation, revocation, credential isolation, and provider access rechecks; credentials never enter project files, Runtime commands, model context, or Pairing records.

A pairing record binds only pairing identity, accountable actor, Client kind and instance, opaque authentication and authenticated-identity references, status, issuance time, and optional expiry. It contains no password, OAuth token, raw proof, model credential, Runtime role, delegation grant, or project permission. Issuance derives actor identity only from a trusted authentication assertion and active identity mapping. Revocation disables the exact Client binding without deleting actor history. Raw proof remains transient.

Server separates authentication, pairing, sessions, and registry responsibilities. Authentication verifies transient proof and returns a strict trusted assertion. Pairing applies issue or revoke enrollment transitions. Sessions own temporary authenticated connections through the Server-owned `codewiki.server-session@1.0.0` contract: one digest-only credential binding carries the exact actor, Client, project, Runtime route, generation, issuance, update, expiry, and revocation state. Rotation and revocation use generation CAS, endpoint policy sees no credential, and successful endpoint authorization yields only bounded actor and Client request context plus the policy-adapter identity. Session records contain no raw credential, proof, role, capability, delegation, or Runtime grant. Registry persistence atomically records actors, pairings, project identities, and Runtime routes with private files, no-follow reads, exclusive writer locking, atomic replacement, directory synchronization, generation CAS, and append-preserving stable-identity transitions.

Server attaches separate actor and Client transport context before forwarding `codewiki.client-server@1.0.0` requests. `actorId` and `authenticatedIdentityRef` identify whom Runtime authorizes. `clientKind`, `clientInstanceId`, and `authenticationRef` identify how the request arrived. An Agent or service acting for a user requires an exact delegation reference; Client kind, repository access, pairing, job title, profile, model identity, and transport never imply authority.

Server never starts Worker sessions, prepares Runtime workbenches, releases Claims, schedules semantic descendants, evaluates Checks, mutates Git, selects Runtime routes, or executes models. MCP 2026-07-28 is the preferred stateless binding where supported. In MCP-specific documentation, “host” may name MCP's normative protocol role; it is not a CodeWiki architecture role. Closing a Client connection does not stop accepted Runtime work, and reconnect uses durable operation identity and bounded snapshots rather than hidden conversation state.
