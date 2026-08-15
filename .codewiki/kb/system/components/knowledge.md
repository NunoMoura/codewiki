---
type: System Component
title: Knowledge
description: Owns the compact OKF desired-state contract, semantic validation, diagrams, Lexicon, and realization metadata.
status: stable
tags: [system, component]
codewiki_component: knowledge
codewiki_source_patterns: ["src/knowledge/**"]
codewiki_test_patterns: ["tests/knowledge/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/maintain-intent.md
    rationale: Knowledge supplies the System responsibility required by this Story.
  - type: realizes
    target: /product/stories/check-author/author-composable-checks.md
    rationale: Knowledge supplies exact OKF concepts, relationships, and realization metadata to repository-aware Checks.
---
# Knowledge

Knowledge contains accepted desired state only: active vocabulary, Users, User-owned Stories, visual design, System topology, Components, and Flows. Changes carry transitions, Git carries content history, and Alignment records realization and provenance. Knowledge also owns the strict OKF validate, export, and consume operation boundary, which the curated Runtime surface exposes without a parallel API package.

OKF concept identity derives from canonical path. Diagrams own topology; Components own production realization patterns; Flows explain stable directed paths. Generated indexes, dictionaries, overviews, status logs, migration notes, and drift reports are projections rather than authored Knowledge.

Knowledge exposes immutable bounded OKF bundle, concept, relationship, source-ownership, and test-ownership facts for snapshot-bound consumers. The Check SDK may query those facts directly and traverse their Alignment projection, but it cannot mutate Knowledge, infer missing desired state, or treat generated projections as accepted truth. Query results retain exact Knowledge digest, source references, coverage, truncation, and staleness.
