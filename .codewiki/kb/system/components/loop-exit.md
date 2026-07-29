---
type: Concept
title: Loop Exit
description: Each semantic Loop evaluates one exact immutable candidate through a deterministically resolved set of Code Checks and Model Checks, then records one immutable Exit Report.
tags:
  - codewiki
  - system
  - loop
  - exit
  - checks
---
# Loop Exit

Loop exit is CodeWiki's common acceptance boundary across Decision, Planning, and Implementation. It replaces ad hoc acceptance logic and the superseded Quality/Standard/Assessment/Gate vocabulary with one compact model:

```text
immutable Loop candidate
→ Resolved Exit Policy
→ Checks
→ Check Results
→ Exit Report
→ runtime route
```

Checking is machinery inside the three semantic Loops. It is not a fourth Loop and does not create a standalone Implementation reviewer.

## Vocabulary

| Contract | Meaning |
| --- | --- |
| Check | One versioned requirement plus its execution kind, measurement contract, evidence requirements, repair target, limits, and trusted implementation identity. |
| Code Check | Trusted deterministic Check implemented by CodeWiki-owned code. “Code” describes the implementation mechanism, not necessarily source-code quality. |
| Model Check | Independent bounded Pi model invocation that evaluates one semantic requirement against an exact immutable candidate and evidence snapshot. |
| Resolved Exit Policy | Complete immutable candidate-specific selection of active Checks, enforcement, parameters, thresholds, activation reasons, dependencies, exclusions, and execution identities. |
| Check Result | Immutable result of one active Check against one exact candidate. Status is `pass`, `fail`, or `indeterminate`; measurement, evidence, findings, feedback, issue class, and repair target preserve the Check's declared shape. |
| Exit Report | Immutable aggregate binding one candidate and Resolved Exit Policy to the complete required Check Result set and deterministic `pass`, `fail`, or `indeterminate` status. |

Formal Check shape:

```ts
type Check = CodeCheck | ModelCheck;
```

A Check is not the entire Loop policy. One Resolved Exit Policy selects several Checks for one candidate. Each Check produces one Check Result. All required Results fan into one Exit Report.

## Independent dimensions

Execution kind, measurement shape, and enforcement are independent:

```text
execution:   code | model
measurement: qualitative | quantitative
enforcement: observe | warn | require
```

Examples:

| Check | Execution | Measurement |
| --- | --- | --- |
| Candidate schema is valid | Code | Qualitative boolean |
| Test failures are at most zero | Code | Quantitative count |
| Coverage is at least the required percentage | Code | Quantitative percentage |
| Accepted intent is preserved | Model | Qualitative structured judgment |
| Plan coherence clears a calibrated threshold | Model | Quantitative calibrated score |

Both measurement kinds may include structured findings and evidence. Quantitative Checks declare exact value shape, unit, comparator, threshold, allowed bounds, and trial/aggregation policy where applicable. Runtime applies the threshold; candidates and models cannot choose or alter it.

Measurement and status remain distinct:

```text
measurement = observed value
status      = interpretation under the exact resolved policy
```

Operational Check failure is `indeterminate`. Timeout, provider failure, malformed output, unavailable service, cancellation, or broken evidence collection must never become fabricated `fail` evidence or score zero.

## Exit status

Exit Report status is derived, never trusted from a candidate or Check implementation:

```text
required failed Check Result exists        → fail
else required indeterminate Result exists  → indeterminate
else                                        → pass
```

`observe` and `warn` Results remain visible but do not block exit. Kernel Checks are required according to CodeWiki's closed policy and cannot be disabled. Project Checks progress from `observe`, to `warn`, to explicitly approved `require`.

A passing Exit Report permits semantic Loop exit for that exact candidate. Runtime still owns final route, freshness, elected-generation fencing, compare-and-swap validation, and canonical append. Exit does not authorize Integration, branch merge, push, publication, release, deployment, or any other external effect.

## Policy resolution

Runtime resolves one policy from typed facts only:

```text
protected kernel Checks
+ Loop baseline
+ Change kind, risk, and affected-layer overlays
+ project traits
+ technology and path overlays
+ exact Planning minimums where applicable
+ explicitly approved additions
- permitted non-kernel exclusions
= Resolved Exit Policy
```

Project traits form a typed set, not one project type. Activation rules are sparse, versioned, deterministic, and explainable. Every active Check records `activatedBy` facts and rule refs. Every explicitly considered inactive Check records an allowed exclusion reason. Learned or neural Check activation is forbidden.

Planning freezes the minimum expected Implementation Checks for each Work Item. Fresh source and actual effects may add required Checks, but cannot silently remove that minimum. Any permitted reduction requires exact authority, an allowed non-kernel exclusion, and a new policy resolution.

## Exact identity

### Candidate identity

Runtime assigns one immutable identity after materializing the exact Loop-specific candidate and its guarded base facts. Candidate identity binds candidate schema/version/content, exact Change or Planning revisions, relevant WorkState and Knowledge snapshot, and source/Git base where applicable. Candidates cannot provide canonical identity.

### Check identity

Check identity binds:

- semantic Loop;
- Check id and version;
- requirement/content digest;
- `code` or `model` kind;
- implementation or protocol identity;
- measurement schema;
- evidence contract;
- catalog digest.

Same textual id under another Loop or changed content is a different Check.

### Check Result identity

Check Result identity binds exact candidate, resolved Check binding, implementation/model/configuration identity, evidence-input digests, measurement, threshold, findings, status, and trial/aggregation identity where applicable.

### Exit Report identity

Exit Report identity binds exact candidate, Resolved Exit Policy digest, complete required Check Result set, deterministic reduction version, and aggregate status.

