---
type: System Component
title: Alignment
description: Projects snapshot-bound relationships, impact, provenance, and contribution routing without inventing authority or canonical truth.
status: stable
tags: [system, component]
codewiki_component: alignment
codewiki_source_patterns: ["src/alignment/**"]
codewiki_test_patterns: ["tests/alignment/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/account-for-drift.md
    rationale: Alignment supplies bounded impact and provenance facts for accountable decisions.
---
# Alignment

Alignment is the condition where relevant desired and executable state is resolved, bound to an active Change, or explicitly unknown. The Alignment Graph is a disposable snapshot-bound projection of relationships among Change revisions, Knowledge, source, tests, Work Items, Evidence, Results, and delivery effects. Graph projection, Knowledge augmentation, and bounded queries live under `src/alignment/**`; Change Trace supplies canonical inputs but does not own this disposable projection. Alignment cannot create canonical facts, infer causality, or grant authority.

Contribution Routing is a read-only Alignment projection over one exact Change revision, project responsibility rules, Actor Profiles, Authority Grants, active Claims, availability, and Worker Offers. It returns eligible reviewers, contributors, and Workers with exact match reasons, coverage, unknowns, and staleness. Profiles indicate likely fit; only Authority Grants permit decisions; Claims indicate current responsibility; immutable operations prove who acted.

Reviewer, assignee, Worker, and machine allocation remain outside immutable Change meaning. Changing availability or responsibility therefore updates projections and Claims without creating a semantic Change revision. Initial routing suggests eligible participants and requires explicit Claims; automatic assignment remains opt-in future behavior.
