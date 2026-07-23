---
type: Concept
title: Runtime
description: Runtime is CodeWiki's project-scoped control plane. It derives WorkState, schedules a compatible set of invariant repairs, owns session and worker lifecycles, guards writes and integration, and quiesces safely.
tags:
  - codewiki
  - system
  - runtime
timestamp: 2026-08-01T00:00:00Z
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
  - runtime.work_item.claimed
  - runtime.work_item.claim.released
  - runtime.work_item.claim.expired
  - runtime.work_item.claim.cancelled
  - runtime.host.started
  - runtime.host.observed
  - runtime.host.blocked
  - runtime.host.completed
  - runtime.host.stopped
codewiki_roles:
  - shared_error_contracts
  - outer_loop_coordination
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
      - runtime.work_item.claimed
      - runtime.work_item.claim.released
      - runtime.work_item.claim.expired
      - runtime.work_item.claim.cancelled
      - runtime.host.started
      - runtime.host.observed
      - runtime.host.blocked
      - runtime.host.completed
      - runtime.host.stopped
    role: outer_loop_coordination
---
# Runtime

Runtime is CodeWiki's project-scoped control plane and outer control loop. It is logically always available, event-driven, supervised, and physically quiescent when no eligible work exists. It does not own product meaning or semantic loop output.

```text
trigger or client request
-> refresh WorkState
-> identify eligible invariant repairs and mechanical actions
-> select a compatible bounded job set
-> acquire semantic lanes, claims, capacity, and integration guards
-> build exact typed inputs and context slices
-> run semantic sessions or implementation workers through adapters
-> validate quality-governed output and freshness
-> append accepted facts to affected Change Trace(s)
-> schedule permitted effects
-> repeat or quiesce
```

The three semantic loops are ongoing project capabilities, not processes embodied by individual traces or Pi conversations. One Change Trace records one Change journey. Runtime may run Decision work for independent Changes concurrently, admits one accepted project Planning writer at a time, and starts several non-conflicting Work Item Assignments under bounded capacity.

One semantic owner still governs each invariant. Concurrency means several compatible invariants may be repaired at once; it never means two writers may decide the same Change revision, accept the same Planning epoch, claim the same Work Item, or integrate into the same guarded target concurrently.

## Project control plane

One elected coordinator generation owns scheduling and durable write authority for a project. Dashboard, Pi, CLI/test, and future clients connect to it through bounded local capabilities. Client lifetime does not define runtime lifetime.

The control plane owns:

- proposal intake and idempotency;
- incremental WorkState projection and invalidation;
- compatible-job selection, lanes, fairness, capacity, and budgets;
- semantic-session and implementation-worker adapter invocation;
- supervision, cancellation, restart recovery, and bounded observation;
- guarded trace, Knowledge, integration, Git, preview, and cleanup effects;
- project state and event projections for connected clients.

A local service may remain available for intake and observability while execution is paused. Under supervised policy, losing all approved supervisors prevents new semantic or worker starts. Unattended continuation requires separate explicit project policy.

## Authority

Runtime owns:

- WorkState refresh and impact-bounded loop selection;
- guarded append to `.codewiki/traces/**`;
- exact trace-tail, entity-version, KB/policy/profile/target, Git-base, and WorkState freshness checks;
- multi-trace append preflight, deterministic batch ids, partial-commit detection, and idempotent recovery;
- Work Item readiness projection and Assignment claims;
- worker host start, observation, cancellation, release, and expiry;
- worktree and integration-workspace lifecycle;
- budgets, capacity, retries, stop conditions, and supervision;
- temporary artifacts, bounded logs, retention, and cleanup;
- host integration and capability reporting.

Runtime does not:

- invent or approve Change meaning;
- create Sprint or Work Item truth outside exited Planning output;
- accept worker output as Implementation truth;
- treat generated views as canonical input;
- bypass quality standards;
- broaden authority because automation is enabled;
- keep running when required supervision or policy authority disappears.

## Triggers

Runtime may react to:

- explicit user or agent input;
- persisted Change creation or revision;
- exact approval authority;
- approved Change portfolio changes;
- KB, source, test, Git, policy, profile, or target changes;
- Work Item readiness or dependency completion;
- worker result, timeout, claim expiry, cancellation, or host failure;
- integration conflict or successful merge;
- preview/browser observation;
- scheduled or event trigger becoming due;
- explicit continue, resume, stop, or cleanup request.

Triggers request observation. They do not grant semantic approval.

## Quiescence and stop

Runtime stops or remains idle when:

- no eligible invariant repair exists;
- user or external authority is required;
- policy or supervision blocks action;
- capacity or budget is exhausted;
- WorkState changed and a stale iteration must rerun;
- conflict requires Planning or Decision;
- required capability is unavailable;
- explicit stop or cancellation applies.

