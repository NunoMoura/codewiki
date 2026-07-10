---
type: Concept
title: Artifact Claim Wait/Heartbeat Flow
description: 1. Runtime records narrow claims before non-trivial overlapping writes. 2. If a needed scope is unavailable, work waits instead of forcing a conflict. 3. Holders heartbeat or release claims. Expired claims become stale and can be cleared by policy. 4. A released blocker sends a heartbeat with the claim id, planning refs, path scopes, and reason. 5. The worker or implementation iteration must fold current trace state and re-check claims before writing.
tags:
  - codewiki
  - system
  - flows
  - artifact
  - claim
  - wait
  - heartbeat
timestamp: 2026-06-30T00:00:00Z
---
# Artifact Claim Wait/Heartbeat Flow

1. Runtime records narrow claims before non-trivial overlapping writes.
2. If a needed scope is unavailable, work waits instead of forcing a conflict.
3. Holders heartbeat or release claims. Expired claims become stale and can be cleared by policy.
4. A released blocker sends a heartbeat with the claim id, planning refs, path scopes, and reason.
5. The worker or implementation iteration must fold current trace state and re-check claims before writing.

Claim status is runtime coordination evidence only. Traces, loop outputs, source/tests, and Git refs remain canonical truth and proof.

## Related docs

- [Runtime](../components/runtime.md)
- [Implementation Loop](../components/implementation-loop.md)
- [Traces](../components/traces.md)
