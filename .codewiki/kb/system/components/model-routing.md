---
type: Concept
title: Model Routing
description: Users bind Pi routes to semantic Loops, Implementation tiers, and authorized Check Types while Runtime selects exact producer and Model Check routes from structured facts.
tags:
  - codewiki
  - system
  - models
  - routing
---
# Model Routing

Pi owns providers, model discovery, credentials, authentication, transport, and session mechanics. CodeWiki owns semantic model slots, runtime tier selection, exact route/configuration binding, budgets, and authority around model output.

## User bindings

```text
decision
planning
implementation.routine
implementation.standard
implementation.complex
```

Each slot resolves through Pi to one route and bounded invocation configuration. CodeWiki stores safe route/configuration identity only, never credentials or bearer tokens.

No `implementation.review` slot exists. Implementation acceptance comes from Code Checks and independent Model Checks under one Resolved Exit Policy, not a standalone reviewer agent.

## Loop and Check binding

Decision and Planning candidate producers use their selected Loop route. Runtime selects one Implementation tier per Assignment/candidate attempt:

| Tier | Intended use |
| --- | --- |
| `routine` | Runtime-proven small, bounded, low-risk work with clear acceptance and cheap verification. |
| `standard` | Normal multi-file or moderately uncertain work needing broader context, Checks, or Integration. |
| `complex` | High-risk, cross-component, security/privacy, migration, release-sensitive, tool-heavy, repeatedly failed, or semantically uncertain work. |

Planning declares Workbench/model requirements but cannot choose provider/model. Candidate, worker, Skill, client, or caller cannot self-label work `routine` or lower its tier.

Default Model Checks normally inherit calibrated routes for their owning Loop. Implementation Model Checks use `implementation.complex` unless a trusted versioned Check binding establishes another calibrated route. Runtime records exact model, configuration, Check, trial, and aggregation identity in each Result.

## Check Evaluator routes

Each closed Check Type owns one versioned Check Evaluator protocol and model capability class. Product surfaces use domain labels such as Security Evaluator, Design Evaluator, API Evaluator, and Policy Evaluator. A Check Evaluator is not a persistent model agent or final reviewer.

Custom Model Checks default to the calibrated route inherited from their owning Loop. An authorized maintainer may bind a Check Type—not each individual Custom Check—to one configured Pi route whose capabilities and calibration satisfy the type. Runtime validates the route, binds its safe configuration digest into every Assessment and Result, and falls back to the calibrated strong route when no approved type binding exists. User Standard authors and distillation models cannot provide a provider, model, system prompt, tool list, or route in requirement text. Custom Code Checks select an approved deterministic template rather than a model route.

One Check Evaluator may physically run one focused call per Custom Check, one call for all active Custom Checks of its type, or deterministic bounded batches. This call topology never merges semantic identity: every Custom Check receives one separate Assessment and Check Result. Candidate producers, workers, and Check Evaluators still use separate fresh conversational state.

Per-type batching requires sealed comparison against focused calls using identical model/provider/version, Candidate/Evidence snapshots, budgets, seeds where supported, and evaluators. Promotion reports false passes, escaped critical defects, false failures, `indeterminate` rate, human agreement, repair usefulness, prompt-injection resistance, latency, tokens/cost, retries, and intervention. Safety regressions block promotion; high-risk Checks may remain isolated. One focused request per logical Model Check remains the baseline until that evidence exists.

## Deterministic tier selection

Typed facts include:

- accepted Change risk/layers;
- path/component/dependency breadth;
- API, persistence, security, privacy, accessibility, migration, dependency, and delivery effects;
- acceptance/verification complexity;
- context size and capabilities;
- isolation/Integration requirements;
- unresolved uncertainty;
- prior attempt count and issue classes;
- Resolved Exit Policy cost and Model Check needs.

Rules are versioned, deterministic, monotonic for safety, and explainable. Resolution records input facts, matched rules, selected tier, route/configuration digest, and budget in private runtime state. Actual effects may raise tier or add Checks; they cannot silently lower Runtime-derived minimums from canonical Planning evidence. Route/tier changes create new dependent identities and invalidate caches.

Learned history may inform candidate repair context and offline calibration. It cannot activate Checks, lower thresholds, or select a cheaper tier automatically.

## Model authority

A model may produce one Decision/Planning candidate, Implementation edits/candidate evidence, or one Model Check measurement/assessment. It cannot provide canonical identity, authority, runtime job id, observation time, activation, threshold, CAS guard, route, append, or final acceptance.

Candidate generation and Model Checking use separate sessions and conversational state even when they resolve to the same provider/model. Model Checks receive immutable candidate evidence, not producer transcript or retrieved repair context.

The native Decision research claim-support envelope binds one exact tool-free route, configuration digest, versioned protocol resource, Candidate/policy, passing provenance Result, claim digests, and citation Evidence ids. Its isolated Pi SDK transport resolves the exact configured provider/model through Pi-owned authentication, applies the exact thinking level and timeout, disables tools and all resource discovery, uses an in-memory session, bounds response bytes, and propagates cancellation. The model reports one bounded assessment per exact claim and cannot report aggregate Check pass/fail. Runtime validates full claim/citation coverage, derives aggregate semantics, and records only normalized model-assessment Evidence. Production Check scheduling remains pending.

Timeout, provider failure, unavailable service, malformed output, cancellation, or invalid schema yields `indeterminate`. Runtime never converts operational failure into score zero, candidate rejection, or approval.

## Budgets and efficiency

Every route has token, cost, wall-time, iteration, and concurrency budgets. Runtime may use prompt caching, coherent Model Check envelopes, deterministic type-level batching, shared extracted facts, exact Result caching, and stale-work cancellation. Budget policy may wait, block, or require authority; it cannot bypass required Checks.

Route changes require calibration against visible and sealed fixtures. Compare false passes, escaped regressions, false blocks, repair iterations, interventions, tokens/cost, first useful feedback, and authoritative-exit latency. No optimizer/model promotes itself.

## Current executable drift

Current configuration uses a generic route model and lacks all five semantic slots plus complete deterministic tier resolution. The clean cut preserves Pi-owned provider/auth/session behavior while adding slot validation, Runtime selection, Workbench binding, Model Check identity, cancellation, and observability.

## Related docs

- [CodeWiki OS and Loop Protocols](codewiki-os.md)
- [Loop Exit](loop-exit.md)
- [Custom Checks](custom-checks.md)
- [Worker Workbench](worker-workbench.md)
- [Runtime](runtime.md)
- [Pi Extension](extension.md)
