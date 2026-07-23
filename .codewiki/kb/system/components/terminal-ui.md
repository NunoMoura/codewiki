---
type: Concept
title: Project Dashboard and Pi Client Architecture
description: The dashboard and Pi extension are concurrent clients of one local CodeWiki project control plane that owns Work scheduling, execution sessions, guarded writes, and projections.
tags:
  - codewiki
  - system
  - dashboard
  - pi
  - client
timestamp: 2026-07-01T00:00:00Z
---
# Project Dashboard and Pi Client Architecture

The dashboard and Pi extension are clients of one project-scoped CodeWiki control plane. The control plane owns runtime lifetime, WorkState, scheduling, session creation, worker supervision, integration, guarded writes, and event projection. No active Pi conversation owns the project pipeline.

## Client surfaces

| Client | Responsibility |
| --- | --- |
| Dashboard | Primary Work, Product, System, and Design management interface. |
| Pi extension | Conversational Change intake, authority, explanation, supervision presence, and dashboard launch/reopen. |
| CLI/test client | Temporary development, CI, and external-install verification. |
| Future adapter | Same bounded control-plane protocol without changing core semantics. |

Several clients may connect concurrently. Each request carries project identity, capability, idempotency, and expected state where mutation is possible.

## Dashboard routes

```text
/work/backlog
/work/planning
/work/implementation
/product/users
/product/stories
/system/:diagram
/design/guidelines
/design/uis
/changes/:changeId
```

Work pages use distinct projections:

- Backlog joins pending Change revisions, proposal provenance, Decision state, overlap, authority, and intervention.
- Planning joins approved Changes, Planning epochs, Sprints, Work Items, dependencies, contribution, conflicts, integration boundaries, and readiness.
- Implementation joins claims, Assignments, session observations, workers, isolation, integration, checks, evidence, Git proof, and remediation.

Product, System, and Design routes render canonical Knowledge. Change detail is a cross-cutting dossier and never owns another copy of the runtime pipeline.

## Project service lifecycle

A local project service has one elected writer/coordinator generation. It binds only to loopback or a user-private local socket and stores user-only endpoint metadata under runtime scratch. Clients may ensure, discover, health-check, and connect to it.

Closing one client does not stop the service or mutate truth. Under supervised policy, loss of all approved supervision prevents new semantic-session and worker starts. Existing work follows explicit grace/cancellation policy. Intake, read projections, and recovery may remain available. Unattended continuation requires separate explicit project policy.

The service may quiesce or stop after policy-defined idleness because canonical truth permits deterministic rebuild. “Always available” means recoverable project capability, not mandatory permanent process residency.

## Runtime protocol

The local protocol exposes bounded capability groups:

- state snapshot and event stream;
- proposal and Change operations;
- exact authority responses;
- source-backed Product/System/Design edit proposals;
- runtime pause/resume/cancel controls allowed by policy;
- configuration below active authority ceilings;
- preview and browser lifecycle controls;
- diagnostics and bounded audit receipts.

Clients cannot select semantic loops, create arbitrary model sessions, submit arbitrary shell strings, append trace records, write source directly, merge, commit, publish, or relax policy. Runtime converts eligible canonical invariants into semantic and worker jobs.

## Pi execution

The target semantic adapter embeds Pi through its SDK. Each Decision, Planning, or Implementation-review job receives one runtime-built bounded context and read-only tool set. A closed candidate-submission tool returns typed output to runtime. Runtime validates freshness, quality, identity, and append authority before any durable write.

Implementation uses a separate worker adapter. Initial workers run as Pi child processes in isolated worktrees. Container workers become available where project risk or policy requires stronger process/filesystem isolation. Core runtime depends on adapter contracts, not Pi SDK types.

Main Pi conversations remain user-facing clients. They do not double as hidden Planning or worker sessions.

## Source-backed editing

Dashboard editors generate deterministic patches against exact Markdown/YAML digests. The service validates OKF or diagram schema, presents the diff, creates or revises a Change, and applies accepted edits only through guarded workflow authority. Unknown frontmatter and unsupported Markdown must survive round trips.

Generated search, relationship, and graph indexes are disposable. Standard OKF links remain untyped; CodeWiki relationship metadata and canonical diagram edges carry typed workflow/ownership semantics.

## Live updates

The control plane observes durable append boundaries, Knowledge/source/Git changes, claims, worker lifecycle, integration, preview state, and client supervision. Filesystem notifications trigger a canonical rescan; notification payloads are never trusted as truth.

State streams are bounded, redacted, reconnectable, and generation-aware. Missed events cause snapshot refresh. Raw prompts, private reasoning, credentials, unbounded logs, and raw source content are never broadcast.

## Local security

- Bind only to loopback or equivalent private local transport.
- Keep endpoint metadata and capabilities user-readable only.
- Require exact `Origin` or an explicitly validated browser same-origin fallback for mutations.
- Disable CORS and public tunnels by default.
- Deny framing, referrer leakage, external resource connections, and arbitrary browser profiles.
- Use closed schemas, input bounds, idempotency keys, freshness guards, audit receipts, and secret redaction.
- Treat proposal text and imported Knowledge as untrusted data, never execution authority.
- Do not imply that worktrees provide a security sandbox.

## Pi commands

The compact command surface remains:

| Command | Purpose |
| --- | --- |
| `/wiki-dashboard [--no-open] [--json] [--stop]` | Ensure, discover, reopen, inspect, or explicitly stop the local project service according to policy. |
| `/wiki-resume` | Continue from current WorkState and exact intervention or next safe action. |
| `/wiki-explain [target]` | Explain project, concept, component, flow, or source path from canonical Knowledge and refs. |
| `/wiki-bootstrap` | Initialize an external project through explicit guarded setup. |
| `/wiki-config` | Inspect or propose bounded configuration changes. |

`wiki_state` remains an internal agent read capability. Semantic candidate submission may move from active tools in the main conversation to closed tools inside runtime-created embedded sessions. Archive and runtime coordination remain backend capabilities.

## Rendering and accessibility

Browser rendering is a projection over WorkState and canonical inputs. It never creates UI-owned lifecycle state. Every graph has a structured list/table equivalent. Custom controls implement pointer, touch, keyboard, focus return, assistive semantics, zoom, high contrast, and reduced motion.

Pi TUI renderers remain compact read surfaces for bootstrap, configuration, explanation, resume, and status notices. They do not compete with the dashboard or become project truth.

## Non-goals

- No per-Change pipeline dashboard.
- No Pi-session-owned dashboard or scheduler.
- No arbitrary dashboard-to-conversation prompt injection.
- No dashboard-created SDK/RPC session chosen by browser input.
- No public network service or unauthenticated proposal endpoint.
- No canonical dashboard database, graph store, session registry, or WorkState file.
- No full Knowledge graph rendered by default.

## Related docs

- [Product Dashboard Contract](../../product/uis/terminal.md)
- [Runtime](runtime.md)
- [Session Coordination](session-coordination.md)
- [Adapters and UI](adapters-and-ui.md)
- [API Tool Surface](api-tools.md)
