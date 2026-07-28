---
type: Concept
title: Change Traces
description: One append-only JSONL Change Trace preserves the complete accountable dossier for one Change, including Loop attempts, candidate-bound exit evidence, repairs, Planning, realization, Git/delivery proof, and outcomes.
tags:
  - codewiki
  - system
  - traces
timestamp: 2026-07-28T00:00:00Z
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
  - .codewiki/views/loop-exit.json
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
      - .codewiki/views/loop-exit.json
      - .codewiki/views/blockers.json
      - .codewiki/views/conflicts.json
    role: generated_projection
---
# Change Traces

One Change owns one Change Trace: the durable accountable dossier for one persisted intent. It begins when intent is explicitly retained and follows the same outcome through Decision, global Planning, Work Items/Assignments, Implementation attempts, repairs, Integration, Git/delivery boundaries, observations, and retention.

```text
intent
→ Decision candidates and disposition
→ Planning coverage
→ Work Items and Assignments
→ Implementation candidates and repairs
→ Integration and Git proof
→ delivery effects
→ outcome disposition
```

One Change owns one trace. Sprint state is a generated view over Planning facts and may span several traces. Change remains conceptual aggregate over records, not monolithic mutable object.

Trace history answers what was intended, approved, attempted, checked, repaired, realized, integrated, delivered, observed, and still unknown. It is also canonical reusable-evidence substrate for derived project learning.

Source repository carries no active dogfood Change Traces during stabilization. Packed external projects test this behavior.

## Canonical storage

```text
.codewiki/traces/TRACE-CHG-<id>.jsonl
```

Each LF-delimited line is one JSON record:

```text
trace_head
trace_event       # Decision, Planning, Implementation, or runtime coordination
...
tail_checkpoint  # optional derived replay aid
trace_close       # terminal retention boundary
```

No hidden Change Git refs, Sprint trace store, central catalog, SQLite/graph authority, canonical WorkState, lesson store, or full session log exists. Backlog, Planning, Implementation, Change dossier, Work/Alignment/Learning graphs, and dashboard state are rebuildable projections.

## Identity

`trace_head` binds immutable `changeId` and path-safe `traceId` one-to-one. Runtime creates identity and canonical time. User/candidate cannot replace them.

```json
{
  "type": "trace_head",
  "traceId": "TRACE-CHG-dashboard-search",
  "changeId": "CHG-dashboard-search",
  "title": "Search Changes and active work together",
  "createdAt": "2026-07-28T00:00:00.000Z",
  "origin": { "kind": "user", "refs": ["kb:product/uis/terminal.md"] }
}
```

Materially different outcome creates linked Change. Refinement and route-back remain in same trace only while accountable outcome stays stable. Every accepted revision and attempt remains immutable.

## Record types

### `trace_head`

Stable Change/trace identity, title, runtime timestamp, and bounded provenance. Trace exists before approval so rejection, deferral, withdrawal, and failed interpretation remain explainable.

### `trace_event`

One ordered durable fact. Semantic event `loop` is only `decision`, `planning`, or `implementation`. Runtime coordination uses `runtime.*` event names and no semantic Loop.

One semantic attempt persists compact:

- exact trigger/input/snapshot refs;
- Loop Protocol identity;
- candidate id/digest/schema and parent/repair candidate refs;
- Resolved Exit Policy id/digest and Check bindings;
- completed Check Results with measurements/status/findings/issue classes/repair targets/evidence refs;
- immutable Exit Report id/status/reduction version;
- separate Runtime route, authority/freshness outcome, and next action;
- bounded latency/token/cache/budget summaries;
- canonical Knowledge/source/test/Git/delivery refs.

