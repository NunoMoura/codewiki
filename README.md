# CodeWiki

CodeWiki is an intent-to-production alignment runtime.

It turns accepted user intent into an accountable transition of project Knowledge and implementation, then permits exact Git and delivery state to advance only when required alignment evidence is complete, fresh, and authorized.

```text
(Kₜ, Gₜ, Pₜ) + ΔIntent
  ──CodeWiki──>
(Kₜ₊₁, Gₜ₊₁, Pₜ₊₁, Evidence)
```

Where `K` is accepted Knowledge, `G` is exact Git state, `P` is delivery state, and Evidence includes exact Check Results, Exit Reports, authority, Integration proof, and observations.

> **A Change is accountable intent and a durable dossier. Runtime owns the portfolio pipeline.**

CodeWiki does not guarantee unknowable semantic perfection. It provides bounded process integrity: accepted-intent provenance, exact candidate identity, independent checking, deterministic exit status, guarded progression, exact Git/delivery proof, and explicit uncertainty.

## Current posture

CodeWiki is private pre-production software under active clean-cut refactoring.

- `.codewiki/kb/**` is intended Product/System/Design truth.
- `src/**` and `tests/**` are executable truth.
- Git is history and checkpoint evidence.
- `REFACTORING_PLAN.md` is temporary non-authoritative migration continuity state.
- This source checkout is developed with Pi native coding tools, Pi-Lens, normal file edits, tests, and Git.
- It does **not** install, load, or dogfood its own CodeWiki extension during stabilization.
- Repo-local Pi loads Pi-Lens only. No CodeWiki controller pin, local CodeWiki Skills, commands, tools, prompt injection, or active Change Traces belong here.
- Packed candidates are tested only in disposable external projects with isolated Pi settings.
- `.codewiki/views/**` and `.codewiki/runtime/**` are disposable generated/private state, not source truth.
- Pi native compaction remains the active conversation-compaction mechanism.

The package is currently `@nunomoura/codewiki@0.3.0` with `"private": true` and is not published to the npm registry yet. Avoid global/user installs for normal mutation workflows. Current source exposes an optional Pi extension and compatibility CLI/test harness, but the approved target boundary below is not yet fully implemented.

This source repository does not install or load CodeWiki and does not self-host. Reintroducing source self-hosting requires a new explicit product Decision; historical pins, traces, approvals, and releases grant no authority.

## Primary product boundary

```text
CodeWiki CLI
+ Project Runtime
+ dashboard
+ embedded published Pi SDK
```

The optional Pi extension is a thin conversational client to the same Project Runtime. It does not contain duplicate workflow authority or own project lifetime.

Pi owns:

- providers and credentials;
- model transport and authentication;
- sessions and compaction;
- tools and extensions;
- ordinary Skills.

CodeWiki owns:

- Change Traces and WorkState;
- Decision, Planning, and Implementation;
- Loop Protocols;
- Checks and Loop exit;
- private Workbenches and isolated workers;
- Integration and routing;
- guarded merge, push, publication, release, and future deployment effects.

CodeWiki embeds published Pi SDK APIs. It does not fork or copy Pi provider/session machinery. Future OpenClaw support may be a client or Assignment execution adapter; CodeWiki retains semantic and canonical authority.

## Exactly three semantic Loops

```text
Project Runtime
├── Decision
├── Planning
└── Implementation
```

Runtime is the outer control plane, not a fourth semantic Loop. Checking, learning, graph projection, recovery, Integration, publication, release, and feedback are not semantic Loops.

- **Decision** turns persisted intent into an exact approved or terminally dispositioned Change revision and owns accepted Knowledge meaning.
- **Planning** reasons globally across a bounded approved-Change portfolio and creates coherent Sprints, worker-ready Work Items, dependencies, verification, Integration boundaries, and Workbench requirements.
- **Implementation** realizes accepted obligations in source/tests/Knowledge and accepts one exact realization candidate only through required evidence.

Every Loop attempt follows one model:

```text
Change
→ Loop
→ immutable Candidate
→ Resolved Exit Policy
→ Code Checks + Model Checks
→ Check Results
→ immutable Exit Report
→ Runtime route
```

