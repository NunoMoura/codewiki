---
type: System Component
title: Clients
description: Owns user-facing CLI, dashboard, and Pi interaction adapters without semantic or Runtime authority.
status: stable
tags: [system, component]
codewiki_component: clients
codewiki_source_patterns: ["src/clients/**"]
codewiki_test_patterns: ["tests/clients/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/agent/retrieve-bounded-context.md
    rationale: Clients supplies the System responsibility required by this Story.
---
# Clients

Clients present bounded state, context, attention, explanations, and exact Change dossiers. They translate authenticated user actions into typed Runtime requests and render returned facts without inventing status, causality, confidence, or completion.

CLI, dashboard, Pi, and future interaction transports share no hidden Candidate producer, Model Check, worker, scheduler, canonical store, or provider authority.