```json
{
  "type": "trace_event",
  "id": "evt-decision-0003",
  "parentId": "evt-decision-0002",
  "traceId": "TRACE-CHG-dashboard-search",
  "sequence": 3,
  "loop": "decision",
  "event": "change_approved",
  "createdAt": "2026-07-28T00:03:00.000Z",
  "refs": ["sha256:...", "kb:product/uis/terminal.md"],
  "data": {
    "iteration": 3,
    "candidate": { "id": "candidate:...", "digest": "sha256:..." },
    "resolvedExitPolicy": { "id": "policy:...", "digest": "sha256:..." },
    "checkResults": [],
    "exitReport": { "id": "report:...", "status": "pass" },
    "route": { "kind": "advance" },
    "progress": {}
  }
}
```

Passed, failed, and indeterminate attempts persist. Full failed patches, prompts, reasoning, raw output, private Workbenches, and credentials do not.

### `tail_checkpoint`

Derived replay accelerator bound to exact source tail and schema/digests. It cannot override event history. Historical policy/Report meaning comes from persisted identities, never current catalog.

### `trace_close`

Terminal retention boundary. Closure requires exact realization plus outcome disposition: observed, scheduled, not externally observable with rationale, deferred under authority, not realized/failed/abandoned, or indeterminate under explicit policy.

After close, appends reject. Regression or follow-up creates linked Change rather than reopening history.

## Semantic and runtime events

Exactly three semantic Loops:

```text
decision.*
planning.*
implementation.*
```

Detailed facts belong in typed data, not event-name proliferation.

Runtime coordination includes Claims, Assignment release/expiry/cancellation, worker/host observations, Integration proof, project-branch merge, push, product publication, release, and future bounded observation. Runtime events cannot approve Change meaning, invent Planning, or accept realization without exact passed semantic evidence.

## Candidate and exit identity

Trace must prove what was evaluated:

- Candidate binds Loop, schema/content, exact Change/Planning revision, Knowledge/WorkState snapshot, source/Git base, and runtime-derived facts.
- Check binding binds Loop, id/version/content, execution/measurement/evidence/implementation contracts, parameters, threshold, and enforcement.
- Check Result binds candidate, resolved Check, implementation/model/configuration, evidence inputs, measurement, threshold, findings/status, and trial identity.
- Exit Report binds candidate, policy digest, complete Result set, deterministic reduction version, and status.

Validated constructors reject missing/duplicate/wrong Results, contradictory status, invalid thresholds/measurements, stale policy, wrong candidate, and fabricated authority.

Preview and append reference the same immutable candidate and Report. Any content/base change creates a new candidate and invalidates dependent evidence.

## Global Planning batches

One Planning candidate may affect several Changes. Runtime slices passed output into owning traces while preserving one policy/Report identity.

Batch binds deterministic epoch id, participant revisions/tails, WorkState snapshot, Sprint/Work Item descriptors, per-trace slice digest, and event ids. Runtime preflights all tails.

Filesystem multi-file writes are not assumed atomic. Surviving records expose missing participants; WorkState marks incomplete epoch; private recovery packet enables idempotent missing append before Claims. Partial epoch never appears fully accepted.

## Lineage

Inside one trace, event parent relationships preserve attempts, routes, retries, and branches. Candidate lineage directly records which candidate repairs which earlier candidate.

Across traces, explicit links represent amendment, regression, duplicate, split, merge, discovery, or follow-up. Links never transfer approval or let one Change silently satisfy another.

## Alignment and delivery evidence

Trace keeps boundaries distinct:

```text
semantic realization
→ Integration commit/tree proof
→ project-branch merge
→ remote push
→ publication artifact
→ release
→ deployment
→ observed outcome
```

Each effect record binds exact predecessor, target/base CAS, operation identity, authority, commit/tree/artifact digest, and observation. One boundary never implies another. Remote claims describe one exact observation unless protected checks/attestations/provenance provide continuing guarantees.

## WorkState and relationship views

WorkState folds relevant traces with current Knowledge, source/test ownership, Git/delivery evidence, config, and Runtime observations. Derived views include Backlog, global Planning, Work queue, Implementation, Change dossier, Loop exit, blockers/conflicts, four-dimensional alignment, and learning.

