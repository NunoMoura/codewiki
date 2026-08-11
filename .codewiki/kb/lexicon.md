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
| Alignment | Condition where relevant desired and executable state is resolved, bound to active Change, or explicitly unknown. | [Alignment](system/components/alignment.md) |
| Alignment Graph | Disposable snapshot-bound projection of relationships, impact, and provenance. | [Alignment](system/components/alignment.md) |
| Approval | Authenticated acceptance of one exact policy-scoped subject; it never implies another approval. | [Runtime](system/components/runtime.md) |
| Assisted Check Authoring | Optional host-native workflow in which the active Harness model drafts Check Pack files under deterministic validation and user approval. | [Clients](system/components/clients.md) |
| Candidate | Immutable role-specific output proposed for one exact Loop attempt. | [Decision](system/components/decision.md) |
| Change | Accountable intent and durable dossier represented by immutable operations. | [Change Trace](system/components/change-trace.md) |
| Change intake material | Bounded untrusted suggestion or finding that may propose or reinforce a Change. | [Change Intake](system/components/change-intake.md) |
| Change revision | Immutable semantic version of a Change's accepted meaning. | [Decision](system/components/decision.md) |
| Change Trace | Append-only typed operation history for one Change. | [Change Trace](system/components/change-trace.md) |
| Check | Atomic versioned requirement evaluated for one exact Candidate. | [Verification](system/components/verification.md) |
| Check Catalog | Snapshot of installed Checks that may be selected for a Candidate but grants no applicability or enforcement by itself. | [Verification](system/components/verification.md) |
| Check Invocation | Versioned bounded input binding one selected Check to an exact Candidate, policy, configuration, and context coverage. | [Verification](system/components/verification.md) |
| Check Observation | Bounded pass, fail, or indeterminate evaluator output with structured findings and optional untrusted repair proposals from which Runtime may create one Check Result. | [Verification](system/components/verification.md) |
| Check Pack | Content-addressed group of Checks and inherited configuration installed as one project binding. | [Verification](system/components/verification.md) |
| Check Result | Immutable admitted result of one resolved Check against one exact Candidate, preserving bounded finding codes, descriptive severity, locations, and repair proposals. | [Verification](system/components/verification.md) |
| Client | User-facing adapter that requests bounded reads or authenticated actions without owning Runtime authority. | [Clients](system/components/clients.md) |
| Code Check | Arbitrary Check program executed only through an admitted isolated language adapter. | [Verification](system/components/verification.md) |
| CodeWiki OS | Versioned guidance shared by CodeWiki-managed harness sessions. | [Harnesses](system/components/harnesses.md) |
| Custom Check | Project-authored model or code Check represented in the same tracked format as other Checks. | [Verification](system/components/verification.md) |
| Decision | Loop that evaluates accepted intent and desired-Knowledge impact. | [Decision](system/components/decision.md) |
| Default Check | CodeWiki-provided open editable Check materialized in the project Default Check Pack. | [Verification](system/components/verification.md) |
| Delivery effect | Separately authorized change to a protected delivery boundary. | [Runtime](system/components/runtime.md) |
| Development stage | User-facing name for the Decision, Planning, or Implementation stage backed by the corresponding semantic Loop. | [Runtime](system/components/runtime.md) |
| Evidence Record | Immutable metadata record for an exact observation with provenance and freshness. | [Evidence](system/components/evidence.md) |
| Exit Outcome | Immutable projection of one unchanged Exit Report, optional Repair Bundle, and bound Runtime Route reference. | [Verification](system/components/verification.md) |
| Exit Report | Immutable self-explaining verdict that binds every selected Result, classifies required, advisory, observed, and excluded outcomes, and reduces required blockers for one exact Candidate and policy. | [Verification](system/components/verification.md) |
| Harness | Runtime-selected execution adapter that provides declared semantic capabilities. | [Harnesses](system/components/harnesses.md) |
| Implementation | Loop that realizes accepted Planning obligations in source, tests, and Integration. | [Implementation](system/components/implementation.md) |
| Integration | Runtime-owned combination and verification of isolated realization into an exact candidate tree. | [Runtime](system/components/runtime.md) |
| Knowledge | Accepted desired Product, System, and Design state stored as an OKF bundle. | [Knowledge](system/components/knowledge.md) |
| Loop | One of Decision, Planning, or Implementation; no other CodeWiki capability is a semantic Loop. | [Runtime](system/components/runtime.md) |
| Model Check | Tool-free isolated model evaluation of one Candidate against one Check rubric and configured route. | [Verification](system/components/verification.md) |
| Planning | Loop that turns approved Decision into ordered immutable realization obligations. | [Planning](system/components/planning.md) |
| Project Runtime | Project-scoped control plane for identity, scheduling, persistence, synchronization, recovery, and guarded effects. | [Runtime](system/components/runtime.md) |
| Repair Brief | Candidate- and report-bound bounded guidance compiled from matched profiles, structured Result signals, and one exact Repair Frontier. | [Verification](system/components/verification.md) |
| Repair Bundle | Immutable report-bound aggregate of matched Repair Profiles, Repair Frontier, Repair Brief, coverage, and exact guidance digests. | [Verification](system/components/verification.md) |
| Repair Frontier | Bounded snapshot-bound Alignment projection of the smallest relevant source, test, Knowledge, Change, Evidence, and Check neighborhood for actionable Results. | [Verification](system/components/verification.md) |
| Repair Profile | Sparse Check-owned mapping from outcome and finding code to repair objective, actions, constraints, verification, and zero-authority route recommendation. | [Verification](system/components/verification.md) |
| Realization | Proven relation from desired Knowledge to exact source, test, and Integration facts. | [Knowledge](system/components/knowledge.md) |
| Resolved Exit Policy | Immutable Candidate-specific set of active Check bindings and reduction rules. | [Verification](system/components/verification.md) |
| Runtime Route | Runtime-owned next action after final Exit Report and guards. | [Runtime](system/components/runtime.md) |
| Source ownership | Component-declared intended boundary for source and test realization. | [Knowledge](system/components/knowledge.md) |
| User Standard | Accepted project expectation from bounded text or exact source snapshot. | [Verification](system/components/verification.md) |
| Verification | Shared Evidence, Check, Observation, Result, Exit Report, and policy machinery for all three Loops. | [Verification](system/components/verification.md) |
| Work Item | Immutable Planning obligation eligible for isolated Implementation work. | [Planning](system/components/planning.md) |
| WorkState | Deterministic current-state projection used for guards and scheduling. | [WorkState](system/components/work-state.md) |
