---
id: spec.system.compilers
title: Compilers
state: active
summary: Alignment loops that create source-backed builds for decision, planning, implementation, and validation boundaries.
owners:
  - architecture
  - product
updated: "2026-05-26"
code_paths:
  - src/build/writer.ts
  - src/build/tool.ts
  - src/build/types.ts
  - src/validation/report.ts
  - src/application/roadmap.ts
  - src/application/task.ts
  - skills/codewiki-decision/SKILL.md
  - skills/codewiki-planning/SKILL.md
  - skills/codewiki-implementation/SKILL.md
  - skills/codewiki-validation/SKILL.md
---

# Compilers

## Responsibility

CodeWiki compilers move information through context-driven development boundaries. Each loop creates one source-backed build for the next loop. Build-writing code lives in source-root build modules such as `src/build/writer.ts` and `src/build/tool.ts`; compiler-loop instructions live in `skills/codewiki-*`; validation reports live under `src/validation/**` as gateway attestations, not compiler output.

Target flow:

```text
decision -> decision_build -> validation
  -> planning -> planning_build -> validation
    -> implementation -> implementation_build -> validation/publication
```

The decision loop owns user semantic approval and knowledge updates. Planning owns roadmap alignment. Implementation owns tests/code and check evidence. Gateway verdicts validate each handoff and route failures to the smallest loop that can fix them. The state engine points to the next loop and source refs, but agents must still read builds, knowledge, roadmap tasks, validation evidence, tests, code, and content proofs directly.

## Alignment cycles

An alignment cycle is one build attempt in a loop. It starts from upstream source refs, policy, and project state, then ends with a build submitted to the gateway.

Each loop starts from CodeWiki source refs, not chat memory. Agents use `codewiki_resume_context` or CodeWiki-owned compaction when context is noisy, stale, token-heavy, or at an approved boundary. Hard session replacement remains available when policy requires it. Validation, task-close, publication, publish, and release still require explicit fresh/content proof.

Cycle builds carry loop identity, supersession, policy/isolation, requirement ids, source refs, evidence mappings, assumptions, non-goals, risks, open questions, assessment, and produced refs. Failed or blocked gateway verdicts do not mutate lower layers; they classify the failure and route to local retry, planning, decision, validation/proof, or runtime coordination.

## Decision loop

The decision loop captures user intent critically. It helps the agent and user find the best solution before canonical knowledge, roadmap, tests, or code change.

It should surface tradeoffs, blind spots, pitfalls, simpler alternatives, conflicts with current truth, affected layers, focused questions, and blunt disagreement when the requested direction harms the project.

The decision loop presents a Change row table before canonical edits. Each Change row shows current state, desired state, rationale, affected layers, risk, and a user action such as approve, edit, reject, or defer. Below the table, the agent should provide a first-principles assessment in the best interest of the project. Approved Change rows and accepted assessment compile into a `decision_build`.

Pending, rejected, or deferred Change rows can remain in runtime/session UI state or be summarized as open questions, non-goals, or future candidates. They must not silently become downstream requirements.

## Decision loop target contract

The decision loop combines user interaction, knowledge preflight, approved semantic rows, and durable product/system knowledge updates. It produces a `decision_build`.

Modes:

- `proposal`: read-only context loading, tradeoffs, draft rows, product/system impact preflight, and diagram impact preflight.
- `accepted`: applies user-approved rows to product/system knowledge, records row-to-KB evidence, and emits a `decision_build`.

Product intent updates product knowledge first, then system impact. System intent updates system knowledge and diagrams first, then product impact. A decision build records requirement ids, approved rows, KB mappings, propagation direction, explicit no-impact evidence when applicable, risks, non-goals, and downstream planning questions.

## Planning loop

The planning loop consumes a validated `decision_build` and aligns roadmap work with the updated knowledge. It produces a `planning_build` as the implementation-context handoff.

The planning loop identifies executable requirements, creates or refines roadmap tasks without duplicating full briefs, defines outcome/acceptance/non-goals/verification/blockers, proposes candidate code/test paths, outlines TDD or test-design strategy, maps acceptance to requirement ids and knowledge refs, and preserves active task ids when intent refines existing work.

Planning must resolve every accepted decision row and downstream planning question into a durable propagation state before implementation consumes the plan. Valid resolution states are: knowledge-only completion, executable roadmap task, sprint/cohort metadata, or explicit deferral with owner, trigger, and rationale. Open questions in a build are not durable propagation by themselves.