Quiescence is healthy state, not failure. Durable Change Traces and WorkState reconstruction make later resume deterministic.

## Runtime roles

| Role | Responsibility |
| --- | --- |
| Project control plane | Elected project coordinator that owns WorkState refresh, scheduling, lanes, session/worker lifecycle, guarded writes, integration, and client projections. |
| Client | Dashboard, Pi extension, CLI/test, or future adapter that submits bounded intent, evidence, authority, or control requests. |
| Semantic session | Bounded read-only Decision, Planning, or Implementation-review execution over runtime-supplied typed input. It returns a candidate; it does not append directly. |
| Worker | Narrow Assignment attempt for one Planning-owned Work Item in a process or container isolation boundary. It returns candidate evidence only. |
| Integrator | Serialized mechanical host for one exact integration target and source base under Planning and runtime authority. |

The target Pi semantic adapter embeds Pi SDK sessions. The target worker adapter starts process or container workers. Harness-neutral runtime contracts own inputs, outputs, capabilities, cancellation, and observations; Pi SDK types remain inside `src/pi/**`.

One process may perform several roles over time, but capabilities and authority remain explicit. Session identity is operational metadata, never a lane, claim, canonical entity, or proof. User-facing UX shows Changes, Sprints, Work Items, Assignments, blockers, evidence, and held reasons before internal host topology.

## WorkState-driven scheduling

Runtime derives one WorkState from canonical inputs and computes eligible jobs:

```text
persisted unapproved Change -> Decision job eligible
approved Change lacking current coverage -> project Planning dirty
ready Work Item -> Assignment job eligible
worker/integration result -> Implementation review job eligible
closed/retention-ready Change -> archive action eligible
no eligible job -> quiescent
```

Eligibility and admission are separate. Runtime first derives every bounded candidate, then admits a deterministic compatible set under lane, dependency, conflict, capacity, budget, supervision, and integration constraints.

The lane contract is:

- one Decision writer per exact Change revision, with unrelated Changes eligible concurrently;
- one accepted project Planning writer, with optional concurrent read-only analysis;
- one active Assignment claim per Work Item;
- several independent Work Items within capacity;
- one Integration writer per exact target/base;
- serialized commit, merge, publication, and other guarded external effects.

Selection remains deterministic under the same WorkState, trigger set, and policy. Trigger-local candidates receive bounded preference, then fairness uses age and stable identity. Planning expands through explicit Change links and overlapping target refs under a bounded horizon. Model judgment may rank semantically valid candidates only where policy permits; it cannot repair missing authority or override compatibility.

Current executable `RuntimeReactor.selectRuntimeReactions()` derives a bounded compatible horizon while `selectRuntimeReaction()` and `runRuntimeSemanticExecutor()` remain singular bounded job primitives. The transport-neutral `ProjectCoordinator` kernel registers concurrent clients, enforces supervision, deduplicates jobs, requires durable recovery for writes, and admits compatible typed lanes under capacity and resource locks. It serializes one Change Decision lane, one Planning writer, one Work Item assignment, and one integration/effect target writer while allowing unrelated Decisions and non-conflicting Work Items to run concurrently.

This kernel does not yet claim project-service ownership. Cross-process election, authenticated loopback transport, endpoint discovery, generation replacement, and exact execution of each selected reaction remain the next slice. Until then, process-local Pi reactors and one-shot host callers remain implementation drift rather than project-wide ownership.

Agents, clients, and adapters never choose semantic routing. Runtime injects exact Change, Planning horizon, Sprint, Work Item, Assignment, context slice, WorkState, and append authority. Semantic sessions return judgment or evidence only; they never provide trace identity, revision, digest, sequence, parent, byte offset, Planning events, source ownership, lane ownership, or runtime routing as replacement facts.

Each job has explicit iteration, wall-clock, token, cost, and CAS-retry budgets plus cancellation. A compare-and-swap race invalidates the observation and reruns or requeues the same runtime-selected work against fresh state. Preview performs one bounded iteration without repetition. A route-back result is appended as semantic evidence and stops forward repetition so the target owner or user can respond.

## Global Planning

Planning is a project lane, not a session attached to one Change Trace. New approvals and relevant canonical changes mark the bounded planning horizon dirty. Runtime coalesces those signals and admits one accepted Planning writer while claimed Work Items remain frozen according to plan-revision policy.

Planning may observe several approved Changes and emit one planning epoch. Runtime:

1. freezes participant Change revisions, trace tails, current plan revisions, policy, WorkState, and integration refs;
2. obtains one quality-governed Planning output;
3. validates Sprint and Work Item ids, one owning Change per Work Item, cross-Change refs, and participant coverage;
4. slices output by affected Change Trace;
5. preflights all trace tails;
6. appends deterministic events;
7. exposes and repairs any partial multi-file commit before downstream claims.

