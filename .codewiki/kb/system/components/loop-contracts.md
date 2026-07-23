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

Runtime is the outer control loop. The three semantic loops are inner project capabilities governed by loop-owned quality networks. Quality networks determine loop exit; they are not loops themselves.

Each semantic loop has:

1. a typed loop input;
2. a loop cycle;
3. a typed loop output;
4. quality standards and exit conditions.

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

## Implementation review and tool evidence

CodeWiki owns implementation review. Pi-lens, pi-posher, and other Pi extensions are not runtime dependencies and must not own CodeWiki pass/fail authority. Low-level tools such as compilers, linters, test runners, security scanners, formatters, and language analyzers are evidence sensors. CodeWiki-owned adapters run or ingest those tools, normalize their findings, and map evidence into Implementation quality-network standards.

Implementation review has two phases:

1. **Fast edit feedback** runs after intercepted code-bearing edits when host hooks are available. It is latency-bounded, usually touched-file scoped, and reports clear blocks or warnings while the agent can still repair the local edit.
2. **Implementation exit review** runs when an implementation output is submitted. It is work-unit scoped, trace-aware, and authoritative for loop exit.

Both phases have two layers:

- a language-agnostic common layer for path scope, forbidden/generated/vendor paths, secret-like content, artifact routing, normalized diagnostics, evidence-link shape, and acceptance/check relevance; and
- optional language-specific packs for ecosystem semantics such as TypeScript/JavaScript type evidence, Python lint/type evidence, Go vet/test evidence, Rust Clippy/test evidence, or shell analysis.

A clean linter or compiler result is never sufficient by itself. Implementation exit still requires planned acceptance coverage, relevant checks, changed-path scope, content proof where required, and any risk/security authority required by the quality network.

Fast edit feedback may cache normalized evidence for the active session. Implementation exit may reuse cached fast evidence for hard blockers, then combine it with explicit exit evidence and any required full checks. Fast-only cached evidence can block on diagnostics, scope violations, or secret-like content, but it does not by itself satisfy acceptance coverage; exit-phase evidence must still link acceptance criteria to concrete refs.

Project config owns review policy under `quality.review`: whether review evidence is enabled, whether `wiki_implement` auto-runs review packs, whether cached evidence is included, tool budgets, enabled/disabled pack ids, and required pack ids such as `tsjs.typescript`, `tsjs.lint`, `python.ruff`, `python.pyright`, `go.test`, `go.vet`, `rust.cargo-test`, `rust.cargo-clippy`, and `shell.shellcheck`. These settings control adapter execution only; they do not transfer semantic authority from CodeWiki quality-network standards to linters or external tools.

Review pack dispatch follows the Pi-lens file-kind idea: classify changed paths by language, then run only the matching packs from the enabled set. Default config enables every built-in pack, so mixed-language projects do not need per-language setup. `enabledPacks` is an optional allowlist, `disabledPacks` is an opt-out list, and `requiredPacks` is a strict evidence policy for matching changed files. The Pi edit hook uses the same path-language selection for fast review evidence and caches fast findings for Implementation exit.

`wiki_implement` returns a `reviewEvidence` summary that names available, enabled, selected, skipped, and required packs, generated/submitted report counts, check status counts, diagnostic counts, and blocking diagnostics. `wiki_state` includes trace-backed review summaries and cached fast-review summaries so an agent can explain why Implementation is blocked without digging through raw tool output.

Review pack recipes are ordinary project config, not loop truth. A TypeScript-only project can set `enabledPacks` to `tsjs.typescript` and `tsjs.lint`. A Python project can enable `python.ruff` and `python.pyright`, or disable one with `disabledPacks`. A Go/Rust project can enable `go.test`, `go.vet`, `rust.cargo-test`, and `rust.cargo-clippy`, then disable slower packs in normal runs. A shell-heavy project can enable `shell.shellcheck`. `autoEvidence: false` stops automatic exit pack execution while still allowing explicit caller-supplied review reports. `includeCachedEvidence: false` prevents cached fast edit evidence from entering Implementation exit. `requiredPacks` makes relevant pack outcomes of `fail`, `blocked`, `not-run`, or `no-evidence` into CodeWiki blocking diagnostics; required packs must be enabled and cannot be disabled. `enabled: false` disables project review policy, but explicit reports passed to `wiki_implement` remain caller-provided implementation evidence.

Code-bearing repo edits route to Implementation review. KB, trace, decision, and planning artifacts keep their owning loop contracts; a global host hook may classify the artifact and dispatch lightweight feedback, but it does not create a fourth semantic loop.

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

Host errors are not loop exit conditions. If a main, trace, or worker host cannot execute or coordinate work, runtime records or returns host-error metadata. Once a semantic loop runs and produces output, quality standards determine whether that loop exits, continues, routes back, or blocks.

