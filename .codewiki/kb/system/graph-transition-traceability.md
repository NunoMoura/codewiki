---
id: spec.system.graph-transition-traceability
title: Graph Transition Traceability
state: deprecated
summary: Deprecated graph-transition companion; target transition traceability lives in JSONL traces and generated views.
owners:
  - architecture
updated: "2026-06-11"
---

# Graph Transition Traceability

This document is deprecated because graph is not part of the target mental model.

Transition traceability now belongs to JSONL trace events and checkpoints under `.codewiki/traces/TRACE-*.jsonl`. Generated views may project transition/readiness summaries under `.codewiki/views/**`, but they do not own truth.

## Related docs

- [Traces](traces.md)
- [File Structure](file-structure.md)
