---
id: spec.system.system-truth-and-compilers
title: System Truth and Compilers
state: active
summary: Truth boundaries between KB docs, JSONL traces, generated views, source/tests, gates, and Git proof.
owners:
  - architecture
updated: "2026-06-11"
---

# System Truth and Compilers

Durable truth lives in KB docs, JSONL traces, source/tests, and Git proof. Generated views are disposable projections. Compilers append trace events; gates decide promotion.

| Concern | Target owner |
| --- | --- |
| Product/system knowledge | `.codewiki/kb/**` |
| Workflow/state traceability | `.codewiki/traces/TRACE-*.jsonl` |
| Current status/resume/work plan/blockers/conflicts | `.codewiki/views/**` generated from truth sources |
| Source implementation | `src/**` and `tests/**` |
| Cold history and content proof | Git commits, trees, restore refs, publication refs |

Agents should not hand-edit generated views. If views and canonical inputs disagree, canonical inputs win and views are stale or broken.

## Related docs

- [Traces](traces.md)
- [Compilers](compilers.md)
- [File Structure](file-structure.md)
