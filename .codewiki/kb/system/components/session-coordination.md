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

Exact semantic scheduling now runs behind this service. A client may submit a bounded trigger for autonomous adapters or a candidate-only payload for one semantic loop. Runtime still selects the exact eligible invariant, rejects loop mismatch and runtime-owned candidate fields, assigns deterministic job identity and typed lane, revalidates fresh WorkState, rechecks generation ownership before append, and binds successful writes to exact Change Trace event evidence. Restart recovery scans selected traces and never trusts client-supplied completion.

A detached project daemon owns coordinator lifetime. Its Pi launcher dynamically loads the optional SDK execution adapter. Pi sessions register leased clients, use remote inspection, submit bounded triggers for service-owned semantic execution, heartbeat while active, reconnect after generation loss, and disconnect on `session_shutdown`. Main-conversation candidate tools remain a peer-absent fallback and expose only the runtime-selected loop. Interactive and RPC Pi sessions are explicit approved supervisors; print/JSON sessions are observers. Dashboard runtimes register distinct observer clients. A disposable packed spike proves two real Pi RPC processes and one dashboard share one generation, receive cross-process coordinator events, and pause execution after both supervisors exit.

Each generation owns a bounded in-memory event journal with monotonic cursors. Leased long polls replay bounded coordinator events plus runtime-observed WorkState digests. A cursor older than retained history, a cursor ahead of the generation, or a replacement generation causes snapshot refresh. Event payloads never replace canonical state. Pi event consumers rerun runtime inspection only after completed/recovered jobs, policy changes, or replay reset; failures do not create automatic retry loops. Dashboard observers reconnect and resubscribe after generation loss. External real-model/auth execution proof and implementation-worker lifecycle remain open.

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

Pi authentication and model configuration remain inside the Pi adapter. Core runtime receives capabilities and normalized outcomes, never credentials. The current SDK adapter uses in-memory sessions, disables discovered extensions, skills, prompts, themes, and context files, scopes read tools to the real project root, and accepts exactly one object candidate. The daemon now loads and schedules this adapter when the optional peer is resolvable; external real-model/auth, cancellation, and cleanup gates still block promotion beyond the optional peer-backed boundary.

## Implementation worker adapter

Implementation workers now use a harness-neutral Assignment adapter contract. Each exact input binds repository, Assignment, worker, claim, Work Item, Change Trace, Planning refs, path/component scopes, WorkState digest, source base, context digest, prompt digest, report path, execution policy, and explicit isolation identity. Deterministic coordinator jobs use the per-Work-Item Assignment lane, write-effect recovery probes, and hierarchical path conflict checks. Independent assignments run concurrently; overlapping paths serialize.

The Pi daemon installs a compatibility process adapter over the existing worker process/session path. It requires explicit Git-worktree isolation, rejects report paths outside `.codewiki/runtime/**` or through symlinks, normalizes worker output, and atomically persists one digest-bound private Worker report. Authenticated Pi triggers ask the elected service to reconcile workers. The service derives ready Work Items from canonical WorkState, appends exact claims under CAS, prepares structured Git worktree commands plus explicitly configured setup commands, and admits each Assignment through coordinator supervision, capacity, and path-conflict locks. Private Assignment packets are written before claim append and are executable after restart only when their digest and deterministic job id match the active canonical claim. A replacement coordinator can recover the same Worker report without reinvoking the worker. Exact completed reports become candidate evidence for the selected Implementation review; they contribute to the semantic job identity but never append semantic facts directly. Completed claims remain active until Implementation acceptance is canonical. Blocked, failed, or cancelled reports bypass semantic acceptance and become eligible only for deterministic terminal release handling. Graceful service shutdown aborts active Assignment jobs, propagates cancellation to foreground Pi processes, waits for process exit, escalates from `SIGTERM` to bounded `SIGKILL` when needed, and persists a digest-bound cancelled report before releasing the job lane.

The target adapter order remains:

1. process workers in isolated Git worktrees;
2. opt-in OCI container workers when the selected host supplies a digest-pinned image and project policy or risk requires a stronger filesystem/process boundary;
3. future harness implementations behind the same worker contract.

