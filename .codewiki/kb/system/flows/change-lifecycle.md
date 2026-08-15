---
type: System Flow
title: Change Lifecycle
description: Carries accountable intent through Runtime-orchestrated Decision, Planning, Implementation, Review, stage Gates, Integration, and guarded effects.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/maintain-intent.md
    rationale: Change Lifecycle preserves accepted meaning from intake through realization.
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Change Lifecycle advances exact state through fixed Gate-controlled stages.
---
# Change Lifecycle

A User or service acts through a Client. CodeWiki Server authenticates the connection, resolves Pairing and project route, and forwards one bounded Client-Server Protocol request through the selected Project Runtime gateway. Runtime authorizes the actor, admits expected state, normalizes Change Intake, and requires explicit acceptance before exact-revision Decision selection.

Runtime invokes Decision and runs the Decision Gate over `.codewiki/check-packs/decision/**`. A passed `approve` Candidate accepts exact desired meaning and advances to Planning; other passed Decision dispositions terminate or defer according to their typed semantics. A failed Gate returns atomic feedback to Decision. Runtime repeats the same pattern for Planning and Implementation. Fresh compatible Implementation output is integrated before its Gate. A passed Implementation Gate advances the exact integrated head to Review. A failed Review Gate returns feedback to Implementation; a new head starts Review again. A passed Review Gate permits only separately authorized guarded delivery.

Each Gate snapshots the exact stage subject, present Packs, Check files, bounded inputs, Evidence, model routes, and execution configuration. Code Checks run in bounded parallel first; a failure prevents unnecessary Model Checks. Otherwise Model Checks run in bounded parallel through independent tool-free routes. Exact completed Results are cached. Every completed Check is binary or quantitative and resolves to `passed` or `failed`; each failure carries one stable code and one feedback contract. Operational inability produces a stopped Gate attempt and no Check Result. Zero Checks passes with a visible `no_checks_configured` warning.

Runtime applies fixed lifecycle transitions rather than Check-authored routes. A failed stage returns to its producing Loop, except Review failure returns to Implementation. A stopped Gate preserves canonical state and exposes bounded recovery. Controlled Candidates require exact Runtime workbench custody; managed Candidates additionally require complete Pi receipts. Any unmatched observed Git tree becomes external provenance and is captured without changing accepted head. Canonical writes and guarded effects occur only after Runtime revalidates identity, authority, Pack and Candidate freshness, provenance, and expected-head compare-and-swap.
