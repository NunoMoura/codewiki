---
id: spec.system.change-lifecycle
title: Change Lifecycle
state: active
summary: Decision classification and propagation rules for semantic CodeWiki changes.
owners:
  - architecture
  - product
updated: "2026-06-03"
---

# Change Lifecycle

The decision loop captures user intent with a critical eye. Its goal is not to accept a request blindly; it helps the agent and user find the best solution to the stated intention or problem. The loop surfaces tradeoffs, blind spots, pitfalls, simpler alternatives, and conflicts with existing product, system, architecture, or code truth.

The target of an intended change can be product behavior, system design, architecture, workflow, decision, tests, or code. CodeWiki must support propagation across layers instead of assuming a one-way flow. A code change can require docs updates. A refactoring idea can start in the decision loop, propagate to knowledge, and then become implementation work. Documentation drift can route back to decision when intent is unclear.

When the decision loop proposes a change, the user should see a diff table before canonical edits are applied. Each row shows current state, proposed state, rationale, affected docs or code, risk, and a user action such as approve, edit, reject, or defer. The table makes clear which components are targeted and how the change impacts adjacent layers.

Accepted rows compile into decision compiler output inside a decision trace file. The graph then routes the accepted change to the next needed loop: planning, implementation, same-loop remediation, or observe. Chat history is continuity only; KB, telemetry traces, source/tests, gate verdicts, and Git content proof are the source refs. Agents should use `wiki_resume_context` for fresh high-signal continuation and may run CodeWiki-owned compaction, new_session, or context_refresh when context becomes noisy, stale, token-heavy, or reaches a loop boundary, but they must restart from CodeWiki source refs rather than unstated chat memory. VCC recall and generic Pi compaction are recovery/overflow fallbacks, not normal CodeWiki memory. Handoff means transfer to another session, agent, or role.

Gateway preflight classifies risk before lower-layer promotion. Mechanical/docs and code-local changes can continue on the low-risk fast path only when gate criteria evidence and content proof are complete; semantic-system changes must trace to passed decision/planning evidence; security, migration, publication, release, and destructive changes require explicit user approval evidence before promotion.

Architecture review is one input to this loop, not an automatic refactor pass. Reviews should look for real friction in module depth, seams, adapters, locality, leverage, testability, and code/spec ownership.

Findings become one of three things:

- a clarification to owning `.codewiki/kb/**` specs,
- a roadmap work item with acceptance criteria and gate expectations,
- sprint or cohort metadata when accepted work contains multiple related executable tasks,
- an explicit non-goal or deferred decision with owner, trigger, and rationale.

Accepted decisions must continue propagating until each approved row is durably represented in knowledge, roadmap tasks, sprint metadata, loop trace evidence, implementation evidence, or an explicit deferred state. A loop trace open question is a prompt for the next compiler loop, not a durable holding area for decided work.

When review exposes ambiguity, hidden risk, or unmapped user intent, the work escalates back to the decision compiler. When review exposes unmapped accepted intent, the work escalates to planning and the next planning trace must resolve or defer every affected row before implementation proceeds.

## Related docs

- [Alignment Model](alignment-model.md)
- [Compilers](compilers.md)
- [Builds](builds.md)
- [Validation Gateway](validation-gateway.md)
- [Roadmap](roadmap.md)

