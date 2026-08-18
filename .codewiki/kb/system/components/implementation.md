---
type: System Component
title: Implementation
description: Owns Work Unit realization Candidate semantics, worker interpretation, and feedback-driven Implementation attempts.
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

Implementation realizes one accepted Work Unit at a time in one Project Server-owned isolated Workbench. A Work Unit-scoped DSH Agent Session may span several bounded Runs across feedback, but every Candidate has exactly one producing Run and binds the exact Assignment, owning Change, Work Unit obligations, dependency outputs, source and test base, resulting tree or patch, Knowledge, configuration, custody, Evidence, and receipt. Independent ready Work Units may execute and be judged concurrently. No Change-level model coordinator owns scheduling or canonical aggregate state; Project Server and WorkState provide that coordination.

One resolved stage-wide Implementation Check Pack policy applies to every Work Unit Candidate. Planning, workers, and routes cannot choose or author a Work Unit-specific Pack. Each Gate freezes the exact current resolved `.codewiki/check-packs/implementation/**` snapshot; a policy edit creates a new stage-wide snapshot and invalidates affected remaining Results rather than creating per-unit variants. Evaluation inputs vary only by exact Candidate, owning Change acceptance slice, Work Unit obligations, pinned base and dependencies, changed paths, Evidence, and receipts. Deterministic Pack applicability rules may return `not_applicable`; they do not create another Pack. Optional Implementation Pack Skills guide production but never judge output or grant authority.

A failed Implementation Gate returns atomic feedback to the same Work Unit loop. A passed Gate qualifies only that exact Work Unit Candidate. Project Server then admits fresh compatible output into the Change-owned private integration lineage using expected-head compare-and-swap. Gate pass, integration pending, integrated, stale, and conflicted remain distinct states. A stale base, merge conflict, changed output, or lost custody requires a new Candidate and Gate; no Result is transferred to changed bytes.

The Change remains in Implementation until every required Work Unit has a current passing Gate, every required output is integrated, dependency closure is satisfied, acceptance coverage is complete, and one exact aggregate lineage head can be frozen. Only that deterministic completion condition advances the Change to Review. Unit Gates prove local realization; they do not certify cross-unit behavior or protected delivery. Project Server owns Claims, dispatch, integration, persistence, completion reduction, recovery, transitions, and effects. Checks owns shared execution and Gate mechanics.
