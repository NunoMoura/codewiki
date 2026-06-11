---
id: spec.system.graph
title: Graph
state: deprecated
summary: Deprecated graph concept; target architecture uses JSONL traces plus generated views/projections.
owners:
  - architecture
updated: "2026-06-11"
---

# Graph

The standalone graph concept is deprecated.

The target architecture uses:

- `.codewiki/kb/**` for knowledge truth;
- `.codewiki/traces/TRACE-*.jsonl` for workflow and state truth;
- `.codewiki/views/**` for generated/disposable projections.

There is no target `src/views/**` source root and no canonical `.codewiki/views/**` truth. If a future algorithm or UI needs graph traversal, it must remain an internal implementation detail behind a generated view.

## Related docs

- [Traces](traces.md)
- [File Structure](file-structure.md)
