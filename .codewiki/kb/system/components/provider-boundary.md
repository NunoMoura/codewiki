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

Provider Boundary represents Git hosts, delivery services, Pi-supported model providers, package registries, and collaboration platforms. Providers own networking, authentication semantics, credentials, billing, and provider-native state; CodeWiki owns request binding, local credential UX, receipt validation, freshness, expected-head policy, and interpretation.

Model credentials use CodeWiki-specific user storage outside projects and remain available only to backend Managed Execution. Channel credentials remain Host-side. Project files contain route and policy identities, never secrets; UIs and channels receive redacted route metadata only.

Unavailable, unauthenticated, stale, contradictory, or malformed provider state cannot imply acceptance or weaken policy. Provider and channel content remains untrusted until bounded validation succeeds. Credentials are never placed in model context, Check sandboxes, project files, or collaboration messages.
