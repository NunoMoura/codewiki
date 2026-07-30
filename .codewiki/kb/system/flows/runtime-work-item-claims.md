---
type: Concept
title: Runtime Work Item Claim Flow
description: Passed Planning yields worker-ready Work Items; Runtime provisions exact Worker Workbenches, acquires Work Item Claims, supervises isolated Assignments, and feeds Worker Report evidence into exact integrated Implementation assurance.
tags:
  - codewiki
  - system
  - flows
  - runtime
  - work-item
  - work-item-claim
timestamp: 2026-07-30T00:00:00Z
codewiki_component: distributed_work_item_claims
codewiki_components:
  - distributed_work_item_claims
codewiki_source_patterns:
  - src/change-trace/mutation.ts
codewiki_test_patterns:
  - tests/traces/distributed-mutation-v1.test.mjs
codewiki_role: work_item_claim_authority
codewiki_source_map:
  - id: distributed_work_item_claims
    source_patterns:
      - src/change-trace/mutation.ts
    test_patterns:
      - tests/traces/distributed-mutation-v1.test.mjs
    role: work_item_claim_authority
---
# Runtime Work Item Claim Flow

```text
passing accepted Planning epoch
→ fresh WorkState safe execution frontier
→ dependency/conflict/capacity/authority selection
→ inert Worker Workbench provision and capability probe
→ work_item_claim.acquired through expected-head CAS
→ assignment.dispatched
→ isolated Assignment attempt
→ immutable asserted Worker Report
→ guarded Integration and exact integrated-tree proof
→ exact integrated Implementation Candidate
→ Evidence Records, Checks, Results, Exit Report, and Runtime Route
→ explicit Work Item Claim release or authenticated takeover
→ proof-authorized cleanup
```

## Authority

Planning owns Work Item meaning, scope, requirements, dependencies, verification, Integration boundary, and Worker Workbench requirements.

Runtime owns selection, fresh snapshot, Work Item Claim/Assignment/Workbench identity, source base, worker route, budgets, cancellation, expected-head CAS, recovery, Evidence materialization, Integration, and canonical operations.

Worker owns only the bounded execution attempt and asserted Worker Report. Implementation owns semantic realization Candidate meaning. A completed Worker Report never grants acceptance.

## Acquisition guards

Before `work_item_claim.acquired`, Runtime verifies:

- exact current Planning epoch and Work Item revision;
- fresh remote/source/Knowledge/config/policy snapshot;
- dependencies and conflict boundaries;
- no incompatible active Work Item Claim;
- matching Worker Workbench digest and source base;
- worker adapter/capability availability;
- capacity, supervision, and budgets;
- exact actor/worker authority.

Client and Git timestamps do not expire ownership.

## Distributed mutation contract

`createDistributedMutationRuntime()` performs Work Item Claim acquisition, release, and authenticated takeover against freshly verified `codewiki/state`. Callers provide typed Work Item fields only. Runtime derives operation identity, parents, base snapshot, authority binding, timestamp, state transition digest, manifest, and Git receipt.

Every write follows fetch/verify/replay, semantic preflight, exact expected-head push, and accepted-operation refetch. Stale independent work is rebuilt only after reevaluation. A competing Claim loser receives an active-authority conflict and is never blind-rebased. Repeating an already accepted acquisition or release returns its existing operation receipt without appending another commit.

Release requires the current Claim actor. Takeover requires an `authenticationEvidenceId` plus a configured authority verifier; Evidence presence alone is insufficient. No elapsed-time or heartbeat path expires a Claim.

## Terminal behavior

- accepted realization remains bound until configured Integration-safe release boundary;
- blocked, failed, or cancelled attempts record `assignment.terminal_recorded` before explicit release;
- lost or ambiguous attempts remain held until authenticated takeover or recovery proves safe disposition;
- cleanup never deletes active, unintegrated completed, or ambiguous evidence;
- worker-local proof cannot replace exact final integrated-tree Checks.

## Rolling Planning interaction

A later Planning epoch preserves an active Work Item/Assignment when safe. If assumptions change, it explicitly pauses, migrates, cancels, blocks, or routes back work. Runtime never silently rebinds an active Assignment to a new Work Item revision.

## Recovery

Replacement Runtime fetches accepted state and verifies Work Item Claim, Assignment, Worker Workbench, source base, private report digest, and Integration state. Private packet/report bytes cannot establish ownership without matching canonical operations.

## Related docs

- [Runtime](../components/runtime.md)
- [Change Traces](../components/traces.md)
- [Planning Loop](../components/planning-loop.md)
- [Worker Workbench](../components/worker-workbench.md)
- [Implementation Loop](../components/implementation-loop.md)
- [Remote State Synchronization](remote-state-synchronization.md)
