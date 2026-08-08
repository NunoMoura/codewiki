---
type: Concept
title: Loop Model
description: Runtime schedules compatible work across exactly three semantic Loops; each Loop follows the exact Candidate-to-Evidence-to-Exit-Report chain while Runtime owns routing and writes.
tags:
  - codewiki
  - system
  - loop
  - model
timestamp: 2026-07-30T00:00:00Z
---
# Loop Model

CodeWiki has exactly three semantic Loops:

```text
Project Runtime
├── Decision Loop
├── Planning Loop
└── Implementation Loop
```

Runtime is the outer project control plane, not another semantic Loop. Change intake, Backlog triage, learning, checking, graph projection, recovery, publication, and feedback are also not semantic Loops. Triage orders Decision attention through a disposable snapshot projection; rolling Planning owns execution priority after Change acceptance.

Each Loop owns typed input, one mandatory Loop Protocol, exact immutable Candidate semantics, Loop-specific Check declarations, semantic attempt composition, and route recommendation. Shared verification machinery evaluates common Check/Evidence/Result/Report contracts without owning Decision, Planning, or Implementation meaning.

## Source architecture boundary

The three semantic Loop packages are the only source locations that may own Loop-specific semantics:

```text
src/decision/**
src/planning/**
src/implementation/**
```

A Loop package owns its Candidate construction, Loop-specific Check declarations, attempt composition, interpretation, and route recommendation. A Loop may invoke injected generic Runtime ports, but it does not own global scheduling, claims, canonical persistence, recovery, workers, Integration, or effects.

`src/runtime/**` owns only generic project-control mechanics. It must not contain a `decision`, `planning`, `implementation`, or `verification` subtree, or a module whose responsibility is one Loop's Candidate construction, policy, or semantic evaluation. A Loop-local module must not be named `runtime.ts`; use a role name such as `attempt.ts`, `admission.ts`, or `execution.ts` when it calls a generic port. Current Loop-named Runtime modules are migration debt, not a target split.

`src/verification/**` is shared Check/Result/Exit Report machinery, not a fourth Loop. It may consume shared Evidence and generic execution ports, but cannot import a Loop implementation or Runtime. `src/pi/**` implements Pi-specific ports and cannot own Loop policy or canonical authority.

## Change as semantic carrier

Change is the stable accountable carrier of intent and the durable dossier for closing one project delta. Decision is not another entity; it is the Loop that receives, refines, and dispositions exact Change revisions.

```text
Change intent
→ Decision candidate and approval
→ Planning coverage
→ Work Items, Assignments, and Worker Reports
→ guarded Integration and exact integrated-tree proof
→ Implementation realization Candidate and exit
→ separate Git effects, delivery, and outcome disposition
```

One logical Change Trace of immutable typed content-addressed operations records the journey. Backlog, Planning, Implementation, Sprint, relationship, learning, and Change dossier screens are projections. No Change owns a private copy of Runtime scheduling.

## Runtime control cycle

```text
receive user/agent/worker/Knowledge/Git/schedule/preview trigger
→ refresh WorkState and bounded relationship projections
→ derive eligible semantic or mechanical jobs
→ select compatible bounded set under lanes, Change Claims, Work Item Claims, capacity, and budgets
→ bind exact Loop Protocol, model route, context, and authority
→ run semantic Candidate producer or isolated worker
→ for worker output, perform guarded Integration and construct exact integrated Candidate
→ materialize exact Evidence Records
→ resolve Candidate-specific Exit Policy
→ run bounded Code/Model Checks
→ construct immutable Exit Report
→ revalidate generation, freshness, authority, and CAS
→ append accepted facts or durable remediation
→ schedule separately permitted effects
→ repeat or quiesce
```

Runtime cannot approve Change meaning, invent Planning truth, or accept Implementation evidence on its own. Clients, sessions, workers, and Checks cannot choose semantic routing or canonical identity.

## WorkState

WorkState is the shared disposable project projection:

```text
Change Traces
+ Knowledge
+ source ownership
+ source/tests/Git
+ configuration and policy
+ bounded runtime observations
= WorkState
```

Each Loop receives one relevant exact slice. Callers provide intent, authority, evidence, or observations they legitimately own; they do not replace repository facts runtime can load.

## Loop cycle

```text
receive typed Loop input and mandatory Loop Protocol
→ observe bounded WorkState and relationship context
→ act inside Loop authority using ordinary scoped Pi Skills/tools
→ produce one immutable typed Candidate
→ bind exact Evidence Records
→ resolve Candidate-specific Exit Policy
→ run Checks and build Check Results/Exit Report
→ Runtime chooses repair, advance, route-back, retry, wait, or block
```

Noisy reading, editing, testing, model interaction, and worker execution stay in sessions or runtime artifacts until distilled into candidate facts, Check Results, canonical refs, and durable route evidence.

