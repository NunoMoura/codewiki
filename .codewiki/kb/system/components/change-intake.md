---
type: System Component
title: Change Intake
description: Accepts bounded untrusted intent, Discovery Findings, provider issues, and external Git Candidate material for accountable triage.
status: stable
tags: [system, component]
codewiki_component: change-intake
codewiki_source_patterns: ["src/changes/intake/**", "src/changes/triage/**", "src/changes/defect-profile.ts"]
codewiki_test_patterns: ["tests/changes/change-intake*.test.mjs", "tests/changes/backlog-triage.test.mjs"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/maintain-intent.md
    rationale: Change Intake turns untrusted proposals and discovered work into accountable intent.
  - type: realizes
    target: /product/stories/maintainer/account-for-drift.md
    rationale: Change Intake gives external and out-of-scope discoveries a visible accountable route.
---
# Change Intake

Change Intake accepts bounded authenticated material from people, channels, provider issues, Discovery Findings, workers, regressions, security findings, delivery observations, Knowledge drift, and External Candidate Captures. Submitted content is untrusted and cannot supply canonical identity, authority, time, priority, route, scope acceptance, or Check outcome.

Runtime authenticates, sanitizes, normalizes, deduplicates, and destination-routes material. An external code capture already matching one accepted Change may enter Candidate admission directly; missing intent or out-of-scope material enters intake, triage, proposed Change, and explicit acceptance before realization. Intake never selects Decision attention or silently expands current scope.
