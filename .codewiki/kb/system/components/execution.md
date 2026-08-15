---
type: System Component
title: Managed Execution
description: Adapts Runtime-issued bounded work and Checks through pinned Pi SDK and sandbox sessions while keeping authority outside execution.
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
    rationale: Managed Execution supplies isolated Code and Model Check transports without Result authority.
  - type: realizes
    target: /product/stories/check-author/author-composable-checks.md
    rationale: Managed Execution supplies the immutable query context and sandbox boundary required by authored Code Checks.
---
# Managed Execution

Managed Execution is CodeWiki's sole shipped fully controlled agent and model execution path. Neutral internal ports describe Candidate production, Worker execution, exact Pack Skill delivery, research, Code Checks, Model Checks, cancellation, usage, structured output, snapshot-bound repository and Alignment access, and isolation. Pack Skills and Check SDK contexts remain host-neutral contracts even though the first concrete managed model adapter uses a pinned Pi SDK; CodeWiki makes no initial multi-engine execution promise.

A Worker is an Agent, process, or service executing one bounded Assignment. A Worker Offer advertises bounded tools, skills, model-route labels, availability, concurrency, ownership, and allowed projects; it grants neither actor authority nor scheduling rights. Physical machine placement remains Worker metadata until machine-level capacity, health, draining, or multi-Worker placement requires a separate Worker Node concept.

A Model Provider supplies local or remote inference. It is distinct from Worker and Model Check: Worker owns the work-producing agent loop, tools, Workbench, and Candidate; Model Check owns no agent tools or Candidate production; Model Provider owns inference only. Personal model credentials remain in existing user tooling or trusted provider boundaries. CodeWiki stores bounded route identities and opaque references rather than ingesting personal credentials.

CodeWiki owns Assignment, Claim, bounded context, model-route policy, tools and resources, agent directory, Workbench identity, budgets, cancellation intent, output custody, Candidate admission, Integration, Check Result admission, Gate state, and fixed lifecycle. Managed Execution starts a Pi session only from one validated Runtime Assignment or Model Check request carrying exact isolation and bounded input. It cannot claim Work Items, create Assignments, select stages, create authoritative Results, or schedule itself. Pi owns provider interaction, session streaming, retries inside one bounded request, and SDK session lifecycle. Pi session history is disposable and never canonical project continuity.

Every managed Worker session uses an explicit ResourceLoader, tool allowlist, isolated agent directory, Runtime-owned worktree, CodeWiki context envelope, bounded model route, and disabled ambient prompts, extensions, settings, project-agent discovery, and ambient Skills. Runtime deliberately supplies only the exact immutable Pack Skills selected for that stage. Their standard metadata and resources may shape producer behavior, but `allowed-tools`, scripts, and setup guidance operate only through capabilities already admitted for the Assignment. A Pack Skill cannot add credentials, network, canonical writes, lifecycle authority, or effects.

Every Model Check uses a separate tool-free session and route policy, with no Worker Skill, memory, or fallback. Every Code Check runs through an admitted sandbox, receives no Pack Skill, and never falls back to host execution. Its Check SDK context exposes only declared immutable OKF, repository, code, test, revision, pull-request Evidence, Change, and Alignment snapshots through bounded read-only queries. Pure imported libraries, Probes, and composed Checks execute from the self-contained bundle inside the same sandbox. Execution receipts bind route or runtime, exact Skill digests for producer work or SDK/snapshot identities for Code Checks, input, tool manifest where applicable, source base, timing, cancellation, usage, output, and isolation identity.

Missing capability, timeout, cancellation, invalid structured output, unavailable sandbox or model, exhausted budget, or failed input collection returns a bounded stopped execution fact. It never crashes Runtime, silently relaxes policy, creates a Check Result, or supplies fabricated semantic feedback. Checks may retry transient failures within a bounded policy before recording a stopped Gate.

Pi-specific Project Runtime daemon composition and process spawning live under `src/execution/pi/**`. That adapter supplies semantic ports and managed Worker and Model Check adapters to generic Runtime and Checks callers. Clients request a connection through an injected port; only neutral Package bootstrap imports both Client registration and the concrete spawner. Neither Client, Runtime, nor Checks imports concrete Pi implementation values.
