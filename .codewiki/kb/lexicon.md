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
| CodeWiki | Complete product containing Project Servers, Clients, shared package assets, and release-managed Runtime Builds. | [Package](system/components/package.md) |
| Project Server | Sole authoritative long-lived owner for one governed project: transport, AuthN, project AuthZ, canonical state, Stage Loops, Checks, Workbenches, transitions, effects, and its subordinate Runtime. | [Project Server](system/components/project-server.md) |
| Runtime | Project Server-owned execution subsystem that accepts immutable Run Requests, executes bounded Runs, controls Run Processes, and creates Run Receipts without project, Check Result, Gate, transition, or effect authority. | [Runtime](system/components/runtime.md) |
| Run | One bounded execution attempt for a Stage Producer, Implementation Worker, Check, or delegated harness under one immutable Run Request. | [Runtime](system/components/runtime.md) |
| Run Request | Immutable Project Server request binding one Run to exact role, stage, subject, context, Skills, tools, model route, workspace, budgets, deadline, session, custody, and Runtime Build. | [Runtime](system/components/runtime.md) |
| Run Process | Isolated OS process controlled by Runtime for one Run and denied canonical project authority. | [Runtime](system/components/runtime.md) |
| Run Port | Neutral internal contract through which Project Server or Checks requests bounded execution without importing DSH or a delegated harness. | [Runtime](system/components/runtime.md) |
| Run Receipt | Immutable CodeWiki-authored digest-bound account of one Run, limited to exact request, custody, Runtime Build, inputs, output, logs, usage, cancellation, quiescence, process exit, and gaps CodeWiki can prove. | [Runtime](system/components/runtime.md) |
| Runtime Build | Content-addressed immutable executable closure containing the CodeWiki DSH Adapter, exact artifact bytes, protocol, Node version, DSH and Cordis closure, Runtime Plugins, model/delegate adapters, and qualification Evidence. | [Runtime](system/components/runtime.md) |
| Runtime Plugin | First-party trusted capability admitted into a Run Process through the CodeWiki DSH Adapter; it cannot extend Project Server authority or become project policy. | [Runtime](system/components/runtime.md) |
| DSH Adapter | CodeWiki-owned translation layer inside a Run Process that maps one Run Request to exact DSH setup and maps DSH events and output back to Runtime facts. | [Runtime](system/components/runtime.md) |
| DSH AgentLoop | Upstream DSH model-request, tool-execution, streaming, and continuation mechanism used inside a model-driven Run. | [Runtime](system/components/runtime.md) |
| DSH Agent Session | Isolated persistent DSH conversation and event state for one logical Decision, Planning, Work Unit Implementation, Review, or single Model Check continuity; producer Sessions may span several bounded Runs. | [Runtime](system/components/runtime.md) |
| DeepSeek Harness | Exact pinned upstream execution library used through the CodeWiki DSH Adapter inside Run Processes; it owns AgentLoop mechanics but no CodeWiki lifecycle or authority. | [Runtime](system/components/runtime.md) |
| Client Session | Temporary authenticated Client connection owned by Project Server and distinct from durable Pairing and DSH Agent Session. | [Project Server](system/components/project-server.md) |
| Check Run Process | Runtime-controlled isolated process for a Code Check or tool-free Model Check; it reports bounded facts without owning Check Result or Gate authority. | [Runtime](system/components/runtime.md) |
| Accountability closure | Condition where one accepted transition can identify its exact prior state, proposed state, producer and custody, judged subject, Checks and Evidence, authority, applied effects, and resulting state without requiring a record of every incidental activity. | [Project Server](system/components/project-server.md) |
| Actor | Accountable authenticated principal, either a User or service, whose identity remains separate from Client, Stage Producer, Implementation Worker, Run Process, delegated harness, and model identity. | [Project Server](system/components/project-server.md) |
| Actor Profile | Non-authoritative description of disciplines, skills, components, interests, contribution preferences, and availability used only to suggest fit. | [Project Server](system/components/project-server.md) |
| Alignment | Condition where relevant desired and executable state is resolved, bound to active Change, or explicitly unknown. | [Alignment](system/components/alignment.md) |
| Alignment Graph | Disposable snapshot-bound projection of relationships, impact, and provenance. | [Alignment](system/components/alignment.md) |
| Approval | Authenticated acceptance of one exact policy-scoped subject that implies no other approval. | [Project Server](system/components/project-server.md) |
| Assignment | Exact Project Server binding among one accepted Work Unit, one Implementation Worker, and one Workbench. | [Project Server](system/components/project-server.md) |
| Authority Grant | Project-controlled capability grant scoped to an Actor or team, exact subjects, policy identity, and optional validity interval. | [Project Server](system/components/project-server.md) |
| Backend-delegated provenance | Controlled provenance for a CodeWiki-launched delegated harness, binding exact Assignment or producer task, Workbench, process lifecycle, final output, resulting artifacts, and declared custody gaps without claiming unknown child internals. | [Runtime](system/components/runtime.md) |
| Backend-owned provenance | Controlled provenance augmented by a complete admitted Run receipt and exact CodeWiki-controlled session-input ledger. | [Runtime](system/components/runtime.md) |
| Benchmark | Controlled externally-oracled comparison of the same product task without and with CodeWiki. | [Benchmarks](system/components/benchmarks.md) |
| Candidate | Immutable role-specific proposal with exactly one producing Run; Work Unit Candidates qualify local realization while Review binds the exact aggregate Change lineage. | [Decision](system/components/decision.md) |
| Candidate Manifest | Project Server-owned identity binding a Candidate to repository, base, tree, scope, custody, and provenance. | [Project Server](system/components/project-server.md) |
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
| Check Run | One bounded execution attempt that either produces a Check Result or stops for an operational reason. | [Checks](system/components/checks.md) |
| Check SDK | Author-facing read-only primitives for Probes, composable Checks, exact project queries, diagnostics, bundling, fixtures, and replay. | [Checks](system/components/checks.md) |
| Client | Software endpoint that speaks CodeWiki Client-Project Server Protocol without becoming the accountable Actor or gaining Project Server authority. | [Clients](system/components/clients.md) |
| Client Integration | App, CLI, Agent-product extension, channel adapter, or other endpoint that uses CodeWiki protocol without entering Runtime execution or canonical ownership. | [Clients](system/components/clients.md) |
| Code Check | Sandboxed JavaScript program returning one binary or quantitative Check Output. | [Checks](system/components/checks.md) |
| Compaction Checkpoint | Provenance-linked replacement of older model-visible session material by a bounded summary while exact retained execution history remains unchanged. | [Runtime](system/components/runtime.md) |
| Controlled provenance | Candidate provenance positively proven by exact Project Server custody appropriate to that stage, including Workbench custody for Implementation. | [Project Server](system/components/project-server.md) |
| Contribution Routing | Read-only projection of eligible reviewers, contributors, and Implementation Workers with match reasons, coverage, unknowns, and staleness. | [Alignment](system/components/alignment.md) |
| Core Adapter | Trusted CodeWiki implementation of repository, Workbench, persistence, transport, authentication, delivery, or another control-plane infrastructure port; it is not project-installed policy. | [Package](system/components/package.md) |
| Decision | Stage Loop that evaluates accepted intent and desired-Knowledge impact. | [Decision](system/components/decision.md) |
| Default Pack | Ordinary bare-bones Pack materialized once for a stage, then editable, removable, and never restored automatically. | [Checks](system/components/checks.md) |
| Delegated Run | CodeWiki-launched Claude Code, Codex, ACP, or future harness run for which CodeWiki owns dispatch and admitted artifacts while the child harness owns its inner Turn Loop. | [Runtime](system/components/runtime.md) |
| Delivery effect | Separately authorized change to a protected delivery boundary. | [Project Server](system/components/project-server.md) |
| Development stage | User-facing Decision, Planning, Implementation, or Review stage backed by its semantic Stage Loop. | [Project Server](system/components/project-server.md) |
| Discovery Finding | Producer-neutral bounded report of new or out-of-scope work that carries no Check or Change authority. | [Change Intake](system/components/change-intake.md) |
| Evidence Record | Immutable metadata record for an exact observation with provenance and freshness. | [Evidence](system/components/evidence.md) |
| Execution Ledger | Append-only retained record of exact CodeWiki-controlled model-visible inputs, query activity, compaction provenance, usage, and outputs for one Run. | [Runtime](system/components/runtime.md) |
| External Agent Client | Independently operated harness that calls CodeWiki through MCP and retains ownership of its own prompts, tools, local reads, models, subagents, code runtime, and memory. | [Clients](system/components/clients.md) |
| External Candidate Capture | Immutable fingerprint and retained material for observed Git state lacking exact Project Server custody. | [Project Server](system/components/project-server.md) |
| External-client provenance | Controlled provenance binding authenticated CodeWiki operations and any admitted Workbench custody without claiming the External Agent Client's internal execution. | [Project Server](system/components/project-server.md) |
| External provenance | Fail-closed Candidate provenance assigned when exact Project Server custody cannot be proven. | [Project Server](system/components/project-server.md) |
| Gate | Boundary that runs one resolved stage-wide Check Pack policy over one exact Candidate and frozen Gate Evaluation Package, returning one Gate Report without selecting a route. | [Checks](system/components/checks.md) |
| Gate Report | Immutable `passed`, `failed`, or `stopped` stage outcome carrying exact Results, execution facts, warnings, and any operational stop reason. | [Checks](system/components/checks.md) |
| Implementation | Stage Loop that realizes accepted Planning obligations in source, tests, and Integration. | [Implementation](system/components/implementation.md) |
| Improvement Assessment | Explicit deliberate process for producing Discovery Findings outside failed-Check feedback. | [Change Intake](system/components/change-intake.md) |
| Integration | Project Server-owned expected-head-safe admission of passing Work Unit Candidates into one private Change lineage whose aggregate head becomes Review subject. | [Project Server](system/components/project-server.md) |
| Knowledge | Accepted desired Product, System, and Design state stored as an OKF bundle. | [Knowledge](system/components/knowledge.md) |
| Model Check | Tool-free isolated model run over exact bounded input through a separately configured Check model route. | [Checks](system/components/checks.md) |
| Model Provider | Local or remote inference supplier used by a Stage Producer, Implementation Worker, or Model Check; it owns no Stage Loop, tools, Workbench, Candidate, Check Result, or authority. | [Runtime](system/components/runtime.md) |
| Outcome Diagnostics | Post-Gate bounded analysis of repeated outcomes that may propose ordinary Change Intake Material for Skills, Checks, context APIs, routes, or configuration without mutating them. | [Change Intake](system/components/change-intake.md) |
| Pack Skill | Optional Agent Skill contained by one Check Pack and supplied only to work-producing Agents for that stage. | [Checks](system/components/checks.md) |
| Pairing | Durable Project Server enrollment of one Client installation for one Actor; it grants connection eligibility, not project authority. | [Project Server](system/components/project-server.md) |
| Planning | Change-scoped Stage Loop that turns one ratified Change into an immutable Work Graph delta without regenerating a global plan. | [Planning](system/components/planning.md) |
| Probe | Reusable Check SDK function that returns bounded snapshot-bound facts with provenance and coverage without deciding pass or fail. | [Checks](system/components/checks.md) |
| Review | Independent Change-scoped Stage Loop that judges the exact aggregate integrated Work Unit lineage against complete acceptance and delivery standards. | [Review](system/components/review.md) |
| Review Claim | Current responsibility for one exact Review Requirement and Change revision; it is not approval. | [Change Trace](system/components/change-trace.md) |
| Review Requirement | Policy-bound review class, scope, minimum approvals, and independence rule for one exact Change revision. | [Change Trace](system/components/change-trace.md) |
| Review Submission | Immutable authenticated disposition and rationale for one exact Review Requirement and Change revision. | [Change Trace](system/components/change-trace.md) |
| Source ownership | Component-declared intended boundary for source and test realization. | [Knowledge](system/components/knowledge.md) |
| Project Material Generation | Immutable content-addressed locally queryable producer substrate built by Project Server from exact WorkState, Knowledge, Alignment, repository, Change, Evidence, and Result snapshots; it may refresh only at controlled boundaries. | [Runtime](system/components/runtime.md) |
| Gate Evaluation Package | Immutable Candidate-checkpoint package containing only declared exact Check and Gate inputs; it is separate from producer material and provides no live Project Server handle. | [Checks](system/components/checks.md) |
| Stage Loop | One of Decision, Planning, Implementation, or Review and no other CodeWiki capability. | [Project Server](system/components/project-server.md) |
| Stage Producer | Agent or deterministic service that proposes one Decision, Planning, Implementation, or Review Candidate without owning Gate judgment or lifecycle authority. | [Runtime](system/components/runtime.md) |
| Stopped Gate | Gate attempt that produced no valid complete outcome because execution, capability, input, budget, cancellation, or freshness failed operationally. | [Checks](system/components/checks.md) |
| Turn Loop | Harness-owned model-request, tool-execution, and continuation cycle inside one Run; it owns no CodeWiki Stage Loop transition. | [Runtime](system/components/runtime.md) |
| User | Human operating CodeWiki through a User Interface. | [Clients](system/components/clients.md) |
| User Interface | Human-facing surface implemented by a Client; headless Clients have none. | [Clients](system/components/clients.md) |
| User Standard | Project expectation expressed directly as one or more editable Checks. | [Checks](system/components/checks.md) |
| Work Graph | Canonical Project Server-owned dependency graph formed from accepted immutable Change-scoped Planning deltas and current Work Unit state. | [Planning](system/components/planning.md) |
| Work Unit | Immutable singly owned Planning obligation with independently judgeable outcome, acceptance slice, dependencies, scope, resource requirements, and verification. | [Planning](system/components/planning.md) |
| Workbench | Project Server-owned isolated repository and command environment for one exact Assignment. | [Project Server](system/components/project-server.md) |
| Worker | Implementation Worker: Agent, process, or service executing one accepted Work Unit through one bounded Assignment in one Project Server-owned Workbench. | [Runtime](system/components/runtime.md) |
| Worker Offer | Bounded Implementation Worker capabilities, tools, model-route labels, availability, concurrency, custody class, ownership, and allowed projects. | [Runtime](system/components/runtime.md) |
| WorkState | Deterministic current-state projection used for guards, Work Graph readiness, material construction, integration completion, and state-aware rehydration. | [WorkState](system/components/work-state.md) |