## Checks and exit

```ts
type Check = CodeCheck | ModelCheck;
```

A Check is one atomic versioned requirement plus execution, measurement, evidence, repair, resource, and implementation contracts.

- **Code Check**: trusted deterministic CodeWiki-owned implementation.
- **Model Check**: independent bounded Pi session over immutable evidence with no candidate-producer conversational state.

Check dimensions are independent:

```text
origin:      default | custom
execution:   code | model
measurement: qualitative | quantitative
enforcement: observe | warn | require
```

Runtime applies quantitative thresholds. Timeout, provider failure, malformed output, unavailable service, or cancellation is `indeterminate`, never a fabricated score of zero.

```text
required fail exists          → fail
else required indeterminate   → indeterminate
else                           → pass
```

A passing Exit Report permits exact semantic Loop exit only. Runtime separately revalidates generation, freshness, authority, and CAS before append or any effect.

Initial Check catalog is closed. Default Checks are CodeWiki-provided and cannot be disabled. Users provide source-backed Standards; CodeWiki distills them into atomic Custom Model Checks or approved-template Custom Code Checks. Projects cannot inject arbitrary JavaScript, shell, prompts, tools, schemas, dependencies, or verdict logic. Custom Checks use `draft | active | disabled`; every applicable active Custom Check is required. Activation is deterministic and records `activatedBy`; learned activation and threshold changes are forbidden. Hard resource Code Checks may configure matching Runtime guards before exact usage Evidence yields a Result.

Pi-Lens, LSP, compilers, linters, tests, browsers, AST tools, and Skills remain Workbench/repair capabilities. Their output is not automatically authoritative Check evidence. Classified or high-risk native Decision assurance now activates a closed scanner suite before independent security challenge review. Runtime fixes exact source/tree/environment/configuration/advisory bindings and materializes observed Evidence; findings fail, while unavailable scanners or stale advisory data remain `indeterminate`.

## Work and project control plane

Backlog is a generated intake view over persisted pending Change revisions; submission grants no semantic or execution authority. Runtime exposes one content-addressed triage projection and one bounded user/agent query with explicit readiness, supported estimates, overlap, freshness, frontier, fairness, and ordering reasons. Accepted User Standard preferences may influence protected deterministic triage ordering, but lower order is not Check failure and no model emits final rank. An authenticated user selects an exact revision to start Decision; selection grants no disposition. Planning later decomposes approved Changes and owns Work Item execution ordering.

One Change owns one append-only JSONL dossier:

```text
.codewiki/traces/TRACE-CHG-<id>.jsonl
```

It retains exact semantic revisions, all Loop attempts, passed/failed/indeterminate Results, repairs, Planning coverage, implementation realization, Git/delivery proof, and outcome observations. Full prompts, reasoning, raw tool/model output, credentials, private Workbenches, and complete failed patches never enter canonical traces.

Dashboard destinations are:

- **Work:** Backlog, Planning, Implementation;
- **Product:** Users, Stories, Dictionary;
- **System:** canonical diagrams and architecture Knowledge;
- **Design:** Guidelines and UIs.

Change detail is a cross-cutting dossier, not a private copy of the pipeline.

Project Runtime derives a compatible bounded job set from WorkState, admits exact lanes/Claims/capacity, invokes semantic sessions or workers, runs candidate-bound exit, and guards writes/effects. It allows unrelated Decision and Work Item work concurrently while serializing one accepted Planning writer, overlapping paths, shared Integration targets, and external effects.

`WorkState` is a disposable projection over Change Traces, Knowledge, source/test ownership, source/tests/Git, configuration, delivery evidence, and bounded Runtime observations. JSONL is streamed and indexed in memory; process loss causes rebuild. No SQLite or graph database belongs to the current architecture.

## Workers, Integration, and effects

Planning creates worker-ready Work Items rather than the smallest possible tasks. Runtime selects `routine`, `standard`, or `complex` Implementation tier from structured facts; callers and workers cannot self-label work routine.

Runtime resolves each Assignment into one private digest-bound Workbench containing exact source, context, Loop Protocol, Pi Skills/tools, model route, frozen Check/evidence minimums, isolation, budgets, and Worker Report contract. Only a matching canonical Claim activates it.

