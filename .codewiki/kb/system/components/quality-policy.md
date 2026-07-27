---
type: Concept
title: Quality Policy
description: A resolved Quality Policy deterministically selects and evaluates the exact Quality Standards required for one immutable stage candidate.
tags:
  - codewiki
  - system
  - quality
  - policy
---
# Quality Policy

Quality Policy is CodeWiki's common assurance contract across Decision, Planning, and Implementation. It replaces stage-specific ad hoc acceptance logic with explicit Standards, bindings, assessments, deterministic gates, and an explainable policy resolution.

Quality evaluation is machinery inside the three semantic loops. It is not a fourth loop and does not create a standalone Implementation reviewer agent.

## Vocabulary and contracts

| Contract | Meaning |
| --- | --- |
| Quality Standard | Versioned statement of what must be established for a bounded candidate. It declares assessment criteria, verifier kind, measurement shape, evidence requirements, repair target, cost, timeout, and protected status where applicable. |
| Standard binding | Deterministic activation of one Standard for one stage candidate, including enforcement mode, parameters, dependencies, and activation rationale. |
| Assessment | Verifier result for one bound Standard against one immutable candidate. Status is `met`, `unmet`, or `indeterminate`; optional measurements, evidence refs, findings, and repair feedback retain their declared shape. |
| Deterministic gate | Pure policy decision over one or more assessments and exact authority facts. A gate may permit exit, require repair, route back, or block. Model output never directly controls progression. |
| Resolved Quality Policy | Complete immutable set of active Standard bindings and gates for one candidate. |
| Quality Policy resolution | Explainable identity of the resolved policy: inputs, active bindings, `activatedBy` reasons, rule refs, protected Standards, permitted exclusions, versions, and digest. |
| Quality Report | Immutable aggregate evaluation output binding one candidate and policy digest to per-Standard Assessments, deterministic gate results, and aggregate `pass`, `fail`, or `indeterminate` status. |

Verifier kind, measurement shape, and enforcement mode are independent dimensions. A deterministic verifier may produce a boolean, score, count, set, or structured finding. A model verifier may produce a categorical assessment with evidence and feedback. Enforcement may be `observe`, `warn`, or `enforce` regardless of measurement shape.

Operational verifier failure is `indeterminate`. Timeout, provider failure, malformed output, unavailable external service, or cancelled work must never become fabricated `unmet` evidence or score `0`.

## Policy resolution

Runtime resolves policy from typed facts only:

```text
protected kernel invariants
+ stage baseline
+ Change kind, risk, and affected-layer overlays
+ project traits
+ technology and path overlays
+ explicit approved additions
- permitted non-kernel exclusions
= Resolved Quality Policy
```

Project traits are a typed set, not one project type. Examples include `web-ui`, `public-api`, `cli`, `library`, `persistent-data`, `handles-personal-data`, `security-sensitive`, and `release-producing`. Activation rules are sparse, versioned, deterministic, and explainable. Learned or neural routing cannot activate or remove Standards.

Every active binding records the facts and rule refs that activated it. Every inactive explicitly considered Standard records an allowed exclusion reason. A policy digest binds the exact Change revision, Planning revision where applicable, stage, candidate identity, selector facts, Standard versions, parameters, and gate definitions.

Protected kernel Standards cannot be disabled. Project Standards progress through `observe`, then `warn`, then explicit approved `enforce`. Initial project composition uses only CodeWiki's closed evaluator and evidence-adapter registry; arbitrary JavaScript and shell evaluators are not allowed.

Planning freezes the minimum expected Implementation policy for each Work Item. Fresh source and actual effects may add mandatory Standards, but cannot silently remove that minimum. Any reduction requires an allowed non-kernel exclusion plus exact authority and a new resolution.

## Candidate and admission

All assessments in one evaluation run observe the same immutable candidate identity and evidence snapshot. Minimal admission first verifies:

