---
type: System Component
title: Backend Execution
description: Supervises DSH-based Backend Agent Runs, delegated harnesses, and isolated Check execution without owning project policy or lifecycle authority.
status: stable
tags: [system, component]
codewiki_component: execution
codewiki_source_patterns: ["src/execution/**"]
codewiki_test_patterns: ["tests/execution/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Backend Execution supplies isolated accountable Agent work for Runtime-issued stage attempts and Implementation Assignments.
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Backend Execution supplies isolated Code and Model Check transports without Result authority.
  - type: realizes
    target: /product/stories/check-author/author-composable-checks.md
    rationale: Backend Execution supplies the immutable query context and sandbox boundary required by authored Code Checks.
  - type: realizes
    target: /product/stories/agent/retrieve-bounded-context.md
    rationale: Backend Execution delivers exact lazy stage context and receipt-bound compaction to Backend Agents.
---
# Backend Execution

Backend Execution turns validated Runtime work into bounded Agent and Check runs. Agent Supervisor submits immutable Run Specifications to isolated CodeWiki Agent Runners, observes cancellation and quiescence, and returns custody-scoped receipts. Each Runner uses one exact pinned DeepSeek Harness (DSH) composition. DSH owns generic Turn Loop, streaming, tool pairing, session events, compaction mechanics, provider transport, and child-process coordination. CodeWiki owns every Stage Loop, subject, context, Pack Skill, capability, route, budget, Workbench, Candidate, Check Result, Gate, transition, and effect.

Runners receive bounded capabilities, not canonical storage handles, and cannot directly mutate project truth, Gates, or protected refs. A crash stops execution without rewriting accepted state. Core domains import no DSH or Cordis implementation.

Stage Producers, Implementation Workers, Check executors, Clients, delegated harnesses, Runners, and Model Providers remain distinct. Only an Implementation Worker executes a Work Item in a Runtime-owned Workbench.

## Execution custody

- A **Backend Agent Run** uses DSH's native Agent under exact CodeWiki composition. CodeWiki controls all model-visible inputs, Skills, tools, context, routes, budgets, cancellation, isolation, outputs, and retained session evidence.
- A **Delegated Agent Run** launches Claude Code, Codex, ACP, or another named adapter. CodeWiki controls task, adapter, process lifecycle, Workbench, admitted artifacts, and Candidate submission. The child owns any unobserved prompts, settings, tools, model behavior, and Turn Loop; its receipt declares those gaps.
- An **External Agent Client** owns its pipeline and calls CodeWiki through MCP. CodeWiki proves only its own context, query, submission, confirmation, and admitted Workbench operations.

Delegated and external work can produce controlled Candidates when exact stage and Workbench custody match Runtime state, but never inherit Backend-owned provenance. Candidate claims cannot strengthen custody. Runtime fixes DSH delegate roster and limits. Outbound delegation complements inbound MCP.

## Stage Loops and Turn Loops

Decision, Planning, Implementation, and Review own semantic iteration from context through Candidate, Gate feedback, and transition. DSH owns model request, tool execution, continuation, cancellation convergence, and terminal response inside one Backend Agent Run; a delegated harness owns its inner Turn Loop. CodeWiki uses DSH's standard Agent implementation. Per-Agent scoped setup installs exact prompts, Skills, tools, routes, context bindings, observers, and budgets. Runtime alone decides retry or advancement; no DSH workflow, goal driver, script, or plugin selects lifecycle transitions.

## DSH capability matrix

| DSH capability | Disposition | CodeWiki boundary |
| --- | --- | --- |
| Cordis lifecycle and scoped effects | Adopt internally | Exact allowlisted Runner composition; no raw project plugin loading. |
| Agent registry, factory, scoped setup | Adopt | Supervisor owns Run Specification and identity; DSH owns construction and teardown. |
| Standard Turn Loop | Adopt | DSH owns model/tool mechanics; CodeWiki owns Stage Loops. |
| Append-only Session log and replaceable surface | Adopt as evidence | CodeWiki binds raw bytes, version, digest, location, and retention; never canonical project state. |
| Request-reconstruction invariants | Require | Every DSH upgrade passes CodeWiki custody conformance. |
| Prompt and tool assembly | Use | CodeWiki owns exact ordered bytes and schemas. |
| Skills registry | Wrap | First-party plugin supplies exact Pack Skill snapshots; filesystem discovery stays off. |
| LLM adapters, streaming, retry | Use | CodeWiki owns routes, secret references, budgets, and retry ceilings. |
| Compaction and result pruning | Wrap | One CodeWiki plugin owns state-aware policy; DSH owns event replacement mechanics. |
| Session persistence and query | Use Runner-locally | Execution evidence only; CodeWiki owns storage policy and receipt binding. |
| Native subagents | Use | CodeWiki owns Assignment, roster, depth, tools, context, custody, and Workbench. |
| Claude Code, Codex, ACP | Delegated execution | Child internals stay outside custody unless an adapter proves them. |
| Code Mode and worker threads | Use narrowly | Immutable context bindings only; worker or VM is not a security boundary. |
| Shell, filesystem, subprocess | Use as plumbing | Runtime-owned Workbench and container policy remain authoritative. |
| Approval, settings, credentials | Replace or disable | CodeWiki authority, exact config, and secret references own them. |
| Workflow, Ralph, goals, plan, task, jobs | Disable for lifecycle | WorkState, Planning, Stage Loops, and Runtime scheduling remain sole owners. |
| MCP client and product hook bridges | Off by default | Native Backend bindings serve internal Agents; Server owns external MCP. |
| Profiles, patches, HMR, dynamic Cordis, creation mode | Disable in production | Composition and upgrades are pinned, reviewed, and restart-bound. |
| DSH UI, Host API, launcher | Replace | CodeWiki App, Server, Package, and Supervisor own product lifecycle. |
| Invariants and telemetry | Diagnostics only | CodeWiki owns redaction and retention; no Gate authority. |

## Backend Plugins

A Backend Plugin contributes one narrow Runner capability: Agent tool, context binding, Skill provider, model or delegate adapter, observer, or compaction policy. Cordis stays internal. V1 ships first-party plugins only; project files install none.

A plugin cannot register stages, alter transitions, write canonical state, create Results, bypass admission, grant authority, install plugins, or mutate protected refs. Effective capability is the intersection of Backend ceiling, Runtime authorization, Run Specification, and narrower Skill declaration. Runtime remains plugin-free. Check Packs are separate project policy: Skills guide producers and Checks judge subjects through separately admitted boundaries.

## Exact runs and receipts

Each Backend Agent Run has one DSH/plugin closure, exact ordered Pack Skills, prompts, model route, tool registry, execution directory, budgets, cancellation, and disabled ambient profiles, extensions, filesystem Skills, templates, user patches, themes, workspace instructions, context files, and dynamic Cordis tools. Only an Implementation Worker receives a writable Workbench. Decision, Planning, Review, each Assignment, and each Model Check use isolated sessions; WorkState and operation identities provide cross-session continuity.

A Backend-owned receipt binds DSH and plugin versions, route and options, prompts, Skills, tools, Stage Context, query digests, Compaction Checkpoints, source events, budgets, timing, cancellation, usage, output, and isolation. Exact model-visible inputs remain in an append-only Execution Ledger; raw DSH bytes remain versioned evidence. Neither is Change Trace, Check input, Result, Gate Report, or canonical state.

A delegated receipt binds only facts CodeWiki observes: adapter and verified product version when available, task, environment/settings policy, process lifecycle, Workbench base/result, final output, optional child-trace digest, cancellation, and custody gaps. Secrets are absent from model-visible input by construction.

## Context and compaction

Backend Agents receive one immutable Stage Context over WorkState, Knowledge, Alignment, repository, Change, Evidence, and Result owners. Its baseline binds stage, subject, Change revision, repository and owner digests, Skill set, Gate feedback, coverage, and staleness. Bounded direct and batch queries have deterministic order, query and snapshot digests, source refs, coverage, unknowns, truncation, cursor, engine identity, and staleness. No live-tree fallback, ambient read, network, credentials, or unlogged context exists.

Optional `codewiki_context_run` may use DSH Code Mode only through a first-party plugin exposing that same facade. Every run is fresh, read-only, snapshot-bound, import-free, filesystem-free, network-free, process-free, environment-free, credential-free, bounded, cancellable, ledgered, and canonical-JSON-only. It cannot register tools, retain an opaque heap, or become a workflow engine; direct and batch queries remain required.

Compaction changes only model-visible surface. Stable ledger locators may replace deterministic large results before summarization. Each checkpoint cites replaced ranges and keeps a recent tail. One CodeWiki plugin rehydrates canonical stage, subject, WorkState, Knowledge, Alignment, repository, Skills, authority, and Gate feedback; summaries cover unresolved conversation only. Exactly one compaction owner operates per session. Opaque Python or V8 state is never canonical or required for recovery.

## Check execution and failure

Every Model Check uses a separate tool-free DSH session with no producer Skill, tools, memory, query facade, or fallback. Every Code Check runs in an admitted deterministic sandbox and never falls back to Runner or host execution. Its read-only SDK binding exposes only immutable Invocation snapshots; query activity is Result provenance rather than producer context or Skill-bearing cache identity.

Missing capability, timeout, cancellation, invalid output, unavailable sandbox/model/Runner, exhausted budget, failed context, crash, or receipt mismatch returns a bounded stopped fact. It never crashes Runtime, weakens policy, creates a Result, or fabricates semantic feedback. Runtime, Stage Loops, and Checks consume neutral Execution Ports and import no DSH, Cordis, or delegated-harness implementation.
