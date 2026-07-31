---
type: Concept
title: Decision Loop
description: Decision turns persisted intent into one exact Evidence-backed Candidate, Exit Report, and accepted disposition without letting callers control Runtime identity or authority.
tags:
  - codewiki
  - system
  - decision
  - loop
timestamp: 2026-07-30T00:00:00Z
codewiki_component: decision
codewiki_components:
  - decision
codewiki_source_patterns:
  - src/decision/**
  - src/changes/**
codewiki_test_patterns:
  - tests/decision/**
  - tests/changes/**
  - tests/helpers/accepted-change.mjs
  - tests/helpers/canonical-loop-events.mjs
  - tests/helpers/proposed-change.mjs
codewiki_trace_events:
  - decision.candidate_recorded
codewiki_role: semantic_loop
codewiki_source_map:
  - id: decision
    source_patterns:
      - src/decision/**
      - src/changes/**
    test_patterns:
      - tests/decision/**
      - tests/changes/**
      - tests/helpers/accepted-change.mjs
      - tests/helpers/canonical-loop-events.mjs
      - tests/helpers/proposed-change.mjs
    trace_events:
      - decision.candidate_recorded
    role: semantic_loop
---
# Decision Loop

Decision owns the journey from explicitly persisted intent to one exact approved, rejected, deferred, withdrawn, or route-back Change revision. Decision is a process—a semantic Loop and authority boundary—not a domain entity.

```text
persisted intent
→ grounded semantic revision
→ immutable Decision Candidate
→ Evidence Records
→ Resolved Exit Policy
→ Decision Checks
→ Check Results
→ Exit Report
→ Runtime Route
→ authority/freshness/expected-head acceptance
```

The first persisted revision creates one append-only Change Trace. Planning may receive only an exact approved Change revision after Runtime appends the same candidate/Report under final guards. Later attempts append revisions, failed/indeterminate Results, repair lineage, approval, route-back answers, or terminal disposition to the same dossier.

## Authority

Decision owns:

- intent normalization and stable Change/revision semantics;
- current/desired state, rationale, non-goals, and outcome contract;
- Change kind, scope, affected layers, target refs, and risk;
- user, maintainer, compatibility, security/privacy, and delivery impact;
- current-state grounding and evidence sufficiency;
- accepted Product/System/Design Knowledge impact;
- alternatives, invariants, rollback, and negative boundaries;
- active-Change overlap disposition;
- route-back answers from Planning/Implementation;
- exact approval, rejection, deferral, or withdrawal meaning.

Decision does not own Sprints, Work Items, scheduling, Assignment execution, implementation evidence, Integration, or delivery effects.

Runtime owns Change/candidate identity construction, canonical actor/time, authenticated authority validation, Check activation/thresholds, generation/CAS, Exit Report validation, route, and append. Candidate producers cannot supply those fields.

## Change revision

A semantic revision contains enough accepted meaning that Planning need not reconstruct intent from chat:

- intent and observable desired outcome;
- current state and evidence/provenance;
- classification, scope, affected boundaries, and Knowledge delta;
- optional defect profile with category, severity, confidence, reproducibility, regression status, affected refs, and qualified security identifiers;
- success signals and outcome-observation expectations;
- compatibility, safety, privacy, and delivery constraints;
- risks, invariants, alternatives, rollback, and non-goals;
- bounded Planning constraints where needed.

Workflow status, Checks, Planning membership, Assignments, implementation, Git, and delivery facts belong to accepted Change operations and projections, not revision content.

Accepted revisions are immutable. A route-back may create a superseding revision while accountable outcome remains stable. Materially different outcome creates a linked Change.

## Input

Decision input binds:

- exact proposed/persisted revision;
- relevant WorkState and relationship snapshot;
- current trace tail and prior revision refs;
- current Knowledge/source/test/Git/active-work refs;
- exact source-observation and research-citation Evidence Record refs where activated;
- authenticated trigger and authority refs;
- route-back question and originating refs when applicable;
- exact Loop Protocol, model route, and configuration identities.

Runtime loads repository facts. Callers cannot replace current Knowledge, trace, ownership, policy, time, or Git state with submitted snapshots.

## Candidate

A semantic-session producer returns only a strict `DecisionCandidateProposal`: requested disposition and rationale. It cannot repeat or replace Runtime-owned Change, WorkState, Knowledge, authority, time, or append fields. Runtime combines that proposal with the exact persisted Change revision and current WorkState to materialize immutable `DecisionCandidateContent` containing:

- complete normalized semantic revision and Runtime-observed revision-validation binding;
- disposition request (`approve`, `reject`, `defer`, or `withdraw`) and rationale;
- grounded current-state and Knowledge impact refs;
- outcome, risks, alternatives, invariants, constraints, and questions;
- canonical authored Change relationships;
- active overlap facts with explicit relationship accounting;
- concise unresolved fact codes.

Candidate identity binds this content to exact WorkState, Knowledge, source/Git when present, and canonical Change refs. Content does not contain approval receipt, actor identity, approval time, Check activation, Exit Report, or final Runtime route. Runtime materializes identity and authenticated disposition facts around accepted candidate content.

## Loop cycle

```text
load one Change and bounded project facts
→ materialize required source/research Evidence Records
→ interpret under Decision Loop Protocol
→ produce immutable role-specific candidate
→ resolve candidate-specific Decision Exit Policy
→ run independent Code/Model Checks
→ build immutable Exit Report
→ repair candidate or hand Report to Runtime
→ Runtime revalidates authority/freshness/CAS and appends exact disposition
```

Casual conversation remains conversation until explicitly persisted as Change intent.

## Baseline Checks

Final Check definitions are Loop-qualified and versioned. Current legacy IDs remain executable drift only until the clean Decision cut.

| Check intent | Required signal |
| --- | --- |
| Revision readiness | One complete stable semantic revision. |
| Intent preservation | Current state, desired state, rationale, and non-goals are coherent. |
| User/project value | Outcome is concrete and observable where possible. |
| Outcome contract | Success evidence and later observation expectations are bounded. |
| Current-state grounding | Canonical Knowledge/source/test/trace/Git Evidence Records support claims. |
| Research provenance | Activated external claims bind exact source classification, publisher, URI, passage/artifact digest, publication/retrieval facts, limitations, and freshness. |
| Research claim support | Independent evaluation establishes support, contradiction, overstatement, alternatives, and uncertainty. |
| Evidence sufficiency | Typed evidence coverage is proportional to claim and risk. |
| Recommendation justification | Recommendation and alternatives are explicit. |
| Exact approval safety | Runtime-observed authority binds exact candidate/revision. |
| Risk and rollback | Failure modes, invariants, compatibility, rollback, and negative boundaries are proportional. |
| Knowledge impact | Updated Knowledge, explicit no-impact, or grounded defer/route is complete. |
| Change classification | Kind, layers, risk, and target traits are runtime-derivable. |
| Delivery constraints | Constraints do not smuggle Planning design or unsafe bypasses. |
| Active Change overlap | Duplicate, contradictory, overlapping, or superseding work is merged, linked, ordered, superseded, deferred, or blocked. |

Protected kernel Checks cannot be disabled. Custom Checks begin as draft, then progress through `observe`, `warn`, and explicitly approved `require`. Runtime records exact Custom Check revision, protected config snapshot, Check Type, and `activatedBy` facts for every active binding. A Decision Candidate changing Custom Check configuration remains subject to the protected-base policy and cannot weaken its own assurance.

Decision uses the `decision` model route for candidate production. Kernel Model Checks run independently and inherit calibrated Loop routes unless a CodeWiki-owned Check declares otherwise. Custom Checks use the Check Evaluator for their closed Check Type and an authorized calibrated type-level route binding. No caller-selected review slot exists.

## Security classification and challenge assurance

No Decision Check can prove the absence of every vulnerability. Decision prevents unsafe or materially under-specified intent from being approved; Planning owns required security work, isolation, sequencing, and reviewer obligations; Implementation evaluates the exact integrated tree through activated scanners, tests, and falsification-oriented security challenge assurance.

Every Change first receives a cheap deterministic security-surface classification. Activation does not trust only caller-supplied kind or risk. Runtime derives relevant traits from the exact revision, affected Knowledge/components/layers, source ownership, dependency changes, data flows, public interfaces, and observed source scope. Initial security surfaces include authentication/authorization, personal or sensitive data, credentials/secrets, network/public API, dependency/supply chain, parsing/deserialization, command/process execution, filesystem, cryptography, persistence/migration, infrastructure/configuration, and browser trust boundaries.

Where facts permit, Code Checks run before Model Checks and validate bounded requirements or exact observations such as:

- declared trust boundaries, authorization invariants, data classes, retention, rollback, and negative scope;
- dependency advisory/version matches, lockfile integrity, secret scans, SAST/AST rules, unsafe APIs, configuration/IaC scans, and security-focused tests;
- required source ownership, independent reviewer roles, authenticated residual-risk authority, and qualified security Evidence;
- exact scanner/source/tree/configuration identity, freshness, limitations, and contradiction retention.

A deterministic surface detector activates expensive assurance; it does not itself pass security. Unavailable required scanners or stale advisory data produce `indeterminate`, not fabricated safety.

Activated security challenge Model Checks receive one immutable candidate plus bounded candidate-bound Evidence and are instructed to falsify safety rather than confirm the producer. They challenge attacker goals, misuse/abuse cases, trust boundaries, authorization bypasses, privacy minimization/retention, confused-deputy paths, supply-chain assumptions, migration/rollback, and missing controls. Structured output preserves proposed attack paths, violated invariants, candidate and Evidence refs, claimed severity/confidence, Evidence gaps, mitigations, and limitations.

Security challenge output has `asserted` authority. It cannot assign canonical CVSS, verify exploitability, accept residual risk, pass its own Check, or create canonical Change priority. High/critical policy may require independent model routes, deterministic reproduction, qualified research Evidence, authenticated security approval, or explicit residual-risk acceptance. Candidate producer and security challenge Model Checks never share conversational state.

The executable Decision Runtime now derives a content-addressed `codewiki.security-surface-classifier@1.0.0` projection from the exact semantic revision, affected layers, target/Knowledge/source refs, and bounded revision fields. The closed projection distinguishes authentication/authorization, sensitive data/privacy, credentials/secrets, network/public API, dependency/supply chain, parsing/deserialization, command/process execution, filesystem, cryptography, persistence/migration, infrastructure/configuration, and browser trust boundaries. Its coverage explicitly reports Knowledge and source analysis as refs-only; it cannot claim absence outside that coverage. Surface facts bind the policy selector, activation reasons, and `security_privacy_reviewed` parameters. Dependency, public-API, and persistence surfaces activate their targeted Checks, while `security_surface_requirements_complete` must pass before model review.

The Decision Model Check protocol is now `1.1.0`. Every response echoes the exact considered Evidence set and satisfies three-valued basis rules: `supported` requires positive basis, `unsupported` requires a finding, and `uncertain` requires an Evidence gap or limitation. Security challenge responses additionally carry bounded structured threat goals, preconditions, attack paths, violated invariants, candidate/Evidence refs, claimed severity/confidence, mitigations, and limitations. Runtime materializes these as asserted `model_assessment` Evidence, derives the Check Result, and retains deterministic Exit Report authority; no final reviewer-of-reviewers exists.

A finding that invalidates the current Candidate routes to current-Change repair. A genuinely independent vulnerability becomes redacted linked pending Change intake. Uncertain material remains an Evidence gap or `indeterminate`; duplicate findings reinforce existing work. Sensitive exploit detail stays private/external under policy.

## Research evidence

Research supports Decision claims but does not become accepted Knowledge or authority automatically. Deterministic activation may require research for unknown current state, external provider/API dependency, security/privacy or regulatory claims, migration/compatibility risk, unfamiliar technology, or another accepted high-risk trait.

Runtime materializes `research_citation` Evidence Records from bounded source material. Each record binds exact claim, primary/secondary source classification, publisher, URI, captured passage or artifact digest, publication/retrieval facts, support or contradiction, limitations, authority/coverage/sensitivity, and Runtime observation time. A mutable URL alone is not durable proof.

Code Checks validate provenance, freshness, artifact availability, and source independence. Independent Model Checks evaluate whether citations support claims without overstatement, whether contradictions and alternatives are accounted for, and whether coverage is proportional to risk. Required unavailable, stale, partial, or conflicting research is repaired or `indeterminate`, never fabricated support. Authenticated Decision approval remains separate.

The native closed Catalog now registers Decision-only `research_provenance_valid` and `research_claims_supported` Checks. Both activate deterministically for high-risk, migration, dependency, security/privacy, and accepted security-trait facts. Provenance requires fresh complete `research_citation` Evidence bound to the exact Change revision; claim support additionally binds independent candidate-bound `model_assessment` Evidence and depends on valid provenance. Citation contradictions remain available to the Model Check rather than being discarded or converted into readiness failure.

The native Runtime bridge now admits bounded citation material through one Decision-specific function, fixes observation authority to `observed`, requires exactly one Change-revision subject, rejects caller-owned assurance fields, and materializes immutable `research_citation` records. Its closed deterministic provenance executor reduces the exact obligation and creates a canonical passing, failing, or indeterminate Check Result. Stale/missing input remains indeterminate; temporally impossible source metadata fails without discarding the Evidence; contradictory citation stance remains available for the independent claim-support Check.

The versioned `codewiki.decision.research-claims` protocol now prepares one immutable, tool-free request from the exact passing provenance Result, candidate, policy, route configuration, claims, and citation Evidence ids. A model does not report aggregate Check pass/fail. It must assess every exact claim digest once and echo the complete citation-id set. Runtime rejects missing, duplicate, foreign, or malformed claim assessments; derives aggregate `supported | unsupported | uncertain`; materializes only bounded normalized `model_assessment` Evidence; and creates the immutable Check Result. Unsupported dominates uncertainty. Timeout, provider failure, unavailability, cancellation, or malformed output is indeterminate without fabricated measurement or Evidence.

The Pi adapter now executes that prepared protocol in one in-memory session selected by the exact Runtime route. It disables all tools and resource discovery, supplies no producer conversation or repository context, bounds request/response bytes and route timeout, propagates cancellation, parses only strict JSON, and discards transient assistant text after normalization. Missing models, provider failure, timeout, cancellation, and malformed output return typed operational observations for Runtime reduction; they never fabricate model Evidence.

A production-unwired native Decision core now materializes the full Runtime-owned Candidate from persisted Change/WorkState facts, resolves the exact closed Decision policy, and runs trusted Code and independent general Model Check executors through the bounded native runner. The `codewiki.decision.model-check` protocol creates one tool-free, snapshot-bound request per Check, validates an exact bounded response, preserves supported, unsupported, and uncertain conclusions distinctly, and materializes normalized `model_assessment` Evidence. Runtime can also materialize authenticated approval-receipt Evidence for the exact candidate and deterministically resolve Decision obligations from persisted Evidence. Model-produced Evidence and its exact resolution return with the run for canonical persistence; malformed or unavailable execution remains `indeterminate`, and semantic failures remain failure-dominant. The Pi SDK now provides a production `createPiDecisionModelCheckTransport()` backed by a shared isolated JSON-session runtime: each Check receives a fresh tool-free session, exact model route, bounded timeout/response, no extension or skill discovery, no retries or compaction, redacted operational failures, and guaranteed cleanup. Native high-risk Decision execution now schedules provenance and claim-support Checks in the same dependency-aware bounded runner, drives the existing closed Pi claim-support transport, returns its normalized model Evidence for persistence, and replays supported or uncertain Evidence without another provider call or Report drift. After exact Report reduction, Runtime now derives one immutable route binding: passing approval proceeds to Planning, passing defer waits, passing rejection completes without realization, passing withdrawal routes to withdrawn, failed assurance routes to repair, and indeterminate assurance waits. Route identity binds Candidate digest, Exit Report digest, requested disposition, route, and reason; it grants no effect before canonical admission. A native operation builder now converts one exact in-memory Decision run into the ordered append-only chain: attempt start, Candidate, policy, every Evidence Record, every Check Result, Exit Report, Runtime Route, and attempt end. It verifies active current revision and WorkState, full artifact-owned identities, shared Candidate/policy/Report/Route identity, every Evidence Record, Result Evidence availability, derives Runtime-owned timestamps, and replays every operation while building the parent chain.

Candidate, policy, Evidence, Result, Report, and Route bytes now live inside bounded content-digested inline envelopes in their canonical operations. No `state:objects/*` placeholder or generic object store remains. Operation parsing rejects unknown envelope fields, stale content digests, malformed semantic identities, and artifacts larger than 262,144 canonical UTF-8 bytes; large/private media and provider bytes remain external Evidence refs.

`commitNativeDecisionOperationSequence()` now synchronizes the exact team snapshot, rejects stale team/WorkState bindings, derives the operation base from the verified remote/source/Knowledge/config/policy snapshot, admits the entire Decision chain through one expected-head Git state batch, refuses blind stale retry, resynchronizes, and verifies every accepted operation identity. External research collection, production `runWikiDecide()` wiring, and legacy count-path deletion remain part of the clean Decision cut.

## Exit and route

Exit Report status is `pass | fail | indeterminate`.

- `pass` means the exact candidate may leave Decision if Runtime authority/freshness/CAS guards also pass.
- `fail` means candidate semantics or required evidence must be repaired or routed to earlier user/product authority.
- `indeterminate` means required checking could not establish status; Runtime retries, waits, or blocks rather than inventing rejection.

Runtime route is separate. A passing terminal-disposition candidate may append rejection/defer/withdraw. Only a passing, authorized, appended approval candidate becomes Planning input.

## Knowledge timing

Decision owns accepted Knowledge meaning. Before approval, each affected concept has an accepted update, explicit no-impact rationale, or grounded defer/route disposition.

Knowledge may describe accepted future intent before source realizes it. That lag remains aligned only while exact active Change accounts for it. Missing brownfield coverage remains explicit unknown.

Imported OKF provenance, generated/verified/status/freshness metadata, and Attested Computation definitions are advisory; none grants Decision authority.

## Approval fact

Runtime materializes authenticated approval-receipt Evidence before the approval-safety Check, then records the accepted approval operation only after Candidate pass and final guards. Conceptually the accepted fact binds:

```ts
interface ChangeApproval {
  candidateId: string;
  changeRevision: number;
  changeDigest: string;
  approvedBy: string;
  authorityRef: string;
  observedWorkStateDigest: string;
  exitReportId: string;
  approvedAt: string;
}
```

Candidate producer supplies none of the runtime-owned identity, actor, time, snapshot, or Report fields. Batch approval is a guarded command appending one exact fact per Change; it creates no bundled Decision entity.

## Operation target

One Decision attempt records distinct immutable operations:

```text
loop.attempt_started
decision.candidate_recorded
evidence.recorded
loop.exit_policy_recorded
check.result_recorded
loop.exit_report_recorded
runtime.route_recorded
loop.attempt_ended
```

Approval, rejection, or deferral derives from the exact passing Candidate disposition plus accepted Runtime Route and authority binding. There is no caller-controlled status operation. Current event names/payloads remain executable drift until the clean Decision/Trace cuts update source, tests, and projections together.

## Route-back

Planning or Implementation cites exact originating candidate/event and required authority. Decision preserves earlier accepted revisions and either confirms intent, appends a superseding accepted revision, rejects/defers/blocks, or creates/recommends a linked Change when outcome changes materially.

## Related docs

- [WorkState](work-state.md)
- [CodeWiki OS and Loop Protocols](codewiki-os.md)
- [Loop Exit](loop-exit.md)
- [Evidence Records](evidence.md)
- [Model Routing](model-routing.md)
- [Loop Model](loop-model.md)
- [Loop Contracts](loop-contracts.md)
- [Custom Checks](custom-checks.md)
- [Planning Loop](planning-loop.md)
- [Change Intake and Backlog Triage](change-intake.md)
- [Traces](traces.md)
- [Knowledge](knowledge.md)
