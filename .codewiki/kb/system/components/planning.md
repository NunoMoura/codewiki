---
type: System Component
title: Planning
description: Owns ordered realization obligations, Planning Candidate semantics, and Planning attempt interpretation.
status: stable
tags: [system, component]
codewiki_component: planning
codewiki_source_patterns: ["src/loops/planning/**"]
codewiki_test_patterns: ["tests/loops/planning/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Planning supplies the System responsibility required by this Story.
---
# Planning

Planning turns approved Decision meaning into immutable ordered Work Items, dependencies, acceptance criteria, Knowledge obligations, task requirements, and explicit non-executable resolutions. Rolling Planning accounts for interactions across all accepted work without changing Change meaning.

A Work Item declares required capabilities, tools, Skills, scope, dependencies, acceptance criteria, and any required execution-custody properties without selecting a person, Implementation Worker, machine, Agent Runner, delegated harness, or Model Provider. Runtime later matches current Worker Offers and policy, then creates one exact Assignment binding the Work Item, selected Implementation Worker, and Runtime-owned Workbench. Planning declares requirements; Runtime selects placement.

Planning owns Candidate and attempt semantics under `src/loops/planning/**`. Runtime freezes exact Stage Context and binds any optional Planning Pack Skills to a Backend Agent Run or to a Delegated Agent Run whose adapter can prove the exact supplied material; External Agent Clients receive bounded equivalent context and submission operations through MCP. Skills may guide decomposition but cannot alter accepted meaning, placement, or Gate authority. Editable Planning Checks live in the same `.codewiki/check-packs/planning/**` Packs and independently run through the shared Checks Gate. A failed Gate returns atomic feedback to Planning. A stopped Gate preserves current state and reports operational recovery. A passed Gate advances through Runtime's fixed lifecycle to Implementation. Runtime separately owns scheduling, Claims, Assignments, persistence, and current-state admission.
