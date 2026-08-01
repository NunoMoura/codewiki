---
type: Concept
title: Worker Workbench
description: Planning declares reproducible requirements and Runtime provisions one exact private Worker Workbench bound to one Work Item Claim and isolated Assignment attempt.
tags:
  - codewiki
  - system
  - implementation
  - workers
  - workbench
---
# Worker Workbench

A Worker Workbench is the complete private execution environment for one exact Implementation Assignment attempt. It binds fresh source, bounded context, ordinary Pi Skills, tools, model route, Check/evidence obligations, isolation, budgets, and Worker Report contract into one reproducible Runtime manifest.

Planning declares requirements. Runtime provisions and activates exact Workbench. Worker consumes it. None grants semantic acceptance.

## Worker-ready Work Items

Planning shapes coherent independently verifiable outcomes, not smallest tasks. Worker-ready work has:

- one bounded outcome;
- exactly one owning Change plus explicit contribution refs;
- stable acceptance requirements and verification;
- bounded component/path/test scope;
- dependencies and Integration boundary;
- resolvable source/context needs;
- required capabilities and isolation;
- optional narrowed Skill scope;
- declarative minimum Check/Evidence obligations that Runtime resolves from canonical Planning evidence;
- Workbench buildability rationale.

Planning avoids splits that increase semantic coupling, duplicate setup, Integration risk, or unverifiable partial state. Product/Knowledge uncertainty routes to Decision.

## Planning requirements

```ts
interface WorkerWorkbenchRequirements {
  contextRefs: string[];
  requiredCapabilities: string[];
  allowedToolClasses: string[];
  skillScope?: string[];
  isolation: "process" | "worktree" | "container";
  minimumCheckIds: string[];
  evidenceRequirements: string[];
  budgetClass: "routine" | "standard" | "complex";
}
```

Omitted `skillScope` preserves normal Pi discovery. Planning may narrow but cannot define/install Skills, grant credentials/tools, choose concrete provider/model identity, weaken protected Checks, or supply arbitrary commands.

## Runtime manifest

Before Work Item Claim acquisition, Runtime resolves requirements against fresh WorkState and host capabilities. Private digest-bound manifest includes:

- Assignment, Change, Planning, Work Item, and acceptance-requirement identities;
- exact repository/source base and mutable workspace identity;
- bounded context/provenance refs, content digests, and ownership facts;
- resolved Pi Skill ids/versions inside declared scope;
- exact allowed/denied tool capabilities;
- selected Implementation tier and Pi route/configuration identity;
- Runtime-derived minimum Check bindings and Evidence obligations from canonical Planning evidence;
- process/worktree/OCI isolation;
- time/token/cost/process/output budgets;
- Worker Report schema, destination, and digest contract;
- CodeWiki OS, Implementation Loop Protocol, configuration, and Workbench digests.

No credentials, bearer capabilities, private prompt body, unrestricted environment, unrelated source, or repair history outside bounded applicability enters manifest. Provider authentication remains inside Pi/trusted adapter.

Runtime probes capabilities before Work Item Claim acquisition. Digest-pinned preinstalled OCI image is required; no implicit pull. Pre-acquisition Worker Workbench is inert scratch. Exact accepted Work Item Claim plus `assignment.dispatched` activates it, and Runtime rechecks generation/freshness before start.

## Worker authority

Workers are isolated disposable agents. They share no peer conversational memory or scratch and may mutate only granted workspace/paths using allowed tools/Skills.

Worker cannot:

- revise Decision/Planning truth;
- widen paths, capabilities, model route, isolation, or budget;
- activate/suppress Checks or change thresholds;
- append Change operations or mutate WorkState;
- integrate, merge, push, publish, release, or deploy;
- treat local checks or completion as acceptance.

Worker returns one immutable Worker Report. Runtime validates report, Assignment, Worker Workbench, source base, and Work Item Claim identity. `completed` means potential Candidate material exists only; Runtime must still integrate and verify it.

## Check feedback and repair

Implementation evaluates one immutable realization candidate. Exit Report names failed/indeterminate Checks, evidence gaps, issue classes, repair targets, and allowed scope. Runtime creates a new candidate identity for every repair attempt and may raise tier or route to Planning/Decision.

Candidate producer may receive bounded applicable same-Change or project-local successful and harmful Repair Episodes/Patterns. Independent Model Checks never receive producer conversation or repair-learning context. Learned evidence cannot lower tier, suppress Checks, or weaken authority.

No worker sees peer-private report/scratch by default. Shared facts enter only through accepted Planning, current WorkState, Integration evidence, or new Runtime-built context.

## Discoveries

Worker Report may contain at most sixteen bounded discovery proposals for discrepancies outside assigned acceptance. A proposal carries only affected refs, observed versus expected behavior, claimed category/severity/confidence, source refs, and optional qualified security metadata. Runtime materializes each `WorkerDiscoveryMaterial` by adding the exact Worker Report, Assignment operation, Work Item Claim operation, and base/result tree bindings. Worker cannot assign those bindings, Change identity, canonical risk, priority, route, or authority. Pi process reports now parse, normalize, persist, and recover this proposal list; malformed or credential-bearing proposals fail closed.

Runtime sanitizes, deduplicates, and scope-routes each discovery. A defect in the assigned Candidate becomes current-Change repair feedback; a Planning or Decision assumption routes back to that authority; a genuinely independent discrepancy may become a linked pending Change with `discovered_from`; a duplicate reinforces existing work. Discovery grants no approval, Planning coverage, priority, or implementation authority, and worker completion cannot suppress an unresolved in-scope finding.

## Recovery and sanitation

Manifests/environments live under private `.codewiki/runtime/**`. Replacement Runtime resumes only when manifest digest, job identity, active Work Item Claim, source base, and adapter capability match accepted state.

Runtime removes stale pre-acquisition, terminal unsuccessful, and proof-authorized completed material idempotently. Active Work Item Claim, unintegrated completed, and ambiguous evidence remain. Change operations retain bounded identities, Results, receipts, refs, and outcomes—not Worker Workbench contents.

## Current clean-cut drift

Current Assignments bind paths, WorkState, source base, context digest, prompt, isolation, and execution policy, but not a complete Worker Workbench manifest. The clean cut adds Planning requirements, capability/model/Skill binding, Runtime-derived Check minimums, Loop Protocol identity, pre-acquisition manifest identity, accepted Work Item Claim activation, and remote-state recovery.

## Related docs

- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Change Intake and Backlog Triage](change-intake.md)
- [Runtime](runtime.md)
- [Session Coordination](session-coordination.md)
- [Loop Exit](loop-exit.md)
- [Model Routing](model-routing.md)
