---
type: Concept
title: Enforce User Standards
description: As a maintainer, I want CodeWiki to distill source-backed User Standards into bounded Custom Checks so project-specific expectations are evaluated independently of producer Skills.
tags:
  - codewiki
  - product
  - story
timestamp: 2026-08-01T00:00:00Z
---
# Enforce User Standards

As a maintainer, I want to provide project expectations as bounded text or exact source bindings and have CodeWiki distill them into reviewable Custom Checks, so company policy, design rules, resource limits, API conventions, and other requirements are enforced without asking me to author evaluator machinery.

## Acceptance signals

- Assurance accepts a bounded inline User Standard or an exact user-selected source binding; direct requirement entry is treated as an inline Standard rather than a parallel manual-Check path.
- Runtime owns read-only source retrieval, sanitation, exact content/snapshot identity, freshness, credential isolation, and privacy handling. Models never receive source credentials or unrestricted connector tools.
- Distillation identifies atomic clauses and exact passages, reports Default Check coverage, proposes Custom Model or approved-template Custom Code Checks, and preserves unsupported, ambiguous, contradictory, stale, and excluded clauses.
- Default versus Custom describes requirement origin. Code versus Model describes evaluation. Decision, Planning, and Implementation describe Loop applicability.
- Every Custom Check binds one or more exact accepted User Standard snapshots and remains one concise atomic requirement under a closed CodeWiki-owned Check Type.
- Distillation cannot activate Standards or Checks, choose authority, assign Results, or mutate protected configuration. Protected review shows every source-to-Check mapping before acceptance.
- Custom Model Checks use independent bounded Assessments. Custom Code Checks may instantiate only approved deterministic templates/adapters with structured parameters; users and models cannot inject executable code, shell, prompts, tools, schemas, dependencies, or verdict logic.
- Hard resource clauses may produce Planning-feasibility and Implementation-usage Custom Code Checks plus Runtime-derived guards from the same exact Check binding. Missing required measurement or enforcement capability fails closed.
- Ordering preferences affect the deterministic Backlog Triage Projection rather than becoming pass/fail Checks. Lower priority is not Check failure.
- Planning verifies accepted execution requirements without independently reinterpreting broad company sources. Newly discovered semantic conflicts route back to Decision.
- Runtime owns stable Standard/Check identity, source/definition/config digests, guarded lifecycle, deterministic applicability, evaluator route, Assessment validation, Check Result, Runtime guards, and exit behavior.
- Lifecycle is `draft | active | disabled`; every applicable active Custom Check is required and its `fail` or `indeterminate` Result blocks Loop exit.
- Accepted Standard snapshots and generated Check configuration are protected Git-backed project truth, not browser state, model memory, or a mutable registry.
- Guarded mutation requires exact current/protected config CAS, protected source head, authenticated authority, bounded idempotency, and a content-addressed receipt.
- Protected acceptance requires exact review `pass`, separate acceptance authority, repository/protected-ref binding, a config-only child commit, expected-head Git CAS, and exact post-push verification.
- A Candidate changing User Standard or Custom Check policy remains evaluated against the exact protected-base configuration and cannot weaken its own assurance; accepted changes apply only from the next protected snapshot.
- Skills may help producers satisfy Custom Checks but cannot distill, activate, pass, disable, or weaken them.

## Related docs

- [User Standards and Custom Checks](../../system/components/custom-checks.md)
- [Loop Contracts](../../system/components/loop-contracts.md)
- [Loop Exit](../../system/components/loop-exit.md)
- [Model Routing](../../system/components/model-routing.md)
- [Dashboard](../uis/terminal.md)
