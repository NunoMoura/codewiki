---
name: codewiki-plan
description: Run the CodeWiki planning loop. Use when exited Decisions must become executable Tasks, dependencies, path scopes, acceptance criteria, triggers, and a durable planning iteration.
---

# CodeWiki Plan

Use this skill after approved Decisions exit and need executable, parallel-safe Tasks.

## Ground rules

- Start from `wiki_state` for current trace-backed context.
- Planning consumes `decision.changes_approved` output.
- Planning owns Tasks, dependencies, path scopes, acceptance criteria, verification refs, and triggers.
- Planning does not edit source/docs/tests for implementation.
- Tasks are stored as internal work items and referenced as `trace:<iteration-id>#work:<work-id>`.
- Append only with expected trace bytes and next sequence.

## Workflow

1. Read exited Decisions and source-map ownership for touched paths.
2. Create self-contained, parallel-safe Tasks with path scopes, component refs, acceptance criteria, verification refs, and dependencies.
3. Add triggers only when scheduling/event/hook/manual activation is part of the accepted plan.
4. Preview with `wiki_plan`.
5. If blocked, fix missing decision coverage, invalid refs, path conflicts, dependency cycles, weak acceptance, or trigger quality gaps.
6. Append only after trace append handles are known.
7. Route exited Tasks to `codewiki-implement`.

## Stop conditions

Stop and route back to decision when accepted intent is missing, ambiguous, contradicted by current docs, or needs user clarification/validation. Block only for non-semantic external waits or resource constraints.
