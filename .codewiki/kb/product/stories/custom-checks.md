---
type: Concept
title: Enforce Project-Specific Expectations
description: As a maintainer, I want bounded Custom Checks for company policy, design style, API conventions, and other project-specific expectations so exact candidates are evaluated independently of producer Skills.
tags:
  - codewiki
  - product
  - story
timestamp: 2026-07-31T00:00:00Z
---
# Enforce Project-Specific Expectations

As a maintainer, I want bounded Custom Checks for company policy, design style, API conventions, and other project-specific expectations so exact candidates are evaluated independently of producer Skills.

## Acceptance signals

- Dashboard is the primary authoring surface and groups Custom Checks by closed CodeWiki-owned Check Type.
- One Custom Check contains one concise plain-text requirement, optional repair guidance, closed applicability fields, and bounded Knowledge refs.
- Custom text cannot define executable code, tools, prompts, response schemas, authority, or verdict logic.
- Runtime owns stable Custom Check identity, semantic definition and protected-config digests, guarded lifecycle, activation, route, Assessment validation, Check Result, and exit behavior.
- V1 Custom Checks execute as Model Checks; Code Checks and Model Checks remain distinct execution kinds.
- Each Check Type uses a type-specific Check Evaluator and may bind an authorized calibrated Pi route.
- Every Custom Check receives a separate `supported | unsupported | uncertain` Assessment and Runtime-derived `pass | fail | indeterminate` Result, even when model transport batches related Checks.
- Lifecycle is `draft | active | disabled`; every applicable active Custom Check is required and its `fail` or `indeterminate` Result blocks Loop exit.
- Accepted configuration is protected Git-backed project truth, not browser state or a mutable registry.
- Guarded create, update, activate, and disable commands require exact current/protected config CAS, protected source head, authenticated authority, bounded idempotency, and a content-addressed receipt.
- A Candidate changing Custom Check policy remains evaluated against the exact config loaded from its protected Git base and cannot disable its own assurance; accepted changes apply only from the next protected snapshot.
- Per-type batching is promoted only when sealed comparisons against focused calls preserve safety while improving measured latency or cost.
- Skills may help producers satisfy Custom Checks but cannot activate, pass, disable, or weaken them.

## Related docs

- [Custom Checks](../../system/components/custom-checks.md)
- [Loop Contracts](../../system/components/loop-contracts.md)
- [Loop Exit](../../system/components/loop-exit.md)
- [Model Routing](../../system/components/model-routing.md)
- [Dashboard](../uis/terminal.md)
