---
id: spec.system.compilers
title: Compilers
state: active
summary: Alignment loops that create source-backed builds for decisions, knowledge, planning, implementation, and validation.
owners:
  - architecture
  - product
updated: "2026-05-19"
code_paths:
  - src/application/builds.ts
  - src/application/roadmap.ts
  - src/application/task.ts
  - src/application/tools/build.ts
  - skills/codewiki-feedback/SKILL.md
  - skills/codewiki-documentation/SKILL.md
  - skills/codewiki-planning/SKILL.md
  - skills/codewiki-implementation/SKILL.md
  - skills/codewiki-validation/SKILL.md
---

# Compilers

## Responsibility

CodeWiki compilers move information through context-driven development boundaries. Each compiler creates a build for one alignment cycle. Build-writing code lives in focused application modules such as `src/application/builds.ts`, while compiler-loop instructions live in focused `skills/codewiki-*` skills. Validation reports are written through the application validation tool and evaluated as a gateway step; validation does not define requirements or do the compiler's work.

The target alignment flow uses the decision loop as the user semantic boundary:

```text
decision loop -> decision_build -> validation gateway
  -> planning loop -> planning_build -> validation gateway
    -> implementation loop -> implementation_build -> validation gateway/publication
```

Compatibility flow remains valid while feedback/documentation tools exist:

```text
compatibility feedback_build -> validation gateway
  -> documentation loop -> documentation_build -> validation gateway
    -> planning loop -> planning_build -> validation gateway
      -> implementation loop -> implementation_build -> validation gateway/publication
```

The decision loop owns user semantic approval and knowledge updates. Lower-level task creation, code changes, and closure are validated by gateways rather than by asking the user to inspect compiler machinery. A compiler turns one layer of information into the smallest useful source-backed build for the next layer. The state engine routes agents to the next required loop and source paths, but it does not replace direct reads of builds, knowledge, roadmap tasks, validation evidence, tests, code, or content proofs. Every semantic change must trace to an accepted compiler build before it can close, validate, or publish.

## Alignment cycles

An alignment cycle is one build attempt inside a loop. A cycle starts from upstream source refs, policy, and project state; it ends with a build submitted to the validation gateway.

Each loop starts from CodeWiki source refs, not chat memory. Agents may run `new_session` or `context_refresh` when context becomes noisy, stale, or token-heavy. Validation, task-close, publication, publish, and release still need explicit fresh/content proof. Handoff means transfer to another session, agent, or role.

Cycle builds should carry loop identity, supersession, policy/isolation, requirement ids, source refs, evidence mappings, assumptions, non-goals, risks, open questions, agent assessment, and produced refs for the next loop.

A failed or blocked gateway verdict should not mutate lower layers directly. The same loop creates a later superseding cycle build after the user, agent, or project state resolves the issue. Cycle metadata belongs in builds; CodeWiki should not create a separate `.codewiki/cycles/**` tree unless future evidence proves builds are insufficient.

## Decision loop

The decision loop captures user intent critically. It helps the agent and user find the best solution before canonical knowledge, roadmap, tests, or code change.

It should surface tradeoffs, blind spots, pitfalls, simpler alternatives, conflicts with current truth, affected layers, focused questions, and blunt disagreement when the requested direction harms the project.

The decision loop presents a Change row table before canonical edits. Each Change row shows current state, desired state, rationale, affected layers, risk, and a user action such as approve, edit, reject, or defer. Below the table, the agent should provide a first-principles assessment in the best interest of the project. Approved Change rows and accepted assessment compile into a `decision_build` in the target model, or a `feedback_build` in compatibility mode.

Pending, rejected, or deferred Change rows can remain in runtime/session UI state or be summarized as open questions, non-goals, or future candidates. They must not silently become downstream requirements.

## Decision loop target contract

The decision loop combines user interaction, knowledge preflight, accepted semantic rows, and durable product/system knowledge updates. It produces a `decision_build` for routine intent-to-knowledge work.

The decision loop has two modes:

- `proposal`: read-only context loading, tradeoff surfacing, draft rows, product/system impact preflight, and diagram impact preflight. It must not mutate canonical knowledge.
- `accepted`: applies only user-approved semantic rows to product/system knowledge, records row-to-KB evidence, and emits a `decision_build`.

The decision loop routes by abstraction entrypoint:

- Product-oriented intent updates product knowledge first, then preflights system impact and downstream work.
- Technical/system intent updates system diagrams and system knowledge first, then preflights user-visible product impact.

A decision build must record requirement ids, approved rows, row-to-KB mappings, propagation direction, explicit `no product impact` or `no system impact` evidence when applicable, risks, non-goals, and downstream planning questions. User approval is required for semantic decisions and risk escalations; gateways validate KB diffs, diagram/doc alignment, task planning, code, closure, and publication evidence.

## Documentation loop (compatibility)

The documentation loop consumes an accepted `feedback_build` and updates durable product/system knowledge. It produces a `documentation_build` as the knowledge-alignment handoff for planning.

