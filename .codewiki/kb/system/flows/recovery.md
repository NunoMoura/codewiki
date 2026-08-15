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

Runtime reloads accepted Change Trace, synchronized Git facts, project configuration, current Pack Skill and Check files, and persisted job, producer, and Gate receipts, then deterministically rebuilds WorkState and Alignment. It reconciles interrupted claims, Workers, Skill-bound producer attempts, Integration attempts, Review attempts, Check Runs, and effects by exact identity. A changed or missing Skill snapshot invalidates only the affected producer attempt; it does not rewrite a completed Check Result over an otherwise identical exact subject.

Completed pass/fail Results remain reusable only when Candidate, Check, configuration, input, Evidence, and execution identities still match. Interrupted or stale Check Runs produce no Result and may receive one bounded fresh retry when still eligible. Exhausted retry, unavailable capability, contradictory receipt, or unverifiable effect becomes a visible stopped state. Private session history is never required for correctness, and recovery never invents a pass, failure, or delivery effect.
