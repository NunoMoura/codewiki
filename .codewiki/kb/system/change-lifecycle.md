---
id: spec.system.change-lifecycle
title: Change Lifecycle
state: active
summary: Feedback classification and propagation rules for semantic CodeWiki changes.
owners:
  - architecture
  - product
updated: "2026-05-16"
code_paths:
  - skills/codewiki-feedback/SKILL.md
  - skills/codewiki-documentation/SKILL.md
  - skills/codewiki-planning/SKILL.md
  - skills/codewiki-implementation/SKILL.md
  - skills/codewiki-validation/SKILL.md
  - src/application/builds.ts
  - src/application/graph.ts
---

# Change Lifecycle

The feedback loop captures user intent with a critical eye. Its goal is not to accept a request blindly; it helps the agent and user find the best solution to the stated intention or problem. The loop should surface tradeoffs, blind spots, pitfalls, simpler alternatives, and conflicts with existing product, system, architecture, or code truth.

The target of an intended change can be product behavior, system design, architecture, workflow, documentation, tests, or code. CodeWiki must support propagation across layers instead of assuming a one-way flow. A code change can require documentation updates. A refactoring idea can start in feedback, propagate to documentation, and then become implementation work. Documentation drift can route back to feedback when intent is unclear.

When feedback proposes a change, the user should see a diff table before canonical edits are applied. Each row should show the current state, proposed state, rationale, affected docs or code, risk, and a user action such as approve, edit, reject, or defer. The table should make clear which components are targeted and how the change impacts adjacent layers.

Accepted rows compile into the feedback build. The state engine then routes the accepted change to the next needed loop: documentation, planning, implementation, validation, or observe.

Architecture review is one input to this loop, not an automatic refactor pass. Reviews should look for real friction in module depth, seams, adapters, locality, leverage, testability, and code/spec ownership.

Findings become one of three things:

- a clarification to owning `.codewiki/kb/**` specs,
- a roadmap work item with acceptance criteria and validation expectations,
- an explicit non-goal or deferred decision.

When review exposes ambiguity, hidden risk, or unmapped user intent, the work escalates back to the feedback compiler.

## Related docs

- [Alignment Model](alignment-model.md)
- [Compilers](compilers.md)
- [Builds](builds.md)
- [Validation Gateway](validation-gateway.md)
- [Roadmap](roadmap.md)

