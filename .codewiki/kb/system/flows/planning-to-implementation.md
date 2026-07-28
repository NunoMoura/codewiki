---
type: Concept
title: Planning to Implementation Flow
description: Passed-and-appended Planning produces worker-ready Work Items and Workbench requirements; Runtime provisions exact execution and Implementation accepts only candidate-bound realization evidence.
tags:
  - codewiki
  - system
  - flows
  - planning
  - implementation
  - workbench
---
# Planning to Implementation Flow

Implementation scheduling starts only from exact Planning candidate whose required Results produce passing Exit Report and whose per-Change slices were fully appended/recovered.

```text
Planning candidate
→ Resolved Exit Policy
→ required Check Result fan-in
→ passing Exit Report
→ Runtime freshness/authority/CAS + multi-trace epoch append
→ worker-ready Work Item + Workbench requirements
→ Runtime selects Implementation tier/route and resolves Skills/tools/source/context
→ inert private Workbench provisioned and capability-probed
→ exact guarded Claim activates matching Workbench
→ isolated worker returns immutable Worker Report
→ Runtime constructs exact Implementation candidate
→ Implementation Checks and Exit Report
→ repair, accept, route, retry/wait, or block
→ guarded Integration
→ separately authorized merge/push/publication/release
```

Planning output supplies:

- Work Item, owning/contributing Change, Sprint, and plan identities;
- stable acceptance criteria;
- component/path/test ownership and Integration boundary;
- dependencies/concurrency/rollback constraints;
- verification and evidence requirements;
- bounded context/tool capability classes and optional narrowed Skill scope;
- isolation and budget class;
- frozen minimum Implementation Checks;
- preview target/profile bindings where applicable;
- uncertainty, blockers, resolutions, and canonical refs;
- Planning candidate/policy/Result/Report identity.

Planning does not select provider/model, install Skills, grant credentials/tools, prepare private source, append Claims, or attest Workbench existence. Runtime resolves host facts against fresh state and records exact manifest identity before Claim.

Worker completion supplies candidate evidence only. Implementation evaluates exact Worker Report plus Runtime-observed source/test/Git/Integration evidence through Code/Model Checks. Required Results fan in before semantic acceptance.

Implementation routes to Planning for Work Item, path, ordering, dependency, verification, decomposition, Workbench capability, Sprint, or Integration-plan changes. It routes to Decision for Product/Knowledge meaning, material risk, compatibility, outcome, or user authority changes. Provider/environment/capability failure remains Runtime-owned and becomes retry/wait/block, not fabricated candidate failure.

Related docs:

- [Planning Loop](../components/planning-loop.md)
- [Implementation Loop](../components/implementation-loop.md)
- [Worker Workbench](../components/worker-workbench.md)
- [Loop Exit](../components/loop-exit.md)
- [Model Routing](../components/model-routing.md)
- [Runtime](../components/runtime.md)
