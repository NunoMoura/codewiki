---
id: spec.system.change-lifecycle
title: Change Lifecycle
state: active
summary: Decision classification and propagation rules for semantic CodeWiki changes.
owners:
  - architecture
  - product
updated: "2026-05-16"
code_paths:
  - skills/codewiki-decision/SKILL.md
  - skills/codewiki-planning/SKILL.md
  - skills/codewiki-implementation/SKILL.md
  - skills/codewiki-validation/SKILL.md
  - src/application/builds.ts
  - src/application/graph.ts
---

# Change Lifecycle

The decision loop captures user intent with a critical eye. Its goal is not to accept a request blindly; it helps the agent and user find the best solution to the stated intention or problem. The loop surfaces tradeoffs, blind spots, pitfalls, simpler alternatives, and conflicts with existing product, system, architecture, or code truth.

The target of an intended change can be product behavior, system design, architecture, workflow, decision, tests, or code. CodeWiki must support propagation across layers instead of assuming a one-way flow. A code change can require docs updates. A refactoring idea can start in the decision loop, propagate to knowledge, and then become implementation work. Documentation drift can route back to decision when intent is unclear.

When the decision loop proposes a change, the user should see a diff table before canonical edits are applied. Each row shows current state, proposed state, rationale, affected docs or code, risk, and a user action such as approve, edit, reject, or defer. The table makes clear which components are targeted and how the change impacts adjacent layers.

Accepted rows compile into a decision build. The state engine then routes the accepted change to the next needed loop: planning, implementation, validation, or observe. Chat history is continuity only; builds, KB, roadmap, code, checks, and validation artifacts are the source of truth. Agents should use `codewiki_resume_context` for fresh high-signal continuation and may run CodeWiki-owned compaction, new_session, or context_refresh when context becomes noisy, stale, token-heavy, or reaches a loop boundary, but they must restart from CodeWiki source refs rather than unstated chat memory. VCC recall and generic Pi compaction are recovery/overflow fallbacks, not normal CodeWiki memory. Handoff means transfer to another session, agent, or role.

Architecture review is one input to this loop, not an automatic refactor pass. Reviews should look for real friction in module depth, seams, adapters, locality, leverage, testability, and code/spec ownership.

Findings become one of three things:

- a clarification to owning `.codewiki/kb/**` specs,
- a roadmap work item with acceptance criteria and validation expectations,
- an explicit non-goal or deferred decision.

When review exposes ambiguity, hidden risk, or unmapped user intent, the work escalates back to the decision compiler.

## Related docs

- [Alignment Model](alignment-model.md)
- [Compilers](compilers.md)
- [Builds](builds.md)
- [Validation Gateway](validation-gateway.md)
- [Roadmap](roadmap.md)

