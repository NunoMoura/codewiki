---
type: System Component
title: Change Trace
description: Owns append-only typed Change operation history, deterministic reduction, archive identity, and replay.
status: stable
tags: [system, component]
codewiki_component: change-trace
codewiki_source_patterns:
  - "src/changes/trace/**"
  - "src/changes/command.ts"
  - "src/changes/digest.ts"
  - "src/changes/normalize.ts"
  - "src/changes/records.ts"
  - "src/changes/schema.ts"
  - "src/changes/store.ts"
  - "src/changes/types.ts"
  - "src/changes/validation-view.ts"
codewiki_test_patterns: ["tests/changes/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/recover-history.md
    rationale: Change Trace supplies the System responsibility required by this Story.
---
# Change Trace

A Change carries one accountable proposed transition from accepted state `S0` to intended state `S1`; its Change Trace is the append-only canonical operation history for that intent carrier. Strict canonical bytes, typed operations, parent identity, authority binding, preconditions, and deterministic reduction make replay and synchronization verifiable. Change Trace Protocol `3.0.0` binds each authority-bearing operation to one accountable `actorId` and one proof-backed `authenticatedIdentityRef`; Client transport identity remains request provenance rather than canonical actor identity. Canonical protocol, JSONL encoding, Change-backed storage, manifests, reduction, replay, synchronization support, retention, and owner-specific errors live together under `src/changes/trace/**`; no legacy Trace source root or cross-domain error path remains. Committed history is never reversed or erased; semantic reversal is another explicit operation or Change.

Mutable allocation does not alter immutable Change meaning. Reviewer, contributor, stage-producer, Implementation Worker, and machine identities live in policy-bound requirements, Claims, Assignments, producer attempts, and operations rather than Change revisions. A Review Requirement binds one exact revision, review class, scope, minimum approvals, independence rule, and policy digest. A Review Claim records current responsibility without implying approval. A Review Submission immutably binds one authenticated `approve | request_revision | defer | reject` disposition, rationale, Evidence references, Claim, delegation where applicable, and Project Server-owned time.

Human Review Submissions are optional inputs to the Review Stage Loop unless the user's Review Checks require them. Actor Profile, expertise, job title, CODEOWNERS, repository access, Agent or model identity, and Client kind cannot grant review or delivery authority. Project Server admits any Review Submission only when one exact Authority Grant and current policy authorize the actor for that requirement and revision. Archive remains a storage or lifecycle consequence after explicit semantic disposition; it never hides or substitutes for rejection, deferral, revision request, or approval.

Pull requests are delivery and recurring intake membranes, not proof of acceptance. Project Server normally creates or updates one integrated PR per Change after a passed Implementation Gate, retrieves authenticated reviews and provider Checks, correlates them to the exact head, and starts the Review Stage Loop. Automated Code and Model Checks may provide the complete Review basis when user policy permits. A passed Review Gate permits guarded merge only under current authority, provenance, freshness, branch policy, and expected-head compare-and-swap. Failed Review feedback returns to Implementation; out-of-scope findings enter Change Intake. Branch names, authors, provider labels, PR state, and provider conclusions alone grant no CodeWiki provenance, approval, Check Result, or merge authority.

Terminal history may move from hot coordination into immutable archive segments only after exact digest acceptance. Hydration is read-only. Reopening creates a new accountable hot segment rather than rewriting archived history. Canonical Change logs remain one file per Change under `.codewiki/traces/TRACE-CHG-<id>.jsonl`; no separate `.codewiki/changes.log` exists. Git remains the artifact-history owner. Execution Ledgers, raw DSH sessions, delegated child traces, exact prompts, query calls, Compaction Checkpoints, provider memory, and code-runtime scratch remain receipt-bound execution evidence outside Change Trace unless a semantic operation references their immutable receipt. Change Trace records authority-relevant meaning needed for accountability closure rather than every incidental Agent or repository interaction.
