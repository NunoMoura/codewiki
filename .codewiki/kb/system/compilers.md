---
id: spec.system.compilers
title: Compilers
state: active
summary: Three CodeWiki loop engines that emit compact telemetry trace output for decision, planning, and implementation gates.
owners:
  - architecture
  - product
updated: "2026-06-03"
---

# Compilers

## Responsibility

CodeWiki compilers are the engines for the three workflow loops. They move user intent through decision, planning, and implementation boundaries while keeping durable truth in KB docs, source/tests, telemetry traces, and Git.

```text
Decision Loop -> decision gate
  -> Planning Loop -> planning gate
    -> Implementation Loop -> implementation gate -> Git content proof
```

There is no validation loop. Gateway gates are exit conditions for loops.

## Loop index

| Loop | Compiler responsibility | Exit gate |
| --- | --- | --- |
| Decision | Convert user input, grounded reads, and approved diff rows into KB/diagram truth and decision compiler output in `decision.json`. | Decision gate verifies approved semantics, KB/diagram propagation, no-impact rationales, and risk approval. |
| Planning | Convert passed decision output into executable task/sprint alignment, acceptance criteria, verification strategy, candidate refs, and planning compiler output in `planning.json`. | Planning gate verifies every accepted row/question is mapped to knowledge-only, roadmap task, sprint, or deferred disposition with evidence. |
| Implementation | Convert passed planning output into code/docs/tests, required evidence, implementation compiler output, and Git content proof in `implementation.json`. | Implementation gate verifies acceptance evidence, tests/linters, KB/diagram freshness, clean or digest-backed content, and commit/tree/package refs when required. |

## Compiler output vs build compatibility

The compiler is source code. The build is emitted trace data.

Target source layout uses loop-owned engines:

```text
src/decision/compiler.ts
src/planning/compiler.ts
src/implementation/compiler.ts
```

Historic `decision_build`, `planning_build`, and `implementation_build` names remain compatibility names for compiler output sections. They should migrate into `.codewiki/telemetry/<trace_id>/{decision,planning,implementation}.json` rather than stay as separate hot `.codewiki/builds/**` piles or a top-level product-source `src/build/**` concept.

## Graph and promotion boundaries

Graph refresh and loop promotion are separate:

- writing compiler output refreshes the graph as pending loop evidence;
- writing a fail/block gate verdict refreshes the graph with gate findings and remediation items;
- only a passing gate promotes to the next loop or closes implementation;
- implementation is not complete until required Git proof is recorded.

## Rules

- Compilers do not validate their own outputs.
- A compiler output is pre-gateway and cannot promote work by itself.
- Any compiler may route back to decision when intent is unclear or KB truth is stale.
- Planning is not implementation and should not change source code.
- Implementation is TDD-aligned where practical and records justified exceptions for docs-only, config-only, or non-testable work.
- Normal loop continuation uses CodeWiki source refs, telemetry traces, and `wiki_resume_context`, not chat summaries.
- Automated compiler execution runs through gated agency controls and stops on hard gates.

## Related docs

- [Compiler loop component](components/compilers.md)
- [Builds](builds.md)
- [Validation Gateway](validation-gateway.md)
- [Graph](graph.md)
- [File Structure](file-structure.md)
