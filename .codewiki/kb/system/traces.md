# Traces

## Responsibility

CodeWiki traces are the durable workflow and state record for software work. One trace represents one accountable change journey from user intent through decision, planning, implementation, runtime coordination, content evidence, and retention.

A trace is append-only. Old lines are never rewritten. Current state is derived by replaying the trace and reading compact checkpoints or generated views.

## Canonical storage

Hot trace files live under:

```text
.codewiki/traces/TRACE-*.jsonl
```

Each line is one JSON object with a `type` field. The first line is always `trace_head`. Later lines are ordered trace events, checkpoints, or a final close record.

```text
trace_head
trace_event          # semantic loop iteration or runtime coordination
tail_checkpoint
trace_event
tail_checkpoint
trace_close          # optional final lifecycle record
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

Ordered durable event. Target semantic-loop events use one event per loop iteration. Runtime coordination events use explicit runtime event names.

```json
{
  "type": "trace_event",
  "id": "evt-0001",
  "parentId": null,
  "traceId": "TRACE-20260611-example",
  "sequence": 1,
  "loop": "decision",
  "event": "decision.iteration",
  "refs": ["kb:system/loop-model.md"],
  "createdAt": "2026-06-11T00:00:00.000Z",
  "data": {
    "iteration": 1,
    "trigger": "user_request",
    "output": {},
    "exit": {
      "status": "exit",
      "conditions": [],
      "nextAction": "Start planning."
    },
    "progress": {}
  }
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
  "summary": "Decision exited; planning is next.",
  "createdAt": "2026-06-11T00:00:00.000Z"
}
```

### `trace_close`

Final lifecycle record for retention. It never rewrites earlier lines; it records the restore ref and close reason used to hydrate cold trace detail later. After `trace_close`, the trace is terminal: append helpers reject further records, status/resume views report the trace as closed, and work-queue projections exclude the trace from dispatchable work.

```json
{
  "type": "trace_close",
  "id": "TRACE-20260611-example:archive:close:4",
  "parentId": "tail-0001",
  "traceId": "TRACE-20260611-example",
  "reason": "Trace finished and retained.",
  "gitRestoreRef": "refs/codewiki/archive/TRACE-20260611-example",
  "headRef": "TRACE-20260611-example",
  "refs": ["TRACE-20260611-example", "refs/codewiki/archive/TRACE-20260611-example"],
  "createdAt": "2026-06-11T00:00:00.000Z"
}
```

## Semantic loop iterations

There are exactly three semantic loops:

```text
decision
planning
implementation
```

Each semantic loop appends one `<loop>.iteration` event as the durable semantic boundary. Loop-specific rows, work items, and implementation changes live inside the iteration output and are referenced with subrefs such as `trace:<iteration-id>#row:<id>`, `trace:<iteration-id>#work:<id>`, and `trace:<iteration-id>#change:<id>`.

`appendSemanticLoopIteration()` is the core append facade for this boundary. It runs one semantic loop iteration with an expected next sequence, verifies exactly one target `<loop>.iteration` event and a final tail checkpoint, then appends the batch with expected-byte compare-and-swap.

A semantic loop iteration records:

- loop name;
- iteration number;
- trigger;
- high-signal loop output;
- exit status;
- exit condition results;
- progress signals;
- next safe action;
- canonical refs.

Exit statuses are:

```text
continue
exit
route_back
blocked
```

Example route-back history:

```text
line 10: implementation.iteration -> route_back decision
line 11: decision.iteration -> exit
line 12: planning.iteration -> exit
line 13: implementation.iteration -> exit
```

No line is rewritten. Route-back creates a new iteration in the target loop.

## Runtime coordination events

Runtime is the outer control loop and may append coordination events between semantic iterations. Runtime events do not create a fourth semantic loop.

Examples:

```text
runtime.claim.acquired
runtime.work.claimed
runtime.claim.released
runtime.claim.expired
runtime.dispatch.planned
```

Runtime events store worker ids, claim ids, expiry, and scheduling details in `data`. `refs` carry only canonical planning refs, source/test paths, trace refs, Git refs, or digests.

## Generated views

Generated views are disposable projections over traces, KB, source/tests, and Git refs:

```text
.codewiki/views/status.json
.codewiki/views/resume.json
.codewiki/views/work-plan.json
.codewiki/views/work-queue.json
.codewiki/views/quality.json
.codewiki/views/blockers.json
.codewiki/views/conflicts.json
```

Views answer questions quickly. They do not own truth and must be rebuildable from traces and sources.

`work-plan` is the per-trace planning projection. `work-queue` is the cross-trace runtime scheduling projection. `quality` summarizes decision, planning, and implementation quality standards for internal tools and future TUI surfaces. A terminal board or kanban display renders views; it is not its own truth root.

## Trace data and refs

A trace line is one durable recovery fact, not full chat, scratch state, or a full artifact dump.

`refs` must contain canonical artifact refs only:

- KB paths;
- source/test paths;
- trace event ids;
- Git commits/trees/restore refs;
- content digests.

Commands, prose summaries, acceptance text, exit condition details, remediation, route-back questions, and loop output facts belong in `data`, not `refs`.

## Temporary data

Temporary working data belongs under:

```text
.codewiki/runtime/tmp/<trace-id>/<loop>/
```

Active loop temp may include scratch artifacts such as:

```text
output.json
exit.json
worker-results.json
logs/
```

Runtime temp is not truth.

- `exit` deletes loop temp after durable trace, KB, source, test, or Git refs exist.
- `continue`, `blocked`, or `route_back` may preserve loop temp for remediation.
- A superseding same-loop iteration deletes or replaces stale temp.
- Trace close deletes all remaining trace temp.

## Retention

Closed traces can be compacted only after required evidence is committed and no active policy depends on the full hot record. Retention keeps enough hot information to discover the trace and enough Git restore refs to hydrate cold detail on demand.

`wiki_archive` supports retention stubs, trace-close records, hydrate plans, and release-note summaries derived from `trace_close` plus implementation evidence. Close appends a `trace_close` record with expected-byte compare-and-swap. Release notes are derived output, not truth: they summarize close metadata, changed paths, checks, and evidence refs already present in the trace. Hydrate verifies archived records against the retained stub and returns the records and restore refs needed to restore hot detail.

The retention model avoids separate canonical catalogs. The trace stub plus Git history is the catalog.

## Non-goals

- No graph as target product concept.
- No canonical `.codewiki/traces/catalog.json`.
- No standalone validation loop.
- No durable state in generated views.
- No full Pi transcript storage inside CodeWiki traces.
- No role-based runtime scheduling axis.
- No canonical artifact-output or validation roots outside traces.

## Related docs

- [Loop Model](loop-model.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Runtime](runtime.md)
- [File Structure](file-structure.md)
