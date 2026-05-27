---
id: spec.lexicon
title: Lexicon
state: active
summary: Shared CodeWiki vocabulary for agents, humans, tasks, compiler builds, validation
  gateways, and generated graph views.
owners:
- product
- architecture
updated: '2026-05-16'
---

# Lexicon

## Canonical knowledge base

Durable project truth under `.codewiki/kb/**`: intended product behavior, visual UIs, system access surfaces, design seams, and workflow rules. It should not contain tests, raw transcripts, generated packs, or event logs.

## Roadmap task

A tracked unit of active intended change with outcome, acceptance, non-goals, verification, linked specs/builds/code paths, and evidence. Tasks are active work truth, not requirements briefs, chat to-dos, or long-term archives. Closed or cancelled tasks should leave the hot roadmap after retention/checkpoint because git preserves full history.

## Sprint

A bounded work wave through the compiler pipeline. A sprint groups one or more roadmap tasks with a shared outcome, scope, budget, gates, and closure checkpoint. Sprints let agents and users scope execution at roadmap, sprint, or task level.

## Compiler

A CodeWiki workflow layer that compiles one abstraction level into the smallest useful cycle build for the next layer. Compilers create builds; the validation gateway evaluates builds.

## Decision compiler

The compiler that turns user conversation, grounded reads, and approved semantic rows into durable knowledge updates and a `decision_build`. It validates that user intent, constraints, assumptions, blind spots, and non-goals are mapped before downstream work starts.

## Planning compiler

The compiler that turns a validated `decision_build` into roadmap alignment. It creates or refines roadmap tasks, acceptance criteria, non-goals, verification, candidate code/test paths, and TDD strategy, then emits a `planning_build`.

## Implementation compiler

The compiler that turns a `planning_build` and roadmap work item into tests, code, checks, and an `implementation_build`. It follows TDD when practical and keeps tests in code/test directories instead of knowledge artifacts.

## Diff table

Decision-loop surface that compares current state to desired state before canonical edits. Pending rows can live in runtime/session UI state and be approved, rejected, deferred, or edited with alternatives. Approved rows compile into a `decision_build`.

## Decision build

Compact artifact under `.codewiki/builds/decision/**` for approved diff rows, accepted intent, knowledge changes, row-to-KB mapping, propagation evidence, diagram refs, risks, questions, and downstream planning needs.

## Planning build

Compact artifact under `.codewiki/builds/planning/**` for roadmap alignment: task creation/refinement, acceptance criteria, non-goals, verification expectations, TDD strategy, candidate code/test paths, and requirement traceability.

## Implementation build

Compact artifact under `.codewiki/builds/implementation/**` for test/code changes, checks, acceptance mapping, closure brief, and implementation evidence.

## Closure brief

User-facing implementation summary that proves accepted intent moved through knowledge, planning, roadmap, code/tests, checks, and validation. It belongs in the implementation build and should stay compact.

## Validation gateway

Pure evaluator for a submitted cycle build. It validates the build against policy, source refs, exit criteria, and evidence, then returns `pass`, `fail`, or `block`. It can include deterministic preflight, checks, and a fresh read-only verifier. Failed, blocked, or policy-required reports live under `.codewiki/validation/**`.

## Gated agency

User-facing capability where an agent advances roadmap work inside explicit token, time, cost, write, session, risk, validation, policy, configured agency level, and approval gates.

## Agency level

User-approved continuation contract for gated agency. `task` stops after one task, `sprint` may continue through the active sprint, and `roadmap` may continue across active roadmap work until completion, budget exhaustion, or a hard gate.

## Agency

System mechanism for gated agency. A cycle observes state, selects one bounded next action, checks gates, performs or declines, records evidence when needed, and stops, resets context with source-backed auto-pickup, or routes to the next loop. Agency is not a product UI or fourth compiler.

## Verifier

A read-only fresh process, session, or subagent used inside a validation gateway. It returns a deterministic `pass`, `fail`, or `block` verdict and does not mutate canonical truth.

## Alignment cycle

One compiler build attempt inside a loop. A cycle has inputs, policy, exit criteria, requirement ids, evidence mapping, risks, questions, and a build submitted to the validation gateway. Failed or blocked cycles are superseded by later cycle builds.

## Requirement ID

Stable identifier for an accepted requirement as it moves from decision to knowledge, planning, tests/code, implementation evidence, and validation. Requirement ids let CodeWiki prove alignment without relying on broad prose matching.

