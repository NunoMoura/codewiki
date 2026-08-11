---
type: User Story
title: Enforce Project Standards
description: A maintainer wants accepted project expectations distilled into bounded independently evaluated Checks.
status: stable
codewiki_user: /product/users/maintainer.md
tags: [product, story, verification]
---
# Enforce Project Standards

As a maintainer, I want CodeWiki to apply accepted project expectations as bounded Checks so code, policy, design, and delivery requirements remain reviewable rather than hidden in agent prompts.

## Acceptance signals

- Standards bind exact source or text snapshots, and distillation exposes covered and unresolved clauses.
- Default, imported, and Custom Checks remain open, inspectable, and editable as project files.
- Each Check evaluates one exact Candidate and returns pass, fail, or indeterminate with structured findings that can select bounded repair guidance.
- Project, Pack, and optional per-Check configuration make applicability, inputs, model route, enforcement, and sparse Repair Profiles explicit.
- Maintainers can author Checks through deterministic forms, raw developer mode, or optional Harness-assisted guidance without hidden model calls.
- The authoring model and configured evaluator route remain visibly distinct, and new Checks cannot gain blocking authority without approval.
- Every applicable active Check produces an independent Result for one exact Candidate-bound policy, including indeterminate Results when execution is unavailable.
- The Exit Report explains required blockers, advisory and observed outcomes, and exclusions without hiding a selected Check or treating a nonblocking failure as a failed exit.
- Maintainers can inspect and override repair guidance, preview the exact report-bound Repair Brief, and compare digest-bound feedback variants without granting guidance mutation authority.
- Repair context is Candidate-, report-, and Alignment-snapshot-bound, bounded, provenance-bearing, explicit about coverage, truncation, and staleness, and never grants execution scope.
