---
type: Concept
title: Worker Workbench
description: Planning declares reproducible Workbench requirements and Runtime provisions one exact private Worker Workbench for each isolated Assignment attempt.
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
- stable acceptance criteria and verification;
- bounded component/path/test scope;
- dependencies and Integration boundary;
- resolvable source/context needs;
- required capabilities and isolation;
- optional narrowed Skill scope;
- frozen minimum Check/evidence obligations;
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

Before Claim append, Runtime resolves requirements against fresh WorkState and host capabilities. Private digest-bound manifest includes:

- Assignment, Change, Planning, Work Item, and criterion identities;
- exact repository/source base and mutable workspace identity;
- bounded context/provenance refs, content digests, and ownership facts;
- resolved Pi Skill ids/versions inside declared scope;
- exact allowed/denied tool capabilities;
- selected Implementation tier and Pi route/configuration identity;
- frozen minimum Check bindings and evidence obligations;
- process/worktree/OCI isolation;
- time/token/cost/process/output budgets;
- Worker Report schema, destination, and digest contract;
- CodeWiki OS, Implementation Loop Protocol, configuration, and Workbench digests.

No credentials, bearer capabilities, private prompt body, unrestricted environment, unrelated source, or repair history outside bounded applicability enters manifest. Provider authentication remains inside Pi/trusted adapter.

Runtime probes capabilities before Claim append. Digest-pinned preinstalled OCI image is required; no implicit pull. Pre-Claim Workbench is inert scratch. Exact active canonical Claim activates it, and Runtime rechecks generation/freshness before append/start.

## Worker authority

Workers are isolated disposable agents. They share no peer conversational memory or scratch and may mutate only granted workspace/paths using allowed tools/Skills.

Worker cannot:

- revise Decision/Planning truth;
- widen paths, capabilities, model route, isolation, or budget;
- activate/suppress Checks or change thresholds;
- write traces/WorkState;
- integrate, merge, push, publish, release, or deploy;
- treat local checks or completion as acceptance.

Worker returns one immutable Worker Report. Runtime validates report/Assignment/Workbench/base/Claim identity. `completed` means candidate evidence exists only.

## Check feedback and repair

Implementation evaluates one immutable realization candidate. Exit Report names failed/indeterminate Checks, evidence gaps, issue classes, repair targets, and allowed scope. Runtime creates a new candidate identity for every repair attempt and may raise tier or route to Planning/Decision.

Candidate producer may receive bounded applicable same-Change or project-local Repair Episodes. Model Checks never receive producer conversation or repair-learning context. Learned evidence cannot lower tier, suppress Checks, or weaken authority.

No worker sees peer-private report/scratch by default. Shared facts enter only through accepted Planning, current WorkState, Integration evidence, or new Runtime-built context.

## Discoveries

Worker Report may contain bounded discoveries outside assigned acceptance. Runtime sanitizes/deduplicates and may submit them as pending Change intake. Discovery grants no approval, Planning coverage, priority, or implementation authority.

## Recovery and sanitation

Manifests/environments live under private `.codewiki/runtime/**`. Replacement generation resumes only when manifest digest, job identity, active Claim, base, and adapter capability match.

Runtime removes stale pre-Claim, terminal unsuccessful, and proof-authorized completed material idempotently. Active-Claim, unintegrated completed, and ambiguous evidence remain. Change Traces retain bounded identities, Results, receipts, refs, and outcomes—not Workbench contents.

## Current migration drift

Current Assignments bind paths, WorkState, source base, context digest, prompt, isolation, and execution policy, but not complete Workbench manifest. Migration adds Planning requirements, capability/model/Skill binding, frozen Check minimums, Loop Protocol identity, pre-Claim manifest identity, and guarded activation while preserving Claim/recovery behavior.

## Related docs

- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Runtime](runtime.md)
- [Session Coordination](session-coordination.md)
- [Loop Exit](loop-exit.md)
- [Model Routing](model-routing.md)
