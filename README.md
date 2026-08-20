# CodeWiki

CodeWiki is an intent-to-production alignment runtime.

It turns accepted user intent into an accountable transition of project Knowledge and implementation, then permits exact Git and delivery state to advance only when required alignment evidence is complete, fresh, and authorized.

```text
(Kₜ, Gₜ, Pₜ) + ΔIntent
  ──CodeWiki──>
(Kₜ₊₁, Gₜ₊₁, Pₜ₊₁, Evidence)
```

Where `K` is accepted Knowledge, `G` is exact Git state, `P` is delivery state, and Evidence includes exact Check Results, Gate Reports, authority, Integration proof, and observations.

> **A Change is accountable intent and a durable dossier. Project Server owns the canonical Work Graph and operational scheduling; Decision, Planning, Implementation, and Review own Loop meaning.**

CodeWiki does not guarantee unknowable semantic perfection. It provides bounded process integrity: accepted-intent provenance, exact subject identity, independent checking, deterministic Gate reduction, guarded progression, exact Git/delivery proof, and explicit uncertainty.

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

The package is currently `@nunomoura/codewiki@0.3.0` with `"private": true` and is not published to the npm registry yet. Avoid global/user installs for normal mutation workflows. Current source exposes an optional Pi extension and compatibility CLI/test surfaces, but the approved target boundary below is not yet fully implemented.

This source repository does not install or load CodeWiki during stabilization. Future source-repository dogfooding is ratified only for an immutable stable release installed in an isolated external controller and requires a separate explicit activation Change after external gates pass; historical pins, traces, approvals, and releases grant no authority.

## Primary product boundary

```text
CodeWiki
|
+-- Clients: App, CLI, optional Pi integration, External Agent Clients
|
`-- Project Server
    +-- transport, AuthN, project AuthZ
    +-- canonical state and four Stage Loops
    +-- Checks, Gates, Workbenches, transitions, and effects
    `-- Runtime
        +-- Run Requests and Runs
        +-- Runtime Builds and Run Processes
        +-- DSH Adapter -> DSH AgentLoop
        `-- CodeWiki-authored Run Receipts
```

Project Server is the sole authority for one governed project. Runtime is its subordinate execution subsystem and owns no project meaning, Work Graph, queue, integration, or lifecycle authority. The DSH path proves one exact-pinned replay Runtime Build from authenticated Run Process launch through isolated Agent Session JSONL and Runtime-authored Run Receipt. Current replay tooling still carries one immutable `StageContextBundle` with direct and batch queries; ratified production architecture replaces that transport with locally mounted content-addressed Project Material Generations and freezes separate Gate Evaluation Packages at Candidate checkpoint. Persistent multi-Run Session continuity, live provider transport, mounted material, Work Unit execution, compaction, secure Code Mode, cancellation/resume, and Pi parity remain implementation gates. Temporary Pi execution remains migration evidence.

## Exactly four Stage Loops

```text
Project Server
+-- Decision
+-- Planning
+-- Implementation
`-- Review
```

A producer DSH Agent Session may span several separately bounded Runs, but every Candidate has exactly one producing Run. DSH AgentLoop owns model/tool continuation and compaction mechanics; it is not a CodeWiki Stage Loop.

- **Decision** evaluates one exact Change revision, accepted active Changes compatibility, and `approve | reject | defer | withdraw`.
- **Planning** creates one immutable Change-scoped Work Graph delta without replacing a global plan.
- **Implementation** independently realizes and gates each accepted Work Unit through an isolated Assignment-bound Workbench under one shared stage-wide policy.
- **Review** judges the exact aggregate integrated Change lineage and complete Change outcome.

Every Candidate attempt follows one authority model:

```text
refreshable producer Project Material Generation
-> exact Run Request and exclusive Session lease
-> Runtime executes bounded Run
-> Run Receipt
-> immutable Candidate
-> frozen Gate Evaluation Package and resolved stage-wide Check Pack
-> Gate
-> Project Server retries, stops, integrates one Work Unit, completes aggregate Review, or applies guarded transition
```

