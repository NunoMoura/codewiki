---
type: Concept
title: Traces
description: CodeWiki stores one append-only JSONL Change Trace for each persisted Change journey from intake through approval, planning, implementation, outcome disposition, and retention.
tags:
  - codewiki
  - system
  - traces
timestamp: 2026-08-01T00:00:00Z
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

A CodeWiki Change Trace is the durable, transparent journey of one persisted Change. It begins when the user or agent explicitly persists intent and follows that same accountable Change through Decision iterations, exact approval, Planning-created Sprint membership and Work Items, runtime Assignments, Implementation evidence, route-backs, outcome disposition, and retention.

```text
Change intent
-> Decision-loop refinement and approval
-> Planning coverage across one or more Sprints
-> Work Items and Assignments
-> implementation and integration evidence
-> outcome disposition
-> close and retention
```

One Change owns one Change Trace. A Change Trace is not a Sprint Record. A Change may require several Sprints, and one Sprint may coordinate several Changes. Sprint state is a generated view over Planning facts in participating Change Traces.

The trace gives humans and agents accountability, recovery, historical explanation, and reusable learning. It must show what changed, why it was approved, how execution was planned, what evidence was accepted or rejected, where authority routed back, and what outcome was observed or explicitly left unresolved.

The CodeWiki source repository keeps no active dogfood Change Traces during stabilization. Packed candidates exercise trace behavior only in disposable external projects.

## Canonical storage

Hot Change Trace files live under:

```text
.codewiki/traces/TRACE-*.jsonl
```

Each line is one JSON object. The first line is always `trace_head`. Later lines are ordered semantic iterations, runtime coordination events, checkpoints, or one final close record.

```text
trace_head
trace_event          # Decision, Planning, or Implementation iteration
trace_event          # runtime coordination fact
tail_checkpoint
trace_close          # terminal lifecycle record
```

There is no separate Change journal, hidden Change Git ref, Sprint trace store, central trace catalog, or canonical WorkState file. The Change Trace is the Change ledger. Backlog, Planning, Implementation, approved-Change portfolio, Sprint views, work queue, and Change dossiers are rebuildable views.

CodeWiki has no hidden Git-ref Change store, legacy reader, or compatibility importer. Pre-release development history remains recoverable through normal Git history; runtime supports only Change Trace storage.

## Change identity

A Change Trace head binds one stable `changeId`. Trace identity may use a path-safe technical `traceId`, but the binding is one-to-one and immutable.

```json
{
  "type": "trace_head",
  "traceId": "TRACE-CHG-dashboard-search",
  "changeId": "CHG-dashboard-search",
  "title": "Search Changes and active work together",
  "createdAt": "2026-08-01T00:00:00.000Z",
  "origin": {
    "kind": "user",
    "refs": ["kb:product/uis/terminal.md"]
  }
}
```

A material new accountable outcome creates a new linked Change Trace. Refinement or route-back may produce a later Change revision in the same trace only while the stable accountable outcome remains recognizable. Every approved revision remains immutable and replayable even when a later revision explicitly supersedes it.

## Record types

### `trace_head`

Stable Change and trace identity, title, creation time, and optional provenance. A persisted Change starts its trace before approval so refinement, validation, rejection, deferral, and withdrawal remain explainable.

### `trace_event`

One ordered durable fact. Semantic events include `loop: decision`, `planning`, or `implementation`. Runtime coordination events use `runtime.*` names and omit `loop` because runtime is not a semantic loop.

One semantic iteration records:

- typed loop input refs or observed-state digest;
- loop-specific high-signal output;
- loop-owned quality-standard results;
- exit status and route;
- progress signals;
- canonical refs.

```json
{
  "type": "trace_event",
  "id": "evt-decision-0003",
  "parentId": "evt-decision-0002",
  "traceId": "TRACE-CHG-dashboard-search",
  "sequence": 3,
  "loop": "decision",
  "event": "change_approved",
  "refs": ["sha256:...", "kb:product/uis/terminal.md"],
  "createdAt": "2026-08-01T00:03:00.000Z",
  "data": {
    "iteration": 3,
    "trigger": "user_approval",
    "observedWorkStateDigest": "sha256:...",
    "output": {
      "changeRevision": {},
      "approval": {}
    },
    "exit": {
      "status": "exit",
      "conditions": [],
      "nextAction": "Include this approved Change in the next planning horizon."
    },
    "progress": {}
  }
}
```

Trace events store accepted facts or bounded snapshots, not generic JSON Patch operations. Reducers derive current state from semantically named events. A loop may emit a complete replacement for its bounded output revision with explicit base and superseded refs; old output remains history.

### `tail_checkpoint`

A derived compact replay checkpoint. It may accelerate resume and retention but cannot override event history. Checkpoint data must identify the source tail and enough digests to detect stale or incompatible replay.

### `trace_close`

Terminal retention record. Close requires implementation realization plus explicit outcome disposition: observed, observation scheduled, not externally observable with rationale, deferred, failed, or abandoned under authority. Long-running outcome observation may keep a trace dormant but open under bounded policy.

