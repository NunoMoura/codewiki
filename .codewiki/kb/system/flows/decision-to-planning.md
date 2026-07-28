---
type: Concept
title: Decision to Planning Flow
description: Planning may consume only one exact Decision candidate whose required Results produce a passing Exit Report and whose approval was appended after final authority and freshness guards.
tags:
  - codewiki
  - system
  - flows
  - decision
  - planning
timestamp: 2026-06-30T00:00:00Z
---
# Decision to Planning Flow

Planning may consume only exact passed-and-appended Decision output.

```text
persisted Change revision
→ immutable Decision candidate
→ Resolved Exit Policy
→ complete required Check Results
→ passing Exit Report
→ Runtime generation/freshness/authority/CAS guard
→ decision.change_approved
→ eligible Planning horizon
```

Decision output gives Planning:

- exact approved Change revision/digest and approval authority ref;
- accepted intent, outcome, requirements, non-goals, and constraints;
- Knowledge/provenance/current-state refs;
- risks, invariants, compatibility, rollback, and delivery constraints;
- active-Change overlap disposition;
- Planning questions and bounded minimum obligations;
- Decision candidate, policy, Result, and Report identities.

Passing Report alone grants no append or Planning authority. Runtime must append exact evaluated revision under current generation and CAS. Failed/indeterminate Decision attempts remain in Change Trace but cannot become Planning input.

Planning routes to Decision instead of guessing when Product/System meaning, Knowledge, material risk, compatibility, overlap, outcome, or user authority is insufficient/contradictory.

Related docs:

- [Decision Loop](../components/decision-loop.md)
- [Planning Loop](../components/planning-loop.md)
- [Loop Exit](../components/loop-exit.md)
- [Loop Model](../components/loop-model.md)
