---
type: Concept
title: Traces
description: CodeWiki traces are the durable workflow and state record for software work. In product language, one trace is the Sprint Record for one accountable change journey.
tags:
  - codewiki
  - system
  - traces
timestamp: 2026-06-30T00:00:00Z
codewiki_components:
  - traces
  - views
codewiki_source_patterns:
  - src/traces/**
  - src/api/traces.ts
  - src/views/**
  - src/api/views.ts
codewiki_test_patterns:
  - tests/traces/**
  - tests/views/**
codewiki_trace_events:
  - trace_head
  - trace_event
  - tail_checkpoint
  - trace_close
codewiki_generated_views:
  - .codewiki/views/status.json
  - .codewiki/views/resume.json
  - .codewiki/views/work-plan.json
  - .codewiki/views/work-queue.json
  - .codewiki/views/trace-board.json
  - .codewiki/views/triggers.json
  - .codewiki/views/runtime-board.json
  - .codewiki/views/quality.json
  - .codewiki/views/blockers.json
  - .codewiki/views/conflicts.json
codewiki_roles:
  - state_truth
  - generated_projection
codewiki_source_map:
  - id: traces
    source_patterns:
      - src/traces/**
      - src/api/traces.ts
    test_patterns:
      - tests/traces/**
    trace_events:
      - trace_head
      - trace_event
      - tail_checkpoint
      - trace_close
    role: state_truth
  - id: views
    source_patterns:
      - src/views/**
      - src/api/views.ts
    test_patterns:
      - tests/views/**
    generated_views:
      - .codewiki/views/status.json
      - .codewiki/views/resume.json
      - .codewiki/views/work-plan.json
      - .codewiki/views/work-queue.json
      - .codewiki/views/trace-board.json
      - .codewiki/views/triggers.json
      - .codewiki/views/runtime-board.json
      - .codewiki/views/quality.json
      - .codewiki/views/blockers.json
      - .codewiki/views/conflicts.json
    role: generated_projection
---
# Traces

## Responsibility

CodeWiki traces are the durable workflow and state record for software work. In product language, one trace is the Sprint Record for one accountable change journey from user intent through decision, planning, implementation, runtime coordination, content evidence, and retention.

A trace is append-only. Old lines are never rewritten. Runtime is the sole trace writer: semantic loops report appendable loop output and exit results to runtime, and runtime validates sequence/byte safety before appending trace records. Current Sprints Queue and Sprint Trace status is exposed through generated views that derive their calculations from traces, compact checkpoints, KB/source refs, and Git refs.

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

The trace file is its own hot catalog entry. The `.codewiki/traces/` directory is the active working set: hot files are active or recently closing traces, and project state loaders only read files matching `TRACE-*.jsonl`. Completed traces are closed and compacted only after implementation evidence exits and the full trace body is preserved by a Git restore ref. Closed detail can be replaced by compact hot stubs after required evidence is committed. Closed traces are terminal and do not receive append handles. Cold retention keeps a compact trace stub plus Git restore refs. There is no separate canonical telemetry catalog, central `.codewiki/traces.jsonl`, or trace-index truth file.

## OKF boundary

Open Knowledge Format applies to `.codewiki/kb/**/*.md` only. Trace files under `.codewiki/traces/TRACE-*.jsonl` are outside OKF even when an OKF export or validator scans the repository. They are JSONL workflow truth, not Markdown concepts, not OKF `index.md` or `log.md`, and never YAML-frontmatter documents.

OKF export and validation must filter repository inputs through the CodeWiki boundary rule before calling OKF parsers:

```text
include: .codewiki/kb/**/*.md
exclude: .codewiki/traces/TRACE-*.jsonl
```

Trace append, compaction, and hydration keep using the trace schema and Git restore refs described here. OKF import/export can cite trace refs as evidence strings, but it must not parse, rewrite, compact, hydrate, or otherwise own trace JSONL. Product concepts such as Sprints Queue, Sprint Trace, Trace Detail, and Task are defined in OKF KB docs; actual Sprint instances and progress remain the append-only trace line stream plus retained stubs and Git restore refs.

## Record types

### `trace_head`

Stable identity and top-level scope. `origin` is optional. Manual traces can omit it. Recurring, triggered, hook-based, amendment, retry, or route-back traces should include origin lineage refs rather than becoming sub-traces.

```json
{
  "type": "trace_head",
  "traceId": "TRACE-20260611-example",
  "title": "Short accountable change title",
  "createdAt": "2026-06-11T00:00:00.000Z",
  "origin": {
    "kind": "trigger_run",
    "parentTraceId": "TRACE-20260611-trigger",
    "triggerTraceId": "TRACE-20260611-trigger",
    "triggerId": "TRG-example",
    "planningRef": "trace:TRACE-20260611-trigger:planning:iteration:1#work:WU-example",
    "runKey": "example:2026-W24",
    "refs": ["TRACE-20260611-trigger", "trace:TRACE-20260611-trigger:planning:iteration:1#work:WU-example"]
  }
}
```

### `trace_event`

Ordered durable event written by runtime. Semantic-loop events use one event per loop iteration and include `loop`. Runtime coordination events use explicit `runtime.*` event names and omit `loop` because runtime is not a semantic loop.

```json
{
  "type": "trace_event",
  "id": "evt-0001",
  "parentId": null,
  "traceId": "TRACE-20260611-example",
  "sequence": 1,
  "loop": "decision",
  "event": "changes_approved",
  "refs": ["kb:system/components/loop-model.md"],
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

Final lifecycle record for retention. In a full hot trace it is appended after completion; in a compact hot stub it is kept with the `trace_head` and a retention `tail_checkpoint` while the full pre-compact records remain recoverable from Git. It records the restore ref and close reason used to hydrate cold trace detail later. After `trace_close`, the trace is terminal: append helpers reject further records, status/resume views report the trace as closed, and work-queue projections exclude the trace from claimable work. Archive close/compact should only run when the trace goal is finished or explicitly deferred and a Git restore ref is available; trace-board/status views flag historical or bypassed closes as `closed_incomplete` when CHG/WU/implementation coverage is missing.

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

Each semantic loop produces one appendable semantic report as the durable boundary. Runtime appends that report as a trace event after validation. The trace event stores `loop` as the semantic authority and `event` as the specific fact, read conceptually as `loop.event`, such as `decision.changes_approved`, `planning.work_units_created`, or `implementation.evidence_accepted`. Loop-specific Decisions, Tasks, and implementation changes live inside the event output and are referenced with technical subrefs such as `trace:<event-id>#change:<id>`, `trace:<event-id>#work:<id>`, and `trace:<event-id>#change:<id>`.

`appendSemanticLoopReport()` is the runtime-owned append helper for this boundary. It validates one target semantic output event and a final tail checkpoint, then appends the batch with expected-byte compare-and-swap. Low-level append helpers also validate every record against the current trace schema before writing, so stale generic event names such as `decision.iteration` are rejected before they can corrupt hot traces.

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
line 10: implementation.evidence_accepted -> route_back decision
line 11: decision.changes_approved -> exit
line 12: planning.work_units_created -> exit
line 13: implementation.evidence_accepted -> exit
```

No line is rewritten. Route-back creates a new iteration in the target loop.

## Event tree and trace lineage

Inside a trace, `id` and `parentId` form a tree like Pi session entries. The active path can branch through route-backs, retries, and alternative implementation attempts without creating another trace identity. Views may render this event tree for review and resume, but the trace still represents one accountable goal.

Across traces, CodeWiki uses `trace_head.origin` lineage metadata rather than sub-traces. Recurring, triggered, hook-based, amendment, or retry work creates an independent trace with origin refs to the trigger/source trace. The run trace closes independently and cites the trigger id, trigger trace id, planning work ref, and run key when available. This preserves trace closure while keeping provenance discoverable.

## Runtime coordination events

Runtime is the outer control loop and may append coordination events between semantic iterations. Runtime events do not create a fourth semantic loop and do not carry `loop`.

Examples:

```text
runtime.work_unit.claimed
runtime.work_unit.claim.released
runtime.work_unit.claim.expired
runtime.work_unit.claim.cancelled
runtime.host.observed
runtime.host.blocked
runtime.host.stopped
```

Runtime events store worker ids, claim ids, expiry, and scheduling details in `data`. `refs` carry only canonical planning refs, source/test paths, trace refs, Git refs, or digests.

## Generated views

Generated views are disposable projections over traces, KB, source/tests, and Git refs:

```text
.codewiki/views/status.json
.codewiki/views/resume.json
.codewiki/views/work-plan.json
.codewiki/views/work-queue.json
.codewiki/views/trace-board.json
.codewiki/views/triggers.json
.codewiki/views/runtime-board.json
.codewiki/views/quality.json
.codewiki/views/blockers.json
.codewiki/views/conflicts.json
```

Views answer questions quickly and own the disposable calculations needed for status, resume, quality, work-plan, trace-board, triggers, runtime-board, and work-queue projections. They do not own truth and must be rebuildable from traces and sources.

View projections show active work, not every historical repair attempt. A later semantic-loop iteration for the same trace and loop supersedes previous non-exit blockers, decision queues ignore non-exited decision attempts, accepted planning work excludes non-exited planning attempts from work-plan/work-queue, and conflict projections ignore work units already completed by implementation evidence.

`work-plan` is the per-trace planning projection. `trace-queue` is the internal generated view for the Sprints Queue product concept: one Sprint Trace per accountable trace with Decision subitems, current status, blockers, and next semantic loop. `trace-board` remains a compatibility renderer/projection for Sprint goal status. `work-queue` is the runtime claim selection projection over Planning-approved Tasks, not raw Decisions. `triggers` derives scheduled/event/hook/manual trigger state from planning Tasks, implementation enablement evidence, run trace lineage, and due schedule slots. `runtime-board` combines Sprints Queue-compatible state, work-queue, triggers, and optional runtime previews for operator visibility; it never owns truth or writes traces. `quality` summarizes decision, planning, and implementation Ready Checks for internal tools and future TUI surfaces. A dashboard, terminal board, or kanban display renders Sprints Queue views; it is not its own truth root.

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

The retention model avoids separate canonical catalogs. The hot trace file or retained trace stub plus Git history is the catalog. Hydration restores the exact trace records from retained refs when cold detail must become hot again.

## Non-goals

- No graph as target product concept.
- No canonical `.codewiki/traces/catalog.json`, `.codewiki/traces.jsonl`, or trace-index file.
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
- [Source Map](source-map.md)
