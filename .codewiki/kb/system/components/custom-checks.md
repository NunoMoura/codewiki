---
type: Concept
title: Custom Checks
description: "Custom Checks let a project define bounded required semantic policy under closed CodeWiki-owned Check Types while Runtime preserves exact lifecycle, evaluation, evidence, and exit authority."
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
# Custom Checks

Custom Checks let maintainers enforce project-specific semantic requirements that a Skill can encourage but cannot independently verify or gate. Examples include company policy, API conventions, design-system rules, accessibility expectations, compatibility promises, and release requirements.

A Custom Check is bound to one repository and remains declarative. “Custom” never means arbitrary executable code, a custom system prompt, or caller-owned acceptance logic.

## Vocabulary

Four contracts remain distinct:

| Contract | Meaning |
| --- | --- |
| Check Type | Closed, versioned CodeWiki-owned semantic family and evaluation contract. |
| Custom Check | One project-authored atomic requirement instantiated under one Check Type. |
| Check Evaluator | CodeWiki-owned type-specific model capability that assesses active Custom Checks against exact Candidate-bound Evidence. |
| Check Result | Runtime-owned `pass | fail | indeterminate` result for one exact Custom Check. |

Code Check and Model Check remain execution kinds. Kernel versus Custom describes who defines the requirement; `code | model` describes how it is evaluated; Check Type describes the semantic family. Every applicable active Custom Check is required.

```text
origin:       kernel | custom
execution:    code | model
type:         intent | security | design | API | policy | ...
lifecycle:    draft | active | disabled
```

V1 text-based Custom Checks execute as Model Checks. Future Custom Code Checks may only instantiate approved deterministic templates or adapters with structured parameters. Projects cannot paste JavaScript, shell, commands, arbitrary regex engines, tool definitions, or executable policy.

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

Dashboard labels may use friendlier names such as Security, Design, API, and Company policy. Stable stored ids remain versioned. Adding or changing a Check Type requires a CodeWiki source release and calibration; project users cannot mint a new evaluator protocol.

## Custom Check proposal

Dashboard, CLI, and bounded clients submit only a narrow proposal:

```ts
interface CustomCheckProposal {
  checkTypeId: string;
  name: string;
  requirement: string;
  repairGuidance?: string;
  appliesWhen: {
    loops?: Array<"decision" | "planning" | "implementation">;
    changeKinds?: string[];
    affectedLayers?: string[];
    pathScopes?: string[];
  };
  knowledgeRefs?: string[];
}
```

The Check Type constrains which applicability values are legal. Applicability is a closed structured filter, not an arbitrary query language. Runtime derives the stable Custom Check id, semantic definition digest, Check identity, lifecycle/config identity, activation, policy digest, and model route/configuration.

One accepted Custom Check materializes one atomic Model Check requirement. Renaming or editing its requirement, repair guidance, applicability, or Knowledge refs preserves the stable Custom Check id but creates a new `definitionDigest`, invalidating dependent policy, cache, Assessment, Result, and Exit Report identities. Check Type cannot change within one Custom Check lineage; selecting another type creates a new draft Check. Lifecycle changes preserve `definitionDigest` but change the protected Custom Check configuration and Check Catalog digests. Git history orders accepted definitions and preserves earlier exact policy; no integer Custom Check revision exists.

## Text contract and bounds

Custom text is normalized declarative policy data. It is never concatenated as a trusted system prompt and cannot override the Check Evaluator protocol, tools, response schema, Evidence boundary, route, authority, or verdict mapping.

Initial limits are:

```text
name                         80 Unicode code points
requirement               2,000 Unicode code points
optional repair guidance  1,000 Unicode code points
Knowledge refs                8
stored current definitions    64 per project
active Custom Checks          16 per Check Type
canonical Custom Check    16,384 UTF-8 bytes
```

Runtime normalizes Unicode to NFC and line endings to LF, rejects prohibited control characters and unsupported fields, and applies both code-point and UTF-8 byte limits. Line breaks are allowed; Markdown, template, mention, URL, and instruction-like syntax has no special execution meaning.

Long company or design policy belongs in accepted Knowledge. A Custom Check should state one concise atomic requirement and cite bounded exact Knowledge refs rather than copying an entire handbook into model context.

## User-controlled and Runtime-owned fields

Maintainers may propose:

- Check Type;
- bounded name and requirement text;
- optional repair guidance;
- closed applicability filters;
- bounded Knowledge refs.

Guarded Runtime commands control `draft | active | disabled` lifecycle and an authorized type-level route binding from configured Pi routes. Proposal text cannot select whether an active Check blocks exit.

Runtime and CodeWiki-owned Check Types retain:

- execution kind and Check Evaluator protocol;
- system instructions, tools, and output schema;
- Evidence obligations and deterministic dependencies;
- timeout, token, cost, concurrency, and response ceilings;
- stable identity, definition/config/policy digests, protocol versions, timestamps, and freshness;
- canonical risk, severity, priority, status, and authority;
- Assessment validation and `pass | fail | indeterminate` derivation;
- final policy reduction, Exit Report, Runtime Route, append, and effects.

Custom Checks cannot disable protected kernel Checks, weaken Planning-derived minimums, suppress contradictory Evidence, or override deterministic Code Check Results.

## Persistence and lifecycle

Accepted Custom Check configuration is project truth in protected Git-backed `.codewiki/config.json`, bound into Team WorkState and Resolved Exit Policy digests. No dashboard database, mutable check registry, model memory, or provider object becomes canonical.

Lifecycle is explicit:

```text
draft → active → disabled
```

A draft can be edited and previewed but does not enter authoritative Resolved Exit Policy. Every applicable active Custom Check is required: `fail` or `indeterminate` blocks Loop exit. Disabled definitions remain historical project policy but do not execute. No advisory active mode, enforcement-stage progression, rollout history, approval field, or integer revision exists.

Creating, editing, activating, and disabling require authenticated guarded project authority bound to the exact expected current config digest, protected config digest, and protected source head. Runtime serializes commands, rejects stale compare-and-swap attempts, verifies an authentication Evidence binding, asks the configured authority verifier to authorize the exact before/after mutation, and emits a content-addressed receipt. Authorization belongs to that receipt and accepted Git history rather than to mutable fields inside the Custom Check definition.

Dashboard changes use Project Runtime commands with an idempotency key, bounded proposal, authenticated actor, generated semantic before/after binding, validation, and receipt. Browser code never writes repository files directly. The project-config adapter acquires an exclusive local mutation lock, re-reads the complete config under that lock, atomically writes `.codewiki/config.json`, and verifies the resulting semantic config digest. CLI/API automation uses the same command contract.

A Candidate that changes Custom Check configuration is evaluated under the exact protected-base policy snapshot loaded from a full Git commit id, not from the mutable working-tree file. It cannot disable, remove, or rewrite the Checks evaluating itself. Accepted policy changes become authoritative only from the next protected config snapshot after required policy-change review and authority. Mutation receipts therefore state `effectiveFrom: next_protected_snapshot`. Editing an active definition preserves active lifecycle in the newly accepted snapshot while changing `definitionDigest`; an unaccepted working-tree edit cannot replace the protected active definition. Rollback restores an earlier exact Git/config identity rather than mutating history.

Policy acceptance keeps review and authority separate. `codewiki.custom-check-policy-review@1.0.0` binds one `pass | fail | indeterminate` review receipt to the exact mutation receipt, protected source/config base, complete proposed config digest, Custom Check config digest, proposed definitions, authenticated reviewer, Evidence ids, and review time. Review `pass` is required but cannot authorize Git. `codewiki.custom-check-policy-acceptance@1.0.0` separately binds repository identity, configured remote/protected ref, exact reviewed proposal, authenticated acceptance authority, and Runtime authorization digest.

Runtime builds one deterministic child commit from the expected protected head through a temporary Git index. It replaces only `.codewiki/config.json`, rejects any other tree delta, and records mutation, review, acceptance-intent, and config identities in the commit message without trusting commit metadata as semantic authority. The configured safe remote receives that exact commit through expected-head `--force-with-lease`; Runtime then re-observes the ref and exact protected config. Stale heads, failed or unauthenticated reviews, denied authority, working-config drift, unsafe remotes, ambiguous Git state, branch-protection rejection, and mismatched accepted bytes fail closed. Exact repeated acceptance is idempotent; changed remote state requires refresh and a new review rather than blind rebase/retry. The shared config lock prevents a guarded working-tree mutation from racing the final revalidation and push.

## Activation and policy resolution

Runtime activates Custom Checks deterministically from exact Candidate, Change, WorkState, Knowledge/config, affected-layer, and source/path facts. Check Evaluators never decide activation.

Each active binding records:

- exact Custom Check id and semantic `definitionDigest`;
- exact Custom Check configuration and Check Catalog digests;
- Check Type id/version;
- Candidate and protected config snapshot;
- applicability facts and `activatedBy` reasons;
- exact Knowledge refs and considered Evidence;
- prerequisite Results;
- required enforcement derived by Runtime;
- Check Evaluator protocol and model/configuration identity.

Absence of a Custom Check activation is not evidence that its requirement passed. Unsupported or unresolved applicability fails closed according to policy; a required ambiguous binding becomes `indeterminate` rather than silently disappearing.

## Check Evaluators

A Check Evaluator is the CodeWiki-owned semantic model capability for one Check Type. Product surfaces may use domain names such as Security Evaluator, Design Evaluator, API Evaluator, or Policy Evaluator.

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

Dashboard is the primary Custom Check authoring and administration surface:

