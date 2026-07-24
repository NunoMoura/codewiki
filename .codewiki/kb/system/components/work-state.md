---
type: Concept
title: WorkState
description: WorkState is the disposable project-wide projection that lets runtime and all three semantic loops reason from the same current state without creating another truth store.
tags:
  - codewiki
  - system
  - state
  - projection
timestamp: 2026-08-01T00:00:00Z
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

WorkState is CodeWiki's typed, disposable projection of current project work. Runtime, Decision, Planning, Implementation, APIs, and user-facing views must derive their bounded inputs from the same WorkState semantics instead of independently reconstructing partial state.

WorkState is not a canonical file, event journal, semantic loop, or authority. An in-memory instance or generated `.codewiki/views/work-state.json` cache may be discarded and rebuilt.

## Inputs and authority

```text
Change Traces
+ current Knowledge Base
+ source ownership
+ source and tests
+ Git state
+ configuration and policy
+ bounded runtime observations
= WorkState
```

Each input keeps its existing authority:

- Change Traces own durable workflow, approval, planning, runtime-coordination, implementation, and outcome-disposition facts for each Change journey.
- Knowledge Base documents own accepted product and system intent.
- Source, tests, and Git own implementation and content-proof truth.
- Configuration owns bounded execution policy.
- Runtime observations own only ephemeral process, lease, and capability state.

WorkState records refs, versions, and digests for those sources. It never copies their authority into a generated projection.

## Shape

The conceptual shape is:

```ts
interface WorkState {
  changes: Map<ChangeId, ChangeView>;
  sprints: Map<SprintId, SprintView>;
  workItems: Map<WorkItemId, WorkItemView>;
  assignments: Map<AssignmentId, AssignmentView>;
  knowledge: KnowledgeState;
  integration: IntegrationState;
  runtime: RuntimeObservationState;
  blockers: BlockerView[];
  snapshotDigest: string;
}
```

A concrete API may serialize maps as sorted arrays or records. Ordering and digest construction must be deterministic.

## Change-accountable relationships

Change is the accountable semantic carrier. Decision is a loop and approval fact, not another domain entity. Planning creates Sprints and Work Items from approved Changes. Runtime grants Assignments for Work Items. Implementation records realization and evidence against the owning Change.

The durable relationship is many-to-many where execution requires it:

```text
Change * <-> * Sprint
Sprint 1 -> * Work Item
Work Item 1 -> * Assignment attempt
```

Each Work Item has exactly one owning Change and may declare additional Changes it contributes to. This gives every Work Item and implementation result one canonical Change Trace while preserving cross-Change coverage.

A Change view may expose:

- current semantic revision and digest;
- Decision-loop validation and exact approval receipt;
- planning coverage and Sprint memberships;
- owned and contributing Work Items;
- Assignments and worker reports;
- implementation realization and integration evidence;
- Knowledge impacts and outcome disposition;
- blockers, current loop, and next safe action.

A Sprint view joins matching Planning facts from participating Change Traces, including canonical `uiPreviewTargets[]` bindings and their exact target/profile digests when UI realization is in scope. It is a generated execution-group projection, not a separate Sprint trace or truth file.

A Work Item may project one or more exact Integration proofs from `runtime.integration.proven` events. Each projection keeps the event and runtime-job identity, Planning target refs, base/commit/tree/content proof, changed paths, Worker-report ref, and integration time separate from semantic `implemented` status. Missing integration evidence is never inferred from Worker completion or Implementation acceptance.

A Work Item separately projects exact project-branch promotion from `runtime.project_branch.merged`. Merge proof preserves the Integration event/job, checked-out target branch, prior target commit, promoted commit/tree/content proof, merge job, exact authority, and observation time.

`runtime.project_branch.pushed` projects another exact boundary: merge event/job, configured remote and branch, prior remote commit or branch absence, pushed commit/tree/content proof, user authority, push job, and observation time. Integration, project-branch merge, push, product publication/deployment, package release, and registry publication remain distinct states; one never implies another.

## Runtime use

Runtime is logically always available and physically quiescent when no eligible work exists. On each trigger set it rebuilds or refreshes WorkState, derives eligible invariant repairs, admits a compatible bounded job set, supplies exact context slices, validates each output and exit result, appends accepted facts to affected Change Traces, and rebuilds projections.

```text
trigger set
-> refresh WorkState
-> derive eligible jobs
-> apply lanes, conflicts, dependencies, capacity, and policy
-> build exact loop or Assignment context slices
-> run compatible jobs through execution adapters
-> evaluate loop-owned quality standards
-> guarded append to Change Trace(s)
-> schedule permitted effects
-> repeat or quiesce
```

WorkState scheduling and context selection must be impact-bounded. Global Planning observes every relevant approved Change, dependency, overlap, active Sprint, integration target, and policy constraint in its planning horizon; it does not reread unrelated closed history on every cycle. Concurrent Decision and worker jobs receive separate exact slices so one session does not depend on another session's transcript.

## Freshness and concurrency

Every semantic iteration binds the WorkState snapshot or bounded source versions it observed. Runtime must reject or rerun a proposed append when any guarded Change revision, trace tail, KB target digest, policy digest, Git base, or plan revision changed during evaluation.

Generated WorkState digests are concurrency evidence, not semantic approval. Entity-level compare-and-swap guards remain authoritative for writes.

## JSONL read efficiency

CodeWiki follows the useful parts of Pi's session-storage pattern without copying session semantics:

- parse JSONL as an LF-delimited stream rather than loading each file as one large string;
- load each active Change Trace once into a supervised in-memory session;
- retain records and stable identity indexes while runtime remains alive;
- on refresh, compare file metadata and parse only bytes appended after the last complete newline;
- rebuild one trace when it is truncated, replaced, malformed, or invalidated;
- rebuild the complete disposable projection when process memory is lost.

`WorkStateSession` implements load, reuse, tail, invalidation, and removal detection. `RuntimeReactor` reuses that session while selecting bounded work. SQLite is not part of the architecture. If a future measured workload needs a durable warm index, that index must remain disposable and reconstructible from Change Traces.

Pi compaction keeps full JSONL history while projecting a smaller model context. CodeWiki applies the same separation of durable history from bounded context, but semantic Change facts are never summarized lossily. Runtime supplies loops with scoped refs, exact revisions and digests, selected Knowledge/source context, and deltas; deterministic checkpoints may accelerate replay without replacing event history.

## Views

User and agent views are projections over WorkState or the same canonical inputs:

- Backlog: persisted Change Traces whose current Decision state is not approved or terminal;
- Planning horizon: approved Changes, Planning epochs, Sprints, Work Items, typed edges, coverage, and held/ready frontiers;
- Implementation cockpit: claims, Assignments, worker observations, isolation, integration, checks, evidence, and Git proof;
- Sprint views: Planning-created execution groups across one or more Change Traces;
- work queue: claimable Planning-approved Work Items;
- Change dossier: one Change Trace joined with Product/System/Design impact, Planning coverage, realization, proof, and history;
- alignment and outcome views: intended, planned, realized, experience-verified, and outcome-observed dimensions.

Views must label explicit facts separately from inferred relationships and must remain rebuildable.

## Non-goals

- No canonical `work-state.json` truth file.
- No fourth state, validation, knowledge, or recovery loop.
- No monolithic mutable Change object containing every worker and runtime field.
- No caller-supplied replacement for repository facts the core can load itself.
- No session transcript, session registry, graph layout, or dashboard cache as project truth.
- No automatic semantic approval based on projection state.

## Related docs

- [Loop Model](loop-model.md)
- [Loop Contracts](loop-contracts.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
