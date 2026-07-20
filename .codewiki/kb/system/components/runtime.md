---
type: Concept
title: Runtime
description: Runtime is CodeWiki's supervised event-driven outer control loop. It derives WorkState, invokes exactly one owning semantic loop per eligible invariant, guards Change Trace writes, coordinates Assignments and integration, and quiesces safely.
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

Runtime is CodeWiki's outer control loop. It is logically always available, event-driven, supervised, and physically quiescent when no eligible work exists. It does not own product meaning or semantic loop output.

```text
trigger
-> refresh WorkState
-> identify unmet invariant
-> select Decision, Planning, Implementation, or permitted mechanical action
-> build bounded typed loop input
-> run one semantic iteration
-> validate quality-governed output and freshness
-> append accepted facts to affected Change Trace(s)
-> schedule permitted effects
-> repeat or quiesce
```

The three semantic loops are ongoing project capabilities, not processes embodied by individual traces. One Change Trace records one Change journey. Runtime may invoke loop iterations for many Change Traces over time and may run one global Planning epoch across several approved Changes.

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

## Host roles

| Role | Responsibility |
| --- | --- |
| Main host | User-facing Pi session for brainstorming, explicit Change persistence, approval, supervision, and guarded controls. It is not a singleton daemon. |
| Runtime coordinator | Project-scoped supervised reactor that refreshes WorkState, schedules loop iterations and Assignments, and guards writes. |
| Semantic loop host | Bounded execution of one Decision, Planning, or Implementation iteration over runtime-supplied typed input. It returns output; it does not append directly. |
| Worker host | Narrow Assignment attempt for one Planning-owned Work Item, usually in isolated worktree. It returns candidate evidence only. |

One process may perform several roles over time, but capabilities and authority remain explicit. User-facing UX should show Changes, Sprints, Work Items, Assignments, loops, blockers, and evidence rather than internal host topology unless a maintainer requests runtime detail.

## WorkState-driven selection

Runtime derives one WorkState from canonical inputs and uses impact-bounded selectors:

```text
persisted unapproved Change -> Decision eligible
approved Change lacking current coverage -> Planning eligible
ready Work Item -> Assignment eligible
worker/integration result -> Implementation eligible
closed/retention-ready Change -> archive eligible
no eligible transition -> quiescent
```

Selection is deterministic under the same WorkState, trigger, and policy. Runtime first prefers eligible Changes named by the triggering refs, then older unchanged work, then stable Change identity. This avoids fixed loop-priority starvation while keeping event-local reactions responsive. Planning expands from one selected Change through explicit Change links and overlapping target refs under a bounded horizon. Model judgment may rank semantically valid candidates only where policy permits; it cannot repair missing authority.

`RuntimeReactor` owns this selection and reuses one incremental `WorkStateSession`. Agents and adapters do not choose which semantic loop runs. `runRuntimeSemanticExecutor()` invokes only the selected adapter, injects exact Change, Planning horizon, Sprint, Work Item, Assignment, WorkState, and append authority, then repeats after committed truth changes until quiescence or a bounded stop. Semantic adapters return judgment or evidence only; they never provide trace identity, revision, digest, sequence, parent, byte offset, Planning events, or source ownership as replacement facts.

Each execution has explicit iteration, wall-clock, and CAS-retry budgets. A compare-and-swap race invalidates the incremental observation and reruns the same runtime-selected semantic work against fresh entity state. Preview performs one bounded iteration without repetition. A route-back result is appended as semantic evidence and stops forward repetition so the target owner or user can respond.

## Global Planning

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
