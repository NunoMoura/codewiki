---
type: Concept
title: Claim Wait and Observation Flow
description: Runtime grants one exact bounded Claim per Work Item attempt, waits on overlap instead of forcing conflict, and treats leases/heartbeats as operational observations rather than semantic truth.
tags:
  - codewiki
  - system
  - flows
  - claim
  - wait
  - observation
timestamp: 2026-07-28T00:00:00Z
---
# Claim Wait and Observation Flow

1. Passed-and-appended Planning defines ready Work Item, dependencies, path/component scope, Workbench requirements, and frozen Check minimums.
2. Runtime refreshes WorkState and rejects stale, blocked, overlapping, or capacity-incompatible selection.
3. Runtime provisions inert digest-bound private Workbench and probes capabilities.
4. Runtime appends one exact Claim under generation/freshness/CAS guards; matching Claim activates Workbench.
5. Worker/host emits bounded operational observation while attempt runs.
6. If scope is unavailable, work waits instead of forcing conflict. Released/expired/cancelled Claim invalidates Workbench activation.
7. Worker returns immutable Worker Report. Runtime revalidates Claim/Assignment/Workbench/base before Implementation candidate construction.
8. Claim releases after accepted realization/Integration-safe boundary or terminal blocked/failed/cancelled handling. Cleanup requires proof.

Lease, heartbeat, process, and liveness state are operational observations only. Change Traces own coordination facts; passed Loop candidates/Reports own semantic progression; source/tests/Git own executable/content proof.

## Related docs

- [Runtime](../components/runtime.md)
- [Worker Workbench](../components/worker-workbench.md)
- [Implementation Loop](../components/implementation-loop.md)
- [Traces](../components/traces.md)
