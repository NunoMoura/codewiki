---
type: System Component
title: Runtime
description: Owns generic scheduling, identity, admission, persistence, synchronization, claims, Integration, recovery, lifecycle, and effects.
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

For each selected Check, Runtime constructs a bounded invocation from the exact Candidate, Resolved Exit Policy, admitted repository context, Knowledge, and Evidence. It validates evaluator identity, route, input, isolation, freshness, provenance, and bounded output before creating a canonical Check Result. It verifies admissibility rather than the semantic truth of arbitrary model or package code.

`pass`, `fail`, and `indeterminate` are evaluator outcomes; unavailable capability, pending execution, exclusion, staleness, and unresolved policy are Runtime or projection states. Required failure or indeterminacy blocks exit, while advisory findings return bounded feedback to the active Harness. Repair creates a new Candidate, invalidates stale Results, and repeats policy resolution and evaluation before Runtime may route to another Development stage or guarded effect.
