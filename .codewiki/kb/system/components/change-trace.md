---
type: System Component
title: Change Trace
description: Owns append-only typed Change operation history, deterministic reduction, archive identity, and replay.
status: stable
tags: [system, component]
codewiki_component: change-trace
codewiki_source_patterns: ["src/changes/trace/**", "src/changes/*.ts"]
codewiki_test_patterns: ["tests/changes/**", "tests/traces/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/recover-history.md
    rationale: Change Trace supplies the System responsibility required by this Story.
---
# Change Trace

A Change Trace is append-only canonical history for one accountable intent carrier. Strict canonical bytes, typed operations, parent identity, authority binding, preconditions, and deterministic reduction make replay and synchronization verifiable. Change Trace Protocol `3.0.0` binds each authority-bearing operation to one accountable `actorId` and one proof-backed `authenticatedIdentityRef`; Client transport identity remains request provenance rather than canonical actor identity.

Terminal history may move from hot coordination into immutable archive segments only after exact digest acceptance. Hydration is read-only. Reopening creates a new accountable hot segment rather than rewriting archived history.
