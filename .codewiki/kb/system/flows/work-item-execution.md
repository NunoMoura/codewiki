---
type: System Flow
title: Work Item Execution
description: Executes one claimed Work Item through an isolated harness worker and returns bounded artifacts for Integration.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Work Item Execution provides the stable cross-component behavior required by this Story.
---
# Work Item Execution

Runtime grants one exact Work Item claim, creates an isolated workbench, and dispatches a capability-matched worker. The worker may read permitted repository state and mutate only its workbench, then returns structured Candidate material, usage, cancellation, and artifact identity.

Workers cannot renew authority implicitly, schedule descendants, write canonical state, or perform guarded effects. Expired claims, cancellation, isolation failure, malformed output, or changed bases make the result unavailable for Integration.
