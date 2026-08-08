---
type: System Component
title: Change Intake
description: Accepts bounded untrusted improvement material and routes it into accountable Change proposals.
status: stable
tags: [system, component]
codewiki_component: change-intake
codewiki_source_patterns: ["src/changes/intake/**", "src/changes/triage/**", "src/changes/defect-profile.ts"]
codewiki_test_patterns: ["tests/changes/change-intake*.test.mjs", "tests/changes/backlog-triage.test.mjs"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/maintain-intent.md
    rationale: Change Intake supplies the System responsibility required by this Story.
---
# Change Intake

Change Intake accepts bounded authenticated material from users, provider issues, reviews, workers, regressions, security findings, delivery observations, outcomes, and Knowledge drift. Submitted content is untrusted and cannot supply canonical identity, authority, time, priority, route, or Check outcome.

Runtime authenticates, sanitizes, normalizes, deduplicates, and scope-routes material. Intake may propose or reinforce a Change, but never selects it for Decision or mutates accepted intent.
