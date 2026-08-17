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

A User or service acts through a Client. CodeWiki Server authenticates the connection, resolves Pairing and project route, and forwards one bounded Client-Server Protocol request through the selected Project Runtime gateway. Runtime authorizes the actor, admits expected state, normalizes Change Intake, and records one proposed transition from accepted state `S0` to intended state `S1`. Accepting intake starts accountable evaluation; it does not yet accept `S1`.

Before invoking a Stage Producer for Decision, Planning, Implementation, or Review, Runtime freezes one immutable Stage Context baseline from WorkState, Knowledge, Alignment, repository, Change, Evidence, and Result owners and snapshots optional Pack Skills. It submits one immutable Run Specification for a Backend Agent Run, chooses an eligible Delegated Agent Run whose adapter can prove required inputs, or exposes equivalent bounded operations to an External Agent Client through MCP. Skill, context, query, route, plugin-set, and custody digests bind the producer attempt and receipt. Skills may shape production but cannot choose a disposition, Gate outcome, transition, or effect.

Runtime runs each stage Gate over an independently snapshotted exact Candidate and Checks. A passed Decision Candidate becomes eligible for exact-digest confirmation but does not itself accept desired meaning. An authorized actor confirms that unchanged passed Candidate and Gate against current WorkState; only then does Runtime apply `approve`, `reject`, `defer`, or `withdraw`, and only confirmed `approve` advances to Planning. Editing the Candidate requires a fresh Gate. Failed Decision feedback becomes durable WorkState for another Decision attempt. Runtime repeats the Candidate and Gate pattern for Planning and Implementation under configured authority. Fresh compatible Implementation output is integrated before its Gate. A passed Implementation Gate advances the exact integrated head to Review. A failed Review Gate returns feedback to Implementation; a new head starts Review again. A passed Review Gate permits only separately authorized guarded delivery.

Each Gate snapshots the exact stage subject, present Packs, Check files, bounded inputs, Evidence, model routes, and execution configuration. Pack Skill identity remains outside Check Result and Gate cache identity. Code Checks run in bounded parallel first; a failure prevents unnecessary Model Checks. Otherwise Model Checks run in bounded parallel through independent tool-free routes. Exact completed Results are cached. Every completed Check is binary or quantitative and resolves to `passed` or `failed`; each failure carries one stable code and one feedback contract. Operational inability produces a stopped Gate attempt and no Check Result. Zero Checks passes with a visible `no_checks_configured` warning.

Runtime applies fixed lifecycle transitions rather than Check-authored routes. A failed stage returns to its producing Stage Loop, except Review failure returns to Implementation. A stopped Gate preserves canonical state and exposes bounded recovery. Backend-owned Candidates require complete Backend Agent Run receipts and exact CodeWiki input custody. Backend-delegated Candidates bind exact dispatch, adapter, process, Workbench where applicable, artifacts, final output, and explicit unknown child internals. External Agent Client Candidates bind only authenticated CodeWiki operations and never inherit complete harness custody. Implementation Candidates additionally require exact Runtime Workbench custody. Any unmatched observed Git tree becomes external provenance and is captured without changing accepted head; a commit never advances a stage by itself. Canonical writes and guarded effects occur only after Runtime revalidates identity, authority, Pack and Candidate freshness, provenance, and expected-head compare-and-swap.
