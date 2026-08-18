---
type: System Component
title: Runtime
description: Executes immutable Run Requests through exact Runtime Builds and controlled Run Processes, then creates bounded Run Receipts without project authority.
status: stable
tags: [system, component]
codewiki_component: runtime
codewiki_source_patterns: ["src/runtime/**"]
codewiki_test_patterns: ["tests/runtime/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Runtime supplies isolated accountable execution for Project Server-issued Runs.
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Runtime supplies isolated Code and Model Check execution without Result authority.
  - type: realizes
    target: /product/stories/check-author/author-composable-checks.md
    rationale: Runtime supplies immutable input and sandbox boundaries for authored Code Checks.
  - type: realizes
    target: /product/stories/agent/retrieve-bounded-context.md
    rationale: Runtime mounts exact Project Material Generations and receipts local queries, session continuity, and DSH compaction.
---
# Runtime

Runtime is the Project Server-owned execution subsystem. It accepts immutable Run Requests, executes bounded Runs, controls Run Processes, and creates CodeWiki-authored Run Receipts. It owns no project meaning, Client authentication, project authorization, Stage Loop, Candidate admission, Check Result, Gate reduction, lifecycle transition, Workbench custody, or guarded effect.

```text
Project Server
  -> Run Request
  -> Runtime
  -> Run Process
  -> DSH Adapter
  -> DSH Agent + AgentLoop + Agent Session
  -> Runtime
  -> Run Receipt
  -> Project Server
```

Run Request and Run Receipt form the semantic boundary between Project Server and Runtime. The Run Process protocol is a narrower transport boundary internal to Runtime. DSH is an in-process library behind the CodeWiki DSH Adapter; it does not speak the Run Process protocol and receives no canonical project storage handle.

## Run lifecycle

A Run Request binds role, stage, subject, custody, Runtime Build, continuity key, DSH Session and expected head, exclusive lease, material mount, prompts, Skills, tools, route, repository or Workbench, and budgets. Runtime freezes it before acceptance; Project Server decides why the Run exists and what follows. A Session may span Runs, but has one writer and each Candidate one producing Run.

Runtime owns acceptance, authenticated process binding, ordered events, cancellation, deadline, quiescence, exit proof, forced termination, raw log, and final receipt. Internal process management uses shell-free spawn, private pipes, empty environment, bounded frames, and observed termination.

A Run Process sends one authenticated terminal result after its final event and before quiescence. It is not a receipt. Runtime issues a receipt only after validating request, result, events, custody, logs, ledger, quiescence, and exit. Missing required proof prevents `completed`; delegated custody records visibility gaps.

Run failure cannot mutate accepted project state. Runtime returns a bounded stopped receipt or operational fact; Project Server decides whether to retry from canonical state, resume the exact Agent Session at its expected head under a new lease, roll logical continuity into a new Session with deterministic rehydration, or stop the Stage Loop attempt.

## Runtime Builds

A Runtime Build is the immutable content-addressed DSH execution closure. Its manifest binds protocol, Node, reviewed source commit, executed DSH/Cordis closure, Runtime Plugins, adapters, and artifact bytes. Reviewed source and package closure remain distinct without attestation.

Qualification binds suite and Evidence digests. Runtime privately stores qualified builds; CAS selects one active build for new Runs. Requests permanently bind build and protocol. Same-Session resume requires the original build. Missing, altered, unqualified, or incompatible artifacts stop without fallback; rollback affects future Runs only.

There is no user-facing build selector, Pi fallback, or permanent multi-engine mode. The temporary Pi implementation remains migration evidence under `src/runtime/pi/**` until the DSH path proves semantic parity, then it is deleted.

## DSH Adapter

CodeWiki's in-process DSH Adapter constructs exact DSH Agents from Requests and translates DSH events and terminal output into Runtime facts. DSH remains unmodified upstream code.

DSH owns AgentLoop request, streaming, tool pairing, continuation, cancellation, Session events, compaction mechanics, and delegated plumbing. CodeWiki owns prompts, Skills, local material bindings, provider-broker capability, routes, secrets, budgets, policy, observations, and receipts.

Production disables ambient profiles, settings, Skill discovery, workspace instructions, dynamic plugins, creation mode, DSH UI/Host API, product MCP, and uncontrolled workflow/goal/task drivers. DSH never selects CodeWiki stages, retries, Results, Gates, or effects. Fixed replay proves the process path but is no user backend or fallback.

Each Runtime Plugin contributes one first-party allowlisted capability through the DSH Adapter: tool, context binding, Skill provider, model/delegate adapter, observer, or compaction policy. Project files install no executable Runtime Plugins. Effective capability is the intersection of CodeWiki release ceiling, Project Server authorization, Run Request, and any narrower Skill declaration.

## Run kinds and isolation

Decision and Planning Sessions are Change-scoped, Implementation is Work Unit-scoped, and Review is integration-lineage-scoped and independent. Producer Sessions span bounded Runs without depending on server or process lifetime. Same-Session resume requires original build/protocol; change requires rollover and canonical rehydration. DSH owns no Stage Loop. Each Model Check uses a fresh tool-free Session without producer state.

Code Checks use deterministic admitted sandboxes rather than DSH. A Run Sandbox term is reserved for enforced filesystem, network, process, environment, credential, and resource containment; an ordinary child process is called a Run Process and is not mislabeled as a security sandbox.

Only an Implementation Run may receive a writable Workbench. Project Server owns the Workbench, Assignment, base and resulting tree, command policy, and Integration. Runtime receives only the bounded capability described by the Run Request. Decision, Planning, Review, and Model Check Runs receive no writable Workbench authority.

Delegated Runs use exact adapters. Runtime controls dispatch, admitted task/artifacts, lifecycle, cancellation, and granted Workbench capability. Receipts declare unobserved inner prompts, settings, tools, models, and continuation. External Agent Clients retain their pipelines.

## Material, evaluation, ledger, and compaction

Producer Runs mount immutable content-addressed Project Material Generations built from exact WorkState, Knowledge, Alignment, active Changes, Work Graph, repository, Evidence, and Results. Material is a local query substrate, not canonical state or Gate package. Sessions switch generations only at idle boundaries. Typed queries bind generation, engine, arguments, bounds, order, sources, coverage, unknowns, truncation, cursor, and staleness, with no live round trip or ambient fallback.

Project Server freezes a distinct immutable Gate Evaluation Package only after Candidate checkpoint. Checks receive only declared exact package inputs; Model Checks receive no live Project Server handle, producer material-query tools, producer Session, or memory. The current `StageContextBundle` and `query_stage_context` tools remain replay qualification evidence until replaced by mounted local material services; they are not the production producer-context contract.

Every controlled model-visible input, material query, replacement, usage, output, and cancellation enters the append-only Execution Ledger. Its header binds Request, Build, continuity, Session/head, material or package input, route, tools, and Skills. Canonical entries form a digest chain; durable append uses expected-head CAS and recovery revalidates it.

Raw DSH Agent Session bytes remain versioned evidence, not canonical project state. Runtime retains them by exact byte length and digest and revalidates stored bytes on every receipt read. A completed Run Receipt commits only after its exact Execution Ledger and raw log are durably present. Receipt commit is immutable, identity-keyed, atomic, and compare-and-swap guarded; recovery rejects missing, mismatched, corrupted, or misnamed evidence.

Compaction changes model-visible surface only. Authority facts become canonical first. DSH owns pressure, pruning, replacement, and Session events; CodeWiki owns predictive stage policy, safe idle checkpoints, promotion, rehydration, and rollover. Checkpoints cite replaced ranges and retain exact history. Never compact during an open turn, unmatched tool pair, pending child work, or before Candidate freezing. Opaque heap is never canonical.

## Authority and API

Runtime cannot write Change Trace, WorkState, Knowledge, Project Configuration, Gate state, Workbench custody, or protected refs. Runtime Plugins and Run Processes receive no such capability. Project Server alone validates Run Receipt against the exact producer attempt, Assignment, or Check invocation and decides Candidate admission or further action.

Runtime public contracts live at `src/runtime/index.ts` and publish as `@nunomoura/codewiki/runtime`. Core domains import only neutral `src/runtime/contracts.ts`; concrete DSH, Pi, delegate, process, and sandbox implementations remain outer adapters. Runtime is the only unqualified CodeWiki architecture term named Runtime. Upstream names such as `DSH RuntimeContext` remain explicitly DSH-qualified implementation details.
