---
type: Concept
title: Custom Checks
description: "Custom Checks let a project define bounded semantic requirements under closed CodeWiki-owned Check Types while Runtime preserves exact evaluation, evidence, rollout, and exit authority."
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
codewiki_role: custom_check_policy
codewiki_source_map:
  - id: custom_checks
    source_patterns:
      - src/loop-exit/custom-checks/**
    test_patterns:
      - tests/loop-exit/custom-checks.test.mjs
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

Code Check and Model Check remain execution kinds. Kernel versus Custom describes who defines the requirement; `code | model` describes how it is evaluated; Check Type describes the semantic family; `observe | warn | require` describes enforcement.

```text
origin:       kernel | custom
execution:    code | model
type:         intent | security | design | API | policy | ...
enforcement:  observe | warn | require
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

The Check Type constrains which applicability values are legal. Applicability is a closed structured filter, not an arbitrary query language. Runtime derives stable Custom Check identity, revision, content digest, Check identity, canonical timestamps, activation, effective enforcement, approval binding, policy digest, and model route/configuration.

One accepted Custom Check materializes one atomic Model Check requirement. Renaming or editing requirement, repair guidance, applicability, or Knowledge refs creates a new immutable revision and invalidates dependent policy, cache, Assessment, Result, and Exit Report identities. Historical Results retain the exact earlier revision.

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

Maintainers may configure:

- Check Type;
- bounded name and requirement text;
- optional repair guidance;
- closed applicability filters;
- bounded Knowledge refs;
- draft/active lifecycle;
- requested rollout from `observe` to `warn` to approved `require`;
- an authorized type-level route binding from configured Pi routes.

Runtime and CodeWiki-owned Check Types retain:

- execution kind and Check Evaluator protocol;
- system instructions, tools, and output schema;
- Evidence obligations and deterministic dependencies;
- timeout, token, cost, concurrency, and response ceilings;
- identities, digests, versions, timestamps, and freshness;
- canonical risk, severity, priority, status, and authority;
- Assessment validation and `pass | fail | indeterminate` derivation;
- final policy reduction, Exit Report, Runtime Route, append, and effects.

Custom Checks cannot disable protected kernel Checks, weaken Planning-derived minimums, suppress contradictory Evidence, or override deterministic Code Check Results.

## Persistence and rollout

Accepted Custom Check configuration is project truth in protected Git-backed `.codewiki/config.json`, bound into Team WorkState and Resolved Exit Policy digests. No dashboard database, mutable check registry, model memory, or provider object becomes canonical.

Rollout is monotonic and explicit:

```text
draft
→ observe
→ warn
→ explicitly approved require
→ disabled or superseded through a new authorized revision
```

`observe` and `warn` Results remain visible but do not block Loop exit. `require` blocks on `fail` or `indeterminate` under normal Exit Report reduction. Promotion to `require` needs authenticated project authority and an exact config/Custom Check revision binding. A caller cannot submit rollout history or approval facts.

Dashboard changes use Project Runtime commands with exact current config digest, idempotency key, bounded proposal, authenticated actor, generated diff, validation, and receipt. Browser code never writes repository files directly. CLI/API automation uses the same command contract.

A Candidate that changes Custom Check configuration is evaluated under the protected-base policy snapshot. It cannot disable, relax, or rewrite the Checks evaluating itself. Accepted policy changes become active only from the next protected config snapshot after required policy-change review and authority. Rollback restores an earlier exact Git/config identity rather than mutating history.

## Activation and policy resolution

Runtime activates Custom Checks deterministically from exact Candidate, Change, WorkState, Knowledge/config, affected-layer, and source/path facts. Check Evaluators never decide activation.

Each active binding records:

- exact Custom Check id, revision, and content digest;
- Check Type id/version;
- Candidate and protected config snapshot;
- applicability facts and `activatedBy` reasons;
- exact Knowledge refs and considered Evidence;
- prerequisite Results;
- enforcement and approval binding;
- Check Evaluator protocol and model/configuration identity.

Absence of a Custom Check activation is not evidence that its requirement passed. Unsupported or unresolved applicability fails closed according to policy; a required ambiguous binding becomes `indeterminate` rather than silently disappearing.

## Check Evaluators

A Check Evaluator is the CodeWiki-owned semantic model capability for one Check Type. Product surfaces may use domain names such as Security Evaluator, Design Evaluator, API Evaluator, or Policy Evaluator.

A Check Evaluator is not a persistent agent, final judge, new Loop, or authority. It receives exact immutable Candidate content, bounded relevant Evidence, declared prerequisite Results, and one or more active Custom Check revisions. It shares no conversational state with Candidate producers, workers, repair sessions, or earlier Evaluator runs.

For every Custom Check, it returns a separate bounded Assessment:

```text
supported   + valid positive basis  → Runtime may derive pass
unsupported + valid finding         → Runtime derives fail
uncertain   or missing basis         → Runtime derives indeterminate
```

Every Assessment echoes its exact Custom Check revision and considered Evidence ids and carries bounded findings, Evidence gaps, counterevidence, coverage, truncation, limitations, and repair targets. Runtime validates complete one-to-one coverage and materializes separate model-assessment Evidence and Check Result identity for every Custom Check. One passing Custom Check cannot cancel another failure or uncertainty.

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
→ preview exact activation/evidence needs and estimated cost
→ save draft
→ run in observe against bounded calibration/current Candidates
→ inspect per-Check Assessments and Results
→ promote to warn
→ obtain authenticated approval
→ promote to require
```

Dashboard groups Custom Checks by Check Type and shows revision, rollout, activation scope, route, latest exact Results, Evidence gaps, estimated cost, and policy-change history. It must distinguish configuration preview from authoritative Candidate evaluation and must not present model confidence as canonical severity or approval.

## Relationship to Skills and Knowledge

Skills guide how producers and workers perform work. They cannot independently activate or pass Checks, change enforcement, or block Loop exit. Custom Checks independently evaluate the exact Candidate and can become required through approved policy.

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

Source now cleanly removes `ProjectCheckRegistration` and provides `src/loop-exit/custom-checks/**` contracts for the closed Check Type catalog, bounded proposal materialization, Runtime-owned stable id/revision/content digest, immutable draft/active/disabled lifecycle, observe/warn/approved-require promotion, normalization, limits, and tamper rejection. Project config persists only complete materialized definitions. Check Catalog `2.0.0` emits active Custom Checks only as project-authority Model Checks with CodeWiki-owned execution, measurement, Evidence obligations, timeout, cost, dependencies, and evaluator identity. Resolved Exit Policy deterministically applies loop, Change-kind, affected-layer, and path-scope filters and binds exact Custom Check/type/evaluator/Knowledge metadata.

The shared Loop-exit runtime and native Decision runtime can receive exact Custom Check definitions. Decision Model Check protocol `1.2.0` carries exact Custom Check metadata, and security/privacy Custom Checks select the existing structured challenge envelope. Focused model calls remain the execution baseline.

Production config-to-runtime loading, protected-base policy selection, dedicated guarded Dashboard proposal/promotion commands, Check Type route binding, Knowledge-content resolution, type-level batching/sharding, calibration, Planning/Implementation evaluator cuts, and production `wiki_decide` cutover remain pending. Generic dashboard config patching intentionally does not expose Custom Checks as editable settings.

## Related docs

- [Loop Contracts](loop-contracts.md)
- [Loop Exit](loop-exit.md)
- [Model Routing](model-routing.md)
- [Adapters and UI](adapters-and-ui.md)
- [Decision Loop](decision-loop.md)
- [Runtime](runtime.md)
- [Knowledge](knowledge.md)
- [Lab](lab.md)
