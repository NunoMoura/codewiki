---
type: System Flow
title: Work Item Execution
description: Executes one claimed Work Item through an isolated Runtime-owned workbench and returns a provenance-bound Candidate for Integration and Gates.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Work Item Execution provides isolated accountable realization.
---
# Work Item Execution

Runtime grants one exact Work Item Claim, selects an eligible Worker from current Worker Offers and policy, creates and verifies one isolated Workbench, persists one exact Assignment packet, and schedules either Managed Execution or an admitted MCP Worker operation through a durable coordinator job. The Worker reads only permitted context and mutates only the assigned Workbench. Every operation binds project, Change, attempt, Claim, Workbench, expected tree, idempotency, and bounded capability. Missing Workbench custody blocks dispatch before Worker invocation; no direct session starter or manual Server handoff may substitute for the job.

Managed Pi work returns a complete execution receipt. MCP-mediated work returns exact admitted-operation and Workbench custody without claiming complete external prompt or Agent-loop proof. Runtime records one Candidate Manifest, integrates only fresh compatible output by expected-head compare-and-swap, runs the Implementation Gate, and advances a passing integrated head to Review.

Workers cannot grant Claims, schedule canonical descendants, share mutable Workbenches, renew authority implicitly, write canonical state, create authoritative Check Results, or perform guarded effects. Claim loss, cancellation, isolation failure, malformed output, base drift, or changed custody prevents Integration or stops the affected attempt without crashing Runtime.
