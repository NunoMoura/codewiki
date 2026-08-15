# CodeWiki

CodeWiki is an intent-to-production alignment runtime.

It turns accepted user intent into an accountable transition of project Knowledge and implementation, then permits exact Git and delivery state to advance only when required alignment evidence is complete, fresh, and authorized.

```text
(Kₜ, Gₜ, Pₜ) + ΔIntent
  ──CodeWiki──>
(Kₜ₊₁, Gₜ₊₁, Pₜ₊₁, Evidence)
```

Where `K` is accepted Knowledge, `G` is exact Git state, `P` is delivery state, and Evidence includes exact Check Results, Gate Reports, authority, Integration proof, and observations.

> **A Change is accountable intent and a durable dossier. Runtime owns generic portfolio control; Decision, Planning, Implementation, and Review own Loop meaning.**

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
→ Decision Loop
→ immutable Candidate
→ project Check Pack snapshot
→ Decision Gate
→ completed Check Results or bounded stopped Gate
→ fixed Runtime transition
```

## Check Packs, Results, and Gates

Project files define stage standards directly:

```text
.codewiki/check-packs/<stage>/<pack>/<check-id>/
├── check.json
└── CHECK.mjs | CHECK.md
```

Stages are `decision`, `planning`, `implementation`, and `review`. Pack directories need no manifest. Every present Check gates. Empty Packs are valid and produce `empty_pack`; a stage with zero Checks passes with `selectedCheckCount: 0`, no synthetic Result, and `no_checks_configured`.

`check.json` uses the exported `CheckDefinitionSchema` at version `1.0.0`. It binds one atomic requirement, one Code or Model implementation, bounded input selectors, binary or finite quantitative measurement, execution limits, one stable failure code, and one remediation contract. It contains no lifecycle route, authority grant, enforcement tier, activation state, protected floor, arbitrary dependency, or repair subsystem.

Code Checks use `CHECK.mjs`. Checks delegates them only to an admitted sandbox that declares hermetic, bounded, credential-free, network-denied execution. CodeWiki does not execute project JavaScript directly in the host process. Model Checks use `CHECK.md`; each Pack-selected route, profile, and token ceiling is independent from work-producing Worker routes. The fixed Model Check request supplies no tools, memory, conversational context, Worker state, or lifecycle authority.

Code and Model implementations return the same strict structured output: exact Invocation digest, binary or quantitative measurement, bounded summary, and bounded factual details. Checks derives the verdict. Completed Results are only `passed | failed`; a failed Result receives the Check's authored failure code and feedback. Timeout, cancellation, unavailable execution, missing inputs, malformed output, exhausted retries, or stale identity creates no Result and stops only that Gate.

Gate Reports are `passed | failed | stopped`. They bind stage subject, immutable Pack snapshot, selected Check count, completed Results, exact cache hits, execution and cancellation facts, warnings, and one bounded stop reason. Gates never choose lifecycle stages or perform effects. Runtime applies fixed transitions after validating report identity and freshness.

The Gate runner resolves exact completed cache hits first, runs Code Checks with bounded concurrency, stops before Model Checks after a Code failure or operational stop, then runs Model Checks with separate bounded concurrency. It stops launching queued work after a conclusive outcome and requests best-effort cancellation for already-running work. Cache keys bind the exact Invocation and execution identity, including subject, Pack and implementation digests, selected inputs and Evidence, profile, route, and configuration.

Bootstrap creates one ordinary empty `default/` Pack directory per stage. Users may add, edit, or delete any Pack or default. Upgrades do not restore Pack content. Outside bootstrap, Pack changes are direct project-file edits or explicit authenticated App actions; CodeWiki-managed Agents do not author or activate Packs.

Canonical Evidence adapters remain bounded observation membranes. SARIF, JUnit, coverage, provider receipts, CycloneDX, SPDX, Pact, and OpenAPI do not grant Results. Concrete scanners and provider transports remain under Execution ownership. Research collection remains a bounded trusted-host Evidence collector; it does not install hidden research Checks or share model state with Model Checks.

Change Trace keeps its existing serialized operation-kind and route-field vocabulary for historical replay. New inline artifacts carry Check Pack snapshots, completed Results, Gate Reports, and Runtime transitions. Active APIs expose current Gate semantics while frozen historical fixtures remain byte-stable.

## Work and project control plane

Backlog is a generated intake view over persisted pending Change revisions; submission grants no semantic or execution authority. Runtime exposes one content-addressed triage projection and one bounded user/agent query with explicit readiness, supported estimates, overlap, freshness, frontier, fairness, and ordering reasons. Accepted User Standard preferences may influence protected deterministic triage ordering, but lower order is not Check failure and no model emits final rank. An authenticated user selects an exact revision to start Decision; selection grants no disposition. `codewiki.decision-attention-selection@2.0.0` binds that command to one actor-scoped idempotency key, exact Change revision, and the projection digest that already commits WorkState, triage Candidates, graph, protected config, and policy. Runtime then appends canonical `loop.attempt_started`; its operation ID is also the revision-bound job key. Pending Changes and generic triggers remain quiescent until selection. The authenticated coordinator exposes a bounded bootstrap query plus strict projection-bound follow-up queries. Pi agents may inspect this through read-only `wiki_attention`; users may browse with `/wiki-attention` and start one exact attempt only through `/wiki-select <change-id> --revision <revision-id> --projection <digest>`. No model-callable selection tool exists. Planning later decomposes approved Changes and owns Work Item execution ordering.

Change Trace Protocol `3.0.0` makes every revision a complete content-addressed semantic input rather than a skeletal issue summary and binds authority through accountable actor plus proof-backed authenticated identity. Revision identity binds current and desired state, rationale and alternatives, classification and affected targets, impact, Knowledge propagation, observable outcomes, delivery constraints, Evidence expectations, safety semantics, acceptance requirements, and any normalized defect profile. Missing assurance remains explicitly absent or unknown; intake claims never become risk or Check authority.

Decision Candidate schema `2.0.0` is materialized only from native `ProjectWorkState` plus the producer's strict disposition/rationale proposal. Runtime derives the current revision, active relationships and overlap accounting, WorkState/Knowledge/source/config/policy refs, and Candidate identity; callers cannot submit observed bases, validation state, authority, or append bindings. Native continuation admission reconstructs this exact Candidate before any canonical write. A host-configured native attempt executor now reloads fresh Git state, verifies an exact protected-source/config-bound Decision Gate binding before producer invocation, runs one versioned producer request and independent evaluation, commits Candidate through attempt end under expected-head CAS, and recovers canonical completion without reinvocation. `createDecisionGitAdmission()` supplies the production selection-side Git glue: fresh protected-config-bound triage projection, short-lived exact context reuse across authorization, expected-WorkState attempt append, no blind stale retry, and canonical post-push verification. `createPiSdkNativeDecisionCandidateProducer()` validates that exact authority-free production request, runs one isolated read-only Pi SDK session, accepts one strict proposal, and propagates cancellation through abort and disposal. `createPiNativeDecisionStartOptions()` composes those pieces for the Pi daemon when the host supplies trusted repository identity, project authority, replay policy, and Runtime continuation authority. Only approved project-local Pi coordinator connections resolve to hashed selection actors; optional project authorization can still deny them. Canonical terminal state recovers after daemon restart without a second model run. Missing mandatory trusted host inputs leave both Decision-attention projection and selection endpoints unavailable.

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

Project Runtime derives a compatible bounded job set from WorkState, admits exact lanes/Claims/capacity, invokes semantic sessions or workers, runs subject-bound Gates, and guards writes/effects. It allows unrelated authenticated selected Decision jobs and Work Item work concurrently while serializing overlapping selected scopes, one accepted Planning writer, overlapping paths, shared Integration targets, and external effects.

`WorkState` is a disposable projection over Change Traces, Knowledge, source/test ownership, source/tests/Git, configuration, delivery evidence, and bounded Runtime observations. JSONL is streamed and indexed in memory; process loss causes rebuild. No SQLite or graph database belongs to the current architecture.

## Workers, Integration, and effects

Planning creates worker-ready Work Items rather than the smallest possible tasks. Runtime selects `routine`, `standard`, or `complex` Implementation tier from structured facts; callers and workers cannot self-label work routine.

Runtime resolves each Assignment into one private digest-bound Workbench containing exact source, context, Loop Protocol, Pi Skills/tools, model route, selected Check Pack and Evidence inputs, isolation, budgets, and Worker Report contract. Only a matching canonical Claim activates it.

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

OKF provides portable Knowledge; CodeWiki adds software realization, exact authority, Change accountability, and Git/delivery proof. OKF validation, export, and consumption are owned by `src/knowledge/**` and exposed through the curated Runtime surface.

Target Knowledge support is OKF v0.2 with v0.1 fallback consumption, including `sources`, `generated`, `verified`, lifecycle/freshness metadata, meaningful concept types, unknown-field preservation, and inert Attested Computation definitions. Current executable source remains v0.1-only migration state.

Imported `generated`, `verified`, `status`, `stale_after`, provenance, or Attested Computation metadata never grants CodeWiki authority or Loop exit. Change Traces remain outside OKF.

## Relationship queries and improvement intake

WorkState and Alignment Graph queries are disposable views over canonical sources. Agents may use bounded read-only semantic queries that include snapshot digest, provenance, authority class, coverage, truncation, and staleness. No arbitrary Cypher, graph mutation, canonical graph file, or absence-as-proof under partial coverage.

CodeWiki has no separate project-learning, Feedback Bundle, or self-improvement subsystem. User feedback, benchmark regressions, CI/security findings, worker discoveries, delivery outcomes, and maintainer suggestions enter through normal bounded Change Intake. Improvement then follows the same authenticated selection, Decision, Planning, Implementation, Review, and release authority as any other Change. CodeWiki never uploads private project traces automatically.

After stabilization and explicit activation, an immutable released CodeWiki version may operate on this source repository from an isolated external controller to coordinate the next version. It must not load mutable workspace code or edit its installed package, and dogfood evidence cannot replace independent CI, packed external proof, benchmark oracles, human review, or release authorization.

## Target source layout

```text
src/
  index.ts
  pi-extension.ts        # neutral shipped Pi package bootstrap
  error-handling/        # lean shared error envelope and operation contract
  protocol/
    client-server.ts
    client-pairing.ts
  clients/
    app/
    cli/
    pi/
  server/                # authentication, pairing, sessions, transport, and routing
    app/
    authentication/
    pairing/
    sessions/
    registry/
    routing/
    delivery/
    channels/
    mcp/
  runtime/               # authoritative project mechanics and fixed lifecycle
    index.ts
    gateway.ts
    commands/
    admission/
    authorization/
    claims/
    coordinator/
    workbenches/
    workers/
    integration/
    lifecycle/
    persistence/
    synchronization/
    recovery/
    effects/
    queries/
  changes/
    intake/
    triage/
    review/
    trace/
  checks/                # Check contracts, Packs, execution coordination, and Results
  loops/
    decision/
    planning/
    implementation/
    review/
  evidence/
  work-state/
  alignment/
  knowledge/
  project/               # protected configuration, config errors, and architecture
  execution/
    ports.ts
    checks/              # admitted Code and Model Check adapters
    review/              # transitional language-review execution
    security/
    pi/
  preview/
  git/
  utils/

benchmarks/              # nonproduction paired harness and release measurement
scripts/
tests/
```

Exactly four semantic Loops—Decision, Planning, Implementation, and Review—own their stage Candidates, attempts, and interpretation under `src/loops/**`. Checks is a separate root owner for shared Check, Pack, execution-coordination, cache, Result, and current Gate machinery. Runtime owns authoritative persistence, synchronization, scheduling, Integration, recovery, guarded effects, and fixed lifecycle transitions under `src/runtime/lifecycle/**`; no generic Router chooses stages. CodeWiki Server owns authentication, pairing, sessions, transport, and routing without project authority. Server and Runtime are architectural siblings. Execution implements bounded neutral ports and concrete adapters without Loop policy or canonical authority. Pi-specific coordinator composition lives under `src/execution/pi/**`, concrete security execution lives under `src/execution/security/**`, and moved legacy language-review runners live temporarily under `src/execution/review/**` until Review Gates replace their direct callers. Neutral `src/pi-extension.ts` Package bootstrap composes Pi Client registration, Server App and Preview lifecycle, the Runtime connection boundary, and concrete Execution spawners. `src/runtime/index.ts` is the curated command, query, and gateway package surface; no `src/api/**` root exists. Shared error envelope, serialization, type guards, and operation-failure contracts remain in `src/error-handling/**`, while owner-specific configuration and Change Trace errors live with their semantic owners. Repository-root benchmarks compare supported execution adapters and never ship in the production package. Clean cuts keep no old-path re-exports.

Server Authentication proof verification lives under `src/server/authentication/**`, Actor enrollment and Registry persistence under `src/server/registry/**`, Client Pairing transitions under `src/server/pairing/**`, provider repository-access checks under `src/server/repository-access/**`, and temporary credential state and endpoint-policy context under `src/server/sessions/**`. Personal App launch verifies an ephemeral local proof, persists one local User, App Pairing, and exact project route in private machine-level Registry state, resolves that binding at current Registry generation, then opens the App Session. Provider-neutral OIDC verification accepts only bounded claims from a trusted adapter after adapter-owned authorization-code, PKCE, discovery, and token cryptography; Server binds exact Client, issuer, audience, nonce, time, and adapter before deriving immutable `(issuer, subject)` identity. Actor enrollment grants no Pairing, Session, repository membership, delegation, or Runtime authority. Public Pairing issue and revoke entrypoints require one active Server Session, verifier-proven target Authentication, exact Session/Registry generation, active Actor identity, and current project/repository/Runtime-route binding before deny-by-default policy sees the fixed action and target Client; policy never receives the Session credential. Direct deterministic Pairing transitions are internal and no longer root package exports. Pairing credential generation and rotation remain blocked until an approved machine credential-store contract can retain only the necessary secret boundary without project-file or deterministic-secret fallback. `codewiki.server-repository-access@1.0.0` separately binds that verified identity and the exact CodeWiki repository identity to short-lived provider `accessible | inaccessible` evidence. It stores no token, role, permission, capability, or Runtime grant. Concrete GitHub/GitLab network adapters remain pending. Browser App transport lives under `src/server/app/**`, bounded App/Change/configuration/Dev Log queries live under `src/runtime/queries/**`, and browser presentation lives under `src/clients/app/**`. App launch establishes a generation-bound Server Session through a same-origin endpoint, stores only an `HttpOnly; SameSite=Strict` cookie in the browser, and authorizes every App endpoint against the exact repository binding before dispatch. Bounded authenticated Actor and Client context crosses the Server-Runtime gateway on every Runtime projection and remains attached per event stream; credentials never enter App API query strings or browser storage. Server reaches Runtime only through `src/runtime/gateway.ts`; it does not import Runtime query, persistence, coordinator, Trace, Knowledge, or project-state implementations. The legacy `src/dashboard/**` source root is gone. Canonical Change Trace protocol, JSONL history, Change-backed storage, reduction, replay, synchronization support, retention, and owner-specific errors now live under `src/changes/trace/**`; Alignment projection and bounded queries live under `src/alignment/**`, with no legacy Trace source or test roots. Canonical current-state, blocker, conflict, quality-readiness, trace-goal, trace-board, work-plan, and work-queue projections now live under `src/work-state/**`; snapshot-bound status, resume, trace-queue, trigger, and runtime-board reads live under `src/runtime/queries/**`, with no generic View source or test root. Shared legacy quality graph, pack, profile, runner, and judge mechanics remain temporarily under `src/checks/quality/**`, while `src/loops/implementation/**` owns its quality feedback reducer. The active Check/Result/Gate kernel no longer depends on that machinery. Remaining Quality replacement, executable Review Gate persistence, and broad SDK Candidate cleanup are tracked in [`REFACTORING_PLAN.md`](REFACTORING_PLAN.md).

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

This remains useful for optional thin client. Current packed installs expose compatibility `/wiki-*` commands and `wiki_*` capabilities in disposable projects. Runtime must continue owning exact identity, source facts, routing, freshness, sequence/parent/byte guards, and append authority.

After installing different packed runtime, fully restart Pi rather than relying on module reload. Do not install CodeWiki globally or under this repository's `.pi/` directory during stabilization.

## Review evidence configuration (current migration)

Current executable source still supports legacy `.codewiki/config.json` `quality.review` evidence-pack settings while the Review Gate migration is pending. This compatibility surface is not the target Check architecture and grants no semantic authority.

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
- semantic replacement of legacy Decision, Planning, Implementation, and Review Gate contracts;
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
- [Runtime](.codewiki/kb/system/components/runtime.md)
- [Knowledge](.codewiki/kb/system/components/knowledge.md)
- [Lexicon](.codewiki/kb/lexicon.md)
- [Temporary refactoring plan](REFACTORING_PLAN.md)
