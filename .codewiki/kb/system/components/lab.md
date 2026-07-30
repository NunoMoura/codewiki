---
type: Concept
title: Lab
description: CodeWiki Lab is isolated maintainer infrastructure for calibrating Checks, routes, graph queries, repair retrieval, coordination, and Runtime changes against visible, sealed, and external evidence before promotion.
tags:
  - codewiki
  - system
  - lab
timestamp: 2026-07-30T00:00:00Z
codewiki_component: lab
codewiki_components:
  - lab
codewiki_source_patterns:
  - lab/**
codewiki_test_patterns:
  - tests/lab/**
codewiki_role: loop_exit_experimentation
codewiki_source_map:
  - id: lab
    source_patterns:
      - lab/**
    test_patterns:
      - tests/lab/**
    role: loop_exit_experimentation
---
# Lab

CodeWiki Lab is isolated maintainer infrastructure for improving Loop exit, routing, coordination, Alignment Graph queries, repair retrieval, and Runtime behavior before production promotion. It is not a fourth semantic Loop, user-project Runtime variant, self-modifying system, or canonical truth store.

Packed product packages ship production code only. Lab fixtures, holdouts, optimizer logs, benchmark adapters, and experiment worktrees remain outside installed user-project behavior.

## Objective

```text
minimize risk-adjusted cost to authoritative exit
subject to non-worsening false-pass and escaped-regression rates
```

No scalar score may hide safety regression.

## Evaluation dimensions

### Safety

- false Loop exit;
- escaped regression;
- unauthorized effect;
- stale Candidate acceptance;
- missing required Evidence accepted;
- incorrect Change Claim or Work Item Claim ownership.

### Correctness and alignment

- executable task success;
- accepted-intent adherence;
- requirement realization coverage;
- reverse traceability accuracy;
- exact delivery-to-intent binding.

### Coordination and recovery

- duplicate work;
- conflict detected before coding;
- stale expected-head rejection;
- safe active-work preservation;
- recovery success;
- lost or duplicated accepted facts;
- full replay convergence.

### Efficiency

- wall-clock time;
- time to first useful feedback;
- time to authoritative exit;
- model turns and repair iterations;
- tokens/provider cost;
- human interruptions/interventions.

### Longitudinal learning

- repeated mistake recurrence;
- transfer to unseen similar work;
- harmful-guidance rate;
- negative transfer to unrelated work;
- retrieval token cost;
- improvement across sequential Changes.

## External benchmark stack

### Primary

| Benchmark | Product question |
| --- | --- |
| SWE-bench Pro | Can CodeWiki execute long-horizon, multi-file professional repository work? |
| FeatureBench | Can CodeWiki deliver complex feature development, not only bug repair? |
| SWE-bench Live | Does CodeWiki generalize to fresh multilingual work without tuning contamination? |
| Sealed CodeWiki suite | Does CodeWiki prove coordination, authority, recovery, graph value, and learning? |

### Required support

| Benchmark | Role |
| --- | --- |
| SWE-bench Verified | Stable public compatibility/regression baseline |
| SWE-Explore | Repository exploration and Alignment Graph/context value |
| SWE-Cycle | Environment reconstruction, Implementation, tests, and full-cycle pilot |
| SWE-Bench-CL | Chronological learning, forgetting, and harmful-history methodology |
| SWE-bench Multimodal | Later visual-input and UI understanding track |

### Supplemental or model-only

- Terminal-Bench 2 and GitTaskBench may test worker/tool competence.
- SWE-EVO is a promising evolution pilot.
- LiveCodeBench and SWE-rebench calibrate model routes; they are not CodeWiki product KPIs.
- SWE-Marathon is deferred until mature because of extreme cost, small task count, and reward-hacking risk.

Pin exact dataset, harness, image, evaluator, and benchmark commit/version. Independently validate gold patches where a public harness has recorded corrections.

## Benchmark modes

Repository benchmarks run in two modes where meaningful:

```text
Implementation-only
  task requirements are already Decision-accepted

Full Runtime
  issue enters as proposed Change and traverses Decision,
  Planning, worker execution, guarded Integration, Implementation exit, and effects
```

This separates coding competence from end-to-end Runtime value and overhead.

## Competitive baselines

```text
plain Pi
OpenClaw
OpenSpec or Spec Kit
CodeWiki
```

Use the same model/provider/version, tools, repository snapshot, visible tests, budgets, seeds, and evaluator conditions wherever technically possible. External leaderboard results using different scaffolds are contextual, not causal proof.

## Required CodeWiki ablations

```text
without rolling cross-Change Planning
without independent Checks
without historical retrieval
raw history instead of Repair Episodes
Repair Episodes without held-out validation
validated Repair Patterns
without Alignment Graph queries
```

For SWE-Explore-style work, compare plain lexical search, Pi-Lens, OKF/source projection, Alignment Graph, and optional Graphify analysis. Report relevant-region recall, ranking quality, lines/tokens retrieved, stale/false relation rate, and downstream repair success.

## Sealed CodeWiki suite

Fixture families include:

1. ambiguous or contradictory intent;
2. missing, stale, contradictory, partial, or unavailable Evidence;
3. Change B accepted while Change A executes;
4. overlapping source/Knowledge boundaries;
5. safe active Work Item preservation;
6. explicit pause, migration, cancellation, block, or route-back;
7. two-machine Change Claim race;
8. two-worker Work Item Claim race;
9. independent concurrent Changes;
10. stale CAS and atomic multi-Change Planning;
11. worker crash/cancellation and recovery;
12. Integration conflict and exact final-tree reevaluation;
13. notification loss, duplication, reordering, and offline reconnect;
14. archive interruption, hydration, and reopening;
15. exact UI preview, review, and approval;
16. unauthorized branch/publication/release/delivery effect;
17. Knowledge/source drift in both directions;
18. useful historical transfer and harmful negative transfer;
19. helpful and misleading Alignment Graph query results;
20. delivery outcome contradicting earlier passing implementation Evidence.

Sealed fixtures live outside repository and producer visibility. Objective executable evidence is preferred. Judge-derived partial scores remain separate from full resolution.

## Repair-learning evaluation

Completed accepted history may derive:

```text
Candidate A
→ failed or indeterminate Check Result
→ issueClass + repairTarget
→ Candidate B repairs A
→ later Check/Integration/delivery/outcome Evidence
→ scoped Repair Episode
→ repeated validated Repair Pattern
```

Required comparison:

```text
A. no history
B. equal-token generic summary
C. raw history
D. scoped successful and harmful Repair Episodes
E. held-out-validated Repair Patterns
```

Raw history is baseline only, never recommended production context. Independent Model Checks receive no producer conversation or repair-learning context.

Historical guidance cannot suppress Checks, lower thresholds, alter deterministic activation, choose authority, or attest acceptance. Stable promotion requires temporal/component holdouts and a normal accountable Change.

## Experiment discipline

```text
diagnose recurring failure
→ bind issueClass and repairTarget
→ propose bounded change
→ static/security/schema gates
→ isolated visible evaluation
→ sealed temporal/component holdout
→ promote through accountable Change or discard
```

Each experiment uses isolated worktree/scratch, strict editable allowlist, locked evaluators, import restrictions, budgets, and captured patch/evidence. Candidate branches require review; nothing merges, publishes, releases, or deploys automatically.

## Reporting and promotion

Use pass@1 as primary task measure. Never disguise best-of-N, parallel worker selection, retries, or hidden evaluator access as pass@1.

Always report separate safety, correctness/alignment, coordination/recovery, efficiency, and longitudinal-learning dimensions. Any false-pass or escaped-regression increase blocks promotion.

Promotion requires:

- exact patch/Candidate identity;
- static/schema/security/sandbox success;
- visible and sealed results;
- no safety regression;
- latency/token/resource tradeoff evidence;
- human review and normal repository validation;
- explicit publication/release approval where applicable.

Promotion targets Knowledge, config, Loop Protocol, Check implementation, Runtime Route rule, source, or tests—not a free-floating Lesson store.

## Execution tiers

### Per-change development

Run cheap deterministic CodeWiki fixtures only. No paid external sweep.

### Weekly research

Use preregistered bounded external subsets plus sealed CodeWiki fixtures.

### Release candidate

Run full SWE-bench Verified, public SWE-bench Pro or a preregistered stratified set, FeatureBench, newest untouched SWE-bench Live slice, SWE-Explore, and full sealed CodeWiki suite as approved by budget.

### Public claim

Prefer independent held-out evaluation. Public tuning-set performance alone cannot support superiority.

Paid runs, provider mutation, leaderboard submission, publication, release, and deployment require separate explicit approval.

## Feedback Bundles

Lab may consume local user-reviewed allowlisted Feedback Bundles containing versions, coarse platform, Loop, built-in Check IDs/versions, statuses, issue classes, repair targets, stable error codes, attempt sequence, persistence flags, coarse timing/token buckets, and sanitizer metadata.

Bundles exclude intent, Knowledge prose, source/diffs, paths, repository/remotes/branches, commits/operation IDs, prompts/responses/reasoning, raw tool output, credentials, exact timestamps, and project-defined Check content by default. Initial transport remains manual and separately approved.

## Current executable drift

Current experimental authority is `lab`; rollout is `observe`. Lab execution does not grant production authority. Current `lab/**` still models Loop exit through legacy weighted Quality graphs and visible fixtures. Preserve useful fixture isolation, budgets, holdout loaders, and promotion discipline while replacing semantics with exact Candidate/Evidence/Policy/Check/Result/Report identity and adding coordination/graph/learning suites.

## Survival rule

If measured benefit does not offset ceremony, latency, cost, drift, repeated repair, lost context, false acceptance, and Integration risk, reduce CodeWiki to a thin Pi/OpenClaw extension.

## Related docs

- [Loop Exit](loop-exit.md)
- [Loop Contracts](loop-contracts.md)
- [Alignment Model](alignment-model.md)
- [Change Traces](traces.md)
- [Runtime](runtime.md)
- [Production Readiness Audit](../flows/production-readiness-audit.md)
