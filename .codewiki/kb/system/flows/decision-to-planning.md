---
type: Concept
title: Decision to Planning Flow
description: Planning consumes only an exact Decision Candidate whose Evidence-backed required Results produce a passing Exit Report and whose Runtime Route/disposition were accepted after final authority and freshness guards.
tags:
  - codewiki
  - system
  - flows
  - decision
  - planning
timestamp: 2026-07-30T00:00:00Z
---
# Decision to Planning Flow

Planning consumes only exact passed-and-accepted Decision output.

```text
persisted Change revision
→ immutable Decision Candidate
→ Evidence Records
→ Resolved Exit Policy
→ complete required Check Results
→ passing Exit Report
→ Runtime freshness/authority/expected-head guard
→ accepted Runtime Route and Decision disposition
→ eligible Planning horizon
```

Decision output gives Planning:

- exact Change revision/digest and authority refs;
- accepted intent, outcome, requirements, non-goals, and constraints;
- Knowledge, provenance, current-state, and Evidence refs;
- risks, invariants, compatibility, rollback, and delivery constraints;
- active-Change overlap disposition;
- Planning questions and bounded minimum obligations;
- Candidate, Evidence, policy, Result, Report, and Runtime Route identities.

A passing Exit Report alone grants no canonical append or Planning authority. Runtime must accept the exact evaluated disposition against current `codewiki/state`, source, Knowledge, config, policy, and actor authority.

Decision proceeds independently per Change. Newly accepted Change B may enter the next Planning horizon while Change A executes. User acceptance never implies immediate parallel execution.

Failed or indeterminate Decision attempts remain in the Change Trace but cannot become Planning input. Planning routes to Decision instead of guessing when Product/System meaning, Knowledge, material risk, compatibility, overlap, outcome, or user authority is insufficient or contradictory.

## Related docs

- [Decision Loop](../components/decision-loop.md)
- [Planning Loop](../components/planning-loop.md)
- [Loop Exit](../components/loop-exit.md)
- [Change Lifecycle](change-lifecycle.md)
