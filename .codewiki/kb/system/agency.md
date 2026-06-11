---
id: spec.system.agency
title: Agency Automation
state: deprecated
summary: Deprecated standalone agency root; automation policy and scheduling now live under runtime.
owners:
  - architecture
updated: "2026-06-11"
---

# Agency Automation

Standalone agency is deprecated in the target architecture.

Automation still exists, but it is runtime behavior. Scheduling, policy, approval cadence, budgets, stop conditions, and continuation decisions belong under `src/runtime/**`, especially `runtime/policy.ts`, `runtime/scheduler.ts`, and `runtime/budget.ts`.

There is no target `src/runtime/**` source root. Old agency code remains only as migration reference under `_OLD_VERSION/**` until useful behavior is migrated into runtime.

## Current rebuild rule

While the CodeWiki Pi extension is disabled, this repository must not run CodeWiki-owned agency, auto-pickup, CodeWiki refresh windows, or `wiki_*` tools. Use normal file edits, tests, Git, and Pi native compaction.

## Related docs

- [Runtime](runtime.md)
- [File Structure](file-structure.md)
- [Traces](traces.md)
