---
type: Concept
title: Planning to Implementation Flow
description: Planning produces worker-ready Work Items and Workbench requirements; runtime selects exact execution, and Implementation Quality Policy governs realization acceptance.
tags:
  - codewiki
  - system
  - flows
  - planning
  - implementation
  - workbench
---
# Planning to Implementation Flow

Implementation scheduling may start only from a Planning iteration whose resolved Quality Policy permits `exit`. Planning shapes worker-ready outcomes and declares Workbench requirements. Runtime owns concrete model, capability, freshness, Claim, and Workbench binding.

```text
Planning candidate
-> Planning Quality Policy required-result fan-in
-> worker-ready Work Item + Workbench requirements
-> runtime refreshes WorkState and selects Implementation tier
-> runtime resolves Pi model route, Skills, tools, source, context, policy, isolation, and budgets
-> inert private Worker Workbench provisioned and capability-probed
-> exact guarded Claim activates matching Workbench
-> isolated worker returns immutable Worker Report candidate
-> Implementation Quality Policy required-result fan-in
-> repair, accept, route back, or block
-> guarded Integration and separately authorized effects
```

Planning output gives runtime and Implementation:

- Work Item, owning Change, contributor, Sprint, and Planning identities;
- acceptance criterion ids and exact text;
- component refs, path scopes, and integration boundary;
- dependencies and concurrency constraints;
- verification strategy and evidence requirements;
- required context and tool capability classes;
- optional narrowed Pi Skill scope;
- required isolation and budget class;
- frozen minimum Implementation Quality Standards;
- uncertainty, readiness, blockers, and explicit resolutions;
- canonical refs and policy resolution.

Planning does not select a provider/model, install Skills, grant tools or credentials, prepare private source state, append Claims, or attest that a Workbench exists. Runtime resolves every host-specific fact against fresh state.

Before Claim append, runtime must establish that the exact Workbench manifest is buildable and required adapters are available. The manifest is private inert scratch until a matching active canonical Claim activates it. Runtime checks elected generation and freshness both before Claim append and before worker start.

Workers have no semantic authority or peer/shared private memory. Completion supplies candidate evidence only. Implementation Quality Policy assesses the immutable Worker Report and exact source/evidence state through bounded independent verifiers. Required assessments fan in before deterministic gates permit semantic acceptance.

Implementation routes back to Planning for insufficient acceptance, bad path scopes, wrong ordering, missing verification, harmful work decomposition, unavailable required Workbench capabilities, or required split/merge. It routes to Decision when implementation would otherwise invent or revise product intent, risk authority, or outcome meaning.

Related docs:

- [Planning Loop](../components/planning-loop.md)
- [Implementation Loop](../components/implementation-loop.md)
- [Worker Workbench](../components/worker-workbench.md)
- [Quality Policy](../components/quality-policy.md)
- [Model Routing](../components/model-routing.md)
- [Runtime](../components/runtime.md)
