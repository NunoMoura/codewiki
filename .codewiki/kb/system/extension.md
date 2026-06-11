---
id: spec.system.extension
title: Pi Extension
state: deprecated
summary: Deprecated active extension surface; CodeWiki Pi loading is disabled during the rebuild.
owners:
  - architecture
updated: "2026-06-11"
---

# Pi Extension

The active CodeWiki Pi extension is disabled during the rebuild. `package.json` must not expose `pi.extensions` or `pi.skills` until a future explicit decision reintroduces the extension.

Target Pi integration will live under `src/pi/**` and should expose terminal-first commands, tools, prompt assets, and TUI views only after the core decision, planning, implementation, traces, views, runtime, and knowledge modules are migrated.

## Rebuild rules

- Do not use `wiki_*` tools in this repository.
- Do not run CodeWiki-owned compaction, resume injection, or auto-pickup.
- Use Pi native compaction only.
- Treat `_OLD_VERSION/**` as migration reference.
- Treat `.codewiki/kb/**` as design truth and `.codewiki/traces/TRACE-*.jsonl` as future workflow/state truth.

## Related docs

- [File Structure](file-structure.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
