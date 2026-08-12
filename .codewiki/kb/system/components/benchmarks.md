---
type: System Component
title: Benchmarks
description: Measures externally-oracled product outcomes with and without CodeWiki under controlled execution conditions.
status: stable
tags: [system, component]
codewiki_component: benchmarks
codewiki_source_patterns: ["benchmarks/**"]
codewiki_test_patterns: ["tests/benchmarks/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Benchmarks independently measure whether CodeWiki improves safe accountable delivery.
---
# Benchmarks

Repository-root Benchmarks compare the same supported agent, model route, task, repository snapshot, tools, network, budget, timeout, concurrency, retries, environment, and trial count in paired `alone` and `codewiki` modes.

External fixtures and oracles determine truth. Benchmarks measure task success, intent coverage, false exits and blocks, Evidence completeness, repair success, interventions, recovery, time, and cost. Operational discovery uses Discovery Findings or explicit Improvement Assessments instead. Benchmarks cannot generate canonical Candidates, mutate product source, select Changes, schedule Loops, promote releases, or duplicate Verification policy.
