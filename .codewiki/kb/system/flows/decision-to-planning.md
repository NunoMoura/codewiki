---
type: System Flow
title: Decision to Planning
description: Ratifies semantically compatible Change meaning and transfers it into one Change-scoped Work Graph delta without global replanning.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/maintain-intent.md
    rationale: Decision to Planning preserves accepted meaning and active-Change compatibility before decomposition.
---
# Decision to Planning

Project Server runs the Decision Gate over the exact Decision Candidate and a frozen Gate Evaluation Package. The editable default Decision Check Pack combines deterministic overlap accounting with an `active_change_compatibility` Model Check over relevant accepted nonterminal Change revisions, explicit relationships, accepted Work Graph projection, complete coverage, and active-portfolio digest. The invariant is no unresolved semantic contradiction, not no overlap. Dependencies and technical ordering remain Planning concerns; resource contention remains a scheduler concern.

A failed Gate returns atomic feedback to Decision. A stopped Gate preserves current state. A passed Gate makes only that exact Candidate eligible for confirmation. An authorized actor confirms its unchanged bytes and Gate digest against current WorkState and active-portfolio head. Project Server applies the disposition through expected-head compare-and-swap; if another Change was accepted meanwhile, affected compatibility Results become stale. Only confirmed `approve` ratifies intended state and advances to Planning.

Planning decomposes that one ratified Change into an immutable Work Graph delta containing singly owned Work Units, acceptance coverage, dependencies, technical requirements, resource requirements, verification, and aggregate Review obligations. It reads the global graph but does not create a replacement portfolio plan. Ambiguous intent, changed risk, conflicting authority, or a semantic Knowledge change returns through an explicit Decision operation rather than silent reinterpretation.
