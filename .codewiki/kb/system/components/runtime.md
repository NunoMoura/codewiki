---
type: Concept
title: Runtime
description: Runtime is CodeWiki's project-scoped authority and control plane for exact identity, admission, Git-synchronized state, WorkState, rolling Planning, bounded execution, Loop exit, Integration, recovery, archive, and guarded effects.
tags:
  - codewiki
  - system
  - runtime
timestamp: 2026-07-30T00:00:00Z
codewiki_components:
  - error_handling
  - runtime
codewiki_source_patterns:
  - src/error-handling/**
  - src/runtime/**
codewiki_test_patterns:
  - tests/runtime/**
  - tests/helpers/runtime-implementation.mjs
codewiki_trace_events:
  - change_claim.acquired
  - change_claim.released
  - change_claim.takeover_recorded
  - work_item_claim.acquired
  - work_item_claim.released
  - work_item_claim.takeover_recorded
  - assignment.dispatched
  - assignment.cancel_requested
  - assignment.terminal_recorded
  - integration.attempt_started
  - integration.result_recorded
  - source.branch_merge_recorded
  - source.branch_push_recorded
  - product.publication_recorded
  - product.release_recorded
  - delivery.observation_recorded
  - outcome.observation_recorded
codewiki_roles:
  - shared_error_contracts
  - project_control_plane
codewiki_source_map:
  - id: error_handling
    source_patterns:
      - src/error-handling/**
    test_patterns:
      - tests/runtime/**
    role: shared_error_contracts
  - id: runtime
    source_patterns:
      - src/runtime/**
    test_patterns:
      - tests/runtime/**
      - tests/helpers/runtime-implementation.mjs
    trace_events:
      - change_claim.acquired
      - change_claim.released
      - change_claim.takeover_recorded
      - work_item_claim.acquired
      - work_item_claim.released
      - work_item_claim.takeover_recorded
      - assignment.dispatched
      - assignment.cancel_requested
      - assignment.terminal_recorded
      - integration.attempt_started
      - integration.result_recorded
      - source.branch_merge_recorded
      - source.branch_push_recorded
      - product.publication_recorded
      - product.release_recorded
      - delivery.observation_recorded
      - outcome.observation_recorded
    role: project_control_plane
---
# Runtime

Project Runtime is CodeWiki's project-scoped control plane and outer control loop. It is the sole project-scoped composition, authority, scheduling, persistence, and effect boundary—not a fourth semantic Loop.

```text
clients and triggers
→ Runtime admission and fresh WorkState
→ eligible semantic/mechanical jobs
→ bounded Candidate producers or workers
→ guarded Integration for admitted worker output
→ exact Evidence and Loop exit
→ Runtime Route
→ expected-head canonical acceptance or guarded effect
→ deterministic replay and projection
```

## Authority

Runtime alone owns:

- canonical Change, operation, Candidate, Evidence Record, Check Result, Exit Report, Planning epoch, request, policy, job, Assignment, and effect identity;
- actor/principal/role binding and authentication correlation;
- canonical observation time and protocol version;
- remote state head, source head, Knowledge/config/policy digests, and state digests;
- freshness, expected-head CAS, idempotency, and recovery;
- scheduler lanes, budgets, capacity, and supervision;
- intake source authentication/correlation, privacy sanitation, idempotency, deduplication, scope routing, and canonical Change proposal construction;
- snapshot-bound Backlog Triage Projection scheduling inputs and explainable Decision-attention selection;
- Change Claim and Work Item Claim lifecycle;
- Worker Workbench provisioning and Assignment dispatch;
- Evidence normalization, provenance/freshness/privacy validation, contradiction preservation, and approval correlation;
- Custom Check proposal validation, Runtime-owned stable identity and definition/config digests, guarded lifecycle changes, deterministic required activation, and policy binding;
- Check activation, Check Evaluator scheduling, Assessment validation, execution, cancellation, exact caching, and required-result fan-in;
- deterministic Runtime Route;
- canonical Git-backed writes;
- Integration, branch effects, review projection, publication, release, delivery, and outcome observation;
- archive eligibility, hydration, reopening, and cleanup.

Clients, sessions, candidate producers, workers, Checks, provider events, graph adapters, and generated views cannot provide Runtime-owned fields or authorize progression. Runtime does not approve Change meaning; Decision owns that authority. Runtime does not create Sprint or Work Item truth; Planning owns their immutable semantic content.

## Exact Loop exit

Runtime composes but does not redefine Loop meaning:

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

Decision, Planning, and Implementation own Candidate semantics and Loop-specific kernel Check declarations. Closed Check Types constrain project-authored Custom Checks. Runtime constructs identity, resolves protected-base and candidate-specific policy deterministically, schedules bounded independent Code Checks and type-specific Check Evaluators, validates one Assessment and Result per active Check, creates the immutable Exit Report, and chooses a route.

A passing Exit Report is not write or effect authority. Runtime revalidates current state, exact bases, generation, actor authority, CAS, and effect-specific policy immediately before action.

Custom Check policy acceptance follows that split explicitly. Required policy-review `pass` remains Evidence, not Git authority. Runtime separately authenticates acceptance authority, binds repository identity and configured protected ref, creates a config-only child of the reviewed protected head, holds the shared config lock for final working-state revalidation, pushes under exact expected-head Git CAS, and re-observes accepted config bytes. Stale or rejected effects are never blindly rebased or retried.

## Project snapshot and freshness

Team WorkState snapshot identity binds:

```text
repository identity
+ codewiki/state head
+ protected source head
+ Knowledge digest
+ config and policy digests
```

Runtime exposes:

```text
fresh | stale | offline
```

Unsafe distributed mutation requires `fresh`. Private attempts may continue offline, but cannot acquire accepted ownership or publish canonical operations.

Polling, webhooks, SSE, and provider events only invalidate a cursor. WorkState refresh follows a Runtime fetch and verification of Git refs and operation bytes before rebuilding WorkState and the Alignment Graph.

## Canonical append

Target shared carrier:

```text
refs/heads/codewiki/state
```

Append protocol:

```text
receive bounded proposal
→ fetch and verify expected remote state
→ admit against exact snapshot and authority
→ derive operation bytes and state manifest
→ create one Git state commit
→ push with exact expected head
→ accept all operations or none
```

A stale rejection triggers fetch, verification, full semantic reevaluation, and either a new operation or rejection. Runtime never blind-rebases and retries authority-bearing writes.

Semantic truth remains in operation bytes. The Git commit supplies atomic batch receipt and global accepted order.

## Scheduler

Runtime-visible jobs, Checks, Change Claims, Work Item Claims, Assignments, Integration work, and guarded effects are the complete durable concurrency model. Hidden sub-agent trees cannot own durable work.

Representative lanes:

```text
concurrent idempotent Change intake
Decision-attention selection from Backlog Triage Projection
Decision candidate production
Planning candidate production
Implementation candidate production
independent Model Checks
Work Item execution
Integration per target/base
review projection
source branch effects
publication/release/delivery effects
archive/hydration
```

Runtime selects the maximum safe useful set under dependencies, conflicts, current ownership, source/Knowledge boundaries, capacity, budgets, supervision, and provider capability. Agent count is not progress.

## Change intake and Decision attention

Runtime accepts one closed union of bounded user suggestions, provider-neutral pull-request findings, worker discoveries, regression/scanner findings, delivery/outcome observations, and Knowledge drift. Source-specific contracts require exact actor/provider/Assignment/run/tree/Trace bindings. Producers cannot supply canonical identity, authority, time, risk, priority, route, or operation fields.

Against a fresh snapshot, Runtime authenticates, sanitizes, normalizes, deduplicates, classifies source claims, and determines whether material belongs to current-Change repair/route-back, reinforces existing work, or proposes an independent pending Change. Expected-head Git admission makes accepted intake concurrent and idempotent. Sensitive security material is redacted or held for authorized handling.

Runtime rebuilds the Backlog Triage Projection from accepted pending/deferred revisions, WorkState, Alignment Graph facts, source observations, config, and policy. The projection exposes provenance-bearing Decision readiness, urgency, expected impact, estimated effort, risk of inaction, confidence, overlap, freshness, and bounded ordering reasons. Unknown remains unknown; Evidence authority remains distinct from canonical/observed graph bindings and deterministic/inferred analysis provenance.

This projection selects Decision attention only. It is not canonical priority, cannot disposition a Change, and cannot schedule implementation. Explicit user selection may choose any eligible pending revision. Rolling Planning alone orders execution across accepted Changes.

## Change Claims

A Change Claim grants exclusive authority for one exact Change revision and semantic purpose. It binds actor, authority, remote state head, source/Knowledge/config/policy snapshot, and acquisition operation.

V1 supports explicit acquisition, explicit release, and authenticated takeover. Runtime does not use client or Git timestamps for automatic expiry.

## Work Item Claims and Assignments

A Work Item Claim binds exact Planning epoch, Work Item, Assignment attempt, worker, source base, Worker Workbench, scope, budgets, and obligations.

Runtime must provision and validate the exact Worker Workbench before acquisition/dispatch. Worker completion does not imply Implementation acceptance. Runtime retains the Work Item Claim until explicit release or authenticated takeover according to terminal/Integration policy.

## Rolling Planning

Decision may approve new Changes while earlier Changes execute. Runtime marks Planning eligible when accepted intent or relevant project state changes.

One Planning writer observes:

- selected Change set and participant revisions;
- current Planning epoch;
- active Change Claims and Work Item Claims;
- active Work Items and Assignments;
- source/Knowledge/config/policy snapshot;
- dependencies, conflicts, Integration state, capacity, and supervision.

Runtime accepts one immutable `PlanningEpochRecord` plus atomic `planning.epoch_bound` operations through one state commit. New Planning preserves safe active Assignments and requires explicit pause, migration, cancellation, block, or route-back when assumptions change.

## Sessions and workers

Pi owns provider authentication, model transport, sessions, compaction, tool mechanics, extensions, and ordinary Skill discovery. Runtime starts bounded independent Pi SDK sessions for candidate production and Model Checks.

Candidate producers receive versioned CodeWiki OS guidance, one exact Loop Protocol, current work, bounded relevant Repair Episodes/Patterns, and scoped tools/Skills. Independent Model Checks do not receive producer conversation or repair-learning context.

Implementation workers run inside one exact private Worker Workbench per Assignment attempt. Process, worktree, OCI, or future adapters implement the same harness-neutral contract. Workers return asserted immutable Worker Reports; Runtime validates and integrates admitted output, materializes valid bounded Evidence, and evaluates the exact integrated Candidate.

## Evidence and Checks

Runtime materializes only closed Evidence kinds and fixes exact subject, authority, provenance, freshness, privacy, and digest. Raw provider/worker/tool payloads remain private.

Evidence authority:

```text
asserted | observed | verified | approved
```

It cannot grant exit or effects.

Every considered Evidence identity—including stale, excluded, unavailable, negative, and contradictory records—stays bound into Results. Operational failures are `indeterminate`; Runtime never fabricates candidate failure or passing Evidence.

Checks may fan out concurrently under bounded budgets. Required Result fan-in remains complete and deterministic. A failed required Check does not cancel unrelated feedback-producing Checks unless explicit policy requires cancellation.

## Integration

Integration is Runtime work, not another semantic Loop. Runtime:

1. validates accepted Worker Report and Assignment provenance;
2. combines output in an isolated Integration workspace;
3. records exact base, changed paths, tree/commit, and conflict observations;
4. materializes `integration_proof` Evidence;
5. evaluates final Implementation Candidate against exact integrated content;
6. records `integration.result_recorded`;
7. performs separately authorized source branch effects if requested.

Worker-local verification cannot replace final combined-tree assurance.

## Review and human authority

CodeWiki dashboard remains the canonical dossier/review surface. Policy may additionally allow a guarded isolated review ref and draft pull request.

`review_projection.published` records publication of an exact Validation Bundle but grants no approval or exit. Provider events remain untrusted until Runtime re-observes authenticated actor/role, repository, pull request, exact head, decision, bundle digest, event identity, and freshness into `approval_receipt` Evidence.

Candidate, tree, head, preview, media, or bundle drift invalidates dependent approval. Request changes creates same-Change repair evidence while intent remains stable.

## Guarded effects

These are distinct effects with independent authority and proof:

```text
Integration
source branch merge
source branch push
review projection
product publication
product release
delivery/deployment
outcome observation
```

One effect never implies the next. No effect is authorized by worker completion or Loop exit alone.

## Alignment Graph

Runtime projects every accepted operation through one versioned deterministic projector. Graph snapshot identity binds accepted state head, Knowledge, protected source, config/policy, and projector version.

Every fact retains source provenance:

```text
canonical_binding
observed_binding
deterministic_analysis
inferred_analysis
```

Runtime exposes bounded read-only semantic queries. No arbitrary graph write or Cypher surface is admitted.

## Archive and hydration

Archive eligibility requires terminal closure, completed configured Integration, no active Change Claim, no active Work Item Claim, and no pending required review/effect/outcome obligation.

```text
close Trace
→ write immutable archive bundle
→ push codewiki/archive
→ fetch and verify digest
→ remove hot state copy
```

Hydration fetches and verifies exact archive manifests/segments into read-only Runtime cache. Reopening starts a new hot segment referencing archived closure; archive bytes remain immutable.

## Repair learning

Runtime may derive a disposable index of Repair Episodes and Repair Patterns from archived history. Retrieval is bounded by Loop, issue class, repair target, Check identity, source/Knowledge boundary, outcome, evidence strength, and recency.

Historical guidance cannot enter independent Model Checks, lower thresholds, disable Checks, change activation, grant authority, or include raw history. Stable promotion requires Lab ablation, sealed holdout confirmation, and a normal Change.

## Service boundary

One local project Runtime may be hosted by the standalone CLI process or detached project daemon. CLI, dashboard, optional thin Pi client, and future adapters connect through authenticated bounded contracts. Client lifetime does not own Runtime lifetime.

No canonical database, graph database, message broker, hosted relay, blockchain, or self-hosted coordination service is required. Git is the provider-neutral synchronization carrier.

## Source-checkout boundary

This repository does not load or dogfood its own extension during stabilization. Pi native coding tools, Pi-Lens, Knowledge, source/tests, and Git remain development authorities. Packed external projects test Runtime, clients, workers, failures, effects, and cleanup.

## Automation gates

Unattended worker start requires explicit accepted policy, fresh shared state, available supervision/capability, bounded budgets, exact ownership, and guarded cancellation/recovery. Automation gates cannot weaken Loop exit or effect authority.

## Current executable drift

Current source has a detached local coordinator, local generation fencing, local Change Trace writes, isolated worker/Integration primitives, and guarded branch/publication operations. Current policy snapshot and lease behavior protects only local process coordination. Source still uses expected-byte/local-sequence mutation, local ownership events, and partial filesystem recovery. Separate clones cannot coordinate accepted ownership. The clean cut replaces those contracts after pure protocol and two-clone Git experiments pass.

## Related docs

- [Change Traces](traces.md)
- [WorkState](work-state.md)
- [Session Coordination](session-coordination.md)
- [Loop Exit](loop-exit.md)
- [Evidence Records](evidence.md)
- [Planning Loop](planning-loop.md)
- [Worker Workbench](worker-workbench.md)
- [Worktree Isolation](worktree-isolation.md)
- [Alignment Model](alignment-model.md)
- [Adapters and UI](adapters-and-ui.md)
