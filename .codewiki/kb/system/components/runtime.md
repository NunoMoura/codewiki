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
    rationale: Runtime delivers exact lazy Stage Context and receipt-bound DSH compaction.
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

One Run Request binds exact role, stage, subject, custody, Runtime Build, Agent Session, Stage Context and static inputs, prompts, Pack Skills, admitted tools, model route, repository snapshot or Implementation Workbench, budgets, creation time, and deadline. Runtime validates and freezes the request before accepting it. Project Server remains responsible for deciding why the Run exists and what may follow it.

Runtime owns one logical Run lifecycle across its OS process lifecycle: acceptance, authenticated process binding, ordered events, cancellation, deadline enforcement, quiescence, process-exit proof, forced termination, raw-log reference, and final Run Receipt. A Run Process Manager handles shell-free spawn, private pipes, empty ambient environment, bounded frames, exit observation, and termination as internal plumbing rather than a separate product component.

A Run Process sends one authenticated terminal result after its final ordered event and before quiescence. The result reports bounded execution facts but is not a receipt and grants no authority. A Run Receipt is issued only by Runtime after validating the request binding, terminal result, observed events, custody, logs, ledger, quiescence, and process exit. `completed` means the declared output and required execution facts are present. Missing terminal result, raw log, Execution Ledger, quiescence, or process-exit proof prevents a completed receipt; Runtime never fabricates completion. Backend-delegated custody records visibility gaps honestly.

Run failure cannot mutate accepted project state. Runtime returns a bounded stopped receipt or operational fact; Project Server decides whether to retry from canonical state, resume the exact Agent Session, or stop the Stage Loop attempt.

## Runtime Builds

A Runtime Build is the immutable content-addressed execution closure for DSH-backed Runs. Its manifest binds Run protocol, Node version, reviewed DSH source commit, executed DSH and Cordis package closures, Runtime Plugins, model and delegate adapters, and executable artifact bytes. Reviewed source provenance and executed package closure remain independent facts unless an upstream attestation proves equivalence.

Qualification supplies exact suite and Evidence digests. Runtime stores qualified builds and artifact bytes in a private canonical registry. Expected-generation compare-and-swap selects one active build for new Runs. A Run Request permanently binds one build digest and protocol version. New activation never changes an existing Run; exact Agent Session resume requires the original retained build. Missing, altered, unqualified, protocol-incompatible, or Node-incompatible artifacts stop execution without fallback. Rollback changes only the active build for future Runs.

There is no user-facing build selector, Pi fallback, or permanent multi-engine mode. The temporary Pi implementation remains migration evidence under `src/runtime/pi/**` until the DSH path proves semantic parity, then it is deleted.

## DSH Adapter

The CodeWiki-owned DSH Adapter lives inside each DSH-backed Run Process. It translates Run Request into exact DSH Agent construction and scoped setup, then translates DSH events and terminal output into Runtime-observed facts. DSH remains unmodified upstream package code.

Runtime adopts DSH's standard AgentLoop for model request, streaming, tool call/result pairing, continuation, cancellation convergence, Agent Session events, compaction mechanics, provider transport, and delegated child-process plumbing. CodeWiki owns exact prompts, Skills, tools, Stage Context bindings, routes, secret references, budgets, compaction policy, observations, and receipt obligations.

The production composition disables ambient profiles, user settings and patches, filesystem Skill discovery, workspace instructions, dynamic Cordis plugins, creation mode, DSH UI and Host API, product MCP client, and DSH workflow/goal/task drivers. DSH never selects a CodeWiki stage, retry, transition, Check Result, Gate outcome, or effect. Runtime Build qualification may substitute a fixed digest-bound replay model adapter to prove the complete process path without provider network access; replay is qualification evidence, not a user-selectable execution backend or fallback.

Each Runtime Plugin contributes one first-party allowlisted capability through the DSH Adapter: tool, context binding, Skill provider, model/delegate adapter, observer, or compaction policy. Project files install no executable Runtime Plugins. Effective capability is the intersection of CodeWiki release ceiling, Project Server authorization, Run Request, and any narrower Skill declaration.