## Inputs

Loop inputs bind:

- trigger and authenticated actor/authority refs;
- target Change or approved Change set;
- relevant WorkState and relationship snapshot;
- exact Change revisions, trace tails, Knowledge/Git/config/policy digests, and Planning revisions;
- route-back context when applicable;
- submitted facts the Loop legitimately interprets.

Infrastructure envelopes may carry scheduling metadata, but cannot replace exact `DecisionLoopInput`, `PlanningLoopInput`, or `ImplementationLoopInput` contracts.

## Candidates and outputs

A candidate is the exact proposed semantic output of one Loop attempt. It contains high-signal facts, stable ids, canonical refs, coverage, risks, unresolved authority, and downstream obligations. It excludes full transcript, private reasoning, raw logs, stale views, unrestricted diffs, and caller-authored runtime fields.

Candidate identity is runtime-owned. Any candidate or guarded base change creates a new identity and invalidates dependent Results.

A candidate becomes downstream-authoritative only when:

1. its Exit Report passes;
2. runtime revalidates freshness and authority;
3. runtime appends the exact evaluated output.

Failed and indeterminate attempts remain durable accountability, repair, and learning evidence.

## Checks and exit

Runtime deterministically resolves one candidate-specific Exit Policy from protected Default Checks, applicable User Standard-derived Custom Checks, Loop baseline, Change traits/risk/layers, project traits, technologies/paths, Planning minimums, actual effects, and approved additions/exclusions.

```ts
type Check = CodeCheck | ModelCheck;
```

Code Checks use trusted deterministic code. Model Checks use independent bounded Pi sessions. Execution kind, qualitative/quantitative measurement, and `observe|warn|require` enforcement remain independent.

Each Check produces one `pass|fail|indeterminate` Check Result. Required Results fan into one Exit Report:

```text
required fail exists          → fail
else required indeterminate   → indeterminate
else                           → pass
```

A failed required Check does not cancel unrelated Checks that can still provide repair feedback. Operational failures are indeterminate, never fabricated candidate rejection.

Exit Report status says whether exact semantic candidate may exit. Runtime route remains separate because failure may require same-Loop repair, earlier authority, runtime retry, user input, or operational wait.

## Loop responsibilities

### Decision

Maintains the invariant that every accepted Change revision is coherent, grounded, outcome-oriented, Knowledge-accounted, risk-classified, overlap-accounted, and approved by exact authority.

### Planning

Maintains the invariant that every selected approved Change has globally coherent executable coverage or explicit resolution. Planning creates Sprints and worker-ready Work Items, one owner per item, cross-Change contribution, dependencies, verification, integration boundaries, and Workbench requirements.

### Implementation

Maintains the invariant that every accepted Work Item or approved direct scope is realized, integrated, tested, evidenced, and aligned with its owning Change. Workers produce candidate evidence; only the Implementation Exit Report permits semantic realization acceptance.

## Progress and repair

Each attempt records bounded progress:

- changed candidate and canonical refs;
- newly passing or failing Checks;
- issue classes and repair targets;
- repeated attempt patterns;
- unchanged guarded digests;
- budget and latency summaries;
- next safe action.

Runtime may quiesce, escalate model tier, route back, block, or ask for authority when attempts consume budget without moving the relevant invariant.

Repair Episodes are derived relationships between failed/indeterminate Results, subsequent candidates, and later outcomes. Repair Patterns aggregate episodes but never become authority automatically.

## Route-back

- Implementation routes to Planning for scope, ordering, dependency, path, verification, Work Item, Sprint, or integration-plan changes.
- Implementation routes to Decision for accepted intent, Product behavior, Knowledge, material risk, compatibility, or user authority changes.
- Planning routes to Decision when approved Change meaning is insufficient or contradictory.

Route-back appends typed later-attempt operations to the same Change Trace. Approved revisions remain immutable. Materially changed outcome creates a linked Change.

## Trace attempt operations

One semantic attempt records separate immutable operations so no aggregate payload can blur authority:

```text
loop.attempt_started
<loop>.candidate_recorded
evidence.recorded
loop.exit_policy_recorded
check.result_recorded
loop.exit_report_recorded
runtime.route_recorded
loop.attempt_ended
```

Hot operations become shared truth only after one accepted `codewiki/state` state commit. Current event schemas retain legacy fields until the named clean cut. Runtime coordination operations may appear between semantic attempts but never create a fourth Loop.

## Related docs

- [WorkState](work-state.md)
- [CodeWiki OS and Loop Protocols](codewiki-os.md)
- [Loop Exit](loop-exit.md)
- [Worker Workbench](worker-workbench.md)
- [Model Routing](model-routing.md)
- [Loop Contracts](loop-contracts.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
