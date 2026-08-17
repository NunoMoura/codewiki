---
type: System Flow
title: Recovery
description: Reconstructs coordination from canonical state and reconciles interrupted jobs and Gate attempts without trusting private session memory.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/recover-history.md
    rationale: Recovery provides the stable cross-component behavior required by this Story.
---
# Recovery

Project Server reloads accepted Change Trace, synchronized Git facts, project configuration, current Pack Skill and Check files, persisted jobs, custody-scoped Run Receipts and Ledgers, and Gate receipts, then deterministically rebuilds WorkState and Alignment. It reconciles interrupted Claims, Implementation Workers, Project Server jobs, Run Process processes, delegated child processes, Skill-bound Stage Producer attempts, Integration attempts, Review attempts, Check Runs, and effects by exact identity. A changed or missing Skill snapshot invalidates only the affected producer attempt; it does not rewrite a completed Check Result over an otherwise identical exact subject.

A DSH-backed Run session may resume only when its exact DSH and Runtime Plugin closure, model route, prompts, Skills, tool schemas, context snapshot, query ledger, budget, isolation, and custody still match and that execution version is qualified for resume. CodeWiki upgrades never resume active sessions across an unqualified format or composition change. Otherwise Project Server starts one fresh eligible attempt from canonical Stage Context rather than trusting DSH state, delegated-product memory, a conversation summary, or executable heap. Compaction Checkpoints are replayable model-surface projections over retained exact ledger ranges; they are never recovery prerequisites or canonical facts.

Completed pass/fail Results remain reusable only when Candidate, Check, configuration, input, Evidence, and execution identities still match. Interrupted or stale Check Runs produce no Result and may receive one bounded fresh retry when still eligible. Exhausted retry, unavailable capability, contradictory receipt, or unverifiable effect becomes a visible stopped state. Private provider session state is never required for correctness, and recovery never invents a pass, failure, lifecycle transition, or delivery effect.
