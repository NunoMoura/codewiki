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

Bounded Change Intake proposes accountable intent. Authenticated exact-revision selection admits Decision attention; Runtime then invokes Decision, Planning, and Implementation according to current WorkState. Each Loop produces one immutable Candidate, resolves one Candidate-bound Exit Policy from applicable installed Checks, and invokes selected evaluators with exact admitted input.

Every evaluator returns a bounded pass, fail, or indeterminate Observation. Runtime validates exact Candidate, policy, Check, input, route, isolation, freshness, provenance, and output bindings before creating Results; Verification reduces those Results into one Exit Report before Runtime chooses a route. Advisory findings return feedback to the active Harness, whose repair creates a new Candidate and repeats the same policy and evaluation path.

Canonical acceptance crosses the repository persistence boundary only after freshness, expected base, authority, policy, and Candidate identity are revalidated. Any missing, stale, failed, indeterminate, or unavailable required condition leaves the prior accepted state unchanged and routes to waiting, repair, or renewed semantic work.