## Traceability matrix

Compact generated view that connects requirement ids to decision rows, knowledge clauses, decision builds, planning builds, roadmap tasks, tests/code, implementation builds, and validation verdicts. It reports gaps but does not own requirements.

## Vertical alignment

Traceability across layers:

```text
user intent -> decision_build -> planning_build -> roadmap work item -> tests/code -> implementation_build
```

## Horizontal alignment

Coherence within one layer: knowledge, roadmap, code, and tests agree with peer artifacts.

## State index / graph

Primary generated hot state index at `.codewiki/index_graph.json`. Domain language calls this state; the graph is the generated representation. It maps knowledge, tasks, builds, tests, code, validation reports, session queue leases, and compact requirement traceability with typed nodes and edges. It is generated and must not be hand-edited. Curated Markdown links are inputs; the state engine owns machine backlinks, stale-reference detection, freshness, routing, and traceability-gap reporting. It is not the source of requirements.

## State propagation

The state engine's ability to index current hot state and, when any source layer changes, expose what drifted downstream or upstream. Changing decision intent triggers knowledge or planning drift. Changing knowledge triggers planning drift. Changing planning triggers implementation drift. Changing code can trigger validation, planning, or decision drift. Generated state surfaces these as reconciliation items with explicit direction, layer, and next-loop routing so agents know which loop needs to rerun, while source-backed builds and knowledge remain truth.

## View

A generated read model. In the target model, broad view trees are replaced by the graph-first index. Extra status or queue files should be avoided unless an adapter proves a concrete performance need; if present, they are cached graph queries, not canonical truth.

## Tester

An optional implementation worker that derives tests from a planning build and roadmap work item before code changes. The tester helps reduce shared-context bias between test design and implementation.

## Builder

An optional implementation worker that changes code until planning-build requirements, roadmap acceptance, tests, and required checks pass.

## Evidence

Compact proof or support for an assertion. Research/source evidence supports knowledge and planning and should live under source or research roots, not the deprecated default `.codewiki/evidence/**` root. Execution evidence supports implementation and closure and should live in `implementation_build` artifacts. Validation evidence is a gateway result; hot fail/block/policy-required/current reports live under `.codewiki/validation/**`, while cold pass reports rely on Git archival after publication.

## Context window

The active Pi agent session memory. It is volatile RAM and expensive because it is reloaded with each prompt in the session.

## Session queue

Runtime coordination state under `.codewiki/session/queue.json`. It records active focus, waiting work, ready wake signals, scoped leases, context-boundary metadata, handoff metadata, and isolation context for current agent sessions. The session queue is temporary coordination state, not requirements, roadmap truth, or history.

## Scoped lease

A temporary session-owned lease over narrow knowledge, roadmap, code, build, validation, or state/source scopes. Scoped leases coordinate parallel work and expire or release; they do not replace tasks, builds, validation, git, or code review. Legacy `claim` naming may remain only as a transitional adapter/API alias during migration.

## Subagent

A fresh Pi agent invocation with a clean context window used for bounded work such as validation, research, planning review, architecture review, testing, or building.

## ThinkCode

An optional project-scoped sandbox runtime for agent-written programs. CodeWiki may interoperate with ThinkCode when installed, but CodeWiki must remain usable with native harness tools.

## Product UI

A visual user interface that a human can see and interact with, such as the CodeWiki UI, status panel, board UI, graph navigation view, TUI screens, browser screens, or editor panels. Product UI expectations live under `.codewiki/kb/product/uis/**`.

Tools, commands, skills, CLI access, MCP access, package APIs, and harness adapters are access surfaces, not product UIs.

## System access surface

A technical distribution, adapter, or capability surface that delivers CodeWiki behavior, such as the Pi extension, packaged skills, CLI, MCP adapter, package API, editor integration, service agent, or optional runtime program. Adapter details live in `.codewiki/kb/system/adapters.md`, with stable access contracts in `.codewiki/kb/system/api.md`.

## Sanitation

The policy that keeps hot CodeWiki state small. Knowledge stays fresh, graph/index state stays current, closed history moves to compact semantic summaries when needed, and full recovery relies on git plus harness session storage.

## Related docs

- [Product](product/overview.md)
- [System Overview](system/overview.md)
- [Knowledge](system/knowledge.md)
- [Graph](system/graph.md)
- [Roadmap](system/roadmap.md)
