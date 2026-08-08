---
type: System Flow
title: Change Lifecycle
description: Carries accountable intent from bounded intake through Decision, Planning, Implementation, Verification, and accepted history.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/maintain-intent.md
    rationale: Change Lifecycle provides the stable cross-component behavior required by this Story.
---
# Change Lifecycle

Bounded Change Intake proposes accountable intent. Authenticated exact-revision selection admits Decision attention; Runtime then invokes Decision, Planning, and Implementation according to current WorkState. Each Loop produces one immutable Candidate, resolves required Checks, and returns an Exit Report before Runtime chooses a route.

Canonical acceptance crosses the repository persistence boundary only after freshness, expected base, authority, policy, and Candidate identity are revalidated. Any missing or stale requirement leaves the prior accepted state unchanged and routes to waiting, repair, or renewed semantic work.