Workers are isolated and non-authoritative. A completed Worker Report is candidate evidence only.

Accepted worker output enters a serialized private Integration workspace. Exact Integration proof binds Claim, Assignment, Worker Report, base/parent/commit/tree, changed paths, patch digest, and trusted checks. It does not imply branch merge, push, publication, release, deployment, or outcome.

Each later boundary is separately guarded and authorized:

```text
Implementation exit
→ Integration proof
→ optional local fast-forward merge
→ optional remote push
→ optional publication
→ optional release
→ future deployment and outcome observation
```

OCI workers are opt-in, digest-pinned, preinstalled, capability-scoped, resource-bounded, non-privileged, and network-denied unless a restricted network is explicitly authorized. CodeWiki never implicitly pulls an image or mounts provider credentials/Docker socket.

## Alignment and Knowledge

Alignment means every discrepancy among intent, Knowledge, Planning, source/tests, Git, delivery, and outcomes is:

1. resolved;
2. accounted for by one exact active Change; or
3. explicitly unknown and blocked from unsafe progression.

CodeWiki keeps vertical, horizontal, temporal, and delivery alignment separate. Local proof never implies continuing remote state.

OKF provides portable Knowledge; CodeWiki adds software realization, exact authority, Change accountability, and Git/delivery proof.

Target Knowledge support is OKF v0.2 with v0.1 fallback consumption, including `sources`, `generated`, `verified`, lifecycle/freshness metadata, meaningful concept types, unknown-field preservation, and inert Attested Computation definitions. Current executable source remains v0.1-only migration state.

Imported `generated`, `verified`, `status`, `stale_after`, provenance, or Attested Computation metadata never grants CodeWiki authority or Loop exit. Change Traces remain outside OKF.

## Relationship queries and learning

Work, Alignment, and Learning graphs are disposable views over canonical sources. Agents may use bounded read-only semantic queries that include snapshot digest, provenance, authority class, coverage, truncation, and staleness. No arbitrary Cypher, graph mutation, canonical graph file, or absence-as-proof under partial coverage.

> **Changes improve future Changes.**

Compact candidate/Check/repair/outcome lineage in Change Traces can derive:

- **Repair Episode:** failed/indeterminate Result → repair candidate → later outcome;
- **Repair Pattern:** applicable aggregation of successful and harmful Episodes.

These remain advisory projections, not a Lesson/Memory entity or fourth Loop. Learning cannot suppress Checks, lower thresholds, change activation, grant authority, or promote itself. Stable guidance enters Knowledge/config/source only through another accountable Change.

Lab must compare current feedback, raw history, retrieved Repair Episodes, and issue-class-routed validated Repair Patterns using temporal/component holdouts. Retrieval ships only when measured benefit exceeds latency/cost without worsening false passes or escaped regressions.

Recurring suspected CodeWiki defects may produce a local allowlisted pseudonymized Feedback Bundle. User previews/redacts and separately approves export. Full traces, project content/identity, paths, commits, prompts, reasoning, raw output, credentials, exact timestamps, and project-defined Check content are excluded by default. Initial transport is manual file only.

## Target source layout

```text
src/
  semantic-loop.ts
  loop-exit/
    contracts.ts
    identity.ts
    catalog.ts
    resolve-policy.ts
    runner.ts
    cache.ts
    report.ts
  decision/
    candidate.ts
    iteration.ts
    exit/**
  planning/
    candidate.ts
    iteration.ts
    exit/**
  implementation/
    candidate.ts
    iteration.ts
    exit/**
  runtime/
    loop-exit-runtime.ts
  dashboard/**
  traces/**
  views/**
  work-state/**
  knowledge/**
  git/**
  error-handling/**
  pi/**
  project/**
  api/**
  utils/**
```

Shared `src/loop-exit/**` cannot import Loop implementations. Runtime composes one immutable `LoopExitSuite`. Clean cuts keep no old-path re-exports.

Current `src/loops/**`, Decision/Planning/Implementation Quality machinery, broad SDK candidate schema, and legacy trace/view fields are executable migration state. Ordered migration and exact deletion map live in [`REFACTORING_PLAN.md`](REFACTORING_PLAN.md).