During the vNext migration, documentation remains the current path for feedback-to-knowledge work. New design should target the decision loop, and deprecated wrappers or aliases are removed once a direct replacement exists.

The documentation loop updates owning knowledge files, preserves product/system boundaries, maps approved requirement ids to changed clauses, records deferred requirements or questions, avoids roadmap requirements in the target model, and validates knowledge alignment before handoff.

During migration to the planning loop, the documentation compiler may create a roadmap task for implementing the new planning/gateway/build support. Once `planning_build` is supported, routine roadmap mutation belongs to the planning loop.

## Planning loop

The planning loop consumes a validated `documentation_build` and aligns roadmap work with the updated knowledge. It produces a `planning_build` as the implementation-context handoff.

The planning loop identifies executable requirements, creates or refines roadmap tasks without duplicating full briefs, defines outcome/acceptance/non-goals/verification/blockers, proposes candidate code/test paths, outlines TDD or test-design strategy, maps acceptance to requirement ids and knowledge refs, and preserves active task ids when intent refines existing work.

Planning is the boundary between knowledge alignment and executable work. It is not an implementation step and should not change code.

## Implementation loop

The implementation loop consumes a validated `planning_build`, linked knowledge, and roadmap work item state. It creates or updates tests and code, runs checks, collects evidence, and produces an `implementation_build` with a compact closure brief for user review and publication.

The implementation loop is TDD-aligned where practical:

- derive tests or test-design evidence from the planning build before code changes,
- make or update code until the tests and acceptance criteria pass,
- map tests, code, and checks to requirement ids,
- explain any justified exception for documentation-only, config-only, or non-testable work.

For bias-sensitive or agent-created test work, implementation may split tester evidence from builder evidence. The split is optional, but the implementation build should identify both roles when used so validation can review the separation without requiring separate agents for every task.


## Parallel preflight and serial promotion

Compilers may run read-only preflight lanes in parallel after a proposal exists. Useful lanes include knowledge impact, diagram impact, planning impact, implementation/ref scans, validation gate preflight, and artifact conflict checks.

Parallel lanes produce runtime-only drafts with proposal hashes, source snapshots, and invalidation metadata. They must not write product/system knowledge, roadmap truth, build artifacts, validation reports, tests, or code. Canonical truth promotion remains serial after approved decision rows and assumption-hash validation.

## Self-refactor compatibility mode

When CodeWiki uses the current toolchain to refactor CodeWiki itself, it runs in compatibility mode:

- keep current public tool behavior frozen except critical blocker fixes,
- use current CodeWiki for decision capture, task planning, artifact status, validation, commits, and closure,
- implement vNext concepts as direct replacements rather than wrappers or aliases,
- do not switch live compiler semantics mid-task,
- switch to vNext flows only after documentation, tests, and validation pass.

## Gated agency

Gated agency may advance roadmap work automatically by invoking compiler cycles inside explicit token, time, risk, validation, policy, and approval gates. The agency mechanism selects one bounded step, then stops, validates, or routes to the next loop.

Compilers remain deterministic build producers. They do not own autonomous scheduling, budget policy, or publication approval.

## Propagation

All agent-led semantic changes start with decision classification, even when the observed symptom appears in code, tests, roadmap, documentation, package metadata, or publication. Compatibility feedback builds may carry that classification until decision builds become default. Builds classify the target with `change_type` (`product`, `system`, `task`, or `code`); generated, runtime, or mechanical-only work uses traceability exemption metadata instead of a separate type. After classification, propagation can originate in any layer:

- product intent can refine decision requirements and knowledge,
- knowledge changes can create planning drift,
- planning changes can create implementation drift,
- code changes can create documentation or planning drift,
- validation failures can route back to implementation, planning, documentation compatibility, or decision,
- audit findings can route to decision before becoming knowledge, planning, or implementation work,
- missing intent routes to decision.

Propagation is alignment work. The graph should expose the affected loop and source refs, while compilers produce the next cycle build.

## Rules

- Builds carry compact loop-boundary truth; they do not replace durable knowledge, executable code, or content proof.
- Roadmap items track work state; they do not duplicate full requirements briefs.
- Tests live in code/test directories, not in knowledge or roadmap folders.
- Any compiler may escalate to the decision loop when intent is unclear.
- Validation handoffs require a gateway verdict on the submitted build.
- Gateways may require audit evidence and checked content proof before passing.
- Agents may run `new_session` or `context_refresh` at loop boundaries when context health needs it; this is agent-owned hygiene, not a handoff.
- Required fresh boundaries should use adapter session-boundary capability instead of asking the user to run `/new` or equivalent manually.
- Automated compiler execution must run through gated agency controls, not through unbounded loops.

## Related docs

- [Builds](builds.md)
- [Validation Gateway](validation-gateway.md)
- [Alignment Model](alignment-model.md)
- [Audits](audits.md)
- [Roadmap](roadmap.md)
- [Graph](graph.md)
- [Agency Controller](agency.md)
