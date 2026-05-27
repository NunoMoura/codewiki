---
id: spec.system.roadmap
title: Roadmap
state: active
summary: Work truth for active items, priority, status, blockers, progress, and closure.
owners:
  - architecture
updated: "2026-05-27"
---

# Roadmap

## Responsibility

The roadmap owns active work truth: todo, in-progress, blocked, recently done, and recently cancelled work retained for handoff. It is not the long-term archive and is not the requirements brief. Requirements live in accepted builds and durable knowledge; roadmap items reference those sources and track execution.

Git preserves full historical task state. Builds and validation reports preserve semantic handoff/evidence when needed. Closed or cancelled task detail should leave hot roadmap state after retention or checkpoint and remain recoverable from Git, implementation builds, validation reports, and compact ledger rows.

Roadmap garbage collection is post-commit. Task or sprint closure first produces an archive commit that still contains the closed roadmap detail, relevant builds, validation reports, and generated state. A later GC step may remove eligible closed detail or transient evidence from the hot tree only when it records the archive commit/tree and restore commands in a compact ledger.

## Planning-loop ownership

The planning loop owns roadmap alignment. It consumes a validated `decision_build` and produces a `planning_build` that creates or refines executable roadmap tasks.

A planning build decides which requirements need work, whether to refine active tasks or create a new one, task outcomes and acceptance, candidate files, TDD strategy, and requirement-to-task/test traceability. Documentation builds update knowledge; planning builds align work; implementation builds prove tests/code changed correctly.

## Progressive refinement

When new intent arrives, inspect active tasks and active sprint scope before creating work. Refine an active task when paths, labels, or intent overlap. Create a new task only when the intent is unrelated, previous work is closed/cancelled, or the user asks for separate tracking.

Gated agency uses roadmap state as work truth. The state engine derives scoped views, queue order, and next-action routing; the agency controller owns budgets, agency level, approval cadence, stop conditions, and autonomous execution gates.

## Sprints

A sprint is a bounded cohort of tasks with shared outcome, scope, budget, and closure checkpoint. Sprints group related tasks without turning CodeWiki into project-management software.

Sprint metadata records id, title, outcome, status, task ids, scope, budget limits, and gates. The active sprint should be decomposed into executable tasks. Generated graph and roadmap state expose sprint ids, active sprint ids, task membership, scope, budgets, and gates.

## Task boundary contract

A roadmap task is an actionable, self-contained unit of work with a direct outcome, own acceptance evidence, and verification steps that do not require another task to close first.

Tasks must not exist only to group, coordinate, sequence, or close other tasks. Umbrellas, epics, parent tasks, and sprint-level coordination belong in sprint metadata or planning builds. Acceptance criteria mostly about other `TASK-###` items closing or validating indicate a container task and should block planning, implementation, or task-close validation.

Task boundaries forbid overlapping ownership, not shared files. Two tasks may touch the same file when outcomes, acceptance, and evidence remain independent. Resume and agency routing should select executable tasks only; non-executable container tasks should be rejected, skipped, or blocked.

## Roadmap item contents

A roadmap item records id, title, priority, status, owner or role when needed, linked knowledge/build/code/test paths, concise outcome, acceptance summary, blockers, evidence refs, and closure reason.

It should not duplicate full decision, planning, or implementation briefs. Refinement should be additive and concise while preserving task id and closure criteria.

Roadmap ownership is durable work ownership. Runtime coordination belongs to the session queue: sessions lease affected paths, task state, build refs, validation refs, state refs, or code paths with TTL/heartbeat semantics. Worktrees isolate filesystem state; validation isolates judgment.

Parallel write work should be planned as role-isolated execution. A task may assign builder, validator, and publisher roles to separate worktrees or branch refs while keeping the roadmap item itself as the durable work record. The roadmap should record candidate paths, expected role evidence, and close requirements, but the session queue and worktree factory own temporary filesystem leases and branch/worktree metadata.

Task-close and publication readiness should assume a publisher queue when parallel sessions are active. Builders produce branch or patch refs, validators verify immutable refs from fresh worktrees, and the publisher serializes merge, generated-state update, final commit, and clean proof. Closing a task from a shared dirty root worktree is not sufficient when isolated role refs or pending publisher work exist.

## Status semantics

Canonical active statuses are:

- `todo`,
- `in_progress`,
- `blocked`.

Short-lived closure statuses are:

- `done`,
- `cancelled`.

Deprecated workflow statuses such as `research`, `implement`, and `verify` must not be emitted as roadmap status. Task phases are not canonical. Validation readiness belongs to validation/build/commit-proof evidence, not roadmap status.

## Gated agency support

Roadmap state should expose fields needed to derive eligible work, blockers, linked builds and knowledge, planning refs, validation gates, budgets, risk, agency level, approval cadence, and closure evidence. The roadmap supplies work truth; it does not decide whether an agent may continue.

Agency levels use roadmap structure as the continuation boundary:

- `task` level may continue within one focused task and stops at task validation/closure approval.
- `sprint` level may continue task-by-task through the active sprint and stops at sprint closure or a hard gate.
- `roadmap` level may continue across active roadmap work in priority order and stops at roadmap completion, budget exhaustion, or a hard gate.

The roadmap does not grant permission for semantic decisions, destructive changes, publication, or remote updates; those remain separate gates.

## Retention and history

Hot roadmap state contains active sprints, active work, session leases, unconsumed builds, fail/block validation, and recently closed/cancelled work needed for handoff. Warm state contains recent pass evidence and accepted handoffs. Cold state contains consumed/validated history. Purgeable state contains expired runtime artifacts.

After checkpoint or retention expiry, closed/cancelled detail should leave active roadmap state. Git is the cold immutable ledger; implementation builds, validation reports, and archive refs make old work recoverable. Restored history is reference material until a user or compiler turns it into new knowledge or active work.

Agents own this maintenance boundary. After a task close, sprint close, release checkpoint, or roadmap-end commit, the agent must run or explicitly defer a GC review. The review either purges eligible cold/pass/runtime artifacts through the safe GC path or records why no purge was safe. Leaving purgeable artifacts hot without a block/defer reason is drift.

Default context should hide cold roadmap and archive history unless the user explicitly requests restore, archive inspection, audit, or refinement.

## Closure

Work closes only when linked intent/spec/evidence is traceable, required checks ran or were deferred by policy, validation passed or policy explains why it is not required, and an implementation build or equivalent evidence brief exists for implemented changes.

Implementation closure should trace through a planning build unless the work is docs-only, validation-only, or covered by a migration exception.

## Generated task views

Task folders under `.codewiki/roadmap/tasks/**` are generated from `.codewiki/roadmap/queue.json`. They are not requirements briefs and must not be hand-edited. Rebuilds regenerate missing views and prune stale task directories.

Until planning-loop refactor is complete, agents must not treat a green graph or no open tasks as proof that accepted decision propagated through decision and planning.

## Related docs

- [Role Worktree Isolation](worktree-isolation.md)
- [Builds](builds.md)
- [Graph](graph.md)
- [Compilers](compilers.md)
- [Agency Controller](agency.md)
