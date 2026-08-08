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
---
# Knowledge

Knowledge contains accepted desired state only: active vocabulary, Users, User-owned Stories, visual design, System topology, Components, and Flows. Changes carry transitions, Git carries content history, and Alignment records realization and provenance.

OKF concept identity derives from canonical path. Diagrams own topology; Components own production realization patterns; Flows explain stable directed paths. Generated indexes, dictionaries, overviews, status logs, migration notes, and drift reports are projections rather than authored Knowledge.
