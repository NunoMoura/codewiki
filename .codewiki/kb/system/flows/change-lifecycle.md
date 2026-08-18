---
type: System Flow
title: Change Lifecycle
description: Carries accountable intent through Change-scoped Decision and Planning, Work Unit Implementation, aggregate Review, exact Gates, and guarded effects.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/maintain-intent.md
    rationale: Change Lifecycle preserves accepted meaning from intake through realization.
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Change Lifecycle advances exact state through Gate-controlled stages.
---
# Change Lifecycle

A User or service acts through a Client. Project Server authenticates the connection, authorizes the Actor for one exact project operation, admits expected state, normalizes Change Intake, and records one proposed transition from accepted state `S0` to intended state `S1`. Accepting intake starts accountable evaluation; it does not accept `S1`.

Decision uses one Change-scoped producer continuity. Its Candidate must account for semantic compatibility with every relevant accepted nonterminal Change. Project Server freezes an immutable Gate Evaluation Package containing the exact Candidate, active portfolio, relationships, accepted Work Graph projection, comparison coverage, Check Pack, and execution configuration. A passed Gate makes the exact Candidate eligible for confirmation but accepts no meaning. An authorized actor confirms it against the current active-portfolio and WorkState heads; expected-head compare-and-swap prevents concurrent stale compatibility results from both taking authority. Only confirmed `approve` ratifies the Change and advances it to Planning.

Planning uses one Change-scoped producer continuity and proposes one immutable Work Graph delta for that ratified Change. The Planning Gate judges complete acceptance coverage, independently judgeable Work Units, dependency and overlap ordering, resource requirements, and aggregate Review obligations. Project Server CAS-applies a passing delta to the canonical global Work Graph without regenerating or replacing unrelated accepted work. It then derives ready Work Units, creates Claims and Assignments, and dispatches exact Runs through Runtime.

Implementation repeats the Candidate and Gate pattern independently for each required Work Unit. One resolved stage-wide Implementation Check Pack policy applies to every Work Unit Candidate; only immutable evaluation inputs vary. Passing Candidates enter the Change-owned private integration lineage through expected-head CAS. A unit failure returns to that Work Unit loop. A stale or conflicting integration requires a new Candidate. The Change remains in Implementation until every required unit has a current passing Gate, integrates successfully, dependency closure holds, and one exact aggregate lineage head can be frozen.

Review uses a fresh independent continuity and judges the exact aggregate Change lineage through the Review Check Pack. It proves complete Change acceptance, cross-unit behavior, full integration, provenance, and delivery readiness. A failed Review Gate normally reopens affected Work Unit Implementation; a decomposition defect requires an explicit Planning amendment and a meaning defect requires Decision. Project Server owns these typed transitions. A passed Review Gate permits only separately authorized, fresh, expected-head-safe delivery.

Producer Runs may span several bounded processes through persistent DSH Agent Sessions, but every Candidate has exactly one producing Run. Formal Model Checks remain fresh, isolated, tool-free, and one session per top-level Check. Each Gate snapshots exact subject, Packs, declared inputs, Evidence, model routes, and execution configuration. Operational inability stops without fabricating a Result; zero Checks passes with a visible warning. Canonical writes and effects occur only after Project Server revalidates identity, authority, provenance, Candidate and Pack freshness, required completion state, and expected heads.
