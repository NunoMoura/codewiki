---
type: Concept
title: Resume Context Boundary
description: The old CodeWiki-owned resume/context-refresh boundary is disabled during the rebuild.
tags:
  - codewiki
  - system
  - flows
  - resume
  - context
  - boundary
timestamp: 2026-06-30T00:00:00Z
---
# Resume Context Boundary

The old CodeWiki-owned resume/context-refresh boundary is disabled during the rebuild.

Target runtime may later produce source-backed boundary packets from JSONL traces, KB refs, source refs, and Git content evidence, but that behavior requires a future accepted decision and an explicit Pi extension reintroduction.

Current rule: use Pi native compaction only. Do not run CodeWiki-owned compaction, auto-pickup, or `wiki_*` tools in this repository.

## Related docs

- [Runtime](../components/runtime.md)
- [Traces](../components/traces.md)
