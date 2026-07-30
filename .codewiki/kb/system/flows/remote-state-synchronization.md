---
type: Concept
title: Remote State Synchronization
description: Runtime synchronizes accepted Change operations through provider-neutral Git expected-head CAS, treats local work as provisional, and rebuilds deterministic WorkState after stale, offline, or notification events.
tags:
  - codewiki
  - system
  - flows
  - git
  - synchronization
timestamp: 2026-07-30T00:00:00Z
---
# Remote State Synchronization

## Snapshot

Runtime binds one team snapshot:

```text
repository identity
+ codewiki/state head
+ protected source head
+ Knowledge digest
+ config and policy digests
```

Status is `fresh | stale | offline`. Unsafe shared mutation requires `fresh`.

## Accepted append

```text
1. fetch and verify codewiki/state
2. replay valid operations and rebuild WorkState/Alignment Graph
3. admit bounded proposal against exact snapshot and authority
4. Runtime derives operation bytes and StateCommitManifest
5. create one Git state commit with expected parent
6. push refs/heads/codewiki/state using exact expected head
7. shared acceptance succeeds for whole batch or fails
8. fetch/verify accepted commit and refresh local materialization
```

Local attempts, files, and artifacts remain provisional until step 7 succeeds.

## Stale rejection

```text
expected-head push rejected
→ discard no private work automatically
→ fetch current remote state
→ verify manifest and operation chain
→ rebuild WorkState and Alignment Graph
→ reevaluate semantic eligibility and conflicts
→ create fresh operation or reject proposal
```

Runtime never blind-rebases and retries authority-bearing writes.

## Offline work

Offline Runtime may read its last verified snapshot and create private Candidate/worker artifacts under explicit stale/offline status. It cannot acquire accepted Change Claim or Work Item Claim authority, append canonical operations, or perform effects requiring current remote state.

Reconnect always fetches and reevaluates before shared mutation.

## Notifications

Polling, webhook, SSE, and provider events only invalidate a cursor:

```text
notification
→ local snapshot marked stale
→ Runtime fetches Git refs
→ verifies canonical bytes
→ deterministic replay
```

Duplicate, missing, reordered, delayed, or forged notification payloads cannot change semantic state.

## Concurrency

Start with one linear accepted state-commit chain on `codewiki/state`. Independent Change operations may commute semantically, but Change Claim, Work Item Claim, Planning, Integration, and effect acceptance remain globally serialized.

Measure contention before partitioning. If needed, partition non-exclusive contribution streams first; preserve global CAS for exclusive control and effects.

## Failure safety

- crash before push: no shared acceptance;
- crash after accepted push: another Runtime fetches and recovers from Git;
- duplicate operation: identity makes replay idempotent;
- missing parent or unknown version: dependent progression blocks visibly;
- local/remote divergence: remote accepted state wins after verification and semantic reevaluation;
- notification gap: cursor reset triggers snapshot fetch;
- malicious/malformed commit: manifest, canonical identity, authority, parent, and state-digest validation fails closed.

## Related docs

- [Runtime](../components/runtime.md)
- [WorkState](../components/work-state.md)
- [Change Traces](../components/traces.md)
- [Runtime Work Item Claim Flow](runtime-work-item-claims.md)
