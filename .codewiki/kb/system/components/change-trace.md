---
type: System Component
title: Change Trace
description: Owns append-only typed Change operation history, deterministic reduction, archive identity, and replay.
status: stable
tags: [system, component]
codewiki_component: change-trace
codewiki_source_patterns: ["src/changes/trace/**", "src/changes/*.ts"]
codewiki_test_patterns: ["tests/changes/**", "tests/traces/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/recover-history.md
    rationale: Change Trace supplies the System responsibility required by this Story.
---
# Change Trace

A Change Trace is append-only canonical history for one accountable intent carrier. Strict canonical bytes, typed operations, parent identity, authority binding, preconditions, and deterministic reduction make replay and synchronization verifiable. Change Trace Protocol `3.0.0` binds each authority-bearing operation to one accountable `actorId` and one proof-backed `authenticatedIdentityRef`; Client transport identity remains request provenance rather than canonical actor identity.

Mutable allocation does not alter immutable Change meaning. Reviewer, assignee, Worker, and machine identities live in policy-bound requirements, Claims, Assignments, and operations rather than Change revisions. A Review Requirement binds one exact revision, review class, scope, minimum approvals, independence rule, and policy digest. A Review Claim records current responsibility without implying approval. A Review Submission immutably binds one authenticated `approve | request_revision | defer | reject` disposition, rationale, Evidence references, Claim, delegation where applicable, and Runtime-owned time.

Actor Profile, expertise, job title, CODEOWNERS, repository access, model identity, and Client kind cannot grant review authority. Runtime admits a Review Submission only when one exact Authority Grant and current policy authorize the actor for that requirement and revision. Archive remains a storage or lifecycle consequence after explicit semantic disposition; it never hides or substitutes for rejection, deferral, revision request, or approval.

Pull requests are delivery and recurring intake membranes, not proof of acceptance. Runtime normally creates or updates one integrated PR per Change after fresh combined Verification, retrieves authenticated reviews and provider Checks, correlates them to the exact head, and permits guarded merge only under current authority and policy. PR findings route either to current Candidate repair or to new Change Intake when intent or scope differs. Branch names, authors, provider labels, and PR state alone grant no CodeWiki provenance, approval, Result, or merge authority.

Terminal history may move from hot coordination into immutable archive segments only after exact digest acceptance. Hydration is read-only. Reopening creates a new accountable hot segment rather than rewriting archived history. Canonical Change logs remain one file per Change under `.codewiki/traces/TRACE-CHG-<id>.jsonl`; no separate `.codewiki/changes.log` exists.
