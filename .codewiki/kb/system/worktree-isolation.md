---
id: spec.system.worktree-isolation
title: Worktree Isolation
state: deprecated
summary: Legacy worker/worktree isolation contract; target runtime claims and boundaries will be trace-owned.
owners:
  - architecture
updated: "2026-06-11"
---

# Worktree Isolation

The old worktree-isolation workflow is deprecated during the rebuild. Useful ideas should migrate into `src/runtime/**` as trace-owned claims, leases, dispatch boundaries, budgets, and content-evidence requirements.

Target constraints:

- Trace events own worker claims and releases.
- Ephemeral leases coordinate local writes but are not durable truth.
- Runtime boundaries carry source refs and content-evidence requirements.
- Pi session history is referenced, not copied into CodeWiki truth.
- No `wiki_resume_context`, CodeWiki-owned compaction, or auto-pickup runs while the extension is disabled.

## Related docs

- [Runtime](runtime.md)
- [Traces](traces.md)
- [File Structure](file-structure.md)
