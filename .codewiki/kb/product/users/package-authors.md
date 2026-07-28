---
type: Concept
title: Client and Execution Adapter Authors
description: Adapter authors integrate clients or workers through typed CodeWiki contracts without replacing Project Runtime, Pi, canonical authority, Loop exit, or isolation policy.
tags:
  - codewiki
  - product
  - users
  - adapters
  - authors
timestamp: 2026-07-28T00:00:00Z
---
# Client and Execution Adapter Authors

Authors may add thin CLI/editor/MCP/Pi/OpenClaw clients or Assignment execution adapters. They reuse CodeWiki semantics rather than building parallel workflow authority.

Stable needs:

- bounded authenticated state/intent/authority/query/control requests;
- exact semantic-session candidate and Model Check contracts;
- Assignment/Claim/Workbench/Worker Report correlation;
- capability, cancellation, budget, and isolation reporting;
- generated-view rebuild semantics;
- separately guarded external-effect adapters.

## Success signals

- Adapters cannot choose Loop, candidate identity, Check activation/thresholds, Exit Report, Runtime route, append, or effect authority.
- Client events remain invalidations/observations, never truth.
- Worker adapters mutate only exact Workbench scope and return immutable evidence.
- Pi Skills/tools compose without replacing Change Traces, candidates/Reports, Knowledge, source/tests, or Git proof.
- Visual surfaces read canonical/derived state rather than creating hidden UI truth.
- Provider credentials remain host-owned and never enter CodeWiki traces/manifests/errors.

## Related docs

- [API](../../system/components/api.md)
- [API and Client Surface](../../system/components/api-tools.md)
- [Runtime](../../system/components/runtime.md)
- [Extension](../../system/components/extension.md)
