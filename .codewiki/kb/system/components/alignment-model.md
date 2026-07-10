---
type: Concept
title: Alignment Model
description: Alignment means all durable sources tell the same story about current intent, state, implementation, and proof.
tags:
  - codewiki
  - system
  - alignment
  - model
timestamp: 2026-06-30T00:00:00Z
---
# Alignment Model

Alignment means all durable sources tell the same story about current intent, state, implementation, and proof.

Durable sources:

- KB docs under `.codewiki/kb/**`;
- JSONL traces under `.codewiki/traces/TRACE-*.jsonl`;
- source and tests under `src/**` and `tests/**`;
- Git commits, trees, restore refs, and publication refs.

Generated views under `.codewiki/views/**` are alignment outputs, not alignment truth.

KB docs carry accepted semantic intent. JSONL traces carry workflow/state/recovery truth. Source, tests, and Git carry implementation truth. During an active trace, it is valid for KB to describe an accepted target state while the trace says planning or implementation remains pending.

## Loop alignment

| Loop | Alignment evidence |
| --- | --- |
| Decision | Approved intent, requirements, risks, alternatives, route-back answers, and KB impact are recorded in exited decision output and KB refs. |
| Planning | Every executable accepted requirement/question is materialized into work units, ordering, conflicts, verification strategy, path scopes, and implementation handoff. |
| Implementation | Changed code/docs/tests, checks, acceptance evidence, worker provenance, component/path alignment, and content proof satisfy planned acceptance. |

Exit conditions validate loop alignment and route remediation back to the owning loop. Exit conditions do not form a separate loop. Only outputs from iterations with `exit` are promoted for downstream consumption; continue, route-back, and blocked iterations stay as recovery provenance.

## Related docs

- [Loop Model](loop-model.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Traces](traces.md)
