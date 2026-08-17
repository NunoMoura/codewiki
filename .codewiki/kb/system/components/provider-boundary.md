---
type: System Component
title: Provider Boundary
description: Represents external Git, delivery, model, package, and collaboration services outside CodeWiki authority.
status: stable
tags: [system, component, external]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Provider Boundary preserves explicit authentication and failure behavior for remote coordination and effects.
---
# Provider Boundary

Provider Boundary represents Git hosts, delivery services, model providers, delegated Agent products, package registries, and collaboration platforms. Providers own networking, authentication semantics, credentials, billing, and provider-native state; CodeWiki owns request binding, local credential UX, receipt validation, freshness, expected-head policy, custody classification, and interpretation.

Personal model credentials remain in trusted provider storage, CodeWiki credential services, or existing delegated-product tooling according to the selected route. Runs receive only bounded route capabilities and opaque references needed for one exact Stage Producer attempt, Implementation Assignment, or Model Check. Delegated Runs may use product-native account state only under their explicit adapter policy; that state and any unobserved child configuration remain outside CodeWiki custody. External Agent Client credentials remain entirely external. Channel credentials remain Project Server-side. Project files contain route, adapter, and policy identities, never secrets; User Interfaces and channels receive redacted route metadata only.

Unavailable, unauthenticated, stale, contradictory, or malformed provider state cannot imply acceptance or weaken policy. Provider and channel content remains untrusted until bounded validation succeeds. Credentials are never placed in model context, Check sandboxes, project files, or collaboration messages.