## Check Packs, Results, and Gates

Project files define stage standards directly:

```text
.codewiki/check-packs/<stage>/<pack>/
├── skill/<skill-name>/        # optional, at most one per Pack
│   ├── SKILL.md
│   └── scripts/ | references/ | assets/ | other resources
└── <check-id>/
    ├── check.json
    └── CHECK.mjs | CHECK.md
```

Stages are `decision`, `planning`, `implementation`, and `review`. Pack directories need no manifest. Project Server deterministically resolves every active Pack in one stage into one stage-wide policy snapshot. Implementation applies the same resolved policy to every Work Unit Candidate; only frozen unit-specific inputs differ. No Work Unit, Planning Candidate, worker, or route selects a bespoke Pack. Every present Check gates. Empty Packs and Skill-only Packs are valid; a stage with zero Checks passes with `selectedCheckCount: 0`, no synthetic Result, and `no_checks_configured`.

An optional Pack Skill guides only the work-producing Agent for its stage. Project Server snapshots its complete bounded file tree and binds separate Skill digests to producer attempts and receipts. Managed Pi sessions disable ambient Skills and resources, materialize only the exact stage snapshots, preserve executable files, and keep explicit Worker tool policy authoritative over `allowed-tools` metadata. Code and Model Check executors receive no Pack Skill, producer context, memory, or tools, and Skill identity does not enter Check Result or Gate cache identity.

`check.json` uses the exported `CheckDefinitionSchema` at version `1.0.0`. It binds one atomic requirement, one Code or Model implementation, bounded input selectors, binary or finite quantitative measurement, execution limits, one stable failure code, and one remediation contract. It contains no lifecycle route, authority grant, enforcement tier, activation state, protected floor, arbitrary dependency, or repair subsystem.

Code Checks use `CHECK.mjs`. Checks delegates them only to an admitted sandbox that declares hermetic, bounded, credential-free, network-denied execution. CodeWiki does not execute project JavaScript directly in the host process. Model Checks use `CHECK.md`; each Pack-selected route, profile, and token ceiling is independent from work-producing Worker routes. Every top-level Model Check invocation uses its own fresh isolated tool-free session, may run in bounded parallel, and receives no producer material query, memory, conversation, Worker state, or lifecycle authority.

Code and Model implementations return the same strict structured output: exact Invocation digest, binary or quantitative measurement, bounded summary, and bounded factual details. Checks derives the verdict. Completed Results are only `passed | failed`; a failed Result receives the Check's authored failure code and feedback. Timeout, cancellation, unavailable execution, missing inputs, malformed output, exhausted retries, or stale identity creates no Result and stops only that Gate.

Gate Reports are `passed | failed | stopped`. They bind stage subject, immutable Pack snapshot, selected Check count, completed Results, exact cache hits, execution and cancellation facts, warnings, and one bounded stop reason. Gates never choose lifecycle stages or perform effects. Project Server applies fixed transitions after validating report identity and freshness.

The Gate runner resolves exact completed cache hits first, runs Code Checks with bounded concurrency, stops before Model Checks after a Code failure or operational stop, then runs Model Checks with separate bounded concurrency. It stops launching queued work after a conclusive outcome and requests best-effort cancellation for already-running work. Cache keys bind the exact Invocation and execution identity, including subject, Pack and implementation digests, selected inputs and Evidence, profile, route, and configuration.

Bootstrap creates one ordinary empty `default/` Pack directory per stage. Users may add, edit, or delete any Pack or default. Upgrades do not restore Pack content. Outside bootstrap, Pack changes are direct project-file edits or explicit authenticated App actions; CodeWiki-managed Agents do not author or activate Packs.

Canonical Evidence adapters remain bounded observation membranes. SARIF, JUnit, coverage, provider receipts, CycloneDX, SPDX, Pact, and OpenAPI do not grant Results. Concrete scanners and provider transports remain under Execution ownership. Research collection remains a bounded trusted-host Evidence collector; it does not install hidden research Checks or share model state with Model Checks.

