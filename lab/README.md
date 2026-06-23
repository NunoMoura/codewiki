# CodeWiki Lab

The lab is a source-only research harness for improving loop exit conditions before production behavior changes. It is not part of the Pi extension, prompt surface, tool surface, or packed package runtime.

## Candidate edit scope

Experiment agents may edit only these candidate files during normal lab runs:

```text
lab/decision/exit.ts
lab/planning/exit.ts
lab/implementation/exit.ts
```

Each candidate file contains weighted standards for one semantic loop. Candidate files may change standard definitions, weights, and deterministic checks. They must not edit or import fixed cases, score logic, loss matrices, or host IO.

Locked evaluator files and candidate import allowlists are declared in `lab/runner/contract.ts` and enforced by `tests/lab/candidate-contract.test.mjs`.

## Metrics

- DEC measures Decision loop exit routing quality.
- PEC measures Planning loop exit routing quality.
- IEC measures Implementation loop exit routing quality.

False pass is the highest-cost error because bad work escapes to the next loop. False fail wastes work but preserves safety. False block interrupts autonomy but is safer than false pass.

## Visible and hidden evaluation

`npm run lab` and `npm run lab:gate` run the repo-visible seed cases. They are
useful for regression, but they are not strong evidence because candidate agents
can inspect them.

Meaningful experiments must also run a sealed holdout bundle outside this
repository:

```bash
npm run lab:holdout -- --file /path/outside/repo/holdout.json --gate
```

or:

```bash
CODEWIKI_LAB_HOLDOUT_FILE=/path/outside/repo/holdout.json npm run lab:holdout -- --gate
```

Holdout files must not be committed. `lab:holdout` rejects repo-local holdout
files by default so candidate agents cannot inspect or edit the private cases.
Each holdout suite must include cases for Decision, Planning, and Implementation;
missing-loop suites fail the holdout gate.

A future experiment runner should create an isolated worktree per candidate run,
apply candidate diffs only to `lab/<loop>/exit.ts`, run visible cases, then ask a
sealed evaluator process to run the external holdout gate.

## Pipeline carryover lab

Per-loop scores DEC, PEC, and IEC test whether each loop exits correctly. They do
not prove that trace facts survive across the whole pipeline.

`npm run lab:pipeline` runs the pipeline carryover lab and reports PCE, Pipeline
Carryover Efficiency. PCE uses production-shaped trace events to check that:

- decision facts appear in planning work;
- planning work references decision rows;
- implementation evidence preserves expected facts;
- implementation evidence references planning work;
- implementation evidence covers planning acceptance criteria.

This is still a visible seed suite, not hidden proof, but it tests trace handoff
fidelity rather than one loop's local exit condition.

## Promotion checklist

A lab candidate is eligible for production review only when all are true:

1. The target DEC, PEC, or IEC score improves.
2. False passes do not increase.
3. Expected-pass regressions do not increase.
4. Locked cases, score logic, and loss weights are unchanged.
5. Repo-visible seed cases pass.
6. Pipeline carryover cases pass under `npm run lab:pipeline -- --gate`.
7. External holdout cases pass under `lab:holdout -- --gate`.
8. Normal tests and package/readiness checks pass.
9. A human reviews the diff before promotion into `src/<loop>/**`.

Promotion is a port into production standards, not an automatic merge from lab code.
