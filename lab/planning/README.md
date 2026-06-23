# Planning Exit Candidate

Editable candidate file:

```text
lab/planning/exit.ts
```

Metric: PEC, Planning Exit Condition score.

PEC measures whether the Planning loop exits with implementation-ready work units and the right route:

```text
pass | fail | block
```

The candidate standards should catch vague work units, unsafe overlap, missing acceptance criteria, weak dependencies, and unresolved planning uncertainty before Implementation. False pass is the worst PEC error.

Do not edit or import `cases.ts`, `score.ts`, `lab/runner/score.ts`, or host IO modules from this candidate.
