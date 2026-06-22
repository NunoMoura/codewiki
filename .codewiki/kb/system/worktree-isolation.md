# Worktree Isolation

The old worktree-isolation workflow is deprecated during the rebuild. Useful ideas should migrate into `src/runtime/**` and `src/git/**` as trace-owned claims, leases, work-unit claim boundaries, budgets, and content-evidence requirements.

Worktrees are useful for parallel workers, dirty repositories, risky merges, and producing clean per-worker Git proof. They should not be mandatory for every task because that adds setup and merge cost. Target policy is config-driven:

```text
worktreeIsolation: "none" | "worktree" | "auto"
```

`auto` should choose worktrees for parallel workers, dirty working trees that overlap the assigned path scopes, or policy-required isolation; simple single-worker edits can stay in the normal working tree.

Worktree command plans are inert until a host explicitly executes them. The core executor dry-runs by default and requires an injected runner when `dryRun` is disabled, so runtime claim selection and implementation loops never mutate Git automatically. Default worktree roots are project-local under `.codewiki/runtime/tmp/<trace-id>/worktree/**`; custom hosts may still pass an explicit `worktreeRoot` when their sandbox allows it. Hosts that want local shell execution may explicitly pass `createShellWorktreeCommandRunner()` into `executeRuntimeWorktreeCommands()`; the helper is an adapter, not runtime-owned automation. `runRuntimeHostOnce()` can run required worktree prepare/verify before worker start and cleanup after worker completion, but its default mode is dry-run. Real Git mutation still requires explicit `execute` mode plus an injected runner. Executor steps are named `worktree.prepare`, `worktree.verify`, and `worktree.cleanup` to distinguish host worktree setup from worker TDD phases (`red`, `green`, `refactor`).

Hosts can call the read-only Git status helper before runtime claim selection to collect `dirtyPaths`, `baseRef`, and `baseSha` for `worktreeIsolation: "auto"`. The helper runs only read-only Git commands (`rev-parse` and `status --porcelain`) and supports an injected runner for tests or custom hosts.

Target constraints:

- Trace events own worker claims and releases.
- Ephemeral leases coordinate local writes but are not durable truth.
- Runtime boundaries carry source refs and content-evidence requirements.
- Worktree Git mutations require an explicit host call and injected command runner.
- Final implementation closure requires aggregate content proof after worker outputs are merged.
- Pi session history is referenced, not copied into CodeWiki truth.
- No `wiki_resume_context`, CodeWiki-owned compaction, or auto-pickup runs during initial repo-local dogfooding.

## Related docs

- [Runtime](runtime.md)
- [Traces](traces.md)
- [Source Map](source-map.md)
- [Migration Audit](migration-audit.md)
