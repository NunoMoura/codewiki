---
type: System Flow
title: Work Unit Execution
description: Executes one claimed Work Unit through an isolated Project Server-owned Workbench, gates one exact Candidate under the shared Implementation policy, and admits passing output to its Change lineage.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Work Unit Execution provides isolated accountable realization with immediate unit feedback.
---
# Work Unit Execution

Project Server grants one exact Work Unit Claim, selects an eligible Implementation Worker from current Worker Offers and policy, creates and verifies one isolated Workbench, mounts an authorized Project Material Generation, snapshots optional Implementation Pack Skills, and persists one Assignment and Run Request binding their digests. The Work Unit-scoped DSH Agent Session may continue across several bounded Runs while the Assignment lineage, Runtime Build, and authority remain compatible. Each Candidate nevertheless has exactly one producing Run. The Worker mutates only its Workbench and cannot grant Claims, schedule canonical descendants, share mutable Workbenches, write canonical state, create authoritative Results, or perform effects.

Every Work Unit Candidate is judged by the same resolved stage-wide Implementation Check Pack policy. Project Server freezes a Work Unit-specific Gate Evaluation Package containing the exact Candidate, owning Change acceptance slice, Work Unit obligations, dependency outputs, pinned repository and Workbench bases, changed paths, Evidence, receipts, and the current resolved `.codewiki/check-packs/implementation/**` snapshot. Planning and workers cannot select a bespoke Pack. Independent unit Gates and their isolated Model Checks may run concurrently.

A failed Gate returns atomic feedback to the same Work Unit continuity. A passing Gate qualifies only that exact Candidate. Project Server then admits fresh compatible output into the Change-owned private integration lineage through expected-head compare-and-swap. Gate-passed, integration-pending, integrated, stale, and conflicted remain distinct. Claim loss, cancellation, malformed output, base drift, integration conflict, changed custody, or changed bytes blocks admission and requires bounded recovery or a new Candidate; it never alters protected state.

The Change does not enter Review after one unit passes. Project Server advances only after every required Work Unit has a current passing Gate, every required output is integrated, dependency closure and Planning acceptance coverage hold, and one exact aggregate lineage head is frozen for Review.
