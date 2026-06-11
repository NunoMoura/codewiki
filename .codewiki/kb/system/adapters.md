---
id: spec.system.adapters
title: Adapters
state: deprecated
summary: Generic adapter layer is deprecated; Pi is the only planned host surface during the rebuild.
owners:
  - architecture
updated: "2026-06-11"
---

# Adapters

The generic adapter layer is deprecated in the target rebuild.

CodeWiki is Pi-first and terminal-first. Host integration belongs under `src/pi/**` after the core modules are rebuilt. If a future host needs support, add it through a new accepted decision instead of recreating a broad `adapters` root.

Current rebuild rules:

- Pi extension loading remains disabled.
- No CodeWiki-owned compaction or auto-pickup runs in this repository.
- Pi native compaction is the only active compaction mechanism.
- Pi sessions are referenced as external history; JSONL CodeWiki traces own CodeWiki workflow/state truth.

## Related docs

- [File Structure](file-structure.md)
- [Runtime](runtime.md)
- [Traces](traces.md)
