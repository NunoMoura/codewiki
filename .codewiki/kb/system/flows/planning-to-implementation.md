---
type: System Flow
title: Planning to Implementation
description: Gates one Change-scoped Work Graph delta, applies it by CAS, and schedules ready Work Units without global replanning.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Planning to Implementation turns one ratified Change into accountable parallel realization.
---
# Planning to Implementation

Project Server runs the Planning Gate over one exact Change-scoped Planning Candidate and the resolved `.codewiki/check-packs/planning/**` snapshot. The Gate verifies complete ratified-Change coverage, one owning Change per Work Unit, independently judgeable outcomes, acyclic internal and cross-Change dependencies, ordering for overlapping scopes, declarative resource and custody requirements, and explicit aggregate Review obligations. Failure returns atomic feedback to that Change's Planning continuity; stopped execution preserves current state.

A passed Candidate remains only a proposed Work Graph delta. Project Server revalidates the ratified Change revision and observed global Work Graph digest, rejects mutation of unrelated accepted or active Work Units, and CAS-appends the new immutable units and edges. A stale graph triggers deterministic revalidation and, when relevant, another Planning attempt. No planning horizon, Sprint replacement, or rolling whole-project Planning epoch exists.

Project Server derives readiness from the accepted global Work Graph and WorkState. It acquires bounded Claims, matches current Worker Offers and policy to declared capabilities, custody, consent, privacy, and budget, and creates one exact Assignment and isolated Workbench per selected Work Unit. Runtime receives only authorized Run Requests and owns no queue, Claim, Assignment, placement, or canonical scheduling state. Independent ready Work Units may execute concurrently; dependency and overlap edges constrain admission.
