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
| Assisted Check Authoring | Explicit Client request for Managed Execution to propose validated Check Pack files without enforcement authority. | [Clients](system/components/clients.md) |
| Authority Grant | Project-controlled capability grant scoped to an actor or team, exact subjects, policy identity, and optional validity interval. | [Project Runtime](system/components/runtime.md) |
| Benchmark | Controlled externally-oracled comparison of the same product task without and with CodeWiki. | [Benchmarks](system/components/benchmarks.md) |
| Candidate | Immutable role-specific output proposed for one exact Loop attempt. | [Decision](system/components/decision.md) |
| Candidate Manifest | Runtime-owned identity binding a Candidate to repository, base, tree, scope, custody, and provenance. | [Project Runtime](system/components/runtime.md) |
| Change | Accountable intent and durable dossier represented by immutable operations. | [Change Trace](system/components/change-trace.md) |
| Change Intake Material | Bounded untrusted suggestion, finding, provider issue, or external code capture that may propose or reinforce a Change. | [Change Intake](system/components/change-intake.md) |
| Change revision | Immutable semantic version of a Change's accepted meaning. | [Decision](system/components/decision.md) |
| Change Trace | Append-only typed operation history for one Change. | [Change Trace](system/components/change-trace.md) |
| Check | Atomic versioned requirement evaluated for one exact Candidate. | [Verification](system/components/verification.md) |
| Check Catalog | Snapshot of installed Checks that grants no applicability or enforcement by itself. | [Verification](system/components/verification.md) |
| Check Invocation | Versioned bounded input binding one selected Check to an exact Candidate, policy, configuration, and context coverage. | [Verification](system/components/verification.md) |
| Check Observation | Bounded evaluator output from which Runtime may create one Check Result. | [Verification](system/components/verification.md) |
| Check Pack | Content-addressed group of Checks and inherited configuration installed as one project binding. | [Verification](system/components/verification.md) |
| Check Result | Immutable admitted outcome of one resolved Check against one exact Candidate. | [Verification](system/components/verification.md) |
| Client | Software endpoint that speaks CodeWiki Client-Server Protocol without becoming the accountable actor or gaining Runtime authority. | [Clients](system/components/clients.md) |
| Code Check | Arbitrary Check program executed only through an admitted isolated language adapter. | [Verification](system/components/verification.md) |
| CodeWiki Server | Long-lived protocol edge owning Client authentication, connections, pairing, transport, project routing, and delivery without owning project meaning. | [CodeWiki Server](system/components/server.md) |
| Controlled provenance | Candidate provenance positively proven by an exact Runtime Candidate Manifest and persisted Workbench custody. | [Project Runtime](system/components/runtime.md) |
| Contribution Routing | Read-only projection of eligible reviewers, contributors, and Workers with match reasons, coverage, unknowns, and staleness. | [Alignment](system/components/alignment.md) |
| Custom Check | Project-authored model or code Check represented in the same tracked format as other Checks. | [Verification](system/components/verification.md) |
| Decision | Loop that evaluates accepted intent and desired-Knowledge impact. | [Decision](system/components/decision.md) |
| Default Check | CodeWiki-provided open editable Check materialized in the project Default Check Pack. | [Verification](system/components/verification.md) |
| Delivery effect | Separately authorized change to a protected delivery boundary. | [Project Runtime](system/components/runtime.md) |
| Development stage | User-facing Decision, Planning, or Implementation stage backed by its semantic Loop. | [Project Runtime](system/components/runtime.md) |
| Discovery Finding | Producer-neutral bounded report of new or out-of-scope work that carries no Check or Change authority. | [Change Intake](system/components/change-intake.md) |
| Evidence Record | Immutable metadata record for an exact observation with provenance and freshness. | [Evidence](system/components/evidence.md) |
| Execution Port | Neutral internal contract through which Runtime requests bounded execution without importing Pi. | [Managed Execution](system/components/execution.md) |
| Exit Outcome | Immutable projection of one unchanged Exit Report, optional Repair Bundle, and bound Runtime Route reference. | [Verification](system/components/verification.md) |
| Exit Report | Immutable self-explaining verdict binding every selected Result for one exact Candidate and policy. | [Verification](system/components/verification.md) |
| External Candidate Capture | Immutable fingerprint and retained material for observed Git state lacking exact Runtime custody. | [Project Runtime](system/components/runtime.md) |
| External provenance | Fail-closed Candidate provenance assigned when exact Runtime custody cannot be proven. | [Project Runtime](system/components/runtime.md) |
| Implementation | Loop that realizes accepted Planning obligations in source, tests, and Integration. | [Implementation](system/components/implementation.md) |
| Improvement Assessment | Explicit deliberate process for producing Discovery Findings outside Candidate repair. | [Change Intake](system/components/change-intake.md) |
| Integration | Runtime-owned combination and verification of isolated realization into an exact Candidate tree. | [Project Runtime](system/components/runtime.md) |
| Knowledge | Accepted desired Product, System, and Design state stored as an OKF bundle. | [Knowledge](system/components/knowledge.md) |
| Loop | One of Decision, Planning, or Implementation and no other CodeWiki capability. | [Project Runtime](system/components/runtime.md) |
| Managed Execution | Runtime-controlled execution through pinned isolated Pi SDK sessions with complete receipts. | [Managed Execution](system/components/execution.md) |
| Managed provenance | Controlled provenance augmented by a complete admitted Managed Execution receipt. | [Managed Execution](system/components/execution.md) |
| MCP-mediated provenance | Controlled provenance binding admitted MCP Worker operations and Workbench custody without claiming complete external agent-loop custody. | [Project Runtime](system/components/runtime.md) |
| Model Check | Tool-free isolated model evaluation of one Candidate against one Check rubric and configured route. | [Verification](system/components/verification.md) |
| Model Provider | Local or remote inference supplier used by a Worker; it does not own the agent loop, tools, Workbench, Candidate, or authority. | [Managed Execution](system/components/execution.md) |
| Pairing | Durable Server enrollment of one Client installation for one Actor; it grants connection eligibility, not project authority. | [CodeWiki Server](system/components/server.md) |
| Planning | Loop that turns approved Decision into ordered immutable realization obligations. | [Planning](system/components/planning.md) |
| Project Runtime | Sole authoritative semantic control plane for one managed project. | [Project Runtime](system/components/runtime.md) |
| Repair Brief | Candidate- and report-bound bounded guidance compiled from matched profiles, Result signals, and one Repair Frontier. | [Verification](system/components/verification.md) |
| Repair Bundle | Immutable report-bound aggregate of matched Repair Profiles, Repair Frontier, Repair Brief, coverage, and guidance digests. | [Verification](system/components/verification.md) |
| Repair Frontier | Bounded snapshot-bound Alignment neighborhood relevant to actionable Results. | [Verification](system/components/verification.md) |
| Repair Profile | Sparse Check-owned mapping from outcome and finding code to zero-authority repair guidance. | [Verification](system/components/verification.md) |
| Resolved Exit Policy | Immutable Candidate-specific set of active Check bindings and reduction rules. | [Verification](system/components/verification.md) |
| Review Claim | Current responsibility for one exact Review Requirement and Change revision; it is not approval. | [Change Trace](system/components/change-trace.md) |
| Review Requirement | Policy-bound review class, scope, minimum approvals, and independence rule for one exact Change revision. | [Change Trace](system/components/change-trace.md) |
| Review Submission | Immutable authenticated disposition and rationale for one exact Review Requirement and Change revision. | [Change Trace](system/components/change-trace.md) |
| Runtime Route | Runtime-owned next action after final Exit Report and current guards. | [Project Runtime](system/components/runtime.md) |
| Session | Temporary authenticated Client connection owned by Server and distinct from durable Pairing. | [CodeWiki Server](system/components/server.md) |
| Source ownership | Component-declared intended boundary for source and test realization. | [Knowledge](system/components/knowledge.md) |
| User | Human operating CodeWiki through a User Interface. | [Clients](system/components/clients.md) |
| User Interface | Human-facing surface implemented by a Client; headless Clients have none. | [Clients](system/components/clients.md) |
| User Standard | Accepted project expectation from bounded text or exact source snapshot. | [Verification](system/components/verification.md) |
| Verification | Shared Evidence, Check, Observation, Result, Exit Report, and repair machinery for all three Loops. | [Verification](system/components/verification.md) |
| Work Item | Immutable Planning obligation eligible for isolated Implementation work. | [Planning](system/components/planning.md) |
| Workbench | Runtime-owned isolated repository and command environment for one exact Assignment. | [Project Runtime](system/components/runtime.md) |
| Worker | Agent, process, or service executing one bounded Assignment; physical machine placement remains metadata until fleet scheduling requires a Worker Node concept. | [Managed Execution](system/components/execution.md) |
| Worker Offer | Bounded Worker capabilities, tools, model-route labels, availability, concurrency, ownership, and allowed projects. | [Managed Execution](system/components/execution.md) |
| WorkState | Deterministic current-state projection used for guards and scheduling. | [WorkState](system/components/work-state.md) |
