---
id: spec.system.compilers
title: Compilers
state: active
summary: Alignment loops that create source-backed cycle builds for intent, knowledge, planning, and implementation.
owners:
  - architecture
  - product
updated: "2026-05-16"
code_paths:
  - src/application/builds.ts
  - src/application/roadmap.ts
  - src/application/task.ts
  - src/application/tools/build.ts
  - skills/codewiki-feedback/SKILL.md
  - skills/codewiki-documentation/SKILL.md
  - skills/codewiki-implementation/SKILL.md
  - skills/codewiki-validation/SKILL.md
---

# Compilers

## Responsibility

CodeWiki compilers move information through context-driven development boundaries. Each compiler creates a build for one alignment cycle. Build-writing code lives in focused application modules such as `src/application/builds.ts`, while compiler-loop instructions live in focused `skills/codewiki-*` skills. Validation reports are written through the application validation tool and evaluated as a gateway step; validation does not define requirements or do the compiler's work.

The target alignment flow is:

```text
feedback loop -> feedback_build -> validation gateway
  -> documentation loop -> documentation_build -> validation gateway
    -> planning loop -> planning_build -> validation gateway
      -> implementation loop -> implementation_build -> validation gateway/publication
```

A compiler turns one layer of information into the smallest useful source-backed build for the next layer. The state engine routes agents to the next required loop and source paths, but it does not replace direct reads of builds, knowledge, roadmap tasks, validation evidence, tests, code, or content proofs. Every semantic change must trace to an accepted compiler build before it can close, validate, or publish.

## Alignment cycles

An alignment cycle is one build attempt inside a loop. A cycle starts from upstream source refs, policy, and project state; it ends with a build submitted to the validation gateway.

Each loop should start behind a context boundary: a new agent session when available, or a clearly recorded context reset when the harness cannot spawn a new session. The next loop should read the handoff build, linked knowledge, roadmap task state, validation reports, tests, and code directly instead of relying on the producing loop's chat transcript or reasoning path.

Cycle builds should carry:

- the loop name and cycle sequence,
- any superseded build or previous failed/blocked cycle,
- policy profile, exit criteria, and isolation requirements for loop start, validation, and next-loop handoff,
- requirement ids and requirement text,
- source refs used to create the build,
- evidence mapping for each criterion,
- assumptions, non-goals, risks, open questions, and agent assessment,
- produced refs for the next loop.

A failed or blocked gateway verdict should not mutate lower layers directly. The same loop creates a later superseding cycle build after the user, agent, or project state resolves the issue. Cycle metadata belongs in builds; CodeWiki should not create a separate `.codewiki/cycles/**` tree unless future evidence proves builds are insufficient.

## Feedback loop

The feedback loop captures user intent with a critical eye. It should not accept requests blindly. It helps the agent and user find the best solution to the stated intention or problem before canonical knowledge, roadmap, tests, or code change.

It should surface:

- tradeoffs,
- blind spots,
- pitfalls,
- simpler alternatives,
- conflicts with current product, system, architecture, or code truth,
- affected layers,
- focused questions when intent is ambiguous,
- blunt disagreement when the requested direction harms the project.

The feedback loop presents a Change row table before canonical edits. Each Change row shows current state, desired state, rationale, affected layers, risk, and a user action such as approve, edit, reject, or defer. Below the table, the agent should provide a first-principles assessment in the best interest of the project. Approved Change rows and accepted assessment compile into a `feedback_build`.

Pending, rejected, or deferred Change rows can remain in runtime/session UI state or be summarized as open questions, non-goals, or future candidates. They must not silently become downstream requirements.

## Documentation loop

The documentation loop consumes an accepted `feedback_build` and updates durable product/system knowledge. It produces a `documentation_build` as the knowledge-alignment handoff for planning.

The documentation loop should:

- update the owning knowledge files,
- preserve product/system boundaries,
- map approved requirement ids to changed knowledge clauses,
- record deferred requirements and open questions,
- avoid creating roadmap requirements directly in the target model,
- validate horizontal and vertical knowledge alignment before handoff.

