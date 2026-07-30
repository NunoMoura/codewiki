---
type: Concept
title: Product
description: CodeWiki is a project-scoped intent-to-production alignment runtime that permits exact project state to advance only when required evidence is complete, fresh, and authorized.
tags:
  - codewiki
  - product
  - overview
timestamp: 2026-07-30T00:00:00Z
---
# Product

CodeWiki is an intent-to-production alignment runtime. It turns accepted user intent into an accountable transition of project Knowledge and implementation, then permits exact Git and delivery state to advance only when required alignment evidence is complete, fresh, and authorized.

> **A Change is accountable intent and a durable dossier. Runtime owns project-wide scheduling and progression.**

The product does not promise that ambiguous intent became perfect code. It provides bounded semantic checking, exact identity, provenance, guarded progression/effects, explicit uncertainty, and durable accountability.

## Product model

```text
typed Change operations
→ accepted Git-backed history
→ deterministic WorkState
→ rolling global Planning
→ first-class Alignment Graph
→ local views and bounded agent queries
```

CodeWiki has exactly three semantic Loops:

```text
Decision
Planning
Implementation
```

Every attempt follows:

```text
Change
→ Loop
→ Candidate
→ Evidence Records
→ Resolved Exit Policy
→ Checks
→ Check Results
→ Exit Report
→ Runtime Route
```

Runtime, synchronization, graph projection, Integration, recovery, archive, delivery, and learning are not additional Loops.

## Product structure

Dashboard destinations remain:

- **Work**: Backlog, Planning, and Implementation workspaces;
- **Product**: Users, Stories, and Dictionary from canonical Product Markdown;
- **System**: canonical System diagrams and component/flow Knowledge;
- **Design**: Guidelines and UIs from canonical design concepts.

Change detail remains available from every destination as a cross-cutting dossier. It explains exact intent, revisions, authority, Product/System/Design impact, Planning coverage, semantic attempts, Evidence, Checks, realization, Git/delivery proof, route-backs, repair provenance, and outcomes.

Dashboard state is a projection. It cannot become a hidden backlog, plan, graph, or workflow database.

## Change model

One logical Change history records one accountable outcome through immutable typed operations:

```text
intent and revisions
→ Decision Candidates and exits
→ rolling Planning bindings
→ Work Items, Work Item Claims, Assignments, and Worker Reports
→ guarded Integration and exact integrated-tree proof
→ Implementation Candidates and exits over exact integrated content
→ separately guarded Git and delivery effects
→ observed outcomes and feedback
```

Failed, indeterminate, stale, contradictory, withdrawn, and superseded history remains visible. A materially different outcome creates a linked Change instead of silently changing identity.

Change status derives from accepted operations. Users and agents cannot directly set acceptance, readiness, completion, Integration, or delivery state.

## Work model

Backlog is a generated intake/Decision surface. Concurrent proposal submission grants no approval, ownership, filesystem, model, or execution authority.

Decision proceeds independently per Change. Users may accept Change B while Change A executes.

Planning is rolling and project-wide. Each immutable Planning epoch observes the selected Change set, active Changes, Change Claims, Work Item Claims, Work Items, Assignments, dependencies, conflicts, current source/Knowledge state, capacity, and policy. It preserves safe active work and explicitly pauses, migrates, cancels, blocks, or routes back invalidated work.

Implementation consumes the safe execution frontier. Runtime may assign independent Work Items concurrently while serializing conflicts and shared Integration/effect targets. Workers produce asserted Worker Reports. Final assurance evaluates exact integrated content.

## Git-synchronized coordination

Accepted hot Change history synchronizes through provider-neutral Git:

```text
refs/heads/codewiki/state
```

Local work remains provisional until exact expected-head push succeeds. A stale rejection requires fetch, deterministic rebuild, and semantic reevaluation.

Terminal immutable segments archive through:

```text
refs/heads/codewiki/archive
```

Archive is pushed and verified before hot removal. Historical inspection hydrates read-only cache; reopening starts a new hot segment referencing archived closure.