Change Trace keeps its existing serialized operation-kind and route-field vocabulary for historical replay. New inline artifacts carry Check Pack snapshots, completed Results, Gate Reports, and Project Server transitions. Active APIs expose current Gate semantics while frozen historical fixtures remain byte-stable.

## Work and project control plane

Backlog is a generated intake view over persisted pending Change revisions; submission grants no semantic or execution authority. Project Server exposes one content-addressed triage projection and one bounded user/agent query with explicit readiness, supported estimates, overlap, freshness, frontier, fairness, and ordering reasons. Accepted User Standard preferences may influence protected deterministic triage ordering, but lower order is not Check failure and no model emits final rank. An authenticated user selects an exact revision to start Decision; selection grants no disposition. `codewiki.decision-attention-selection@2.0.0` binds that command to one actor-scoped idempotency key, exact Change revision, and the projection digest that already commits WorkState, triage Candidates, graph, protected config, and policy. Project Server then appends canonical `loop.attempt_started`; its operation ID is also the revision-bound job key. Pending Changes and generic triggers remain quiescent until selection. The authenticated coordinator exposes a bounded bootstrap query plus strict projection-bound follow-up queries. Pi agents may inspect this through read-only `wiki_attention`; users may browse with `/wiki-attention` and start one exact attempt only through `/wiki-select <change-id> --revision <revision-id> --projection <digest>`. No model-callable selection tool exists. Planning later decomposes one ratified Change into a graph delta and declares dependencies and strategic parallelism; Project Server owns live readiness, queueing, Claims, Assignments, and placement.

Change Trace Protocol `5.0.0` makes every revision a complete content-addressed semantic input rather than a skeletal issue summary and binds authority through accountable actor plus proof-backed authenticated identity. Revision identity binds current and desired state, rationale and alternatives, classification and affected targets, impact, Knowledge propagation, observable outcomes, delivery constraints, Evidence expectations, safety semantics, acceptance requirements, and any normalized defect profile. Missing assurance remains explicitly absent or unknown; intake claims never become risk or Check authority.

Decision Candidate schema `2.0.0` is materialized only from native `ProjectWorkState` plus the producer's strict disposition/rationale proposal. Project Server derives the current revision, active relationships and overlap accounting, WorkState/Knowledge/source/config/policy refs, and Candidate identity; callers cannot submit observed bases, validation state, authority, or append bindings. Native continuation admission reconstructs this exact Candidate before any canonical write. A host-configured native attempt executor now reloads fresh Git state, verifies an exact protected-source/config-bound Decision Gate binding before producer invocation, runs one versioned producer request and independent evaluation, commits Candidate through attempt end under expected-head CAS, and recovers canonical completion without reinvocation. `createDecisionGitAdmission()` supplies the production selection-side Git glue: fresh protected-config-bound triage projection, short-lived exact context reuse across authorization, expected-WorkState attempt append, no blind stale retry, and canonical post-push verification. `createPiSdkNativeDecisionCandidateProducer()` validates that exact authority-free production request, runs one isolated read-only Pi SDK session, accepts one strict proposal, and propagates cancellation through abort and disposal. `createPiNativeDecisionStartOptions()` composes those pieces for the Pi daemon when the host supplies trusted repository identity, project authority, replay policy, and Project Server continuation authority. Only approved project-local Pi coordinator connections resolve to hashed selection actors; optional project authorization can still deny them. Canonical terminal state recovers after daemon restart without a second model run. Missing mandatory trusted host inputs leave both Decision-attention projection and selection endpoints unavailable.

One Change owns one append-only JSONL dossier:

```text
.codewiki/traces/TRACE-CHG-<id>.jsonl
```

