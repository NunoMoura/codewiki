---
type: Concept
title: Planning to Implementation Flow
description: Implementation and runtime scheduling may start only from a planning iteration whose exit status is `exit`.
tags:
  - codewiki
  - system
  - flows
  - planning
  - to
  - implementation
timestamp: 2026-06-30T00:00:00Z
---
# Planning to Implementation Flow

Implementation and runtime scheduling may start only from a planning iteration whose exit status is `exit`.

```text
planning.work_units_created(exit) -> work-plan view -> work-queue view -> runtime scheduling -> implementation.evidence_accepted
```

Planning output gives implementation:

- work-unit ids;
- planning refs;
- acceptance criterion ids and text;
- component refs;
- path scopes;
- dependencies;
- verification strategy;
- blockers/deferrals if any;
- canonical refs.

Implementation must route back to planning for insufficient acceptance, bad path scopes, wrong ordering, missing verification strategy, or required work split/merge.

Related docs:

- [Planning Loop](../components/planning-loop.md)
- [Implementation Loop](../components/implementation-loop.md)
- [Runtime](../components/runtime.md)
