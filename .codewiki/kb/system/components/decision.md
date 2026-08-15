---
type: System Component
title: Decision
description: Owns accepted-intent Candidate semantics, knowledge-impact assessment, and Decision attempt interpretation.
status: stable
tags: [system, component]
codewiki_component: decision
codewiki_source_patterns: ["src/loops/decision/**", "src/loops/candidate-admission.ts"]
codewiki_test_patterns: ["tests/loops/decision/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/maintain-intent.md
    rationale: Decision supplies the System responsibility required by this Story.
---
# Decision

Decision evaluates one authenticated exact Change revision. Its Candidate states desired meaning, alternatives, constraints, risks, and either an exact Knowledge transition or explicit unchanged-Knowledge references. Its typed `approve | reject | defer | withdraw` disposition remains part of Decision meaning rather than Check or Runtime policy.

Decision owns Candidate and attempt semantics under `src/loops/decision/**`. Runtime supplies any exact optional Decision Pack Skills to the work-producing Agent; those Skills may guide evaluation but cannot select disposition or affect Gate authority. Editable Decision Checks live in the same `.codewiki/check-packs/decision/**` Packs and independently run through the shared Checks Gate. A failed Gate returns each atomic failure and its one feedback contract to another Decision attempt. A stopped Gate preserves current state and reports operational recovery. A passed Gate permits Runtime to apply the Candidate disposition through fixed lifecycle rules; only `approve` advances to Planning. Discoveries that alter accepted meaning return here rather than being silently absorbed by Planning, Implementation, or Review.
