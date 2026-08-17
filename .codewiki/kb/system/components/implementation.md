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

Implementation realizes accepted Planning obligations in isolated Workbenches and produces a Candidate bound to exact source, tests, Knowledge, configuration, and expected Git bases. An Implementation Worker executes one accepted Work Item through one exact Assignment as a Backend Agent, Backend-launched delegate, External Agent Client, deterministic process, or service. Its custody class and receipt limits are explicit. It reports bounded results but cannot schedule work or write canonical state.

Implementation owns realization, Candidate, attempt, Worker interpretation, and feedback-consumption semantics under `src/loops/implementation/**`. Runtime freezes exact Stage Context and binds optional Implementation Pack Skills through each Assignment only when the selected route can prove their exact supplied bytes. Those Skills may guide realization but cannot widen scope, mutate canonical state, or affect Gate authority. Editable Implementation Checks live in the same `.codewiki/check-packs/implementation/**` Packs and independently run through the shared Checks Gate after Runtime integrates fresh compatible output. A failed Implementation Gate returns each atomic failure and its feedback to another Implementation attempt. A passed Gate advances the exact integrated revision to Review. A failed Review Gate also returns Review-specific feedback here, and the resulting new integrated head starts a fresh Review attempt.

Runtime owns Claims, Implementation Worker dispatch, Integration, persistence, expected-head synchronization, recovery, fixed lifecycle, and guarded effects. Checks owns shared execution and Gate mechanics. Implementation contains no generic quality graph, route hints, or delivery authority.
