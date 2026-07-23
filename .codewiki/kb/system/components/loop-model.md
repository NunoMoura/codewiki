---
type: Concept
title: Loop Model
description: CodeWiki is a Change-trace-backed software-development OS whose project control plane schedules compatible work across exactly three quality-governed semantic loops.
tags:
  - codewiki
  - system
  - loop
  - model
timestamp: 2026-08-01T00:00:00Z
---
# Loop Model

CodeWiki is a Change-trace-backed software-development OS. One project-scoped runtime control plane continuously restores project invariants through exactly three semantic loops: Decision, Planning, and Implementation. One semantic owner governs each invariant, while compatible invariants may be processed concurrently.

```text
runtime outer loop
├── Decision semantic loop
├── Planning semantic loop
└── Implementation semantic loop
```

Each semantic loop owns typed inputs, typed outputs, loop-specific quality standards, and exit conditions. Quality networks govern loop exit; they are not additional loops.

## Change as semantic carrier

Change is the stable accountable carrier of user or agent intent and the delta CodeWiki tries to close. Decision is not another entity. Decision is the semantic loop that receives, refines, validates, and approves an exact Change revision.

Planning creates Sprints and Work Items from approved Changes. Runtime grants Assignments. Implementation realizes planned intent and records evidence against the owning Change. One Change may span several Sprints, and one Sprint may coordinate several Changes.

```text
Change intent
-> exact approved Change revision
-> Sprint and Work Item coverage
-> Assignment attempts
-> implementation realization
-> outcome disposition
```

One append-only JSONL Change Trace records this journey. Backlog, Planning, Implementation, Sprint, and Change dossier screens are views. No Change owns a private copy of the runtime pipeline.

## Runtime outer loop

Runtime is logically always available and physically quiescent when no eligible work exists. It is not a semantic loop and does not own semantic truth.

```text
receive user, agent, worker, Git, KB, schedule, or preview triggers
refresh WorkState
identify eligible project invariant repairs and mechanical actions
select a compatible bounded job set
acquire lanes, claims, capacity, and integration guards
build exact typed inputs and context slices
run semantic sessions or workers through adapters
validate outputs and exits through loop-owned quality standards
guarded append to affected Change Trace(s)
schedule permitted effects
repeat until quiescent, blocked, or budget exhausted
```

Runtime coordinates client intake, trace writes, scheduling, lanes, claims, semantic sessions, workers, integration, temporary data, budgets, supervision, retention, and execution adapters. It cannot approve Change meaning, create Planning truth, or accept Implementation evidence. Clients and sessions cannot choose their own semantic routing.

Always available does not mean uncontrolled automation. Runtime stops when authority is missing, supervision disappears, policy blocks execution, a guarded source changes, conflict requires semantic resolution, budget is exhausted, or no eligible work remains.

## WorkState

WorkState is the shared disposable projection used by runtime and all loops:

```text
Change Traces
+ Knowledge Base
+ source ownership
+ source/tests/Git
+ config and policy
+ bounded runtime observations
= WorkState
```

Each loop receives only the relevant WorkState slice plus exact source versions and authority refs. Callers should provide intent, evidence, or explicit observations they own; they should not marshal repository facts the core can load itself.

## Semantic loop cycle

Every semantic loop repeats the same control shape while preserving loop-specific semantics:

```text
receive typed loop input
observe bounded WorkState
act within loop authority
produce typed loop output
evaluate loop-owned quality standards
continue, exit, route back, or block
```

Noisy reading, editing, testing, model interaction, or worker execution stays in tools, sessions, or runtime temp until distilled into high-signal output and canonical refs.

## Loop inputs

Loop inputs state:

- trigger and actor;
- target Change or approved Change set;
- relevant WorkState slice;
- exact Change revisions, trace tails, KB/Git/policy digests, and plan revisions observed;
- user or external authority refs;
- submitted facts that the loop owns interpreting.

Inputs are loop-specific. A generic infrastructure envelope may carry routing and concurrency metadata, but it must not replace `DecisionLoopInput`, `PlanningLoopInput`, or `ImplementationLoopInput` as domain contracts.

## Loop outputs

A loop output is the bounded high-signal result needed by downstream work and trace replay.

Good outputs contain:

- accepted facts and stable ids;
- canonical refs and source versions;
- coverage maps;
- risks, blockers, and unresolved authority;
- quality-standard results;
- route and next safe action.

Outputs exclude full chat, private reasoning, raw logs, stale views, unbounded diffs, and duplicate repository facts.

A loop output is not downstream-authoritative until its quality-governed iteration exits successfully and runtime appends it. Continue, route-back, and blocked iterations remain durable accountability and remediation evidence but cannot masquerade as accepted upstream output.

## Quality networks and exit

Each loop owns one versioned quality network. Quality-standard nodes answer:

```text
Can this bounded iteration exit?
Can downstream work trust its output?
If not, which authority or repair owns the gap?
```

Exit statuses are:

| Status | Meaning |
| --- | --- |
| `continue` | Same semantic loop can repair unmet conditions. |
| `exit` | Output is accepted for downstream use. |
| `route_back` | Earlier semantic authority is required. |
| `blocked` | External user, resource, policy, capability, or supervision wait is required. |

Quality networks are evaluation machinery inside semantic loops, not inner quality loops or another product lifecycle.

## Loop responsibilities

### Decision

Maintains the invariant that every approved Change revision is coherent, grounded, outcome-oriented, knowledge-accounted, risk-classified, and approved by exact authority. It may continue refining the same Change, reject or defer it, or exit with an immutable approval receipt.

### Planning

Maintains the invariant that every selected approved Change is covered by a feasible global execution plan or explicit resolution. It observes a bounded project planning horizon, creates Sprints and Work Items, assigns one owning Change per Work Item, declares cross-Change contribution and dependencies, and optimizes safe execution across active work.

### Implementation

Maintains the invariant that every accepted Work Item and approved direct scope is realized, integrated, tested, evidenced, and aligned with the owning Change. Workers produce candidate evidence; the Implementation loop alone accepts semantic realization.

## Progress and churn control

Each iteration records progress signals:

- newly met standards;
- changed canonical refs;
- superseded output refs;
- repeated failure signatures;
- unchanged state digests;
- budget spent;
- next safe action.

Runtime may quiesce, block, or ask for authority when repeated iterations consume budget without moving the relevant invariant.

## Route-back

Workflow is not a one-way pipeline:

- Implementation routes to Planning for scope, ordering, dependency, path, verification, or Work Item changes.
- Implementation routes to Decision when accepted intent, product behavior, risk, Knowledge meaning, or user authority must change.
- Planning routes to Decision when approved Change meaning is insufficient or contradictory.
- Decision may observe current project state before continuing but cannot delegate approval authority downstream.

Route-back appends a later iteration to the same Change Trace. Approved revisions remain immutable. If accountable outcome changes materially, runtime creates a linked new Change Trace rather than silently rewriting identity.

## Trace iteration

One semantic iteration is one append-only durable trace boundary:

```json
{
  "loop": "implementation",
  "event": "evidence_accepted",
  "refs": ["src/example.ts", "tests/example.test.ts", "sha256:..."],
  "data": {
    "iteration": 4,
    "trigger": "worker_results",
    "observedWorkStateDigest": "sha256:...",
    "output": {},
    "exit": {
      "status": "continue",
      "conditions": [],
      "nextAction": "Collect aggregate integration proof."
    },
    "progress": {}
  }
}
```

Runtime coordination facts may appear between semantic iterations but never create a fourth loop.

## Related docs

- [WorkState](work-state.md)
- [Loop Contracts](loop-contracts.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
