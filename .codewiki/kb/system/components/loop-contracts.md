---
type: Concept
title: Loop Contracts
description: "CodeWiki has exactly three semantic loops: decision, planning, and implementation. There is no fourth knowledge, validation, runtime, publication, roadmap, graph, or recovery loop."
tags:
  - codewiki
  - system
  - loop
  - contracts
timestamp: 2026-06-30T00:00:00Z
codewiki_component: loop_standards
codewiki_components:
  - loop_standards
codewiki_source_patterns:
  - src/loops/**
codewiki_test_patterns:
  - tests/loops/**
  - tests/decision/**
  - tests/planning/**
  - tests/implementation/**
  - tests/lab/**
codewiki_role: loop_standard_engine
codewiki_source_map:
  - id: loop_standards
    source_patterns:
      - src/loops/**
    test_patterns:
      - tests/loops/**
      - tests/decision/**
      - tests/planning/**
      - tests/implementation/**
      - tests/lab/**
    role: loop_standard_engine
---
# Loop Contracts

CodeWiki has exactly three semantic loops: Decision, Planning, and Implementation. There is no fourth knowledge, validation, runtime, publication, roadmap, graph, state, or recovery loop.

Runtime is the outer control loop. The three semantic loops are inner project capabilities governed by mandatory Stage Protocols and resolved Quality Policies. Quality evaluation determines whether deterministic exit gates permit progression; it is not a loop or standalone reviewer agent.

Each semantic loop has:

1. a typed loop input;
2. a versioned Stage Protocol;
3. a loop cycle;
4. a typed immutable candidate;
5. a resolved Quality Policy, assessments, deterministic gates, and exit conditions.

Change is the accountable semantic carrier. Decision receives, refines, validates, and approves exact Change revisions; Decision is not another domain entity. One persisted Change owns one append-only JSONL Change Trace. Planning observes a project-wide WorkState horizon and creates Sprints and Work Items from approved Changes. Runtime grants bounded Assignments. Implementation records realization against each Work Item's owning Change.

Relationships are many-to-many where execution requires them:

```text
Change * <-> * Sprint
Sprint 1 -> * Work Item
Work Item 1 -> * Assignment attempt
```

A Sprint is a Planning-created execution group and generated view, not a trace. One Change may span several Sprints, and one Sprint may coordinate several Changes. Each Work Item has exactly one owning Change and may contribute explicitly to others.

WorkState is the shared disposable projection over Change Traces, KB, source ownership, source/tests/Git, configuration, and bounded runtime observations. It is not a truth store. `RuntimeReactor` selects eligible semantic work. The project service turns every compatible selected invariant into one typed coordinator job, and `runRuntimeSelectedSemanticReaction()` executes that exact invariant without drifting into another lane. `runRuntimeSemanticExecutor()` remains a singular compatibility primitive. Runtime and all loop facades derive bounded inputs from the same WorkState semantics rather than asking callers to marshal repository truth. Candidate adapters may return semantic judgment or evidence only; runtime owns exact entity identity, freshness, append validation, CAS reruns, budgets, route-back stops, job identity, and durable recovery evidence.

## Loop responsibilities

| Loop | Loop input | Loop output | Exit-condition focus |
| --- | --- | --- | --- |
| Decision | Persisted/proposed Change revision, relevant WorkState, canonical current-state refs, authority, and route-back context. | Complete normalized Change revision, validation, Knowledge impacts, outcome contract, risks, delivery constraints, and exact approval or terminal disposition fact. | Intent and outcome quality, current-state grounding, Knowledge impact, evidence, risk, overlap, exact authority, and safe downstream constraints. |
| Planning | Relevant portfolio of approved Changes, WorkState planning horizon, active Sprints/Assignments/integration state, ownership, policy, and prior plan revisions. | Planning epoch containing Sprints, owned Work Items, acceptance criteria, dependencies, path scopes, verification, triggers, resolutions, and per-Change coverage. | Approved-Change coverage, Sprint coherence, work ownership, acceptance clarity, dependency/path/component validity, claimed-work stability, integration safety, and execution readiness. |
| Implementation | Owning approved Change, accepted Work Items, Assignments/worker reports, integration state, source ownership, source/tests/Git, policy, and prior evidence. | Change realization, changed paths, checks, acceptance evidence, worker provenance, integration proof, aggregate content proof, outcome disposition, and route-back questions. | Change/plan coverage, scope, checks, acceptance/TDD evidence, claim correlation, integration, ownership, content proof, outcome disposition, and closure readiness. |

## Implementation Quality evaluation and tool evidence

CodeWiki owns Implementation progression through the resolved Quality Policy; there is no standalone Implementation reviewer agent or review model slot. Pi-lens, pi-posher, and other Pi extensions are not runtime dependencies and must not own CodeWiki progression authority. Low-level tools such as compilers, linters, test runners, security scanners, formatters, and language analyzers are evidence sensors. CodeWiki-owned adapters run or ingest those tools, normalize their findings, and map evidence into Implementation Quality assessments.

Implementation Quality evaluation has two evidence phases:

1. **Fast edit feedback** runs after intercepted code-bearing edits when host hooks are available. It is latency-bounded, usually touched-file scoped, and reports clear blocks or warnings while the agent can still repair the local edit.
2. **Implementation exit evaluation** runs when an immutable implementation candidate is submitted. It is Work Item scoped and trace-aware; required assessments fan in before deterministic gates decide whether exit is permitted.

Both phases have two layers:

- a language-agnostic common layer for path scope, forbidden/generated/vendor paths, secret-like content, artifact routing, normalized diagnostics, evidence-link shape, and acceptance/check relevance; and
- optional language-specific packs for ecosystem semantics such as TypeScript/JavaScript type evidence, Python lint/type evidence, Go vet/test evidence, Rust Clippy/test evidence, or shell analysis.

A clean linter or compiler result is never sufficient by itself. Implementation exit still requires planned acceptance coverage, relevant checks, changed-path scope, content proof where required, and any risk/security authority required by the resolved Quality Policy.

Fast edit feedback may cache normalized evidence for the active session. Implementation exit may reuse cached fast evidence for hard blockers, then combine it with explicit exit evidence and any required full checks. Fast-only cached evidence can block on diagnostics, scope violations, or secret-like content, but it does not by itself satisfy acceptance coverage; exit-phase evidence must still link acceptance criteria to concrete refs.

Project config owns review policy under `quality.review`: whether review evidence is enabled, whether `wiki_implement` auto-runs review packs, whether cached evidence is included, tool budgets, enabled/disabled pack ids, and required pack ids such as `tsjs.typescript`, `tsjs.lint`, `python.ruff`, `python.pyright`, `go.test`, `go.vet`, `rust.cargo-test`, `rust.cargo-clippy`, and `shell.shellcheck`. These settings control adapter execution only; they do not transfer semantic authority from CodeWiki quality-network standards to linters or external tools.

Review pack dispatch follows the Pi-lens file-kind idea: classify changed paths by language, then run only the matching packs from the enabled set. Default config enables every built-in pack, so mixed-language projects do not need per-language setup. `enabledPacks` is an optional allowlist, `disabledPacks` is an opt-out list, and `requiredPacks` is a strict evidence policy for matching changed files. The Pi edit hook uses the same path-language selection for fast review evidence and caches fast findings for Implementation exit.

`wiki_implement` returns a `reviewEvidence` summary that names available, enabled, selected, skipped, and required packs, generated/submitted report counts, check status counts, diagnostic counts, and blocking diagnostics. `wiki_state` includes trace-backed review summaries and cached fast-review summaries so an agent can explain why Implementation is blocked without digging through raw tool output.

Review pack recipes are ordinary project config, not loop truth. A TypeScript-only project can set `enabledPacks` to `tsjs.typescript` and `tsjs.lint`. A Python project can enable `python.ruff` and `python.pyright`, or disable one with `disabledPacks`. A Go/Rust project can enable `go.test`, `go.vet`, `rust.cargo-test`, and `rust.cargo-clippy`, then disable slower packs in normal runs. A shell-heavy project can enable `shell.shellcheck`. `autoEvidence: false` stops automatic exit pack execution while still allowing explicit caller-supplied review reports. `includeCachedEvidence: false` prevents cached fast edit evidence from entering Implementation exit. `requiredPacks` makes relevant pack outcomes of `fail`, `blocked`, `not-run`, or `no-evidence` into CodeWiki blocking diagnostics; required packs must be enabled and cannot be disabled. `enabled: false` disables project review policy, but explicit reports passed to `wiki_implement` remain caller-provided implementation evidence.

Code-bearing repo edits route to Implementation Quality feedback. KB, trace, decision, and planning artifacts keep their owning loop contracts; a global host hook may classify the artifact and dispatch lightweight feedback, but it does not create a fourth semantic loop.

Write authority is surface-specific. Implementation owns repo payload writes such as `src/`, `tests/`, package files, README, and product docs. Decision owns `.codewiki/kb/**` meaning changes. The guarded runtime append boundary owns `.codewiki/traces/**`. `wiki_config` owns config writes with decision approval when policy or behavior changes. `.codewiki/views/**` is disposable projection output and must not become active truth.

The CodeWiki source checkout does not load or dogfood its own extension during stabilization. Repo-local Pi-tool autoload uses only pi-lens; source development uses Pi-native tools, KB/source/tests, diagnostics, and Git. Packed candidates exercise Change Traces and loop mutation only in disposable external repositories. Fast edit feedback is never enough to grant semantic approval.

## Knowledge propagation timing

Knowledge updates are part of Decision. CodeWiki does not add a separate Knowledge loop.

Decision reads current KB, source refs, active WorkState, and Git/content refs, then records a compact current-state baseline in the Change Trace. It cannot approve a Change revision unless every semantic impact has updated KB/diagram refs, explicit no-impact rationale, or grounded deferral/route-back.

Planning consumes exact approved Change revisions. It may create several Sprints for one Change or combine compatible approved Changes in one Sprint. Tiny or small low-risk Changes may route directly to Implementation only when their approved revision carries explicit direct scope, rationale, path boundaries, acceptance criteria, and verification. Larger, ambiguous, higher-risk, multi-component, product/API, security/privacy, release, or dependency work requires Planning.

If an approved Change needs recurrence, an event trigger, or a hook, Planning owns the trigger. Planning records schedule/event source, concurrency, run mode, run key, owner, and criteria. Implementation proves enablement or consumption; runtime only coordinates due work.

KB truth during an active Change Trace means accepted product/system intent, not implementation completion. Source/tests/Git prove implementation truth; Change Traces state where work and outcome realization stand.

## Loop output and exit

A semantic loop output is not downstream-authoritative until its quality-governed iteration exits successfully and runtime appends it to affected Change Trace(s). Continue, blocked, and route-back iterations remain durable accountability and next-action evidence, but downstream loops consume only exited upstream output revisions.

A loop output should separate:

- high-signal facts needed by the next loop;
- exact canonical refs;
- unmet exit conditions;
- dropped noise that should not leave runtime temp;
- route-back questions that require earlier-loop authority.

## Exit result contract

Every loop iteration should include an exit result:

- `status`: `continue`, `exit`, `route_back`, or `blocked`;
- `conditions`: structured condition results;
- `remediation`: exact next actions for unmet conditions;
- `targetLoop`: current machine-readable loop pointer when available;
- `routePlan`: shared AX route contract with target, kind, rationale, refs, and optional implementation mode;
- `nextAction`: the next safe action;
- progress signals such as newly met conditions, changed refs, repeated failures, and budget concerns.

Boolean pass/fail is not enough for recovery or automation.

Host errors are not loop exit conditions. If a main, trace, or worker host cannot execute or coordinate work, runtime records or returns host-error metadata. Once a semantic loop runs and produces a candidate, deterministic gates over its resolved Quality Policy determine whether that loop exits, continues, routes back, or blocks.

## Versioned Quality Policy

A loop exit condition is the deterministic result of one resolved Quality Policy. Production `loop.ts` graphs remain a source representation for Standard identity, dependencies, hashing, and scheduling, but they are inputs to policy resolution rather than the whole policy. The resolved policy defines what must be established for one exact Decision, Planning, or Implementation candidate.

Runtime composes protected kernel invariants, stage baseline, Change kind/risk/layer overlays, project traits, technology/path overlays, explicit approved additions, and permitted non-kernel exclusions. Sparse typed selector rules produce active Standard bindings plus an explainable resolution containing `activatedBy`, rule refs, versions, protected status, exclusions, and one policy digest. Learned activation is forbidden.

Typed selector facts replace profiles during each clean stage cut; profiles do not remain as masks over one frozen graph. Protected kernel Standards cannot be removed. Inactive considered Standards must carry an allowed exclusion reason such as `not_applicable`, `covered_by_invariant`, or `escalated_elsewhere`. Actual Implementation effects may add mandatory Standards but cannot silently remove the frozen Planning minimum.

Quality-standard implementation is split from graph identity:

- `src/loops/quality-pack.ts` owns the closed declarative pack schema, authority and rollout validation, evaluator identifiers, evidence-adapter identifiers, and protected kernel-standard checks.
- `src/loops/graph.ts` owns graph schema, refs, hashes, and node metadata.
- `src/loops/evaluator.ts` maps standard issues/results into graph-aware
  quality-standard output.
- `src/loops/quality-standards.ts` owns shared helpers for criteria and reusable
  standard result construction.
- `src/<loop>/quality-standards.ts` owns the loop-specific quality-standard
  implementations for Decision, Planning, or Implementation.
- `src/loops/runner.ts` owns async scheduling concerns such as evaluation dependencies, bounded resource pools, streaming assessments, required-result fan-in, cancellation, and timeout diagnostics.

The public `wiki_decide`, `wiki_plan`, and `wiki_implement` facades run their Quality Policy through the loop runner and include the Quality Policy resolution plus a compact immutable Quality Report with assessment, gate, latency, token, and cache summaries in loop output, exit data, and tail checkpoints. Synchronous evaluators remain available for focused tests and pure deterministic callers.

### Declarative quality-pack contract

Production and lab standards use one strict `qualityPack.schemaVersion = 1` declaration. A pack declares a stable pack id and version, authority (`kernel`, `official`, `project`, or `lab`), rollout (`observe`, `warn`, or `enforce`), one known semantic-loop graph, and standards with closed evaluator and evidence-adapter identifiers. Unknown fields, arbitrary evaluators, arbitrary evidence adapters, graph mismatches, duplicate ids, missing dependencies, dependency cycles, and attempts to replace protected kernel standards fail before execution.

CodeWiki owns all kernel standards. The Decision, Planning, and Implementation built-ins are immutable `kernel` packs in `enforce` mode. Graph identities and output contracts version with current semantic-loop contracts; pre-release contracts receive no compatibility projection. The generic runner composes current packs deterministically and fails closed on stale graph or contract identities.

Lab candidates use the same schema with `authority: "lab"` and `rollout: "observe"`. Lab packs report candidate identity but cannot enforce production exits, grade themselves with arbitrary code, or advance a production controller. `observe` records findings without changing gates; `warn` may surface non-blocking diagnostics; `enforce` may affect exit only after explicit CodeWiki authorization. Project Standards progress through `observe`, `warn`, and approved `enforce`. Composition never permits project-owned kernel overrides, custom semantic loops, arbitrary JavaScript or shell evaluators, automatic merge, or automatic publication.

Rollback remains source-level and deterministic: revert the production or lab migration commits while retaining the strict schema/composition foundation, then rerun public facade, lab, package, Pi, readiness, and disposable external-install gates. A release artifact advances only after separate review of an exact clean commit, tree, and tarball identity; migration success alone grants no activation authority.

The runner can use specialized model verifiers for `agent_self_assessment` and `model_judge` Standards. Conceptually each bound non-deterministic Standard owns one assessment identity and declares verifier id, assessment criteria, measurement shape, and deterministic gate threshold where applicable. A provider may batch related requests through one coherent transport envelope for latency, tokens, and prompt-cache reuse, but each Standard retains a distinct assessment.

A failed hard gate does not skip unrelated model work. Verifiers stop early only for invalid or stale input, genuine missing evaluation dependencies, cancellation, or budget policy. Model or provider failure yields `indeterminate`, never fabricated `unmet` or score `0`. No model dependency is required for deterministic Standards or normal local execution; production verifier providers are injected through the runner boundary while tests use fakes.

Production attempts opt in through `.codewiki/config.json` or environment:

```json
{
  "quality": {
    "judge": {
      "enabled": true,
      "provider": "http",
      "endpoint": "http://127.0.0.1:8787/judge",
      "promptVersion": "loop-quality-judge.v3",
      "timeoutMs": 30000
    }
  }
}
```

Equivalent environment overrides are `CODEWIKI_LOOP_QUALITY_JUDGE_URL`, `CODEWIKI_LOOP_QUALITY_JUDGE_PROMPT_VERSION`, `CODEWIKI_LOOP_QUALITY_JUDGE_TIMEOUT_MS`, and `CODEWIKI_LOOP_QUALITY_JUDGE_ENABLED`. These names and the current `{ verdicts: [...] }` transport remain compatibility surfaces during migration. Current v3 verdicts require `standardId`, `status`, `score`, and feedback, and fail closed when a claimed pass lacks its configured score. The common Assessment contract will make measurement optional and shape-specific, distinguish `indeterminate`, and bind exact verifier, adapter, model, configuration, trial, and aggregation identity before compatibility fields can be removed.

Each graph declares:

- graph id;
- graph version;
- schema version;
- layers;
- quality-standard nodes.

Each non-deterministic node also declares or derives a specialized verifier spec:

- verifier or judge id;
- verifier role;
- assessment criteria;
- measurement shape;
- model route and configuration identity;
- optional score threshold and calibration refs;
- trial and aggregation policy.

Legacy graph nodes declare stable id, description, verifier method, overloaded `gate` and `mode`, layer, Standard type, repair target, weight/cost/timeout, dependencies, and issue predicates. Common Quality contracts separate these concerns: the Quality Standard owns criteria and verifier/measurement metadata; the binding owns activation, enforcement, parameters, and evaluation dependencies; deterministic gates own progression logic. Each pre-production stage cut replaces its overloaded graph contract directly and removes the superseded internal representation rather than compiling a lasting compatibility projection.

Quality graph schema v3 validates graph identity, unique declared layers, unique node ids, known dependencies, and acyclic dependency order before hashing or execution. Evaluation dependencies skip only nodes whose required assessment input cannot exist. Gate dependencies are evaluated later at fan-in. Independent Standards continue through bounded parallel pools even when another gate will fail. Policy-inactive nodes are excluded with resolution reasons rather than reported as passed.

Deterministic Standards preserve their declared measurement shape. Existing score-producing nodes may emit 0-100 measurements from activated issue coverage, but an operational failure remains `indeterminate`. Partial scores enrich repair feedback and cannot average away an unmet, blocked, or authority-required route.

CodeWiki owns this semantic runner and does not depend on Pi-lens, Caveman, or
other Pi extensions. External tools may provide evidence refs, but they never
own semantic authority. Standards with method `external_evidence` consume
reported checks, TDD proof, content proof, CI refs, or optional linter results;
CodeWiki validates their presence/shape and trace coverage, not the linter's
internal rules. Production loop outputs carry Quality Policy resolution identity and one compact immutable Quality Report for traceability and recovery. The lab uses editable
candidate graphs and locked eval cases to improve DEC, PEC, IEC, PCE, and HCE
before promotion back into production code.

## Semantic runner AX model

The loop runner follows linter-style AX without depending on linters:

1. normalize the submitted loop input and verify candidate freshness;
2. resolve the Quality Policy and build shared facts once;
3. run all ready Standards through bounded resource-specific pools;
4. stream compact assessments as they settle;
5. batch or cache coherent model-verifier work when identity permits;
6. cancel only stale, invalid, dependency-impossible, explicitly cancelled, or budget-blocked work;
7. fan in every required assessment and apply deterministic gates;
8. return compact diagnostics and repair guidance for resubmission.

Loop outputs include `qualityDiagnostics`: sorted unmet-standard feedback with
severity, method, gate, refs, repair target, route, and concrete repair action.
Hard-gate diagnostics appear first so agents can fix binary blockers before
working on softer guidance.

This mirrors the useful feedback shape of linters while keeping CodeWiki's
scope semantic: trace refs, route authority, loop coverage, acceptance evidence,
and source-of-truth alignment. The coding agent itself is the debugger: it uses
the final Quality Policy report as the next iteration's worklist, then resubmits
loop output after fixing the highest-signal blockers.

## Deterministic gate policy

Hard gates are binary semantic contracts. They are deterministic and may depend on deterministic, model, external, or human assessments plus exact authority facts. They cannot be averaged away. Cheap admission runs first, but required fan-in cannot fabricate or omit an assessment merely because another hard gate already failed.

Decision hard gates cover Change-revision readiness, understood intent, accountable outcome, canonical Knowledge impacts, approval authority, current-state grounding, evidence, risk classification, active Change overlap, route safety, delivery constraints, and Change-kind classification.

Planning hard gates cover approved-Change coverage, coherent Sprint grouping, one owning Change per Work Item, cross-Change contribution, acceptance/verification, source ownership, dependency ordering, claimed-work stability, integration safety, trigger validity, resolution validity, and canonical refs.

Implementation hard gates cover approved-Change and Planning coverage, scope control, acceptance evidence, verification results, required TDD proof, integration and content proof, worker-Assignment correlation, source ownership, outcome disposition, archive readiness, release approval, and canonical refs.

Softer assessments may still prevent exit through deterministic gate rules when unmet. Their verifier kind does not determine enforcement. Independent assessments continue to provide repair guidance even when another gate already prevents exit.

## Baseline exit-condition invariants

Every loop should enforce cheap structural invariants before deeper semantic checks:

- stable unique ids for Change revisions, approvals, Sprints, Work Items, Assignments, acceptance criteria, and realization evidence;
- canonical refs for KB, trace, Git, digest, source, and test evidence;
- no unknown dependencies or dependency cycles;
- path-scope conflict detection across exact and hierarchical overlaps;
- component ownership alignment from OKF frontmatter to source paths and tests;
- optional repo-snapshot existence checks for changed source/docs/test and evidence paths;
- structured implementation check results with command, phase, acceptance criterion id, and pass/fail status;
- optional red/green TDD evidence when implementation policy requires it;
- structured acceptance evidence with summaries and canonical evidence refs;
- no downstream consumption of outputs from non-exited iterations.

These invariants are deliberately cheap and token-efficient. They catch low-level drift before the agent spends context on deeper KB/source analysis.

## Worker-owned AC-ID TDD

Planning assigns stable acceptance criterion ids to every executable work unit, including micro-plans. A micro-plan is a compact one-unit planning output for tiny or small low-risk work. A direct implementation route is allowed only when the proposed change itself carries the bounded scope and acceptance/verification packet that Implementation can consume. Implementation workers own their local TDD cycle by default: they may create the tests, implement the change, and submit local check evidence for the work unit they claimed. Worker reports are aggregated into one implementation output only when they reference an active runtime claim that matches worker id, work-unit id, and planning refs.

The implementation loop owns final trust and aggregate coverage. Worker-local success is never enough to exit implementation.

Implementation evidence must map back to approved Change and planned acceptance-criterion ids:

```text
approved Change -> Sprint -> Work Item -> AC -> red check -> green check -> acceptance evidence -> changed paths -> local content proof -> aggregate content proof
```

When TDD proof is required by policy, red checks must fail before implementation and green checks must pass after implementation. Red check failures are accepted only when explicitly marked with `phase: "red"`; other failed checks block exit. TDD checks should carry `criterionId` so exit conditions can prove red/green coverage for each planned acceptance criterion.

Worker-local content proof is provenance, not closure proof. Worker/parallel implementation requires final aggregate content proof after merge.

## Component and source ownership alignment

OKF ownership frontmatter is the active component contract. Component entries declare one owning doc, owned source/docs paths, and owned test paths for a system area. No separate source-map YAML file is active truth.

Planning output should include `componentRefs` that point to OKF ownership component ids. Planning exit conditions validate that declared path scopes and verification refs fit those components. Implementation derives the same component requirements from exited planning iterations.

Implementation exit conditions validate the aggregate output against the component contract:

- changed code and docs must be inside planned component source paths or owning doc;
- changed test paths must be inside planned component test paths;
- code changes must have matching test evidence under component test paths;
- when a repo path snapshot is supplied, changed paths and path-based evidence refs must exist;
- unknown or incomplete source ownership component entries prevent exit.

Component ids are trace data, not trace refs. Trace `refs` continue to carry only canonical artifacts: KB paths, source/test paths, trace ids, Git refs, and content digests.

## Change closure and runtime work queue

A Change Trace represents one accountable intent-to-outcome journey. It may close only when the current approved Change revision is fully dispositioned through Planning and Implementation, required realization evidence exists, and outcome disposition is explicit. Documentation-only proof cannot satisfy a source-bearing Change unless its approved scope is knowledge-only or Planning records a grounded non-executable resolution.

One Change may receive planning coverage from several Sprints. One Sprint may include Work Items owned by several Change Traces. Sprint completion is a generated view over its Work Items; Change completion is a generated view over its approved requirements, planning coverage, realization evidence, and outcome disposition.

The archive close path must block incomplete Change journeys and incomplete multi-trace planning batches. Derived views may surface `needs_decision`, `needs_planning`, `needs_implementation`, `observing_outcome`, `blocked`, `deferred`, `finished`, `closed_complete`, or `closed_incomplete`; those statuses are calculations, not workflow truth.

Completed Change Traces leave hot state through a post-commit archive pipeline: full history is first preserved by a Git restore ref, then `wiki_archive` may close and compact the hot file into `trace_head` + retention checkpoint + `trace_close`. Hydration restores and validates full history; compaction cannot be an unrecoverable delete.

Decision checks active Change journeys before approving a revision. Semantic overlap should be merged, linked, superseded, deferred, ordered, or explicitly justified before Planning. Planning owns execution grouping and conflict-aware ordering; runtime may detect cheap operational overlap but cannot resolve semantic contradiction.

Current work is not stored in a separate roadmap or Sprint board. WorkState and generated views derive it from Change Traces and current project truth.

```text
all Change Traces + current project truth -> WorkState -> work queue -> runtime Assignment selection -> claim events -> worker start
```

The work queue classifies Planning-owned Work Items as backlog, waiting, ready, claimed, blocked, or done. Planning dependencies decide waiting versus ready. Runtime claims or live leases decide claimed. Claim expiry or release returns work to ready unless another blocker exists. Implementation acceptance decides done. Path conflicts are selection constraints, not semantic truth by themselves.

## Trace write contract

One JSONL trace line should be one durable semantic iteration or one runtime coordination event. It is not full chat, scratch state, or a full artifact dump.

Trace writes are runtime-owned. A semantic loop iteration produces compact loop output, exit condition results, progress signals, and canonical refs; runtime validates and appends that report. Runtime coordination events are also appended by runtime.

`refs` must contain canonical artifact refs only, such as KB paths, source/test paths, trace event ids, Git refs, restore refs, or content digests. Commands, prose summaries, acceptance text, and remediation details belong in `data`, not `refs`.

## Recovery contract

A resume agent should be able to replay a trace and answer:

1. What is the latest iteration for each semantic loop?
2. Which loop is active now?
3. Which loop outputs have exited and are safe to consume?
4. Which exit conditions remain unmet?
5. Which route-back or blocked iteration explains current remediation?
6. Which KB/source/test/Git refs prove the current state?
7. What is the next safe action?

Accepted loop outputs provide Change-rooted vertical alignment:

```text
Change intent -> exact approval -> Sprint/Work Item coverage -> Change realization -> Git/content proof -> outcome disposition
```

Exit-condition findings and checkpoints provide recovery alignment after errors, failed iterations, context loss, or agent replacement.

## Token-efficiency rule

Do not add loops to compensate for weak loop outputs or weak Quality Policy. Add compact outputs, exact refs, better activation, and stronger Standards. Downstream loops should read the previous loop output and touched refs, not reload full chat history.

Preview results are assessment drafts for the agent. Append only meaningful trace facts, keep loop outputs compact, share extracted facts, use exact caches and coherent model batches, cancel stale candidates, and let views cache derived status/progress for hosts and renderers. Optimize both time to first useful feedback and time to authoritative exit.

## Related docs

- [WorkState](work-state.md)
- [CodeWiki OS and Stage Protocols](codewiki-os.md)
- [Quality Policy](quality-policy.md)
- [Worker Workbench](worker-workbench.md)
- [Model Routing](model-routing.md)
- [Loop Model](loop-model.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
