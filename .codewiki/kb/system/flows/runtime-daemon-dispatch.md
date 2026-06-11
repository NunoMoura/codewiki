---
id: spec.system.flows.runtime-daemon-dispatch
title: Runtime Dispatch Flow
state: active
owners:
  - architecture
updated: "2026-06-11"
summary: Runtime turns passed planning work into bounded implementation dispatch with trace-owned claims, budgets, and content-evidence requirements.
---

# Runtime Dispatch Flow

1. Planning gate pass records runnable work, ordering, conflicts, and verification strategy in the trace.
2. Runtime derives one bounded dispatch request from trace events and current policy.
3. Runtime records trace-owned claims and any ephemeral local leases.
4. Runtime provides implementation with source refs, path scopes, budgets, temporary data path, and content-evidence requirements.
5. Implementation records changed paths, tests, checks, and proof refs back into the trace.
6. Runtime cleans temporary data according to gate outcome and trace lifecycle policy.

Runtime does not close traces by itself, does not own accepted work truth, and does not replace loop gates.

## Related docs

- [Runtime](../runtime.md)
- [Traces](../traces.md)
- [Compilers](../compilers.md)
