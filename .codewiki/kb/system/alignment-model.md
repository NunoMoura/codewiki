---
id: spec.system.alignment-model
title: Alignment Model
state: active
summary: Alignment model for KB truth, JSONL traces, generated views, source/tests, gates, and Git proof.
owners:
  - architecture
updated: "2026-06-11"
---

# Alignment Model

Alignment means all durable sources tell the same story about current intent and implementation.

Durable sources:

- KB docs under `.codewiki/kb/**`;
- JSONL traces under `.codewiki/traces/TRACE-*.jsonl`;
- source and tests under `src/**` and `tests/**`;
- Git commits, trees, restore refs, and publication refs.

Generated views under `.codewiki/views/**` are alignment outputs, not alignment truth.

## Loop alignment

| Loop | Alignment evidence |
| --- | --- |
| Decision | Approved intent, requirements, risks, alternatives, and KB impact are recorded in trace events and KB refs. |
| Planning | Every executable accepted row/question is materialized into work units, ordering, conflicts, and verification strategy. |
| Implementation | Changed code/docs/tests, checks, and content proof satisfy planned acceptance. |

Gates validate loop alignment and route remediation back to the originating loop. Gates do not form a separate loop.

## Related docs

- [Traces](traces.md)
- [Compilers](compilers.md)
- [Validation Gateway](validation-gateway.md)