After `trace_close`, append helpers reject new records. A materially new regression, follow-up, or changed outcome creates a linked Change Trace instead of reopening history.

## Semantic loops

There are exactly three semantic loops:

```text
decision
planning
implementation
```

Decision is a loop, not a domain entity. Its binding success fact is approval of an exact Change revision and digest. Planning consumes approved Changes and creates Sprint membership, Work Items, dependencies, and resolutions. Implementation consumes accepted Work Items or an explicitly approved direct scope and records Change realization.

A semantic event is read as `loop.event`, for example:

```text
decision.change_received
decision.change_revised
decision.change_approved
planning.change_planned
planning.change_replanned
implementation.evidence_accepted
implementation.evidence_rejected
```

The precise event vocabulary is versioned by the trace schema. Loop outputs, not event-name proliferation, carry detailed bounded facts.

## Runtime coordination

Runtime is the outer control loop and sole trace writer. Runtime events include meaningful coordination facts such as:

```text
runtime.work_item.claimed
runtime.work_item.claim.released
runtime.work_item.claim.expired
runtime.work_item.claim.cancelled
runtime.host.observed
runtime.host.blocked
runtime.host.stopped
```

Runtime events may advance Assignment and operational projections but cannot approve a Change, invent a Sprint or Work Item, or accept implementation evidence.

## Global Planning and multi-trace batches

Planning observes a project-wide WorkState horizon and may produce one planning epoch affecting several Changes. Runtime slices accepted output by owning Change and appends it to affected Change Traces.

Every multi-trace planning batch carries:

- deterministic planning epoch id;
- observed WorkState digest;
- participant Change refs;
- Sprint descriptor digests;
- per-Change base planning revisions;
- deterministic event ids.

Runtime preflights every affected trace before writing. Filesystem writes cannot provide true multi-file atomicity, so partial commit is explicit and recoverable. A surviving participant identifies the expected batch; WorkState marks missing participants as `incomplete_commit`; runtime retries missing deterministic events idempotently. Partial state must never appear as a fully accepted Sprint view.

Each Work Item has one owning Change Trace. Cross-Change contribution uses refs rather than duplicate implementation results.

## Event tree and lineage

Inside one Change Trace, `id` and `parentId` form an event tree. Route-backs, retries, and alternative attempts branch without changing Change identity.

Across Change Traces, origin and explicit Change links express amendment, regression, duplicate, split, merge, discovery, or follow-up lineage. Lineage never grants approval authority and never lets one Change silently satisfy another.

## WorkState and generated views

WorkState folds all relevant Change Traces with current KB, source ownership, source/tests, Git, configuration, and runtime observations. Generated views include:

```text
Backlog
approved Changes
Planning horizon
Sprint views
work plan
work queue
Implementation cockpit
Change dossiers
runtime status
quality
blockers
conflicts
alignment and outcome realization
```

Views expose current accepted or active revisions while retaining links to superseded and rejected history. They do not own truth and must label incomplete cross-trace batches, stale source versions, and inferred relationships.

## Refs

Trace `refs` contain canonical artifact identity only:

- `change:<id>@<revision>` refs;
- Change Trace and event refs;
- KB refs;
- source and test paths;
- Git commits, trees, and restore refs;
- content, policy, profile, target, and evidence digests.

Commands, summaries, acceptance text, remediation, and quality detail belong in `data`, not `refs`.

## Temporary data

Scratch belongs under:

```text
.codewiki/runtime/tmp/<change-trace-id>/<loop>/
```

Runtime temp may contain proposed output, quality drafts, worker results, bounded logs, or multi-trace write-ahead recovery packets. It is not truth. Durable trace append, Git/content proof, or another canonical ref must exist before cleanup removes evidence needed for recovery.

## Retention

Closed traces may be compacted only after full history is preserved by a Git restore ref and no active Sprint, Assignment, scheduled observation, or policy depends on hot detail. A compact hot stub retains Change identity, a verified checkpoint, close metadata, lineage, and restore refs. Hydration verifies restored records before use.

Rejected, withdrawn, deferred, failed, and abandoned Changes remain eligible for compact retention because their reasoning prevents duplicate work and preserves learning.

## OKF boundary

OKF applies to `.codewiki/kb/**/*.md`, not trace JSONL. OKF tools may cite trace refs but must not parse, rewrite, compact, hydrate, or own `.codewiki/traces/TRACE-*.jsonl`.

## Non-goals

- No separate Change journal, hidden Git-ref store, or legacy Change importer.
- No one-Sprint-one-trace invariant.
- No central trace catalog.
- No canonical generated view.
- No fourth semantic loop.
- No full chat transcript, private reasoning, raw logs, or unbounded artifacts.
- No generic mutation patches over a monolithic project object.
- No automatic semantic approval from replay state.

## Related docs

- [WorkState](work-state.md)
- [Loop Model](loop-model.md)
- [Loop Contracts](loop-contracts.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Runtime](runtime.md)
- [Source Map](source-map.md)
