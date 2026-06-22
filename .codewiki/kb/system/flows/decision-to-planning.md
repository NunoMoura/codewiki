# Decision to Planning Flow

Planning may start only from a decision iteration whose exit status is `exit`.

```text
decision.rows_approved(exit) -> planning.work_units_created
```

Decision output gives planning:

- accepted intent and requirements;
- non-goals and assumptions;
- KB and diagram refs;
- current-state baseline refs;
- risks and approvals;
- planning questions;
- canonical refs.

Planning must route back to decision instead of guessing when product/system authority is missing.

Related docs:

- [Decision Loop](../decision-loop.md)
- [Planning Loop](../planning-loop.md)
- [Loop Model](../loop-model.md)
