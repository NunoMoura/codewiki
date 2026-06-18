# Runtime

Runtime is CodeWiki's outer control loop. It is not a semantic loop and it does not own product truth.

```text
while active work exists:
  fold traces
  inspect loop outputs and exit conditions
  choose next semantic loop or coordination action
  append semantic iteration or runtime coordination event
```

## Responsibilities

Runtime owns:

- trace folding and next-action selection;
- source-backed context boundaries;
- trace-owned worker claims;
- ephemeral leases and lock helpers;
- scheduling and automation policy;
- progress budgets and stop conditions;
- dispatch requests;
- lifecycle and retention orchestration;
- temporary working data under `.codewiki/runtime/tmp/**`;
- host session refs and Pi-native compaction boundaries.

Runtime does not own accepted requirements, work-plan truth, implementation evidence, loop outputs, or generated views. Those are trace/KB/source/Git concerns.

## Scheduling

Runtime scheduling is a pure projection over the generated `work-queue` view. The scheduler selects `ready` work units up to `maxWorkers`, counts active claims against capacity, and holds work that overlaps path scopes with already claimed or selected work.

The scheduler emits a dispatch plan only:

```text
work-queue -> dispatch[] + held[]
```

It does not spawn workers, mutate traces, or write claims. Runtime policy then decides whether the plan may become appended claim events. Append is blocked when automation is `manual`, agency is `observe`, required expected byte offsets are absent, or a dispatch candidate is not backed by met planning quality standards. Runtime policy also plans worktree refs from `worktreeIsolation`; `auto` isolates parallel dispatch and dirty working-tree overlap. The dispatcher claim helper converts an accepted dispatch plan into runtime claim trace events with per-trace sequence numbers and optional worktree metadata. The claim append helper groups those events by trace, preflights expected byte offsets for every target trace, then appends each per-trace claim batch.

## Claim events

Runtime claim helpers create canonical trace events for worker leases without introducing a semantic runtime loop.

- Claim events use `runtime.work.claimed` or `runtime.claim.acquired` inside the affected trace, normally for implementation work.
- Release events use `runtime.claim.released`, `runtime.work.released`, `runtime.claim.expired`, or `runtime.claim.cancelled`.
- Claim refs include canonical planning refs and path scopes. Worker ids, claim ids, reasons, and expiry timestamps belong in `data`, not `refs`.
- `expiresAt` lets the work queue ignore stale claims and return work to `ready`.
- Dispatch claim batches require the next sequence per trace before creating claim events.
- Append mode requires automation policy that allows coordination writes; preview mode may still show the plan and policy blockers.
- Cross-trace claim append preflights every affected trace before writing. Filesystem-level multi-file atomicity remains host/runtime concern.

## Pi worker dispatch seam

CodeWiki integrates with Pi through an adapter boundary rather than importing the Pi SDK directly in core source. The seam requires a session factory compatible with Pi SDK sessions:

```text
runWikiRuntime(append) -> durable claim events -> create session -> prompt(worker prompt) -> optional dispose
```

The host adapter is a one-shot orchestrator, not a daemon loop. It appends trace-owned claims first, starts one independent session per appended claim, returns session refs, and then stops. Sessions continue independently unless the host explicitly disposes them. If session creation or prompting fails before a worker starts, the host prepares a trace-owned failed-start release batch with failure provenance; appending that batch remains an explicit host follow-up. Monitoring, completion collection, and retries remain host/runtime follow-up work, while semantic closure still happens through the implementation loop.

The host handoff manifest is a disposable JSON bundle for adapters. It combines the runtime dispatch result, claim events, inert worktree command steps, Pi-compatible worker session inputs and prompts, expected completion shape, and release helper instructions. It does not execute commands, spawn sessions, mutate Git, or append traces by itself. `previewRuntimeHostHandoff()` is the preview-only host helper that can optionally collect read-only Git status, run `wiki_runtime` in preview mode, and return this manifest; it rejects append mode and never starts sessions or executes worktree commands. `runRuntimeHostOnce()` is the append-mode helper: it appends claims, dry-runs required worktree prepare/verify commands by default, starts sessions through an injected factory, asks an injected collector for completion evidence, previews `wiki_implement`, dry-runs required worktree cleanup commands, then returns a `releaseCheck` plus a prepared `releaseBatch` only when implementation exit passes. Real worktree command execution requires `worktreeCommandMode: "execute"` or `worktreeCleanupMode: "execute"` plus an injected runner. By default it does not append implementation results or release events; hosts must opt in with `appendImplementation` and `appendReleases`. Release append uses expected bytes derived from the prior append in the same host call unless the host supplies explicit expected bytes.

Worker prompts include work-unit id, trace id, planning refs, component refs, path scopes, optional worktree refs, and evidence rules. The worker owns local TDD and produces structured completion evidence. The host adapter normalizes completion output into implementation `workerResults` with claim, worker, and session provenance. The default Pi process-session output capture lives under `.codewiki/runtime/tmp/<trace-id>/runtime/pi-workers/` so project-scoped Pi sandboxes do not need access to OS temp directories.

After `wiki_implement` consumes worker evidence, runtime runs a release check. The check reports `ready` when implementation exit passes, or when a worker reached a terminal `blocked`/`failed` status that should release the active claim without closing implementation. The prepared release batch contains normal completion releases (`worker_completed`, `worker_blocked`, or `worker_failed`). Terminal worker releases may be appended with `appendReleases`, but `appendImplementation` remains disabled unless implementation exit passes. When the host cannot close the cycle, it returns a remediation packet with a route (`retry_worker`, `planning`, `decision`, or `user`), blockers, refs, and suggested actions. Remediation is guidance, not trace truth, and does not append anything by itself. The implementation loop supplies final aggregate content proof for the merged output.

A future extension/host layer can implement the injected factory with Pi SDK sessions. That host layer also owns observing session refs and spawning/disposing sessions. Core remains testable and free of hard Pi SDK imports.

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

Cleanup policy:

- `exit` deletes loop temp after durable trace, KB, source, test, or Git refs exist.
- `continue`, `blocked`, or `route_back` may preserve loop temp for remediation.
- A superseding same-loop iteration deletes or replaces stale temp.
- Trace close deletes all remaining trace temp.

## Runtime source root

Runtime code lives under `src/runtime/**`:

- `boundary.ts`
- `claims.ts`
- `leases.ts`
- `scheduler.ts`
- `policy.ts`
- `budget.ts`
- `dispatcher.ts`
- `handoff.ts`
- `host-runner.ts`
- `lifecycle.ts`
- `tmp.ts`
- `types.ts`

Agency is automation policy and scheduling behavior, not an architecture root.

## Related docs

- [Loop Model](loop-model.md)
- [Traces](traces.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [File Structure](file-structure.md)
