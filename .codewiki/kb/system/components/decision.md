---
type: System Component
title: Decision
description: Owns accepted-intent Candidate semantics, knowledge-impact assessment, and Decision attempt interpretation.
status: stable
tags: [system, component]
codewiki_component: decision
codewiki_source_patterns: ["src/loops/decision/**", "src/loops/candidate-admission.ts"]
codewiki_test_patterns: ["tests/loops/decision/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/maintain-intent.md
    rationale: Decision supplies the System responsibility required by this Story.
---
# Decision

Decision evaluates one authenticated exact Change revision. Its Candidate states desired meaning, alternatives, constraints, risks, and either an exact Knowledge transition or explicit unchanged-Knowledge references. Its typed `approve | reject | defer | withdraw` disposition remains part of Decision meaning rather than Check or Project Server policy.

Decision owns Candidate and attempt semantics under `src/loops/decision/**`. Project Server freezes exact Stage Context and binds any optional Decision Pack Skills to a Run or to a Delegated Run whose adapter can prove the exact supplied material; External Agent Clients receive bounded equivalent context and submission operations through MCP. Skills may guide evaluation but cannot select disposition or affect Gate authority. Editable Decision Checks live in the same `.codewiki/check-packs/decision/**` Packs and independently run through the shared Checks Gate, which never selects Project Server's fixed lifecycle rules. A failed Gate returns each atomic failure and its one feedback contract to durable WorkState for another Decision attempt. A stopped Gate preserves current state and reports operational recovery.

A passed Gate certifies only the exact Decision Candidate against present Checks. An authorized actor must separately confirm that unchanged Candidate and Gate digest against current WorkState before Project Server applies its disposition; changing any Candidate byte requires a fresh Gate. Confirmed `approve` accepts the proposed Knowledge transition and advances to Planning, while confirmed `reject`, `defer`, or `withdraw` follows its typed meaning. Discoveries that alter accepted meaning return here rather than being silently absorbed by Planning, Implementation, or Review.
