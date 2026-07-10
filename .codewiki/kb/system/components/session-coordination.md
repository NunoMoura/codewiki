---
type: Concept
title: Session Coordination Component
description: Session coordination prevents unsafe overlap between agents and records short-lived operational state. It tracks runtime claims, wait/heartbeat queues, worker/session refs, optional worktree metadata, and isolation evidence.
tags:
  - codewiki
  - system
  - components
  - session
  - coordination
timestamp: 2026-06-30T00:00:00Z
---
# Session Coordination Component

## Responsibility

Session coordination prevents unsafe overlap between agents and records short-lived operational state. It tracks runtime claims, wait/heartbeat queues, worker/session refs, optional worktree metadata, and isolation evidence.

## Owned paths

- `src/runtime/**` owns claims, leases, work-unit claim selection, and queue state.
- `src/pi/**` owns host session refs when the Pi adapter is reintroduced.
- `.codewiki/runtime/tmp/**` stores active scratch only.

There is no target `src/session/**` root.

## Contracts

- Claims coordinate work; they do not replace traces, source/tests, Git proof, or semantic loop outputs.
- Waits become heartbeat signals only after runtime folds current trace state and re-checks claims.
- Worktree metadata explains isolation but is not content proof by itself.

## Related docs

- [Runtime](runtime.md)
- [Worktree Isolation](worktree-isolation.md)
- [Implementation Loop](implementation-loop.md)
