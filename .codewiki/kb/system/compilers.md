---
id: spec.system.compilers
title: Compilers
state: active
summary: Alignment loops that create source-backed builds for decision, planning, implementation, and validation boundaries.
owners:
  - architecture
  - product
updated: "2026-06-01"
---

# Compilers

## Responsibility

CodeWiki compilers move information through context-driven development boundaries. Each loop creates one source-backed build for the next loop. Compilers produce handoffs; gateways validate them; durable truth remains in knowledge, roadmap, tests/code, validation reports, and Git proof.

```text
decision -> decision_build -> decision gate
  -> planning -> planning_build -> planning gate
    -> implementation -> implementation_build -> implementation gate
      -> task-close gate -> sprint-close gate when closing a cohort
        -> ship-ready gate when promoting exact content
```

## Loop index

| Loop | Detail |
| --- | --- |
| Decision | Captures user-approved semantic rows, KB mappings, risks, non-goals, and downstream planning questions. See [Decision to planning](flows/decision-to-planning.md). |
| Planning | Maps accepted executable rows to roadmap task ids or sprint ids and records implementation handoff evidence. See [Planning to implementation](flows/planning-to-implementation.md). |
| Implementation | Changes scoped docs/code/tests, runs checks, and writes an implementation build. See [Implementation, validation, and close](flows/implementation-validation-close.md). |
| Runtime/agency continuation | May select bounded compiler steps only through policy gates. See [Runtime daemon dispatch](flows/runtime-daemon-dispatch.md). |

## Build contract

Cycle builds carry loop identity, source refs, consumes/produces edges, policy/isolation requirements, requirement ids, evidence mappings, assumptions, non-goals, risks, open questions, assessment, and produced refs. Build-writing code lives in `src/build/**`; loop instructions live in `skills/codewiki-*`.

A build by itself is pre-gateway. Gateway-pass boundaries are the normal safe context-refresh point because the passed build and validation report become seed refs for the next loop. Failed or blocked gateway verdicts do not mutate lower layers; they classify the failure and route to local retry, planning, decision, validation/proof, or runtime coordination.

## Rules

- Compilers do not validate their own outputs.
- Planning is not implementation and should not change code.
- Planning must classify approved decision rows as executable task/sprint mapped, durable knowledge-only/non-executable disposition, rejected/not-applicable disposition, or unplanned gap; build-only deferred evidence is not a valid disposition for executable work.
- Implementation is TDD-aligned where practical and records justified exceptions for docs-only, config-only, or non-testable work.
- Any compiler may escalate to decision when intent is unclear.
- Normal loop continuation uses CodeWiki source refs and `wiki_resume_context`, not VCC recall or generic chat summaries.
- Automated compiler execution runs through gated agency controls and stops on hard gates.

## Related docs

- [Compiler loop component](components/compilers.md)
- [Builds](builds.md)
- [Validation Gateway](validation-gateway.md)
- [Roadmap](roadmap.md)
- [Graph](graph.md)
