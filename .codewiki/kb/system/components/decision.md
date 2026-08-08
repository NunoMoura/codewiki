---
type: System Component
title: Decision
description: Owns accepted-intent Candidate semantics, knowledge-impact assessment, Decision Checks, and route recommendations.
status: stable
tags: [system, component]
codewiki_component: decision
codewiki_source_patterns: ["src/decision/**"]
codewiki_test_patterns: ["tests/decision/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/maintain-intent.md
    rationale: Decision supplies the System responsibility required by this Story.
---
# Decision

Decision evaluates one authenticated exact Change revision. Its Candidate states desired meaning, alternatives, constraints, risks, and either an exact Knowledge transition or explicit unchanged-Knowledge references.

Decision owns its Candidate, Checks, attempt composition, interpretation, and route recommendation. Runtime owns admission, scheduling, identity, persistence, final routing, and effects. Discoveries that alter accepted meaning return here rather than being silently absorbed by Planning or Implementation.
