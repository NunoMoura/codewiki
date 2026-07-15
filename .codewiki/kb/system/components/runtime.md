---
type: Concept
title: Runtime
description: "Runtime is CodeWiki's outer control loop. It is not a semantic loop and it does not own semantic truth. It is the sole trace writer: semantic loops produce appendable reports, and runtime validates and appends trace records."
tags:
  - codewiki
  - system
  - runtime
timestamp: 2026-06-30T00:00:00Z
codewiki_components:
  - error_handling
  - runtime
codewiki_source_patterns:
  - src/error-handling/**
  - src/runtime/**
codewiki_test_patterns:
  - tests/runtime/**
codewiki_trace_events:
  - runtime.work_unit.claimed
  - runtime.work_unit.claim.released
  - runtime.work_unit.claim.expired
  - runtime.work_unit.claim.cancelled
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
    trace_events:
      - runtime.work_unit.claimed
      - runtime.work_unit.claim.released
      - runtime.work_unit.claim.expired
      - runtime.work_unit.claim.cancelled
      - runtime.host.started
      - runtime.host.observed
      - runtime.host.blocked
      - runtime.host.completed
      - runtime.host.stopped
    role: outer_loop_coordination
---
# Runtime

Runtime is CodeWiki's outer control loop. It is not a semantic loop and it does not own semantic truth. It is the sole trace writer: semantic loops produce appendable reports, and runtime validates and appends trace records.

```text
while active work exists:
  read traces and derived views
  inspect loop outputs and exit conditions
  invoke the semantic loop named by trace-derived state, or run a mechanical Task Assignment already authorized by Planning
  append semantic loop report or runtime coordination event
```

## Responsibilities

Runtime owns:

- trace/view projection and mechanical next-action hints;
- source-backed context boundaries;
- trace-owned worker claims;
- ephemeral leases and lock helpers;
- scheduling and automation policy;
- progress budgets and stop conditions;
- Task Assignment / work-unit claim selection and worker-start handoff;
- lifecycle and retention orchestration;
- temporary working data under `.codewiki/runtime/tmp/**`;
- host session refs and Pi-native compaction boundaries.

Runtime does not invent accepted requirements, choose among raw Decisions semantically, create work-plan truth, create implementation evidence, own loop outputs, treat generated views as truth, or define loop quality standards. Those are KB/source/Git/semantic-loop concerns until runtime appends them as trace records. Views own the derived calculations and cacheable projections over traces; runtime reads those views to coordinate, but traces remain truth. Shared error contracts and recovery hints live under `src/error-handling/**`; runtime consumes them without making error handling a semantic loop.

## Hosts

CodeWiki has one runtime kernel/coordinator. It may be driven by different host roles, but those roles are not separate runtimes and do not own semantic truth.

| Host role | Responsibility |
| --- | --- |
| Main host | Active user-facing CodeWiki session. It supports brainstorming, persists mutable Changes through `wiki_change`, validates exact Change revisions with the user, and invokes `wiki_decide`. It does not need to remain focused on a trace after Decision exit. |
| Trace host | Independent process or session focused on one trace. It consumes the exited Decision, runs Planning and Implementation, coordinates that trace's workers, asks runtime to append guarded semantic iterations, and closes the trace. |
| Worker host | Narrow execution worker for one planned Task, usually in an isolated worktree; returns evidence to the trace host instead of appending semantic truth directly. |

The main session is the interaction workspace; there is no separate Ideas Workspace. The Changes Backlog is durable storage for mutable pre-Decision records, not another host role or semantic loop. `wiki_decide` freezes an exact validated Change snapshot and creates the trace-backed Decision. The trace then becomes an independently scheduled unit of work, allowing the main session to continue discussing or validating other Changes.

Trace independence is a runtime isolation contract: each trace owns its lease, policy snapshot, budgets, workers, worktrees, retries, cancellation state, append guards, and final validation. One trace's failure must not corrupt or stop another trace. Runtime may schedule several trace hosts concurrently within project policy, but each trace still has exactly one authoritative Decision, Planning, and Implementation history.

A single process may act in different roles over time, but normal background execution uses a trace-scoped host distinct from the main conversation. Under the current supervised policy, a trace host must stop safely when approved supervision disappears; durable trace state remains resumable by a later supervised host. Surviving main-session closure as unattended automation requires a separate explicit policy decision.

The runtime lifecycle starts trace hosts only for traces that already need Planning, Implementation, or closure. A `needs_decision` trace remains in the main session because Decision authority cannot be delegated to a background host. `dispatchTraceHosts()` requires an attached supervisor and converts bounded lifecycle actions into one trace-scoped session start each. `TraceHostSupervisor` deduplicates active trace sessions, enforces host capacity and elapsed-time budget, observes natural completion, and fails closed when monitoring or supervision is lost. `createPiTraceHostSessionFactory()` launches a controllable independent Pi process with a bounded trace-only prompt. Supervisor shutdown, cancellation, budget exhaustion, or supervision loss terminates that process without changing semantic trace truth; registry snapshots are ephemeral observations, and process detachment alone never grants unattended authority.

Trace-host stdout is consumed as Pi JSON events instead of being retained as a raw process transcript. The collector accepts only one bounded `CODEWIKI_TRACE_HOST_RESULT` envelope from the final assistant message, classifies it as `completed`, `needs_approval`, `blocked`, or `failed`, captures bounded model/usage and resumable Pi session identity, rejects secret-shaped or malformed content, and writes only the sanitized completion record under runtime temp. Cancellation is added by the supervisor. These outcomes support observability and handoff but have zero semantic authority: an approval digest still requires exact user approval through the owning guarded loop facade.

A stopped `needs_approval` or `blocked` session may be resumed through its exact captured Pi session id. Resume requires current trace-state and process-session guards plus an explicit acknowledgement that approval or blocker handling occurred outside the runtime control. The acknowledgement is not proof and never grants semantic authority. The resumed host re-reads trace truth and must stop again if the guarded facade does not confirm the required approval, evidence, or state transition.

## Execution policy and model routing

Every Trace Host and worker invocation must receive an explicit provider, model, and thinking level from one resolved execution policy. The policy context includes the target loop, Change type when available, worker profile, risk, path scopes, required tools, expected token use, prior attempts, and prior usage. Resolution first removes candidates that fail the effective quality floor, tool requirements, timeout, or remaining token, monetary, and latency budgets. Only then may it rank eligible candidates by estimated cost and latency. Cost or speed must never select a model below the required quality floor.

The declarative `runtime.modelRouting` configuration owns candidate identities, quality and latency classes, thinking levels, timeout limits, tool capabilities, pricing snapshots, expected input/output tokens, and the maximum number of escalations. Pricing is copied into resolved policy evidence so later review does not depend on mutable provider catalogs. Escalation is bounded, follows a failed attempt only, never repeats a route, and moves strictly to a higher quality class. Missing routes, tools, usage telemetry, or budget headroom block execution rather than falling back to an implicit Pi default.

`runRuntimeHostOnce()` resolves worker policy before claim append by previewing the exact selected Tasks, resolving one quality-first policy per Task, and rejecting blocked or stale policy identities before the guarded claim write. The handoff and session input carry the policy digest, selected provider/model/thinking, tool allowlist, timeout, pricing snapshot, remaining budgets, and escalation identity. Child Pi processes receive those exact values rather than implicit defaults. Guarded resume requires both the persisted and current policy snapshots to have the same digest.

Policy-controlled workers require attached supervision, active monitoring, foreground timeout enforcement, and cumulative usage telemetry. Successful Pi JSON usage is attributed to the selected route and checked against token, monetary, and latency limits. Missing or malformed usage, budget exhaustion, model mismatch, detached execution, monitoring loss, or policy drift fails closed before Implementation evidence can treat the attempt as successful. A retry is eligible only after failure and must move to an untried, strictly higher quality route within the configured escalation count.

`runtime.budgets` may cap elapsed time, latency, tokens, and monetary cost. The supervisor stops elapsed-time overruns and rejects natural completion as `blocked` when reported token or monetary spend exceeds policy or when configured economic budgets cannot be verified because usage telemetry is absent. Dashboard cards show the resolved route, thinking level, quality floor, rationale, observed spend, and limits. These operational results remain non-authoritative.

Agency presets compile into granular capabilities, but immutable ceilings always deny Change acceptance, destructive actions, public actions, source promotion, package publication, controller advancement, and execution without supervision. Dashboard commands can start, resume, or stop only a currently eligible session; they cannot relax these ceilings.

Host/session roles are internal runtime topology. User-facing UX should show Changes, Traces, Trace Detail, Decisions, Tasks, Assignments, and review/blocker status instead of exposing main host, trace host, or worker host concepts unless a maintainer is reading runtime architecture detail.

## Runtime sprint proposal

| ID | Decision | Status | Consequence |
| --- | --- | --- | --- |
| CHG-main-host-session-ingress | Any active Pi session in the repository may act as the main user session for Change capture, validation, and Decision ingress. | Accepted | Main host is not a daemon or singleton. Mutable pre-Decision truth lives in the Changes Backlog; accepted execution truth lives in `.codewiki/traces/**`. |
| CHG-decision-handoff-obligation | Any exact validated Change approved for execution must be captured as a trace-backed `decision.changes_approved` output unless it is explicitly non-executable or knowledge-only. | Accepted | Chat-only acceptance is not workflow truth. `wiki_decide` freezes the approved Change revision and hands the independent trace to runtime. |
| CHG-trace-host-scope | A trace host owns one independently executable trace and runs Planning plus Implementation for that trace. | Accepted | Main conversation may continue while trace execution proceeds; workers remain subordinate Task attempts inside one authoritative Implementation Loop. |
| CHG-planning-triggers | Planning owns recurring schedules, event triggers, hooks, and manual triggers. | Accepted | Decision states the goal; planning creates work units and triggers; implementation enables or consumes those triggers. |
| CHG-worker-liveness | Worker liveness belongs to implementation/runtime worker coordination. | Accepted | Use claims, leases, terminal release events, and meaningful progress events. Do not append noisy heartbeats as trace truth. |
| CHG-openclaw-heartbeat-mechanics | Borrow OpenClaw-style heartbeat coalescing, priority, retry, and busy deferral mechanics, not the generic assistant heartbeat prompt. | Accepted | CodeWiki heartbeat handling is deterministic and trace-derived; no `HEARTBEAT_OK` prompt semantics. |
| CHG-no-subtraces | CodeWiki does not use sub-traces. | Accepted | Use independent traces with lineage refs for recurrence runs, amendments, and retries. |
| CHG-trace-event-tree | Inside a trace, `id`/`parentId` forms a Pi-like event tree. | Accepted | Route-backs, retries, and alternative attempts can branch inside one trace without changing trace identity. |
| CHG-lineage-tree | Across traces, `trace_head.origin` metadata provides a Pi-like parent-session relationship without nested ownership. | Accepted | Run traces cite the trigger trace, trigger id, planning ref, run key, and source refs, then close independently. |
| CHG-repo-coordinator | Repo coordinator is optional infrastructure, not semantic authority. | Accepted | Add helpers under `src/runtime/coordinator/**`; coordinator heartbeats, checks due work, expires leases, and starts hosts, but never approves decisions or invents goals. |
| CHG-software-scope | CodeWiki stays scoped to software development for now. | Accepted | Source-map ownership, WU/AC/TDD proof, worker isolation, and trace evidence remain core differentiators. |

## Work-unit claim selection

Runtime work-unit claim selection is a pure projection over the generated `work-queue` view. In product language, it creates Task Assignments. It selects `ready` Planning-owned Tasks up to `maxWorkers`, counts active claims against capacity, and holds work that overlaps path scopes with already claimed or selected work. The generated `runtime-board` view combines Sprints Queue-compatible state, `work-queue`, `triggers`, and optional runtime previews so hosts and future UI surfaces can see pending coordination without creating a new truth root.

The selection emits claim candidates only:

```text
work-queue -> selected[] + held[]
```

It does not spawn workers, approve semantic truth, or write by itself. Runtime policy then decides whether selected candidates may become appended claim trace events. Append is blocked when automation is `manual`, agency is `observe`, required expected byte offsets are absent, or a selected claim candidate is not backed by met planning quality standards. Runtime policy also plans worktree refs from `worktreeIsolation`; `auto` isolates parallel claims and dirty working-tree overlap. The work-unit claim helper converts an accepted Task Assignment selection into runtime claim trace events with per-trace sequence numbers and optional worktree metadata. Runtime claim selection ignores raw Decision items; those must enter Planning first so Planning can own Sprints Queue ordering, conflicts, starvation, deferrals, and route-back policy. The claim append helper groups claim events by trace, preflights expected byte offsets for every target trace, then appends each per-trace claim batch.

## Claim events

Runtime claim helpers create canonical trace events for worker leases without introducing a semantic runtime loop.

- Claim events use `runtime.work_unit.claimed` inside the affected trace, normally for implementation work.
- Release events use `runtime.work_unit.claim.released`, `runtime.work_unit.claim.expired`, or `runtime.work_unit.claim.cancelled`.
- Claim refs include canonical planning refs and path scopes. Worker ids, claim ids, reasons, and expiry timestamps belong in `data`, not `refs`.
- `expiresAt` lets the work queue ignore stale claims and return work to `ready`.
- Lease expiration helpers can turn expired active claims into durable `runtime.work_unit.claim.expired` events with the expired claim as parent. This is meaningful liveness evidence, not a noisy heartbeat log.
- `runWikiRuntime()` can include lease expiry in the same backend coordination call as work-unit claim selection and heartbeat-cycle processing.
- Work-unit claim batches and lease expiration batches require the next sequence per trace before creating events.
- Append mode requires automation policy that allows coordination writes; preview mode may still show the plan and policy blockers.
- Cross-trace claim/lease append preflights every affected trace before writing. Filesystem-level multi-file atomicity remains host/runtime concern.

## Pi worker start seam

CodeWiki integrates with Pi through an adapter boundary rather than importing the Pi SDK directly in core source. The seam requires a session factory compatible with Pi SDK sessions:

```text
runWikiRuntime(append) -> durable claim events -> create session -> prompt(worker prompt) -> optional dispose
```

The host adapter is a one-shot orchestrator, not a daemon loop. It appends trace-owned claims first, starts one independent session per appended claim, returns session refs, and then stops. Sessions continue independently unless the host explicitly disposes them. If session creation or prompting fails before a worker starts, the host prepares a trace-owned failed-start release batch with failure provenance; appending that batch remains an explicit host follow-up. Monitoring, completion collection, and retries remain host/runtime follow-up work, while semantic closure still happens through the implementation loop.

The host handoff manifest is a disposable JSON bundle for adapters. It combines the runtime work-unit claim selection result, claim events, inert worktree command steps, Pi-compatible worker session inputs and prompts, expected completion shape, and release helper instructions. It does not execute commands, spawn sessions, mutate Git, or append traces by itself. `previewRuntimeHostHandoff()` is the preview-only host helper that can optionally collect read-only Git status, call `runWikiRuntime()` in preview mode, and return this manifest; it rejects append mode and never starts sessions or executes worktree commands. `runRuntimeHostOnce()` is the append-mode helper: it appends claims, dry-runs required worktree prepare/verify commands by default, starts sessions through an injected factory, collects completion evidence from the injected collector or default Pi output-file collector, previews `wiki_implement`, dry-runs required worktree cleanup commands, then returns a `releaseCheck` plus a prepared `releaseBatch` only when implementation exit passes. Completed worker evidence cannot release claims unless an implementation preview was produced; missing preview input blocks with user remediation. Real worktree command execution requires `worktreeCommandMode: "execute"` or `worktreeCleanupMode: "execute"` plus an injected runner. By default it does not append implementation results or release events; hosts must opt in with `appendImplementation` and `appendReleases`. Release append uses expected bytes derived from the prior append in the same host call unless the host supplies explicit expected bytes.

Worker prompts include work-unit id, trace id, planning refs, component refs, path scopes, optional worktree refs, and evidence rules. The worker owns local TDD and produces structured completion evidence. The host adapter normalizes completion output into implementation `workerResults` with claim, worker, and session provenance. The default Pi process-session output capture lives under `.codewiki/runtime/tmp/<trace-id>/runtime/pi-workers/` so project-scoped Pi sandboxes do not need access to OS temp directories.

After `wiki_implement` consumes worker evidence, runtime runs a release check. The check reports `ready` when implementation exit passes, or when a worker reached a terminal `blocked`/`failed` status that should release the active claim without closing implementation. The prepared release batch contains normal completion releases (`worker_completed`, `worker_blocked`, or `worker_failed`). Terminal worker releases may be appended with `appendReleases`, but `appendImplementation` remains disabled unless implementation exit passes. When the host cannot close the cycle, it returns a remediation packet with a route (`retry_worker`, `planning`, `decision`, or `user`), blockers, refs, and suggested actions. Remediation is guidance, not trace truth, and does not append anything by itself. The implementation loop supplies final aggregate content proof for the merged output.

A future extension/host layer can implement the injected factory with Pi SDK sessions. That host layer also owns observing session refs and spawning/disposing sessions. Core remains testable and free of hard Pi SDK imports.

## Coordinator, heartbeat adapters, and standing work

The repo coordinator is optional infrastructure, not semantic authority. It exists for cases where scheduled or triggered work should advance when no user-facing Pi session is actively watching the repository.

A runtime heartbeat may come from:

- opening a Pi session in the repository;
- an explicit command or host adapter call;
- a schedule adapter;
- a webhook or file/event adapter;
- worker completion, lease expiry, or retry follow-up.

Heartbeat handling may coalesce duplicate requests, prioritize manual/immediate requests over scheduled/retry requests, retry busy coordination, check due triggers from the `triggers` view, expire stale leases, create run traces from approved triggers, or start/retry trace and worker hosts. The triggers view marks an enabled schedule `due` when the latest UTC cron slot at or after implementation enablement has no run key yet. The due-trigger planner converts due triggers into scheduled heartbeats with concrete run keys. The heartbeat cycle can include those due heartbeats, drain the queue, build a run plan from the `triggers` view, and in append mode delegate to Trigger Runs. `runWikiRuntime()` exposes runtime coordination to host/backend callers as one backend call: work-unit claim selection, optional heartbeat-cycle processing, and optional lease expiry. Preview mode selects, drains, plans, and expires without writes. Append mode writes work-unit claim events, then lease-expiry events with expected-byte preflight, and can append heartbeat-triggered Run trace heads when policy allows. Trigger Runs produces trace-head previews only for targeted, enabled triggers with explicit run keys, and appends new `trace_head` records with an atomic no-existing-file guard. The new run still enters the normal decision → planning → implementation loops. Runtime must not approve decisions, invent goals, change planning semantics, or mark implementation complete without evidence.

Planning owns recurring schedules, event triggers, hooks, and manual triggers. A decision states the goal; planning turns that goal into work units and optional triggers; implementation enables or consumes those triggers; runtime coordinates worker start and run creation. Worker liveness is handled by leases, expired-claim releases, and meaningful runtime events, not noisy always-appended pulses.

Recurring or triggered work should not keep one endless trace alive. The policy/trigger trace can close after the CHG → WU → implementation chain proves the trigger. Each due run becomes an independent accountable trace with lineage refs to the trigger trace, trigger id, and planning work ref.

Host lifecycle records should be runtime coordination events such as `runtime.host.observed`, `runtime.host.blocked`, or `runtime.host.stopped`. They do not approve product truth, replace decision/planning/implementation, or turn indefinite watching into one endless implementation trace. Actionable work still becomes a normal trace that flows through decision, planning, and implementation.

## Automation gates

Runtime automation remains supervised until production gates are met. Unattended
worker start, auto-merge, and auto-publish stay disabled until CodeWiki has
multiple successful external package lifecycle smokes, passing package failure-path
smokes, no project-root ambiguity, no `.codewiki/runtime` scratch leakage after
checks, green archive/hydrate validation, and explicit approval policy for
destructive or externally visible actions.

Worker completion is transport evidence only. Runtime may coordinate claims,
worker starts, output collection, and releases, but semantic success still
requires `wiki_implement` preview/append evidence and passing implementation exit
standards.

## Host errors

Host errors are execution or coordination failures under the CodeWiki runtime. They are separate from semantic loop exit conditions.

Examples:

- main host: cannot create a trace, watch trace files, load config, or start a trace host;
- trace host: append conflict, lost trace session, or inability to coordinate worker results;
- worker host: start failure, lost session, worktree failure, missing output, malformed output, timeout, or permission failure.

Host errors carry a host role, kind, recovery hint, refs, and optional trace/work/worker context. They may be recorded in runtime coordination event `data` or returned in host remediation packets. They must not replace decision/planning/implementation quality standards.

## Progress boundaries

Runtime should detect motion versus churn. It can stop, block, or ask for approval when iterations consume budget without moving exit conditions toward `exit`.

Progress signals include:

- newly met exit conditions;
- changed canonical refs;
- repeated failure signatures;
- unchanged state digests;
- budget spent without new evidence;
- next safe action.

## Context and compaction

CodeWiki-owned context refresh is disabled for this repository during the rebuild. The old CodeWiki refresh window, source-backed projection injection, and automatic resume pickup caused agents to resume deprecated workflow assumptions.

Until a future explicit decision reintroduces extension behavior, conversation compression must use Pi native automatic compaction only. Runtime code may not inject refresh control messages, hidden projection messages, or per-turn CodeWiki compaction triggers.

## Temporary data

Temporary working data belongs under:

```text
.codewiki/runtime/tmp/<trace-id>/<loop>/
```

Runtime temp may hold `output.json`, `exit.json`, worker scratch, logs, and remediation notes while a trace is running. It is never source truth. Anything needed after loop exit must be promoted to trace events/checkpoints, KB docs, source/tests, or Git refs before cleanup.

Hybrid worker observability uses two signal classes. Durable trace records retain claims, releases, meaningful milestones, blockers, failures, completion, and accepted evidence. Ephemeral worker observations use a closed schema containing only trace/Task/worker/attempt identity, an allowlisted activity phase, timestamps, lease freshness, bounded numeric progress, and bounded execution-policy identity, route, tools, limits, and usage telemetry. Dashboard projection may display that operational policy and spend, but observations remain non-authoritative and reject unknown nested fields. Ephemeral observations may disappear after restart, expire to stale, and never satisfy semantic quality.

The Dev Log stores permitted operational diagnostics under `.codewiki/runtime/tmp/<trace-id>/dev-log/`. Entries are private (`0700` directory and `0600` files on POSIX), ordered, size-capped, rotated, and redacted before write. They exclude prompts, reasoning, environment secrets, credentials, arbitrary source contents, and raw unbounded output. Blocked or failed traces retain the log for diagnosis; durable trace-host closure removes it after the closure event appends successfully.

Cleanup policy:

- `exit` deletes loop temp after durable trace, KB, source, test, or Git refs exist.
- `continue`, `blocked`, or `route_back` may preserve loop temp for remediation.
- A superseding same-loop iteration deletes or replaces stale temp.
- Trace close deletes all remaining trace temp.

## Runtime source root

Runtime code lives under `src/runtime/**`:

- `claims.ts`
- `leases.ts`
- `work-unit-claim-selection.ts`
- `policy.ts`
- `work-unit-claims.ts`
- `handoff.ts`
- `host-runner.ts`
- `coordinator/**` — optional repo coordinator helpers such as heartbeat queues, due-trigger planning, Trigger Runs planning/starts, and future heartbeat adapters; no semantic authority.
- `lifecycle.ts` — pure main-host/trace-host lifecycle planning plus trace-owned host lifecycle event helpers.
- `trace-writer.ts` — runtime-owned append boundary for semantic loop reports and coordination trace records.
- `tmp.ts`

Agency is automation policy and scheduling behavior, not an architecture root.

## Related docs

- [Loop Model](loop-model.md)
- [Traces](traces.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Source Map](source-map.md)
