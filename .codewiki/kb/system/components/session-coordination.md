---
type: Concept
title: Session Coordination Component
description: Session coordination gives Project Runtime safe concurrent candidate and independent Model Check sessions plus isolated Implementation workers without making session state canonical.
tags:
  - codewiki
  - system
  - components
  - session
  - coordination
timestamp: 2026-07-30T00:00:00Z
---
# Session Coordination Component

## Responsibility

Session coordination lets one project Runtime execute compatible work concurrently while preserving one exact semantic owner per invariant. Session state is disposable operational context.

Runtime-visible jobs, Checks, Change Claims, Work Item Claims, Assignments, Integration work, and guarded effects are the complete durable concurrency model. Hidden sub-agent trees, chat sessions, process registries, and local heartbeats cannot own durable work or canonical writes.

## Ownership

- `src/runtime/**` owns harness-neutral scheduling, lane, ownership, lifecycle, cancellation, recovery, and adapter contracts.
- `src/pi/**` owns Pi-specific candidate-producer, independent Model Check, and process-session adapters.
- worker adapters implement one Runtime-owned Assignment contract through process, worktree, OCI, or a future harness.
- `.codewiki/runtime/**` stores bounded private scratch, endpoint metadata, process observations, artifacts, and recoverable references.

No session file, process registry, local service lease, or Runtime scratch becomes accepted Product/System Knowledge, Planning truth, semantic approval, or content proof.

## Durable lanes

| Lane | Concurrency contract |
| --- | --- |
| Proposal intake | Concurrent and idempotent. |
| Decision for one Change | One active semantic owner per exact revision and purpose. |
| Decision across independent Changes | Concurrent within budgets. |
| Project Planning | One accepted Planning writer; read-only analysis may run concurrently. |
| Work Item execution | One active Work Item Claim per exact Work Item revision. |
| Independent Work Items | Concurrent within capacity and isolation policy. |
| Shared source/Knowledge boundaries | Held, isolated, ordered, or serialized by accepted Planning and fresh Runtime checks. |
| Integration target/base | One guarded integrator. |
| Source branch, publication, release, delivery | Separately serialized and authority-gated. |

A session is not a lane. Reusing, replacing, resuming, compacting, or losing a session cannot transfer Change Claim or Work Item Claim ownership.

## Change Claims and Work Item Claims

A Change Claim binds one exact Change revision, semantic purpose, actor/authority, and project snapshot.

A Work Item Claim binds one exact Planning epoch, Work Item, Assignment, worker, source base, Worker Workbench, scope, budget, and obligation set.

V1 uses explicit acquisition, explicit release, and authenticated takeover. Automatic expiry is deferred until trusted remote time exists. Client clocks, Git timestamps, and private heartbeats cannot transfer ownership.

## Pi semantic sessions

Runtime creates independent bounded Pi SDK sessions for:

- Decision Candidate production;
- Planning Candidate production;
- Implementation Candidate production;
- each activated independent Model Check.

Candidate producers receive:

```text
versioned CodeWiki OS guidance
+ one exact Loop Protocol
+ exact current Change/Planning/Assignment context
+ bounded relevant successful and harmful repair guidance
+ scoped tools and Skills
```

Decision and Planning use bounded session context. Worker Workbench is exclusive to one exact Implementation Assignment attempt.

Candidate producers and independent Model Checks never share conversational state. Independent Model Checks receive only their closed exact request; they do not receive producer messages, repair guidance, mutable session context, or tools unless a future approved Check protocol explicitly requires a trusted adapter.

Semantic sessions cannot supply canonical identity, authority, current snapshots, Check activation, thresholds, Results, Runtime Route, or append guards. They return bounded typed Candidate or Model Check output only.

Pi retains provider/auth/model transport, session, compaction, extension, tool, and normal Skill mechanics. Runtime receives capabilities, route/configuration digests, usage, and normalized outcomes, never credentials.

## Implementation workers

Planning declares reproducible Worker Workbench requirements. Runtime provisions one exact private Worker Workbench before dispatch and binds:

- repository and source base;
- Change and Planning refs;
- Work Item Claim and Assignment identity;
- path/component/Knowledge scope;
- exact context and Loop Protocol digests;
- resolved tools/Skills and model route;
- required Checks and Evidence obligations;
- isolation identity and execution policy;
- budgets, cancellation, report path, and recovery refs.

Worker output is untrusted asserted material. Runtime validates identity, scope, source base, status, and artifact refs before recording one immutable Worker Report and materializing admitted Evidence. Worker completion never implies Implementation acceptance.

Preferred adapter order:

1. process workers in explicit Git worktrees;
2. opt-in OCI workers when policy/risk requires a stronger filesystem/process boundary and host supplies a digest-pinned image;
3. future harness implementations behind the same contract.

Container availability is probed before accepted Work Item Claim acquisition. Containerization alone does not grant semantic authority or prove sandbox completeness.

## Integration and final assurance

Accepted worker output enters a deterministic Integration lane keyed by target and exact base. Runtime revalidates Work Item Claim, Assignment, Worker Report, source scope, generation, and accepted state before combining output.

Final Implementation Candidate and Checks evaluate exact integrated content. Worker-local tests and proof establish provenance only; they cannot replace combined-tree verification.

Completed private artifacts remain until exact Integration proof and retention policy permit cleanup. Failed, blocked, cancelled, lost, or ambiguous attempts retain bounded facts needed for recovery and accountability.

## Local service and team synchronization

One local project daemon may coordinate several CLI, dashboard, or Pi clients. Its generation, bearer capability, local leases, and event journal protect local process ownership only. They are not shared team authority.

Team acceptance and ownership synchronize through provider-neutral Git `codewiki/state` expected-head CAS. A separate clone must fetch, verify, and rebuild WorkState before mutation. Local coordinator generation cannot make a Change Claim or Work Item Claim globally visible by itself.

Notifications and local event journals only invalidate or refresh snapshots. They never replace accepted operation history.

## Cancellation and recovery

Cancellation is explicit and bounded:

```text
assignment.cancel_requested
→ adapter cancellation/termination
→ immutable terminal Worker Report or explicit lost state
→ assignment.terminal_recorded
→ Work Item Claim release or authenticated takeover
```

Restart recovery verifies accepted ownership, exact bases, Workbench digest, worker/adapter identity, private report digest, and current generation before resuming or recovering. Ambiguous work fails closed.

## Current executable drift

Current source implements a detached local coordinator, generation fencing, leased loopback clients, bounded event replay, process/OCI adapters, local Work Item ownership events, cancellation, Worker Reports, Integration, and cleanup. It does not yet synchronize accepted ownership across clones. Existing local lease/heartbeat and expiry behavior is executable clean-cut debt; v1 canonical ownership uses explicit release and authenticated takeover.

## Related docs

- [Runtime](runtime.md)
- [WorkState](work-state.md)
- [Change Traces](traces.md)
- [Worker Workbench](worker-workbench.md)
- [Worktree Isolation](worktree-isolation.md)
- [CodeWiki OS and Loop Protocols](codewiki-os.md)
- [Loop Exit](loop-exit.md)
