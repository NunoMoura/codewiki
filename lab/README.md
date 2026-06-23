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

Locked evaluator files are declared in `lab/runner/contract.ts` and enforced by `tests/lab/candidate-contract.test.mjs`.

## Metrics

- DEC measures Decision loop exit routing quality.
- PEC measures Planning loop exit routing quality.
- IEC measures Implementation loop exit routing quality.

False pass is the highest-cost error because bad work escapes to the next loop. False fail wastes work but preserves safety. False block interrupts autonomy but is safer than false pass.

## Promotion checklist

A lab candidate is eligible for production review only when all are true:

1. The target DEC, PEC, or IEC score improves.
2. False passes do not increase.
3. Expected-pass regressions do not increase.
4. Locked cases, score logic, and loss weights are unchanged.
5. Normal tests and package/readiness checks pass.
6. A human reviews the diff before promotion into `src/<loop>/**`.

Promotion is a port into production standards, not an automatic merge from lab code.
