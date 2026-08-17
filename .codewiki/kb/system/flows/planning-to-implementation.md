---
type: System Flow
title: Planning to Implementation
description: Gates ordered Planning, claims eligible Work Items, and integrates exact realization Candidates against current accepted meaning.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Planning to Implementation provides the stable cross-component behavior required by this Story.
---
# Planning to Implementation

Project Server runs the Planning Gate over the exact Planning Candidate and `.codewiki/check-packs/planning/**` snapshot. Failure returns atomic feedback to Planning; stopped execution preserves current state. A passed Gate advances through the fixed lifecycle to Implementation.

Project Server projects eligible Work Items from accepted Planning and current WorkState, acquires bounded Claims, and selects current Implementation Worker placement from requirements, Worker Offers, custody requirements, policy, consent, privacy, and budget. It dispatches each Assignment to one Project Server-owned isolated Workbench as a Run, an eligible Delegated Run, or an admitted External Agent Client operation through MCP. Implementation Candidates bind exact obligations, source, tests, Knowledge, configuration, Git base, Workbench custody, execution custody class, and provenance.

Project Server integrates only fresh compatible Candidates. Claim loss, base drift, conflicting work, incomplete receipts, or unsupported capability cannot alter canonical state. Recoverable failures receive bounded retries; otherwise the Implementation attempt stops with an exact reason. Semantic realization failures return atomic Check feedback to Implementation through the fixed lifecycle.
