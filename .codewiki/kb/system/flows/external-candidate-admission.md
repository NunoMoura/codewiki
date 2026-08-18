---
type: System Flow
title: External Candidate Admission
description: Captures unmatched Git state, binds honest provenance, and sends it through exact Change admission or accountable intake before stage Gates.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/account-for-drift.md
    rationale: External Candidate Admission prevents unaccounted Git divergence from inheriting CodeWiki certification.
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: External Candidate Admission provides a safe path for useful work created outside controlled execution.
---
# External Candidate Admission

Project Server compares synchronized Git head and tree with accepted state and persisted Candidate custody. An exact Manifest match preserves controlled provenance; otherwise Project Server classifies the observed state as external, pauses guarded effects, fingerprints repository, base, head, tree, paths, and diff, and captures immutable code material under a Project Server-owned ref or worktree without mutating the user branch.

Tracked changes may be captured through a temporary index and synthetic commit. Untracked files require explicit bounded selection because they may contain secrets. Branch names, commit authors, trailers, notes, and producer claims are display metadata, never provenance proof.

If the capture matches one accepted Work Unit, owning Change, scope, base, and authority, Project Server creates an external-provenance Work Unit Candidate Manifest and runs the same resolved stage-wide Implementation Check Pack policy with no inherited execution receipt. A passing Candidate still requires fresh expected-head integration into the private Change lineage. Review starts only after all required units integrate and judges the exact aggregate lineage. Otherwise the capture becomes Change Intake Material for deduplication, Decision, Change-scoped Planning, and explicit acceptance before entering an isolated Implementation Workbench. Project Server never silently adopts, overwrites, discards, or certifies divergence.
