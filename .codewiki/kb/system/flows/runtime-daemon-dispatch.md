# Runtime Dispatch Flow

1. A planning iteration exits and records runnable work, ordering, conflicts, and verification strategy in the trace.
2. Runtime folds traces and generated work-queue views.
3. Runtime derives one bounded dispatch request from current state and policy.
4. Runtime records trace-owned claims and any ephemeral local leases.
5. Runtime provides implementation/worker sessions with source refs, path scopes, budgets, temporary data paths, claim ids, and content-evidence requirements.
6. Implementation records changed paths, tests, checks, worker provenance, and proof refs in implementation loop output.
7. Runtime cleans temporary data according to exit status and trace lifecycle policy.

Runtime does not close traces by itself, does not own accepted work truth, and does not replace semantic loop exit conditions.

## Related docs

- [Runtime](../runtime.md)
- [Traces](../traces.md)
- [Planning Loop](../planning-loop.md)
- [Implementation Loop](../implementation-loop.md)
