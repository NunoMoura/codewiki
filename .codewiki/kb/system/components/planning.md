---
type: System Component
title: Planning
description: Owns ordered realization obligations, Planning Candidate semantics, Checks, and route recommendations.
status: stable
tags: [system, component]
codewiki_component: planning
codewiki_source_patterns: ["src/planning/**"]
codewiki_test_patterns: ["tests/planning/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Planning supplies the System responsibility required by this Story.
---
# Planning

Planning turns approved Decision meaning into immutable ordered Work Items, dependencies, acceptance criteria, Knowledge obligations, task requirements, and explicit non-executable resolutions. Rolling Planning accounts for interactions across all accepted work without changing Change meaning.

A Work Item declares required capabilities, tools, skills, scope, dependencies, and acceptance criteria without selecting a person, Worker, machine, or model provider. Runtime matches current Worker Offers and policy, then creates one exact Assignment binding the Work Item, selected Worker, and Runtime-owned Workbench. Planning declares requirements; Runtime selects placement.

Planning owns its Candidate, Checks, attempt composition, interpretation, and route recommendation. Runtime owns scheduling, Claims, Assignments, persistence, freshness, and final routing.