- candidate schema and stage correspondence;
- runtime-owned identity and freshness;
- policy and protocol digest correspondence;
- required canonical refs and authority envelope;
- evaluator availability needed to begin safely.

Invalid or stale candidates stop before expensive evaluation. A failed quality gate does not by itself cancel unrelated assessments; those results remain useful repair feedback.

## Bounded asynchronous evaluation

After admission, runtime builds shared deterministic facts once and schedules every ready verifier through bounded resource pools:

```text
immutable candidate
-> minimal admission
-> shared facts
-> bounded asynchronous verifier fan-out
-> streamed per-Standard assessments
-> required-result fan-in
-> deterministic gates
-> repair, exit, route back, or block
```

Evaluation dependencies express genuine input requirements. Gate dependencies express progression logic. They are not interchangeable. One failed hard condition may prevent exit while unrelated read-only Standards continue to run.

Concurrency is bounded separately for provider calls, local models, CPU analysis, test/build processes, and external services. Fail-fast applies only to invalid or stale evaluation input, a genuine missing evaluation prerequisite, cancellation, or budget policy—not merely because one Standard is unmet.

Required Standards may execute asynchronously, but authoritative stage exit waits at fan-in for every required Assessment or an explicit policy-approved `indeterminate` disposition. Assessments may stream to clients before fan-in so users receive useful feedback early. Fan-in emits one immutable Quality Report; it does not mutate the Quality Policy resolution.

## Model assessment and batching

Model-based Standards use independent verifier invocations, with no shared conversation or session state with the candidate-producing worker. Worker and verifier may use the same underlying model route, but never the same conversational state.

Related model Standards may share one coherent context envelope or provider batch for latency and prompt-cache reuse. Each Standard still receives a distinct assessment identity and output. Model assessment is stochastic; CodeWiki can make only the invocation envelope, evidence binding, aggregation rule, and deterministic gate reproducible.

Use “assessment criteria,” not “rubric,” in product and contract vocabulary.

## Caching and invalidation

Exact cache identity includes at least:

- candidate and evidence digests;
- Standard id and version;
- verifier or judge id;
- evidence-adapter version;
- model reference;
- configuration digest;
- Stage Protocol and Quality Policy digests;
- trial and aggregation policy.

A cache result is reusable only when every relevant identity matches. Shared fact extraction should be content-addressed. Path-, evidence-, or policy-local changes invalidate only dependent facts and assessments. Runtime cancels stale candidate work and must not allow late results to enter a newer fan-in.

## Evidence and trace boundary

Canonical traces may retain Quality Policy resolution identity and one compact Quality Report containing active Standard ids and versions, Assessments, measurements, evidence refs, deterministic gate results, latency/token summaries, and repair routes. They must not retain raw prompts, private reasoning, credentials, system instructions, full model responses, full tool payloads, or private provider metadata.

Quality telemetry is operational and separate from Change revision, policy resolution, and canonical Change Trace authority. It measures time to first useful feedback, time to authoritative exit, verifier latency, tokens, cache reuse, repair iterations, false passes, false blocks, and indeterminate rates.

## Efficiency objective

Quality optimization targets minimum sufficient assurance rather than maximum evaluator count. Changes to Standards, prompts, batching, or model routes require visible and sealed evaluation cases. Promotion should improve safety and usefulness without unacceptable token cost or response time. DSPy or GEPA may support optional offline experiments, but cannot become runtime authority or auto-promote policy.

## Current migration drift

Decision, Planning, and Implementation currently expose different production quality paths. Current graph and judge contracts use `rubric`, incomplete cache identity, profile masks, and hard-gate skipping that can suppress unrelated feedback. Source migration must first introduce common contracts with behavior parity, then move all three stages onto deterministic policy resolution and bounded fan-out/fan-in.

## Related docs

- [Loop Contracts](loop-contracts.md)
- [CodeWiki OS and Stage Protocols](codewiki-os.md)
- [Model Routing](model-routing.md)
- [Worker Workbench](worker-workbench.md)
- [Lab](lab.md)
