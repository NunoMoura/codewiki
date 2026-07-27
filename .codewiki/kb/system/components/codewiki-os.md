---
type: Concept
title: CodeWiki OS and Stage Protocols
description: CodeWiki adds versioned operating-system guidance and mandatory stage protocols to Pi without replacing Pi providers, authentication, tools, sessions, or Skills.
tags:
  - codewiki
  - system
  - protocols
  - skills
  - pi
---
# CodeWiki OS and Stage Protocols

CodeWiki runs on Pi rather than replacing it. Pi owns model providers, authentication, sessions, tool mechanics, extension loading, Skill discovery, and progressive Skill loading. CodeWiki owns the software-development operating contract layered onto those capabilities: semantic authority, canonical truth boundaries, stage behavior, Quality Policy, Workbench scope, routing, and guarded progression.

```text
Pi provider, authentication, session, and tool mechanics
+ versioned CodeWiki OS guidance
+ one versioned Stage Protocol
+ runtime-built stage input or Worker Workbench
+ ordinary Pi Skills available in that context
= bounded CodeWiki execution
```

## CodeWiki OS guidance

CodeWiki OS guidance is a compact, versioned package resource injected into every CodeWiki-owned semantic session and implementation worker. It establishes invariants shared by all stages:

- exactly three semantic loops exist: Decision, Planning, and Implementation;
- Change is accountable intent and a durable dossier, while runtime owns portfolio progression;
- `.codewiki/kb/**`, Change Traces, source/tests, and Git have distinct truth roles;
- WorkState and generated views are disposable projections;
- runtime alone owns scheduling, candidate identity, freshness, CAS, recovery, routing, and canonical writes;
- candidates, Skills, workers, and verifiers provide methods or evidence but cannot grant authority;
- private reasoning, credentials, raw tool payloads, Workbenches, and package prompt text never enter canonical traces;
- progression requires the resolved Quality Policy and exact authority for any guarded effect.

The resource has a stable id, semantic version, and content digest. Runtime records only those identifiers where recovery or audit requires them. It never stores the private prompt body in a Change Trace.

## Stage Protocols

A Stage Protocol is mandatory CodeWiki instruction for one semantic stage. It defines role, authoritative input, required output, prohibited actions, stop conditions, route-back behavior, and candidate schema. Stage Protocols are CodeWiki-owned package resources, not Pi Skills.

CodeWiki has three protocol families:

| Protocol | Required behavior |
| --- | --- |
| Decision | Refine and assess one exact Change revision against current project truth, preserving Decision authority and returning a typed candidate without runtime-owned identity or append fields. |
| Planning | Shape a bounded approved-Change portfolio into globally coherent worker-ready Work Items, dependencies, verification, integration boundaries, and Workbench requirements without choosing runtime model routes. |
| Implementation | Realize accepted scope or assess exact realization evidence, follow the Assignment and Quality Policy, report bounded evidence, and route semantic uncertainty to Planning or Decision. |

Each protocol is independently versioned. Runtime binds one exact protocol id, version, and digest to a job before execution. A protocol update invalidates only candidate and cache identities that depend on that protocol.

Stage Protocols do not form a user-authored loop language. Projects cannot replace stage authority, add a fourth semantic loop, change canonical output schemas, or weaken protected Quality Standards by supplying instructions.

## Pi Skills

Skills remain ordinary reusable Pi capabilities. CodeWiki does not define a Skill schema, registry, taxonomy, package format, distribution mechanism, or activation protocol.

Normal Pi discovery and progressive loading remain available in CodeWiki-owned sessions. Planning may narrow a Work Item's Workbench Skill scope when reproducibility, safety, or context discipline requires it. An omitted scope means the normally discovered catalog remains available; it does not mean “no Skills.” Runtime resolves declared Skill scope against the fresh host catalog and records only bounded ids and version/digest evidence in the private Workbench manifest.

A Skill may explain a method, workflow, tool usage pattern, or domain practice. A Skill cannot:

- grant tools or credentials;
- widen Assignment paths or Workbench capabilities;
- suppress or disable Quality Standards;
- change semantic stage authority or routing;
- change candidate or Worker Report schemas;
- claim that a candidate passed, exited, integrated, published, or released.

Conflicts resolve in this order: runtime authority and safety constraints, CodeWiki OS invariants, Stage Protocol, resolved Quality Policy and Workbench bounds, then Skill guidance. Runtime rejects candidates that rely on lower-authority guidance to violate a higher-authority contract.

## Prompt and context boundaries

CodeWiki supplies minimum sufficient context. Shared OS and Stage Protocol resources should be cache-friendly and stable. Runtime-specific identity, WorkState slices, Change or Planning facts, Quality Policy resolutions, and Workbench manifests remain separate typed inputs rather than being copied into one mutable prose prompt.

Prompts and context must exclude credentials, bearer tokens, private provider configuration, unrelated repository content, raw traces, unrestricted runtime artifacts, and hidden authority fields. Candidate outputs remain compact typed data; conversational transcript and private reasoning are never canonical evidence.

## Current migration drift

The current Pi SDK semantic-session implementation still hardcodes role guidance and sets `noSkills: true`. That is executable migration drift, not the target contract. Source migration must introduce versioned CodeWiki OS and Stage Protocol resources, restore normal Pi Skill discovery, and retain read-only semantic-session tool boundaries before this section is considered implemented.

## Related docs

- [Loop Model](loop-model.md)
- [Quality Policy](quality-policy.md)
- [Worker Workbench](worker-workbench.md)
- [Model Routing](model-routing.md)
- [Pi Extension](extension.md)
- [Session Coordination](session-coordination.md)