It retains exact semantic revisions, Loop attempts, completed passed/failed Results, stopped Gate facts, bounded feedback, Planning coverage, implementation realization, Git/delivery proof, and outcome observations. Full prompts, reasoning, raw tool/model output, credentials, private Workbenches, and complete failed patches never enter canonical traces.

Dashboard destinations are:

- **Work:** Backlog, Planning, Implementation;
- **Product:** Users, Stories, Dictionary;
- **System:** canonical diagrams and architecture Knowledge;
- **Design:** Guidelines and UIs.

Change detail is a cross-cutting dossier, not a private copy of the pipeline.

Project Server derives ready Work Units from the canonical global Work Graph and WorkState, admits exact Claims, Assignments, custody, and capacity, invokes producer Sessions or workers, runs subject-bound Gates, integrates passing unit outputs into private Change lineages, and guards writes and effects. Change-scoped Planning deltas may proceed concurrently but apply through Work Graph expected-head CAS. Independent Work Units may execute and gate concurrently; integration lineages, overlapping scopes, protected targets, and external effects remain serialized where authority requires.

`WorkState` is a disposable projection over Change Traces, Knowledge, source/test ownership, source/tests/Git, configuration, delivery evidence, and bounded Project Server observations. JSONL is streamed and indexed in memory; process loss causes rebuild. No SQLite or graph database belongs to the current architecture.

## Workers, Integration, and effects

Planning creates independently judgeable worker-ready Work Units owned by exactly one Change, with acceptance coverage, dependencies, scope, verification, and declarative resource requirements. Project Server selects current placement and any `routine`, `standard`, or `complex` execution tier from structured facts; callers and workers cannot self-label.

Project Server resolves each Assignment into one private digest-bound Workbench containing exact source, owning Change and Work Unit obligations, dependency outputs, Project Material Generation, Skills/tools, model route, shared Implementation Check Pack policy, isolation, budgets, and Candidate contract. Only a matching canonical Claim activates it.

Workers are isolated and non-authoritative. Every Work Unit Candidate has one producing Run and receives the same resolved Implementation policy with unit-specific Gate inputs. A passing Gate advances only that unit.

Passing fresh output enters the owning Change's serialized private integration lineage through expected-head CAS. Integration proof binds Claim, Assignment, Candidate, Gate, base/parent/commit/tree, changed paths, patch digest, and custody. Gate pass, integration, aggregate completion, Review, branch merge, push, publication, release, deployment, and outcome remain separate facts and authority boundaries.

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

OKF provides portable Knowledge; CodeWiki adds software realization, exact authority, Change accountability, and Git/delivery proof. OKF validation, export, and consumption are owned by `src/knowledge/**` and exposed through the curated Project Server surface.

Target Knowledge support is OKF v0.2 with v0.1 fallback consumption, including `sources`, `generated`, `verified`, lifecycle/freshness metadata, meaningful concept types, unknown-field preservation, and inert Attested Computation definitions. Current executable source remains v0.1-only migration state.

Imported `generated`, `verified`, `status`, `stale_after`, provenance, or Attested Computation metadata never grants CodeWiki authority or Loop exit. Change Traces remain outside OKF.

## Relationship queries and improvement intake

WorkState and Alignment Graph queries are disposable views over canonical sources. Agents may use bounded read-only semantic queries that include snapshot digest, provenance, authority class, coverage, truncation, and staleness. No arbitrary Cypher, graph mutation, canonical graph file, or absence-as-proof under partial coverage.

CodeWiki has no separate project-learning, Feedback Bundle, or self-improvement subsystem. User feedback, benchmark regressions, CI/security findings, worker discoveries, delivery outcomes, and maintainer suggestions enter through normal bounded Change Intake. Improvement then follows the same authenticated selection, Decision, Planning, Implementation, Review, and release authority as any other Change. CodeWiki never uploads private project traces automatically.

After stabilization and explicit activation, an immutable released CodeWiki version may operate on this source repository from an isolated external controller to coordinate the next version. It must not load mutable workspace code or edit its installed package, and dogfood evidence cannot replace independent CI, packed external proof, benchmark oracles, human review, or release authorization.