Filesystem multi-file append is not silently treated as atomic. A planning event carries epoch id, participant set, batch digest, and deterministic event ids so surviving records reveal missing participants. Runtime temp may hold a private write-ahead recovery packet; it does not become truth.

## Work Items and Assignments

Planning creates Work Items. Runtime creates bounded Assignment attempts.

A claim binds:

- Work Item and owning Change Trace;
- accepted Change and Planning revisions;
- worker/session identity;
- source base and worktree/integration refs;
- policy snapshot and lease;
- expected evidence contract.

Runtime selects only `ready` Work Items whose dependencies, plan revision, Change approval, integration state, and policy remain current. Active claims count against capacity. Overlapping paths, incompatible source bases, or shared integration constraints may hold otherwise-ready work.

Claim, release, expiry, and cancellation are runtime coordination events in the owning Change Trace. Worker completion alone does not mark a Work Item done; exited Implementation evidence does.

## Worker lifecycle

```text
accepted Work Item
-> claim preview
-> guarded claim append
-> worktree/integration preparation
-> worker session start
-> bounded observation
-> candidate result
-> Implementation iteration
-> semantic acceptance or remediation
-> release/cancel/expire
-> cleanup
```

Worker agents receive exact scoped prompts, refs, constraints, and evidence requirements. They cannot append semantic trace events, approve Changes, change Planning truth, merge outside authority, publish, or relax policy.

Worker liveness remains runtime observation. Meaningful start, terminal, claim, and blocker facts may enter traces; noisy heartbeats and raw logs stay outside semantic truth.

## Integration workspaces

Independent worker worktrees do not form combined product state automatically. Planning declares integration boundaries. Runtime creates or reuses one guarded integration-preview workspace, applies selected worker outputs in planned order, reports conflicts, and exposes exact integrated Change refs and Git/tree digest.

Shared Live Preview and aggregate checks use that integration state. Dashboard must distinguish:

- integrated and visible Changes;
- active but isolated Changes;
- pending merge Changes;
- conflicting Changes;
- superseded or excluded Changes.

Runtime cannot claim conceptual union when filesystem state is not integrated.

## Supervision and autonomy

Automation is bounded by effective configuration, accepted Change constraints, Planning output, and current host authority. Higher autonomy may permit runtime to continue eligible mechanical work, but never grants semantic approval, unsafe publication, arbitrary shell execution, or policy mutation.

Under supervised policy, losing approved supervision stops new host/worker starts and safely records or returns resumable state. Existing workers follow explicit cancellation/grace policy. Unattended continuation requires separate explicit project policy.

## Error contract

Host failures remain operational facts, not loop exit conditions. Structured errors include:

- kind and stable code;
- human-readable message;
- owning Change/Work Item/Assignment refs;
- retryability and terminality;
- evidence refs;
- recommended semantic or runtime route.

Runtime routes semantic insufficiency through loop quality results. It does not convert infrastructure failure into product rejection.

## Trace write contract

Runtime is sole trace writer. Before append it verifies:

- known Change Trace identity;
- expected byte offset, tail id, and next sequence;
- exact base Change/plan/entity versions;
- event schema and canonical refs;
- loop/output correspondence;
- successful quality exit for downstream-authoritative facts;
- deterministic event/batch idempotency;
- no close record precedes append.

Semantic loops may preview reports. Preview never mutates truth. Runtime coordination writes use narrow event constructors and cannot carry semantic loop authority.

## Retention and cleanup

Runtime temp lives under `.codewiki/runtime/**`, remains private and bounded, and is cleaned after durable evidence or recovery refs exist. Closed Change Traces may compact only after Git restore refs preserve full history and no active Sprint, Assignment, integration workspace, preview, or scheduled observation depends on hot detail.

Cleanup failure must not corrupt semantic state. Runtime reports it as operational remediation.

## Automation gates

Automatic execution requires passing source, package, Pi install/RPC/mutation, external lifecycle/failure, readiness, security, and cleanup gates under exact reviewed policy. Unattended worker start remains forbidden unless project policy grants it explicitly; ordinary supervised autonomy cannot imply that authority. Runtime reports effective gate and capability state before scheduling work.

## Source-checkout boundary

CodeWiki does not load or dogfood its own extension in this source repository during stabilization. Repo-local Pi uses native tools and pi-lens only. Packed candidates run in disposable external projects with isolated Pi settings. Those fixtures may exercise runtime triggers, Change Traces, workers, dashboard controls, failures, and cleanup without granting candidate code authority over its own checkout.

## Related docs

- [WorkState](work-state.md)
- [Loop Model](loop-model.md)
- [Loop Contracts](loop-contracts.md)
- [Traces](traces.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Worktree Isolation](worktree-isolation.md)
