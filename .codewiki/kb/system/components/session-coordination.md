---
type: Concept
title: Session Coordination Component
description: Session coordination gives one project control plane safe concurrent semantic sessions and isolated implementation workers without making session state canonical.
tags:
  - codewiki
  - system
  - components
  - session
  - coordination
timestamp: 2026-06-30T00:00:00Z
---
# Session Coordination Component

## Responsibility

Session coordination lets one project-scoped control plane run compatible work concurrently while preserving one semantic owner per invariant. It manages lanes, session references, claims, cancellation, budgets, supervision, recovery, and isolation evidence. Session state remains disposable operational context.

## Ownership

- `src/runtime/**` owns harness-neutral lane, scheduling, claim, lifecycle, and session-adapter contracts.
- `src/pi/**` owns Pi-specific embedded SDK and process-session adapters. `src/pi/sdk-semantic-session.ts` is exposed only through the entrypoint-isolated `./pi-sdk` package subpath.
- implementation worker adapters may use child processes or containers, but must implement the runtime worker contract rather than leak host semantics into core.
- `.codewiki/runtime/**` stores bounded private scratch, endpoint metadata, process observations, and recoverable session references only.

No session file, process registry, or runtime scratch becomes Product/System truth, Planning truth, semantic approval, or content proof.

## Runtime lanes

Runtime serializes authority where required and permits concurrency where safe:

| Lane | Concurrency contract |
| --- | --- |
| Proposal intake | Concurrent and idempotent. |
| Decision for one Change | One active semantic job per exact Change revision. |
| Decision across unrelated Changes | Concurrent within project budgets. |
| Project Planning | One accepted planning-epoch writer. Read-only analyzers may run concurrently. |
| Work Item Assignment | One active claim per Work Item. |
| Independent Work Items | Concurrent within capacity and isolation policy. |
| Shared paths or components | Held, isolated, or serialized according to Planning and runtime conflict checks. |
| Integration target | One guarded integrator per exact target/base. |
| Commit, merge, publication | Serialized and separately authority-gated. |

A session is not a lane. Reusing, replacing, resuming, or losing a session cannot transfer lane ownership or bypass a claim.

The current `ProjectCoordinator` kernel implements these admission rules inside one elected generation. It registers multiple Pi, dashboard, CLI/test, or future clients; separates observer presence from approved supervision; holds new execution when supervised policy has no approved supervisor; and supports explicit unattended policy. Typed Decision, Planning, Assignment, Implementation-review, Integration, and external-effect lanes plus normalized resource conflict refs determine compatibility. Write jobs must provide a durable recovery probe before admission, so generation restart can return exact persisted completion instead of repeating a canonical append.

The project service now owns cross-process election and client transport around the kernel. It binds only to `127.0.0.1`, writes endpoint metadata and bearer capability with current-user permissions, requires the exact coordinator generation on every request, rechecks the exclusive ownership record before serving, and gives each remote registration a bounded lease. Query parameters never carry the token. Live owners reject contenders; dead-owner takeover creates a new generation; stale owners return a fenced response instead of accepting work.

This transport does not make client identity an authority source. The service token is a local control-plane capability and must never enter traces, prompts, URLs, logs, Git, or external proposal payloads. Approved supervision remains explicit registration metadata from an authenticated local adapter.

Exact semantic scheduling now runs behind this service. A client submits only a bounded trigger. Runtime selects compatible invariants, assigns deterministic job identities and typed lanes, revalidates fresh WorkState, invokes the matching adapter, rechecks generation ownership before append, and binds successful writes to exact Change Trace event evidence. Restart recovery scans those selected traces and never trusts client-supplied completion. Pi/dashboard connection lifecycle, project event delivery, and implementation-worker lifecycle still need to move behind the service before process-local paths can be removed.

## Semantic session adapter

Runtime invokes bounded semantic work through a harness-neutral adapter. The target Pi implementation embeds `createAgentSession()` through the Pi SDK and creates distinct sessions for Decision, Planning, and Implementation review.

Semantic sessions:

- receive runtime-built typed input plus exact context refs and freshness guards;
- use read-only repository tools (`read`, `grep`, `find`, and `ls`) plus a closed candidate-submission tool;
- do not receive `bash`, `edit`, `write`, trace append, Git mutation, publication, config mutation, or worker-launch authority;
- return typed judgment or evidence candidates to runtime;
- cannot supply repository identity, Change/trace identity, append guards, routing, or authority owned by runtime;
- are bounded by model policy, wall time, tokens, cost, iteration count, and cancellation;
- may use persistent Pi session files for context efficiency, but must reload exact WorkState context each run and remain safely replaceable;
- expose bounded lifecycle and usage observations without prompts, private reasoning, credentials, or raw source logs.

Pi authentication and model configuration remain inside the Pi adapter. Core runtime receives capabilities and normalized outcomes, never credentials. The current SDK adapter uses in-memory sessions, disables discovered extensions, skills, prompts, themes, and context files, scopes read tools to the real project root, accepts exactly one object candidate, and remains an optional peer-backed spike until external model/auth and cleanup gates pass.

## Implementation worker adapter

Implementation workers use a separate adapter and stronger isolation boundary. The target order is:

1. process workers in isolated Git worktrees;
2. container workers when project policy or risk requires filesystem/process isolation;
3. future harness implementations behind the same worker contract.

Workers may receive scoped mutation tools required by one Assignment. They cannot append semantic facts, approve Changes, revise Planning, integrate outside exact authority, commit outside policy, publish, or relax configuration. Worktrees reduce collision but are not a security sandbox; stronger isolation requires a process sandbox or container policy.

## Always-ready behavior

Always ready describes runtime queues and recoverability, not immortal model processes.

- Backlog intake remains available whenever the local project control plane is reachable.
- Eligible semantic sessions are created or resumed on demand.
- Planning coalesces relevant portfolio changes and has one accepted writer at a time.
- Workers start only for claimed ready Work Items under current supervision, policy, and capacity.
- Quiescent work has no active model turn and produces no heartbeat trace noise.
- After restart, runtime reconstructs eligibility from canonical truth and treats stale process/session observations as non-authoritative.

## Supervision and recovery

Under supervised policy, losing all approved supervisors prevents new semantic or worker starts. Existing jobs follow explicit grace or cancellation policy. Unattended continuation requires separate project authority.

Runtime records only meaningful durable boundaries: claim, start, terminal result, blocker, cancellation, expiry, accepted semantic output, and recovery refs. High-frequency liveness remains bounded runtime observation.

Restart recovery verifies session identity, process liveness, claim freshness, source base, plan revision, and adapter capability before resuming. Ambiguous or detached work fails closed and returns to a safe queued, held, or remediation state.

## Related docs

- [Runtime](runtime.md)
- [WorkState](work-state.md)
- [Worktree Isolation](worktree-isolation.md)
- [Implementation Loop](implementation-loop.md)
- [Pi Extension](extension.md)
