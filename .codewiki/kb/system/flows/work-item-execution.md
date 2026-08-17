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

Runtime grants one exact Work Item Claim, selects an eligible Implementation Worker from current Worker Offers and policy, creates and verifies one isolated Workbench, freezes exact Implementation Stage Context, snapshots optional Pack Skills, persists one Assignment and Run Specification binding their digests, and schedules a Backend Agent Run, eligible Delegated Agent Run, or admitted External Agent Client Workbench operation through a durable coordinator job. The Worker reads only permitted snapshot-bound context, may use Skills only through already admitted capabilities and an adapter that can prove their exact supplied bytes, and mutates only the assigned Workbench. Every operation binds project, Change, attempt, Claim, Workbench, expected tree, idempotency, custody class, and bounded capability. Missing Workbench custody blocks dispatch before Worker invocation; no direct Agent Runner starter or manual Server handoff may substitute for the job.

A Backend Agent Run returns a complete receipt covering exact DSH and Backend Plugin closure, prompts, Skills, tools, model route, context, queries, compaction, raw session evidence, usage, output, and isolation. A Delegated Agent Run returns exact dispatch, adapter, process lifecycle, configuration policy, Workbench base and result, final output, optional child-trace digest, and declared custody gaps. External-client work returns exact authenticated CodeWiki operations and Workbench custody without claiming complete external prompt, tool, Skill, local-read, subagent, model, code-runtime, or memory proof. Runtime records one Candidate Manifest, integrates only fresh compatible output by expected-head compare-and-swap, runs the Implementation Gate, and advances a passing integrated head to Review.

Implementation Workers cannot grant Claims, schedule canonical descendants, share mutable Workbenches, renew authority implicitly, write canonical state, create authoritative Check Results, or perform guarded effects. Claim loss, cancellation, isolation failure, malformed output, base drift, or changed custody prevents Integration or stops the affected attempt without crashing Runtime.
