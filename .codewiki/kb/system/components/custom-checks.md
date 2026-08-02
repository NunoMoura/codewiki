---
type: Concept
title: User Standards and Custom Checks
description: "Users provide source-backed Standards that CodeWiki distills into bounded Custom Checks while Runtime preserves exact provenance, lifecycle, evaluation, evidence, guards, and exit authority."
tags:
  - codewiki
  - system
  - checks
  - policy
  - dashboard
timestamp: 2026-07-31T00:00:00Z
codewiki_component: custom_checks
codewiki_components:
  - custom_checks
codewiki_source_patterns:
  - src/loop-exit/custom-checks/**
codewiki_test_patterns:
  - tests/loop-exit/custom-checks.test.mjs
  - tests/loop-exit/custom-checks/**
codewiki_role: custom_check_policy
codewiki_source_map:
  - id: custom_checks
    source_patterns:
      - src/loop-exit/custom-checks/**
    test_patterns:
      - tests/loop-exit/custom-checks.test.mjs
      - tests/loop-exit/custom-checks/**
    role: custom_check_policy
---
# User Standards and Custom Checks

Users provide Standards as bounded text or exact source bindings to project, company, Product, System, Design, security, compatibility, resource, and delivery expectations. CodeWiki distills accepted Standards into atomic Custom Checks instead of asking users to author evaluator machinery. Directly entered requirement text is an inline User Standard, not a separate manual-Check path.

A User Standard is source material and grants no Check Result or authority by itself. A Custom Check is the executable requirement derived from one or more exact accepted User Standard snapshots. “Custom” never means arbitrary executable code, a custom system prompt, caller-owned acceptance logic, or direct authority.

Company policy, execution guidance, quality criteria, and resource instructions describe User Standard content; they are not separate canonical artifact types. Public assurance vocabulary uses User Standard, Default Check, Custom Check, Code Check, and Model Check. Internal Resolved Exit Policy, Runtime execution policy, resource guards, Evidence obligations, and triage projection policy remain distinct implementation contracts.

## Vocabulary

Five contracts remain distinct:

| Contract | Meaning |
| --- | --- |
| User Standard | Project-accepted source-backed user expectation from bounded text or an exact source snapshot. |
| Check Type | Closed, versioned CodeWiki-owned semantic family and evaluation contract. |
| Default Check | CodeWiki-provided atomic requirement. |
| Custom Check | One atomic requirement distilled from accepted User Standards under one Check Type. |
| Check Result | Runtime-owned `pass | fail | indeterminate` result for one exact Check. |

Default versus Custom describes requirement origin. Code Check versus Model Check describes evaluation. Check Type describes semantic family. Loop applicability remains `decision | planning | implementation`. Every applicable active Custom Check is required.

```text
origin:       default | custom
execution:    code | model
type:         intent | security | design | API | policy | ...
loop:         decision | planning | implementation
lifecycle:    draft | active | disabled
```

Custom Model Checks use a CodeWiki-owned type-specific Check Evaluator. Custom Code Checks may only instantiate approved deterministic templates or adapters with structured parameters. Projects and distillation models cannot paste or generate JavaScript, shell, commands, arbitrary regex engines, tool definitions, prompts, response schemas, dependencies, or verdict logic. If no approved deterministic template can measure a clause, Runtime proposes a Custom Model Check or reports the clause unsupported; it never fabricates deterministic enforcement.

## Check Types

Check Types are CodeWiki-owned, closed, versioned contracts. A Check Type defines:

- eligible semantic Loops;
- deterministic activation and applicability inputs;
- prerequisite Code Checks and required Evidence profiles;
- Model Check protocol and structured response schema;
- allowed model capability/route class;
- resource and response bounds;
- repair-output shape;
- whether deterministic template-backed customization is supported.

Initial Check Type families are:

```text
intent_and_product
research_and_claims
architecture_and_api
security_and_privacy
accessibility
design_system
library_compatibility
implementation_quality
delivery_and_release
organization_policy
```

Dashboard labels may use domain names such as Security, Design, API, and Company policy, but these remain source descriptions or Check Types rather than additional artifact classes. Stable stored ids remain versioned. Adding or changing a Check Type or deterministic template requires a CodeWiki source release and calibration; project users cannot mint an evaluator protocol.

## Standard distillation and Check proposal

Dashboard, CLI, and bounded clients submit a User Standard proposal as bounded inline text or a source reference selected by the user. Runtime owns source retrieval, sanitation, exact snapshot/content identity, freshness, credential isolation, and privacy handling. A model never receives source credentials or unrestricted connector tools.

Distillation produces a bounded review bundle containing:

- exact User Standard and source snapshot bindings;
- atomic clause and passage refs;
- whether an existing Default Check already covers each clause;
- proposed Custom Model or approved-template Custom Code Checks;
- closed Loop, Change-kind, affected-layer, and path applicability;
- optional repair guidance and bounded Knowledge refs;
- unsupported, ambiguous, contradictory, stale, or excluded clauses;
- any deterministic triage or Runtime behavior implied by clauses that are not pass/fail requirements.

Every generated Check remains a narrow proposal. Distillation cannot activate a Standard or Check, choose authority, assign a Result, or mutate protected configuration. The distillation session shares no conversation with later Check Evaluators. Protected review must show the exact source passage and explain why each clause maps to a Default Check, Custom Check, deterministic Runtime behavior, or unresolved item.

The Check Type constrains which applicability and evaluator templates are legal. Applicability is a closed structured filter, not an arbitrary query language. Runtime derives stable User Standard and Custom Check identities, source and semantic digests, lifecycle/config identity, activation, policy digest, and evaluator configuration.

One accepted User Standard may yield several atomic Custom Checks across the three Loops. Every Custom Check binds its exact accepted Standard snapshots and passages. Renaming or editing a requirement, repair guidance, applicability, Standard bindings, or Knowledge refs preserves stable Custom Check lineage but creates a new `definitionDigest`, invalidating dependent policy, cache, Assessment, Result, guard, and Exit Report identities. Check Type cannot change within one Custom Check lineage; selecting another type creates a new draft Check. Lifecycle-only changes preserve `definitionDigest` but change protected configuration and Check Catalog digests. Git history orders accepted definitions and source snapshots; no integer revision exists.

## Text contract and bounds

Custom text is normalized declarative policy data. It is never concatenated as a trusted system prompt and cannot override the Check Evaluator protocol, tools, response schema, Evidence boundary, route, authority, or verdict mapping.

Initial limits are:

```text
Standard name                    80 Unicode code points
normalized source content    32,768 Unicode code points
passages per Standard             32
passage text                   2,000 Unicode code points
stored User Standards             64 per project
canonical User Standard       65,536 UTF-8 bytes
Check name                        80 Unicode code points
requirement                    2,000 Unicode code points
optional repair guidance       1,000 Unicode code points
Standard refs                      8
passage refs per Standard ref      8
Knowledge refs                     8
stored current Custom Checks      64 per project
active Custom Checks               16 per Check Type
canonical Custom Check         16,384 UTF-8 bytes
```

Runtime normalizes Unicode to NFC and line endings to LF, rejects prohibited controls, credential-like private data, unsupported fields, non-HTTPS URL sources, URI credentials/fragments, and tampered source/passage/definition digests, and applies both code-point and UTF-8 byte limits. Every accepted passage must occur exactly in normalized source content. Line breaks are allowed; Markdown, template, mention, URL, and instruction-like syntax has no special execution meaning.

Long or private Standard bytes remain in accepted Knowledge or an authorized external source. Canonical policy retains bounded source metadata, exact content digests, passage refs, and permitted excerpts. A Custom Check states one concise atomic requirement and cites bounded exact Standard/Knowledge refs rather than copying an entire handbook into model context.

## User-controlled and Runtime-owned fields

Maintainers may propose:

- bounded inline Standard text or an exact source binding;
- source purpose and intended scope;
- corrections to proposed clause boundaries;
- bounded name, requirement, and optional repair guidance;
- closed applicability filters;
- bounded Knowledge refs.

Guarded Runtime commands control accepted Standard snapshots, Check `draft | active | disabled` lifecycle, and authorized type-level route bindings from configured Pi routes. User text cannot choose Check Result, authority, arbitrary execution, or whether an active Check blocks exit.

Runtime and CodeWiki-owned Check Types retain:

- source retrieval, sanitation, snapshot identity, freshness, and credential handling;
- execution kind, approved Code template or Check Evaluator protocol;
- system instructions, tools, and output schema;
- Evidence obligations and deterministic dependencies;
- timeout, token, cost, concurrency, response, compute, and storage ceilings;
- stable identity, source/definition/config/policy digests, protocol versions, timestamps, and freshness;
- canonical risk, severity, priority, status, and authority;
- Assessment validation and `pass | fail | indeterminate` derivation;
- final policy reduction, Exit Report, Runtime Route, append, and effects.

Custom Checks cannot disable protected Default Checks, weaken Planning-derived minimums, suppress contradictory Evidence, or override deterministic Code Check Results.

## Persistence and lifecycle

Accepted User Standard snapshots and Custom Check configuration are project truth in protected Git-backed `.codewiki/config.json`, bound into Team WorkState, triage policy where applicable, Runtime execution policy where applicable, and Resolved Exit Policy digests. Large/private source bytes remain external and content-addressed. No dashboard database, mutable Standard/Check registry, model memory, or provider object becomes canonical.

Lifecycle is explicit:

```text
draft → active → disabled
```

A draft can be edited and previewed but does not enter authoritative Resolved Exit Policy. Every applicable active Custom Check is required: `fail` or `indeterminate` blocks Loop exit. Disabled definitions remain historical project policy but do not execute. No advisory active mode, enforcement-stage progression, rollout history, approval field, or integer revision exists.

Creating a distilled Standard bundle and creating, editing, activating, or disabling a Standard-backed Check require authenticated guarded project authority bound to the exact expected current config digest, protected config digest, and protected source head. Runtime serializes commands, rejects stale compare-and-swap attempts, verifies an authentication Evidence binding, asks the configured authority verifier to authorize the exact before/after mutation, and emits a content-addressed receipt. Authorization belongs to that receipt and accepted Git history rather than to mutable fields inside the Custom Check definition.

Dashboard changes use Project Runtime commands with an idempotency key, bounded proposal, authenticated actor, generated semantic before/after binding, validation, and receipt. Browser code never writes repository files directly. The project-config adapter acquires an exclusive local mutation lock, re-reads the complete config under that lock, atomically writes `.codewiki/config.json`, and verifies the resulting semantic config digest. CLI/API automation uses the same command contract.

A Candidate that changes Custom Check configuration is evaluated under the exact protected-base policy snapshot loaded from a full Git commit id, not from the mutable working-tree file. It cannot disable, remove, or rewrite the Checks evaluating itself. Accepted policy changes become authoritative only from the next protected config snapshot after required policy-change review and authority. Mutation receipts therefore state `effectiveFrom: next_protected_snapshot`. Editing an active definition preserves active lifecycle in the newly accepted snapshot while changing `definitionDigest`; an unaccepted working-tree edit cannot replace the protected active definition. Rollback restores an earlier exact Git/config identity rather than mutating history.

Policy acceptance keeps review and authority separate. `codewiki.custom-check-policy-review@3.0.0` binds one `pass | fail | indeterminate` review receipt to the exact mutation receipt, complete distillation receipt where applicable, selected proposal ids, Standard and definition transitions, protected source/config base, complete proposed config digest, authenticated reviewer, Evidence ids, and review time. Review `pass` is required but cannot authorize Git or activate draft Checks. `codewiki.custom-check-policy-acceptance@3.0.0` separately binds repository identity, configured remote/protected ref, exact reviewed proposal, authenticated acceptance authority, and Runtime authorization digest.

Runtime builds one deterministic child commit from the expected protected head through a temporary Git index. It replaces only `.codewiki/config.json`, rejects any other tree delta, and records mutation, review, acceptance-intent, and config identities in the commit message without trusting commit metadata as semantic authority. The configured safe remote receives that exact commit through expected-head `--force-with-lease`; Runtime then re-observes the ref and exact protected config. Stale heads, failed or unauthenticated reviews, denied authority, working-config drift, unsafe remotes, ambiguous Git state, branch-protection rejection, and mismatched accepted bytes fail closed. Exact repeated acceptance is idempotent; changed remote state requires refresh and a new review rather than blind rebase/retry. The shared config lock prevents a guarded working-tree mutation from racing the final revalidation and push.

## Activation and policy resolution

Runtime activates Custom Checks deterministically from exact Candidate, Change, WorkState, Knowledge/config, affected-layer, and source/path facts. Check Evaluators never decide activation.

Each active binding records:

- exact Custom Check id and semantic `definitionDigest`;
- exact accepted User Standard/source snapshot and passage bindings;
- exact Custom Check configuration and Check Catalog digests;
- Check Type id/version;
- Candidate and protected config snapshot;
- applicability facts and `activatedBy` reasons;
- exact Knowledge refs and considered Evidence;
- prerequisite Results;
- required enforcement derived by Runtime;
- Check Evaluator protocol and model/configuration identity.

Absence of a Custom Check activation is not evidence that its requirement passed. Unsupported or unresolved applicability fails closed according to policy; a required ambiguous binding becomes `indeterminate` rather than silently disappearing.

## Check Evaluators and deterministic templates

A Check Evaluator is the CodeWiki-owned semantic model capability for one Check Type. Product surfaces may use domain names such as Security Evaluator, Design Evaluator, API Evaluator, or Policy Evaluator. An approved deterministic template is the corresponding CodeWiki-owned implementation option for Custom Code Checks; it exposes only closed structured parameters and exact Evidence requirements.

A Check Evaluator is not a persistent agent, final judge, new Loop, or authority. It receives exact immutable Candidate content, bounded relevant Evidence, declared prerequisite Results, and one or more active Custom Check definitions. It shares no conversational state with Candidate producers, workers, repair sessions, or earlier Evaluator runs.

For every Custom Check, it returns a separate bounded Assessment:

```text
supported   + valid positive basis  → Runtime may derive pass
unsupported + valid finding         → Runtime derives fail
uncertain   or missing basis         → Runtime derives indeterminate
```

Every Assessment echoes its exact Custom Check id and `definitionDigest` plus considered Evidence ids, and carries bounded findings, Evidence gaps, counterevidence, coverage, truncation, limitations, and repair targets. Runtime validates complete one-to-one coverage and materializes separate model-assessment Evidence and Check Result identity for every Custom Check. One passing Custom Check cannot cancel another failure or uncertainty.

## Model route and physical call topology

“Evaluator per Check Type” means one versioned evaluation protocol and route class, not necessarily one provider model, persistent session, or physical request. A type may bind an authorized configured Pi route, but Runtime records exact route/configuration identity and preserves the current calibrated strong-route fallback.

Runtime may physically execute related Custom Checks as:

```text
one isolated call per Custom Check
one call for all active Custom Checks of a Check Type
deterministic bounded batches within a Check Type
```

All strategies preserve one Assessment and one Check Result per Custom Check. Physical batching is an optimization, never semantic aggregation.

Per-Check calls improve focus, failure isolation, retry scope, and cache reuse. Per-type batching may reduce repeated Candidate context, latency, and cost but can increase attention dilution, cross-Check contamination, context pressure, and shared operational failure. High-risk Checks may remain isolated even when ordinary Checks are batched.

CodeWiki must compare these topologies with identical model/provider/version, Candidate/Evidence snapshots, tools, budgets, seeds where supported, and evaluators. Report false passes, escaped critical defects, false failures, `indeterminate` rate, human agreement, repair usefulness, prompt-injection resistance, latency, tokens/cost, retries, and intervention separately. Safety regressions block batching promotion. Until sealed calibration proves otherwise, one focused request per logical Model Check remains the baseline.

## Dashboard experience

Dashboard is the primary User Standard and Custom Check authoring and administration surface:

```text
paste text or select an exact source
→ Runtime snapshots and sanitizes source
→ distill atomic clauses
→ show Default Check coverage, proposed Custom Checks, and unresolved clauses
→ review exact passages, evaluator kind, applicability, Evidence, guards, and cost
→ save protected draft
→ inspect simulated per-Check Assessment and Result
→ authorize exact Standard and generated Check bundle
→ active applicable Checks become required from next protected snapshot
```

Dashboard groups Custom Checks by source Standard and Check Type and shows source freshness, lifecycle, `definitionDigest`, activation scope, evaluator/template, latest exact Results, Evidence gaps, estimated cost, and Git-backed policy-change history. It must distinguish draft distillation and simulation from authoritative Candidate evaluation and must not present model confidence as canonical severity, source authority, priority, or approval.

## Relationship to Skills, Knowledge, triage, and Runtime guards

Skills guide how producers and workers perform work. They cannot independently distill, activate, disable, or pass Checks or change exit policy. Active Custom Checks independently evaluate the exact Candidate and are always required when applicable.

Knowledge and authorized external sources hold durable company, Product, System, and Design meaning. User Standards bind exact snapshots of that meaning; Custom Checks enforce atomic expectations without duplicating the full corpus. If a Standard changes intended Product/System/Design meaning rather than merely enforcing it, the related Knowledge change travels through the same accountable Change and Decision path.

Most normative clauses become Decision Custom Checks. Planning and Implementation Custom Checks verify accepted execution requirements without independently reinterpreting the broad company corpus. If Planning discovers an accepted policy-derived invariant cannot be met, Runtime routes the semantic conflict to Decision rather than allowing Planning to waive it.

A hard resource clause may generate Custom Code Checks for Planning feasibility and Implementation usage. Runtime may derive a preflight/meter/cancellation guard from that exact active Check so a hard token, cost, latency, compute, storage, concurrency, iteration, changed-file, or trace-size limit is enforced before or during work rather than discovered only at exit. Missing required telemetry or enforcement capability blocks the route or yields `indeterminate`; a model cannot attest quantitative usage.

A Standard preference such as “prioritize critical security regressions” influences the deterministic snapshot-bound Backlog Triage Projection rather than producing a passing/failing Check. Lower priority is not failure. The compiled ordering behavior remains protected and digest-bound but is not another user-facing artifact.

## Target source boundary

```text
src/loop-exit/custom-checks/**
tests/loop-exit/custom-checks/**
src/dashboard/**                 # primary authoring projection and guarded commands
src/project/config.ts            # bounded persisted project configuration
src/loop-exit/catalog.ts         # Default and Custom Check integration
src/loop-exit/resolve-policy.ts  # deterministic activation
src/runtime/loop-exit-runtime.ts # scheduling, Assessment validation, Results
```

The clean cut replaces dashboard/public use of the broad `ProjectCheckRegistration` contract with narrow Custom Check proposal and materialized-definition contracts. No `ProjectCheck` alias, compatibility parser, caller-authored executor definition, or dual registration path remains.

## Current executable drift

User Standard schema `1.0.0` now materializes immutable bounded inline or HTTPS source snapshots with exact observed time, normalized content digest, atomic passage ids, stable Standard id/digest, credential/control/URI rejection, canonical byte ceilings, and tamper validation. Project config persists complete `userStandards[]` before `customChecks[]`. Custom Check schema `3.0.0` rejects every source-unbound proposal and requires exact accepted Standard id/digest and passage bindings; Standard changes therefore invalidate Check definition/config identity.

Protected Custom Check configuration schema `2.0.0` binds complete User Standard and Custom Check arrays into one digest and snapshot. Check Catalog `5.0.0` emits active Standard-backed Custom Checks as required project-authority Model Checks with CodeWiki-owned execution, measurement, Evidence obligations, timeout, cost, dependencies, and evaluator identity. Resolved Exit Policy deterministically applies Loop, Change-kind, affected-layer, and path-scope filters and carries exact Standard refs into each binding. Decision Model Check Request Protocol `4.0.0` carries those refs into one independent request.

User Standard Source Retrieval Protocol `1.0.0` (`codewiki.user-standard-source-retrieval`) accepts only bounded inline text or one exact HTTPS URI. Runtime normalizes inline bytes, assigns observed time, and uses a closed credential-isolated retriever adapter for URL content; no credentials enter requests or receipts. Exact request, retriever/configuration, source snapshot, content digest, status, and time produce one tamper-checked receipt. Unavailable, unauthorized, unsupported-media, provider-failed, malformed, and cancelled observations remain explicit without retaining raw provider errors. A missing production URL retriever fails closed rather than granting models live retrieval.

User Standard Distillation Protocol `1.0.0` (`codewiki.user-standard-distillation`) binds one retrieved source receipt, the exact kernel Default Check catalog, all closed Check Types, one configured route, and hard limits. One fresh tool-free Pi session receives only that sanitized request. Runtime accepts exact source excerpts and preserves Default Check coverage, source-bound Custom Model proposals, inert Custom Code template intents and capability needs, non-Check triage preferences, fully specified quantitative Runtime guard proposals, and unresolved unsupported/ambiguous/contradictory/stale/partial/excluded/unavailable/negative/retracted/superseded clauses. Content-addressed receipts and deterministic review bundles bind every clause and generated proposal to the exact Standard passage. Distillation cannot activate policy, assign authority, produce Results, select ordering, install code, or mutate config.

The guarded `codewiki.custom-check-mutation@3.0.0` Runtime command supports strict Standard-backed Check create, update, activate, and disable actions plus `create_distilled_bundle`. Bundle creation accepts one exact completed distillation receipt and an authenticated bounded selection of generated proposal ids, then adds the immutable User Standard and selected draft Custom Checks through one complete-config CAS. Authorization and content-addressed receipts bind the full distillation review bundle, selected ids, exact Standard/definition transitions, current/protected config, and protected source head. A Standard whose clauses map only to Default Checks, triage preferences, guards, or unresolved items may be accepted with zero generated Checks. The project adapter derives the complete canonical project-config digest, serializes cross-process writes with an exclusive lock, verifies persisted output, and can load Custom Check policy from an exact protected Git commit while working-tree changes prepare the next snapshot.

The executable review/acceptance boundary now uses `codewiki.custom-check-policy-review@3.0.0` and `codewiki.custom-check-policy-acceptance@3.0.0`. Review identity includes the complete distillation receipt, every selected proposal id, exact Standard/definition transitions, and proposed complete config. Runtime authenticates the exact mutation and review receipts through separate verifiers, requires review `pass` plus separate authenticated acceptance authority, and rejects any receipt whose before-config digest differs from the exact protected-base config so stacked unreviewed working changes cannot hitchhike into acceptance. It binds repository/protected-ref/config identity, creates a deterministic config-only child commit, uses safe credential-free Git expected-head CAS, re-observes accepted bytes, rejects stale races without retry, and replays an already accepted exact commit. Generated Checks remain `draft`; a working-tree mutation, distillation, or passing review alone grants no protected or activation authority.

Resolved Exit Policy, the shared Loop-exit runtime, and native Decision runtime now accept only a validated `ProtectedCustomCheckConfigSnapshot`; the removed raw `customChecks` input is rejected. Active bindings carry the protected source head, complete project-config digest, Custom Check config digest, protected snapshot digest, Custom Check id, and `definitionDigest`. Decision Model Check Request Protocol `4.0.0` (`codewiki.decision.model-check-request`) carries those exact bindings plus Standard/passage refs, and security/privacy Custom Checks select the existing structured challenge envelope. Focused model calls remain the execution baseline. Failing or indeterminate active Custom Checks block exit and remain available for bounded agent repair feedback.

Standard replacement/redistillation remains pending; accepted source drift cannot silently rewrite existing Standards or Checks. Dashboard/CLI/API source transport and policy-change review UI remain pending, as do a production public-HTTPS retriever, private provider connectors, hosted-provider review publication adapters beyond the provider-neutral Git acceptance boundary, deterministic Custom Code templates/resource guards, Standard-derived triage policy, Check Type route binding, Knowledge-content resolution, type-level batching/sharding, calibration, Planning/Implementation evaluator cuts, and production `wiki_decide` cutover. Generic dashboard config patching intentionally exposes neither User Standards nor Custom Checks as editable settings.

## Related docs

- [Loop Contracts](loop-contracts.md)
- [Loop Exit](loop-exit.md)
- [Model Routing](model-routing.md)
- [Adapters and UI](adapters-and-ui.md)
- [Decision Loop](decision-loop.md)
- [Runtime](runtime.md)
- [Knowledge](knowledge.md)
- [Lab](lab.md)