## Versioned quality networks

A loop exit condition is the output of a versioned quality network in that
loop's `loop.ts`. The network is the editable quality surface: it defines what
must be true for a decision, plan, or implementation output to leave its loop.
It is represented in source as a graph for hashing and scheduling, but product
vocabulary should treat it as a layered quality network whose final layer is the
high-signal report returned to the coding agent. Exit wiring, helper predicates,
component/source-map lookups, trace reading, and runner behavior may live outside
the graph plumbing, but the network definition lives in `src/<loop>/loop.ts` for
production and `lab/<loop>/loop.ts` for lab candidates.

Decision-type loop quality profiles are activation masks over these frozen quality networks. They do not delete nodes, mutate graph definitions, or make inactive nodes look passed. A masked node must carry an allowed reason such as `not_applicable`, `covered_by_invariant`, or `escalated_elsewhere`; protected hard gates fail closed unless the profile proves invariant coverage or explicit escalation.

Quality-standard implementation is split from graph identity:

- `src/loops/quality-pack.ts` owns the closed declarative pack schema, authority and rollout validation, evaluator identifiers, evidence-adapter identifiers, and protected kernel-standard checks.
- `src/loops/graph.ts` owns graph schema, refs, hashes, and node metadata.
- `src/loops/evaluator.ts` maps standard issues/results into graph-aware
  quality-standard output.
- `src/loops/quality-standards.ts` owns shared helpers for criteria and reusable
  standard result construction.
- `src/<loop>/quality-standards.ts` owns the loop-specific quality-standard
  implementations for Decision, Planning, or Implementation.
- `src/loops/runner.ts` owns async scheduling concerns such as dependency order,
  parallel execution, hard-gate skips, and timeout diagnostics.

The public `wiki_decide`, `wiki_plan`, and `wiki_implement` facades run their
quality-standard evaluation through the loop runner and include compact
`qualityRunner` latency/node summaries in loop output, exit data, and tail
checkpoints. Synchronous loop evaluators remain available for focused tests and
pure in-process callers.

### Declarative quality-pack contract

Production and lab standards use one strict `qualityPack.schemaVersion = 1` declaration. A pack declares a stable pack id and version, authority (`kernel`, `official`, `project`, or `lab`), rollout (`observe`, `warn`, or `enforce`), one known semantic-loop graph, and standards with closed evaluator and evidence-adapter identifiers. Unknown fields, arbitrary evaluators, arbitrary evidence adapters, graph mismatches, duplicate ids, missing dependencies, dependency cycles, and attempts to replace protected kernel standards fail before execution.

CodeWiki owns all kernel standards. The Decision, Planning, and Implementation built-ins are immutable `kernel` packs in `enforce` mode. Graph identities and output contracts version with current semantic-loop contracts; pre-release contracts receive no compatibility projection. The generic runner composes current packs deterministically and fails closed on stale graph or contract identities.

Lab candidates use the same schema with `authority: "lab"` and `rollout: "observe"`. Lab packs report candidate identity but cannot enforce production exits, grade themselves with arbitrary code, or advance a production controller. `observe` records findings without changing verdicts; `warn` may surface non-blocking diagnostics; `enforce` may affect exit only for CodeWiki-authorized packs. Project policy composition and a Quality Designer remain deferred; this migration does not permit project-owned kernel overrides, custom semantic loops, JavaScript evaluators, shell evaluators, automatic merge, or automatic publication.

Rollback remains source-level and deterministic: revert the production or lab migration commits while retaining the strict schema/composition foundation, then rerun public facade, lab, package, Pi, readiness, and disposable external-install gates. A release artifact advances only after separate review of an exact clean commit, tree, and tarball identity; migration success alone grants no activation authority.

The runner can optionally use specialized quality judge nodes for
`agent_self_assessment` and `model_judge` standards. Conceptually there is one
judge per non-deterministic quality standard: each node declares a one-job judge
spec, rubric, and score threshold. The HTTP provider may batch those per-standard
judge requests into one loop attempt transport for latency and cost, but the
semantic contract remains one verdict and one 0-100 score per standard id. Judge
work is skipped when deterministic hard gates already fail and is cacheable by
graph hash, judge prompt version, and input/evidence hash. No model dependency is
required for deterministic gates or normal local execution; real judge workers
are injected through the runner options or through the production judge provider
boundary, while tests use a fake judge.

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

