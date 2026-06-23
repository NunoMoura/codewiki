# Implementation Exit Candidate

Editable candidate file:

```text
lab/implementation/exit.ts
```

Metric: IEC, Implementation Exit Condition score.

IEC measures whether the Implementation loop exits only when evidence proves the planned work is complete and the route is correct:

```text
pass | fail | block
```

The candidate standards should catch shallow production claims, missing checks, weak acceptance evidence, missing content proof, and unresolved implementation uncertainty before trace closure. False pass is the worst IEC error.

Do not edit or import `cases.ts`, `score.ts`, `lab/runner/score.ts`, or host IO modules from this candidate.
