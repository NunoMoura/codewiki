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
| Agent Client | External agent application connected to Host Service through a capability-scoped protocol binding. | [Host Service](system/components/host.md) |
| Agent Host | External agent application such as Claude Code or Codex whose model loop remains outside CodeWiki custody. | [Host Service](system/components/host.md) |
| Alignment | Condition where relevant desired and executable state is resolved, bound to active Change, or explicitly unknown. | [Alignment](system/components/alignment.md) |
| Alignment Graph | Disposable snapshot-bound projection of relationships, impact, and provenance. | [Alignment](system/components/alignment.md) |
| Approval | Authenticated acceptance of one exact policy-scoped subject that implies no other approval. | [Runtime](system/components/runtime.md) |
| Assisted Check Authoring | Explicit Client request for Managed Execution to propose validated Check Pack files without enforcement authority. | [Clients](system/components/clients.md) |
| Benchmark | Controlled externally-oracled comparison of the same product task without and with CodeWiki. | [Benchmarks](system/components/benchmarks.md) |
| Candidate | Immutable role-specific output proposed for one exact Loop attempt. | [Decision](system/components/decision.md) |
| Candidate Manifest | Runtime-owned identity binding a Candidate to repository, base, tree, scope, custody, and provenance. | [Runtime](system/components/runtime.md) |
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
| Client | CodeWiki-owned interaction surface that requests bounded reads or authenticated actions without Runtime authority. | [Clients](system/components/clients.md) |
| Code Check | Arbitrary Check program executed only through an admitted isolated language adapter. | [Verification](system/components/verification.md) |
| Controlled provenance | Candidate provenance positively proven by an exact Runtime Candidate Manifest and persisted workbench custody. | [Runtime](system/components/runtime.md) |
| Custom Check | Project-authored model or code Check represented in the same tracked format as other Checks. | [Verification](system/components/verification.md) |
| Decision | Loop that evaluates accepted intent and desired-Knowledge impact. | [Decision](system/components/decision.md) |
| Default Check | CodeWiki-provided open editable Check materialized in the project Default Check Pack. | [Verification](system/components/verification.md) |
| Delivery effect | Separately authorized change to a protected delivery boundary. | [Runtime](system/components/runtime.md) |
| Development stage | User-facing Decision, Planning, or Implementation stage backed by its semantic Loop. | [Runtime](system/components/runtime.md) |
| Discovery Finding | Producer-neutral bounded report of new or out-of-scope work that carries no Check or Change authority. | [Change Intake](system/components/change-intake.md) |
| Evidence Record | Immutable metadata record for an exact observation with provenance and freshness. | [Evidence](system/components/evidence.md) |
| Execution Port | Neutral internal contract through which Runtime requests bounded execution without importing Pi. | [Managed Execution](system/components/execution.md) |
| Exit Outcome | Immutable projection of one unchanged Exit Report, optional Repair Bundle, and bound Runtime Route reference. | [Verification](system/components/verification.md) |
| Exit Report | Immutable self-explaining verdict binding every selected Result for one exact Candidate and policy. | [Verification](system/components/verification.md) |
| External Candidate Capture | Immutable fingerprint and retained material for observed Git state lacking exact Runtime custody. | [Runtime](system/components/runtime.md) |
| External provenance | Fail-closed Candidate provenance assigned when exact Runtime custody cannot be proven. | [Runtime](system/components/runtime.md) |
| Host Service | Long-lived local front door owning transport, pairing, project discovery, channel delivery, and protocol bindings. | [Host Service](system/components/host.md) |
| Implementation | Loop that realizes accepted Planning obligations in source, tests, and Integration. | [Implementation](system/components/implementation.md) |
| Improvement Assessment | Explicit deliberate process for producing Discovery Findings outside Candidate repair. | [Change Intake](system/components/change-intake.md) |
| Integration | Runtime-owned combination and verification of isolated realization into an exact Candidate tree. | [Runtime](system/components/runtime.md) |
| Knowledge | Accepted desired Product, System, and Design state stored as an OKF bundle. | [Knowledge](system/components/knowledge.md) |
| Loop | One of Decision, Planning, or Implementation and no other CodeWiki capability. | [Runtime](system/components/runtime.md) |
| Managed Execution | Runtime-controlled execution through pinned isolated Pi SDK sessions with complete receipts. | [Managed Execution](system/components/execution.md) |
| Managed provenance | Controlled provenance augmented by a complete admitted Managed Execution receipt. | [Managed Execution](system/components/execution.md) |
| MCP-mediated provenance | Controlled provenance binding admitted Agent Client workbench operations without claiming complete external agent-loop custody. | [Runtime](system/components/runtime.md) |
| Model Check | Tool-free isolated model evaluation of one Candidate against one Check rubric and configured route. | [Verification](system/components/verification.md) |
| Planning | Loop that turns approved Decision into ordered immutable realization obligations. | [Planning](system/components/planning.md) |
| Repair Brief | Candidate- and report-bound bounded guidance compiled from matched profiles, Result signals, and one Repair Frontier. | [Verification](system/components/verification.md) |
| Repair Bundle | Immutable report-bound aggregate of matched Repair Profiles, Repair Frontier, Repair Brief, coverage, and guidance digests. | [Verification](system/components/verification.md) |
| Repair Frontier | Bounded snapshot-bound Alignment neighborhood relevant to actionable Results. | [Verification](system/components/verification.md) |
| Repair Profile | Sparse Check-owned mapping from outcome and finding code to zero-authority repair guidance. | [Verification](system/components/verification.md) |
| Resolved Exit Policy | Immutable Candidate-specific set of active Check bindings and reduction rules. | [Verification](system/components/verification.md) |
| Runtime Route | Runtime-owned next action after final Exit Report and current guards. | [Runtime](system/components/runtime.md) |
| Source ownership | Component-declared intended boundary for source and test realization. | [Knowledge](system/components/knowledge.md) |
| User Standard | Accepted project expectation from bounded text or exact source snapshot. | [Verification](system/components/verification.md) |
| Verification | Shared Evidence, Check, Observation, Result, Exit Report, and repair machinery for all three Loops. | [Verification](system/components/verification.md) |
| Work Item | Immutable Planning obligation eligible for isolated Implementation work. | [Planning](system/components/planning.md) |
| Workbench | Runtime-owned isolated repository and command environment for one exact assignment. | [Runtime](system/components/runtime.md) |
| WorkState | Deterministic current-state projection used for guards and scheduling. | [WorkState](system/components/work-state.md) |
