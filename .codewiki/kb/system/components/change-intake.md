---
type: Concept
title: Change Intake and Backlog Triage
description: Change intake converts bounded findings and suggestions from authenticated users, review providers, workers, regressions, scanners, delivery, outcomes, and Knowledge drift into pending Changes or exact Change feedback; triage is a snapshot-bound projection for Decision attention, not another Loop or priority authority.
tags:
  - codewiki
  - system
  - change
  - intake
  - triage
  - backlog
timestamp: 2026-07-31T00:00:00Z
codewiki_components:
  - change_intake
  - change_triage
codewiki_source_patterns:
  - src/changes/intake/**
  - src/changes/defect-profile.ts
  - src/runtime/change-intake.ts
  - src/runtime/implementation-worker-adapter.ts
  - src/pi/worker-reports.ts
  - src/pi/process-worker-adapter.ts
  - src/changes/triage/**
  - src/dashboard/changes-state.ts
  - src/dashboard/state.ts
  - src/dashboard/assets.ts
codewiki_test_patterns:
  - tests/changes/change-intake.test.mjs
  - tests/changes/change-intake-runtime.test.mjs
  - tests/changes/change-intake-producers.test.mjs
  - tests/changes/defect-profile.test.mjs
  - tests/runtime/process-worker-adapter.test.mjs
  - tests/changes/backlog-triage.test.mjs
  - tests/dashboard/changes-state.test.mjs
  - tests/dashboard/dashboard-state.test.mjs
codewiki_trace_events:
  - trace.opened
  - change.proposed
  - change.revised
  - change.relationship_recorded
  - change.feedback_recorded
codewiki_roles:
  - change_intake_domain
  - backlog_triage_projection
codewiki_source_map:
  - id: change_intake
    source_patterns:
      - src/changes/intake/**
      - src/changes/defect-profile.ts
      - src/runtime/change-intake.ts
      - src/runtime/implementation-worker-adapter.ts
      - src/pi/worker-reports.ts
      - src/pi/process-worker-adapter.ts
    test_patterns:
      - tests/changes/change-intake.test.mjs
      - tests/changes/change-intake-runtime.test.mjs
      - tests/changes/change-intake-producers.test.mjs
      - tests/changes/defect-profile.test.mjs
      - tests/runtime/process-worker-adapter.test.mjs
    trace_events:
      - trace.opened
      - change.proposed
      - change.revised
      - change.relationship_recorded
      - change.feedback_recorded
    role: change_intake_domain
  - id: change_triage
    source_patterns:
      - src/changes/triage/**
      - src/dashboard/changes-state.ts
      - src/dashboard/state.ts
      - src/dashboard/assets.ts
    test_patterns:
      - tests/changes/backlog-triage.test.mjs
      - tests/dashboard/changes-state.test.mjs
      - tests/dashboard/dashboard-state.test.mjs
    role: backlog_triage_projection
---
# Change Intake and Backlog Triage

Change intake is the bounded domain boundary through which a potential discrepancy becomes accountable Change material. Backlog triage is the snapshot-bound projection that helps users choose which pending Change deserves Decision attention next. Neither is a semantic Loop, canonical queue, mutable priority store, or independent authority.

```text
bounded source material
→ authenticate and correlate exact source
→ sanitize and normalize
→ classify claims
→ deduplicate and determine scope
→ pending Change or exact current-Change feedback
→ deterministic WorkState/Alignment Graph replay
→ Backlog Triage Projection
→ authenticated user selection of an exact Change revision
→ Decision attempt
```

## Source placement

Triage belongs under the Change domain:

```text
src/changes/
  intake/
    contracts.ts
    normalize.ts
    deduplicate.ts
    route.ts
  triage/
    contracts.ts
    projection.ts
    estimates.ts
    ordering.ts
    query.ts
```

Do not create `src/triage/**`. A top-level package would imply a project-wide meaning or scheduling authority that triage does not own. Runtime orchestrates admission, persistence, and scheduling under `src/runtime/**`; `src/changes/intake/**` owns pure bounded intake semantics; `src/changes/triage/**` owns derived Change-facing projection and query logic. The clean cut replaced the legacy single-file `src/changes/intake.ts` without preserving an alias or dual path. OKF source ownership names the executable intake and triage artifacts directly.

## Closed intake material

The public boundary is a discriminated union, not an arbitrary issue object or caller-authored operation language:

```ts
type ChangeIntakeMaterial =
  | UserSuggestionMaterial
  | PullRequestFindingMaterial
  | WorkerDiscoveryMaterial
  | RegressionFindingMaterial
  | SecurityScannerFindingMaterial
  | DeliveryObservationMaterial
  | OutcomeFindingMaterial
  | KnowledgeDriftMaterial;
```

Each member has source-specific required bindings and one bounded shared semantic core. Protocol `codewiki.change-intake-material@1.1.0` caps canonical input at 16,384 UTF-8 bytes, normalizes text to NFC and LF, rejects unknown fields, credentials, unsupported controls, malformed exact bindings, and duplicate refs, and exposes only the eight closed source members. A producer may provide observed behavior, desired behavior, affected refs, claimed category/severity/confidence, reproduction material, and source refs. It cannot provide canonical Change, revision, operation, actor, time, authority, priority, risk, route, or Check outcome fields.

Initial sources include:

- authenticated user suggestions and corrections;
- ordinary pull-request reviews, inline comments, and Check annotations from any user-selected human or agent reviewer;
- bounded discoveries outside a worker's accepted Assignment scope;
- exact test, browser, delivery, or historical Change Trace regression observations;
- security, dependency, secret, static-analysis, and configuration scanner findings;
- delivery and outcome observations that reveal escaped regressions or unrealized outcomes;
- accepted Knowledge/source/test drift observations.

Provider-specific reviewer semantics are unnecessary. A provider-level observer correlates ordinary review primitives, actor identity, provider event, repository, pull request, and exact head. CodeWiki does not require one adapter per reviewer agent.

Executable producers now cover every closed source member. Each producer injects only its exact source binding and delegates all semantic normalization to the shared material contract; unsupported authority, priority, risk, route, and identity fields fail rather than being ignored. Delivery and outcome producers can bind validated Evidence Records directly. The Knowledge-drift producer binds exact linter issues and snapshot digests. The closed security scanner suite now converts each bounded normalized scanner finding into `security_scanner` material with exact scanner/run/tree bindings while retaining scanner Evidence and Check authority separately. Pi process Worker Reports may retain at most sixteen normalized discovery proposals; `createWorkerReportDiscoveryMaterials()` requires Runtime to add exact Worker Report, Assignment operation, Work Item Claim operation, and base/result tree bindings before admission.

## Runtime admission

Runtime derives idempotency and canonical identity from exact authenticated source material and the current fresh project snapshot. Under Change Trace Protocol `1.3.0`, accepted `change.proposed` and `change.feedback_recorded` operations carry the complete normalized material as a digest- and schema-validated inline artifact; source, semantic, and request fingerprints support bounded correlation and replay without replacing those exact bytes. Admission performs:

1. schema and size validation;
2. source authentication and exact subject correlation;
3. privacy and sensitivity classification;
4. bounded normalization with raw provider, worker, trace, and tool payloads kept private or external;
5. duplicate, overlap, contradiction, and supersession analysis;
6. current-scope versus independent-scope routing;
7. canonical Change operation construction and expected-head Git admission.

Concurrent intake is idempotent. A stale state-head rejection causes fetch, verified replay, and semantic reevaluation. Runtime never blind-retries a pending Change creation or lets a source-supplied fingerprint replace canonical identity.

## Scope routing

Not every finding creates another Change:

| Finding meaning | Runtime disposition |
| --- | --- |
| Current Candidate violates an accepted requirement | Record exact current-Change feedback and route Implementation repair. |
| Finding changes scope, dependency, sequencing, or Work Item meaning | Route the current Change to Planning. |
| Finding challenges intent, risk, safety, authority, or accepted outcome | Route the current Change to Decision. |
| Finding exposes an independent pre-existing or out-of-scope discrepancy | Propose a new pending Change with `discovered_from`. |
| Finding duplicates or reinforces known work | Bind its provenance to the existing Change without creating a duplicate. |
| Finding is stale, retracted, non-actionable, or policy-excluded | Preserve source observation where required, but create no new Change. |

A resolved provider thread, passing worker confidence, or reviewer approval does not close a Change. Closure requires exact CodeWiki assurance and authority. Retractions and contradictions remain visible rather than deleting earlier observations.

## Defect and security classification

`issue` is an external container, not a Change type. A defect normally uses Change kind `fix`; its semantic type still describes the affected boundary, such as behavior, security, dependency, data, or incident resolution. An optional defect profile records why the Change exists and its observed impact.

Executable protocol `codewiki.change-defect-profile@1.0.0` is optional on an exact Change revision and therefore participates in revision identity. It carries closed category, severity, likelihood, exposure, confidence, reproducibility, regression-status, affected-version/tree/component, behavior, source-location, rule, security-reference, and provenance fields. Profile provenance records `asserted | observed | verified | approved` authority plus exact Evidence and source refs. The profile deliberately has no risk or priority field.

The profile distinguishes:

```text
category
severity
confidence
reproducibility
regression status
affected versions/trees/components
expected and observed behavior
source locations and rule references
security classification when applicable
```

Severity, likelihood, exposure, risk, priority, and confidence are separate:

```text
severity    consequence if present
likelihood  probability, reproducibility, or exploitability
exposure    reachable users, data, systems, and boundaries
risk        policy interpretation of severity, likelihood, and exposure
priority    rolling Planning decision over accepted Changes and current WorkState
confidence  strength of current evidence
```

Unknown severity, likelihood, exposure, confidence, reproducibility, regression status, and revision risk remain `unknown`; Runtime does not convert missing evidence to a low value. Authenticated intake maps source claims to an `asserted` profile while retaining unknown likelihood, exposure, and risk until stronger Evidence and policy resolve them.

Generic findings use a closed CodeWiki category and severity vocabulary. SARIF 2.1 is an import/export format for machine findings, not canonical Change semantics. Security findings may preserve exact CWE identifiers, CVE/GHSA/OSV aliases, CVSS version/vector/score, and CISA Known Exploited Vulnerability references when supplied by qualified evidence. Identifiers and model claims do not prove exploitability or canonical severity.

Sensitive security detail is not copied automatically into shared PR text, dashboard summaries, or canonical operations. Runtime may create a redacted pending security Change with a private external ref, wait for authorized security triage, and activate merge/publication blockers under protected policy.

## Backlog Triage Projection

The Backlog Triage Projection is rebuilt from exact pending/deferred Change revisions, WorkState, Alignment Graph facts, source observations, config/policy, and the current snapshot. It is disposable and cannot mutate Change meaning or Planning priority.

Each projected candidate exposes bounded dimensions with provenance and uncertainty:

- Decision readiness: ready, needs information, suspected duplicate, suspected conflict, or sensitive;
- urgency and risk of inaction;
- expected user/project/security/reliability improvement;
- estimated effort or work scale;
- implementation risk and reversibility;
- affected users, concepts, components, owners, and dependent Changes;
- source corroboration, confidence, freshness, and age;
- exact reasons for inclusion, filtering, and ordering.

Unknown values remain unknown rather than becoming zero. Every estimate identifies the exact supporting Evidence authority (`asserted | observed | verified | approved`) and whether its value is `deterministic_analysis` or `inferred_analysis`. Alignment Graph inputs retain their existing `canonical_binding | observed_binding | deterministic_analysis | inferred_analysis` provenance; triage never rewrites those classes into stronger authority.

Model estimates use ranges or buckets, confidence, assumptions, and exact snapshot binding. They never become silent facts. Historical estimates may be calibrated against observed completed-Change effort and outcomes through derived analysis without creating a first-class Lesson, Memory, or priority record.

Executable protocol `codewiki.backlog-triage-projection@2.0.0` validates exact WorkState, Alignment Graph, and `codewiki.backlog-triage-policy@1.0.0` identities; binds remote/source/Knowledge/config/policy/graph content; and projects at most 500 candidates at one canonical `asOf` timestamp. Each supported dimension carries Evidence authority separately from deterministic or inferred analysis provenance and retains canonical, observed, Evidence, analysis, and assumption refs. Estimate authority above `asserted` must resolve to at least that authority in an exact Evidence node in the bound graph. Missing support produces explicit `unknown`; declared Change risk is not silently reused as urgency, impact, strategic value, implementation risk, or risk of inaction. Exact relationships identify confirmed overlap and active-work blocking, shared affected refs identify only possible overlap, and absence remains unknown. Pareto membership compares only Decision-ready candidates with known expected impact and effort. Fixed freshness bands and bounded age fairness are explicit protocol behavior, not a hidden score.

## Filtering, ordering, and selection

User and agent views consume the same bounded `codewiki.backlog-triage-query@2.0.0` contract. Requests bind the exact projection and compiled triage-policy digests, return at most 100 candidates, report matched/returned/truncated coverage, and carry per-item ordering reasons. Unsupported fields, generic query expressions, priority inputs, stale projection identity, tampered candidate or policy bytes, duplicate filters, and unsafe bounds fail closed. Supported filters include source kind, Decision readiness, affected Knowledge/component, defect category, severity, security sensitivity, regression/incident state, urgency, risk of inaction, effort, expected impact, confidence, overlap, frontier membership, blocked work, freshness, and age.

Supported ordering families include urgency, risk of inaction, impact, effort, Decision readiness, confidence, work unblocked, newest, and oldest. A derived impact/effort view may be offered when dimensions are comparable, but it is not canonical priority.

Default ordering is explainable and lexicographic. Accepted `triage_preference` clauses compile into protected `triagePreferences[]` configuration. Each immutable binding carries the exact distillation receipt and clause, User Standard id and digest, source-content digest, passage id, compiled closed dimensions, and content-derived binding identity. The guarded Standard-bundle mutation, separate policy review, protected Git acceptance, and next-snapshot rule apply to these bindings exactly as they apply to generated Checks.

Runtime, not the distillation model, owns the comparator. Protected safety tiers remain first. Within a tier, active Standard-derived dimensions are compared in one fixed closed order: severity, exposure, regression, urgency, risk of inaction, impact, strategic value, effort, confidence, freshness, and age fairness. All dimensions prefer higher supported values except effort, which prefers lower supported effort. Freshness prefers fresher observations; age fairness prefers older work. Unknown remains behind supported values. Repeated dimensions merge exact source-binding refs rather than adding weight. Kernel urgency/risk/impact/effort/fairness tie-breakers and Change id remain deterministic fallbacks.

A model may only propose exact source-bound dimensions; it cannot emit comparator direction, precedence, final rank, weight, or an opaque score. Protected review accepts or rejects the complete resulting config. The compiled policy binds the exact protected project-config digest and every projection/query digest, emits source-bearing ordering reasons, remains disposable triage behavior, and never becomes a pass/fail Check.

1. confirmed critical security, active incident, data-loss, regulatory, or other protected escalation;
2. escaped regressions and findings blocking active accepted work;
3. Decision-ready candidates on the multi-dimensional Pareto frontier;
4. high-value low-cost clarification opportunities;
5. bounded age-based fairness to prevent starvation;
6. incomplete or speculative intake.

No opaque `overallScore` may hide safety, uncertainty, or effort tradeoffs. The view states why each item appears where it does. `codewiki.decision-attention-selection@1.0.0` lets an authenticated user choose any eligible current pending revision and binds the exact content-addressed Change revision, triage Candidate, native WorkState, triage projection, protected project config, compiled policy, authority Evidence, and idempotency key. Runtime revalidates the complete context after authorization, then creates one deterministic revision-bound Decision job with exact scope-conflict refs. Selection starts one independent Decision attempt; it grants no Decision disposition or Planning priority. Pending Change presence and generic triggers do not select work.

Backlog triage asks which pending Change should receive Decision attention. Decision asks whether that exact intent is acceptable. Rolling Planning decides which accepted Changes execute, in what order, and through which Work Items. These boundaries must not collapse.

## Security assurance feedback

Deterministic and adversarial Checks may produce new intake material. A finding that invalidates the current Candidate remains current-Change repair evidence; an independent vulnerability becomes a linked pending Change; uncertainty remains an evidence gap or `indeterminate`; a duplicate reinforces existing work.

A Model Check finding is asserted analysis, not verified vulnerability fact. Runtime requires deterministic reproduction, qualified source Evidence, authenticated security approval, or another policy-defined basis before granting stronger authority.

## Current clean-cut drift

The closed source-specific material contract and strict normalizer now replace legacy `user | runtime | lab` feedback. Runtime authenticates exact source material through an injected source adapter, validates optional correlation against fresh WorkState, records the complete normalized inline material plus durable request/source/semantic fingerprints, replays exact accepted requests, reinforces open source or semantic matches, routes exact current-scope feedback, creates linked independent Changes, and verifies expected-head Git acceptance without blind retry. Native Worker Reports preserve bounded structured discovery proposals, and Runtime adds exact Assignment, Work Item Claim, and tree bindings before admission. The protected Standard-derived triage policy, snapshot-bound projection, bounded user/agent query, authenticated exact-revision selection protocol, coordinator client transport, and native revision-bound scheduling are executable; current dashboard filtering and ordering remain presentation-local until the final Dashboard phase consumes those contracts. Dashboard/CLI selection controls, native selected-Decision candidate/evaluator execution, and real provider/scanner collection adapters remain incomplete. `wiki_change` no longer accepts the removed feedback shape.

## Related docs

- [Decision Loop](decision-loop.md)
- [Runtime](runtime.md)
- [Worker Workbench](worker-workbench.md)
- [WorkState](work-state.md)
- [Alignment Model](alignment-model.md)
- [API and Client Surface](api-tools.md)
- [Client and Dashboard Architecture](terminal-ui.md)
- [Change Traces](traces.md)
