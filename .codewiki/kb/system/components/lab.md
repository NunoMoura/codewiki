---
type: Concept
title: Lab
description: The CodeWiki lab is the isolated experimentation area for improving loop exit conditions before changing production loop behavior. It replaces the previous benchmark-first approach during core hardening.
tags:
  - codewiki
  - system
  - lab
timestamp: 2026-06-30T00:00:00Z
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

The CodeWiki lab is the isolated experimentation area for improving loop exit
conditions before changing production loop behavior. It replaces the previous
benchmark-first approach during core hardening.

## Purpose

CodeWiki's core product quality depends on the Decision, Planning, and
Implementation loops exiting only when their outputs are good enough for the next
loop. The lab exists to improve those exit conditions with visible regression
cases, hidden holdout cases, simple metrics, and isolated experiment runs.

The lab is not a fourth semantic loop and not a runtime variant. It is an
experiment runner surface for CodeWiki maintainers and agents.

The lab is not part of the Pi extension runtime surface. Packed CodeWiki packages
ship `dist/**` only, so `lab/**`, `tests/**`, and `.codewiki/**` stay in the
source repository. Pi tools, slash commands, prompt hooks, and TUI renderers must
not import or expose lab code.

Implementation review tooling follows the same boundary. Lab cases may train or
score common review nodes, language-specific review nodes, fast-feedback budgets,
and false-pass scenarios, but packaged CodeWiki ships only the frozen production
quality network and adapter code under `src/**`. Lab-only experiments must not
silently change user-project review behavior.

## Autoresearch adaptation

CodeWiki borrows the useful shape of autoresearch:

- small editable surface;
- fixed visible eval set plus hidden holdout bundles;
- simple score;
- repeated isolated experiments;
- keep or reject candidates by measured improvement.

CodeWiki does not copy autoresearch literally. The editable surface is not model
training code. It is one candidate loop quality-network file per semantic loop.
The candidate `loop.ts` files are the autoresearch-style trainable artifact for
CodeWiki: agents optimize those files against locked evaluator loss.

## Candidate surface

Each lab loop owns one editable candidate file:

```text
lab/decision/loop.ts
lab/planning/loop.ts
lab/implementation/loop.ts
```

In the lab, `loop.ts` means an interpretable quality network made from
fine-grained quality-standard nodes. The source representation is still a graph
for hashing, dependencies, and scheduling. An experiment agent may create, edit,
delete, split, merge, or recalibrate standards in that file.

Each node must expose a score/activation, cost, layer, method, gate, timeout
budget, standard type, evidence, and repair target. The network feeds loop loss.
If loss stays above the loop threshold, the agent should repair the top failing
nodes and run the evaluator again. If loss falls below threshold and hard gates
pass, the loop can exit.

Candidate loop files use this shared layer vocabulary:

- `hard_gate`: production and schema contracts that cannot be averaged away;
- `input_contract`: required fields, refs, and work shape;
- `trace_fidelity`: canonical refs and trace handoff preservation;
- `coverage`: decision, planning, acceptance, and verification coverage;
- `specificity`: concrete non-placeholder intent, requirements, and evidence;
- `scope_control`: component/path/dependency boundaries;
- `evidence_quality`: proof, checks, acceptance evidence, and content proof;
- `risk_authority`: approvals, security/privacy, release, and risk boundaries;
- `project_fit`: maintainability, style, simplicity, and project benefit;
- `repairability`: routed blockers, uncertainty, rollback, and recovery paths;
- `pipeline_carryover`: cross-loop carryover signals;
- `exit_loss`: aggregate loss/threshold behavior.

The candidate file must not own the evaluator. Fixed cases, hidden holdout
loading, scoring, experiment runner logic, worktree setup, and promotion logic
live outside the candidate file and are not editable during normal experiments.
The editable file allowlist, locked evaluator files, import allowlists, and
forbidden candidate imports are declared in `lab/runner/contract.ts` and guarded
by `tests/lab/candidate-contract.test.mjs`.

Production loop helpers and wiring live under `src/<loop>/**`. Shared standard
construction helpers live under `src/loops/**`. Those helpers should stay small,
deterministic, and reusable. Lab training may tune topology, weights, thresholds,
scoring formulas, and judge rubrics; packaged extension code ships a frozen
production network and must not silently mutate it in user projects.

Production source supports the lab by exporting three substrate seams per loop:

- issue collection, such as `collectDecisionExitIssues`, independent of final
  verdict wiring;
- weighted quality-standard definitions;
- quality-standard builders that convert collected issues into traceable
  standard results.

This lets lab candidates experiment with standards while production keeps stable
input parsing, issue collection, route wiring, trace output, and helper behavior.

A future package release should ship a frozen production quality network in
`src/**`. Training and evolution remain in `lab/**`; installed packages should
not silently mutate their production network inside user projects.

## Visible and hidden evaluation data

Lab evals use loop-specific inputs:

- Decision evals use prompts plus candidate decision outputs.
- Planning evals use accepted decisions plus candidate plans.
- Implementation evals use accepted plans plus candidate implementation evidence.

Trace-derived cases are also allowed when they are sanitized and labeled from an
observed downstream outcome. Raw trace JSONL is evidence, not automatic truth.
Useful labels include false passes discovered by later tests, true blocks fixed
by users, downstream pipeline drift, and accepted work that preserved intent.
Curated trace-derived cases may become visible cases, sealed holdout cases, or
project-local profile cases.

`npm run lab:forge -- --json` is the narrow draft forge. It reads
`.codewiki/traces/TRACE-*.jsonl`, reduces semantic loop events into sanitized
case drafts, and marks every suggested label as needing human review. It does not
commit cases, mutate candidate files, or treat raw traces as automatic truth.

Each case declares an expected route:

