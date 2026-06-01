---
id: spec.lexicon
title: Lexicon
state: active
summary: Canonical CodeWiki vocabulary for commands, tools, compilers, graph/state, runtime, gates, validation, and closure.
owners:
- product
- architecture
updated: '2026-06-01'
---

# Lexicon

This file is the canonical vocabulary contract for CodeWiki. It should stay small and active: keep terms that humans, agents, source contracts, command help, tool schemas, generated views, and validation reports are expected to use. Remove unused or obsolete terms instead of preserving them as glossary clutter. Temporary compatibility aliases may exist in source schemas or adapters during migration, but they are not canonical lexicon entries unless this file names them as active vocabulary.

## Canonical knowledge base

Durable project truth under `.codewiki/kb/**`: intended product behavior, user stories, visual UIs, system access surfaces, design seams, and workflow rules. It should not contain executable tests, raw transcripts, generated state, runtime job logs, or event history.

## Command

A human-facing Pi slash command that renders or navigates CodeWiki state. The target user command surface is:

- `/wiki bootstrap` for greenfield or brownfield CodeWiki setup,
- `/wiki status` for the most important developer-facing project state,
- `/wiki resume` for agent continuation from the last known stable state,
- `/wiki config` for user preferences and configuration selection,
- `/wiki system <diagram type>` for source-backed system diagram navigation,
- `/wiki product` for product overview, users, and user-story navigation.

Legacy hyphenated commands and standalone compatibility commands may remain as migration shims, but they are not the canonical command language.

## Internal agent tool

An adapter-exposed `wiki_*` tool intended for agents and automation. The target normal tool surface is exactly:

- `wiki_state`,
- `wiki_decide`,
- `wiki_plan`,
- `wiki_implement`,
- `wiki_gate`,
- `wiki_runtime`.

Low-level build, roadmap, session, lease, linter, and report writers are implementation primitives or compatibility aliases, not normal agent vocabulary.

## State lens

A focused graph/state query returned by `wiki_state`. A lens names a subset such as status, trace, system diagram, product navigation, task, sprint, validation, runtime, or automation readiness. Lenses reduce context noise by returning source refs, next actions, blockers, and compact graph neighborhoods instead of the whole state graph.

## Roadmap task

A tracked unit of active intended change with outcome, acceptance, non-goals, linked specs/builds/code paths, and closure evidence. Tasks are active work truth, not requirements briefs, chat to-dos, umbrellas, or long-term archives.

## Task done

A roadmap task is done only when it is production-ready for its scope. Code-changing tasks require passing executable code tests, required linters, accepted implementation evidence, a passing task-close gate, and a task-scoped ship-ready validation for the exact changed content. If code derived from an approved decision is not production-ready, the task remains in progress or blocked.

## Sprint

A bounded work wave through the compiler pipeline. A sprint groups one or more roadmap tasks with a shared outcome, scope, budget, gates, and closure checkpoint. Sprints let agents and users scope execution at roadmap, sprint, or task level without creating umbrella tasks.

## Sprint done

A sprint is done when every included task is task-done or explicitly cancelled, shared outcome and cross-task risks are reconciled, sprint-close validation passes, and the sprint content candidate is ship-ready when it changes shippable code or package behavior.

## Ship-ready

A validation state for an exact content candidate that is safe to promote. Ship-ready is a quality and safety gate; publication, release, push, remote update, or destructive action still requires separate explicit approval when policy requires it.

## Compiler

A CodeWiki workflow layer that compiles one abstraction level into the smallest useful cycle build for the next layer. Compilers create builds; gateways validate them.

## Decision compiler

The compiler that turns user conversation, grounded reads, and approved semantic rows into durable knowledge updates and a `decision_build`. It maps user intent, constraints, assumptions, risks, and non-goals before downstream work starts.

## Planning compiler

The compiler that turns a validated `decision_build` into roadmap alignment. It creates or refines roadmap tasks, acceptance criteria, non-goals, verification expectations, candidate code/test paths, and TDD strategy, then emits a `planning_build`.

## Implementation compiler

The compiler that turns a `planning_build` and roadmap work item into tests, code, linter execution, and an `implementation_build`. It follows TDD when practical and keeps executable tests in code/test directories instead of knowledge artifacts.

## Diff table

Decision-loop surface that compares current state to desired state before canonical edits. Pending rows can live in runtime UI state and be approved, rejected, deferred, or edited with alternatives. Approved rows compile into a `decision_build`.

## Decision build

Compact artifact under `.codewiki/builds/decision/**` for approved diff rows, accepted intent, knowledge changes, row-to-KB mapping, propagation evidence, diagram refs, risks, questions, and downstream planning needs.

## Planning build

Compact artifact under `.codewiki/builds/planning/**` for roadmap alignment: task creation/refinement, acceptance criteria, non-goals, verification expectations, TDD strategy, candidate code/test paths, and requirement traceability.

## Implementation build

