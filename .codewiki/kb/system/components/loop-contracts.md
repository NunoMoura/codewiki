---
type: Concept
title: Loop Contracts
description: "CodeWiki has exactly three semantic Loops; every attempt follows exact Candidate, Evidence Records, Resolved Exit Policy, Checks, Check Results, Exit Report, and Runtime Route contracts."
tags:
  - codewiki
  - system
  - loop
  - contracts
timestamp: 2026-07-30T00:00:00Z
codewiki_component: loop_exit
codewiki_components:
  - loop_exit
codewiki_source_patterns:
  - src/semantic-loop.ts
  - src/loop-exit/**
  - src/loops/**
codewiki_test_patterns:
  - tests/loop-exit/**
  - tests/loops/**
  - tests/decision/**
  - tests/planning/**
  - tests/implementation/**
  - tests/lab/**
codewiki_role: loop_exit_engine
codewiki_source_map:
  - id: loop_exit
    source_patterns:
      - src/semantic-loop.ts
      - src/loop-exit/**
      - src/loops/**
    test_patterns:
      - tests/loop-exit/**
      - tests/loops/**
      - tests/decision/**
      - tests/planning/**
      - tests/implementation/**
      - tests/lab/**
    role: loop_exit_engine
---
# Loop Contracts

CodeWiki has exactly three semantic Loops:

```text
Decision
Planning
Implementation
```

Runtime is the outer control loop, while **Project Runtime** names the whole project control plane. Knowledge propagation belongs to Decision. Planning evaluates a bounded WorkState horizon rather than one Change in isolation. Check execution, learning, graph projection, recovery, Integration, publication, release, and feedback are machinery or effects—not additional semantic Loops.

Write authority is surface-specific: semantic sessions, workers, tools, users, and providers return candidate or evidence material; Project Runtime alone materializes canonical Evidence Records, appends accepted Change operations, and performs separately authorized effects.

Each Loop has:

1. an exact typed input;
2. a versioned mandatory Loop Protocol;
3. one or more attempts;
4. an immutable role-specific Candidate for each attempt;
5. exact immutable Evidence Records and obligation resolutions;
6. one Candidate-specific Resolved Exit Policy;
7. one Check Result per active Check;
8. one immutable Exit Report;
9. one Runtime-selected route after freshness and authority validation.

```text
Change
→ Loop
→ Candidate
→ Evidence Records
→ Resolved Exit Policy
→ Checks
→ Check Results
→ Exit Report
→ Runtime Route
```

Canonical append and effects remain separate Runtime guards after this chain.

## Change, Planning, and execution relationships

Change is one accountable intent and the durable dossier over all revisions, attempts, repairs, Planning coverage, implementation realization, Git/delivery proof, and observations. It remains a conceptual aggregate over append-only records, not one mutable object.

```text
Change * ↔ * Sprint
Sprint 1 → * Work Item
Work Item 1 → * Assignment attempt
```

Each Work Item has exactly one owning Change and may declare contribution to others. Runtime grants bounded Assignments. Worker completion is candidate evidence, never semantic acceptance.

WorkState is a deterministic disposable projection over accepted Change operations, Knowledge, source ownership, source/tests/Git, configuration/policy, and bounded observations. The Alignment Graph is a deterministic first-class projection; indexes, rendering, and learning views remain disposable.

## Loop responsibilities

| Loop | Input focus | Candidate focus | Required exit meaning |
| --- | --- | --- | --- |
| Decision | Exact proposed/persisted Change revision, relevant WorkState/Knowledge/current-state refs, overlap, authority, route-back context. | Normalized intent, outcome, Knowledge delta, constraints, risks, delivery effects, overlap disposition, approval or terminal disposition facts. | Accepted interpretation is grounded, coherent, Knowledge-accounted, risk-aware, overlap-accounted, and exactly authorized. |
| Planning | Bounded selected Change set, current Planning/Assignment/Integration state, Change Claims, Work Item Claims, constraints, and prior epochs. | Globally coherent Sprints, worker-ready Work Items, dependencies, acceptance requirements, verification, path/component bounds, triggers, resolutions, Integration, and Worker Workbench requirements. | Every selected approved Change has coherent executable coverage or explicit authorized resolution, and active work is preserved or explicitly dispositioned. |
| Implementation | Owning approved Change, accepted Work Items, Assignments/Worker Reports, Integration state, source ownership, source/tests/Git, prior evidence. | Exact realization, changed paths, acceptance-requirement evidence, trusted check observations, worker provenance, Integration/content proof, outcome disposition, route-back questions. | Exact accepted obligations are realized, verified, integrated, provenance-bound, and ready for the requested semantic exit. |

Downstream Loops consume only exact passed-and-appended upstream output. Failed and indeterminate attempts remain durable accountability, repair, and learning evidence.

## Candidate contract

A candidate is exact immutable output proposed by one Loop attempt. Candidate identity binds:

- Loop and candidate schema version;
- normalized candidate content;
- exact Change revision or selected Change set;
- WorkState and Knowledge snapshot;
- relevant source/Git base;
- runtime-derived facts required by candidate construction.

Runtime creates candidate identity. Candidates cannot supply identity, actor authority, canonical timestamps, runtime job IDs, generation, activation, CAS, final route, proof scope, or aggregate proof.

Different content or observed base creates a different candidate. Preview and append use the same immutable candidate and Exit Report; append never performs stochastic reevaluation.

Role-specific schemas replace broad arbitrary-record submissions and broad `Omit<RunWiki*Input, ...>` contracts. Constructors reject unsupported and runtime-owned fields before execution.

## Evidence contract

An Evidence Record is one immutable content-addressed observation shared across Loops. Its small common envelope binds exact subject, producer, provenance, artifact, Runtime-owned observation/freshness, authority class, coverage, sensitivity, and one closed kind-specific payload. It has stable identity but no independent mutable lifecycle, CRUD service, central database, or semantic Loop.

```text
Check requirement = assertion to establish
Evidence Record   = supporting, contradicting, partial, or unknown observation
Check Result      = interpretation under exact candidate, Check, and policy
```

Runtime materializes Evidence Records from bounded producer material. Producers cannot provide canonical id/time, upgrade authority/coverage, select Checks, set verdict, or grant acceptance. Large media/log/page bytes remain in existing source, Git, provider, or content-addressed artifact boundaries; compact records and exact digests persist in Change Traces.

Initial kinds are research citation, source observation, command execution, UI capture, model assessment, Worker Report, Integration proof, approval receipt, delivery attestation, and outcome observation. Each kind uses a discriminated schema and explicit privacy/retention policy. One record may support several Checks; one Check may require several kinds. Contradictions are preserved rather than overwritten.

## Check contract

```ts
type Check = CodeCheck | ModelCheck;
```

A Check is one atomic versioned requirement plus execution kind, measurement contract, evidence contract, repair target, resource limits, and implementation identity. It is not an entire Loop policy.

### Code Check

A Code Check is trusted deterministic CodeWiki-owned code. “Code” describes implementation, not subject matter. Examples include:

- schema and reference validity;
- dependency closure and cycle detection;
- path scope and source ownership;
- test failure count and coverage threshold;
- exact authority and active-Change overlap;
- Git tree correspondence and Integration proof.

The executable catalog is closed. Projects cannot inject arbitrary JavaScript, shell, executors, or third-party verifiers. Default Checks are CodeWiki-provided. Custom Checks are distilled from exact accepted User Standards under closed CodeWiki-owned Check Types. Custom Model Checks use declarative requirements; Custom Code Checks may instantiate only approved deterministic templates or adapters with structured parameters.

### Model Check

A Model Check is one atomic semantic requirement evaluated through an independent bounded model assessment against immutable evidence.

- It shares no conversational state with the candidate producer.
- Runtime chooses model route and configuration.
- Output is structured and bounded.
- Timeout, provider failure, malformed output, cancellation, or unavailable service is `indeterminate`.
- It cannot append, route, change policy, or attest acceptance.

Related Model Checks may share one physical transport/context envelope or deterministic batch for efficiency, but every Check retains a separate Assessment and Result identity. Physical call topology is an implementation and calibration choice, not semantic aggregation.

### Orthogonal dimensions

```text
origin:      default | custom
execution:   code | model
check type:  intent | security | design | API | policy | ...
measurement: qualitative | quantitative
enforcement: observe | warn | require
```

Requirement origin, CodeWiki/project authority, execution kind, semantic Check Type, and measurement remain independent. Resolved policy owns enforcement; every applicable active Custom Check resolves to `require`. Every Custom Check binds exact accepted User Standard snapshots. Custom Code Checks select only approved deterministic templates with bounded structured parameters.

Quantitative Checks declare exact value shape, unit, comparator, threshold, allowed bounds, and aggregation policy. Runtime applies the threshold. Candidate and model cannot choose or reinterpret it.

Qualitative Checks produce structured status, evidence refs, findings, feedback, optional `issueClass`, and repair target.

```text
measurement = observation
status      = interpretation under exact resolved policy
```

Operational failure never fabricates a failing measurement or score zero.

## Resolved Exit Policy

Runtime resolves one immutable candidate-specific policy from:

- protected Default Checks;
- Loop baseline;
- accepted Change traits, risk, and affected layers;
- project traits and technologies/paths;
- Runtime-derived minimums from canonical Planning evidence;
- actual candidate effects;
- applicable active Custom Checks from protected project configuration;
- protected-base Custom Check configuration and Check Type identities;
- model route/configuration and Check catalog/Loop Protocol identities.

Every active Check records `activatedBy`, rule refs, version, parameters, threshold, enforcement, and dependencies. Active Custom Checks cannot be excluded per Candidate; maintainers change their lifecycle only through guarded protected configuration. Selection is deterministic and explainable. Learned or neural activation is forbidden.

Default Checks cannot be disabled. Custom Checks use:

```text
draft → active → disabled
```

Every applicable active Custom Check is required; `fail` or `indeterminate` blocks exit and feeds bounded repair or Evidence-gap guidance. A Candidate changing User Standard or Custom Check configuration is evaluated under the protected-base policy snapshot and cannot weaken its own assurance. Accepted policy changes activate only from the next protected config snapshot. Actual candidate growth may add required Checks. It cannot silently lower risk or remove Planning minimums.

An exact active Custom Code Check may also resolve a CodeWiki-owned preflight, meter, or cancellation guard when its deterministic template requires enforcement before Loop exit. Guard identity, parameters, executor capability, telemetry, and final Result bind the same Check definition and policy snapshot. Missing enforcement or measurement capability cannot fall back to model judgment.

## Identity chain

### Check identity

Binds Loop, Check id/version, requirement/content digest, execution kind, implementation/protocol identity, measurement schema, and evidence contract. Reusing an id under a different Loop or definition creates a different identity.

### Check Result identity

Binds exact candidate, resolved Check binding, implementation/model/configuration identity, evidence digests, measurement, runtime threshold, findings/status, and trial/aggregation identity where relevant.

### Exit Report identity

Binds exact candidate, Resolved Exit Policy digest, complete Result set, deterministic reduction version, and aggregate status.

Validated constructors reject wrong candidate or Check version, missing required Result, duplicate Result, wrong measurement shape, invalid threshold/bounds, contradictory status, stale policy, and fabricated authority.

## Exit status and runtime route

Check Result status and Exit Report status are:

```text
pass | fail | indeterminate
```

Reduction is deterministic:

```text
required fail exists          → fail
else required indeterminate   → indeterminate
else                           → pass
```

`observe` and `warn` Results remain visible but do not block exit. A passing Exit Report permits semantic Loop exit only for that exact candidate. It does not authorize append under stale generation, a new Integration attempt, merge, push, publication, release, deployment, or any external effect.

Runtime revalidates candidate freshness, generation, authority, and CAS, then chooses a separate route:

- repair in same Loop;
- advance to downstream work;
- route to Planning or Decision;
- retry or wait on runtime/provider state;
- block for authority, supervision, budget, or explicit unknown.

A host/runtime failure is not fabricated as a candidate failure. It is operational evidence and normally routes to retry, wait, or block.

## Execution and scheduling

```text
immutable candidate
→ minimal admission
→ resolve Exit Policy
→ build shared facts once
→ bounded Code/Model Check fan-out
→ stream Check Results
→ required-result fan-in
→ immutable Exit Report
→ runtime route
→ final freshness/CAS guard
→ append or block
```

Rules:

- independent Checks continue after unrelated failure;
- work is skipped only for invalid/stale input, real dependency absence, cancellation, or budget policy;
- provider/model, CPU, test/build, and external-service work use separate bounded pools;
- cancellation signals reach underlying work;
- cache reuse requires exact candidate, Check binding, implementation/configuration, and evidence identity;
- executors that depend on external Runtime state not represented by that identity must disable generic Result caching and revalidate exact persisted Evidence instead;
- TTL controls eviction only;
- path overlap may invalidate evidence but never authorize reuse;
- historical projections read persisted policy/Report identity, never today's catalog.

Cheap admission rejects malformed candidate/authority contracts before expensive work. It cannot decide semantic exit.

## Workbench and tool evidence

Pi-Lens, LSP, compilers, linters, test runners, browser tools, AST tools, formatters, security scanners, workers, and Skills are ordinary Workbench and repair capabilities. Their output is evidence material, not automatically an Evidence Record or authoritative Check input.

A trusted Code Check may run or normalize an approved tool under its exact implementation/configuration contract. Tool success never substitutes for planned acceptance coverage, exact candidate identity, or semantic Checks.

Current legacy review-pack configuration and Pi hooks remain executable drift. The clean Implementation cut decides which trusted adapters survive inside Code Checks and deletes CodeWiki-owned review machinery that does not meet the new contract. Pi-Lens remains optional and non-authoritative in v1.

The source checkout does not load or dogfood its own extension during stabilization. Packed candidates exercise runtime behavior only in disposable external projects.

## Knowledge, source, and ownership

Decision owns accepted Knowledge meaning; no Knowledge Loop exists. Planning consumes exact approved Knowledge/Change revisions. Implementation realizes them or routes ambiguity back.

OKF source ownership maps stable system responsibilities/interfaces to source and tests. Fine-grained symbol relationships remain derived. Changed code/docs/tests must fit accepted Planning and ownership boundaries or produce explicit route-back.

Knowledge may intentionally lead source only when an exact active Change accounts for the transition. Incomplete brownfield coverage remains explicit `unknown`; it never becomes proof of alignment.

## Worker-owned execution evidence

Planning assigns stable acceptance-requirement ids to worker-ready Work Items. Workers may perform local test-first repair and report:

```text
approved Change
→ Sprint/Work Item
→ acceptance requirement
→ pre-change failing evidence when required
→ post-change passing evidence
→ changed paths
→ local content proof
```

Runtime accepts a Worker Report only when worker, Assignment, Work Item Claim, Work Item, Planning revision, base, and freshness match. It then combines accepted output in the guarded Integration workspace, materializes exact `integration_proof` Evidence, and constructs the integrated Candidate. Local worker success cannot exit Implementation; aggregate integrated-tree Checks remain required.

## Change operation write and recovery

One canonical JSONL line represents one immutable typed content-addressed operation. It is not full chat, private reasoning, raw tool output, Worker Workbench state, media bytes, or an artifact dump.

Accepted operations retain compact Candidate identity, parent/repair lineage, policy and Check identities, Results, Exit Report, Runtime Route, canonical refs, Git/delivery evidence, and outcome observations. Large/private bytes remain in their owning boundaries.

Hot operations become shared truth only through one exact `codewiki/state` state commit. A stale expected-head push requires fetch, deterministic replay, and semantic reevaluation. Recovery/resume inspection must answer:

1. What exact candidate was last attempted in each Loop?
2. Which upstream outputs passed and were accepted?
3. Which required Checks failed or became indeterminate?
4. Which route/authority owns remediation?
5. Which candidate repaired which earlier candidate?
6. Which Knowledge/source/test/Git/delivery refs prove current state?
7. What is the next safe action?

Change Trace replay rebuilds semantic project state and Alignment Graph facts, not private agent cognition or exact model/tool execution. Full replay and incremental projection must be equivalent.

## Learning boundary

A failed or indeterminate Result plus a later candidate and outcome can derive a Repair Episode. Similar Episodes can derive a Repair Pattern. These are analytical projections, not canonical entities or another Loop.

Candidate producers may receive bounded applicable successful and harmful repair evidence. Model Checks receive only pinned candidate evidence. Learning cannot suppress Checks, lower thresholds, alter activation, change authority, or promote itself. Stable guidance enters Knowledge/configuration/source only through an accountable Change.

## Current executable compatibility

Current executable source represents protected declarations as immutable `kernel` packs in `enforce` mode. In that legacy vocabulary, Project Standards progress through `observe`, `warn`, and approved `enforce`; current compatibility never permits project-owned kernel overrides or arbitrary JavaScript or shell evaluators. These are descriptions of source awaiting clean cuts, not target public vocabulary or permission for third-party executable Checks.

Fast edit feedback is never enough for Implementation exit. Pi-tool autoload uses only package/host configuration in disposable external projects; this source checkout loads Pi-Lens only and never loads CodeWiki itself.

**Review pack recipes (current executable drift):** `requiredPacks` may require a configured legacy evidence sensor to run, but pack success cannot attest semantic acceptance. Clean Implementation/config cuts replace these recipes with trusted Code Check bindings.

## Target source boundary

```text
src/
  semantic-loop.ts
  evidence/
    contracts.ts
    identity.ts
    materialize.ts
  loop-exit/
    contracts.ts
    suite.ts
    identity.ts
    catalog.ts
    custom-checks/**
    resolve-policy.ts
    runner.ts
    cache.ts
    results.ts
  decision/exit/**
  planning/exit/**
  implementation/exit/**
  runtime/loop-exit-runtime.ts
```

Shared `src/evidence/**` and `src/loop-exit/**` cannot import Loop implementations. Loop exit consumes Evidence contracts one way. Runtime composes Evidence materialization and one immutable `LoopExitSuite`. Clean cuts retain no old-path re-exports.

The production-unwired native contracts, Catalog, resolver, shared canonical JSON/digests, strict role-specific Candidate admission, Runtime-owned Candidate/Check identity, immutable Result/Report constructors, bounded runner/cache, and frozen `LoopExitSuite` occupy the target package/runtime boundaries without old-path exports. Loop-owned `exit/**` declarations bind exact Loop identity while the closed Catalog carries Check definitions. `src/runtime/loop-exit-runtime.ts` now composes a Runtime-owned exact Result cache and bounded runner: Code and Model Checks use separate pools, dependencies remain explicit, timeout/cancellation and malformed execution become indeterminate, every active Result fans into one immutable Report, and typed repair/retry guidance grants no Runtime Route authority. Production Loop composition and canonical operation transport remain pending. Current production `src/loops/**` graph/judge/evaluator machinery remains executable drift until those clean cuts replace it in the ratified order.

## Token-efficiency rule

Do not add Loops to compensate for weak candidates or Checks. Use exact refs, compact outputs, shared extracted facts, scoped query results, exact caches, coherent model envelopes, cancellation, and high-signal repair guidance. Optimize time to first useful feedback and time to authoritative exit without weakening false-pass or escaped-regression rates.

## Related docs

- [WorkState](work-state.md)
- [CodeWiki OS and Loop Protocols](codewiki-os.md)
- [Loop Exit](loop-exit.md)
- [User Standards and Custom Checks](./custom-checks.md)
- [Evidence Records](evidence.md)
- [Worker Workbench](worker-workbench.md)
- [Model Routing](model-routing.md)
- [Loop Model](loop-model.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Knowledge](knowledge.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
