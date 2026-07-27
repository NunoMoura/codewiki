---
type: Concept
title: Worker Workbench
description: Planning declares reproducible Workbench requirements and runtime provisions one exact private Worker Workbench for each isolated Assignment attempt.
tags:
  - codewiki
  - system
  - implementation
  - workers
  - workbench
---
# Worker Workbench

A Worker Workbench is the complete private execution environment for one exact Implementation Assignment attempt. It is broader than an Assignment packet or context pack: it binds fresh source, bounded context, Skills, tools, model route, Quality obligations, isolation, budgets, and report contract into one reproducible runtime manifest.

Planning declares Workbench requirements. Runtime provisions the exact Workbench. Workers consume it. None of those actions grant semantic acceptance.

## Worker-ready Work Items

Planning shapes the minimum independently verifiable unit, not the smallest possible task. A worker-ready Work Item has:

- one coherent bounded outcome;
- exactly one owning Change and explicit contribution refs;
- stable acceptance criteria and verification strategy;
- bounded component and path scope;
- explicit dependencies and integration boundary;
- resolvable source and context requirements;
- required tool capabilities and isolation strength;
- optional narrowed Skill scope;
- Quality Standard minimums and evidence obligations;
- a Workbench readiness assessment.

Planning should not split work when decomposition increases semantic coupling, duplicate setup, integration risk, or unverifiable partial states. It should route uncertainty to Decision when implementation would otherwise need to invent product meaning.

## Planning-owned requirements

Workbench requirements are canonical Planning facts. They describe needs without choosing host-specific instances:

```ts
interface WorkerWorkbenchRequirements {
  contextRefs: string[];
  requiredCapabilities: string[];
  allowedToolClasses: string[];
  skillScope?: string[];
  isolation: "process" | "worktree" | "container";
  minimumQualityStandardIds: string[];
  evidenceRequirements: string[];
  budgetClass: "routine" | "standard" | "complex";
}
```

`skillScope` narrows the normally discovered Pi Skill catalog. Its absence preserves normal availability. Planning cannot define Skill content, install packages, grant credentials, choose runtime-owned model identity, weaken protected Standards, or provide arbitrary execution commands.

## Runtime-provisioned manifest

Before Claim append, runtime resolves requirements against fresh WorkState and host capabilities, then creates one digest-bound private manifest containing:

- Assignment, Change, Planning, Work Item, and acceptance identities;
- exact source base, repository identity, and mutable workspace identity;
- bounded context refs, content digests, and source ownership facts;
- resolved Pi Skill ids and versions within declared scope;
- exact tool capabilities and denied capabilities;
- selected Implementation model tier and resolved Pi model route;
- resolved minimum Quality Policy and evidence obligations;
- process, worktree, or OCI isolation configuration;
- time, token, cost, process, and output budgets;
- Worker Report schema, destination, and digest contract;
- protocol, policy, configuration, and Workbench digests.

The manifest contains no credentials, bearer capabilities, private system prompt body, unrestricted environment dump, or unrelated source. Provider authentication remains inside Pi or the trusted host adapter.

Runtime probes required capabilities before Claim append. Container work is held if the digest-pinned preinstalled image or host capability is unavailable. A pre-Claim Workbench is inert private scratch: only an exact matching active canonical Claim activates it. Runtime rechecks freshness and elected generation immediately before append and before worker start.

## Isolation and worker authority

Each worker is an isolated disposable agent. Workers do not share conversational memory, peer scratch, or semantic authority. They may mutate only the exact workspace and paths granted by the Workbench and may use only its tools and Skills.

A worker cannot:

- revise Decision or Planning truth;
- widen paths, tools, model route, or isolation;
- change or suppress Quality Standards;
- write canonical traces or WorkState;
- integrate, merge, push, publish, release, or deploy;
- treat local checks or completion as semantic acceptance.

Workers return one immutable Worker Report. Runtime validates report identity, digest, Assignment, Workbench, source base, and active Claim. `completed` means candidate evidence exists; it never means the Work Item is accepted.

## Quality feedback and repair

Implementation Quality Policy assesses one immutable worker candidate. Repair feedback names failed or indeterminate Standards, exact evidence gaps, and allowed repair scope. Runtime may start a fresh attempt or an explicitly bounded continuation under a new candidate identity. Repeated failures, new effects, or unresolved uncertainty may raise the Implementation tier or route to Planning or Decision.

No worker sees another worker's private report or scratch by default. Shared facts enter a Workbench only through canonical Planning, current WorkState, accepted integration evidence, or a new runtime-built context slice.

## Discoveries

A Worker Report may include bounded discoveries outside assigned acceptance scope. Runtime sanitizes and deduplicates those findings, strips private artifacts, and may persist them as pending Change intake. A discovery grants no approval, Planning coverage, scheduling priority, or implementation authority.

## Recovery and sanitation

Workbench manifests and materialized environments live under private `.codewiki/runtime/**` state. They are operational recovery artifacts, not canonical truth. Replacement generations may resume only when manifest digest, deterministic job identity, active Claim, source base, and adapter capability all match.

Runtime removes stale pre-Claim Workbenches, terminal unsuccessful artifacts, and proof-authorized completed artifacts idempotently. Active-Claim, unintegrated completed, and ambiguous evidence remain preserved. Canonical Change Traces retain only bounded identities, receipts, refs, and accepted results—not Workbench contents.

## Current migration drift

Current Assignments bind paths, WorkState, source base, context digest, prompt, isolation, and execution policy, but not a complete Workbench manifest. Current runtime writes an Assignment packet before Claim and prepares parts of the environment afterward. Source migration must add Planning requirements, exact capability resolution, model and Skill binding, Quality minimums, pre-Claim manifest identity, and guarded activation without weakening existing Claim and recovery behavior.

## Related docs

- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Runtime](runtime.md)
- [Session Coordination](session-coordination.md)
- [Quality Policy](quality-policy.md)
- [Model Routing](model-routing.md)
