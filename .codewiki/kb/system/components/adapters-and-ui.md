---
type: Concept
title: Adapters and UI Component
description: Pi, dashboard, CLI, and future harness adapters connect to the CodeWiki project control plane without owning canonical semantics or runtime lifetime.
tags:
  - codewiki
  - system
  - components
  - adapters
  - ui
timestamp: 2026-06-30T00:00:00Z
---
# Adapters and UI Component

## Responsibility

Adapters translate user, host, model, and browser operations into bounded CodeWiki control-plane requests. They do not own canonical semantics, project scheduling, or truth. The local dashboard is a first-class client of the same project control plane used by Pi sessions and future integrations.

## Owned paths

- `src/runtime/**` owns harness-neutral control-plane and execution-adapter contracts.
- `src/pi/**` owns Pi extension, embedded SDK, process-session, command, prompt, and tool integration. The embedded adapter is exposed through `./pi-sdk`, not the harness-neutral root entrypoint.
- `src/dashboard/**` owns Work, Product, System, and Design projections, local transport, accessibility, and guarded user operations.
- `src/preview/**` owns project-native preview and browser adapter boundaries.
- `src/cli/**` remains a temporary development/test client until an explicit product CLI is approved.

## Client topology

```text
Pi extension clients ─┐
Dashboard client ─────┼──> local project control plane
CLI/test clients ─────┘              │
                                     ├── semantic session adapters
                                     ├── implementation worker adapters
                                     └── guarded core APIs
```

One Pi conversation may connect or disconnect without becoming project runtime owner. The dashboard may remain available independently. Runtime decides whether work can continue from current supervision and unattended-execution policy.

## Contracts

- Host-specific capabilities fail closed when unsupported.
- Clients submit intent, evidence, authority, or explicit control requests; they never choose semantic routing or marshal repository-owned append authority.
- Dashboard and Pi clients share one project identity, current WorkState generation, idempotency contract, and guarded command plane.
- Dashboard actions never append trace events or write source directly. They call guarded control-plane capabilities with exact same-origin capability, expected revision/digest, bounded input, idempotency key, and audit receipt.
- Product, System, and Design edits compile to deterministic Markdown/YAML patches, show a diff, validate canonical format, and enter the Change/Decision workflow before guarded application.
- The dashboard cannot accept arbitrary prompts, shell commands, public URLs, credentials, semantic approval through message delivery, or authority-raising configuration.
- The control plane—not browser JavaScript and not an attached Pi conversation—creates semantic sessions and implementation workers through configured adapters.
- Embedded semantic sessions remain read-only and return candidates. Isolated implementation workers receive only Assignment-scoped mutation capability.
- Preview runners accept structured commands, approved profile digests, exact integration state, bounded loopback URLs, isolated browser session identifiers, and lifecycle cleanup.
- Visual artifacts remain implementation evidence and never imply semantic approval or business outcomes.
- Generated views, search indexes, graph layouts, and live observations remain disposable projections.
- The CodeWiki source checkout never loads its own extension during stabilization. Packed artifacts are exercised in disposable external projects.

## Dashboard information architecture

- **Work / Backlog** renders proposal provenance, Decision state, exact authority, overlap, missing information, and approval receipts.
- **Work / Planning** renders the bounded approved-Change planning horizon, Sprints, Work Items, typed dependency/conflict/contribution edges, and ready parallel frontier.
- **Work / Implementation** renders Assignments, worker sessions, isolation, live bounded activity, integration, verification, acceptance, and Git proof.
- **Product / Users and Stories** renders and edits canonical Product Markdown.
- **System** renders and edits canonical topology YAML and linked System Markdown.
- **Design / Guidelines and UIs** renders and edits the canonical design system and UI concepts.
- Change detail is a cross-cutting dossier rather than a private pipeline.

## Local transport and security

The project control plane binds only to loopback or an equivalent user-private local socket. Endpoint metadata and capabilities are user-only. Browser mutation requests require same-origin authority and stale-state guards. CORS, public tunnels, public proposal endpoints, arbitrary iframe embedding, and external resource loading remain disabled by default.

## Flow links

- [Resume context boundary](../flows/resume-context-boundary.md)
- [Artifact claim wait/heartbeat](../flows/artifact-claim-wait-heartbeat.md)
- [Live Preview Runtime](preview-runtime.md)

## Related docs

- [System overview](overview.md)
- [Runtime](runtime.md)
- [Session Coordination](session-coordination.md)
- [Source map](source-map.md)
- [Component map](../diagrams/component-map.yaml)
