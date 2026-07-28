---
type: Concept
title: WorkState
description: WorkState is the disposable project-wide projection that lets Runtime and all three semantic Loops reason from one current snapshot without creating another truth store.
tags:
  - codewiki
  - system
  - state
  - projection
timestamp: 2026-07-28T00:00:00Z
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

WorkState is CodeWiki's typed disposable projection of current project work. Project Runtime, Decision, Planning, Implementation, APIs, clients, and relationship queries derive bounded inputs from the same semantics instead of independently reconstructing partial state.

WorkState is not canonical, a semantic Loop, an event journal, or authority. In-memory state and generated `.codewiki/views/**` may be discarded and rebuilt.

## Inputs and authority

```text
Change Traces
+ current OKF Knowledge
+ source/test ownership and implementation
+ exact Git/remote/delivery evidence
+ configuration
+ bounded Runtime observations
= WorkState
```

Each source retains authority:

- Change Traces own durable Change progression, Loop attempts, Planning, runtime coordination, Check/Exit evidence, realization, and outcome disposition.
- Knowledge owns accepted Product/System/Design intent.
- Source/tests/Git own executable and content identity.
- Remote checks/artifacts/observations own only their exact external boundary.
- Configuration owns approved execution/assurance policy.
- Runtime observations own ephemeral process, lease, capacity, and capability state.

WorkState records refs, versions, coverage, and digests. It never transfers authority into a generated projection.

## Conceptual shape

```ts
interface WorkState {
  changes: Map<ChangeId, ChangeView>;
  sprints: Map<SprintId, SprintView>;
  workItems: Map<WorkItemId, WorkItemView>;
  assignments: Map<AssignmentId, AssignmentView>;
  loopExit: LoopExitProjectionState;
  knowledge: KnowledgeState;
  alignment: AlignmentProjectionState;
  integration: IntegrationState;
  delivery: DeliveryState;
  runtime: RuntimeObservationState;
  blockers: BlockerView[];
  snapshotDigest: string;
}
```

Concrete APIs may serialize sorted arrays/records. Ordering and digest construction are deterministic.

## Change-accountable relationships

```text
Change * ↔ * Sprint
Sprint 1 → * Work Item
Work Item 1 → * Assignment attempt
```

Each Work Item has exactly one owning Change and may contribute explicitly to others. This preserves one canonical trace owner while enabling global Planning.

A Change view may expose:

- exact semantic revision, digest, authority, and current Loop;
- Decision candidates and accepted revision;
- Planning coverage, Sprints, Work Items, dependencies, and contribution;
- Assignments, tiers, Workbench summaries, Claims, and Worker Reports;
- candidate lineage, Resolved Exit Policies, Checks, Results, Exit Reports, latency/token buckets, and repair routes;
- Implementation realization and Integration proof;
- Knowledge/alignment impact and suspect relationships;
- merge, push, publication, release, deployment/observation boundaries;
- blockers and next safe action.

Sprint and relationship views join exact trace facts. They do not become separate Sprint, graph, or lesson stores.

## Loop-exit projection

WorkState projects persisted policy/report identity and active Runtime execution separately:

- candidate id/digest and guarded snapshots;
- active Check bindings and `activatedBy` reasons;
- completed/pending Results;
- exact thresholds and enforcement;
- immutable Exit Report status;
- separate Runtime route and freshness state;
- parent/repair candidate lineage.

Historical views never reinterpret old attempts through today's Check catalog. In-progress state is operational; accepted Results/Reports live in traces.

## Alignment and delivery projection

WorkState distinguishes:

- resolved, Change-accounted, suspect, contradictory, blocked, and unknown relationships;
- local candidate, isolated worker output, integrated tree, project-branch merge, remote push, publication, release, deployment, and outcome observation;
- explicit proof from inferred relationships.

One boundary never implies another. Missing proof remains missing.

## Runtime use

