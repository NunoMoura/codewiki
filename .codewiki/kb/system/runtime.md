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

It does not spawn workers, mutate traces, or write claims. The dispatcher claim helper converts an accepted dispatch plan into runtime claim trace events with per-trace sequence numbers. The claim append helper groups those events by trace, preflights expected byte offsets for every target trace, then appends each per-trace claim batch.

## Claim events

Runtime claim helpers create canonical trace events for worker leases without introducing a semantic runtime loop.

- Claim events use `runtime.work.claimed` or `runtime.claim.acquired` inside the affected trace, normally for implementation work.
- Release events use `runtime.claim.released`, `runtime.work.released`, `runtime.claim.expired`, or `runtime.claim.cancelled`.
- Claim refs include canonical planning refs and path scopes. Worker ids, claim ids, reasons, and expiry timestamps belong in `data`, not `refs`.
- `expiresAt` lets the work queue ignore stale claims and return work to `ready`.
- Dispatch claim batches require the next sequence per trace before creating claim events.
- Cross-trace claim append preflights every affected trace before writing. Filesystem-level multi-file atomicity remains host/runtime concern.

## Pi worker dispatch seam

CodeWiki integrates with Pi through an adapter boundary rather than importing the Pi SDK directly in core source. The seam requires a session factory compatible with Pi SDK sessions:

```text
create session -> prompt(worker prompt) -> optional dispose
```

Worker prompts include work-unit id, trace id, planning refs, component refs, path scopes, claim id, and evidence rules. The worker owns local TDD and produces evidence. Worker results are normalized into implementation loop output with claim, worker, and session provenance. After workers finish, the implementation loop supplies final aggregate content proof for the merged output.

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
