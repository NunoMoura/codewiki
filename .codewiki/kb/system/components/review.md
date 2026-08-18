---
type: System Component
title: Review
description: Owns exact aggregate Change review, Review-stage context, and feedback handoff before guarded delivery.
status: stable
tags: [system, component]
codewiki_component: review
codewiki_source_patterns: ["src/loops/review/**"]
codewiki_test_patterns: ["tests/loops/review/**", "tests/loops/contracts.test.mjs"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Review supplies the final repeatable stage between integrated realization and guarded delivery.
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Review applies project-owned delivery Checks to one exact aggregate Change lineage.
---
# Review

Review is the fourth semantic Stage Loop. It starts only after every required Work Unit for one Change has a current passing Implementation Gate, integrates successfully into the Change-owned private lineage, satisfies dependency closure, and covers accepted Planning obligations. Review assesses that exact immutable aggregate tree and head, normally correlated with one integrated pull request when a provider is configured. Pull requests are common review membranes, not required transports or authority.

A Review attempt binds the ratified Change revision, accepted Planning delta, all contributing Work Unit and Candidate identities, exact integration lineage and target base, current Project Material Generation, frozen Gate Evaluation Package and Review Check Pack snapshot, optional Review Pack Skill, producer receipt, provider Check receipts, and admitted Review Evidence. The Review producer uses a fresh independent continuity scope and never reuses an Implementation Session. Code Checks inspect deterministic receipts and exact bytes without producer memory. Every Model Check uses its own fresh tool-free session. Human Review Submissions are optional Evidence unless project Checks require them.

Review proves what independent Work Unit Gates cannot: the complete ratified Change outcome, cross-unit interactions, aggregate acceptance criteria, full build and integration behavior, scope discipline, provenance, and delivery readiness. Review does not mutate source. A failed Gate normally reopens affected Work Unit Implementation. A decomposition defect requires an explicit Planning amendment; changed or contradictory intent requires a new Decision operation. Project Server applies these typed ownership routes and never accepts a model-selected transition. Any new aggregate head invalidates prior Review Results.

A passed Review Gate permits Project Server to consider guarded merge or delivery only under current authority, provenance, freshness, branch policy, and expected-head compare-and-swap. A stopped Gate preserves state and exposes recovery. Out-of-scope findings become bounded Change Intake Material. Post-Gate Outcome Diagnostics may propose ordinary Changes to Skills, Checks, queries, context, routes, or configuration; they cannot mutate the reviewed head or reinterpret its Gate. Full automation comes from prior User-configured authority plus an exact passed Review Gate, never Agent identity or provider metadata.
