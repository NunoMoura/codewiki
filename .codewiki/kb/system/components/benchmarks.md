---
type: System Component
title: Benchmarks
description: Measures harness outcomes with and without CodeWiki against external fixtures and safety oracles.
status: stable
tags: [system, component]
codewiki_component: benchmarks
codewiki_source_patterns: ["benchmarks/**"]
codewiki_test_patterns: ["tests/benchmarks/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Benchmarks supplies the System responsibility required by this Story.
---
# Benchmarks

Repository-root benchmarks compare each supported executable harness in paired `alone` and `codewiki` modes. Trials control repository snapshot, task, harness, model, provider, tools, network, budget, timeout, concurrency, retries, environment, and trial count.

External fixtures and oracles determine truth. Benchmarks measure task success, intent coverage, false exits and blocks, Evidence completeness, repairs, interventions, recovery, time, and cost. They cannot generate Candidates, mutate source, select Changes, schedule Loops, promote releases, or duplicate semantic policy.
