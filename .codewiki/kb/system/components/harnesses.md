---
type: System Component
title: Harnesses
description: Implements Runtime-selected Candidate producer, Model Check, and worker execution ports.
status: stable
tags: [system, component]
codewiki_component: harnesses
codewiki_source_patterns: ["src/harnesses/**"]
codewiki_test_patterns: ["tests/harnesses/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Harnesses supplies the System responsibility required by this Story.
---
# Harnesses

A harness adapts an execution environment to typed producer, Model Check, or worker ports. Every adapter declares semantic candidate production, model evaluation, repository read, workbench mutation, structured output, cancellation, usage reporting, and session isolation capabilities.

Missing capability becomes unavailable or indeterminate and never weakens policy. Harnesses cannot own Loop semantics, Runtime scheduling, canonical writes, guarded effects, or provider authentication. Pi is the first adapter, not a privileged core dependency.