Planning builds should include a row-to-roadmap propagation map that names the accepted decision row or requirement, the resolution state, the roadmap task or sprint id when applicable, and the deferral trigger when work is intentionally postponed. If the gateway finds an unmapped accepted row, the planning loop must create a superseding planning build and iterate until validation passes.

Planning is the boundary between knowledge alignment and executable work. It is not an implementation step and should not change code.

## Implementation loop

The implementation loop consumes a validated `planning_build`, linked knowledge, and roadmap work item state. It creates or updates tests and code, runs checks, collects evidence, and produces an `implementation_build` with a compact closure brief for user review and publication.

The implementation loop is TDD-aligned where practical:

- derive tests or test-design evidence from the planning build before code changes,
- make or update code until the tests and acceptance criteria pass,
- map tests, code, and checks to requirement ids,
- explain any justified exception for docs-only, config-only, or non-testable work.

For bias-sensitive or agent-created test work, implementation may split tester evidence from builder evidence. The split is optional, but the implementation build should identify both roles when used so validation can review the separation without requiring separate agents for every task.


## Parallel preflight and serial promotion

Compilers may run read-only preflight lanes in parallel after a proposal exists. Useful lanes include knowledge impact, diagram impact, planning impact, implementation/ref scans, validation gate preflight, and artifact conflict checks.

Parallel lanes produce runtime-only drafts with proposal hashes, source snapshots, and invalidation metadata. They must not write product/system knowledge, roadmap truth, build artifacts, validation reports, tests, or code. Canonical truth promotion remains serial after approved decision rows and assumption-hash validation.

## Self-refactor rule

When CodeWiki uses CodeWiki to refactor itself:

- keep current public tool behavior intentional and test-covered,
- use current CodeWiki for decision capture, task planning, artifact status, validation, commits, and closure,
- implement vNext concepts as direct replacements rather than wrappers or aliases,
- do not switch live compiler semantics mid-task,
- switch to vNext flows only after decision, tests, and validation pass.

## Gated agency

Gated agency may advance roadmap work automatically by invoking compiler cycles inside explicit token, time, risk, validation, policy, and approval gates. The agency mechanism selects one bounded step, then stops, validates, or routes to the next loop.

Compilers remain deterministic build producers. They do not own autonomous scheduling, budget policy, or publication approval.

## Propagation

All agent-led semantic changes start with decision classification unless a build records a mechanical/generated/runtime exemption. Propagation can originate in any layer: product intent, knowledge drift, planning drift, code changes, validation failures, audit findings, or missing intent.

The graph exposes affected loops and refs; compilers produce the next cycle build. Failures route by class: evidence gaps retry locally, planning gaps route to planning, ambiguous or unapproved intent routes to decision, content-proof gaps route to validation/publication proof, and runtime conflicts route to wait/release coordination.

## Rules

- Builds carry compact loop-boundary truth; they do not replace durable knowledge, executable code, or content proof.
- Roadmap items track work state; they do not duplicate full requirements briefs.
- Tests live in code/test directories, not in knowledge or roadmap folders.
- Any compiler may escalate to the decision loop when intent is unclear.
- Validation handoffs require a gateway verdict on the submitted build.
- Gateways may require audit evidence and checked content proof before passing.
- Agents may run CodeWiki-owned compaction, `new_session`, or `context_refresh` at loop boundaries when context health needs it; this is agent-owned hygiene, not a handoff.
- Normal loop continuation should use `codewiki_resume_context` directly or through CodeWiki-owned compaction instead of VCC recall, generic Pi compaction, or chat-history summaries as source truth. Use `/wiki-resume --new` only when hard replacement-session isolation is needed.
- Required fresh boundaries should use adapter session-boundary capability instead of asking the user to run `/new`, legacy handoff commands, or equivalent manually. If the adapter cannot execute the boundary automatically, record an explicit platform limitation and next safe action rather than making command submission routine user work.
- Workflow-efficiency evidence matters: compiler/task-close paths should minimize user interrupts and manual command count while preserving validation, content-proof, and publication gates.
- Automated compiler execution must run through gated agency controls, not through unbounded loops.

## Related docs

- [Builds](builds.md)
- [Validation Gateway](validation-gateway.md)
- [Alignment Model](alignment-model.md)
- [Audits](audits.md)
- [Roadmap](roadmap.md)
- [Graph](graph.md)
- [Agency Controller](agency.md)
