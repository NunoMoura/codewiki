---
type: System Component
title: Review
description: Owns exact-head delivery review attempts, Review-stage context, and feedback handoff before guarded delivery.
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
    rationale: Review applies project-owned delivery Checks to one exact integrated revision.
---
# Review

Review is the fourth semantic Stage Loop. It assesses one exact integrated Implementation revision, normally correlated with one integrated pull request when a provider is configured, against Review-stage Check Packs and current delivery Evidence. Pull requests are common review membranes, not required transports and not authority by themselves.

A Review attempt binds the exact integrated tree and head, target branch, contributing Change and Work Item identities, current Stage Context and Check Pack snapshots, any exact optional Review Pack Skill snapshot supplied through an eligible producer route, that route's Run Request and custody-scoped receipt, provider Check receipts, and admitted Review Evidence. Skill identity remains separate from Gate Check identity. Code Checks may inspect deterministic receipts and the exact revision but never inherit the Review producer's Skill, tools, context, or memory. Model Checks provide independent automated review through the separately configured Check model route. Human Review Submissions are optional Evidence: projects may require them through a Check, combine them with automated review, or omit them for a fully automated cycle.

Review does not mutate source. A failed Review Gate sends each atomic Check failure and its one feedback contract to Implementation. Implementation creates a new integrated revision, which starts a new Review attempt against a fresh head and Pack snapshot. A passed Review Gate permits Project Server to consider guarded merge or delivery under current authority, provenance, freshness, branch policy, and expected-head compare-and-swap. A stopped Review Gate preserves current state and exposes recovery without pretending the revision failed a project requirement.

Review findings outside accepted scope become bounded Change Intake Material without changing the primary lifecycle or silently expanding the current Change. Post-Gate Outcome Diagnostics may separately propose ordinary Changes to future Skills, Checks, context APIs, routes, or configuration; they cannot mutate the reviewed head or reinterpret its Gate. Branch names, authors, labels, provider conclusions, Agent identity, and model identity cannot grant approval or delivery authority. Full automation comes from prior User-configured authority plus a passed Review Gate, not from treating Agent output as human approval.
