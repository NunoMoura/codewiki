---
type: System Component
title: Clients
description: Owns deterministic user-facing interaction, model selection, and host-native assisted Check authoring without semantic or Runtime authority.
status: stable
tags: [system, component]
codewiki_component: clients
codewiki_source_patterns: ["src/clients/**"]
codewiki_test_patterns: ["tests/clients/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/agent/retrieve-bounded-context.md
    rationale: Clients supplies the System responsibility required by this Story.
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Clients supplies deterministic Check configuration and assisted authoring required by this Story.
---
# Clients

Clients present bounded state, context, attention, explanations, exact Change dossiers, Check configuration, and model-route selection. They translate authenticated user actions into typed Runtime requests and render returned facts without inventing status, causality, confidence, completion, or authority.

Regular Check UX is deterministic: it edits tracked Pack files, selects Development stage, scope, inputs, model route, and enforcement, validates the resolved configuration, and runs shadow evaluation against exact Candidates. Model calls occur only when the user explicitly requests Assisted Check Authoring or when Runtime executes a selected Model Check.

Assisted Check Authoring is one user-facing capability implemented by a host-native `codewiki-check-author` skill. The active Harness model inspects project context, drafts `CHECK.*` and sparse configuration, invokes the same production validators and sandbox, shows exact diffs and resolved choices, and defaults new Checks to `observe`. Direct skill invocation and a client action such as “Help me create this Check Pack” enter the same workflow. Without an active Harness, deterministic forms and raw developer mode remain available but AI assistance is unavailable.

Clients display the active authoring model separately from the configured evaluator route and never select one as an implicit substitute for the other. Developer mode exposes raw files, schemas, resolved inputs, sandbox diagnostics, digests, current-Candidate dry runs, and historical replay without granting additional execution or policy authority.

CLI, dashboard, Pi, and future interaction transports share no hidden Candidate producer, Check evaluator, worker, scheduler, canonical store, credential store, or provider authority. All generated or edited files remain ordinary project source truth rather than client-local state.