Container-only adapters are probed before runtime appends a Claim. An unavailable Docker/Podman service therefore produces an explicit held reason instead of authorizing work that cannot start. The OCI adapter mounts the exact worker worktree and one pre-created outcome file plus canonical Git common metadata read-only; it never mounts the project checkout, Docker socket, home directory, or whole runtime directory. Fixed Git environment binds the linked worktree to that read-only metadata, and resolved worktree metadata must belong to the canonical repository. It disables image pulls, privilege escalation, capabilities, and broad default networking; bounds time, output, memory, CPU, PIDs, and temporary space; strips ambient Docker/Podman remote-context variables from the runtime client; and forwards only explicitly configured non-runtime environment names. Cancellation and replacement do not produce a terminal Worker report until a structured exact-name query proves the deterministic container is absent. A named non-host network may be supplied for a separately governed egress proxy. The default image command `/usr/local/bin/codewiki-worker` reads one schema-v1 Assignment envelope from standard input, mutates `/workspace`, and writes a bounded status plus optional normalized Implementation evidence to the exact mounted outcome path; hosts may replace that command only through structured argv. Container output is untrusted candidate material: the host adapter validates identity and status, creates the digest-bound immutable Worker report, and retains canonical acceptance authority in the Implementation loop.

Terminal release jobs revalidate exact active Assignment identity, current WorkState, coordinator generation, and trace bytes immediately before append. Cancellation after process start and cancellation-aware coordinator draining are implemented for foreground Pi workers; abrupt process death still relies on replacement-generation recovery. Every worker reconciliation now classifies private Assignment packets, Worker reports, worker output, and runtime-local worktrees against canonical Claim events. Artifacts matching active Claims are always preserved. Pre-Claim scratch and terminal failed, blocked, or cancelled artifacts are removed idempotently; runtime-local partial worktrees are deleted and Git worktree metadata is pruned through the injected structured runner.

Completed accepted work enters a deterministic Integration lane keyed by the exact Planning target set and source base. Integration rechecks the Claim-bound packet digest, accepted Work Item, Worker report, path scopes, generation ownership, and trace CAS; captures a bounded binary patch including untracked files; applies it to a private integration worktree; runs Git whitespace validation; and creates a local integration commit. `runtime.integration.proven` binds exact commit/tree/content proof before completed artifacts become cleanup-eligible. Commit-trailer and in-progress-manifest recovery cover failure before trace append without treating either private artifact as authority.

A separately authorized project-branch effect may promote that commit only by exact fast-forward. Its deterministic job binds canonical Integration event/job, parent/commit/tree/content proof, checked-out `refs/heads/*` target, prior target commit, coordinator generation, and exact user or policy authority supplied by the elected host. One effect lane serializes each target branch. Runtime allows its own trace/runtime dirtiness but rejects unrelated dirty paths, stale or non-fast-forward targets, detached or wrong branches, malformed Git results, and proof drift. `runtime.project_branch.merged` closes the merge boundary and supports merge-to-append recovery.

Push uses another exact remote/branch effect lane and requires elected-host user authority, not policy authority or a client trigger. The job binds canonical merge proof, configured remote name, checked-out local commit/tree, expected remote commit or absence, and generation; rejects credential-bearing or unsupported remote URLs; disables repository pre-push hooks; and issues only a normal structured non-force push. `runtime.project_branch.pushed` follows a digest-bound private prepared/pushed manifest plus exact remote re-observation; recovery requires the exact `pushed` phase and remote state, preventing a preexisting matching remote commit from being misattributed. Death before that phase persists remains fail-closed and unattributed.

Publication uses a distinct target/channel effect lane and a provider-neutral adapter supplied by the elected host. Exact user authority binds canonical push proof, target, artifact digest, version, and expected destination revision/digest. Runtime accepts only bounded non-symbolic artifact files under private publication scratch, freezes scheduled identity, validates source commit/tree and bytes, requires provider-key adapter idempotency using the deterministic job id plus destination CAS, and re-observes provider operation, revision, and artifact digest before `runtime.product.published`. Prepared/published manifests support exact persisted-operation recovery; matching provider state without operation evidence remains unattributed. Adapter credentials and implementation remain host-owned, and the contract grants no deployment, release, Git, tag, channel-promotion, or arbitrary-shell authority.

Workers may receive scoped mutation tools required by one Assignment. They cannot approve Changes, revise Planning, integrate outside exact authority, commit outside policy, publish, or relax configuration. Worktrees reduce collision but are not a security sandbox; stronger isolation uses the OCI container policy where explicitly selected.

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