Compact artifact under `.codewiki/builds/implementation/**` for test/code changes, linter results, acceptance mapping, closure brief, and implementation evidence.

## Closure brief

User-facing implementation summary that proves accepted intent moved through knowledge, planning, roadmap, code/tests, linters, gates, validation, and content evidence. It belongs in the implementation build and should stay compact.

## Gateway

The validation boundary that evaluates submitted cycle evidence against policy, source refs, exit criteria, required linters, tests, and content evidence. A gateway returns `pass`, `fail`, or `block` and does not mutate canonical truth.

## Gate

A named validation checkpoint owned by the gateway, such as `decision`, `planning`, `implementation`, `task-close`, `sprint-close`, or `ship-ready`. Gates define required evidence, linters, tests, freshness, isolation, and approval conditions for a boundary.

## Linter

A deterministic rule set run by a gate to evaluate source, knowledge, package, security, generated-state, or alignment contracts. Linters produce structured findings; gates decide validation verdicts.

## Test

Executable code behavior verification that lives in code/test directories and is run by implementation or validation workflows. CodeWiki does not call documentation drift, graph alignment, content evidence, or gateway decisions “tests”.

## Validation

A gateway verdict and supporting report for a named gate. Validation can pass, fail, or block. Passing validation may be transient; fail/block/policy-kept reports remain hot until resolved or archived.

## Evidence

Compact support for an assertion. Knowledge evidence supports product/system truth; implementation evidence supports changed tests/code and closure; validation evidence supports a gate verdict; immutable content evidence identifies the exact content that was evaluated or promoted.

## Requirement ID

Stable identifier for an accepted requirement as it moves from decision to knowledge, planning, tests/code, implementation evidence, and validation. Requirement ids let CodeWiki prove alignment without relying on broad prose matching.

## Traceability matrix

Compact generated view that connects requirement ids to decision rows, knowledge clauses, decision builds, planning builds, roadmap tasks, tests/code, implementation builds, validation verdicts, and content evidence. It reports gaps but does not own requirements.

## Vertical alignment

Traceability across layers:

```text
user intent -> decision_build -> planning_build -> roadmap work item -> tests/code -> implementation_build -> validation
```

## Horizontal alignment

Coherence within one layer: knowledge, roadmap, code, tests, validation, and generated state agree with peer artifacts.

## State index / graph

Primary generated hot state index at `.codewiki/index_graph.json`. Domain language calls this state; the graph is the generated representation. It maps knowledge, tasks, builds, tests, code, validation reports, session leases, runtime jobs, and compact requirement traceability with typed nodes and edges. It is generated and must not be hand-edited.

## State propagation

The state engine's ability to expose downstream or upstream drift after a source layer changes. Changing decision intent triggers knowledge or planning drift. Changing knowledge triggers planning drift. Changing planning triggers implementation drift. Changing code can trigger validation, planning, or decision drift.

## Runtime

The CodeWiki execution layer that performs one bounded step after policy authorizes it. Runtime coordinates session focus, leases, jobs, block/unblock state, context boundaries, agency scheduling, and lifecycle/archive coordination without owning durable product or roadmap truth.

## Lease

A temporary session-owned hold over narrow knowledge, roadmap, code, build, validation, runtime, or state scopes. Leases coordinate parallel work and expire or release; they do not replace tasks, builds, validation, git, or review.

## Session queue

Runtime coordination state under `.codewiki/session/queue.json`. It records active focus, waiting work, ready wake signals, leases, context-boundary metadata, handoff metadata, and isolation context for current agent sessions. The session queue is temporary coordination state, not requirements, roadmap truth, or history.

## Gated agency

User-facing capability where an agent advances roadmap work inside explicit token, time, cost, write, session, risk, validation, policy, configured agency level, and approval gates.

## Agency level

User-approved continuation contract for gated agency. `task` stops after one task, `sprint` may continue through the active sprint, and `roadmap` may continue across active roadmap work until completion, budget exhaustion, or a hard gate.

## Context window

The active Pi agent session memory. It is volatile RAM and expensive because it is reloaded with each prompt in the session.

## Subagent

A fresh Pi agent invocation with a clean context window used for bounded work such as validation, research, planning review, architecture review, testing, or building.

## Product UI

A visual user interface that a human can see and interact with, such as Pi TUI panels, status views, product navigation, system diagram views, board-like summaries, or editor panels. Product UI expectations live under `.codewiki/kb/product/uis/**`.

## System access surface

A technical distribution, adapter, command, internal tool, package API, editor integration, service agent, or runtime capability that delivers CodeWiki behavior. Stable access contracts live in `.codewiki/kb/system/api.md` and `.codewiki/kb/system/api-vnext-tools.md`.

## Related docs

- [Product](product/overview.md)
- [System Overview](system/overview.md)
- [Knowledge](system/knowledge.md)
- [Graph](system/graph.md)
- [Roadmap](system/roadmap.md)
- [API vNext Tool Surface](system/api-vnext-tools.md)
- [Validation Gateway](system/validation-gateway.md)
