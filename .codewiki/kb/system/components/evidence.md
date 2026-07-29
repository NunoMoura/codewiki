---
type: Concept
title: Evidence Records
description: Evidence Records give every Loop one immutable, typed, content-addressed way to bind observations and approval receipts to exact intent, candidates, requirements, artifacts, and provenance without creating another workflow or truth store.
tags:
  - codewiki
  - system
  - evidence
  - provenance
  - approval
timestamp: 2026-07-29T07:09:20.000Z
codewiki_component: evidence
codewiki_components:
  - evidence
codewiki_responsibility: Define strict immutable cross-Loop Evidence Record contracts, content identity, Runtime materialization, provenance, authority, coverage, and privacy boundaries.
codewiki_source_patterns:
  - src/evidence/**
codewiki_test_patterns:
  - tests/evidence/**
codewiki_source_map:
  - id: evidence
    source_patterns:
      - src/evidence/**
    test_patterns:
      - tests/evidence/**
---
# Evidence Records

CodeWiki turns accepted intent into accountable implementation by requiring evidence that the exact candidate satisfies exact obligations. An agent, worker, tool, model, or external provider cannot establish compliance by claiming success. Project Runtime materializes immutable **Evidence Records**, trusted Checks interpret them, and immutable Check Results state what was established.

```text
accepted intent or observed state
→ typed Evidence Records
→ candidate-bound Checks
→ Check Results
→ Exit Report
→ separately guarded Runtime route or effect
```

Evidence is a shared cross-Loop contract. It is not a fourth semantic Loop, a task, a mutable approval object, a generic document database, or another canonical store.

## Entity boundary

An Evidence Record is a content-addressed entity represented by one immutable value record with stable identity. It standardizes observation identity, subject, producer, provenance, artifact binding, freshness, authority class, coverage, privacy, and a kind-specific payload.

It does **not** own an independent mutable lifecycle. There is no Evidence CRUD service, central Evidence database, or user-authored evidence paperwork. Compact canonical Evidence Record metadata is exhausted from doing work and persists inside the owning Change Trace; large or private bytes remain in their existing authority boundary and are cited by digest.

The three contracts remain distinct:

```text
Check requirement   = what must be true
Evidence Record     = an observation that supports, contradicts, or leaves that claim unknown
Check Result        = Runtime-owned interpretation under one exact Check and policy
```

One Evidence Record may be consumed by several Checks. One Check may require several evidence kinds. Evidence never carries pass/fail, final route, or effect authority by itself.

## Core envelope

The target envelope is a closed, versioned contract with discriminated payloads rather than arbitrary JSON:

```ts
type EvidenceKind =
  | "research_citation"
  | "source_observation"
  | "command_execution"
  | "ui_capture"
  | "model_assessment"
  | "worker_report"
  | "integration_proof"
  | "approval_receipt"
  | "delivery_attestation"
  | "outcome_observation";

interface EvidenceRecord<TKind extends EvidenceKind, TPayload> {
  schemaVersion: string;
  evidenceId: string;              // Runtime-derived content identity
  kind: TKind;
  subject: {
    changeRefs: string[];
    changeRevisionDigests: string[];
    candidateDigest?: string;
    planningRevisionDigest?: string;
    acceptanceRequirementIds: string[];
    sourceTreeDigest?: string;
  };
  producer: {
    kind: "runtime" | "worker" | "model" | "user" | "external_service";
    id: string;
    version?: string;
  };
  artifact?: {
    digest: string;
    mediaType: string;
    ref: string;
    sizeBytes?: number;
  };
  provenanceRefs: string[];
  observedAt: string;              // Runtime-owned
  freshnessBoundary?: string;
  authority: "asserted" | "observed" | "verified" | "approved";
  coverage: "complete" | "partial" | "unknown";
  sensitivity: "public" | "project" | "private";
  payload: TPayload;
}
```

Producer-facing Evidence material contains only schema/kind, bounded payload, optional artifact metadata, and provenance refs. Runtime supplies the canonical subject, producer metadata, observation time, authority, coverage, freshness boundary, and effective sensitivity after validating correlation, artifact digest, provenance, freshness, and privacy policy. Producers cannot self-bind a Candidate or Change revision, supply canonical identity, upgrade authority, claim complete coverage, lower sensitivity, or turn an artifact into acceptance.

Evidence created before a candidate, such as research against a pending Change revision, binds that exact revision. The later candidate binds the Evidence Record ids/digests in its observed base. Evidence created from a candidate, such as a UI capture, additionally binds the exact candidate and source tree. Check Results bind both candidate and consumed evidence identities.

## Kind-specific payloads

A small shared envelope does not flatten domain semantics. Each kind has an exact payload and admissibility contract.

| Kind | Typical payload | Primary consumer |
| --- | --- | --- |
| `research_citation` | claim, source URI/type/publisher, exact passage digest, publication/retrieval facts, support/contradiction, limitations | Decision Checks |
| `source_observation` | source/test/Knowledge/Git identity, paths or symbols, ownership and coverage | Any Loop's grounding Checks |
| `command_execution` | trusted command adapter, arguments/config digest, environment identity, exit/timeout, bounded output digest | Code Checks |
| `ui_capture` | preview target/profile, route/scenario/state, viewport, screenshots/video, console/network summary, manifest digest | Implementation UI Checks and user review |
| `model_assessment` | exact Model Check/protocol/route/config identity, structured measurement and findings | Model Check result construction |
| `worker_report` | Assignment/Claim/Workbench/base correlation, changed paths and worker proof | Implementation admission and provenance Checks |
| `integration_proof` | target/base/commit/tree/patch/paths and combined verification | Implementation and guarded Integration |
| `approval_receipt` | authenticated actor, role, decision, exact subject/artifact/head, provider event, time | Approval-backed Code Checks |
| `delivery_attestation` | remote target, commit/artifact/channel identity, operation and re-observation | Guarded delivery effects |
| `outcome_observation` | metric/experience/user feedback, observation boundary, coverage and limits | Change outcome disposition |

New kinds require a CodeWiki Change, schema, provenance rules, privacy review, exact Check consumer, tests, and migration plan. Unknown payloads remain untrusted data.

## Authority and strength

Authority is contextual; no single ranking proves every requirement.

- Agent or worker assertions are candidate material, not acceptance.
- Runtime observations establish what Runtime actually saw.
- Deterministic Code Checks verify declared machine-testable requirements.
- Independent Model Checks provide bounded semantic judgment but cannot approve intent or effects.
- Authenticated users or delegated roles approve subjective intent and reserved risk decisions.
- External provider observations establish one exact remote state, not a permanent guarantee.

Tests do not prove visual taste. Screenshots do not prove accessibility. User approval does not prove type safety. A commit proves content identity, not correctness. Required policy combines independent evidence appropriate to each claim.

Contradictory Evidence Records remain visible. Runtime and Checks cannot silently average, overwrite, or cherry-pick them. Missing, stale, partial, unavailable, or contradictory required evidence yields repair, waiting, or `indeterminate`; it never becomes fabricated pass or score zero.

## Decision research evidence

Research supports Decision claims but does not automatically become accepted Knowledge or authority.

```text
pending Change revision
→ deterministic research obligation
→ research_citation Evidence Records
→ provenance/freshness Code Check
→ independent claim-support Model Check
→ recommendation and alternatives Check
→ authenticated Decision approval
```

A research citation records the exact claim, primary or secondary source classification, publisher, URI, captured passage/artifact digest, publication and retrieval facts, whether it supports or contradicts the claim, and explicit limitations. Mutable web pages require a captured digest; a URL alone is not durable proof. Raw pages and private notes stay outside traces unless an approved artifact boundary preserves them.

Decision research activation remains deterministic and risk-based: unknown current state, external provider/API dependency, security/privacy or regulatory claim, migration/compatibility risk, unfamiliar technology, or another accepted trait may require it. Required stale or unavailable research is `indeterminate`. Imported research cannot grant approval, rewrite Knowledge, execute code, or suppress another Check.

Current executable Decision evidence uses broad `sourceRefs` and `proofRefs` and does not yet provide this exact research contract. The Decision clean cut must replace ref-count sufficiency with typed provenance, claim support, contradiction, freshness, and risk-proportional coverage.

## UI experience evidence

User-visible UI work normally requires more than source and test output. Planning binds exact preview targets, profiles, routes, scenarios/states, viewports, and evidence obligations. Runtime then creates candidate-bound `ui_capture` Evidence Records containing, as applicable:

- desktop, mobile, and tablet screenshots;
- short MP4/WebM interaction recordings;
- loading, empty, error, success, hover, focus, and responsive states;
- before/after or prior-candidate comparisons;
- accessibility and responsive-overflow observations;
- bounded redacted console/network findings;
- live preview URL for inspection;
- exact target/profile/scenario, candidate, Git tree, viewport, capture time, artifact and manifest digests.

A live link supports inspection but is mutable and is never sole proof. Immutable captures prove what reviewers saw. Media bytes remain content-addressed artifacts outside JSONL; the Evidence Record and Change Trace retain exact digests and durable refs.

Implementation uses separate obligations:

1. `ui_preview_evidence_valid` verifies exact required targets, states, viewports, manifests, candidate binding, freshness, and artifact availability.
2. `ui_experience_reviewed` may run an independent bounded Model Check for hierarchy, clarity, consistency, responsiveness, and other declared Design guidance.
3. `ui_experience_approved` is an approval-backed Code Check validating an authenticated approval receipt for the exact candidate and capture bundle.

A worker may create capture artifacts but cannot approve them. Model critique cannot substitute for user approval. Approval permits exact Implementation Loop exit only; merge, publication, release, and deployment remain separate effects.

## CodeWiki and pull-request review

CodeWiki is the canonical semantic authority and complete Change dossier. A pull request is a mutable team collaboration and Git-provider surface. Team projects should use both without asking reviewers to approve twice.

CodeWiki may publish a bounded **Validation Bundle** to a draft pull request containing:

- accepted intent and acceptance requirements;
- exact Change, candidate, source tree, commit/head, policy and report identities;
- changed scope and unresolved findings;
- Check Results and coverage;
- screenshots, short videos, preview link, and capture-manifest digest;
- required reviewer roles and explicit Approve / Request changes guidance;
- a link back to the complete CodeWiki dossier.

A provider review event becomes an `approval_receipt` Evidence Record only after Runtime re-observes authenticated reviewer, repository, pull request, exact head SHA, reviewer role, decision, provider event identity, evidence-bundle digest, and time. Free-form “LGTM” text is not silently promoted to intent approval. Maintainer code approval, intent-owner experience approval, Product/Design approval, security risk acceptance, and Git merge authority remain distinct roles.

New source, candidate, preview manifest, artifact bundle, target/profile, or pull-request head invalidates dependent approval. Runtime requests fresh review rather than carrying approval forward.

A Request changes review records structured feedback against the exact candidate. Visual tuning inside accepted intent creates a new Implementation candidate in the same Change Trace. Work Item/scope/preview-plan changes route to Planning. Product behavior, accepted meaning, material risk, or user-authority changes route to Decision. A materially different outcome creates a linked Change.

Solo or offline projects may review inside CodeWiki only. Team policy may require provider review. An approval made in either configured surface is imported once into CodeWiki and projected to the other surface where possible; the channel does not create duplicate semantic approval.

## Guarded pre-exit review publication

Required pull-request approval creates one deliberate exception to the ordinary post-exit effect order. After all required non-approval admission, provenance, machine, and model work needed for safe review is complete, Runtime may perform an explicitly authorized **review-publication effect**:

```text
exact pending Implementation candidate
→ review-readiness guard
→ push isolated review ref and create/update draft pull request
→ publish Validation Bundle
→ collect provider/user Evidence Records
→ approval-backed Check Result
→ final immutable Exit Report
```

Review publication is evidence gathering, not semantic advancement, Integration acceptance, project-branch merge, release, or deployment. It requires exact candidate/tree/head, destination CAS, provider capability, idempotency, explicit authority, privacy policy, and post-operation observation. It cannot target a protected project branch, auto-merge, force-push, publish a product artifact, or claim Loop exit.

If project policy forbids pre-exit review publication, required UI approval occurs in CodeWiki before exit and the later pull request remains a separate merge-review boundary.

## Storage and retention

- Compact Evidence Record identity, subject, provenance, authority/coverage/sensitivity, payload summary, and artifact digests persist in the owning Change Trace.
- Source/tests, Git commits/trees, provider review events, delivery systems, and accepted Knowledge remain in their own authority boundaries and are cited rather than duplicated.
- Screenshots, videos, captured pages, bounded command output, and other large artifacts use content-addressed local or approved provider storage with explicit retention.
- Raw prompts, private reasoning, credentials, unrestricted logs, private Workbenches, and sensitive browser content never enter canonical traces or public review bundles.
- Shared evidence has one owning observation record; other Changes cite its immutable identity without transferring acceptance.
- Closure/compaction cannot delete the only required artifact before durable replacement or retention proof exists.

## Source boundary and current status

Shared contracts belong under `src/evidence/**`, not under one semantic Loop or the Loop-exit runner:

```text
src/evidence/
  contracts.ts
  identity.ts
  materialize.ts
```

Loop-owned packages declare admissible domain payload/obligation semantics. `src/loop-exit/**` imports Evidence contracts to bind Check inputs and Results. Runtime composes materialization, artifact/provider adapters, approval correlation, trace writes, and retention. Dependency direction stays one-way; Evidence code cannot import Decision, Planning, or Implementation implementations.

Current foundation implements the closed envelope and ten payload kinds, strict recursive admission, canonical normalization, content identity, Runtime-owned subject/time/producer/authority/coverage/freshness/sensitivity context, semantic kind bindings, tamper validation, and public contract types. Existing evidence producers and trace writers are not migrated yet. Until that migration, legacy `sourceRefs`, `proofRefs`, preview captures, review reports, worker reports, and delivery proofs retain their current executable behavior and do not become canonical Evidence Records merely by resembling one.

Canonical JSON/digest primitives live in `src/utils/canonical-json.ts` so Evidence and Loop-exit identity share exact serialization without reversing the dependency from Loop exit into Evidence.

## Non-goals

- No fourth Evidence or Review Loop.
- No generic evidence ontology or arbitrary-record SDK.
- No central Evidence database, graph authority, or mutable approval store.
- No automatic acceptance from worker completion, tool success, screenshots, model scores, pull-request comments, or projections.
- No mandatory pull request for local, solo, private, or provider-less work.
- No media committed into product source by default.

## Related docs

- [Loop Exit](loop-exit.md)
- [Loop Contracts](loop-contracts.md)
- [Implementation Loop](implementation-loop.md)
- [Live Preview Runtime](preview-runtime.md)
- [Runtime](runtime.md)
- [Change Traces](traces.md)
- [Adapters and UI Component](adapters-and-ui.md)
