---
id: spec.system.worktree-isolation
title: Role Worktree Isolation
state: active
summary: Coordination contract for role-isolated Git worktrees, exact wait/wake blockers, and publisher-queue proof.
owners:
  - architecture
updated: "2026-05-19"
code_paths:
  - src/application/claims.ts
  - src/application/tools/artifact-status.ts
  - src/application/resume-context.ts
  - src/adapters/pi/commands/resume.ts
  - src/application/builds.ts
  - src/adapters/pi/tools
---

# Role Worktree Isolation

## Responsibility

Role worktree isolation prevents parallel CodeWiki agents from blocking each other through a shared dirty root worktree. It is a coordination and publication contract layered on top of roadmap tasks, artifact status, validation, and Git proof.

The repository root remains the coordination and publisher surface unless an explicit solo-mode override is safe. Builder, validator, publisher, and cleanup roles should use per-task role worktrees or branch refs for parallel write work.

## Worktree factory

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

The publisher serializes final merge, generated CodeWiki state updates, commit creation, and clean proof. Task-close, publication, publish, release, and tracked GC gates consume the publisher result instead of waiting for an unrelated shared-root dirty state to clear.

## Wait and wake records

Wait/wake records must name the real blocker and the next safe action. Good blockers include claim id, branch, patch ref, validation ref, publisher commit, or rebase requirement. A vague “dirty from another session” message is insufficient when isolated refs can express the dependency.

Wake messages are not stale-context revival. A woken agent must re-read CodeWiki state and re-mark scopes before writing.

## Cleanup sequencing

Compatibility cleanup removes legacy session-handoff surfaces from normal user-facing recovery flow after role worktree/publisher orchestration is validated. Any future compatibility/debug behavior must be explicitly scoped to a migration task and must not replace `codewiki_resume_context`, CodeWiki-owned compaction, or `/wiki-resume --new` for fresh-context starts.

## Related docs

- [CodeWiki API](api.md)
- [Adapters](adapters.md)
- [Roadmap](roadmap.md)
- [Validation Gateway](validation-gateway.md)
- [Agency Controller](agency.md)
