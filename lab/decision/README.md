# Decision Exit Candidate

Editable candidate file:

```text
lab/decision/exit.ts
```

Metric: DEC, Decision Exit Condition score.

DEC measures whether the Decision loop exits with the right route:

```text
pass | fail | block
```

The candidate standards should catch vague, unsafe, or untraceable decisions before they reach Planning. False pass is the worst DEC error.

Do not edit or import `cases.ts`, `score.ts`, `lab/runner/score.ts`, or host IO modules from this candidate.