Constructors reject wrong-candidate, wrong-policy, stale, missing, duplicate, contradictory, and wrong-measurement data. Preview and append use the same immutable candidate and Exit Report; append never reruns stochastic Model Checks.

## Candidate admission

All Checks in one run observe the same immutable candidate and evidence snapshot. Minimal admission verifies:

- exact Loop-specific candidate schema;
- runtime-owned identity and freshness;
- Loop Protocol and policy correspondence;
- canonical refs and authority envelope;
- required Check implementation availability needed to begin safely.

Invalid or stale candidates stop before expensive work. A failed Check does not cancel unrelated Checks whose Results can still improve repair feedback.

## Bounded execution

```text
immutable candidate
→ minimal admission
→ resolve policy
→ build shared facts once
→ bounded Code/Model Check fan-out
→ stream Check Results
→ required-result fan-in
→ immutable Exit Report
```

Runtime uses separate bounded pools for model/provider calls, CPU work, test/build processes, and external services. Checks stop early only for invalid or stale input, genuine unavailable dependencies, cancellation, or explicit budget policy—not merely because another required Check failed.

Required Checks may run asynchronously, but authoritative Loop exit waits for every required Result. Cancellation, timeout, or unavailable execution must still yield an explicit `indeterminate` Result; policy cannot silently omit required fan-in. Results may stream before fan-in so users and agents receive useful feedback early.

## Code Checks

Code Checks are deterministic, trusted, and closed in v1. They may evaluate booleans, scores, counts, ratios, sets, or structured findings, but their declared measurement contract remains exact. They may run CodeWiki-owned logic or consume bounded normalized evidence from tests/builds and other sensors.

Project input cannot register arbitrary JavaScript, shell, tool-defined Checks, or executable exit rules. Future plugins would require provenance, digest, typed measurement schema, cancellation, sandbox policy, project approval, staged rollout, and no route/write authority.

## Model Checks

Model Checks use independent bounded Pi sessions. Candidate producer and Model Check never share conversational state, even when they resolve to the same provider/model. Runtime supplies exact candidate, evidence, Loop Protocol context, model route, output schema, and limits.

Related Model Checks may share a coherent transport/context envelope for latency and prompt-cache reuse. Each retains distinct Check and Result identity. Model execution is stochastic; CodeWiki makes the invocation envelope, evidence binding, threshold, aggregation, and final report reduction exact.

There is no `implementation.review` model slot. Model Checks inherit calibrated Loop routes unless a CodeWiki-owned Check declares another approved route.

## Caching and invalidation

Exact cache identity includes:

- candidate and evidence digests;
- resolved policy and Check identity;
- Code/Model Check implementation identity;
- model and safe configuration digest;
- Loop Protocol digest;
- threshold, trial, and aggregation identity.

TTL controls eviction only. Path overlap may support invalidation hints, never authoritative reuse. Late Results from stale candidates cannot enter a newer report.

## Evidence, tools, and repair

Pi-Lens, LSP, compilers, linters, tests, browsers, AST tools, and Skills remain normal Workbench and repair capabilities. Their output does not automatically become authoritative Check evidence. CodeWiki-owned Code Checks may consume exact normalized evidence under closed contracts.

Failed and indeterminate Results include concise evidence gaps, `issueClass`, and `repairTarget` where known. Candidate producers may receive selected prior Repair Episodes derived from Change Traces. Model Checks remain independent and do not see producer learning context.

Learning cannot suppress Checks, lower thresholds, change activation, or attest acceptance. Repeated patterns become deterministic mechanisms only after visible and sealed evaluation plus an accountable Change.

## Trace boundary

Canonical Change Traces may retain:

- Resolved Exit Policy identity and bounded active bindings;
- one compact immutable Exit Report;
- Check ids/versions and Results;
- measurements, thresholds, evidence refs, issue classes, and repair targets;
- bounded latency/token/cache summaries;
- candidate repair lineage.

They never retain raw prompts, private reasoning, credentials, system instructions, full model responses, full tool payloads, or private provider configuration.

Operational telemetry remains separate from candidate, policy, report, and canonical trace authority.

## Current migration drift

Production Decision, Planning, Implementation, traces, and views still use legacy Quality, graph, judge, profile, pack, and review paths pending their clean Loop cuts. The unused native foundation under `src/loop-exit/**` now uses only Check, Check Result, Resolved Exit Policy, Exit Report, Loop, and `require` contracts; no old contract aliases remain. Its closed Catalog owns kernel registration, assigns project authority to accepted project definitions, rejects caller-declared authority, and cannot be replaced through resolver input. Gate objects are gone: required Check Results will reduce directly to `ExitReport.status`. `src/loop-exit/identity.ts` provides strict canonical JSON, lowercase SHA-256 digest validation, deeply frozen canonical values, and a Runtime-owned candidate envelope whose deterministic identity binds normalized content and exact observed-base digests/refs. Loop-owned strict content schemas now cover Decision, nested Planning, and nested Implementation admission, while Runtime supplies trusted semantic context. Identity-only declarations live under each Loop's `exit/**` directory, and `src/runtime/loop-exit-runtime.ts` composes them into one frozen `LoopExitSuite` with the closed Catalog. Exact Loop-qualified Check identity, immutable Check Result/Exit Report constructors, the native runner, and production Loop cuts remain pending.

## Related docs

- [Loop Contracts](loop-contracts.md)
- [CodeWiki OS and Loop Protocols](codewiki-os.md)
- [Model Routing](model-routing.md)
- [Worker Workbench](worker-workbench.md)
- [Lab](lab.md)
- [Traces](traces.md)
