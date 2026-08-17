---
type: User
title: Adapter Author
description: Integrator who connects a Client Integration, Core Adapter, or first-party Backend Plugin through typed CodeWiki boundaries.
status: stable
tags: [product, user, integration]
---
# Adapter Author

Adapter Authors implement first-party Clients, Server and MCP bindings, collaboration channels, repository or Workbench Core Adapters, model routes, delegated-harness adapters, or first-party Backend Plugins. They need stable contracts for commands, Stage Context, bounded direct and batch queries, events, authentication, Sessions, Pairing, capabilities, Candidate custody, Implementation Worker and Model Check execution, cancellation, usage, compaction provenance, process quiescence, and isolation.

A Backend Plugin may use Cordis internally inside the DSH Agent Runner but registers only one narrow CodeWiki capability. Raw Cordis context, Runtime persistence, canonical state handles, protected refs, credentials beyond an admitted opaque capability, and lifecycle transitions are outside its contract. Project files cannot install Backend Plugins.

Success means a new integration can participate without duplicating Runtime authority, a Stage Loop, scheduler, work queue, canonical store, context graph, policy engine, provider credentials, Check Result boundary, or guarded effects. A delegate or MCP adapter reports only facts it can prove and never upgrades partial child or External Agent Client custody into Backend-owned provenance.
