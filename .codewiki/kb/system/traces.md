---
id: spec.system.traces
title: Traces
state: active
summary: Pi-session-like JSONL trace model for CodeWiki workflow and state truth.
owners:
  - architecture
  - product
updated: "2026-06-11"
---

# Traces

## Responsibility

CodeWiki traces are the durable workflow and state record for software work. The model borrows from Pi sessions: one file is an append-only JSONL stream of typed records, and current context can be rebuilt by replaying the stream and reading compact checkpoint records.

A trace represents one accountable change journey from intent through decision, planning, implementation, gates, runtime boundaries, and production-ready or published content evidence.

## Canonical storage

Hot trace files live under:

```text
.codewiki/traces/TRACE-*.jsonl
```

Each line is one JSON object with a `type` field. The first line is always `trace_head`. Later lines are ordered events or checkpoints.

```text
trace_head
trace_event
trace_event
tail_checkpoint
trace_event
tail_checkpoint
```

The trace file is its own hot catalog entry. Cold retention keeps a compact trace stub plus Git restore refs. There is no separate canonical telemetry catalog.

## Record types

### `trace_head`

Stable identity and top-level scope.

```json
{
  "type": "trace_head",
  "traceId": "TRACE-20260611-example",
  "title": "Short accountable change title",
  "createdAt": "2026-06-11T00:00:00.000Z"
}
```

### `trace_event`

Ordered lifecycle event. Events use refs and compact summaries, not full transcripts or full source snapshots.

```json
{
  "type": "trace_event",
  "id": "evt-0001",
  "parentId": null,
  "traceId": "TRACE-20260611-example",
  "sequence": 1,
  "loop": "decision",
  "event": "decision.approved",
  "refs": ["kb:system/file-structure.md#target-package-source-structure"],
  "createdAt": "2026-06-11T00:00:00.000Z",
  "data": {}
}
```

### `tail_checkpoint`

Derived compact state for fast resume and view generation. Replay from `trace_head` remains authoritative.

```json
{
  "type": "tail_checkpoint",
  "id": "tail-0001",
  "parentId": "evt-0001",
  "traceId": "TRACE-20260611-example",
  "firstKeptRecordId": "evt-0001",
  "summary": "Decision approved; planning is next.",
  "createdAt": "2026-06-11T00:00:00.000Z"
}
```

## Loop model

There are exactly three semantic loops:

```text
Decision Loop -> decision gate
  -> Planning Loop -> planning gate
    -> Implementation Loop -> implementation gate
```

Gates are loop exits, not a fourth validation loop. Publication belongs under implementation unless a future accepted decision creates a separate publish loop.

Loop responsibilities:

- `decision` records approved intent, requirements, alternatives, risks, KB impact, and route-back questions.
- `planning` records work-unit materialization, ordering, conflicts, verification strategy, and work-plan ownership for every accepted executable decision row/question.
- `implementation` records code/docs/tests changes, evidence refs, checks, content proof, and optional publication state.

Runtime records boundaries, claims, leases, scheduling decisions, budgets, and temporary-state lifecycle events as coordination events inside the affected semantic loop. Runtime events should use explicit event names such as `runtime.claim.acquired` and, when needed, a data field such as `runtimeScope`; they must not create a fourth `loop` value.

## Generated views

Generated views are disposable projections over traces, KB, source/tests, and Git refs:

```text
.codewiki/views/status.json
.codewiki/views/resume.json
.codewiki/views/work-plan.json
.codewiki/views/blockers.json
.codewiki/views/conflicts.json
```

Views answer questions quickly. They do not own truth and must be rebuildable from traces and sources. Deprecated graph terminology should be translated to views/projections. There is no target graph truth root and no target `src/views/**` source root.

## Work plan and board rendering

The product work model is the generated `work-plan` view. A kanban board, if needed, is a terminal UI rendering of the work-plan view, not its own source root or truth concept.

## Temporary data

Temporary working data belongs under `.codewiki/runtime/tmp/<trace-id>/<loop>/`.

- Gate pass deletes the loop temp after durable trace, KB, source, test, or Git refs exist.
- Gate fail/block preserves loop temp for remediation.
- A superseding same-loop run deletes or replaces stale temp.
- Trace close deletes all remaining trace temp.

## Retention

Closed traces can be compacted only after required evidence is committed and no active gate/policy depends on the full hot record. Retention keeps enough hot information to discover the trace and enough Git restore refs to hydrate cold detail on demand.

The retention model avoids separate canonical catalogs. The trace stub plus Git history is the catalog.

## Non-goals

- No graph as target product concept.
- No canonical `.codewiki/traces/catalog.json`.
- No standalone validation loop.
- No durable state in generated views.
- No full Pi transcript storage inside CodeWiki traces.
- No role-based runtime scheduling axis.

## Related docs

- [File Structure](file-structure.md)
- [Compilers](compilers.md)
- [Runtime](runtime.md)
- [Validation Gateway](validation-gateway.md)