Relationship queries return snapshot digest, structured facts, provenance, authority class, coverage, truncation, and staleness. They cannot mutate traces/Knowledge or infer non-existence from partial coverage.

## Repair evidence and learning

Trace stores compact reusable observations once:

- candidate and repair-parent identity;
- policy/Check identity;
- pass/fail/indeterminate Results;
- `issueClass` and `repairTarget`;
- Exit Report and Runtime route;
- later Integration/delivery/outcome refs.

A derived Repair Episode relates failed/indeterminate Result to subsequent candidate and later outcome. Repair Pattern aggregates applicable Episodes. Neither is canonical, another Loop, or authority.

Candidate producers may receive bounded scoped successful and harmful evidence. Model Checks do not. Learned context cannot suppress Checks, lower thresholds, change activation, grant authority, or promote itself.

## Refs and data boundary

`refs` contain canonical identity only:

- Change revision, trace, event, candidate, policy, Check, Result, and Report refs;
- OKF Knowledge and provenance refs;
- source/test paths and ownership refs;
- Git commits/trees/restore refs;
- Integration, remote, artifact, delivery, and observation digests.

Commands, summaries, findings, remediation, measurements, and outcome disposition belong in typed `data`. Credentials, prompts, private reasoning, full diffs, unrestricted paths, raw tool/model output, and Workbench contents belong in neither.

## Private runtime material

```text
.codewiki/runtime/**
```

May contain proposed/failed candidate material, Workbenches, Assignment packets, Worker Reports, bounded logs, caches, and recovery packets. It is private, bounded, disposable after proof, and not authority.

Optional learning cache lives under `.codewiki/runtime/learning/**` and is fully reconstructible. User-facing generated views live under `.codewiki/views/**`.

## Feedback privacy

CodeWiki never uploads supposedly anonymous full traces. Suspected recurring CodeWiki issues may generate a local allowlisted pseudonymized Feedback Bundle. User previews/redacts and separately approves export.

Intent/Knowledge prose, source/diffs, paths, repository/remotes/branches, commit/trace ids, prompts/model responses/reasoning, raw output, credentials, exact timestamps, and project Check content are excluded by default.

## Retention

Closed traces compact only after Git restore refs preserve full history and no active Sprint, Assignment, Integration, scheduled observation, or policy/recovery dependency needs hot detail. The compact hot stub retains identity, verified checkpoint, close metadata, lineage, and Git restore refs. Hydration verifies restored records.

Rejected, withdrawn, deferred, failed, indeterminate, and abandoned Changes remain valuable because they prevent duplicate work and preserve repair evidence.

## OKF boundary

OKF applies to `.codewiki/kb/**/*.md`, not Change Trace JSONL. OKF concepts may cite trace refs but cannot parse/rewrite/compact/hydrate/own traces. Imported OKF trust metadata cannot grant trace append or Loop exit.

## Current migration drift

Current schemas still use legacy event names and Quality graph/Standard/diagnostic/report fields. Current views reinterpret some history through today's catalog. Clean Loop/trace/projection cuts replace those fields with persisted candidate/policy/Result/Report contracts and remove current-catalog reinterpretation without compatibility re-exports.

## Non-goals

- No hidden Change store, Sprint trace, central catalog, database, or canonical graph.
- No full cognition replay or generic mutation patches.
- No fourth semantic or learning Loop.
- No first-class Lesson, Memory, Todo, or Quality Issue entity.
- No automatic approval from replay/projection/learning state.
- No raw-history prompt injection or automatic telemetry.

## Related docs

- [WorkState](work-state.md)
- [Alignment Model](alignment-model.md)
- [Loop Exit](loop-exit.md)
- [Loop Model](loop-model.md)
- [Loop Contracts](loop-contracts.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Runtime](runtime.md)
- [Knowledge](knowledge.md)
- [Source Map](source-map.md)
