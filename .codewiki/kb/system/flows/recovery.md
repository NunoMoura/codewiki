---
type: System Flow
title: Recovery
description: Reconstructs authority and execution continuity from canonical state, retained DSH Sessions, and durable evidence without trusting private memory.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/recover-history.md
    rationale: Recovery provides the stable cross-component behavior required by this Story.
---
# Recovery

Project Server reloads accepted Change Trace, active Change portfolio, accepted Change-scoped Work Graph deltas, synchronized Git facts, private integration lineages, configuration, current Pack Skill and Check files, jobs, Claims, Assignments, Workbenches, custody-scoped Run Receipts and Ledgers, retained DSH Agent Sessions, Gate receipts, and guarded effects. It deterministically rebuilds WorkState and Alignment and reconciles interrupted producers, workers, integration, Review, Checks, and effects by exact identity. Missing evidence never fabricates a Result, integration, completion, transition, or effect.

A logical producer continuity may resume its retained DSH Agent Session only under an exclusive Project Server lease and expected Session-head compare-and-swap. Exact same-Session resume requires the original retained Runtime Build, protocol, DSH and Runtime Plugin closure, model route, prompts, Skills, tool schemas, Project Material Generation identities, query ledger, budgets, isolation, and custody. One writer may execute against a Session at once. Process or Project Server lifetime does not define Session lifetime.

A Runtime Build or protocol change, corruption, repeated summary drift, role change, unrecoverable compaction lock, or qualified quality decline forces Session rollover. Project Server starts a fresh Session and injects deterministic canonical rehydration from current Change, Work Graph, Work Unit or aggregate lineage, Gate feedback, material identity, and unresolved obligations. It never treats delegated-product memory, a conversation summary, persistent code heap, or ambient file as canonical truth.

DSH owns compaction event mechanics and retains exact raw history. CodeWiki promotes authority-relevant facts before compaction, predicts next-Run pressure, compacts only at safe idle semantic boundaries, supplies stage-aware summaries, and records replacement provenance. It never compacts during an open turn, unmatched tool pair, pending child work, or before Candidate freezing. Compaction Checkpoints remain replayable model-surface projections, not recovery prerequisites.

Completed pass/fail Results remain reusable only when Candidate, Check, configuration, selected package input, Evidence, and execution identities match. Interrupted or stale Check Runs produce no Result and may receive one bounded fresh retry when eligible. Every Model Check retry uses a fresh isolated session. Exhausted retry, unavailable capability, contradictory receipt, incomplete material, or unverifiable effect becomes visible stopped state.
