---
type: System Component
title: Planning
description: Owns Change-scoped Work Graph deltas, realization obligations, Planning Candidate semantics, and Planning attempt interpretation.
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

Planning decomposes one ratified Change into one immutable Change-scoped Work Graph delta. Its Candidate contains Work Units, internal and cross-Change dependency edges, acceptance-coverage mappings, Knowledge obligations, technical and integration requirements, and explicit non-executable resolutions. It reads the accepted global Work Graph but never regenerates a project-wide plan or silently replaces unrelated accepted work. Project Server owns the canonical global graph as the union of accepted Change-scoped deltas.

Every Work Unit has exactly one owning Change and declares outcome, scope, acceptance obligations, dependency requirements, required capabilities, tools, Skills, custody, and verification. Planning declares strategic parallelism and resource requirements; it never selects a person, Implementation Worker, machine, Run Process, delegated harness, Model Provider, live capacity, or schedule. Cross-Change reuse uses explicit dependency edges. Shared foundational work normally becomes its own Change rather than a multi-owned Work Unit.

A Planning Gate validates exact coverage of ratified Change obligations, right-sized independently judgeable units, an acyclic dependency graph, explicit ordering for overlapping scopes, cross-Change compatibility, declarative resources, and aggregate Review obligations. One Change-scoped Planning DSH Agent Session may span several bounded Runs and material refreshes across Candidate feedback. Skills may guide decomposition but cannot alter ratified meaning, choose placement, or affect Gate authority. Editable Planning Checks independently run through the shared Checks Gate.

A passed Planning Candidate is a proposed graph delta, not a new global plan. Project Server applies it only when the ratified Change revision and observed Work Graph head still match, using expected-head compare-and-swap and deterministic graph validation. Accepted Work Units are immutable. Changing, replacing, or superseding existing accepted work requires an explicit traced Planning amendment owned by its Change; claimed or executing work is never silently rewritten. After successful application, Project Server derives ready Work Units and owns durable scheduling, Claims, Assignments, persistence, and placement. Runtime executes only exact admitted Runs.