## Development requirements

- Package/runtime APIs target Node.js `>=20.6.0` where supported.
- Local stripped-TypeScript commands require Node.js `>=22.6.0`.
- Optional Pi SDK adapter follows Pi's stronger supported runtime requirement.
- Npm packages build to `dist/**` before packing.

Core commands:

```bash
npm run typecheck
npm run build
npm test
npm run test:pack
npm run test:pi-install
npm run test:pi-rpc
npm run test:pi-multiprocess
npm run test:pi-mutation
npm run test:coordinator
npm run test:pi-sdk
npm run test:pi-sdk-package
npm run test:project-local-install
npm run test:external-lifecycle
npm run test:external-failures
npm run test:readiness
npm run lab:gate
npm run lab:pipeline -- --gate
npm run audit:codewiki
```

External smokes pack/install into disposable projects. They must not mutate this source checkout or perform real publication/release without separate approval.

For dashboard visual development:

```bash
npm run dashboard:dev -- --project /tmp/codewiki-dashboard-fixture
```

Fixture must exist outside repository. Harness does not load CodeWiki extension into source checkout.

## Current extension and distribution testing

Package manifest retains:

```json
{
  "pi": {
    "extensions": ["dist/pi/extension.js"]
  }
}
```

This remains useful for optional thin client. Current packed installs expose compatibility `/wiki-*` commands and `wiki_*` capabilities in disposable projects. Runtime must continue owning exact identity, source facts, routing, freshness, sequence/parent/byte guards, and append authority.

After installing different packed runtime, fully restart Pi rather than relying on module reload. Do not install CodeWiki globally or under this repository's `.pi/` directory during stabilization.

## Review evidence configuration (current migration)

Current executable source still supports legacy `.codewiki/config.json` `quality.review` evidence-pack settings while the Implementation clean cut is pending. This compatibility surface is not the target Check architecture and grants no semantic authority.

```json
{
  "quality": {
    "review": {
      "autoEvidence": true,
      "includeCachedEvidence": true,
      "requiredPacks": []
    }
  }
}
```

Built-in pack ids are `tsjs.typescript`, `tsjs.lint`, `python.ruff`, `python.pyright`, `go.test`, `go.vet`, `rust.cargo-test`, `rust.cargo-clippy`, and `shell.shellcheck`. `skippedPacks` explains disabled, unmatched, or unavailable sensors. Explicit `reviewEvidenceReports` remain validated compatibility input. `requiredPacks` requires relevant sensors to run, but their success never attests candidate acceptance. Clean Implementation/config cuts replace this surface with trusted Code Check bindings and exact evidence contracts.

## Production readiness and automation gates

Before production release, prove:

- exact candidate/Check/Result/Report identity and authority hardening;
- bounded cancellation-aware Code/Model Check execution;
- clean Decision, Planning, and Implementation cuts;
- persisted historical policy/Report meaning;
- OKF v0.2 compatibility and software alignment profile;
- packed Pi `0.82.1` compatibility before widening peer range;
- real provider/auth execution;
- trusted OCI image distribution and real OCI execution;
- external dashboard/runtime lifecycle, failure, recovery, cleanup, and guarded effects;
- user-approved publication/release;
- competitive fixtures showing benefit over simpler workflows.

If CodeWiki cannot materially reduce drift, false acceptance, lost context, repeated repair, and Integration errors enough to offset ceremony and latency, it should shrink into a thin Pi/OpenClaw extension.

## Documentation

- [Product overview](.codewiki/kb/product/overview.md)
- [System overview](.codewiki/kb/system/components/overview.md)
- [Alignment model](.codewiki/kb/system/components/alignment-model.md)
- [Loop model](.codewiki/kb/system/components/loop-model.md)
- [Loop exit](.codewiki/kb/system/components/loop-exit.md)
- [Runtime](.codewiki/kb/system/components/runtime.md)
- [Knowledge](.codewiki/kb/system/components/knowledge.md)
- [Lexicon](.codewiki/kb/lexicon.md)
- [Refactoring plan](REFACTORING_PLAN.md)
