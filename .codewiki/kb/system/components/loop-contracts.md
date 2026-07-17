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

CodeWiki has exactly three semantic loops: decision, planning, and implementation. There is no fourth knowledge, validation, runtime, publication, roadmap, graph, or recovery loop.

Each semantic loop is defined by:

1. loop cycle;
2. loop output;
3. exit conditions.

Runtime is the outer control loop. It coordinates traces, scheduling, claims, workers, budgets, retention, and host integration, but it does not own semantic truth. Hosts such as Pi display state, collect user input, and invoke CodeWiki APIs; host UI state is never workflow truth.

Before Decision, the main session shapes mutable validated Changes into a user-confirmed Sprint Map. The map declares one accountable goal, canonical Product/System Knowledge Base topics or an explicit no-impact rationale, cross-Sprint dependencies, and one rollback boundary. This shaping is part of Change intake, not a semantic loop or a new truth store. Decision must reject an absent map for multi-Change bundles, invalid topic or dependency references, oversized bundles, incoherent boundaries, and maps that leak Planning-level Work Items.

The user-facing hierarchy is `Change → Sprint → Work Item → Assignment`. One Sprint equals one trace lifecycle. Planning creates Work Items only after Decision exits; internal work-unit names remain compatible trace data.

## Loop responsibilities

| Loop | Loop cycle | Loop output | Exit condition focus |
| --- | --- | --- | --- |
| Decision | Observe a user-confirmed Sprint Map, exact Change revisions, current KB/source/trace/Git refs, risks, alternatives, work scale, planning depth, route target, and route-back questions. | Accepted Sprint boundary and decision facts, requirements, KB/diagram propagation, risks, non-goals, assumptions, planning-depth guidance, route metadata, and planning questions. | Sprint coherence, accountable goal, canonical Knowledge topics, dependencies, rollback boundary, intent quality, current-state grounding, KB impact, risk/approval, and safe routing readiness. |
| Planning | Observe accepted Decision output and trace-queue state, then shape executable work. | Work Items (internal work units) or micro-plans, acceptance criteria, dependencies, component refs, path scopes, verification strategy, trace-queue ordering/conflict decisions, deferrals, and optional triggers for recurring schedules, events, or hooks. | Decision coverage, acceptance clarity, planning-depth validity, dependency/path/component validity, trace-queue health, trigger validity, and implementation/runtime readiness. |
| Implementation | Observe accepted planning output and change code/docs/tests. | Changed paths, checks, acceptance evidence, worker provenance, aggregate content proof, residual ownership, archive disposition, and publication refs when needed. | Planning coverage, checks, AC evidence, TDD proof, component/path alignment, worker claim correlation, content proof, archive-disposition readiness, and closure readiness. |

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

For the CodeWiki source checkout itself, fast edit feedback is never enough to make a change registered. The pinned-baseline, disposable shadow, and reproducible installer gates have passed; repo-local Pi-tool autoload uses only the reviewed controller under `.pi/npm`. Every subsequent repo source/test/README/KB mutation must be covered by a durable decision/planning/implementation trace record or an explicit direct-implementation decision record, with current content proof, expected-byte/sequence guards, and guarded append evidence. Normal Git and tests remain mandatory verification. Changes to quality evaluation must be governed by the pinned baseline while the candidate evaluator remains non-authoritative.

## Knowledge propagation timing

Knowledge updates are part of the decision loop. CodeWiki does not add a separate knowledge-update loop between decision and planning.

The decision loop reads the current KB, source refs, active trace/work-queue facts, and Git/content refs, then records a compact current-state baseline in decision loop output. That baseline is the observed actual/pending state used to compare the user's desired state against reality.

The decision loop cannot exit unless every accepted proposed change has current-state refs and one of:

- updated KB refs and diagram refs;
- explicit no-KB-impact and/or no-diagram-impact rationale;
- route-back or deferral with owner, trigger, rationale, and evidence.

Planning starts only from an exited decision iteration. This keeps planning grounded in current semantic truth without adding another prompt-heavy loop. User-approved sprint proposals that change product/system behavior must be captured as `decision.changes_approved`. The default route is planning. Tiny or small low-risk changes may route directly to implementation only when the proposed change carries explicit `routeTarget: "implementation"`, route rationale, implementation mode, path scopes, acceptance criteria, and verification. Larger, ambiguous, higher-risk, multi-component, product/API, security/privacy, release, or dependency work still routes to planning.

If an accepted decision needs recurrence, an event trigger, or a hook, planning owns the trigger. Planning records the schedule or event source, concurrency policy, run mode, run key template, owner, and acceptance criteria. Implementation proves that the trigger was enabled or consumed; runtime coordination code only processes heartbeats and starts runs from planned triggers.

KB truth during an active trace means accepted product/system intent, not implementation completion. Source/tests/Git prove implementation truth; traces state where work currently stands.

## Loop output and exit

A loop output is not durable truth until its iteration exits successfully and runtime appends it to the trace. Failed, blocked, or route-back iterations record compact provenance and next actions, but downstream loops consume only exited upstream outputs.

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

