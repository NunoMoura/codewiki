---
id: spec.system.components.state-engine
title: State Engine Component
state: deprecated
component_id: state_engine
summary: Deprecated state/graph engine component; target projections live under views generated from JSONL traces and KB truth.
owners:
  - architecture
updated: "2026-06-11"
---

# State Engine Component

The old state/graph engine component is deprecated.

Target architecture uses:

- `.codewiki/traces/TRACE-*.jsonl` for workflow/state truth;
- `.codewiki/views/**` for generated projections;
- `src/views/**` for projection builders.

There is no target `src/state/**` or `src/graph/**` root. Legacy behavior may be migrated into `src/views/**`, `src/traces/**`, or `src/runtime/**` depending on responsibility.

## Related docs

- [Traces](../traces.md)
- [File Structure](../file-structure.md)
