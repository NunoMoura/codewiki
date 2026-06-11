---
id: spec.system.builds
title: Compiler Output Artifacts
state: deprecated
summary: Historic decision/planning/implementation build files are compatibility artifacts; target output is JSONL trace records.
owners:
  - architecture
updated: "2026-06-11"
---

# Compiler Output Artifacts

Historic `decision_build`, `planning_build`, and `implementation_build` JSON files belong to the old implementation. They can be read as migration evidence, but they are not target truth roots.

Target compiler output is appended to `.codewiki/traces/TRACE-*.jsonl` as typed records and compact checkpoints. Generated views under `.codewiki/views/**` can project build-like summaries when needed.

There is no target `.codewiki/builds/**` source-of-truth root and no target `src/build/**` root.

## Related docs

- [Traces](traces.md)
- [Compilers](compilers.md)
- [File Structure](file-structure.md)
