---
type: Concept
title: Runtime Work-Unit Claim Flow
description: 1. A planning iteration exits and records Planning-owned work units, ordering, conflicts, path scopes, and verification strategy in the trace. 2. Runtime folds traces and generated work-queue views. 3. Runtime performs one bounded work-unit claim selection from current state and policy. 4. Runtime appends trace-owned work-unit claim events and any ephemeral local leases only when append policy and byte preflight allow it. 5. The host/Pi adapter starts workers from appended claim events and provides source refs, path scopes, budgets, temporary data paths, claim ids, and content-evidence requirements. 6. Workers report evidence to the host. The implementation loop evaluates the evidence and produces an appendable implementation report. 7. Runtime appends implementation and release events when policy, expected bytes, and implementation exit checks allow it. 8. Runtime cleans temporary data according to exit status and trace lifecycle policy.
tags:
  - codewiki
  - system
  - flows
  - runtime
  - work
  - unit
  - claims
timestamp: 2026-06-30T00:00:00Z
---
# Runtime Work-Unit Claim Flow

1. A planning iteration exits and records Planning-owned work units, ordering, conflicts, path scopes, and verification strategy in the trace.
2. Runtime folds traces and generated work-queue views.
3. Runtime performs one bounded work-unit claim selection from current state and policy.
4. Runtime appends trace-owned work-unit claim events and any ephemeral local leases only when append policy and byte preflight allow it.
5. The host/Pi adapter starts workers from appended claim events and provides source refs, path scopes, budgets, temporary data paths, claim ids, and content-evidence requirements.
6. Workers report evidence to the host. The implementation loop evaluates the evidence and produces an appendable implementation report.
7. Runtime appends implementation and release events when policy, expected bytes, and implementation exit checks allow it.
8. Runtime cleans temporary data according to exit status and trace lifecycle policy.

Runtime is the orchestrator and trace writer. It does not close traces by itself, does not invent accepted work truth, and does not replace semantic loop exit conditions.

## Related docs

- [Runtime](../components/runtime.md)
- [Traces](../components/traces.md)
- [Planning Loop](../components/planning-loop.md)
- [Implementation Loop](../components/implementation-loop.md)
