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

Managed Execution is CodeWiki's sole shipped fully controlled agent and model execution path. Neutral internal ports describe Candidate production, Worker execution, repair, research, assisted authoring, model evaluation, cancellation, usage, structured output, repository access, and isolation. The concrete adapter uses a pinned Pi SDK; CodeWiki makes no initial multi-engine execution promise.

A Worker is an Agent, process, or service executing one bounded Assignment. A Worker Offer advertises bounded tools, skills, model-route labels, availability, concurrency, ownership, and allowed projects; it grants neither actor authority nor scheduling rights. Physical machine placement remains Worker metadata until machine-level capacity, health, draining, or multi-Worker placement requires a separate Worker Node concept.

A Model Provider supplies local or remote inference. It is distinct from Worker: Worker owns the agent loop, tools, Workbench, checks, and Candidate, while Model Provider owns inference. Personal model credentials remain in existing user tooling or trusted provider boundaries; CodeWiki stores bounded route identities and opaque references rather than ingesting personal credentials.

CodeWiki owns Assignment, Claim, bounded context, model-route policy, tools and resources, agent directory, Workbench identity, budgets, cancellation intent, output custody, Candidate admission, Integration, and Verification. Managed Execution starts a Pi session only from one validated Runtime Assignment that carries exact isolated-Workbench custody; it cannot claim Work Items, create Assignments, or schedule itself. Pi owns provider interaction, agent-loop sequencing, session messages, streaming, compaction, retries, and SDK session lifecycle. Pi session history is disposable and never canonical project continuity.

Every managed session uses an explicit ResourceLoader, explicit tool allowlist, isolated agent directory, isolated Runtime-owned worktree, CodeWiki context envelope, bounded model route, and ambient prompt, extension, skill, setting, and project-agent discovery disabled. An execution receipt binds Pi version, route, tool manifest, context, claim, worktree, source base, timing, cancellation, usage, and output identity. Missing exact capability becomes unavailable or indeterminate and never causes ambient fallback or policy relaxation.

Pi-specific Project Runtime daemon composition and process spawning live under `src/execution/pi/**`. That adapter supplies semantic ports and managed Worker adapters to the generic Runtime daemon. Clients request a connection through an injected port; only neutral Package bootstrap imports both the Client registration and concrete spawner. Neither Client nor Runtime owns or imports the concrete Pi implementation.
