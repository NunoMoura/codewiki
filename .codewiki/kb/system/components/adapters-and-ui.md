---
type: Concept
title: Adapters and UI Component
description: Standalone CLI, dashboard, optional Pi client, and future adapters connect to Project Runtime without owning canonical semantics or Runtime lifetime.
tags:
  - codewiki
  - system
  - components
  - adapters
  - ui
timestamp: 2026-07-30T00:00:00Z
---
# Adapters and UI Component

## Responsibility

Adapters translate user, host, model, and browser operations into bounded Project Runtime requests. They do not own canonical semantics, scheduling, or truth. Standalone CLI and dashboard are primary clients; optional Pi and future integrations use same bounded Runtime.

## Owned paths

- `src/runtime/**` owns only harness-neutral generic control-plane, scheduling, persistence, worker, Integration, recovery, and effect ports. It cannot own a Decision, Planning, or Implementation policy stack and cannot import Pi.
- `src/pi/**` owns Pi extension, embedded SDK, process-session, command, prompt, tool, and UI adapter implementations. It implements Runtime ports but cannot own Loop policy, Candidate construction, or canonical authority. The embedded adapter is exposed through `./pi-sdk`, not the harness-neutral root entrypoint.
- `src/dashboard/**` owns Work, Product, System, and Design projections, local transport, accessibility, and guarded user operations.
- `src/preview/**` owns project-native preview and browser adapter boundaries.
- `src/cli/**` is the planned clean-cut boundary for the approved primary standalone CodeWiki CLI.

## Client topology

```text
Standalone CLI ───────┐
Dashboard client ─────┼──> local Project Runtime
Optional Pi client ───┤              │
Future clients ───────┘              ├── Pi semantic/Model Check sessions
                                    ├── Implementation worker adapters
                                    └── guarded core/query APIs
```

One Pi conversation may connect or disconnect without becoming Project Runtime owner. The dashboard may remain available independently. Runtime decides whether work can continue from current supervision and unattended-execution policy. The target Pi tree groups adapter code under `coordinator/`, `sessions/`, `workers/`, and `ui/`; Loop-named adapter modules may exist only there and remain transport implementations, never a second Loop package.

## Contracts

- Host-specific capabilities fail closed when unsupported.
- Clients submit intent, evidence, authority, or explicit control requests; they never choose semantic routing or marshal repository-owned append authority.
- Dashboard and Pi clients share one project identity, current team WorkState snapshot, freshness status, idempotency contract, and guarded command plane.
- Dashboard actions never append Change operations or write source directly. They call guarded control-plane capabilities with exact same-origin capability, expected revision/digest, bounded input, idempotency key, and audit receipt.
- Product, System, and Design edits compile to deterministic Markdown/YAML patches, show a diff, validate canonical format, and enter the Change/Decision workflow before guarded application.
- The dashboard cannot accept arbitrary prompts, shell commands, credentials, semantic approval through message delivery, or unguarded authority-raising configuration. Assurance accepts bounded inline User Standards or user-selected source references through Runtime-owned retrieval; browser code never receives source credentials or fetches privileged sources directly. Distilled Standard text remains untrusted data, never a system prompt or executable input. Custom Code Checks select only approved templates with bounded parameters.
- The control plane—not browser JavaScript and not an attached Pi conversation—creates semantic sessions and implementation workers through configured adapters.
- Embedded semantic sessions remain read-only and return role-specific Candidates or Model Check outputs. Isolated implementation workers receive only Assignment-scoped mutation capability.
- Preview runners accept structured commands, approved profile digests, exact integration state, bounded loopback URLs, isolated browser session identifiers, and lifecycle cleanup.
- Visual artifacts remain implementation evidence and never imply semantic approval or business outcomes.
- A future provider-level pull-request adapter may publish a bounded Validation Bundle to an explicitly authorized draft review ref and re-observe ordinary reviews, inline comments, top-level comments, and Check annotations. CodeWiki does not implement one adapter per reviewer agent. The adapter cannot create canonical approval directly, move protected/project branches, auto-merge, or become workflow truth.
- Actionable provider review findings enter the same bounded Change intake used by user suggestions, Worker Report discoveries, and regressions. Runtime binds repository, pull request, exact head, actor, provider event, location, and source refs before deduplication and current-Change versus independent-Change routing. Reviewer severity/approval remains an asserted source claim.
- Provider review events become approval-receipt Evidence Records only after Runtime validates repository, pull request, exact head, authenticated actor/role, decision, bundle digest, event identity, and freshness. Dashboard and pull-request channels project one approval action rather than demanding duplicate approval.
- The Alignment Graph is a deterministic snapshot-bound projection; generated views, search indexes, graph layouts, and live observations remain disposable.
- The CodeWiki source checkout never loads its own extension during stabilization. Packed artifacts are exercised in disposable external projects.

