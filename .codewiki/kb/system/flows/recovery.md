---
type: System Flow
title: Recovery
description: Reconstructs coordination from canonical state and reconciles interrupted jobs without trusting private session memory.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/recover-history.md
    rationale: Recovery provides the stable cross-component behavior required by this Story.
---
# Recovery

Runtime reloads accepted Change Trace, synchronized Git facts, protected configuration, and persisted job receipts, then deterministically rebuilds WorkState and Alignment. It reconciles interrupted claims, workers, Integration attempts, and effects by exact identity.

Private session history is never required for correctness. Unknown completion, contradictory receipts, stale snapshots, or unverifiable effects remain visible and block duplicate or unsafe continuation.
