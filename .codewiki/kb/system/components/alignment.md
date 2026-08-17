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
  - type: realizes
    target: /product/stories/check-author/author-composable-checks.md
    rationale: Alignment supplies the horizontal and vertical snapshot-bound facts required by repository-aware Checks.
---
# Alignment

Alignment is the condition where relevant desired and executable state is resolved, bound to an active Change, or explicitly unknown. The Alignment Graph is a disposable snapshot-bound projection of relationships among Change revisions, Knowledge, source, tests, Work Items, revisions, commits, provider Evidence, Results, and delivery effects. Graph projection, Knowledge augmentation, and bounded queries live under `src/alignment/**`; Change Trace supplies canonical inputs but does not own this disposable projection. Alignment cannot create canonical facts, infer causality, or grant authority.

Alignment publishes bounded read-only query facts for DSH-backed Run and external-client Stage Context, the Check SDK, Project Server, and Client projections. Horizontal queries inspect one layer. Vertical queries traverse exact relationships from OKF Knowledge through source ownership, tests, revisions, commits, accepted work, Evidence, Results, and delivery. Every response identifies query and graph digests, immutable underlying snapshots, source references, deterministic ordering, provenance, coverage, unknowns, truncation, cursor position, query-engine identity, and staleness. Alignment is the shared projection owner; stage context and the Check SDK do not duplicate its graph. A Check may judge returned facts, but Alignment itself never passes a Check or creates feedback.

Contribution Routing is a read-only Alignment projection over one exact Change revision, project responsibility rules, Actor Profiles, Authority Grants, active Claims, availability, and Worker Offers. It returns eligible reviewers, contributors, and Implementation Workers with exact match reasons, coverage, unknowns, and staleness. Profiles indicate likely fit; only Authority Grants permit decisions; Claims indicate current responsibility; immutable operations prove who acted.

Reviewer, contributor, stage-producer, Implementation Worker, and machine allocation remain outside immutable Change meaning. Changing availability or responsibility therefore updates projections and Claims without creating a semantic Change revision. Initial routing suggests eligible participants and requires explicit Claims; automatic assignment remains opt-in future behavior.
