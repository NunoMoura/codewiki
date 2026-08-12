---
type: System Component
title: Managed Execution
description: Adapts Runtime-issued bounded execution through pinned Pi SDK sessions while keeping CodeWiki authority outside the agent loop.
status: stable
tags: [system, component]
codewiki_component: execution
codewiki_source_patterns: ["src/execution/**"]
codewiki_test_patterns: ["tests/execution/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Managed Execution supplies isolated accountable agent work for Runtime-issued assignments.
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Managed Execution supplies isolated model evaluation and assisted authoring without Result authority.
---
# Managed Execution

Managed Execution is CodeWiki's sole shipped fully controlled agent and model execution path. Neutral internal ports describe Candidate production, worker execution, repair, research, assisted authoring, model evaluation, cancellation, usage, structured output, repository access, and isolation. The concrete adapter uses a pinned Pi SDK; CodeWiki makes no initial multi-engine execution promise.

CodeWiki owns assignment, claim, bounded context, model-route policy, tools and resources, agent directory, workbench identity, budgets, cancellation intent, output custody, Candidate admission, Integration, and Verification. Pi owns provider interaction, agent-loop sequencing, session messages, streaming, compaction, retries, and SDK session lifecycle. Pi session history is disposable and never canonical project continuity.

Every managed session uses an explicit ResourceLoader, explicit tool allowlist, isolated agent directory, isolated Runtime-owned worktree, CodeWiki context envelope, bounded model route, and ambient prompt, extension, skill, setting, and project-agent discovery disabled. An execution receipt binds Pi version, route, tool manifest, context, claim, worktree, source base, timing, cancellation, usage, and output identity. Missing exact capability becomes unavailable or indeterminate and never causes ambient fallback or policy relaxation.
