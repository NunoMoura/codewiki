# Lab

The CodeWiki lab is the isolated experimentation area for improving loop exit
conditions before changing production loop behavior. It replaces the previous
benchmark-first approach during core hardening.

## Purpose

CodeWiki's core product quality depends on the Decision, Planning, and
Implementation loops exiting only when their outputs are good enough for the next
loop. The lab exists to improve those exit conditions with fixed eval data,
simple metrics, and isolated experiment runs.

The lab is not a fourth semantic loop and not a runtime variant. It is an
experiment runner surface for CodeWiki maintainers and agents.

The lab is not part of the Pi extension runtime surface. Packed CodeWiki packages
ship `dist/**` only, so `lab/**`, `tests/**`, and `.codewiki/**` stay in the
source repository. Pi tools, slash commands, prompt hooks, and TUI renderers must
not import or expose lab code.

## Autoresearch adaptation

CodeWiki borrows the useful shape of autoresearch:

- small editable surface;
- fixed eval set;
- simple score;
- repeated isolated experiments;
- keep or reject candidates by measured improvement.

CodeWiki does not copy autoresearch literally. The editable surface is not model
training code. It is one candidate exit-standards file per semantic loop.

## Candidate surface

Each lab loop owns one editable candidate file:

```text
lab/decision/exit.ts
lab/planning/exit.ts
lab/implementation/exit.ts
```

In the lab, `exit.ts` means a collection of weighted quality standards. An
experiment agent may create, edit, delete, split, merge, or reweight standards in
that file.

The candidate file must not own the evaluator. Fixed cases, scoring, experiment
runner logic, worktree setup, and promotion logic live outside the candidate file
and are not editable during normal experiments. The editable file allowlist,
locked evaluator files, and forbidden candidate imports are declared in
`lab/runner/contract.ts` and guarded by `tests/lab/candidate-contract.test.mjs`.

Production loop helpers and wiring live under `src/<loop>/**`. Shared standard
construction helpers live under `src/loops/**`. Those helpers should stay small,
deterministic, and reusable.

Production source supports the lab by exporting three substrate seams per loop:

- issue collection, such as `collectDecisionExitIssues`, independent of final
  verdict wiring;
- weighted quality-standard definitions;
- quality-standard builders that convert collected issues into traceable
  standard results.

This lets lab candidates experiment with standards while production keeps stable
input parsing, issue collection, route wiring, trace output, and helper behavior.

## Fixed evaluation data

Lab evals use loop-specific inputs:

- Decision evals use prompts plus candidate decision outputs.
- Planning evals use accepted decisions plus candidate plans.
- Implementation evals use accepted plans plus candidate implementation evidence.

Each case declares an expected route:

```text
pass | fail | block
```

The candidate exit standards produce an observed route. The scorer compares
expected and observed routes with a loop-specific loss matrix.

## Metrics

Each loop has one headline score:

- DEC: Decision Exit Condition score.
- PEC: Planning Exit Condition score.
- IEC: Implementation Exit Condition score.

All three scores are cost-sensitive route quality metrics. False pass is the
worst error because it allows shallow or unsafe output to leave the loop.
False fail is less severe because it spends more tokens but preserves safety.
False block is worse than fail for good outputs because it interrupts autonomy,
but it is safer than passing bad output.

The scorer may apply small penalties for excessive standards or agent-mode
standards, but classification safety dominates. Candidate acceptance requires
normal tests to pass and must not increase false passes or expected-pass
regressions.

## Weights

There are two separate weight systems:

1. Standard weights in candidate `exit.ts`. These are editable and determine how
   the candidate exit condition combines quality standards.
2. Case and loss weights in the fixed scorer. These are locked during
   experiments and determine DEC, PEC, or IEC.

This separation gives experiment agents freedom to change standards without
letting them grade their own work.

## Experiment runner

The experiment runner will run one loop and one target gap at a time. Each run
uses an isolated worktree:

```text
lab/runs/<run-id>/worktree
```

The runner records base score, candidate score, prompts, logs, and patch diff.
Successful runs produce candidate branches for human review. They do not merge
into production automatically until the lab process earns trust.

## Current lab state

The Decision candidate includes a deterministic specificity standard that catches
`DEC/vague-docs-decision`. The Planning candidate includes deterministic
work-unit specificity and path-scope overlap standards that catch
`PEC/vague-work-unit-plan` and `PEC/overlapping-independent-work`. The
Implementation candidate includes a deterministic evidence-specificity standard
that catches `IEC/shallow-production-assertion`.

DEC, PEC, and IEC currently score 100 against the locked seed cases, so
`npm run lab:gate` passes. These results are lab evidence only; production loop
promotion still requires human review and normal validation.

## Promotion

A successful lab candidate does not automatically replace production code.
Promotion copies or ports the winning standards into the production loop under
`src/<loop>/**`, then runs the normal CodeWiki validation suite.

Long term, production loop exits should converge toward the same shape as lab
candidates: one weighted standard collection per loop, with helper/wiring code in
non-candidate files.

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