## Source layout

```text
src/
  index.ts
  pi-extension.ts
  alignment/
  changes/
  checks/
  clients/
  error-handling/
  evidence/
  git/
  knowledge/
  loops/
  preview/
  project/
  project-server/
    index.ts
    api.ts
    admission/
    app/
    authentication/
    claims/
    commands/
    coordinator/
    effects/
    integration/
    lifecycle/
    pairing/
    persistence/
    queries/
    registry/
    repository-access/
    sessions/
    workbenches/
    workers/
  protocol/
    client-project-server.ts
    client-pairing.ts
  runtime/
    index.ts
    contracts.ts
    runtime.ts
    builds/
    checks/
    pi/
    processes/
    review/
    security/
  utils/
  work-state/

benchmarks/
scripts/
tests/
```

Project Server AuthN, Pairing, Client Sessions, project AuthZ, Stage Loop coordination, persistence, Workbenches, and effects live under `src/project-server/**`. Runtime contracts, Runtime Builds, the CodeWiki DSH Adapter, Run Process management, concrete Check execution, and temporary Pi/review migration adapters live under `src/runtime/**`. Release tooling bundles the exact DSH process closure into a self-contained Runtime Build candidate; qualification, activation, and launch reverify its content digest. Core Stage Loop and Check domains import only neutral Runtime contracts. No legacy `src/server/**`, `src/execution/**`, or compatibility path survives.

Public subpaths are `@nunomoura/codewiki/project-server`, `@nunomoura/codewiki/runtime`, and temporary `@nunomoura/codewiki/pi-sdk`.

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
npm run test:coordinator
npm run test:pi-sdk
npm run test:pi-sdk-package
npm run test:project-local-install
npm run test:external-lifecycle
npm run test:external-failures
npm run test:readiness
npm run audit:codewiki
```

External smokes pack/install into disposable projects. They must not mutate this source checkout or perform real publication/release without separate approval.

For dashboard visual development:

```bash
npm run dashboard:dev -- --project /tmp/codewiki-dashboard-fixture
```

Fixture must exist outside repository. Development server does not load CodeWiki extension into source checkout.

## Current extension and distribution testing

Package manifest retains:

```json
{
  "pi": {
    "extensions": ["dist/pi-extension.js"]
  }
}
```

This remains useful for optional thin client. Current packed installs expose compatibility `/wiki-*` commands and `wiki_*` capabilities in disposable projects. Project Server must continue owning exact identity, source facts, routing, freshness, sequence/parent/byte guards, and append authority.

After installing different packed runtime, fully restart Pi rather than relying on module reload. Do not install CodeWiki globally or under this repository's `.pi/` directory during stabilization.

## Review evidence configuration

Canonical Review attempts now bind one exact integrated head and tree, admitted Evidence, provider receipt digests, Review Check Pack snapshot, Gate Report, fixed Project Server transition, and expected-head commit receipt. Failed Results project atomic feedback to Implementation; stopped Gates preserve state without fabricating Results. Legacy `.codewiki/config.json` `quality.review` evidence-pack settings remain only for older Implementation evidence collection and grant no Review authority.

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
- semantic replacement of remaining legacy Planning and Implementation quality contracts;
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

- [Maintainer intent](.codewiki/kb/product/stories/maintainer/maintain-intent.md)
- [Design system](.codewiki/kb/product/DESIGN.md)
- [System architecture](.codewiki/kb/system/diagrams/architecture.yaml)
- [Alignment](.codewiki/kb/system/components/alignment.md)
- [Checks](.codewiki/kb/system/components/checks.md)
- [Review](.codewiki/kb/system/components/review.md)
- [Project Server](.codewiki/kb/system/components/runtime.md)
- [Knowledge](.codewiki/kb/system/components/knowledge.md)
- [Lexicon](.codewiki/kb/lexicon.md)
- [Temporary refactoring plan](REFACTORING_PLAN.md)
