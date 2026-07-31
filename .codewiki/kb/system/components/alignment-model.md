---
type: Concept
title: Alignment Model
description: Alignment means every discrepancy among accepted intent, Knowledge, work, implementation, Git, delivery, and outcomes is resolved, accounted for by an exact active Change, or explicitly unknown and blocked from unsafe progression.
tags:
  - codewiki
  - system
  - alignment
  - model
timestamp: 2026-07-30T00:00:00Z
codewiki_component: alignment_model
codewiki_components:
  - alignment_model
codewiki_source_patterns:
  - src/change-trace/alignment-graph.ts
  - src/change-trace/alignment-knowledge.ts
  - src/change-trace/alignment-query.ts
  - src/benchmarks/**
codewiki_test_patterns:
  - tests/traces/alignment-graph-v1.test.mjs
  - tests/traces/alignment-query-v1.test.mjs
  - tests/benchmarks/**
codewiki_role: generated_projection
codewiki_source_map:
  - id: alignment_model
    source_patterns:
      - src/change-trace/alignment-graph.ts
      - src/change-trace/alignment-knowledge.ts
      - src/change-trace/alignment-query.ts
      - src/benchmarks/**
    test_patterns:
      - tests/traces/alignment-graph-v1.test.mjs
      - tests/traces/alignment-query-v1.test.mjs
      - tests/benchmarks/**
    role: generated_projection
---
# Alignment Model

Alignment is a governed relationship among distinct authorities, not a score or one merged document.

```text
accepted intent
↔ accepted Knowledge
↔ rolling Planning and active work
↔ source and tests
↔ exact Git and Integration state
↔ delivery state
↔ observed outcomes
```

A discrepancy is aligned only when it is:

1. resolved;
2. accounted for by an exact active Change; or
3. explicitly unknown, with unsafe progression blocked.

## Product invariant

CodeWiki exists to keep intent and project state aligned while both change over time. Knowledge may intentionally lead source while an accepted Change is being realized. Source may expose missing or stale Knowledge and trigger a Change. A contradiction is never hidden behind one aggregate confidence score.

## Authority roots

- `.codewiki/kb/**` owns accepted Product/System/Design Knowledge and authored Knowledge relationships.
- Accepted Change Trace Protocol operations own accountable intent, revisions, attempts, Planning bindings, execution history, routes, reviews, effects, feedback, and outcomes.
- Source and tests own executable implementation truth.
- Git owns exact objects, trees, refs, Integration state, and accepted-state receipts.
- Evidence Records own bounded immutable observations with explicit authority and provenance.
- Review and delivery providers own external observations, not CodeWiki semantics.
- Runtime owns identity, admission, freshness, authority, scheduling, routing, canonical writes, and effects.

Generated views, graph indexes, notifications, provider payloads, and local Runtime state do not become independent authority.

## Exact exit chain

Every semantic Loop follows:

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

A passing Exit Report is necessary but not sufficient for canonical state advancement. Runtime revalidates authority, freshness, exact bases, generation, and effect policy.

## Exactly three Loops

```text
Decision
Planning
Implementation
```

Decision owns accepted meaning for one Change. Planning continuously shapes globally coherent Work Items across the selected Change set. Implementation evaluates exact realization and integrated content. Synchronization, graph projection, checking, recovery, archive, delivery, and learning remain Runtime functions or derived cycles.

## Log-canonical, graph-native architecture

```text
typed Change operations
→ accepted Git-backed history
→ deterministic WorkState
→ rolling global Planning
→ first-class Alignment Graph
→ local views and bounded agent queries
```

The architecture has three graph-related layers:

```text
Change Trace operations       canonical temporal history
Alignment Graph projection    deterministic and first-class
indexes and rendering         disposable
```

“First-class” means the Alignment Graph has a versioned schema, deterministic projector, stable snapshot identity, full/incremental equivalence tests, bounded query API, and explicit provenance. It does not mean graph storage becomes another authority.

## Alignment Graph snapshot

```text
accepted Change ledger head
+ Knowledge digest
+ protected source head
+ config and policy digests
+ graph projector version
= Alignment Graph snapshot digest
```

Every query result binds that digest. Projector `1.2.0` preserves both each semantic artifact-owned digest and the complete inline-artifact content digest on Candidate, policy, Result, Report, and Route graph facts. The executable projector shape is:

```ts
interface AlignmentGraphSnapshot {
  projector: {
    id: "codewiki.alignment-graph-projector";
    version: "1.2.0";
  };
  graphSnapshotDigest: Sha256Digest;
  graphContentDigest: Sha256Digest;
  baseBinding: {
    remoteStateHead: GitObjectId;
    sourceHead: GitObjectId;
    knowledgeDigest: Sha256Digest;
    configDigest: Sha256Digest;
    policyDigest: Sha256Digest;
    workStateDigest: Sha256Digest;
  };
  status: "fresh";
  projectedRecordIds: OperationId[];
  nodes: AlignmentGraphNode[];
  edges: AlignmentGraphEdge[];
  coverage: AlignmentGraphCoverage;
}
```

`graphSnapshotDigest` hashes the accepted state head, protected source head, Knowledge/config/policy digests, and projector identity/version. `graphContentDigest` independently hashes sorted normalized nodes and edges. Incremental projection accepts only an exact projected-record prefix and is byte-equivalent to full projection.

The current pure projector covers canonical Change, revision, requirement, relationship, Loop, Candidate, Evidence, Result, Report, Route, Planning epoch, Sprint, Work Item, Claim, Assignment, Integration, Git effect, delivery, outcome, and contradiction facts. A deterministic Knowledge augmentation projects OKF concepts, Markdown references, closed authored relationships, source provenance, and source/test ownership without turning imported metadata into authority. Synchronization can materialize the augmented graph after verified Git replay. Incremental operation projection rejects a Knowledge-augmented base so stale external facts cannot leak across snapshots.

## Per-fact provenance

Every projected or analyzed fact reports one source class:

```text
canonical_binding
observed_binding
deterministic_analysis
inferred_analysis
```

Examples:

```text
Change → Candidate              canonical binding
Candidate → Evidence Record     canonical binding
Commit → changed path           deterministic Git analysis
Function A → calls Function B   deterministic source analysis
Concept A → likely concept B    inferred analysis with bounded confidence
```

The graph may combine several classes in one result, so provenance attaches to each node and edge. Every edge has a content-derived fact ID over type, endpoints, attributes, and provenance. No graph edge is independently authoritative. Contradictory, superseded, stale, partial, and unknown facts remain visible. Absence from partial coverage cannot prove non-existence.

## Graph domains

The Alignment Graph joins, without merging authority:

- Change revisions, relationships, Candidates, attempts, and Runtime Routes;
- Planning epochs, Work Items, dependencies, Change Claims, Work Item Claims, Assignments, and Integration;
- Evidence Records, obligations, Check Results, and Exit Reports;
- OKF concepts and authored Knowledge relationships;
- source paths, tests, ownership, symbols, and deterministic analysis;
- Git commits, trees, refs, review projections, delivery effects, and outcomes;
- derived Repair Episodes and Repair Patterns.

Each typed operation kind has a deterministic graph projection. Users cannot inject arbitrary triples.

## Bounded semantic queries

Agents and clients receive six closed, read-only, snapshot-bound query families:

```text
change_context
work_item_readiness
loop_assurance
knowledge_impact
delivery_chain
contradictions
```

Requests must bind the exact graph snapshot digest and may traverse at most four hops while returning at most 200 facts. Results rank roots before adjacent relationships, bind the graph content digest, and report exact facts, underlying refs, per-fact provenance, graph and match coverage, truncation, synchronization staleness, and retained contradiction identities. Unknown roots return explicit zero-root coverage rather than pretending absence proves non-existence. CodeWiki rejects unsupported fields and exposes no arbitrary Cypher or generic graph mutation DSL.

Backlog Triage is not a seventh generic graph query family. It is a dedicated Change-domain projection that consumes bounded impact, overlap, dependency, ownership, and affected-scope facts from an exact Alignment Graph snapshot alongside WorkState, intake provenance, config, and policy. Its own closed query exposes Decision-attention dimensions and reasons without granting graph mutation or Planning priority.

## OKF relationship boundary

OKF owns stable accepted Knowledge and authored Knowledge relationships:

```text
depends_on
constrains
refines
realizes
verifies
supersedes
derived_from
```

Ordinary Markdown links remain `references`. Vague `related_to` is rejected. Dynamic Change/source/evidence/delivery relationships belong in operations and graph projection. Imported OKF remains untrusted and cannot execute code, grant authority, pass Checks, or authorize Loop exit.

## Retrieval benchmark and Graphify boundary

The retrieval benchmark harness lives under `src/benchmarks/**`, separate from Change Trace production semantics. It compares plain lexical search, recorded Pi-Lens results, OKF/source projection, Alignment Graph queries, and optional Graphify results under one snapshot identity, case set, and result cap. It reports recall, precision, false-positive rate, success-at-one, and wall time as separate dimensions; it does not hide safety regressions in an aggregate score. Missing adapters and adapter failures remain explicit results. Current Graphify comparison is reported as unavailable because its dependencies are not installed.

Graphify remains an optional disposable analysis adapter. Its stable IDs, typed relations, source locations, confidence, incremental hashes, and bounded queries are useful patterns. Graphify cannot become canonical storage, write accepted Knowledge, grant authority, or permit progression.

## Learning boundary

Completed history may derive Repair Episodes and Repair Patterns. Historical guidance is bounded, structured, provenance-bearing, and available only to relevant producers/workers. It cannot enter independent Model Check context, lower thresholds, disable Checks, grant authority, or become a fourth Loop.

## Source-checkout boundary

This repository uses `.codewiki/kb/**` as intended design truth, source/tests as executable truth, and Git as checkpoint evidence. It does not load or dogfood its own extension during stabilization. Packed external projects prove Runtime behavior.

## Related docs

- [Change Traces](traces.md)
- [Change Intake and Backlog Triage](change-intake.md)
- [WorkState](work-state.md)
- [Runtime](runtime.md)
- [Knowledge](knowledge.md)
- [Source Map](source-map.md)
- [Loop Contracts](loop-contracts.md)
- [Lab](lab.md)
