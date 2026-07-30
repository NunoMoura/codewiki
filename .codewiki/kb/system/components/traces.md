---
type: Concept
title: Change Traces
description: Change Trace Protocol v1 preserves each Change as immutable typed content-addressed operations accepted through provider-neutral Git, with deterministic WorkState and Alignment Graph projection.
tags:
  - codewiki
  - system
  - traces
timestamp: 2026-07-30T00:00:00Z
codewiki_components:
  - traces
  - views
codewiki_source_patterns:
  - src/traces/**
  - src/api/traces.ts
  - src/views/**
  - src/api/views.ts
codewiki_test_patterns:
  - tests/traces/**
  - tests/views/**
codewiki_generated_views:
  - .codewiki/views/status.json
  - .codewiki/views/resume.json
  - .codewiki/views/work-plan.json
  - .codewiki/views/work-queue.json
  - .codewiki/views/trace-board.json
  - .codewiki/views/triggers.json
  - .codewiki/views/runtime-board.json
  - .codewiki/views/loop-exit.json
  - .codewiki/views/blockers.json
  - .codewiki/views/conflicts.json
codewiki_roles:
  - state_truth
  - generated_projection
codewiki_source_map:
  - id: traces
    source_patterns:
      - src/traces/**
      - src/api/traces.ts
    test_patterns:
      - tests/traces/**
    role: state_truth
  - id: views
    source_patterns:
      - src/views/**
      - src/api/views.ts
    test_patterns:
      - tests/views/**
    generated_views:
      - .codewiki/views/status.json
      - .codewiki/views/resume.json
      - .codewiki/views/work-plan.json
      - .codewiki/views/work-queue.json
      - .codewiki/views/trace-board.json
      - .codewiki/views/triggers.json
      - .codewiki/views/runtime-board.json
      - .codewiki/views/loop-exit.json
      - .codewiki/views/blockers.json
      - .codewiki/views/conflicts.json
    role: generated_projection
---
# Change Traces

## Responsibility

One Change owns one Change Trace: the complete accountable history for that Change. It preserves intent, revisions, relationships, semantic attempts, Evidence Records, Check Results, Exit Reports, Runtime Routes, Planning bindings, Change Claim and Work Item Claim history, Assignments, Integration, review, delivery, feedback, outcomes, archive, and reopening.

Change Trace Protocol v1 is:

```text
log-canonical
content-addressed
graph-projectable
local-first
Git-synchronized
```

The canonical unit is an immutable typed operation. JSONL is the append-friendly physical representation; it does not weaken typed domain semantics.

## Authority boundary

Semantic truth belongs in operation bytes. A Git state commit atomically accepts an exact operation batch and acts as its acceptance receipt. Commit author, message, and timestamp do not define operation meaning or authority.

Runtime alone derives canonical operation identity, parents, exact base, authority binding, state digests, canonical observation time, and accepted tail. Clients submit only intent, evidence material, authority facts, or control facts they legitimately own.

Current status, Backlog, Planning, Implementation, dashboards, queues, and graph layouts derive from accepted operations. Sprint state is a generated view across exact participating Change histories. Callers cannot directly set acceptance, readiness, completion, Integration, or delivery status.

## Protocol scopes and envelope

Authority-bearing identity uses versioned strict canonical JSON and SHA-256. V1 exposes exactly two closed semantic scopes:

```text
Change-scoped operation
  advances or records one exact Change history

project-scoped Planning record
  records one exact multi-Change Planning epoch
```

A `PlanningEpochRecord` becomes relevant to each participating Change only through atomic `planning.epoch_bound` operations. `StateCommitManifest` and `ArchiveManifest` are separate structural verification records, not domain mutations; their existence alone cannot change WorkState. No generic subject scope exists.

The ordinary Change-scoped envelope is conceptual pending the exact protocol-schema slice:

```ts
interface CanonicalChangeOperation {
  operationId: string; // sha256(canonical_json(body))
  body: ChangeOperationBody;
}

interface ChangeOperationBody {
  protocol: {
    id: "codewiki.change-trace";
    version: "1.0.0";
  };
  changeId: string;
  kind: ChangeOperationKind;
  kindVersion: string;
  parents: string[];
  baseSnapshot: BaseSnapshot;
  authorityBinding: AuthorityBinding;
  preStateDigest: string;
  postStateDigest: string;
  payload: ClosedTypedPayload;
}
```

`operationId` is excluded from its own hash input. Any authority-bearing byte change changes identity. Project-scoped `PlanningEpochRecord`, `StateCommitManifest`, and `ArchiveManifest` use separate closed schemas and content identities.

```ts
interface BaseSnapshot {
  remoteStateHead: string;
  sourceHead: string;
  knowledgeDigest: string;
  configDigest: string;
  policyDigest: string;
}

interface AuthorityBinding {
  actorId: string;
  principalRef: string;
  role: string;
  actorPolicyDigest: string;
  authenticationEvidenceId?: string;
  runtimeProtocolDigest: string;
}
```

Runtime derives both bindings. Client and Git timestamps may support display but cannot determine ownership or progression.

CodeWiki does not invent a PKI. Local single-user mode may use asserted actor identity. Protected team mode may require standard signed Git state commits for authority-bearing writes. External approvals and effects require authenticated provider receipts. Git author, message, and timestamp remain non-semantic.

## Parent model

```text
initial Trace root                     0 parents
ordinary accepted Change operation    exactly 1 current Change tail
explicit same-Change causal merge     2 or more parents
cross-Change relationship             exact typed payload bindings
```

Multiple parents exist only for explicit causal convergence inside one Change. Cross-Change merge, split, dependency, overlap, and Planning semantics use exact revision bindings and atomic accepted batches rather than causal parents.

Missing parents, unknown required versions, invalid canonical bytes, digest mismatch, unauthorized authority, or inconsistent state digests remain visible and block dependent progression. Replay never silently repairs or omits invalid history.

## Private attempt and accepted identity

Private Runtime attempts and canonical accepted operations use separate identities. A stale remote base may leave useful private evidence, but reevaluation creates a new canonical operation identity. Runtime may bind bounded Evidence digests from the private attempt; it never aliases canonical IDs or persists raw failed work by default.

## Closed v1 operation catalog

Every kind defines schema, admission authority, preconditions, state reduction, conflict behavior, graph projection, and supersession behavior.

### Trace lifecycle

```text
trace.opened
trace.closed
trace.reopened
```

### Change intent and lineage

```text
change.proposed
change.revised
change.relationship_recorded
change.relationship_superseded
change.merge_recorded
change.split_recorded
change.withdrawal_recorded
change.feedback_recorded
```

A discovered Change uses `change.proposed` with discovery provenance and an exact typed relationship. Decision disposition derives approval, rejection, or deferral; there is no direct generic status operation.

### Change Claims

```text
change_claim.acquired
change_claim.released
change_claim.takeover_recorded
```

### Loop attempts and exit

```text
loop.attempt_started
loop.attempt_ended
decision.candidate_recorded
planning.candidate_recorded
implementation.candidate_recorded
loop.exit_policy_recorded
evidence.recorded
check.result_recorded
loop.exit_report_recorded
runtime.route_recorded
```

The exact chain remains:

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

### Planning coordination

```text
planning.epoch_recorded
planning.epoch_bound
```

`planning.epoch_recorded` is the closed project-scoped record kind that accepts one immutable `PlanningEpochRecord`; it does not use the ordinary Change-scoped envelope. Each participating Change receives one atomic `planning.epoch_bound` operation. Work Items live inside the exact Planning Candidate and epoch; they are not mutable CRUD records.

### Work Item Claims and Assignments

```text
work_item_claim.acquired
work_item_claim.released
work_item_claim.takeover_recorded
assignment.dispatched
assignment.cancel_requested
assignment.terminal_recorded
worker.report_recorded
```

Worker Reports are asserted producer material. Runtime may materialize admitted `worker_report` Evidence, but final assurance evaluates the exact integrated Candidate and tree.

### Integration and source effects

```text
integration.attempt_started
integration.result_recorded
source.branch_merge_recorded
source.branch_push_recorded
```

### Review, publication, delivery, and outcomes

```text
review_projection.published
product.publication_recorded
product.release_recorded
delivery.observation_recorded
outcome.observation_recorded
```

Authenticated approval enters through `evidence.recorded` with `approval_receipt`. Review projection cannot grant approval or semantic exit by itself.

## Explicit non-operations

Protocol v1 does not admit operations equivalent to:

```text
graph edge or node mutation
lesson or memory persistence
generic priority or status mutation
Check disabling or threshold lowering
heartbeat or session-message persistence
prompt or raw-output persistence
cache or view refresh
```

Graph facts, status, priorities, repair guidance, caches, and views derive from legitimate accepted operations and current policy.

## State commit acceptance

One provider-neutral Git state commit accepts an exact batch:

```ts
interface StateCommitManifest {
  previousStateHead: string;
  operationIds: string[];
  changedTraceTails: {
    changeId: string;
    previousTail: string;
    nextTail: string;
  }[];
  batchDigest: string;
}
```

Acceptance protocol:

```text
local proposal
→ validate against exact fetched snapshot
→ create operations and manifest
→ expected-head push
→ shared acceptance
```

A rejected push requires fetch, history verification, WorkState and Alignment Graph rebuild, and semantic reevaluation. Runtime never blind-rebases and retries an authority-bearing write.

## Physical layout

Protected source branch keeps durable project Knowledge/config such as:

```text
.codewiki/kb/**
.codewiki/config.json
```

Local readable hot materialization:

```text
.codewiki/changes/*.jsonl
```

Accepted hot state:

```text
refs/heads/codewiki/state
  .codewiki/changes/**
  immutable current objects
  state manifest
```

Local files are provisional until accepted on `codewiki/state`. They are not committed to the protected source branch.

## WorkState and Alignment Graph projection

Every valid operation deterministically reduces WorkState and emits a closed set of permitted graph facts. Full replay and incremental projection must be equivalent.

The entire Alignment Graph artifact is derived. Every fact preserves underlying source provenance:

```text
canonical_binding
observed_binding
deterministic_analysis
inferred_analysis
```

No edge is independently authoritative. Contradictory, superseded, stale, partial, and unknown facts remain queryable. Partial graph absence does not prove non-existence.

## Evidence retention

Canonical operations retain compact typed Evidence identities, authority, subjects, provenance, digests, and refs. Raw prompts, private reasoning, credentials, unrestricted output, screenshots, videos, logs, pages, provider payloads, and full failed patches remain private or external.

Negative, stale, partial, unavailable, excluded, and contradictory Evidence remains bound into exact Check Results. Compaction cannot summarize away canonical operations.

## Archive

Immutable terminal segments live on:

```text
refs/heads/codewiki/archive
  changes/<prefix>/<changeId>/<segmentDigest>.jsonl
  changes/<prefix>/<changeId>/manifest.json
```

Archive eligibility requires:

```text
intended Integration completed
+ no active Change Claim
+ no active Work Item Claim
+ no pending required review or effect
+ no pending configured outcome obligation
+ terminal Trace closure recorded
```

Safe ordering:

```text
close Trace
→ write archive bundle
→ push archive
→ fetch and verify remote digest
→ remove hot state copy
```

A crash may leave duplicate hot/archive bytes, which is safe. Premature hot deletion is not.

`ArchiveManifest` binds Change ID, protocol version, segment digests, root/tail operation IDs, closure reason, Integration/delivery/outcome refs, accepted state commits, and archive commit identity.

Hydration fetches `codewiki/archive`, verifies manifests and operation chains, and materializes read-only Runtime cache. This archive Git ref replaces the legacy per-Trace Git restore ref. V1 retains no compact hot stub after verified hot-copy removal. Reopening creates a new hot segment through `trace.reopened` referencing the archived tail and closure; archive bytes remain immutable.

## Repair learning

Repair Episodes and Repair Patterns derive from completed history. They are scoped analytical projections, not operations, authority, or another semantic Loop. Retrieval supplies bounded structured successful and harmful guidance to future producers/workers, never raw Trace history or independent Model Checks.

Stable guidance enters Knowledge, Protocols, Checks, routes, config, source, or tests only through Lab ablation, sealed holdout confirmation, and an accountable Change.

## Clean-cut status

Executable source still uses local-linear `.codewiki/traces/TRACE-CHG-<id>.jsonl`, singular `parentId`, local `sequence`, formatted event IDs, snapshot-heavy records, and local rollback. Those contracts are executable drift, not the target protocol.

The clean cut preserves `.codewiki/kb/**`, deletes obsolete dogfood/runtime state and legacy schemas/adapters/tests, and starts fresh v1 Change history. No migration or compatibility layer is authorized.

## Related docs

- [Alignment Model](alignment-model.md)
- [Runtime](runtime.md)
- [WorkState](work-state.md)
- [Loop Contracts](loop-contracts.md)
- [Evidence Records](evidence.md)
- [Planning Loop](planning-loop.md)
- [Session Coordination](session-coordination.md)
- [Knowledge](knowledge.md)
- [Lab](lab.md)
