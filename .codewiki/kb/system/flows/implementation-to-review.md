---
type: System Flow
title: Implementation to Review
description: Repeats exact-head Review and feedback-driven Implementation until the integrated revision passes its project-owned delivery Gate or the attempt stops.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Implementation to Review provides the stable feedback and delivery cycle required by this Story.
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Implementation to Review applies Review-stage Check Packs before guarded delivery.
---
# Implementation to Review

Runtime integrates fresh compatible Implementation output and runs the Implementation Gate. A passed Gate advances the exact integrated revision to Review. When configured, Runtime creates or updates one integrated pull request for the Change and correlates provider Checks, authenticated reviews, and other admitted Evidence to that exact head.

Review runs the project files under `.codewiki/check-packs/review/**`. Automated Code and Model Checks are sufficient when project policy permits a fully automated cycle; human Review Evidence is optional unless the user adds a Check that requires it. The Review Gate passes only when every present Review Check passes. No Review Checks produces a visible non-blocking warning and a passing Gate.

A failed Review Gate returns atomic feedback to Implementation. A new integrated head invalidates prior Review Results and starts a fresh attempt. A stopped Gate leaves canonical state unchanged and exposes its bounded recovery action. A passed Gate permits Runtime to perform only separately authorized, fresh, expected-head-safe delivery effects. Out-of-scope discoveries enter Change Intake as secondary material rather than changing the fixed Review-to-Implementation lifecycle.
