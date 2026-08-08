---
type: System Component
title: Runtime
description: Owns generic scheduling, identity, persistence, synchronization, claims, Integration, recovery, lifecycle, and effects.
status: stable
tags: [system, component]
codewiki_component: runtime
codewiki_source_patterns: ["src/runtime/**", "src/git/**", "src/utils/**"]
codewiki_test_patterns: ["tests/runtime/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Runtime supplies the System responsibility required by this Story.
---
# Runtime

Runtime is the project-scoped control plane. It owns canonical identity, admission, actor and authority binding, time, digests, freshness, expected-head CAS, scheduling, claims, workers, Integration, recovery, persistence, synchronization, lifecycle, and guarded effects.

Runtime invokes exactly three semantic Loops—Decision, Planning, and Implementation—and shared Verification through injected ports. It does not own Loop-specific Candidate meaning, Checks, interpretation, or route recommendations. Every final route and effect revalidates exact current state and authority.