Equivalent environment overrides are
`CODEWIKI_LOOP_QUALITY_JUDGE_URL`,
`CODEWIKI_LOOP_QUALITY_JUDGE_PROMPT_VERSION`,
`CODEWIKI_LOOP_QUALITY_JUDGE_TIMEOUT_MS`, and
`CODEWIKI_LOOP_QUALITY_JUDGE_ENABLED`. The HTTP worker receives a batch of judge
requests with versioned prompts and returns `{ verdicts: [...] }`. Each verdict
must include `standardId`, `status`, `score`, and feedback linked to refs where
possible. A judge `pass` below the node threshold, or a `pass` without a numeric
score, fails closed.

Each graph declares:

- graph id;
- graph version;
- schema version;
- layers;
- quality-standard nodes.

Each non-deterministic node also declares or derives a specialized judge spec:

- judge id;
- judge role;
- rubric;
- score threshold;
- optional calibration refs.

Each node declares:

- stable id;
- description;
- method: `deterministic`, `agent_self_assessment`, `model_judge`,
  `human_authority`, or `external_evidence`;
- gate: `hard`, `soft`, or `score_only`;
- mode: `deterministic`, `agent`, or `user`;
- layer;
- quality-standard type;
- repair target;
- weight, cost, and timeout budget;
- optional dependencies on other stable node ids;
- issue codes or predicates that make the node unmet or blocked.

Quality graph schema v3 validates graph identity, unique declared layers, unique
node ids, known dependencies, and acyclic dependency order before hashing or
execution. The runner skips a dependent node when its hard-gate dependency
fails while independent standards may continue in parallel. Profile-inactive
nodes are removed from the active dependency set rather than being reported as
passed.

Deterministic nodes emit 0-100 scores from activated issue coverage. No issue
means 100. Blocked hard gates remain 0. Partial deterministic scores enrich the
repair report but cannot average away an unmet or blocked route.

CodeWiki owns this semantic runner and does not depend on Pi-lens, Caveman, or
other Pi extensions. External tools may provide evidence refs, but they never
own semantic authority. Standards with method `external_evidence` consume
reported checks, TDD proof, content proof, CI refs, or optional linter results;
CodeWiki validates their presence/shape and trace coverage, not the linter's
internal rules. Production loop outputs carry quality-standard results plus graph
id, version, and hash for traceability and recovery. The lab uses editable
candidate graphs and locked eval cases to improve DEC, PEC, IEC, PCE, and HCE
before promotion back into production code.

## Semantic runner AX model

The loop runner follows linter-style AX without depending on linters:

1. normalize the submitted loop input;
2. build shared facts once;
3. run cheap hard gates first;
4. skip dependent or expensive standards after failed hard gates;
5. run independent standards in parallel;
6. batch or cache model-judge work when model standards are enabled;
7. return compact diagnostics and repair guidance for resubmission.

Loop outputs include `qualityDiagnostics`: sorted unmet-standard feedback with
severity, method, gate, refs, repair target, route, and concrete repair action.
Hard-gate diagnostics appear first so agents can fix binary blockers before
working on softer guidance.

This mirrors the useful feedback shape of linters while keeping CodeWiki's
scope semantic: trace refs, route authority, loop coverage, acceptance evidence,
and source-of-truth alignment. The coding agent itself is the debugger: it uses
the final quality-network report as the next iteration's worklist, then resubmits
loop output after fixing the highest-signal blockers.

## Hard-gate policy

Hard gates are binary semantic contracts. They are cheap, deterministic or
human-authority backed, and must not be averaged away or delayed behind model
judgment.

Decision hard gates cover Change-revision readiness, understood intent, accountable outcome, canonical Knowledge impacts, approval authority, current-state grounding, evidence, risk classification, active Change overlap, route safety, delivery constraints, and Change-kind classification.

Planning hard gates cover approved-Change coverage, coherent Sprint grouping, one owning Change per Work Item, cross-Change contribution, acceptance/verification, source ownership, dependency ordering, claimed-work stability, integration safety, trigger validity, resolution validity, and canonical refs.

Implementation hard gates cover approved-Change and Planning coverage, scope control, acceptance evidence, verification results, required TDD proof, integration and content proof, worker-Assignment correlation, source ownership, outcome disposition, archive readiness, release approval, and canonical refs.

Softer agent-assessment standards still fail the loop when unmet, but they are
not hard-gate fail-fast blockers because they may need richer repair guidance or
future model-judge batching.

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

Do not add loops to compensate for weak loop outputs or weak exit conditions. Add compact outputs, exact refs, and stronger weighted standards. Downstream loops should read the previous loop output and touched refs, not reload full chat history.

Preview results are validation drafts for the agent. Append only meaningful trace facts, keep loop outputs compact, run cheap deterministic checks before expensive agent-judgment standards, and let views cache derived status/progress for hosts and renderers.

## Related docs

- [WorkState](work-state.md)
- [Loop Model](loop-model.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