```text
pass | fail | block
```

The candidate exit standards produce an observed route. The scorer compares
expected and observed routes with a loop-specific loss matrix. Fail/block cases
may also declare `expectedFailures` with standard ids and failure classes; a
route-correct failure that misses those standards is still a wrong-reason loss.

Repo-visible seed cases live in `lab/<loop>/cases.ts`. They are useful for fast
regression, but they are not strong evidence because candidate agents can inspect
them. Hidden holdout bundles must live outside the repository and are loaded by:

```bash
npm run lab:holdout -- --file /path/outside/repo/holdout.json --gate
```

`lab:holdout` rejects repo-local holdout files by default and fails suites that
omit a semantic loop. `lab:sealed-check` also requires fail/block holdout cases
to include expected failure labels. Holdout bundles are sealed evaluator test
data; they must not be committed or imported by candidate files.

## Metrics

Each loop has one headline score:

- DEC: Decision Exit Condition score.
- PEC: Planning Exit Condition score.
- IEC: Implementation Exit Condition score.

The lab also has pipeline and holdout scores:

- PCE: Pipeline Carryover Efficiency.
- HCE: Holdout Confidence/Evaluation score from a sealed external bundle.

DEC, PEC, and IEC are cost-sensitive route quality metrics. False pass is the
worst error because it allows shallow or unsafe output to leave the loop.
False fail is less severe because it spends more tokens but preserves safety.
False block is worse than fail for good outputs because it interrupts autonomy,
but it is safer than passing bad output.

PCE is a trace handoff metric. It checks whether decision facts, planning refs,
acceptance criteria, and implementation evidence survive across production-shaped
trace events. PCE does not replace DEC/PEC/IEC; it tests whole-pipeline fidelity.

`npm run lab:graph` inspects the production and candidate graphs by loop,
layer, node, version, and hash so agents can operate the graph through a compact
surface instead of reading all helper plumbing.

`npm run lab:objective` combines DEC, PEC, IEC, PCE, and optional HCE into one
scalar objective:

```text
0.25 * DEC + 0.25 * PEC + 0.25 * IEC + 0.15 * PCE + 0.10 * HCE - penalties
```

If no sealed holdout is mounted, the objective runs in `visible-only` mode and
is capped at 90. A sealed holdout can be mounted with `--file` or
`CODEWIKI_LAB_HOLDOUT_FILE`. False passes and expected-pass regressions apply
hard caps regardless of aggregate score.

The scorer may apply small penalties for excessive standards or agent-mode
standards, but classification safety dominates. Candidate acceptance requires
normal tests to pass and must not increase false passes or expected-pass
regressions.

## Weights

There are two separate calibration systems:

1. Candidate node scores/costs in `loop.ts`. These are editable and determine how
   the candidate quality network computes exit loss and repair targets.
2. Case and loss weights in the fixed scorer. These are locked during
   experiments and determine DEC, PEC, IEC, PCE, or HCE.

This separation gives experiment agents freedom to improve candidate standards
without letting them grade their own work.

## Experiment runner

`lab/program.md` is the single optimizer-facing instruction file. The future
experiment runner will run one loop and one target gap at a time. Each run uses
an isolated worktree:

```text
lab/runs/<run-id>/worktree
```

The runner records base score, candidate score, holdout status, prompts, logs,
and patch diff. Successful runs produce candidate branches for human review. They
do not merge into production automatically until the lab process earns trust.

The current holdout runner is intentionally narrower than the future experiment
runner: it only loads an external JSON bundle, scores it against current
candidates, and reports a gate. This creates a blind-eval seam before automated
candidate generation is added. The trace forge is also narrower than the future
case forge: it produces sanitized drafts, not accepted labels or committed cases.

The pipeline lab is another intermediate runner. It builds production-shaped
trace events from synthetic decision, planning, and implementation artifacts, then
scores whether required facts, refs, and acceptance coverage survive across the
whole chain. It is visible regression data for trace carryover, not a hidden
benchmark.

## Current lab state

The Sprint proposal includes deterministic specificity and authority
standards that catch `DEC/vague-docs-decision`, high-risk approval gaps, and
migration rollback gaps. The Planning candidate includes deterministic work-unit
specificity, dependency, and path-scope overlap standards that catch
`PEC/vague-work-unit-plan`, `PEC/overlapping-independent-work`, and invalid
micro-plan dependencies. The Implementation candidate includes deterministic
evidence and proof standards that catch `IEC/shallow-production-assertion`,
failed checks, missing content proof, and unknown acceptance criteria.

DEC, PEC, IEC, and PCE currently score 100 against their visible seed cases, so
`npm run lab:gate` and `npm run lab:pipeline -- --gate` pass. This is
visible-regression evidence only. Meaningful experiment evidence additionally
requires a private `lab:holdout -- --gate` run from a sealed evaluator bundle
outside the repository. Production loop promotion still requires review and
normal validation.

## Promotion

A successful lab candidate does not automatically replace production code.
Promotion copies or ports the winning nodes, feature extractors, thresholds, and
loss aggregation into the production loop under `src/<loop>/**`, then runs the
normal CodeWiki validation suite.

Long term, production loop exits should converge toward the same shape as lab
candidates: a frozen quality network per loop plus hard gates and helper/wiring
code in non-candidate files. Whole-pipeline quality remains a separate layer so
local loop passes cannot hide decision-to-implementation drift.

## Deferred app benchmarks

Full application benchmarks such as Tetris or flight-simulator generation are
deferred. They should return only after DEC, PEC, and IEC expose few or no known
core-loop gaps. App benchmarks prove external product impact; lab scores improve
CodeWiki's core loop mechanics first.

## Related docs

- [Loop Contracts](loop-contracts.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Runtime](runtime.md)
