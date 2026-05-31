---
id: spec.system.components.session-coordination
title: Session Coordination Component
state: active
component_id: session_queue
diagram_refs:
  - file-structure-map:session_concept_root_boundary
source_roots:
  - src/session/**
owners:
  - architecture
  - engineering
updated: "2026-06-01"
summary: Runtime artifact status, waits, wakes, worktree isolation metadata, and session focus records.
---

# Session Coordination Component

## Responsibility

Session coordination prevents unsafe overlap between agents and records short-lived operational state. It tracks focused tasks, artifact availability, wait/wake queues, role/worktree metadata, and isolation evidence.

## Owned paths

- `src/session/**` owns claims, session tools, wait/wake state, worktree isolation helpers, and queue types.
- `.codewiki/session/**` and `.codewiki/runtime/**` are runtime coordination state, not durable roadmap truth.

## Contracts

- Artifact claims coordinate work; they do not replace Git, builds, validation, or roadmap task state.
- Waits become wake signals only after the agent refreshes state and re-checks artifacts.
- Role worktree metadata explains isolation but is not content proof by itself.

## Flow links

- [Artifact claim wait/wake](../flows/artifact-claim-wait-wake.md)
- [Runtime daemon dispatch](../flows/runtime-daemon-dispatch.md)
