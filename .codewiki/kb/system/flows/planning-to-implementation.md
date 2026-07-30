---
type: Concept
title: Planning to Implementation Flow
description: Passing atomic Planning epochs produce immutable worker-ready Work Items and Worker Workbench requirements; Runtime acquires exact Work Item Claims and Implementation accepts only candidate-bound integrated realization evidence.
tags:
  - codewiki
  - system
  - flows
  - planning
  - implementation
  - workbench
timestamp: 2026-07-30T00:00:00Z
---
# Planning to Implementation Flow

Implementation scheduling starts only from an exact Planning Candidate whose required Results produce a passing Exit Report and whose epoch/participant bindings were atomically accepted.

```text
Planning Candidate
→ Evidence Records
→ Resolved Exit Policy
→ required Check Result fan-in
→ passing Exit Report
→ Runtime freshness/authority/expected-head guard
→ PlanningEpochRecord + atomic participant bindings
→ worker-ready Work Item + Worker Workbench requirements
→ Runtime resolves tier/route/Skills/tools/source/context
→ inert private Worker Workbench provision and capability probe
→ work_item_claim.acquired
→ assignment.dispatched
→ isolated worker returns immutable Worker Report
→ Runtime performs guarded Integration and materializes exact proof
→ Runtime constructs exact integrated Implementation Candidate and Evidence Records
→ Implementation Checks, Results, Exit Report, and Runtime Route over that tree
→ explicit Work Item Claim release or authenticated takeover
→ separately authorized branch/delivery effects
```

Planning output supplies:

- Work Item, owning/contributing Change, Sprint, and epoch identities;
- stable acceptance requirements;
- component/path/test/Knowledge scope and Integration boundary;
- dependencies, concurrency, rollback, and active-work disposition;
- verification and declarative Evidence obligations;
- bounded context/tool capability classes and optional narrowed Skill scope;
- isolation and budget class;
- minimum Implementation Checks derived by Runtime from canonical Planning evidence;
- preview target/profile bindings where applicable;
- uncertainty, blockers, resolutions, and exact refs;
- Candidate, policy, Result, Report, and Runtime Route identities.

Planning does not select provider credentials, install Skills, grant tools, prepare private source, acquire Work Item Claim authority, or attest Worker Workbench existence. Runtime resolves host facts against fresh state and records exact manifest identity before acquisition.

Worker completion supplies asserted producer material only. Implementation evaluates exact Worker Report plus Runtime-observed source/test/Git/Integration Evidence. Final required Results evaluate exact integrated content.

A later Planning epoch cannot silently rewrite an active Assignment. It preserves safe work or explicitly pauses, migrates, cancels, blocks, or routes it back.

Implementation routes to Planning for Work Item, path, ordering, dependency, verification, decomposition, Worker Workbench capability, Sprint, or Integration-plan changes. It routes to Decision for Product/Knowledge meaning, material risk, compatibility, outcome, or user authority changes. Provider/environment/capability failure remains Runtime-owned and becomes retry/wait/block, not fabricated Candidate failure.

## Related docs

- [Planning Loop](../components/planning-loop.md)
- [Implementation Loop](../components/implementation-loop.md)
- [Worker Workbench](../components/worker-workbench.md)
- [Loop Exit](../components/loop-exit.md)
- [Runtime](../components/runtime.md)
- [Runtime Work Item Claim Flow](runtime-work-item-claims.md)
