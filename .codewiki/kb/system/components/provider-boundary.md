---
type: System Component
title: Provider Boundary
description: Represents trusted-host networking, authentication, credentials, webhooks, model services, and exact remote state outside CodeWiki authority.
status: stable
tags: [system, component, external]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Provider Boundary preserves explicit authentication and failure behavior for remote coordination and effects.
---
# Provider Boundary

Provider Boundary represents external Git, delivery, and model hosts. Trusted hosts own networking, authentication semantics, credentials, webhook verification, billing, and provider-native state; CodeWiki owns request binding, local credential UX, receipt validation, freshness, expected-head policy, and interpretation.

The default multi-provider model integration uses Pi SDK authentication with CodeWiki-specific user storage outside every project. Claude Code-native routes retain opaque Claude Code authentication and cannot be treated as equivalent to independently authenticated Anthropic routes. Project files contain route identities and policy only, never secrets.

Unavailable, unauthenticated, stale, contradictory, or malformed provider state cannot imply acceptance or weaken policy. Provider content remains untrusted until bounded validation succeeds, and credentials are never mounted into Check sandboxes or model context.