## Run kinds and isolation

A model-driven producer, Implementation Worker, Review producer, or Model Check receives a separate DSH Agent and Agent Session. A Stage Loop may issue several Runs across failed attempts, but no DSH AgentLoop owns the surrounding Stage Loop. Each Model Check uses a separate tool-free Agent Session with no producer Skill, tools, memory, query facade, or fallback.

Code Checks use deterministic admitted sandboxes rather than DSH. A Run Sandbox term is reserved for enforced filesystem, network, process, environment, credential, and resource containment; an ordinary child process is called a Run Process and is not mislabeled as a security sandbox.

Only an Implementation Run may receive a writable Workbench. Project Server owns the Workbench, Assignment, base and resulting tree, command policy, and Integration. Runtime receives only the bounded capability described by the Run Request. Decision, Planning, Review, and Model Check Runs receive no writable Workbench authority.

Delegated Runs launch Claude Code, Codex, ACP, or another exact adapter. Runtime controls dispatch, admitted task and artifacts, process lifecycle, cancellation, and Workbench capability where applicable. The delegated harness owns unobserved inner prompts, settings, tools, models, and continuation; the Run Receipt declares those gaps. External Agent Clients do not execute through Runtime and retain ownership of their own pipelines.

## Context, ledger, and compaction

DSH-backed Runs receive one immutable Stage Context over exact WorkState, Knowledge, Alignment, repository, Change, Evidence, and Result snapshots. Its bundle contains only digest-bound declarative routes and canonical items, never callbacks or project handles. Direct and batch results bind deterministic order, query and snapshot digests, source refs, coverage, unknowns, truncation, cursor, engine, and staleness. No ambient fallback exists.

Tool-admitted Runs expose only fixed-digest `query_stage_context` and `query_stage_context_batch`. Both resolve the authenticated bundle; unknown routes report unknown coverage and invalid cursors fail closed. Tool-free Runs receive neither bundle nor tools.

Every CodeWiki-controlled model-visible input, query, replacement, usage record, output, and cancellation fact enters the append-only Execution Ledger. Ledger headers bind the exact Run Request, Runtime Build, Agent Session, Stage Context, static inputs, model route, tools, and Skills. Entries retain canonical payloads in contiguous sequence with payload digests and a previous-entry digest chain. Durable append requires expected-head compare-and-swap; restart recovery revalidates the complete chain rather than trusting filenames or cached state.

Raw DSH Agent Session bytes remain versioned evidence, not canonical project state. Runtime retains them by exact byte length and digest and revalidates stored bytes on every receipt read. A completed Run Receipt commits only after its exact Execution Ledger and raw log are durably present. Receipt commit is immutable, identity-keyed, atomic, and compare-and-swap guarded; recovery rejects missing, mismatched, corrupted, or misnamed evidence.

Compaction changes model-visible surface only. Each checkpoint cites replaced ranges and retains exact history; CodeWiki policy rehydrates canonical stage and project facts while DSH performs event replacement mechanics. Opaque Python or V8 heap state is never canonical or recovery-critical.

## Authority and API

Runtime cannot write Change Trace, WorkState, Knowledge, Project Configuration, Gate state, Workbench custody, or protected refs. Runtime Plugins and Run Processes receive no such capability. Project Server alone validates Run Receipt against the exact producer attempt, Assignment, or Check invocation and decides Candidate admission or further action.

Runtime public contracts live at `src/runtime/index.ts` and publish as `@nunomoura/codewiki/runtime`. Core domains import only neutral `src/runtime/contracts.ts`; concrete DSH, Pi, delegate, process, and sandbox implementations remain outer adapters. Runtime is the only unqualified CodeWiki architecture term named Runtime. Upstream names such as `DSH RuntimeContext` remain explicitly DSH-qualified implementation details.
