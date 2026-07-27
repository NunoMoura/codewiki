---
type: Concept
title: Model Routing
description: Users bind Pi model routes to Decision, Planning, and three Implementation tiers while runtime selects the tier from structured execution facts.
tags:
  - codewiki
  - system
  - models
  - routing
---
# Model Routing

Pi owns providers, model discovery, credentials, authentication, and invocation mechanics. CodeWiki owns semantic model slots, runtime tier selection, exact route binding, budgets, and the authority boundary around model output.

## User model bindings

Project configuration exposes five user-selectable slots:

```text
decision
planning
implementation.routine
implementation.standard
implementation.complex
```

Each slot resolves through Pi to one model route and bounded invocation configuration. CodeWiki stores route references and safe configuration digests, never provider credentials or bearer tokens.

There is no `implementation.review` slot. Implementation review is execution of the resolved Quality Policy, not a standalone reviewer agent. Model-based Quality Standards use independent verifier invocations and normally inherit the relevant stage route. Implementation verifiers default to `implementation.complex` unless a calibrated CodeWiki-owned Standard override specifies another route.

## Stage bindings

Decision and Planning jobs use their user-selected stage routes. Planning shapes worker-ready Work Items and declares Workbench requirements; it does not choose a concrete model or provider for an Assignment.

Runtime selects one Implementation tier for each attempt:

| Tier | Intended use |
| --- | --- |
| `routine` | Small, well-bounded, low-risk work with clear acceptance, familiar tools, and cheap verification. |
| `standard` | Normal multi-file or moderately uncertain work requiring broader context, checks, or integration. |
| `complex` | High-risk, cross-component, security/privacy, migration, release-sensitive, tool-heavy, previously failed, or semantically uncertain work. |

The selected tier resolves to the corresponding user model binding and enters the private Worker Workbench manifest.

## Deterministic tier selection

Tier selection uses typed facts rather than prose or worker preference:

- Change risk and affected layers;
- path count, component count, and dependency breadth;
- public API, persistence, security, privacy, accessibility, migration, and release effects;
- acceptance and verification complexity;
- context size and required tool capabilities;
- isolation and integration requirements;
- unresolved uncertainty;
- prior attempt count and failure classes;
- Quality Policy cost and verifier requirements.

Rules are versioned, deterministic, monotonic for safety, and explainable. Every selection produces a private receipt with input facts, matched rule refs, selected tier, route digest, and budget. A candidate, Skill, worker, verifier, or remote client cannot choose or lower its tier.

Actual implementation effects may raise the tier or add Quality Standards. They cannot silently lower the frozen Planning minimum. Tier escalation creates a new attempt or verifier identity and invalidates dependent caches.

## Model authority

A model invocation may produce a Decision candidate, Planning candidate, implementation changes, or one Quality assessment. It cannot provide canonical identity, runtime job id, observation time, CAS guards, final routing, or acceptance authority.

Candidate generation and model verification use separate sessions and conversational state, even when they resolve to the same provider/model. Runtime binds exact protocol, candidate, evidence, policy, model, configuration, trial, and aggregation identities before accepting an assessment.

Model unavailability or malformed output is operationally `indeterminate` or blocked according to policy. It is never silently converted into product rejection, score `0`, or approval.

## Budgets and efficiency

Each route has explicit token, cost, wall-time, iteration, and concurrency budgets. Runtime may use prompt caching, coherent verifier batches, shared facts, exact result caching, and stale-work cancellation. Budget policy may block or require authority, but cannot bypass required Standards.

Model-route changes require calibration against visible and sealed cases. Evaluation compares false passes, false blocks, repair iterations, worker success, tokens, time to first useful feedback, and time to authoritative exit. No optimizer or model automatically promotes itself.

## Current migration drift

Current project routing exposes a more generic route model and does not yet provide the five semantic slots or deterministic Implementation tier receipt. Source migration must preserve Pi-owned provider/auth behavior while adding these slots, configuration validation, runtime selection, Workbench binding, verifier identity, and observability.

## Related docs

- [CodeWiki OS and Stage Protocols](codewiki-os.md)
- [Quality Policy](quality-policy.md)
- [Worker Workbench](worker-workbench.md)
- [Runtime](runtime.md)
- [Pi Extension](extension.md)
