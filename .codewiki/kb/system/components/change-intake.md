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
    rationale: Change Intake gives external and out-of-scope discoveries a visible accountable path.
---
# Change Intake

Change Intake accepts bounded authenticated material from people, channels, provider issues, Discovery Findings, Implementation Workers, regressions, security findings, delivery observations, Knowledge drift, Outcome Diagnostics, and External Candidate Captures. Submitted content is untrusted and cannot supply canonical identity, authority, time, priority, destination, scope acceptance, or Check outcome.

Project Server authenticates, sanitizes, normalizes, deduplicates, and sends material to its bounded destination. An external code capture already matching one accepted Change may enter Candidate admission directly; missing intent or out-of-scope material enters intake, triage, proposed Change, and explicit acceptance before realization. Intake never selects Decision attention or silently expands current scope.

Outcome Diagnostics run only after a Gate or across bounded retained outcome history. They may identify repeated failure patterns or propose exact diffs to Skills, Checks, stage-context queries, model routes, budgets, or project configuration. They never repair the current Candidate, reinterpret a Result, mutate project files, or gain privileged self-evolution authority. Every suggestion remains ordinary Change Intake Material and must traverse Decision, Planning, Implementation, Review, and normal expected-head authorization before taking effect.