```text
trigger set
→ refresh WorkState and relationship snapshot
→ derive eligible jobs
→ apply lanes, conflicts, dependencies, capacity, budget, and authority
→ bind Loop Protocol/model route/Workbench
→ produce immutable candidate
→ resolve policy and run bounded Checks
→ build Exit Report
→ final freshness/generation/CAS guard
→ append exact facts or remediation
→ schedule separately permitted effects
→ repeat or quiesce
```

Global Planning observes every relevant approved Change, dependency, overlap, active Sprint, integration target, and constraint inside one bounded horizon. Concurrent Decision and Assignment jobs receive separate exact slices; no job depends on another transcript.

## Freshness and concurrency

Every candidate binds exact WorkState or bounded source versions. Runtime rejects or reruns when any guarded Change revision, trace tail, Knowledge digest, policy/config identity, Git base, source proof, or plan revision changes.

WorkState digest is snapshot evidence, not semantic approval or sole write guard. Entity-level CAS remains authoritative.

A changed concept/source/Check/evidence relationship makes dependents suspect. Suspect propagation requests reevaluation; it does not fabricate contradiction or automatic failure.

## Read efficiency

CodeWiki parses JSONL as LF-delimited streams, loads each active trace once per supervised process, indexes stable identities, tails complete appended lines, and rebuilds a trace when truncated/replaced/malformed. Process loss rebuilds all disposable state.

No SQLite or graph database belongs to current architecture. If measured workloads later justify a warm index, it remains disposable and reconstructible.

Durable semantic facts are never summarized lossily. Runtime compiles bounded model context from exact refs, revisions, selected Knowledge/source slices, relationship facts, and deltas.

## Relationship query service

Runtime may expose typed read-only operations over three derived views:

- **Work:** blockers, dependencies, overlap, Claims, Assignment readiness, and integration state.
- **Alignment:** Knowledge constraints, realization, reverse traceability, suspect/invalidation relationships, plan coverage, and active Check explanation.
- **Learning:** similar Repair Episodes and prior successful/harmful Repair Patterns.

Every result includes:

```ts
{
  snapshotDigest: string;
  facts: StructuredFact[];
  provenanceRefs: string[];
  authority: "canonical" | "derived" | "observed";
  coverage: "complete" | "partial" | "unknown";
  truncated: boolean;
  stale: boolean;
}
```

No arbitrary Cypher, generic graph DSL, graph mutation, or inference of non-existence from partial coverage. Runtime preloads mandatory context; query access is supplemental and Assignment-scoped for workers.

## Views

- **Backlog:** open intake and Decision state.
- **Planning:** approved Changes, Planning epochs, Sprints, Work Items, dependencies, coverage, and ready/held frontier.
- **Implementation:** Claims, Assignments, tiers, Workbenches, Result progress, repair, isolation, Integration, Git/delivery proof.
- **Change dossier:** one complete accountable Change journey.
- **Alignment:** vertical, horizontal, temporal, and delivery relationships with coverage/authority.
- **Learning:** derived candidate/Result/repair/outcome episodes and patterns.

Views label explicit versus derived facts and remain rebuildable.

## Non-goals

- No canonical WorkState, graph, lesson, or relationship file.
- No fourth state, validation, Knowledge, learning, or recovery Loop.
- No monolithic mutable Change object.
- No caller-supplied replacement for repository facts.
- No transcript, session registry, graph layout, dashboard cache, or Pi-Lens index as truth.
- No automatic semantic approval from projection state.
- No absence-as-proof under partial/unknown coverage.

## Related docs

- [Alignment Model](alignment-model.md)
- [Loop Model](loop-model.md)
- [CodeWiki OS and Loop Protocols](codewiki-os.md)
- [Loop Exit](loop-exit.md)
- [Worker Workbench](worker-workbench.md)
- [Model Routing](model-routing.md)
- [Loop Contracts](loop-contracts.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
