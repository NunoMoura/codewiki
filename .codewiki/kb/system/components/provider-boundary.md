---
type: System Component
title: Provider Boundary
description: Represents trusted-host networking, authentication, credentials, webhooks, and exact remote state outside CodeWiki authority.
status: stable
tags: [system, component, external]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Provider Boundary preserves explicit authentication and failure behavior for remote coordination and effects.
---
# Provider Boundary

Provider Boundary represents external Git and delivery hosts. Trusted hosts own networking, authentication, credentials, webhook verification, and provider-native state; CodeWiki owns request binding, receipt validation, freshness, expected-head policy, and interpretation.

Unavailable, unauthenticated, stale, contradictory, or malformed provider state cannot imply acceptance or weaken policy. Provider content remains untrusted until bounded validation succeeds.
