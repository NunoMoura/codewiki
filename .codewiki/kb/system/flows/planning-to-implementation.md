# Planning to Implementation Flow

Implementation and runtime scheduling may start only from a planning iteration whose exit status is `exit`.

```text
planning.iteration(exit) -> work-plan view -> work-queue view -> runtime scheduling -> implementation.iteration
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

- [Planning Loop](../planning-loop.md)
- [Implementation Loop](../implementation-loop.md)
- [Runtime](../runtime.md)