## Review surfaces

CodeWiki dashboard is the canonical dossier and local review surface. Team projects may additionally use draft pull requests for broad visibility, inline code discussion, CODEOWNERS, CI, screenshots, short videos, preview links, arbitrary configured human/agent reviewers, and Approve / Request changes actions. Pull requests remain mutable provider projections; CodeWiki retains exact Evidence Record, Result, approval freshness, and Change lineage authority. Reviewer findings can propose or reinforce Changes but cannot become semantic pass, human approval, canonical severity, or priority by themselves.

Review publication is a separately authorized pre-exit evidence-gathering effect, not Integration, merge, release, or semantic acceptance. Projects without a provider, network, or team review policy remain fully functional through CodeWiki alone.

## Dashboard information architecture

- **Work / Backlog** renders source provenance, Decision readiness/state, defect/security classification, exact authority, overlap, missing information, urgency, expected impact, estimated effort, risk of inaction, confidence, freshness, explainable ordering, and approval receipts from one snapshot-bound Triage Projection.
- **Work / Planning** renders the bounded selected Change set, current Planning epoch, Sprints, Work Items, typed dependency/conflict/contribution edges, and safe execution frontier.
- **Work / Implementation** renders Work Item Claims, Assignments, worker sessions, isolation, live bounded activity, Integration, verification, acceptance, and Git proof.
- **Product / Users, Stories, and Dictionary** renders and edits canonical Product Markdown. Dictionary projects `.codewiki/kb/lexicon.md` directly and links exact terms from runtime explanations without creating another vocabulary store.
- **System** renders and edits canonical topology YAML and linked System Markdown.
- **Design / Guidelines and UIs** renders and edits the canonical design system and UI concepts.
- **Settings / Assurance / Standards and Checks** groups Custom Checks by exact source User Standard and closed Check Type; supports bounded text/source submission, source-to-clause review, Default Check coverage, Custom Model/Code Check proposals, applicability, and Knowledge refs; previews activation, Evidence, evaluator/guard capability, agent feedback, and cost; shows exact per-Check Assessments and Results; and guards `draft | active | disabled` lifecycle through Project Runtime. Every applicable active Custom Check is required.
- Change detail is a cross-cutting dossier rather than a private pipeline.

Accepted User Standard snapshots and Custom Check configuration remain protected Git-backed project truth, not dashboard state. Large/private source bytes remain external and content-addressed. Browser actions carry expected config digest, idempotency key, authenticated actor, and bounded proposal to Project Runtime. Dashboard renders exact source passages, generated Checks, unresolved clauses, config diff, guard behavior, and policy consequences before acceptance. A Candidate changing Standard or Check policy remains evaluated under protected-base policy and cannot disable its own assurance.

## Local transport and security

Project Runtime binds only to loopback or an equivalent user-private local socket. Endpoint metadata and capabilities are user-only. Browser mutation requests require same-origin authority and stale-state guards. CORS, public tunnels, public proposal endpoints, arbitrary iframe embedding, and external resource loading remain disabled by default.

## Flow links

- [Resume context boundary](../flows/resume-context-boundary.md)
- [Remote State Synchronization](../flows/remote-state-synchronization.md)
- [Live Preview Runtime](preview-runtime.md)
- [Change Intake and Backlog Triage](change-intake.md)
- [Custom Checks](custom-checks.md)

## Related docs

- [System overview](overview.md)
- [Runtime](runtime.md)
- [Session Coordination](session-coordination.md)
- [Source map](source-map.md)
- [Component map](../diagrams/component-map.yaml)
