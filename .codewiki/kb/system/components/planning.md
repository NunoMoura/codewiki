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

A Work Item declares required capabilities, tools, skills, scope, dependencies, and acceptance criteria without selecting a person, Worker, machine, or model provider. Runtime matches current Worker Offers and policy, then creates one exact Assignment binding the Work Item, selected Worker, and Runtime-owned Workbench. Planning declares requirements; Runtime selects placement.

Planning owns Candidate and attempt semantics under `src/loops/planning/**`. Runtime supplies any exact optional Planning Pack Skills to the work-producing Agent; those Skills may guide decomposition but cannot alter accepted meaning, placement, or Gate authority. Editable Planning Checks live in the same `.codewiki/check-packs/planning/**` Packs and independently run through the shared Checks Gate. A failed Gate returns atomic feedback to Planning. A stopped Gate preserves current state and reports operational recovery. A passed Gate advances through Runtime's fixed lifecycle to Implementation. Runtime separately owns scheduling, Claims, Assignments, persistence, and current-state admission.
