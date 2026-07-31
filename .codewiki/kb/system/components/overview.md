---
type: Concept
title: System Overview
description: CodeWiki is a log-canonical, graph-native, local-first, Git-synchronized intent-to-production alignment runtime with exactly three semantic Loops.
tags:
  - codewiki
  - system
  - overview
timestamp: 2026-07-30T00:00:00Z
---
# System Overview

CodeWiki turns accepted intent into accountable project change. Primary boundary is a standalone CLI, Project Runtime, and dashboard built over the published Pi SDK. Optional Pi extension remains a thin client/execution adapter.

```text
typed Change operations
→ accepted Git-backed history
→ deterministic WorkState
→ rolling global Planning
→ first-class Alignment Graph
→ local views and bounded agent queries
```

## Product model

```text
(Kₜ, Gₜ, Pₜ) + ΔIntent
  ──CodeWiki──>
(Kₜ₊₁, Gₜ₊₁, Pₜ₊₁, Evidence)
```

`K` is accepted Knowledge, `G` exact Git/source state, `P` delivery state, and Evidence includes immutable typed Evidence Records, Check Results, Exit Reports, authority receipts, Integration proof, and outcomes.

A discrepancy remains aligned only while it is resolved, accounted for by an exact active Change, or explicitly unknown with unsafe progression blocked.

## Change intake and Backlog triage

Authenticated user suggestions, ordinary pull-request review findings, Worker Report discoveries, regression/scanner findings, delivery/outcome observations, and Knowledge drift enter one closed Change intake boundary. Runtime correlates exact source and snapshot, sanitizes, classifies, deduplicates, and scope-routes material into either current-Change feedback or a pending Change. Intake material grants no disposition, priority, or execution authority.

Backlog is a disposable projection over pending/deferred Changes. Its snapshot-bound Triage Projection exposes Decision readiness, urgency, expected impact, estimated effort, risk of inaction, confidence, overlap, freshness, provenance, and explainable ordering. It guides Decision attention only. Decision accepts Change meaning independently; rolling Planning owns execution ordering across accepted Changes.

## Exactly three semantic Loops

```text
Project Runtime
├── Decision Loop
├── Planning Loop
└── Implementation Loop
```

Runtime, checking, synchronization, graph projection, Integration, recovery, archive, delivery, learning, and feedback are not additional Loops.

Exact exit chain:

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

A passing Exit Report permits exact Loop exit only. Runtime then revalidates freshness, authority, expected bases, generation, and effect policy.

## Truth and projection

- `.codewiki/kb/**` owns accepted Product/System/Design Knowledge and authored Knowledge relationships.
- Accepted Change Trace Protocol operations own accountable temporal history.
- source/tests own executable truth.
- Git owns exact objects, refs, Integration state, and accepted-state receipts.
- Evidence Records own bounded observations with explicit authority and provenance.
- configuration owns approved policy and capabilities.
- review/delivery providers own external observations, not CodeWiki semantics.

WorkState, Alignment Graph artifact, indexes, dashboards, queues, notifications, repair retrieval, `.codewiki/views/**`, and most `.codewiki/runtime/**` are deterministic or bounded projections.

## Change Trace Protocol and Git

Authority-bearing operation identity uses strict canonical JSON and SHA-256. Ordinary accepted operations have one current Change tail; only explicit same-Change causal convergence has several parents. Cross-Change semantics use typed revision bindings.

Semantic bytes are accepted through one initial provider-neutral carrier:

```text
refs/heads/codewiki/state
```

Local work remains provisional until exact expected-head push succeeds. A stale push triggers fetch, verification, WorkState/graph rebuild, and semantic reevaluation—not blind retry.

Team snapshot freshness is:

```text
fresh | stale | offline
```

Notifications only invalidate local state; Runtime fetches and verifies Git data.

## Rolling Planning and execution

Decision proceeds independently per Change. Planning continuously incorporates newly accepted Changes, active Change Claims, active Work Item Claims, Work Items, Assignments, dependencies, conflicts, and current project state.

One immutable `PlanningEpochRecord` is accepted once and atomically bound to each participating Change. New Planning preserves safe active work and explicitly pauses, migrates, cancels, blocks, or routes back invalidated work.

Runtime provisions one exact private Worker Workbench per Implementation Assignment attempt. Workers return asserted Worker Reports. Final Implementation assurance evaluates exact integrated content.

## Alignment Graph

```text
Change Trace operations       canonical temporal history
Alignment Graph projection    deterministic and first-class
indexes and rendering         disposable
```

Graph snapshot identity binds accepted Change ledger head, Knowledge, protected source, config/policy, and projector version. Every fact reports one source class:

```text
canonical_binding
observed_binding
deterministic_analysis
inferred_analysis
```

No edge is independently authoritative. Queries are bounded, read-only, snapshot-bound, provenance-bearing, and explicit about coverage, truncation, and staleness.

## OKF

OKF stores accepted Knowledge and a closed authored relationship vocabulary:

```text
depends_on
constrains
refines
realizes
verifies
supersedes
derived_from
```

Ordinary Markdown links remain `references`. Dynamic workflow/source/evidence/delivery relationships stay in Change operations and graph projection. Imported OKF is untrusted and cannot execute code, grant authority, pass Checks, or authorize exit.

## Archive and learning

Terminal immutable Trace segments archive on `refs/heads/codewiki/archive` only after configured Integration, review, effect, outcome, and ownership obligations complete. Runtime pushes and verifies archive before removing hot state. Inspection hydrates read-only cache; reopening starts a new hot segment referencing archived closure.

Repair Episodes and Repair Patterns derive from archived history. Bounded relevant successful and harmful guidance may help future producers/workers, but cannot enter independent Model Checks, lower thresholds, disable Checks, grant authority, or become another Loop.

## Rejected architecture

V1 requires no blockchain, canonical database, graph database, message broker, hosted CodeWiki relay, self-hosted coordination service, mutable backlog/current plan, arbitrary graph mutation, or provider-specific semantic truth.

## Source-checkout boundary

This repository uses `.codewiki/kb/**` as intended design truth, source/tests as executable truth, and Git as history/checkpoint evidence. It does not load or dogfood its own extension during stabilization. Packed candidates run only in disposable external projects with isolated Pi settings.

## Related docs

- [Alignment Model](alignment-model.md)
- [Change Traces](traces.md)
- [Runtime](runtime.md)
- [WorkState](work-state.md)
- [Loop Model](loop-model.md)
- [Loop Exit](loop-exit.md)
- [Evidence Records](evidence.md)
- [Planning Loop](planning-loop.md)
- [Session Coordination](session-coordination.md)
- [Knowledge](knowledge.md)
- [Clean-Cut Audit](../flows/clean-cut-audit.md)
