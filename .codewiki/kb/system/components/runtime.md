---
type: System Component
title: Runtime
description: Owns per-project authority, provenance, admission, scheduling, persistence, synchronization, Integration, recovery, lifecycle, and effects.
status: stable
tags: [system, component]
codewiki_component: runtime
codewiki_source_patterns: ["src/runtime/**", "src/git/**", "src/utils/**"]
codewiki_test_patterns: ["tests/runtime/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Runtime supplies authoritative coordination and guarded progression.
  - type: realizes
    target: /product/stories/maintainer/account-for-drift.md
    rationale: Runtime classifies every observed Candidate and Git state by positive provenance proof.
---
# Runtime

Runtime is the authoritative per-project control plane. It owns identity, admission, actor and authority binding, time, digests, freshness, expected-head CAS, provenance, scheduling, claims, Runtime-owned workbenches, workers, Integration, persistence, synchronization, recovery, lifecycle, final routing, and guarded effects.

Runtime invokes exactly three semantic Loops—Decision, Planning, and Implementation—plus shared Verification and neutral Managed Execution ports. Loops own Candidate meaning and route recommendations; Verification owns common policy and evaluation machinery; Runtime alone admits attempts, creates canonical Results, selects final routes, and performs effects.

Runtime recognizes controlled provenance only when an exact Candidate Manifest matches persisted custody. Managed provenance adds a complete Pi execution receipt. MCP-mediated Agent Host work binds admitted operations and workbench identity without claiming complete prompt or agent-loop proof. Any observed tree without matching custody is external provenance, regardless of branch, author, trailer, note, or claimed producer.

External Git state is captured without changing the accepted head, then either admitted against an exact accepted Change or normalized through Change Intake when intent or scope is missing. It receives no inherited execution proof and undergoes fresh policy resolution and Verification. Divergence pauses protected effects; Runtime never silently adopts, overwrites, discards, or certifies it.

Every controlled Candidate producer uses a Runtime-owned isolated worktree. Runtime may claim independent ready Work Items up to `maxWorkers`, dispatch one bounded assignment per worktree through its durable coordinator, recover or cancel that exact job, persist one immutable report, integrate compatible outputs deterministically, and verify the combined Candidate. No direct claim-to-session starter or Host-executed handoff protocol may bypass Runtime scheduling, worktree preparation, report recovery, or claim release. Workers and Agent Clients cannot schedule canonical descendants, share mutable workspaces, write canonical state, or perform guarded effects.
