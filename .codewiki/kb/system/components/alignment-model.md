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

Durable product sources:

- KB docs under `.codewiki/kb/**`;
- source and tests under `src/**` and `tests/**`;
- Git commits, trees, restore refs, and publication refs;
- JSONL traces under `.codewiki/traces/TRACE-*.jsonl` only in projects where the released extension is installed and operating.

Generated views under `.codewiki/views/**` are alignment outputs, not alignment truth.

KB docs carry accepted semantic intent. Source, tests, and Git carry implementation truth. Installed CodeWiki projects may additionally use JSONL traces for workflow/state/recovery truth. The CodeWiki source repository does not self-host during stabilization: it keeps no active dogfood traces or Changes Backlog and uses Pi native tools plus normal Git review.

## Loop alignment

| Loop | Alignment evidence |
| --- | --- |
| Decision | Approved intent, requirements, risks, alternatives, route-back answers, and KB impact are recorded in exited decision output and KB refs. |
| Planning | Every executable accepted requirement/question is materialized into work units, ordering, conflicts, verification strategy, path scopes, and implementation handoff. |
| Implementation | Changed code/docs/tests, checks, acceptance evidence, worker provenance, component/path alignment, and content proof satisfy planned acceptance. |

Exit conditions validate loop alignment and route remediation back to the owning loop. Exit conditions do not form a separate loop. Only outputs from iterations with `exit` are promoted for downstream consumption; continue, route-back, and blocked iterations stay as recovery provenance.

## Sprint Knowledge alignment projection

A Sprint's Knowledge scope is the canonical Product/System topic set accepted with its Decision boundary. When Decision appends a newly approved Sprint, its output captures a SHA-256 baseline for every readable declared topic. Dashboard projection compares only those recorded topic digests with current canonical topic content; missing baseline or current evidence fails safely to Unknown. Alignment has four user-facing states:

| State | Meaning |
| --- | --- |
| Aligned | Relevant topic content matches the last validated scoped baseline and no grounded contradiction is open. |
| Review Needed | Relevant topic content changed after the baseline and requires semantic review. A digest change alone can establish only this state. |
| Misaligned | An explicit grounded finding identifies a contradiction, affected layer, source-of-truth refs, rationale, and recommended next semantic loop. |
| Unknown | Topic scope, baseline, or grounding is insufficient, including legacy Sprints without required metadata. |

This state is a disposable deterministic projection plus explicit findings. It cannot rewrite traces, create a semantic loop, or automatically create amendment Sprints. Topic filters, internal state views, and Sprint detail must consume the same result.

## Related docs

- [Loop Model](loop-model.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Traces](traces.md)
