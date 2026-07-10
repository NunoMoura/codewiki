---
type: Concept
title: Decision to Planning Flow
description: Planning may start only from a decision iteration whose exit status is `exit`.
tags:
  - codewiki
  - system
  - flows
  - decision
  - to
  - planning
timestamp: 2026-06-30T00:00:00Z
---
# Decision to Planning Flow

Planning may start only from a decision iteration whose exit status is `exit`.

```text
decision.changes_approved(exit) -> planning.work_units_created
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

- [Decision Loop](../components/decision-loop.md)
- [Planning Loop](../components/planning-loop.md)
- [Loop Model](../components/loop-model.md)
