---
id: spec.system.flows.resume-context-boundary
title: Resume Context Boundary
state: deprecated
summary: Deprecated CodeWiki-owned resume/refresh flow; Pi native compaction is active during the rebuild.
owners:
  - architecture
updated: "2026-06-11"
---

# Resume Context Boundary

The old CodeWiki-owned resume/context-refresh boundary is disabled during the rebuild.

Target runtime may later produce source-backed boundary packets from JSONL traces, KB refs, source refs, and Git content evidence, but that behavior requires a future accepted decision and an explicit Pi extension reintroduction.

Current rule: use Pi native compaction only. Do not run CodeWiki-owned compaction, auto-pickup, or `wiki_*` tools in this repository.

## Related docs

- [Runtime](../runtime.md)
- [Traces](../traces.md)
