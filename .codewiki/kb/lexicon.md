---
okf_version: "0.2"
type: Lexicon
title: CodeWiki Lexicon
description: Active vocabulary for CodeWiki desired state, public contracts, and cross-boundary project explanations.
status: stable
tags: [system, vocabulary]
---
# CodeWiki Lexicon

| Term | Definition | Owner |
| --- | --- | --- |
| Accountability closure | Condition where one accepted transition can identify its exact prior state, proposed state, producer and custody, judged subject, Checks and Evidence, authority, applied effects, and resulting state without requiring a record of every incidental activity. | [Project Runtime](system/components/runtime.md) |
| Actor | Accountable authenticated principal, either a User or service, whose identity remains separate from Client, Stage Producer, Implementation Worker, Agent Runner, delegated harness, and model identity. | [Project Runtime](system/components/runtime.md) |
| Actor Profile | Non-authoritative description of disciplines, skills, components, interests, contribution preferences, and availability used only to suggest fit. | [Project Runtime](system/components/runtime.md) |
| Agent Run Supervisor | CodeWiki Backend component that owns one logical Backend Agent Run lifecycle across its Runner process lifecycle: it submits the immutable Run Specification, authenticates and binds the exact Runner, sequences events and cancellation, proves quiescence and process exit, and records the custody-scoped receipt without owning project meaning or lifecycle authority. | [Backend Execution](system/components/execution.md) |
| Alignment | Condition where relevant desired and executable state is resolved, bound to active Change, or explicitly unknown. | [Alignment](system/components/alignment.md) |
| Alignment Graph | Disposable snapshot-bound projection of relationships, impact, and provenance. | [Alignment](system/components/alignment.md) |
| Approval | Authenticated acceptance of one exact policy-scoped subject that implies no other approval. | [Project Runtime](system/components/runtime.md) |
| Assignment | Exact Runtime binding among one accepted Work Item, one Implementation Worker, and one Workbench. | [Project Runtime](system/components/runtime.md) |
| Authority Grant | Project-controlled capability grant scoped to an Actor or team, exact subjects, policy identity, and optional validity interval. | [Project Runtime](system/components/runtime.md) |
| Backend Agent Run | DSH-native Agent Run whose prompts, Skills, tools, context, model route, budgets, session inputs, outputs, and isolation are fixed and receipted by CodeWiki Backend. | [Backend Execution](system/components/execution.md) |
| Backend Execution | CodeWiki Backend subsystem supervising Agent and Check execution through neutral ports without owning project meaning, Results, transitions, or effects. | [Backend Execution](system/components/execution.md) |
| Backend-delegated provenance | Controlled provenance for a Backend-launched delegated harness, binding exact Assignment or producer task, Workbench, process lifecycle, final output, resulting artifacts, and declared custody gaps without claiming unknown child internals. | [Backend Execution](system/components/execution.md) |
| Backend-owned provenance | Controlled provenance augmented by a complete admitted Backend Agent Run receipt and exact CodeWiki-controlled session-input ledger. | [Backend Execution](system/components/execution.md) |
| Backend Plugin | Trusted executable capability admitted by the CodeWiki Backend into an Agent Runner through a narrow CodeWiki contract; it cannot extend Runtime authority or become project policy. | [Backend Execution](system/components/execution.md) |
| Benchmark | Controlled externally-oracled comparison of the same product task without and with CodeWiki. | [Benchmarks](system/components/benchmarks.md) |
| Candidate | Immutable role-specific output proposed for one exact Stage Loop attempt. | [Decision](system/components/decision.md) |
| Candidate Manifest | Runtime-owned identity binding a Candidate to repository, base, tree, scope, custody, and provenance. | [Project Runtime](system/components/runtime.md) |
| Change | Accountable intent carrying a proposed transition from accepted state to intended state plus its durable immutable-operation dossier. | [Change Trace](system/components/change-trace.md) |
| Change Intake Material | Bounded untrusted suggestion, finding, provider issue, or external code capture that may propose or reinforce a Change. | [Change Intake](system/components/change-intake.md) |
| Change revision | Immutable semantic version of a Change's accepted meaning. | [Decision](system/components/decision.md) |
| Change Trace | Append-only typed operation history for one Change. | [Change Trace](system/components/change-trace.md) |
| Check | Composable binary or quantitative judgment that becomes one project-owned Gate boundary when registered as a top-level Pack Check. | [Checks](system/components/checks.md) |
| Check Author | Developer who builds reusable Probes and composable Checks against exact CodeWiki project snapshots. | [Checks](system/components/checks.md) |
| Check Input | Versioned bounded data supplied to one Code or Model Check for an exact stage subject. | [Checks](system/components/checks.md) |
| Check Output | Bounded Code or Model Check response containing one boolean or quantitative measurement and optional factual detail. | [Checks](system/components/checks.md) |
| Check Pack | Stage-local directory grouping project Checks for one Gate and optionally one Pack Skill for its work-producing Agent. | [Checks](system/components/checks.md) |
| Check Result | Immutable completed `passed` or `failed` outcome binding one Check, input, measurement, threshold, execution identity, and optional single failure object. | [Checks](system/components/checks.md) |
| Check Runner | Isolated Backend execution process for Code or tool-free Model Checks that returns bounded output without owning Result or Gate authority. | [Backend Execution](system/components/execution.md) |
| Check Run | One bounded execution attempt that either produces a Check Result or stops for an operational reason. | [Checks](system/components/checks.md) |
| Check SDK | Author-facing read-only primitives for Probes, composable Checks, exact project queries, diagnostics, bundling, fixtures, and replay. | [Checks](system/components/checks.md) |
| Client | Software endpoint that speaks CodeWiki Client-Server Protocol without becoming the accountable Actor or gaining Runtime authority. | [Clients](system/components/clients.md) |
| Client Integration | App, CLI, Agent-product extension, channel adapter, or other endpoint that uses CodeWiki protocol without entering Backend execution or canonical ownership. | [Clients](system/components/clients.md) |
| Code Check | Sandboxed JavaScript program returning one binary or quantitative Check Output. | [Checks](system/components/checks.md) |
| CodeWiki Agent Runner | Isolated CodeWiki Backend execution process built on an exact pinned DSH composition and denied direct canonical-state authority. | [Backend Execution](system/components/execution.md) |
| CodeWiki Backend | Standalone durable product service containing Server, per-project Runtimes, semantic owners, Agent Run Supervisor, Agent and Check Runners, and Workbench management. | [Package](system/components/package.md) |
| CodeWiki Server | Long-lived Backend protocol edge owning Client authentication, connections, pairing, transport, project routing, MCP binding, and delivery without owning project meaning. | [CodeWiki Server](system/components/server.md) |
| Compaction Checkpoint | Provenance-linked replacement of older model-visible session material by a bounded summary while exact retained execution history remains unchanged. | [Backend Execution](system/components/execution.md) |
| Controlled provenance | Candidate provenance positively proven by exact Runtime custody appropriate to that stage, including Workbench custody for Implementation. | [Project Runtime](system/components/runtime.md) |
| Contribution Routing | Read-only projection of eligible reviewers, contributors, and Implementation Workers with match reasons, coverage, unknowns, and staleness. | [Alignment](system/components/alignment.md) |
| Core Adapter | Trusted Backend implementation of repository, Workbench, persistence, transport, authentication, delivery, or another control-plane infrastructure port; it is not project-installed policy. | [Package](system/components/package.md) |
| Decision | Stage Loop that evaluates accepted intent and desired-Knowledge impact. | [Decision](system/components/decision.md) |
| DeepSeek Harness | Exact pinned DSH execution engine used inside CodeWiki Agent Runners; it owns Turn Loop mechanics but no CodeWiki lifecycle, canonical state, Check Result, or effect authority. | [Backend Execution](system/components/execution.md) |
| Default Pack | Ordinary bare-bones Pack materialized once for a stage, then editable, removable, and never restored automatically. | [Checks](system/components/checks.md) |
| Delegated Agent Run | Backend-launched Claude Code, Codex, ACP, or future harness run for which CodeWiki owns dispatch and admitted artifacts while the child harness owns its inner Turn Loop. | [Backend Execution](system/components/execution.md) |
| Delivery effect | Separately authorized change to a protected delivery boundary. | [Project Runtime](system/components/runtime.md) |
| Development stage | User-facing Decision, Planning, Implementation, or Review stage backed by its semantic Stage Loop. | [Project Runtime](system/components/runtime.md) |
| Discovery Finding | Producer-neutral bounded report of new or out-of-scope work that carries no Check or Change authority. | [Change Intake](system/components/change-intake.md) |
| Evidence Record | Immutable metadata record for an exact observation with provenance and freshness. | [Evidence](system/components/evidence.md) |
| Execution Ledger | Append-only retained record of exact CodeWiki-controlled model-visible inputs, query activity, compaction provenance, usage, and outputs for one Backend Agent Run. | [Backend Execution](system/components/execution.md) |
| Execution Port | Neutral internal contract through which Runtime or Checks requests bounded execution without importing DSH or a delegated harness. | [Backend Execution](system/components/execution.md) |
| Execution Receipt | Immutable digest-bound account of one execution attempt's custody class, engine, model route, prompts, Skills, tools, context, queries, compaction, budgets, usage, output, and isolation, limited to facts CodeWiki can prove. | [Backend Execution](system/components/execution.md) |
| External Agent Client | Independently operated harness that calls CodeWiki through MCP and retains ownership of its own prompts, tools, local reads, models, subagents, code runtime, and memory. | [Clients](system/components/clients.md) |
| External Candidate Capture | Immutable fingerprint and retained material for observed Git state lacking exact Runtime custody. | [Project Runtime](system/components/runtime.md) |
| External-client provenance | Controlled provenance binding authenticated CodeWiki operations and any admitted Workbench custody without claiming the External Agent Client's internal execution. | [Project Runtime](system/components/runtime.md) |
| External provenance | Fail-closed Candidate provenance assigned when exact Runtime custody cannot be proven. | [Project Runtime](system/components/runtime.md) |
| Gate | Stage boundary that runs the present Check Packs for one exact subject and returns one Gate Report without selecting a route. | [Checks](system/components/checks.md) |
| Gate Report | Immutable `passed`, `failed`, or `stopped` stage outcome carrying exact Results, execution facts, warnings, and any operational stop reason. | [Checks](system/components/checks.md) |
| Implementation | Stage Loop that realizes accepted Planning obligations in source, tests, and Integration. | [Implementation](system/components/implementation.md) |
| Improvement Assessment | Explicit deliberate process for producing Discovery Findings outside failed-Check feedback. | [Change Intake](system/components/change-intake.md) |
| Integration | Runtime-owned combination and admission of isolated realization into one exact Candidate tree. | [Project Runtime](system/components/runtime.md) |
| Knowledge | Accepted desired Product, System, and Design state stored as an OKF bundle. | [Knowledge](system/components/knowledge.md) |
| Model Check | Tool-free isolated model run over exact bounded input through a separately configured Check model route. | [Checks](system/components/checks.md) |
| Model Provider | Local or remote inference supplier used by a Stage Producer, Implementation Worker, or Model Check; it owns no Stage Loop, tools, Workbench, Candidate, Check Result, or authority. | [Backend Execution](system/components/execution.md) |
| Outcome Diagnostics | Post-Gate bounded analysis of repeated outcomes that may propose ordinary Change Intake Material for Skills, Checks, context APIs, routes, or configuration without mutating them. | [Change Intake](system/components/change-intake.md) |
| Pack Skill | Optional Agent Skill contained by one Check Pack and supplied only to work-producing Agents for that stage. | [Checks](system/components/checks.md) |
| Pairing | Durable Server enrollment of one Client installation for one Actor; it grants connection eligibility, not project authority. | [CodeWiki Server](system/components/server.md) |
| Planning | Stage Loop that turns approved Decision into ordered immutable realization obligations. | [Planning](system/components/planning.md) |
| Probe | Reusable Check SDK function that returns bounded snapshot-bound facts with provenance and coverage without deciding pass or fail. | [Checks](system/components/checks.md) |
| Project Runtime | Sole authoritative semantic control plane for one governed project. | [Project Runtime](system/components/runtime.md) |
| Review | Stage Loop that applies exact-head delivery standards after Implementation and returns failed feedback to Implementation until Review passes or stops. | [Review](system/components/review.md) |
| Review Claim | Current responsibility for one exact Review Requirement and Change revision; it is not approval. | [Change Trace](system/components/change-trace.md) |
| Review Requirement | Policy-bound review class, scope, minimum approvals, and independence rule for one exact Change revision. | [Change Trace](system/components/change-trace.md) |
| Review Submission | Immutable authenticated disposition and rationale for one exact Review Requirement and Change revision. | [Change Trace](system/components/change-trace.md) |
| Run Specification | Immutable Backend request binding one exact producer attempt, Assignment, or Model Check to context, Skills, tools, routes, budgets, cancellation, isolation, and expected receipt obligations. | [Backend Execution](system/components/execution.md) |
| Runner Bundle | Content-addressed complete Agent Runner execution closure whose manifest, exact artifact bytes, protocol, Node version, DSH source and package closure, Backend Plugins, adapters, and qualification Evidence are retained and bound to every Run. | [Backend Execution](system/components/execution.md) |
| Session | Temporary authenticated Client connection owned by Server and distinct from durable Pairing. | [CodeWiki Server](system/components/server.md) |
| Source ownership | Component-declared intended boundary for source and test realization. | [Knowledge](system/components/knowledge.md) |
| Stage Context | Immutable lazy query facade over exact WorkState, Knowledge, Alignment, repository, Change, Evidence, and Result snapshots for one stage subject. | [Backend Execution](system/components/execution.md) |
| Stage Loop | One of Decision, Planning, Implementation, or Review and no other CodeWiki capability. | [Project Runtime](system/components/runtime.md) |
| Stage Producer | Agent or deterministic service that proposes one Decision, Planning, Implementation, or Review Candidate without owning Gate judgment or lifecycle authority. | [Backend Execution](system/components/execution.md) |
| Stopped Gate | Gate attempt that produced no valid complete outcome because execution, capability, input, budget, cancellation, or freshness failed operationally. | [Checks](system/components/checks.md) |
| Turn Loop | Harness-owned model-request, tool-execution, and continuation cycle inside one Agent Run; it owns no CodeWiki Stage Loop transition. | [Backend Execution](system/components/execution.md) |
| User | Human operating CodeWiki through a User Interface. | [Clients](system/components/clients.md) |
| User Interface | Human-facing surface implemented by a Client; headless Clients have none. | [Clients](system/components/clients.md) |
| User Standard | Project expectation expressed directly as one or more editable Checks. | [Checks](system/components/checks.md) |
| Work Item | Immutable Planning obligation eligible for isolated Implementation work. | [Planning](system/components/planning.md) |
| Workbench | Runtime-owned isolated repository and command environment for one exact Assignment. | [Project Runtime](system/components/runtime.md) |
| Worker | Implementation Worker: Agent, process, or service executing one accepted Work Item through one bounded Assignment in one Runtime-owned Workbench. | [Backend Execution](system/components/execution.md) |
| Worker Offer | Bounded Implementation Worker capabilities, tools, model-route labels, availability, concurrency, custody class, ownership, and allowed projects. | [Backend Execution](system/components/execution.md) |
| WorkState | Deterministic current-state projection used for guards, stage context, scheduling, and state-aware rehydration. | [WorkState](system/components/work-state.md) |
