---
type: System Component
title: Implementation
description: Owns realization Candidate semantics, worker interpretation, and feedback-driven Implementation attempts.
status: stable
tags: [system, component]
codewiki_component: implementation
codewiki_source_patterns: ["src/loops/implementation/**"]
codewiki_test_patterns: ["tests/loops/implementation/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Implementation supplies the System responsibility required by this Story.
---
# Implementation

Implementation realizes accepted Planning obligations in isolated workbenches and produces a Candidate bound to exact source, tests, Knowledge, configuration, and expected Git bases. Workers report bounded results but cannot schedule work or write canonical state.

Implementation owns realization, Candidate, attempt, worker interpretation, and feedback-consumption semantics under `src/loops/implementation/**`. Its editable stage Checks live under `.codewiki/check-packs/implementation/**` and run through the shared Checks Gate after Runtime integrates fresh compatible output. A failed Implementation Gate returns each atomic failure and its feedback to another Implementation attempt. A passed Gate advances the exact integrated revision to Review. A failed Review Gate also returns Review-specific feedback here, and the resulting new integrated head starts a fresh Review attempt.

Runtime owns Claims, worker dispatch, Integration, persistence, expected-head synchronization, recovery, fixed lifecycle, and guarded effects. Checks owns shared execution and Gate mechanics. Implementation contains no generic quality graph, route hints, or delivery authority.
