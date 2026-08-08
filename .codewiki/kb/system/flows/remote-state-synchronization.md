---
type: System Flow
title: Remote State Synchronization
description: Synchronizes canonical Change and Git state with expected-head compare-and-swap protection.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/recover-history.md
    rationale: Remote State Synchronization provides the stable cross-component behavior required by this Story.
---
# Remote State Synchronization

Runtime fetches provider-neutral Git refs, validates canonical bytes and identities, reduces accepted history, and compares the exact expected remote head before push. After mutation it resynchronizes and verifies every accepted identity.

Network failure, unknown required protocol, malformed history, stale base, or head mismatch rejects the mutation. Local work remains recoverable, but no caller may infer remote acceptance without post-push verification.
