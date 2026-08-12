---
type: System Flow
title: Work Item Execution
description: Executes one claimed Work Item through an isolated Runtime-owned workbench and returns a provenance-bound Candidate for Integration.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Work Item Execution provides isolated accountable realization.
---
# Work Item Execution

Runtime grants one exact Work Item claim, creates one isolated worktree, and dispatches either Managed Execution or an admitted MCP Agent Client assignment. The producer reads only permitted context and mutates only the assigned workbench. Every operation binds project, Change, attempt, claim, workbench, expected tree, idempotency, and bounded capability.

Managed Pi work returns a complete execution receipt. MCP-mediated work returns exact admitted-operation and workbench custody without claiming complete Agent Host prompt or loop proof. Runtime records one Candidate Manifest, integrates only fresh compatible output by expected-head CAS, and invokes Verification for the combined Candidate.

Workers and Agent Clients cannot schedule canonical descendants, share mutable workspaces, renew authority implicitly, write canonical state, or perform guarded effects. Claim loss, cancellation, isolation failure, malformed output, base drift, or changed custody makes output unavailable for Integration.
