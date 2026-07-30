---
type: Concept
title: Worktree Isolation
description: Runtime uses optional explicit Git worktrees and opt-in OCI isolation to bound parallel Assignments, preserve exact provenance, and feed guarded Integration without granting semantic authority.
tags:
  - codewiki
  - system
  - worktree
  - isolation
timestamp: 2026-07-30T00:00:00Z
---
# Worktree Isolation

Runtime uses optional explicit Git worktrees and opt-in OCI isolation to bound parallel Assignments, preserve exact provenance, and feed guarded Integration. Isolation is execution machinery, not semantic authority or a complete security boundary.

Worktrees are useful for parallel workers, dirty repositories, risky merges, and producing clean per-worker Git proof. They should not be mandatory for every Work Item because that adds setup and merge cost. Target policy is config-driven:

```text
worktreeIsolation: "none" | "worktree" | "auto"
```

`auto` should choose worktrees for parallel workers, dirty working trees that overlap the assigned path scopes, or policy-required isolation; simple single-worker edits can stay in the normal working tree.

Worktree command plans are inert until a host explicitly executes them. The core
executor dry-runs by default and requires an injected runner when `dryRun` is
disabled, so Runtime Work Item Claim selection and Implementation Loops never mutate Git
automatically. Current executable worktree roots are project-local under
`.codewiki/runtime/tmp/<trace-id>/worktree/**`; the protocol clean cut binds target paths to exact Change, Work Item, and Assignment-attempt identities. Custom hosts may still pass an explicit `worktreeRoot` when their sandbox allows it.

Generated Git operations use structured executable-and-argument commands and
run without a shell, so refs and paths remain literal process arguments.
User-configured setup commands remain explicit shell strings and therefore
require the same host approval as other arbitrary project commands. Runtime
handoff schema v2 preserves this distinction for external hosts.

Hosts that want local execution may explicitly pass
`createShellWorktreeCommandRunner()` into
`executeRuntimeWorktreeCommands()`; the helper is an adapter, not runtime-owned
automation. `runRuntimeHostOnce()` can run required worktree prepare/verify
before worker start and cleanup after worker completion, but its default mode is
dry-run. Real Git mutation still requires explicit `execute` mode plus an
injected runner. Executor steps are named `worktree.prepare`,
`worktree.verify`, and `worktree.cleanup` to distinguish host worktree setup
from worker TDD phases (`red`, `green`, `refactor`).

Hosts can call the read-only Git status helper before Runtime Work Item Claim selection to collect `dirtyPaths`, `baseRef`, and `baseSha` for `worktreeIsolation: "auto"`. The helper runs only read-only Git commands (`rev-parse` and `status --porcelain`) and supports an injected runner for tests or custom hosts.

The elected worker reconciler owns idempotent cleanup for generated worktrees under `.codewiki/runtime/tmp/**`. It never deletes a worktree associated with an active Work Item Claim. A packet written before Work Item Claim acquisition, or a released failed, blocked, or cancelled attempt, may be cleaned by removing the Runtime-local directory and running structured `git worktree prune` through the injected runner. Completed and ambiguous attempts remain preserved until exact `integration.result_recorded` proof matches Work Item Claim, Assignment, Worker Report, commit, tree, and content proof. Only then may sanitation remove the completed worker worktree and private artifacts. Paths outside the Runtime temp root fail closed and require explicit host remediation.

Container isolation is available through the opt-in harness-neutral OCI worker adapter without changing the canonical worker lifecycle. Runtime still prepares one explicit Git worktree because that worktree is both the bounded mutable source mount and the later Integration input. Container-only adapters are availability-probed before Work Item Claim acquisition. They require a digest-pinned image already present on the host and use structured Docker/Podman arguments with `--pull never`, a read-only root, dropped capabilities, no privilege escalation, bounded resources/output/time, an explicit numeric user, and no network by default. A host may name a separately governed restricted network, but `host`, default bridge, and implicit broad networks are rejected. Only explicitly listed environment variables are forwarded. The container receives Assignment context through standard input; mounts the exact writable worktree, one pre-created outcome file, and the canonical repository Git common directory read-only; and never mounts the project checkout, Docker socket, home directory, or full runtime state. Fixed `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_OPTIONAL_LOCKS=0` values let tools inspect linked-worktree status and history without mutating refs or indexes. Runtime rejects worktree admin metadata whose resolved common directory differs from the canonical repository.

The OCI adapter treats outcome content as untrusted. It validates exact worker/Work Item identity and status, converts malformed or unsuccessful output into a terminal failed/cancelled Worker report, writes the final digest-bound report atomically on the host, and uses the same recovery and Implementation candidate/Check path as process workers. Cancellation terminates the foreground runtime client and force-removes the deterministic exact container before the coordinator releases its lane. Orphan container-outcome scratch is preserved for active Work Item Claims and unintegrated completed evidence, then removed under the same terminal or Integration-proof sanitation rules.

Accepted worker output is integrated into a separate runtime-local worktree rooted at the exact Assignment source commit. The integrator stages worker changes to include untracked files, emits a bounded binary patch, enforces Planning path scopes, serializes the exact target/base lane, applies with Git's three-way index mode, runs `git diff --cached --check`, and creates a no-GPG local commit. The normal project checkout and branch are not moved. Integration branch commits remain available for aggregate preview and later guarded merge; they are not publication.

Project-branch promotion is separate and opt-in. Elected-host `ProjectBranchMergeAuthority` binds one exact checked-out local branch and user/policy authority. Runtime verifies that Integration commit is the exact child of the expected target, verifies its trailer/tree/paths/patch, permits only configured disposable Runtime and hot-materialization dirtiness, checks generation before mutation and operation acceptance, and executes a structured hook-disabled fast-forward. A stale/non-fast-forward branch is never reconciled by an implicit merge commit or reset. Target `source.branch_merge_recorded` preserves prior commit as the restore boundary and exact promoted tree as proof. Current source event naming remains executable drift until the clean cut.

A later push is separately opt-in under elected-host user authority. Runtime binds configured remote name, exact branch, expected remote head, local merged commit/tree, generation, and canonical merge operation; performs no-force structured push with pre-push hooks disabled; and confirms exact remote head before target `source.branch_push_recorded` is accepted. Remote drift or divergence fails without overwrite. Merge and push proofs remain distinct, and neither authorizes product publication, deployment, release, registry publication, or automatic rollback.

Constraints:

- Change operations own Work Item Claim acquisition, release, and authenticated takeover.
- Ephemeral local leases coordinate process writes but are not durable truth.
- Runtime boundaries carry source refs and content-evidence requirements.
- Worktree Git mutations require an injected structured command runner under elected-runtime execution policy.
- Final integration proof requires an exact local commit and tree after accepted worker output is applied.
- Pi session history is referenced, not copied into CodeWiki truth.
- No `wiki_resume_context`, CodeWiki-owned compaction, or auto-pickup runs while repo-local dogfooding is disabled or during any later guarded re-enable phase.

## Related docs

- [Runtime](runtime.md)
- [Traces](traces.md)
- [Source Map](source-map.md)
- [Clean-Cut Audit](../flows/clean-cut-audit.md)
