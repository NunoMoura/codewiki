---
type: Concept
title: WorkState
description: WorkState is the deterministic disposable projection of accepted Change history and current project authorities used by Runtime, all three semantic Loops, rolling Planning, and Alignment Graph queries.
tags:
  - codewiki
  - system
  - state
  - projection
timestamp: 2026-07-30T00:00:00Z
codewiki_component: work_state
codewiki_components:
  - work_state
codewiki_source_patterns:
  - src/work-state/**
codewiki_test_patterns:
  - tests/work-state/**
codewiki_generated_views:
  - .codewiki/views/work-state.json
codewiki_role: generated_projection
codewiki_source_map:
  - id: work_state
    source_patterns:
      - src/work-state/**
    test_patterns:
      - tests/work-state/**
    generated_views:
      - .codewiki/views/work-state.json
    role: generated_projection
---
# WorkState

WorkState is Runtime's deterministic project-wide projection. It is rebuilt from authority sources and never becomes another truth store.

```text
accepted Change operation history
+ accepted Knowledge
+ source ownership and source/tests
+ protected source and Git state
+ config and policy
+ bounded Runtime/provider observations
= WorkState
```

Every semantic Loop and Runtime scheduler receives a bounded exact slice of one WorkState snapshot.

## Team snapshot identity

A distributed snapshot binds:

```text
repository identity
+ codewiki/state head
+ protected source head
+ Knowledge digest
+ config digest
+ policy digest
```

Runtime exposes:

```text
fresh | stale | offline
```

- `fresh`: remote state and protected source heads are fetched, verified, and compatible with the projected digests.
- `stale`: local state is known not to match current accepted remote state.
- `offline`: Runtime cannot establish remote freshness.

Unsafe distributed mutation requires `fresh`. Private offline attempts may produce artifacts, but they cannot gain shared acceptance.

## Deterministic reduction

The reducer validates protocol version, canonical identity, parent availability, authority binding, base snapshot, pre-state digest, closed payload, and operation-specific preconditions before applying an operation.

Invalid or unknown history remains visible and blocks dependent progression. Duplicate operations are idempotent. Full replay and incremental replay must produce identical WorkState digests.

Per-Change ordinary history remains single-tail. Global accepted order comes from the linear `codewiki/state` commit chain. Cross-Change relationships and Planning epochs are exact bindings, not causal-parent shortcuts.

## Core projections

WorkState derives:

### Change state

- exact current revision and Trace tail;
- Decision disposition and active semantic attempt;
- dependencies, overlaps, supersession, merge, split, and discovery relationships;
- required Evidence, review, Integration, delivery, and outcome obligations;
- terminal/archive eligibility.

### Coordination state

- active Change Claims;
- active Work Item Claims;
- explicit release and authenticated takeover history;
- Assignments, cancellation, terminal worker state, and recovery;
- current source bases, Workbenches, and Integration lanes.

Client and Git timestamps do not expire ownership. Private heartbeat observations may inform UI but cannot alter canonical ownership.

### Rolling Planning state

- latest valid Planning epoch;
- selected Change set and participant revisions;
- Work Items, dependencies, acceptance requirements, verification, and Integration boundaries;
- active Work Items and Assignments that remain safe;
- explicit pause, migration, cancellation, block, or route-back disposition;
- safe execution frontier.

Backlog, current Planning, and work queue are generated views over this state.

### Loop-exit state

- exact Candidates and attempts;
- Evidence Records and obligation resolutions;
- Resolved Exit Policies;
- Check Results and complete Result fan-in;
- Exit Reports and Runtime Routes;
- failed, indeterminate, stale, excluded, and contradictory evidence.

### Effect state

- Integration attempts and exact tree/commit proof;
- branch merge and push observations;
- review projections and authenticated approval receipts;
- publication, release, delivery, and outcome observations.

## Alignment Graph projection

WorkState and the Alignment Graph are projections of the same accepted snapshot, but they serve different access patterns:

- WorkState answers current-state scheduling and guard questions.
- Alignment Graph answers bounded semantic relationship and provenance questions.

Graph snapshot identity additionally binds graph projector version. Every graph fact retains `canonical_binding`, `observed_binding`, `deterministic_analysis`, or `inferred_analysis` provenance.

No graph edge can override WorkState admission. Partial graph absence does not prove absence from canonical history or source.

## Query contract

Read/query results include:

```ts
interface AlignmentQueryFact {
  fact: StructuredFact;
  provenanceRefs: string[];
  sourceProvenance:
    | "canonical_binding"
    | "observed_binding"
    | "deterministic_analysis"
    | "inferred_analysis";
}

interface AlignmentQueryResult {
  snapshotDigest: string;
  facts: AlignmentQueryFact[];
  coverage: "complete" | "partial" | "unknown";
  truncated: boolean;
  stale: boolean;
}
```

Relationship queries carry provenance per fact because one result may combine source classes. Queries are bounded, read-only, and non-mutating. They cannot acquire Change Claims, acquire Work Item Claims, append operations, mutate Knowledge, or trigger effects.

## Local materialization and caches

Runtime may materialize:

```text
.codewiki/changes/**
.codewiki/runtime/**
.codewiki/views/**
```

These local files are reconstructible. Accepted hot operation bytes are authoritative only on `codewiki/state`; archive bytes are authoritative only after verified acceptance on `codewiki/archive`.

No SQLite, canonical graph file, graph database, message broker, or hosted CodeWiki service belongs to v1. A measured warm index may be added later only if it remains disposable and reproducible from exact snapshot inputs.

## Notifications and refresh

Polling, webhook, SSE, or provider notifications only invalidate a local cursor:

```text
notification
→ mark snapshot stale
→ fetch remote Git refs
→ verify manifests and operations
→ rebuild WorkState and Alignment Graph
→ emit bounded new snapshot observation
```

Duplicate, missing, or reordered notifications cannot change semantic state.

## Repair retrieval

A separate disposable index may retrieve applicable Repair Episodes and Repair Patterns by Loop, issue class, repair target, source/Knowledge boundary, Check identity, outcome, evidence strength, and recency. Retrieval output remains advisory and outside WorkState authority.

## Projection safety

- Never infer pass from missing failure.
- Never infer absence from partial coverage.
- Never hide contradictions or unknown required versions.
- Never let local time grant ownership or progression.
- Never accept a stale push through automatic rebase.
- Never write generated view output back into canonical history.

## Current executable drift

Current source projects local `.codewiki/traces/**` history and local coordinator state. Remote state freshness, accepted state-ref replay, v1 operation reduction, distributed Change Claims, distributed Work Item Claims, and versioned Alignment Graph projection remain planned clean-cut work.

## Related docs

- [Change Traces](traces.md)
- [Runtime](runtime.md)
- [Planning Loop](planning-loop.md)
- [Alignment Model](alignment-model.md)
- [Session Coordination](session-coordination.md)
- [Knowledge](knowledge.md)
