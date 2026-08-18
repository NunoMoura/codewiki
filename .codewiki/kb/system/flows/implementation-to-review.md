---
type: System Flow
title: Implementation to Review
description: Completes independently gated Work Units, freezes one aggregate Change lineage, and repeats exact-head Review until guarded delivery or stop.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Implementation to Review provides accountable unit completion and aggregate delivery proof.
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Implementation and Review apply stage-wide project policy at unit and aggregate scopes.
---
# Implementation to Review

Implementation Gates run as Work Unit Candidates become ready; they do not wait for every Worker. Each uses the same resolved stage-wide Implementation Check Pack policy with Work Unit-specific immutable inputs. Project Server integrates only passing, fresh, compatible Candidates into the Change-owned private lineage. A passing Gate advances that Work Unit, not the whole Change.

Project Server freezes an aggregate Review subject only when all required Work Units have current passing Gates, all required outputs integrate, dependency closure and acceptance coverage hold, and no required Candidate is stale. When configured, it creates or updates one integrated pull request for that exact Change lineage and correlates provider Checks, authenticated reviews, and admitted Evidence to its head.

Review runs the resolved `.codewiki/check-packs/review/**` policy over the exact aggregate tree, ratified Change, Planning delta, contributing Work Units and Candidates, target base, and delivery Evidence. It verifies complete Change acceptance and cross-unit integration rather than repeating only local unit policy. Automated Code and independently isolated Model Checks may supply the complete basis; human Review Evidence remains optional unless a Check requires it.

A failed Review Gate normally returns atomic feedback to affected Work Unit Implementation. A decomposition failure requires an explicit Planning amendment; changed intent requires Decision. Project Server owns these routes and no Check or model chooses lifecycle authority. Any new aggregate head invalidates prior Review Results. A stopped Gate preserves state. A passed Gate permits only separately authorized, fresh, expected-head-safe delivery effects.
