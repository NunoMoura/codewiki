---
type: System Component
title: Decision
description: Owns accepted-intent Candidate semantics, knowledge-impact assessment, and Decision Checks.
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

Decision owns its Candidate, Checks, attempt composition, and interpretation. Runtime Loop Exit invokes shared Verification, admits the exact Exit Report, and owns the authoritative route, persistence, and effects. Discoveries that alter accepted meaning return here rather than being silently absorbed by Planning or Implementation.
