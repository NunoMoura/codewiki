---
type: Concept
title: Runtime Work Item Claim Flow
description: Passed Planning yields worker-ready Work Items; Runtime provisions exact Workbenches, appends Claims, supervises isolated Assignments, and feeds Worker Report evidence into Implementation without granting acceptance.
tags:
  - codewiki
  - system
  - flows
  - runtime
  - work-item
  - claims
timestamp: 2026-07-28T00:00:00Z
---
# Runtime Work Item Claim Flow

```text
passed-and-appended Planning epoch
→ WorkState ready frontier
→ compatibility/capacity/authority selection
→ private Workbench provision + capability probe
→ exact Claim append
→ isolated Assignment attempt
→ immutable Worker Report
→ exact Implementation candidate
→ Code/Model Checks and Exit Report
→ accepted realization or remediation
→ guarded Integration
→ release/cancel/expire and proof-authorized cleanup
```

Runtime owns selection, candidate/job identity, Claim/Assignment/Workbench correlation, source base, budgets, observation, cancellation, generation/CAS, and trace append. Planning owns Work Item meaning and minimum obligations. Worker owns only bounded execution attempt and Report evidence. Implementation owns semantic realization candidate.

A completed Worker Report never grants acceptance. A passing Implementation Exit Report permits semantic exit only; Integration and every later effect remain separately guarded.

Runtime cannot invent Work Items directly from approved Changes, rewrite Planning truth, self-approve semantic evidence, or treat runtime scratch as authority. Replacement generation recovers only when canonical Claim and digest-bound private packet/Report prove exact attempt.

## Related docs

- [Runtime](../components/runtime.md)
- [Traces](../components/traces.md)
- [Planning Loop](../components/planning-loop.md)
- [Worker Workbench](../components/worker-workbench.md)
- [Implementation Loop](../components/implementation-loop.md)
