---
type: Concept
title: Loop Exit
description: Each semantic Loop binds one exact Candidate to Evidence Records, a deterministic Resolved Exit Policy, immutable Check Results, one Exit Report, and a separate Runtime Route.
tags:
  - codewiki
  - system
  - loop
  - exit
  - checks
timestamp: 2026-07-30T00:00:00Z
---
# Loop Exit

Loop exit is CodeWiki's common acceptance boundary across Decision, Planning, and Implementation. It replaces ad hoc acceptance logic and the superseded Quality/Standard/Assessment/Gate vocabulary with one compact model:

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

Checking is machinery inside the three semantic Loops. It is not a fourth Loop and does not create a standalone Implementation reviewer.

## Vocabulary

| Contract | Meaning |
| --- | --- |
| Evidence Record | Immutable content-addressed observation with exact subject, producer, provenance, artifact, freshness, authority, coverage, sensitivity, and kind-specific payload. It carries no verdict or route authority. |
| Check | One versioned requirement plus its execution kind, measurement contract, evidence requirements, repair target, limits, and trusted implementation identity. |
| User Standard | Project-accepted source-backed user expectation that grants no Result or authority by itself. |
| Check Type | Closed versioned CodeWiki-owned semantic family defining eligible Loops, prerequisites, Evidence profile, evaluation protocol, response schema, deterministic templates, and route class. |
| Default Check | CodeWiki-provided atomic requirement. |
| Custom Check | One bounded atomic requirement distilled from exact accepted User Standard snapshots under one Check Type. |
| Code Check | Trusted deterministic Check implemented by CodeWiki-owned code. “Code” describes evaluation, not Default/Custom origin or source-code quality. |
| Model Check | One atomic semantic requirement evaluated through a bounded independent model assessment against an exact immutable candidate and evidence snapshot. |
| Check Evaluator | CodeWiki-owned type-specific model capability that returns one separate Assessment per Model Check without gaining Result or exit authority. |
| Assessment | Bounded three-valued (`supported`, `unsupported`, or `uncertain`) model output for one exact Model Check and considered Evidence set. |
| Resolved Exit Policy | Complete immutable candidate-specific selection of active Checks, enforcement, parameters, thresholds, activation reasons, dependencies, exclusions, and execution identities. |
| Check Result | Immutable result of one active Check against one exact candidate. Status is `pass`, `fail`, or `indeterminate`; measurement, evidence, findings, feedback, issue class, and repair target preserve the Check's declared shape. |
| Exit Report | Immutable aggregate binding one candidate and Resolved Exit Policy to the complete required Check Result set and deterministic `pass`, `fail`, or `indeterminate` status. |

Formal Check shape:

```ts
type Check = CodeCheck | ModelCheck;
```

A Check is not the entire Loop policy. One Resolved Exit Policy selects several Checks for one candidate. Each Check produces one Check Result. All required Results fan into one Exit Report.

## Independent dimensions

Requirement origin, CodeWiki/project authority, execution kind, Check Type, and measurement shape remain independent. Resolved policy also carries enforcement, but every applicable active Custom Check is deliberately fixed to `require`:

```text
origin:      default | custom
execution:   code | model
check type:  intent | security | design | API | policy | ...
measurement: qualitative | quantitative
lifecycle:   draft | active | disabled       # Custom Checks
enforcement: observe | warn | require         # resolved policy; active Custom = require
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

Checks bind immutable declarative Evidence obligations rather than generic evidence-adapter names. Each obligation states which exact subjects, kinds, producer classes, observation-authority classes, coverage, freshness, sensitivity, and artifact availability are admissible. A deterministic reducer reports `ready | missing | indeterminate`, consumed and excluded Evidence ids, contradictions, duplicates, and missing count. This resolution controls input readiness only; it cannot grant Check pass or Loop exit. Requirement-specific supporting, contradictory, or neutral classification belongs to the trusted closed Check implementation.

Runtime validates one exact resolution for every Check obligation. A determinate Result requires all resolutions to be `ready`; missing or indeterminate input forces an indeterminate Result. The Result derives canonical `evidenceRecordIds` from every considered observation and an `evidenceInputDigest` from the Check identity, resolution digests, and record identities. These fields are Runtime-owned cache-key inputs, not caller references. Result and Exit Report validation rechecks resolution identity, complete accounting, canonical ordering, derived Evidence identities, and aggregate digests.

## Exit status

Exit Report status is derived, never trusted from a candidate or Check implementation:

```text
required failed Check Result exists        → fail
else required indeterminate Result exists  → indeterminate
else                                        → pass
```

`observe` and `warn` Results remain available for non-Custom resolved policy where explicitly allowed, but do not block exit. Default Checks are required according to CodeWiki's closed policy and cannot be disabled. Custom Checks use only `draft | active | disabled` lifecycle; every applicable active Custom Check is required, so `fail` or `indeterminate` blocks exit. A Candidate changing Custom Check configuration is evaluated under the protected-base policy snapshot and cannot weaken its own assurance.

A passing Exit Report permits semantic Loop exit for that exact candidate. Runtime still owns final route, freshness, elected-generation fencing, compare-and-swap validation, and canonical append. Exit does not authorize a new Integration attempt, branch merge, push, publication, release, deployment, or any external effect.

## Policy resolution

Runtime resolves one policy from typed facts only:

```text
protected Default Checks
+ Loop baseline
+ Change kind, risk, and affected-layer overlays
+ project traits
+ technology and path overlays
+ exact Planning minimums where applicable
+ exact protected-base User Standard and Custom Check configuration
+ explicitly approved additions
- permitted non-Default exclusions
= Resolved Exit Policy
```

Project traits form a typed set, not one project type. Activation rules are sparse, versioned, deterministic, and explainable. Every active Check records `activatedBy` facts and rule refs. Every explicitly considered inactive Check records an allowed exclusion reason. Learned or neural Check activation is forbidden.

Planning freezes the minimum expected Implementation Checks for each Work Item. Fresh source and actual effects may add required Checks, but cannot silently remove that minimum. Any permitted reduction requires exact authority, an allowed non-Default exclusion, and a new policy resolution.

## Exact identity

### Evidence identity

Runtime derives each Evidence Record identity from its schema, kind, exact subject, producer, provenance, artifact digest, observation/freshness boundary, authority/coverage/sensitivity, and typed payload. Evidence observed before a candidate binds an exact Change or Planning revision and is later included in candidate observed-base identity; candidate-derived evidence additionally binds the candidate and source tree. Evidence cannot provide its own canonical id, observation time, authority upgrade, coverage claim, Check status, or route.

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

Project input cannot register arbitrary JavaScript, shell, tool-defined Checks, or executable exit rules. User Standards may generate Custom Model Checks under closed Check Types or Custom Code Checks that instantiate approved deterministic templates/adapters with structured parameters. Closed CodeWiki-owned sensor adapters may execute external scanners, but Runtime fixes their request protocol, source/tree/environment/configuration/advisory identity, bounds, Evidence materialization, and status reduction; adapters cannot author Checks or Results. Any future template/adapter still requires provenance, digest, typed measurement schema, cancellation, sandbox policy, guarded lifecycle and calibration, project authority, and no route/write authority.

## Model Checks

Model Checks use independent bounded Pi sessions. Candidate producer and Model Check never share conversational state, even when they resolve to the same provider/model. Runtime supplies the exact Candidate, Check requirement, declared prerequisite Results, considered Evidence identities, Loop Protocol context, model route, output schema, and limits. The model returns `supported | unsupported | uncertain`; Runtime validates positive basis, findings, Evidence coverage, and limitations before deriving `pass | fail | indeterminate`.

Every Model Check uses the same identity, considered-Evidence, conclusion, findings, and limitations envelope while retaining a Check-specific structured measurement payload where required. Raw chain-of-thought is not retained. Related Model Checks, including Custom Checks under one Check Type, may use one focused call per Check, one type-level call, or deterministic bounded batches. Every topology retains one separate Assessment and Result per Check. Model execution is stochastic; CodeWiki makes the invocation envelope, Evidence binding, enforcement, aggregation, and final report reduction exact. No model performs a final review that can override Code or human-authority Results.

There is no `implementation.review` model slot. Default Model Checks inherit calibrated Loop routes unless a CodeWiki-owned Check declares another approved route. Custom Model Checks use a CodeWiki-owned Check Evaluator for their Check Type; an authorized type-level route binding may select only a configured calibrated Pi route. Custom Code Checks select only an approved deterministic template and compatible Runtime capability.

## Caching and invalidation

Exact cache identity includes:

- candidate and evidence digests;
- resolved policy and Check identity;
- Code/Model Check implementation identity;
- model and safe configuration digest;
- Loop Protocol digest;
- threshold, trial, and aggregation identity.

TTL controls eviction only. Path overlap may support invalidation hints, never authoritative reuse. An executor whose result depends on Runtime state not represented in this exact identity must declare itself non-cacheable; persisted Evidence may still be replayed only after the executor revalidates every external binding. Late Results from stale candidates cannot enter a newer report.

## Evidence, tools, and repair

Evidence Records standardize observations across all three Loops without creating an Evidence Loop, mutable aggregate, central database, or generic arbitrary-record SDK. Compact identity/provenance/payload summaries persist in the owning Change Trace; large or private artifacts remain in source, Git, provider, or content-addressed runtime storage and are cited by digest. Shared evidence has one owning observation record and may be cited by several Changes without transferring acceptance.

Pi-Lens, LSP, compilers, linters, tests, browsers, AST tools, Skills, workers, models, users, and external providers may produce evidence material. Their output does not automatically become an Evidence Record or authoritative Check input. Runtime validates one closed kind-specific payload, correlation, producer, artifact digest, provenance, freshness, coverage, and privacy boundary. CodeWiki-owned Checks then consume exact Evidence Record identities.

Executable `codewiki.verification-capability-matrix@1.0.0` projects every Loop-qualified Default or active Custom Check from exact Check Catalog/config identity. Each immutable row reports execution availability (`native | host_required | capability_required`), current Evidence obligations, trusted-producer/capability gaps, candidate format adapters, and its own digest. Native canonical Evidence admission is distinct from collection. Bounded `codewiki.evidence-adapter.sarif@1.0.0`, `codewiki.evidence-adapter.junit@1.0.0`, `codewiki.evidence-adapter.lcov@1.0.0`, `codewiki.evidence-adapter.cobertura@1.0.0`, and `codewiki.evidence-adapter.provider-check-receipt@1.0.0` now ingest SARIF 2.1, common JUnit XML, LCOV, Cobertura, and authenticated provider Check receipts under exact Runtime-owned bindings; CycloneDX, SPDX, Playwright, axe, Pact, and OpenAPI adapters remain `not_implemented`. Every format has `grantsResult: false`; formats measure or transport Evidence only, while CodeWiki owns applicability, semantic reduction, Result identity, and exit authority.

SARIF ingestion hashes at most 4 MiB of exact bytes, accepts at most 32 exact tool-bound runs, processes at most 8,192 findings, and retains at most 256 compact observations/refs. Raw messages become digests. Only project-relative locations enter Evidence; unsafe URI/absolute locations are excluded and force partial coverage. Tool mismatch, malformed context, unsupported caller authority, and unsafe artifact refs fail closed. Output contains `command_execution` and `source_observation` material plus a canonical receipt, never Runtime subject/time/authority or a Result.

JUnit ingestion requires exact runner/version, source snapshot, test-selection digest, Runtime-owned expected test count, request/invocation/environment/configuration identity, and execution state. Audited XML parsing and syntax validation reject invalid UTF-8, malformed XML, DTD/entity/processing declarations, and nesting above 32 within 4 MiB. At most 256 suites and 8,192 cases are admitted; at most 256 aggregate/non-passing refs enter Evidence. Case identity and failure/error details become digests rather than persisted names, stack traces, or output. Declared/expected count mismatch, unsafe file attributes, truncation, timeout, cancellation, or unavailable execution yields partial or unknown coverage. A completed report containing test failures may still have complete coverage: it proves the run was fully observed, while an independent CodeWiki Check derives the failing Result. Output contains only `command_execution` material and a canonical receipt.

LCOV and Cobertura ingestion require exact source snapshot, coverage-scope digest, up to 255 required project-relative files, tool/version, request/invocation/environment/configuration identity, and execution state. Both accept at most 4 MiB and derive integer line, branch, and function hit counts from detailed measurements rather than trusting percentages. LCOV admits a closed record vocabulary, merges repeated source records, limits each per-file measurement dimension to 262,144 entries, and cross-checks `LF/LH`, `BRF/BRH`, and `FNF/FNH`. Cobertura reuses the no-DTD/entity/processing-instruction XML boundary with 32-level nesting, validates per-line branch ratios and a 4,096-branch ceiling, and cross-checks root line/branch totals. More than 2,048 unique files, unsafe or missing required paths, contradictory declarations, timeout, cancellation, or unavailable collection yields partial or unknown coverage. Function/class names remain digest-only. Output contains only factual aggregate metadata, `command_execution`, `source_observation`, and a canonical receipt. Complete Evidence describes measurement completeness; Runtime-owned Code Checks separately apply accepted coverage thresholds and derive Results.

Provider Check receipt ingestion accepts at most 64 KiB of CodeWiki-owned canonical JSON from a trusted host connector. The receipt repeats and must match exact Runtime bindings for provider instance, repository, source snapshot, Git head, Check identity/configuration, authentication method/principal/credential identity, adapter/version, and retrieval request. Its closed digest-only vocabulary preserves provider Check/payload/output identities, attempt, state, conclusion, timestamps, and annotation count without provider output, names, credentials, or URLs. Canonical parsing rejects whitespace variants and duplicate keys; unsupported authority/Result fields, context drift, malformed timestamps, contradictory lifecycle fields, or an available receipt without successful authenticated retrieval fail closed. Completed success and failure receipts both have complete observation coverage, queued/in-progress receipts are partial, and unavailable receipts are unknown. The emitted `command_execution` describes authenticated receipt retrieval, while provider state and conclusion remain diagnostic facts for an applicable CodeWiki Check. `authorityCeiling: verified` and `grantsResult: false` are executable output truth. This adapter does not produce approval, Integration, delivery, merge, release, or deployment authority. Provider networking, credential isolation, API authentication, and webhook-signature verification remain trusted connector capabilities and are not fabricated by core ingestion.

Decision research uses typed citation Evidence Records plus provenance/freshness Code Checks and independent claim-support Model Checks. Implementation UI review uses candidate-bound screenshot/video capture records, optional independent experience critique, and authenticated approval receipts. A live URL supports inspection but is not durable proof.

Failed and indeterminate Results include concise evidence gaps, `issueClass`, and `repairTarget` where known. Contradictory evidence remains visible; missing, stale, partial, unavailable, or conflicting required evidence yields repair, waiting, or `indeterminate`, never fabricated pass. Candidate producers may receive selected prior Repair Episodes derived from Change Traces. Model Checks remain independent and do not see producer learning context.

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

## Current executable drift

Production Decision, Planning, Implementation, traces, and views still use legacy Quality, graph, judge, profile, pack, and review paths pending their clean Loop cuts. The production-unwired native foundation under `src/loop-exit/**` now uses only Check, Check Result, Resolved Exit Policy, Exit Report, Loop, and `require` contracts; no old contract aliases remain. Check Catalog `6.0.0` owns current Default Check registration and cleanly accepts only complete Runtime-materialized User Standard-backed Custom Check definitions; the removed low-level project-registration path has no alias or dual contract. Active definitions become required project-authority Model or approved-template Code Checks under closed Check Types, while draft/disabled definitions remain config history only. Resolved policy and composed runtimes reject raw Custom Check arrays, accept a validated protected-base snapshot loaded from an exact Git head, apply closed applicability, and bind exact protected source/config plus Custom Check/type/evaluator metadata. Gate objects are gone: required Check Results will reduce directly to `ExitReport.status`. `src/loop-exit/identity.ts` provides strict canonical JSON, lowercase SHA-256 digest validation, deeply frozen canonical values, and Runtime-owned Candidate and Loop-qualified Check identity. Each Check binding now binds exact requirement, execution/protocol, measurement, declarative Evidence obligations, configuration, Loop, and Catalog content. Catalog and policy digests change when any bound content changes; independent same-id definitions are allowed only across disjoint Loops. Loop-owned strict content schemas cover Decision, nested Planning, and nested Implementation admission, while Runtime supplies trusted semantic context. Identity-only declarations live under each Loop's `exit/**` directory, and `src/runtime/loop-exit-runtime.ts` composes them into one frozen `LoopExitSuite` with the closed Catalog. Runtime-owned immutable Check Result and Exit Report constructors now derive exact identity, quantitative threshold outcomes, tri-state status, and deterministic failure-dominant reduction while rejecting caller-owned identity/status and mismatched data. Evidence obligations are normalized into Check and Catalog identity, and the native obligation reducer preserves missing, stale, partial, unavailable, duplicate, sensitive, wrong-subject, and contradictory observations without claiming semantic acceptance. Exact obligation resolutions and all considered Evidence Record ids bind native Check Result and Exit Report identity. The native runner now validates one immutable Candidate/policy pair, resolves every active Check's exact Evidence input, honors Check dependencies, uses separate bounded Code/Model pools, propagates cancellation and timeout, streams immutable Results, and fans every active Result into one immutable Exit Report. Its bounded Runtime-owned cache keys candidate, policy, Check binding, Evidence resolution, dependency Result, executor/configuration, and runner identities; TTL only evicts exact entries, and indeterminate operational outcomes are never cached. Missing Evidence, unavailable execution, cancellation, timeout, thrown executors, and malformed output become explicit indeterminate Results rather than fabricated failures. A declared executor may materialize only its exact Catalog-declared Evidence obligations; the runner validates every produced record and resolution, binds them into the Result, returns them for canonical persistence, and never caches a newly produced outcome without persisted Evidence. Runtime may admit exact precomputed Results from specialized closed protocols—such as Decision research claim support—only when candidate, policy, Check identity, and final Report validation match. A typed next-action summary distinguishes readiness, candidate repair, and retry/wait without granting Runtime Route authority. Decision research activation now includes provenance and independent claim-support Checks for deterministic high-risk, migration, dependency, security/privacy, and accepted security-trait facts. Runtime has a Decision-specific observed citation materializer, closed deterministic provenance executor, and versioned independent claim-support Model Check envelope. The envelope binds exact claims and citation ids, requires a passing provenance dependency, derives aggregate status in Runtime, emits only bounded observed model-assessment Evidence, and maps operational/malformed output to indeterminate. Its isolated Pi SDK transport uses the exact route in a no-tool, no-discovery, in-memory session with bounded bytes, timeout, and cancellation. The native Decision runtime additionally supports isolated one-request-per-Check general Model assessments, exact protected-base User Standard/Custom Check bindings through Decision Model Check Request Protocol `4.0.0`, and exact authenticated approval Evidence. Its Pi SDK transport uses fresh tool-free sessions with bounded timeout/response handling and no project resource discovery. Activated research provenance and claim-support Checks now run through the same dependency-aware Model pool, retain produced assessment Evidence, and replay persisted supported or uncertain conclusions without provider work. External research collection and canonical Decision operation integration remain pending. Planning UI activation now includes `ui_preview_targets_valid`. Release activation is Loop-specific: Decision checks accepted release intent/authority, Planning checks release-plan safety, and Implementation checks exact effect approval. Caller-supplied frozen Planning minima are rejected until Runtime can derive independently verifiable minima from persisted Planning evidence. The native runner and exact in-memory Result cache are composed through `createLoopExitRuntime()`. Production Loop cuts and persistent canonical operation transport remain pending.

Custom Check schema `4.0.0` and Check Catalog `6.0.0` now bind approved Custom Code templates as first-class Code execution. The initial `resource_usage_limit` template accepts only exact metric/scope/maximum parameters, derives one quantitative candidate-bound `resource_usage` obligation, and uses exact capability, template, configuration, environment, and Custom Check definition identity. Runtime installs the closed executor and matching preflight/meter/cancellation guards. Missing capability blocks activation or route admission; unresolved or mismatched Evidence produces `indeterminate`, and an observed value above the accepted maximum fails the exact Check.

Check Catalog `6.0.0` retains protected Decision Code Check `security_scanners_valid`. Deterministic security activation requires it before `security_privacy_reviewed`; high-risk security review without an explicit classified surface still receives a static-analysis baseline. The closed scanner suite selects scanner families from exact security surfaces, validates one strict adapter request and observation per family, binds source snapshot/tree, environment, adapter/configuration, ownership, Knowledge/source refs, and fresh dependency-advisory identity, and materializes separate observed `command_execution` and `source_observation` Evidence. Findings fail the Check and become bounded sanitized `security_scanner` intake material; missing adapters, malformed output, unavailable execution, partial coverage, or stale advisories remain `indeterminate`. Dependency Model Checks receive exact scanner Evidence after scanner completion. Persisted scanner Evidence is reusable only when its producer, request digest, source snapshot/tree, environment, configuration, and advisory bindings match; the scanner executor disables generic Result caching because scan context is external Runtime state.

## Related docs

- [Loop Contracts](loop-contracts.md)
- [Evidence Records](evidence.md)
- [User Standards and Custom Checks](./custom-checks.md)
- [CodeWiki OS and Loop Protocols](codewiki-os.md)
- [Model Routing](model-routing.md)
- [Worker Workbench](worker-workbench.md)
- [Lab](lab.md)
- [Traces](traces.md)
