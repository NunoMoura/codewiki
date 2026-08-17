---
type: System Flow
title: Decision to Planning
description: Transfers passed approved meaning into ordered realization obligations without allowing Planning to rewrite intent.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/maintain-intent.md
    rationale: Decision to Planning provides the stable cross-component behavior required by this Story.
---
# Decision to Planning

Runtime reads one exact Decision Candidate and runs the Decision Gate against the current Change revision, stage-context snapshot, Knowledge transition, and `.codewiki/check-packs/decision/**` snapshot. A failed Gate returns its atomic feedback to durable WorkState for Decision. A stopped Gate preserves current state. A passed Gate makes that exact Candidate eligible for confirmation but accepts no meaning by itself. An authorized actor confirms the unchanged Candidate and Gate digest against current WorkState; only confirmed `approve` accepts intended state and advances through the fixed lifecycle to Planning. Confirmed `reject`, `defer`, or `withdraw` follows its typed terminal or deferred meaning. Any Candidate edit requires a fresh Gate.

Planning decomposes accepted meaning into Work Items, dependencies, acceptance criteria, and Knowledge realization obligations. If Planning discovers ambiguous intent, changed risk, conflicting authority, or a semantic Knowledge change, it records the issue without silently reinterpreting the approved Candidate; changing accepted meaning requires a new Decision operation.