GitHub, GitLab, Forgejo/Gitea, Bitbucket, bare SSH Git, and similar hosts may carry refs. Provider Issues, boards, pull requests, and webhooks remain collaboration projections or notifications, never semantic truth.

## Alignment Graph

The entire Alignment Graph artifact is derived, versioned, deterministic, and first-class. Every fact retains one source provenance class:

```text
canonical_binding
observed_binding
deterministic_analysis
inferred_analysis
```

Agents receive bounded read-only semantic queries tied to one graph snapshot. No arbitrary Cypher, graph mutation, canonical graph database, or graph file is required.

## Knowledge and OKF

OKF stores accepted Knowledge and a narrow authored relationship vocabulary:

```text
depends_on
constrains
refines
realizes
verifies
supersedes
derived_from
```

Ordinary Markdown links remain references. Dynamic Change/source/evidence/delivery relationships stay in Change operations and graph projection. Imported OKF remains untrusted until accepted through project authority.

## Runtime and clients

Primary boundary:

```text
CodeWiki CLI
+ Project Runtime
+ dashboard
+ embedded published Pi SDK
```

Pi extension remains an optional thin conversational client to the same Runtime. Future OpenClaw, MCP, editor, or CI integration must use the same bounded contracts.

Pi owns providers, credentials, model transport, sessions, compaction, tools, extensions, and ordinary Skills. CodeWiki owns Change protocol, WorkState, Loop Protocols, exact exit, Change Claims, Work Item Claims, Worker Workbenches, Integration, routing, archive, graph projection, and guarded effects.

## Compounding project intelligence

> **Completed Changes may improve future Changes.**

Archived history derives scoped Repair Episodes and recurring Repair Patterns. Future producers/workers may receive bounded relevant successful and harmful guidance.

Historical guidance cannot enter independent Model Checks, suppress Checks, lower thresholds, change activation, choose authority, or attest acceptance. Stable guidance enters Knowledge, Protocols, Checks, routes, config, source, or tests only through Lab ablation, sealed holdout proof, and an accountable Change.

No first-class Lesson, Memory, Todo, persistent Agent, Evidence aggregate, or fourth learning Loop is added.

## Product boundaries

CodeWiki does not compete on generic provider breadth, everyday coding UX, communication channels, arbitrary orchestration, code intelligence, or delivery infrastructure. It reuses Pi, Pi-Lens/LSP, Git, existing build/test tools, and external providers.

CodeWiki requires no blockchain, canonical database, graph database, message broker, hosted relay, or self-hosted coordination service. It remains local-private by default.

This source repository does not load or dogfood its own extension during stabilization. Packed candidates are tested only in disposable external projects with isolated Pi settings.

## Success signals

- Every promoted Git tree has accountable intent.
- Every accepted intent has visible realization state.
- Every discrepancy is resolved, Change-accounted, or explicitly unknown.
- Every Check Result binds exact Candidate, policy, implementation, and considered Evidence.
- Every accepted team mutation binds exact remote state and authority.
- No worker, model, Skill, Check, client, provider event, or graph edge can attest its own acceptance.
- Rolling Planning incorporates new intent without silently rewriting active Assignments.
- Repeated project-specific mistakes fall without increased false passes, escaped regressions, or negative transfer.
- Runtime ceremony earns its latency and cost.

## Competitive survival rule

If CodeWiki does not materially reduce drift, false acceptance, lost context, repeated repair, coordination failures, and Integration errors enough to offset latency, cost, and ceremony, reduce it to a thin Pi/OpenClaw extension.

## Related docs

- [CodeWiki Design System](DESIGN.md)
- [Dictionary](dictionary.md)
- [Lexicon](../lexicon.md)
- [System Overview](../system/components/overview.md)
- [Alignment Model](../system/components/alignment-model.md)
- [Change Traces](../system/components/traces.md)
- [Runtime](../system/components/runtime.md)
- [Planning Loop](../system/components/planning-loop.md)
