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
| Actor | Accountable authenticated principal, either a User or service, whose identity remains separate from Client and Worker identity. | [Project Runtime](system/components/runtime.md) |
| Actor Profile | Non-authoritative description of disciplines, skills, components, interests, contribution preferences, and availability used only to suggest fit. | [Project Runtime](system/components/runtime.md) |
| Alignment | Condition where relevant desired and executable state is resolved, bound to active Change, or explicitly unknown. | [Alignment](system/components/alignment.md) |
| Alignment Graph | Disposable snapshot-bound projection of relationships, impact, and provenance. | [Alignment](system/components/alignment.md) |
| Approval | Authenticated acceptance of one exact policy-scoped subject that implies no other approval. | [Project Runtime](system/components/runtime.md) |
| Assignment | Exact Runtime binding among one Work Item, one Worker, and one Workbench. | [Project Runtime](system/components/runtime.md) |
| Authority Grant | Project-controlled capability grant scoped to an actor or team, exact subjects, policy identity, and optional validity interval. | [Project Runtime](system/components/runtime.md) |
| Benchmark | Controlled externally-oracled comparison of the same product task without and with CodeWiki. | [Benchmarks](system/components/benchmarks.md) |
| Candidate | Immutable role-specific output proposed for one exact Loop attempt. | [Decision](system/components/decision.md) |
| Candidate Manifest | Runtime-owned identity binding a Candidate to repository, base, tree, scope, custody, and provenance. | [Project Runtime](system/components/runtime.md) |
| Change | Accountable intent and durable dossier represented by immutable operations. | [Change Trace](system/components/change-trace.md) |
| Change Intake Material | Bounded untrusted suggestion, finding, provider issue, or external code capture that may propose or reinforce a Change. | [Change Intake](system/components/change-intake.md) |
| Change revision | Immutable semantic version of a Change's accepted meaning. | [Decision](system/components/decision.md) |
| Change Trace | Append-only typed operation history for one Change. | [Change Trace](system/components/change-trace.md) |
| Check | Composable binary or quantitative judgment that becomes one project-owned Gate boundary when registered as a top-level Pack Check. | [Checks](system/components/checks.md) |
| Check Author | Developer who builds reusable Probes and composable Checks against exact CodeWiki project snapshots. | [Checks](system/components/checks.md) |
| Check Input | Versioned bounded data supplied to one Code or Model Check for an exact stage subject. | [Checks](system/components/checks.md) |
| Check Output | Bounded Code or Model Check response containing one boolean or quantitative measurement and optional factual detail. | [Checks](system/components/checks.md) |
| Check Pack | Stage-local directory grouping project Checks for one Gate and optionally one Pack Skill for its work-producing Agent. | [Checks](system/components/checks.md) |
| Check Result | Immutable completed `passed` or `failed` outcome binding one Check, input, measurement, threshold, execution identity, and optional single failure object. | [Checks](system/components/checks.md) |
| Check SDK | Author-facing read-only primitives for Probes, composable Checks, exact project queries, diagnostics, bundling, fixtures, and replay. | [Checks](system/components/checks.md) |
| Check Run | One bounded execution attempt that either produces a Check Result or stops for an operational reason. | [Checks](system/components/checks.md) |
| Client | Software endpoint that speaks CodeWiki Client-Server Protocol without becoming the accountable actor or gaining Runtime authority. | [Clients](system/components/clients.md) |
| Code Check | Sandboxed JavaScript program returning one binary or quantitative Check Output. | [Checks](system/components/checks.md) |
| CodeWiki Server | Long-lived protocol edge owning Client authentication, connections, pairing, transport, project routing, and delivery without owning project meaning. | [CodeWiki Server](system/components/server.md) |
| Controlled provenance | Candidate provenance positively proven by an exact Runtime Candidate Manifest and persisted Workbench custody. | [Project Runtime](system/components/runtime.md) |
| Contribution Routing | Read-only projection of eligible reviewers, contributors, and Workers with match reasons, coverage, unknowns, and staleness. | [Alignment](system/components/alignment.md) |
| Decision | Loop that evaluates accepted intent and desired-Knowledge impact. | [Decision](system/components/decision.md) |
| Default Pack | Ordinary bare-bones Pack materialized once for a stage, then editable, removable, and never restored automatically. | [Checks](system/components/checks.md) |
| Delivery effect | Separately authorized change to a protected delivery boundary. | [Project Runtime](system/components/runtime.md) |
| Development stage | User-facing Decision, Planning, Implementation, or Review stage backed by its semantic Loop. | [Project Runtime](system/components/runtime.md) |
| Discovery Finding | Producer-neutral bounded report of new or out-of-scope work that carries no Check or Change authority. | [Change Intake](system/components/change-intake.md) |
| Evidence Record | Immutable metadata record for an exact observation with provenance and freshness. | [Evidence](system/components/evidence.md) |
| Execution Port | Neutral internal contract through which Runtime or Checks requests bounded execution without importing Pi. | [Managed Execution](system/components/execution.md) |
| External Candidate Capture | Immutable fingerprint and retained material for observed Git state lacking exact Runtime custody. | [Project Runtime](system/components/runtime.md) |
| External provenance | Fail-closed Candidate provenance assigned when exact Runtime custody cannot be proven. | [Project Runtime](system/components/runtime.md) |
| Gate | Stage boundary that runs the present Check Packs for one exact subject and returns one Gate Report without selecting a route. | [Checks](system/components/checks.md) |
| Gate Report | Immutable `passed`, `failed`, or `stopped` stage outcome carrying exact Results, execution facts, warnings, and any operational stop reason. | [Checks](system/components/checks.md) |
| Implementation | Loop that realizes accepted Planning obligations in source, tests, and Integration. | [Implementation](system/components/implementation.md) |
| Improvement Assessment | Explicit deliberate process for producing Discovery Findings outside failed-Check feedback. | [Change Intake](system/components/change-intake.md) |
| Integration | Runtime-owned combination and admission of isolated realization into one exact Candidate tree. | [Project Runtime](system/components/runtime.md) |
| Knowledge | Accepted desired Product, System, and Design state stored as an OKF bundle. | [Knowledge](system/components/knowledge.md) |
| Loop | One of Decision, Planning, Implementation, or Review and no other CodeWiki capability. | [Project Runtime](system/components/runtime.md) |
| Managed Execution | Runtime-controlled execution through pinned isolated Pi SDK sessions with complete receipts. | [Managed Execution](system/components/execution.md) |
| Managed provenance | Controlled provenance augmented by a complete admitted Managed Execution receipt. | [Managed Execution](system/components/execution.md) |
| MCP-mediated provenance | Controlled provenance binding admitted MCP Worker operations and Workbench custody without claiming complete external agent-loop custody. | [Project Runtime](system/components/runtime.md) |
| Model Check | Tool-free isolated model run over exact bounded input through a separately configured Check model route. | [Checks](system/components/checks.md) |
| Model Provider | Local or remote inference supplier used by a Worker or Model Check; it does not own the Loop, tools, Workbench, Candidate, Check Result, or authority. | [Managed Execution](system/components/execution.md) |
| Pack Skill | Optional Agent Skill contained by one Check Pack and supplied only to work-producing Agents for that stage. | [Checks](system/components/checks.md) |
| Pairing | Durable Server enrollment of one Client installation for one Actor; it grants connection eligibility, not project authority. | [CodeWiki Server](system/components/server.md) |
| Planning | Loop that turns approved Decision into ordered immutable realization obligations. | [Planning](system/components/planning.md) |
| Probe | Reusable Check SDK function that returns bounded snapshot-bound facts with provenance and coverage without deciding pass or fail. | [Checks](system/components/checks.md) |
| Project Runtime | Sole authoritative semantic control plane for one managed project. | [Project Runtime](system/components/runtime.md) |
| Review | Loop that applies exact-head delivery standards after Implementation and returns failed feedback to Implementation until Review passes or stops. | [Review](system/components/review.md) |
| Review Claim | Current responsibility for one exact Review Requirement and Change revision; it is not approval. | [Change Trace](system/components/change-trace.md) |
| Review Requirement | Policy-bound review class, scope, minimum approvals, and independence rule for one exact Change revision. | [Change Trace](system/components/change-trace.md) |
| Review Submission | Immutable authenticated disposition and rationale for one exact Review Requirement and Change revision. | [Change Trace](system/components/change-trace.md) |
| Session | Temporary authenticated Client connection owned by Server and distinct from durable Pairing. | [CodeWiki Server](system/components/server.md) |
| Source ownership | Component-declared intended boundary for source and test realization. | [Knowledge](system/components/knowledge.md) |
| Stopped Gate | Gate attempt that produced no valid complete outcome because execution, capability, input, budget, cancellation, or freshness failed operationally. | [Checks](system/components/checks.md) |
| User | Human operating CodeWiki through a User Interface. | [Clients](system/components/clients.md) |
| User Interface | Human-facing surface implemented by a Client; headless Clients have none. | [Clients](system/components/clients.md) |
| User Standard | Project expectation expressed directly as one or more editable Checks. | [Checks](system/components/checks.md) |
| Work Item | Immutable Planning obligation eligible for isolated Implementation work. | [Planning](system/components/planning.md) |
| Workbench | Runtime-owned isolated repository and command environment for one exact Assignment. | [Project Runtime](system/components/runtime.md) |
| Worker | Agent, process, or service executing one bounded Assignment; physical machine placement remains metadata until fleet scheduling requires a Worker Node concept. | [Managed Execution](system/components/execution.md) |
| Worker Offer | Bounded Worker capabilities, tools, model-route labels, availability, concurrency, ownership, and allowed projects. | [Managed Execution](system/components/execution.md) |
| WorkState | Deterministic current-state projection used for guards and scheduling. | [WorkState](system/components/work-state.md) |
