---
id: spec.system.roadmap
title: Roadmap
state: deprecated
summary: Deprecated standalone roadmap root; target architecture derives work-plan views from planning trace events.
owners:
  - architecture
updated: "2026-06-11"
---

# Roadmap

The standalone roadmap state model is deprecated for the target rebuild.

The target architecture uses planning trace events as work truth and generates `.codewiki/views/work-plan.json` as the current work-plan view. Human-facing roadmap or board displays should render the work-plan view; they must not own durable state.

Legacy `.codewiki/roadmap/**` files may be read during migration as historical dogfood state, but they are not active workflow truth in this repository while the CodeWiki extension is disabled.

There is no target `src/roadmap/**` source root.

## Related docs

- [Traces](traces.md)
- [File Structure](file-structure.md)
