---
type: Concept
title: CodeWiki OS and Loop Protocols
description: CodeWiki adds versioned operating-system guidance and one mandatory Loop Protocol for Decision, Planning, or Implementation without replacing Pi providers, authentication, tools, sessions, or Skills.
tags:
  - codewiki
  - system
  - protocols
  - skills
  - pi
---
# CodeWiki OS and Loop Protocols

CodeWiki runs on Pi rather than replacing it. Pi owns providers, authentication, model transport, sessions, compaction, tool mechanics, extension loading, and ordinary Skill discovery. CodeWiki owns the software-development operating contract layered onto those capabilities: semantic authority, canonical truth boundaries, Loop behavior, exit Checks, Workbench scope, routing, and guarded progression.

```text
Pi provider/authentication/session/tool mechanics
+ versioned CodeWiki OS guidance
+ one versioned Loop Protocol
+ runtime-built Loop input or Worker Workbench
+ ordinary Pi Skills available in that context
= bounded CodeWiki execution
```

## CodeWiki OS guidance

CodeWiki OS guidance is one compact versioned package resource injected into every CodeWiki-owned semantic session and implementation worker. It establishes shared invariants:

- exactly three semantic Loops exist: Decision, Planning, and Implementation;
- Change is accountable intent and a durable dossier;
- Project Runtime owns portfolio scheduling and progression;
- Knowledge, Change Traces, source/tests, Git, and external observations retain distinct authority;
- WorkState and relationship/learning views are disposable;
- runtime alone owns candidate identity, freshness, CAS, recovery, routing, and canonical writes;
- candidates, Skills, workers, Checks, clients, and tools cannot grant authority;
- private reasoning, credentials, raw tool output, Workbenches, and package prompt text never enter canonical traces;
- Loop exit requires an exact Resolved Exit Policy and immutable Exit Report;
- guarded effects require separate exact authority after semantic exit.

The resource has stable id, semantic version, and content digest. Runtime records only those identifiers needed for recovery and audit, never private prompt text.

## Loop Protocols

A Loop Protocol is mandatory CodeWiki instruction for one semantic Loop. It defines role, authoritative input, required candidate, prohibited actions, stop conditions, route-back behavior, and candidate schema. Loop Protocols are CodeWiki-owned package resources, not Pi Skills.

| Protocol | Required behavior |
| --- | --- |
| Decision | Refine one exact Change revision against current project truth, preserve user/Decision authority, account for Knowledge and active-Change overlap, and return a typed candidate without runtime-owned fields. |
| Planning | Shape a bounded approved-Change portfolio into globally coherent worker-ready Work Items, dependencies, verification, integration boundaries, and Workbench requirements without choosing concrete providers or runtime routes. |
| Implementation | Realize accepted scope or assess exact realization evidence, follow Assignment and Check minimums, return bounded candidate evidence, and route semantic uncertainty to Planning or Decision. |

Each Protocol is independently versioned. Runtime binds exact id/version/digest before execution. Protocol changes invalidate only dependent candidate and cache identities.

Loop Protocols do not form a user-authored Loop language. Projects cannot replace Loop authority, add a fourth semantic Loop, change canonical candidate schemas, weaken protected Checks, or alter runtime routing through instructions.

## Pi Skills

Skills remain ordinary reusable Pi capabilities. CodeWiki defines no Skill schema, registry, taxonomy, package format, distribution mechanism, or activation protocol.

Normal Pi discovery and progressive loading remain available. Planning may narrow Workbench Skill scope when reproducibility, safety, or context discipline requires it. Omitted scope preserves normal discovery. Runtime resolves a declared scope against the fresh host catalog and records only bounded identity evidence in the private Workbench manifest.

A Skill may explain a method, workflow, tool pattern, or domain practice. It cannot:

- grant tools or credentials;
- widen Assignment paths or Workbench capabilities;
- suppress or disable required Checks;
- change Loop authority, candidate schema, or routing;
- claim that a candidate passed, exited, integrated, published, or released.

Conflicts resolve in this order:

```text
runtime authority and safety
→ CodeWiki OS
→ Loop Protocol
→ Resolved Exit Policy and Workbench bounds
→ Skill guidance
```

Runtime rejects candidates relying on lower-authority guidance to violate higher-authority contracts.

## Prompt and context boundaries

CodeWiki supplies minimum sufficient context. OS and Loop Protocol resources should remain stable and cache-friendly. Runtime identity, WorkState slices, Change/Planning facts, Resolved Exit Policy, selected Repair Episodes, and Workbench manifests remain separate typed inputs instead of one mutable prose prompt.

Prompts/context exclude credentials, bearer tokens, private provider configuration, unrelated source, raw traces, unrestricted runtime artifacts, and hidden authority fields. Candidate outputs remain compact typed data; transcript and private reasoning are never canonical evidence.

Candidate producers may receive bounded project-local repair evidence. Independent Model Checks never share producer conversational state or learning context.

## Current migration drift

Current Pi SDK semantic sessions still hardcode role guidance and disable Skills with `noSkills: true`. Executable source/tests still retain superseded checking vocabulary and paths. Migration must introduce versioned CodeWiki OS and Loop Protocol resources, restore normal Pi Skill discovery, preserve read-only semantic-session boundaries, and adopt exact Candidate/Check/Result/Exit Report contracts.

## Related docs

- [Loop Model](loop-model.md)
- [Loop Exit](loop-exit.md)
- [Worker Workbench](worker-workbench.md)
- [Model Routing](model-routing.md)
- [Pi Extension](extension.md)
- [Session Coordination](session-coordination.md)