During migration to the planning loop, the documentation compiler may create a roadmap task for implementing the new planning/gateway/build support. Once `planning_build` is supported, routine roadmap mutation belongs to the planning loop.

## Planning loop

The planning loop consumes a validated `documentation_build` and aligns roadmap work with the updated knowledge. It produces a `planning_build` as the implementation-context handoff.

The planning loop should:

- identify which requirements need executable work,
- create or refine roadmap tasks without duplicating full requirements briefs,
- define outcome, acceptance criteria, non-goals, verification, and blockers,
- propose code and test candidate paths,
- outline the TDD or test-design strategy,
- map each roadmap acceptance criterion back to requirement ids and knowledge refs,
- preserve active task ids when new intent refines existing work.

Planning is the boundary between knowledge alignment and executable work. It is not an implementation step and should not change code.

## Implementation loop

The implementation loop consumes a validated `planning_build`, linked knowledge, and roadmap work item state. It creates or updates tests and code, runs checks, collects evidence, and produces an `implementation_build` with a compact closure brief for user review and publication.

The implementation loop is TDD-aligned where practical:

- derive tests or test-design evidence from the planning build before code changes,
- make or update code until the tests and acceptance criteria pass,
- map tests, code, and checks to requirement ids,
- explain any justified exception for documentation-only, config-only, or non-testable work.

For bias-sensitive or agent-created test work, implementation may split into:

- `tester`: consumes the planning build and roadmap work item, then derives tests or test-design evidence before code changes where practical,
- `builder`: consumes the planning build, roadmap work item, tester output, and required checks, then changes code until tests and acceptance pass.

The split is optional. The implementation build should distinguish tester evidence from builder evidence so validation can review the split without requiring separate agents for every task.

## Gated agency

Gated agency may advance roadmap work automatically by invoking compiler cycles inside explicit token, time, risk, validation, policy, and approval gates. The agency mechanism selects one bounded step, then stops, validates, or routes to the next loop.

Compilers remain deterministic handoff producers. They do not own autonomous scheduling, budget policy, or publication approval.

## Propagation

All agent-led semantic changes start with feedback classification, even when the observed symptom appears in code, tests, roadmap, documentation, package metadata, or publication. Builds classify the target with `change_type` (`product`, `system`, `task`, or `code`); generated, runtime, or mechanical-only work uses traceability exemption metadata instead of a separate type. After classification, propagation can originate in any layer:

- product intent can refine feedback requirements and knowledge,
- knowledge changes can create planning drift,
- planning changes can create implementation drift,
- code changes can create documentation or planning drift,
- validation failures can route back to implementation, planning, documentation, or feedback,
- audit findings can route to feedback before becoming documentation, planning, or implementation work,
- missing intent routes to feedback.

Propagation is alignment work. The graph should expose the affected loop and source refs, while compilers produce the next cycle build.

## Rules

- Builds carry loop handoff truth; they do not replace durable knowledge, executable code, or content proof.
- Roadmap items track work state; they do not duplicate full requirements briefs.
- Tests live in code/test directories, not in knowledge or roadmap folders.
- Any compiler may escalate to feedback when intent is unclear.
- Handoffs require a gateway verdict on the submitted build.
- Gateways may require audit evidence and checked content proof before passing.
- Compiler-loop handoffs require a fresh session or recorded context reset unless policy explicitly marks the boundary as not required.
- Automated compilers should use adapter session handoff capability for required fresh boundaries instead of asking the user to run `/new` or equivalent manually.
- Automated compiler execution must run through gated agency controls, not through unbounded loops.

## Related docs

- [Builds](builds.md)
- [Validation Gateway](validation-gateway.md)
- [Alignment Model](alignment-model.md)
- [Audits](audits.md)
- [Roadmap](roadmap.md)
- [Graph](graph.md)
- [Agency Controller](agency.md)
