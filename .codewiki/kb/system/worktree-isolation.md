# Worktree Isolation

The old worktree-isolation workflow is deprecated during the rebuild. Useful ideas should migrate into `src/runtime/**` and `src/git/**` as trace-owned claims, leases, dispatch boundaries, budgets, and content-evidence requirements.

Worktrees are useful for parallel workers, dirty repositories, risky merges, and producing clean per-worker Git proof. They should not be mandatory for every task because that adds setup and merge cost. Target policy is config-driven:

```text
workerIsolation: "none" | "worktree" | "auto"
```

`auto` should choose worktrees for parallel workers, overlapping risk, dirty working trees, or policy-required isolation; simple single-worker edits can stay in the normal working tree.

Target constraints:

- Trace events own worker claims and releases.
- Ephemeral leases coordinate local writes but are not durable truth.
- Runtime boundaries carry source refs and content-evidence requirements.
- Final implementation closure requires aggregate content proof after worker outputs are merged.
- Pi session history is referenced, not copied into CodeWiki truth.
- No `wiki_resume_context`, CodeWiki-owned compaction, or auto-pickup runs while the extension is disabled.

## Related docs

- [Runtime](runtime.md)
- [Traces](traces.md)
- [File Structure](file-structure.md)
- [Migration Audit](migration-audit.md)