CodeWiki owns all kernel standards. The Decision, Planning, and Implementation built-ins are immutable `kernel` packs in `enforce` mode. Their compatibility projections preserve the pre-migration graph ids, versions, node semantics, diagnostics, routes, and hashes, so existing `wiki_decide`, `wiki_plan`, and `wiki_implement` output contracts remain unchanged. The generic runner composes packs deterministically before the compatibility projection.

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

Decision hard gates cover proposal readiness, coherent Sprint boundaries, accountable goals, canonical Knowledge topics, dependencies, rollback boundaries, understood intent, route safety,
planning depth, approval authority, current-state grounding, trace evidence,
risk classification, active trace conflicts, and Change-kind classification.

Planning hard gates cover decision coverage, self-contained worker units,
acceptance/verification, planning depth, source ownership, dependency ordering,
trigger validity, resolution validity, and canonical refs.

Implementation hard gates cover planning/direct-decision coverage, scope control,
acceptance evidence, verification results, required TDD proof, content proof,
worker claim correlation, source ownership, archive disposition when post-commit
cleanup is required, release approval, and canonical refs.

Softer agent-assessment standards still fail the loop when unmet, but they are
not hard-gate fail-fast blockers because they may need richer repair guidance or
future model-judge batching.

## Baseline exit-condition invariants

Every loop should enforce cheap structural invariants before deeper semantic checks:

- stable unique ids for decision facts, work units, acceptance criteria, and implementation changes;
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

Planning assigns stable acceptance criterion ids to every executable work unit, including micro-plans. A micro-plan is a compact one-unit planning output for tiny or small low-risk work. A direct implementation route is allowed only when the proposed change itself carries the bounded scope and acceptance/verification packet that Implementation can consume. Implementation workers own their local TDD cycle by default: they may create the tests, implement the change, and submit local check evidence for the work unit they claimed. Worker results are aggregated into one implementation output only when they reference an active runtime claim that matches worker id, work-unit id, and planning refs.

The implementation loop owns final trust and aggregate coverage. Worker-local success is never enough to exit implementation.

Implementation evidence must map back to planned acceptance criterion ids:

```text
CHG -> WU -> AC -> red check -> green check -> acceptance evidence -> changed paths -> local content proof -> aggregate content proof
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

## Trace goal closure and runtime work queue

A trace represents one accountable goal. The trace may close only when that goal is satisfied by the CHG → WU → implementation evidence chain, or when remaining work is explicitly deferred/scheduled with owner, trigger, rationale, and evidence. Proposed changes covered only by documentation updates do not satisfy a source-bearing goal unless the decision itself is docs-only or planning records a non-executable/knowledge-only resolution.

Recurring or triggered work closes through a trigger trace plus independent run traces. The trigger trace proves the standing decision and trigger. Each run trace proves one due execution and links back through lineage refs; it is not a sub-trace.

The archive close path must block incomplete goals. Derived views may surface `needs_decision`, `needs_planning`, `needs_implementation`, `blocked`, `deferred`, `finished`, `closed_complete`, or `closed_incomplete`; those statuses are view calculations, not workflow truth.

Completed traces leave hot state through a post-commit archive pipeline: the full completed trace is first preserved by a Git restore ref, then `wiki_archive` may close and compact the hot file into `trace_head` + retention checkpoint + `trace_close`. Hydration restores the full trace body from Git and validates the stub before use; compacting must not be an unrecoverable delete.

The decision loop must check active trace goals before approving a new proposed change. Semantic overlap with an active trace should be merged, superseded, deferred, ordered by dependency, or explicitly justified as non-conflicting before planning starts. Runtime/main-host checks may detect cheap operational overlap such as path conflicts, but semantic contradiction remains a decision quality-standard concern.

The current state of work is not stored in a separate roadmap board. The `work-queue` and trace-board views derive it from hot trace files.

```text
all TRACE-*.jsonl -> work-queue view -> runtime work-unit claim selection -> work-unit claim trace events -> host worker start
```

The work queue classifies accepted decisions and planning work units as backlog, waiting, ready, claimed, blocked, or done. Planning dependencies decide waiting vs ready. Runtime claim events or live leases decide claimed. Claim expiry or release returns work to ready unless another active blocker exists. Implementation exit decides done. Path conflicts are claim-selection constraints, not durable workflow truth by themselves.

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

Accepted loop outputs provide vertical alignment:

```text
user intent -> decision output -> planning output -> implementation output -> Git/content proof
```

Exit-condition findings and checkpoints provide recovery alignment after errors, failed iterations, context loss, or agent replacement.

## Token-efficiency rule

Do not add loops to compensate for weak loop outputs or weak exit conditions. Add compact outputs, exact refs, and stronger weighted standards. Downstream loops should read the previous loop output and touched refs, not reload full chat history.

Preview results are validation drafts for the agent. Append only meaningful trace facts, keep loop outputs compact, run cheap deterministic checks before expensive agent-judgment standards, and let views cache derived status/progress for hosts and renderers.

## Related docs

- [Loop Model](loop-model.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
