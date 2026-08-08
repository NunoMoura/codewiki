---
type: System Component
title: Verification
description: Owns shared Check, obligation, Result, Exit Report, policy resolution, and generic evaluator-port machinery.
status: stable
tags: [system, component]
codewiki_component: verification
codewiki_source_patterns: ["src/verification/**"]
codewiki_test_patterns: ["tests/verification/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Verification supplies the System responsibility required by this Story.
---
# Verification

Verification resolves immutable Candidate-specific Exit Policy, evaluates atomic Default and Custom Checks through injected ports, records independent Results, and reduces one exact Exit Report. It is shared machinery, not a fourth semantic Loop.

Missing, stale, partial, unavailable, contradictory, or unusable required Evidence yields waiting or indeterminate. Evaluators, collectors, adapters, formats, and calibration reports cannot grant Results. Verification imports neither Runtime nor Loop implementations.
