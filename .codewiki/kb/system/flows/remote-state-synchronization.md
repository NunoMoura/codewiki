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
codewiki_component: remote_state_synchronization
codewiki_components:
  - remote_state_synchronization
codewiki_source_patterns:
  - src/change-trace/git-command.ts
  - src/change-trace/git-state.ts
  - src/change-trace/synchronization.ts
codewiki_test_patterns:
  - tests/traces/git-state-v1.test.mjs
  - tests/traces/synchronization-v1.test.mjs
  - tests/helpers/git-state-v1.mjs
codewiki_role: git_state_acceptance
codewiki_source_map:
  - id: remote_state_synchronization
    source_patterns:
      - src/change-trace/git-command.ts
      - src/change-trace/git-state.ts
      - src/change-trace/synchronization.ts
    test_patterns:
      - tests/traces/git-state-v1.test.mjs
      - tests/traces/synchronization-v1.test.mjs
      - tests/helpers/git-state-v1.mjs
    role: git_state_acceptance
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

Runtime hashes that exact tuple into `snapshotDigest`. Status is `fresh | stale | offline`. Unsafe shared mutation requires `fresh`, an unchanged snapshot digest, and a proposal expected head equal to the verified remote state head.

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

Local attempts, files, and artifacts remain provisional until step 7 succeeds. The provider-neutral transport uses an explicit lease equivalent to:

```text
git push --force-with-lease=refs/heads/codewiki/state:<expected-head>
  <remote> <proposed-commit>:refs/heads/codewiki/state
```

The proposal commit is built through a temporary Git index, so it never checks out or mutates the developer's source worktree. Canonical operation, Planning, and manifest bytes live at digest-addressed paths under `.codewiki/changes/**` and `.codewiki/state/**`. Commit author, message, and timestamp remain non-semantic receipt metadata.

## Read-only synchronization

`synchronizeGitState()` fetches `codewiki/state`, validates every commit, manifest, record path, canonical identity, parent, transition digest, and projected state digest, then deterministically rebuilds WorkState and the Alignment Graph. It classifies the result:

- `fresh`: accepted state and current protected source/Knowledge/config/policy bindings match;
- `stale`: Git state verified, but one or more current authority bindings differ;
- `offline`: remote transport unavailable; last verified projections may remain readable but grant no mutation authority.

Materialization writes immutable canonical operation and manifest files to `.codewiki/changes/**` and `.codewiki/state/**`, digest-addressed WorkState and graph snapshots under `.codewiki/runtime/snapshots/**`, then atomically updates `.codewiki/runtime/synchronization.json`. Extra cache files carry no authority; the verified snapshot pointer and Git history govern use.

`createSynchronizationPoller()` coalesces concurrent polls and duplicate invalidations. An invalidation immediately hides the current fresh observation, including when it arrives during a fetch. `pushSynchronizedGitStateCommit()` is the guarded shared-mutation boundary; stale, offline, invalidated, snapshot-mismatched, or expected-head-mismatched proposals fail before push.

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
- repeated push of the already accepted exact commit: verified as idempotent acceptance;
- duplicate operation in a different state batch: explicit conflict, rejected before reduction;
- missing parent or unknown version: dependent progression blocks visibly;
- local/remote divergence: remote accepted state wins after verification and semantic reevaluation;
- notification gap: cursor reset triggers snapshot fetch;
- malicious/malformed commit: manifest, canonical identity, authority, parent, and state-digest validation fails closed.

## Executable two-clone proof

`tests/traces/git-state-v1.test.mjs` creates one bare remote and two independent repositories under disposable `/tmp` storage. It proves:

- an empty remote accepts and replays exact canonical state;
- independent Changes and same-Change writes produce one CAS winner and one stale proposal, after which fetch/replay/semantic rebuild accepts the still-valid loser;
- Change Claim and Work Item Claim races produce one winner, while stale reevaluation rejects the loser with active authority instead of blind retry;
- one Planning epoch and every participant binding accept atomically, while an incomplete participant batch fails before push;
- offline proposals remain local, reconnect against the current state head, and receive new operation identities;
- crash before commit, after local commit, before push, and after accepted push leaves recoverable state with no source-worktree mutation;
- repeated pushes of an already accepted exact commit and duplicate/reordered notification-triggered fetches converge to one WorkState digest.

The deliberately simultaneous two-writer cases measured one stale result per initial two-proposal race and one semantic retry only where the operation remained eligible. Exclusive Claim losers required no retry because reevaluation blocked them. This adversarial measurement proves serialization behavior but is not evidence of real workload contention, so v1 retains one `codewiki/state` ref and does not add partitioning.

The transport, replay, read-only synchronization, materialization, polling/invalidation, and guarded push boundary are executable package foundations. Phase 4 adds typed distributed Claim mutation and stale semantic reevaluation through that boundary; no legacy Trace adapter or dual-write path exists.

`tests/traces/synchronization-v1.test.mjs` additionally proves exact team snapshot identity, deterministic local materialization, stale/offline fail-closed behavior, guarded pushes, coalesced invalidation including in-flight races, and structural rejection of malicious Git history.

## Related docs

- [Runtime](../components/runtime.md)
- [WorkState](../components/work-state.md)
- [Change Traces](../components/traces.md)
- [Runtime Work Item Claim Flow](runtime-work-item-claims.md)
