---
id: spec.system.worktree-isolation
title: Role Worktree Isolation
state: active
summary: Coordination contract for role-isolated Git worktrees, exact wait/wake blockers, and publisher-queue proof.
owners:
  - architecture
updated: "2026-06-03"
code_paths:
  - src/session/claims.ts
  - src/session/artifact-status-tool.ts
  - src/session/worktree-isolation.ts
  - src/session/worktree-dispatcher.ts
  - src/session/merge-publisher-queue.ts
  - src/state/resume-context.ts
  - src/adapters/pi/commands/resume.ts
  - src/validation/report.ts
  - src/build/writer.ts
  - src/adapters/pi/tools
code_paths_mode: explicit_override
---

# Role Worktree Isolation

## Responsibility

Role worktree isolation prevents parallel CodeWiki agents from blocking each other through a shared dirty root worktree. It is a coordination and publication contract layered on top of roadmap tasks, artifact status, validation, and Git proof.

The repository root remains the coordination and publisher surface unless an explicit solo-mode override is safe. Builder, validator, publisher, and cleanup roles should use per-task role worktrees or branch refs for parallel write work. A parallel dispatcher may allocate one worker per non-conflicting sprint or task only after comparing declared write scopes, preparing artifact claim intents, and assigning isolated role refs. Dispatcher output is deterministic evidence: selected task ids, blocked task ids, pause reasons, source-backed resume packets, role worktree plans, and claim scopes.

## Worktree factory

The worktree dispatcher selects eligible roadmap tasks by priority and roadmap order, then excludes tasks whose code, spec, roadmap, build, validation, graph, or source scopes overlap already-selected tasks or active artifact holders. It must respect configured worker/session budgets and return wait-state evidence rather than forcing claims through conflicts.

The worktree factory prepares, records, heartbeats, verifies, and cleans role worktrees. Each record should include:

- task id and role,
- path and branch or detached ref,
- base SHA,
- head or tree SHA when produced,
- clean state,
- working-tree digest when dirty pre-commit proof is needed,
- related claim, validation, build, or publisher refs.

Artifact status records expose this metadata for coordination and graph visibility, but they do not become the filesystem source of truth. Git worktrees, branches, commits, patches, and package/archive refs remain content proof.

## Publisher queue

Task-close and publication should flow through a publisher queue when parallel sessions are active:

```text
builder worktree -> branch/patch ref
validator worktree -> immutable validation proof
publisher role -> merge/ref apply -> generated-state refresh -> commit/tree proof
```

The publisher serializes final merge, generated CodeWiki state updates, commit creation, and clean proof. A merge publisher queue must ingest worker build refs, implementation validation refs, worktree diff proofs, base/head/tree proof, and required check evidence before local checkpoint or close commits are allowed. It compares worker diffs for file overlap, duplicate task output, stale base SHA, missing validation pass proof, missing checks, and remote publication attempts without explicit approval. Conflicts produce deterministic wait/reroute evidence with source refs so affected workers can resume from CodeWiki state when the conflict is resolved. Task-close, publication, publish, release, and tracked GC gates consume the publisher result instead of waiting for an unrelated shared-root dirty state to clear. Parallel sprint agents must not close tasks or publish from their worker roots until the publisher queue records the accepted merge/content proof.

## Wait and wake records

Wait/wake records must name the real blocker and the next safe action. Good blockers include claim id, branch, patch ref, validation ref, publisher commit, or rebase requirement. A vague “dirty from another session” message is insufficient when isolated refs can express the dependency.

Wake notifications are durable session-queue records, not direct inter-agent chat. Release and expiry events enqueue pending wake notifications with waiter id, task/build refs, source refs, and next-action intent. Heartbeats extend holder or waiter leases; stale holders expire with queue evidence and can wake blocked waiters. Wake delivery marks notifications delivered so repeat watchers do not spam the same session.

Worker handoff packets are source-backed resume packets, not shared chat. Each dispatched worker receives task/context refs, source refs, follow-up intent, role worktree plan, and artifact claim scope. Wake messages are not stale-context revival. A woken agent must re-read CodeWiki state, resume through `wiki_resume_context`, and re-mark scopes before writing.

## Cleanup sequencing

Compatibility cleanup removes legacy session-handoff surfaces from normal user-facing recovery flow after role worktree/publisher orchestration is validated. Any future compatibility/debug behavior must be explicitly scoped to a migration task and must not replace `wiki_resume_context`, CodeWiki-owned compaction, or `/wiki-resume --new` for fresh-context starts.

`.tmp-worktrees/` is ignored local scratch only. It has no CodeWiki production semantics and must not be used as a durable artifact, publisher surface, validation proof, or resume source. Before deleting any local scratch or role worktree, a maintainer or cleanup worker should:

1. run `git worktree list --porcelain` and identify the exact worktree path/branch,
2. run `git -C <worktree_path> status --porcelain` and stop if it is dirty unless a patch/archive/ref proof already exists,
3. inspect artifact-status holders/waiters for the task or branch and release/cancel only stale or completed claims,
4. remove the worktree with `git worktree remove <worktree_path>` and then `git worktree prune`.

## Related docs

- [CodeWiki API](api.md)
- [Adapters](adapters.md)
- [Roadmap](roadmap.md)
- [Validation Gateway](validation-gateway.md)
- [Agency Controller](agency.md)