```text
choose Check Type
→ name one atomic requirement
→ add optional applicability and Knowledge refs
→ preview exact activation, Evidence needs, agent feedback, and estimated cost
→ save draft
→ inspect simulated per-Check Assessment and Result
→ authorize activation against exact protected config digest
→ active Check becomes required from next protected snapshot
```

Dashboard groups Custom Checks by Check Type and shows lifecycle, `definitionDigest`, activation scope, route, latest exact Results, Evidence gaps, estimated cost, and Git-backed policy-change history. It must distinguish draft simulation from authoritative Candidate evaluation and must not present model confidence as canonical severity or approval.

## Relationship to Skills and Knowledge

Skills guide how producers and workers perform work. They cannot independently activate, disable, or pass Checks or change exit policy. Active Custom Checks independently evaluate the exact Candidate and are always required when applicable.

Knowledge holds durable company, Product, System, and Design meaning. Custom Checks cite and enforce atomic expectations from that Knowledge without duplicating the full policy corpus. If a Custom Check changes intended Product/System/Design meaning rather than merely enforcing it, the related Knowledge change must travel through the same accountable Change and Decision path.

## Target source boundary

```text
src/loop-exit/custom-checks/**
tests/loop-exit/custom-checks/**
src/dashboard/**                 # primary authoring projection and guarded commands
src/project/config.ts            # bounded persisted project configuration
src/loop-exit/catalog.ts         # kernel Check Type integration
src/loop-exit/resolve-policy.ts  # deterministic activation
src/runtime/loop-exit-runtime.ts # scheduling, Assessment validation, Results
```

The clean cut replaces dashboard/public use of the broad `ProjectCheckRegistration` contract with narrow Custom Check proposal and materialized-definition contracts. No `ProjectCheck` alias, compatibility parser, caller-authored executor definition, or dual registration path remains.

## Current executable drift

Source now cleanly removes `ProjectCheckRegistration` and provides `src/loop-exit/custom-checks/**` contracts for the closed Check Type catalog, bounded proposal materialization, Runtime-owned stable id and semantic `definitionDigest`, draft/active/disabled lifecycle, exact Custom Check configuration digest, normalization, limits, and tamper rejection. Project config persists only complete materialized definitions. Check Catalog `4.0.0` emits active Custom Checks only as required project-authority Model Checks with CodeWiki-owned execution, measurement, Evidence obligations, timeout, cost, dependencies, and evaluator identity. Resolved Exit Policy deterministically applies loop, Change-kind, affected-layer, and path-scope filters and binds exact Custom Check/type/evaluator/Knowledge metadata.

The guarded `codewiki.custom-check-mutation@1.0.0` Runtime command now supports strict create, update, activate, and disable actions with exact current/protected config CAS, authenticated authority verification, bounded idempotency, semantic before/after bindings, and content-addressed receipts. The project adapter derives the complete canonical project-config digest, serializes cross-process writes with an exclusive lock, verifies persisted output, and can load Custom Check policy from an exact protected Git commit while working-tree changes prepare the next snapshot.

The executable review/acceptance boundary now uses `codewiki.custom-check-policy-review@1.0.0` and `codewiki.custom-check-policy-acceptance@1.0.0`. It authenticates the exact mutation and review receipts through Runtime-owned verifiers, requires review `pass` plus separate authenticated acceptance authority, binds repository/protected-ref/config identity, creates a deterministic config-only child commit, uses safe credential-free Git expected-head CAS, re-observes accepted bytes, rejects stale races without retry, and replays an already accepted exact commit. A working-tree mutation alone still grants no protected authority.

Resolved Exit Policy, the shared Loop-exit runtime, and native Decision runtime now accept only a validated `ProtectedCustomCheckConfigSnapshot`; the removed raw `customChecks` input is rejected. Active bindings carry the protected source head, complete project-config digest, Custom Check config digest, protected snapshot digest, Custom Check id, and `definitionDigest`. Decision Model Check Request Protocol `3.0.0` (`codewiki.decision.model-check-request`) carries those exact bindings, and security/privacy Custom Checks select the existing structured challenge envelope. Focused model calls remain the execution baseline. Failing or indeterminate active Custom Checks block exit and remain available for bounded agent repair feedback.

Dashboard/CLI/API command transport and policy-change review UI remain pending, as do hosted-provider review publication adapters beyond the provider-neutral Git acceptance boundary, Check Type route binding, Knowledge-content resolution, type-level batching/sharding, calibration, Planning/Implementation evaluator cuts, and production `wiki_decide` cutover. Generic dashboard config patching intentionally does not expose Custom Checks as editable settings.

## Related docs

- [Loop Contracts](loop-contracts.md)
- [Loop Exit](loop-exit.md)
- [Model Routing](model-routing.md)
- [Adapters and UI](adapters-and-ui.md)
- [Decision Loop](decision-loop.md)
- [Runtime](runtime.md)
- [Knowledge](knowledge.md)
- [Lab](lab.md)
