# CodeWiki

CodeWiki is an intent-to-production alignment runtime.

It turns accepted user intent into an accountable transition of project Knowledge and implementation, then permits exact Git and delivery state to advance only when required alignment evidence is complete, fresh, and authorized.

```text
(Kₜ, Gₜ, Pₜ) + ΔIntent
  ──CodeWiki──>
(Kₜ₊₁, Gₜ₊₁, Pₜ₊₁, Evidence)
```

Where `K` is accepted Knowledge, `G` is exact Git state, `P` is delivery state, and Evidence includes exact Check Results, Exit Reports, authority, Integration proof, and observations.

> **A Change is accountable intent and a durable dossier. Runtime owns generic portfolio control; Decision, Planning, and Implementation own Loop meaning.**

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

`buildVerificationCapabilityMatrix()` exposes executable `codewiki.verification-capability-matrix@2.0.0` truth for every Loop-qualified Check. Rows bind exact catalog/config identity, execution availability, Evidence obligations, collection gaps, and potential standard formats. Canonical Evidence material has native validation. All nine core interchange contracts now have bounded ingestion: SARIF 2.1, JUnit XML, LCOV, Cobertura, CycloneDX, SPDX, Pact, OpenAPI, and authenticated provider-check receipts. Playwright reports map through JUnit plus CodeWiki UI captures; axe findings map through SARIF instead of adding tool-native core schemas. Formats are Evidence-only and never grant Results.

`materializeStandardAdapterEvidence()` is the closed Runtime bridge from an accepted adapter receipt to canonical Evidence Records. It verifies the receipt and exact source snapshot, fixes producer identity, observed or verified authority ceiling, coverage, freshness, sensitivity, protocol/binding/receipt provenance, and creates immutable command/source record identities. `resolveStandardAdapterEvidenceObligation()` then accounts for exact accepted adapter protocols through normal declarative Evidence obligations. Complete failing tests remain ready Evidence for a Check to interpret; partial, unavailable, source-drifted, tampered, or wrong-protocol observations remain `indeterminate`. Neither bridge grants a Result.

`evaluateStandardEvidenceCheck()` provides closed deterministic interpretation profiles for exact complete Evidence: JUnit minimum-test, zero-failure/error, and maximum-skip policy, LCOV/Cobertura line/branch/function basis-point thresholds, SARIF blocked finding levels, authenticated provider accepted conclusions, and CycloneDX/SPDX/Pact/OpenAPI required-identity presence. It rejects permissive partial-coverage obligations, wrong adapter families, selector drift, and receipt/bundle mismatch. Output is a digest-bound Check observation—not a Result. SBOM identity presence does not prove security or license compliance; Pact/OpenAPI identity presence does not prove verification or conformance.

`createStandardEvidenceCheckExecutors()` installs exact adapter bundles as native boolean Code Check capabilities. Each capability must match one Catalog Check/version, own every declared obligation, bind its normalized selector through protected Resolved Exit Policy parameters, and match the exact Candidate source snapshot. Protocol `1.1.0` binds the receipt and bundle into execution identity and permits multiple independent Checks in one Loop to consume the same exact bundle. Loop Exit Runner `1.3.0` records each identical Evidence Record once, supplies its immutable identity to every applicable obligation, and rejects any same-id content conflict. Its single `onCheckMaterialized` boundary exposes each executed Result together with all newly produced Evidence Records, replacing separate Evidence/Result callbacks so trusted persistence can commit one atomic unit. Each Check still receives its own resolution and Runtime-created `pass | fail | indeterminate` Result; no acceptance transfers between Checks, and this creates no Evidence database. Report-bound result caching remains disabled. Check Catalog `10.0.0` retains required artifacts for standard external-command obligations. No unbound report or caller-selected selector can execute.

`ingestSarif21Evidence()` accepts only bounded SARIF 2.1 artifact bytes plus Runtime-owned exact tool, source snapshot, scanned-path, request, invocation, environment, configuration, optional advisory-database, and execution bindings. It emits compact `command_execution` and `source_observation` material, hashes raw bytes and finding messages, excludes unsafe locations, reports partial/unknown coverage, and never accepts subject, authority, Result, or verdict input. Shared bounded JSON admission now also rejects duplicate keys, excessive nesting, and excessive node counts.

`ingestJunitXmlEvidence()` accepts common JUnit XML roots only after Runtime binds exact runner, source snapshot, test selection, expected test count, request, invocation, environment, configuration, and execution identity. It rejects unsafe XML declarations and malformed syntax, hashes case/failure detail, preserves aggregate execution facts in bounded diagnostic refs, and emits only `command_execution` material. Failing tests are complete observations when the exact run completed; a separate CodeWiki Check derives `fail`. Missing tests, count drift, unsafe paths, truncation, cancellation, timeout, or unavailability cannot become complete Evidence.

`ingestLcovEvidence()` and `ingestCoberturaEvidence()` bind an exact source snapshot, coverage scope, required project-relative paths, tool, configuration, and execution before deriving line, branch, and function hit counts. They cross-check detailed measurements against declared totals, exclude unsafe locations and private symbol names, and emit only bounded `command_execution` and `source_observation` material. Missing required files, malformed or contradictory totals, excessive report scope, non-exit, or unavailable collection cannot become complete Evidence. A fully observed 20% coverage report is complete Evidence of 20% coverage—not a passing Result; CodeWiki applies any accepted threshold separately.

`ingestProviderCheckReceiptEvidence()` admits at most 64 KiB of strict canonical JSON from a trusted authenticated connector under Provider Check Receipt Adapter `2.0.0`. Runtime binds the digest-only receipt to an exact provider instance, repository, source snapshot, Git head, Check identity and configuration, authenticated identity and credential identity, adapter, request, environment, and retrieval execution. Duplicate keys, credentials, caller authority, drift, and contradictory state fail closed. Completed provider success or failure is complete observation; pending state is partial and unavailable retrieval is unknown. Provider conclusion remains a diagnostic fact inside authenticated-retrieval `command_execution` material. The adapter has a `verified` ceiling and never grants a CodeWiki Result, approval, Integration proof, or delivery effect. Provider networking, token handling, and webhook-signature verification remain trusted host connector responsibilities rather than core parser behavior.

`ingestCycloneDx17JsonEvidence()` and `ingestSpdx23JsonEvidence()` accept exact CycloneDX 1.7 JSON and SPDX 2.3 JSON inventories. They bind the artifact to source snapshot, scope, source paths, required identities, tool, configuration, and execution; retain bounded component/package/file/snippet/dependency/relationship/vulnerability/license counts; and expose only digest identities. Truncation, unresolved references, external SPDX documents, declared incomplete composition, missing required identities, timeout, cancellation, or unavailable collection remain partial or unknown. SBOM presence and vulnerability entries are inventory Evidence—not vulnerability, license-compliance, or security Results.

`ingestPactV4JsonEvidence()` treats Pact 4.0 files as consumer-provider contract content, not proof that provider verification passed. `ingestOpenApiEvidence()` accepts bounded OpenAPI 3.0.0–3.0.4 and 3.1.0–3.1.1 JSON or safe YAML, inventories paths, operations, callbacks, webhooks, schemas, and security schemes, and leaves external or dangling references partial. Contract names, interaction bodies, API paths, examples, URLs, and private values remain external artifact bytes represented only by digests. Pact verification still requires JUnit or authenticated provider-check Evidence; OpenAPI conformance still requires an applicable independent Check.

Initial Check catalog is closed. Default Checks are CodeWiki-provided and cannot be disabled. Users provide source-backed Standards; CodeWiki distills them into atomic Custom Model Checks or approved-template Custom Code Checks. Projects cannot inject arbitrary JavaScript, shell, prompts, tools, schemas, dependencies, or verdict logic. Custom Checks use `draft | active | disabled`; every applicable active Custom Check is required. Activation is deterministic and records `activatedBy`; learned activation and threshold changes are forbidden. Hard resource Code Checks may configure matching Runtime guards before exact usage Evidence yields a Result.

`codewiki.custom-check-evaluator@1.0.0` now binds every Custom Model Check request to the exact Candidate, Check/version/digest, accepted User Standard snapshot digests and selected passage text, Custom Check definition, protected source/config snapshot, prerequisite Results, considered Evidence, no-tool provider/model route, and evaluator configuration. Each request declares a fresh no-shared-state session. One response must echo the exact evaluator binding and prerequisite Result digests, then report bounded Evidence gaps, counterevidence, coverage, truncation, and repair targets. Decision Model Check request protocol `5.0.0` rejects mismatched identity, stale route/configuration replay, malformed or oversized repair, and missing fields. Evidence schema `1.4.0` records request and Assessment digests plus exact Custom Check evaluator bindings; Runtime alone atomically materializes that Evidence with its one Result.

`codewiki.decision.research-collection@1.0.0` wires required external research into native production Decision without moving networking or credentials into core Runtime. An explicitly configured trusted-host collector receives one exact Candidate-, collector-configuration-, sensitivity-, and limit-bound request. Runtime caps collection at 32 citations, 262,144 receipt bytes, and 30 seconds; validates exact request echo and status; owns observation time, freshness boundary, producer identity, coverage, authority, and Change-revision Evidence materialization; then invokes the isolated no-tool claim-support transport only after provenance passes. Partial, unavailable, malformed, timed-out, contradictory, or mixed-freshness collection remains `indeterminate`. Pi Native Decision Host `2.0.0` installs this composition, commits collected citations with the canonical continuation, and skips both collection and claim work when exact persisted Evidence and Assessment already replay. Caller-owned research freshness has no compatibility path.

Pi-Lens, LSP, compilers, linters, tests, browsers, AST tools, and Skills remain Workbench/repair capabilities. Their output is not automatically authoritative Check evidence. Classified or high-risk native Decision assurance activates a closed scanner suite before independent security challenge review. Runtime fixes exact source/tree/environment/configuration/advisory bindings and materializes observed Evidence; findings fail, while unavailable scanners or stale advisory data remain `indeterminate`. `createProductionSecurityCollector()` now provides fixed `codewiki.production-security-collector@2.0.0` profiles for Semgrep SARIF static analysis, Gitleaks directory SARIF secret detection, and offline Trivy filesystem/advisory SARIF. Each profile rechecks executable bytes before and after execution, probes the exact version, binds a Semgrep configuration, exact Gitleaks rules plus ignore policy, or a Trivy database digest, uses fixed structured no-shell arguments and a credential-free environment, caps output/time, sanitizes findings through the SARIF adapter, and returns unavailable or partial Evidence on drift, absence, cancellation, timeout, malformed output, or truncation. Gitleaks runs against the exact Candidate directory, emits SARIF to stdout, redacts secrets, disables archive and recursive decode scanning, and cannot consume ambient configuration. It exposes no arbitrary command, argument, network-update, or plugin contract and grants no Result. Scanner Suite `3.0.0` records exact scanner-family, request, and outcome provenance and closes its vocabulary at static analysis, dependency advisory, secret detection, infrastructure configuration, authorization testing, and migration testing. Check Catalog `10.0.0` activates corresponding protected atomic Checks as classified surfaces require them. `codewiki.atomic-security-scanner-check@2.0.0` filters one shared immutable suite substrate per family, resolves separate obligations, and lets Runtime create independent Results: a clean family may pass while another fails or remains `indeterminate`, without duplicate Evidence recording or scanner-owned authority.

For exact `high | critical` Decision risk, Check Catalog `10.0.0` additionally requires `security_independent_challenge_reviewed` and `security_residual_risk_authorized`. The second challenge runs through a distinct no-tool provider/model route and produces separate asserted Candidate-bound Evidence. Evidence schema `1.4.0` retains `1.3.0` approval scoping to one exact Check/version and approval purpose and adds exact model request/Assessment identity. Residual-risk approval requires a qualified security/risk role, an authenticated identity different from general Candidate approval, both complete supported challenge assessments from distinct producers/routes/configurations, exact Candidate risk, and digest-only rationale/finding bindings. Missing routes, disagreement, unavailable assessment, generic approval reuse, same-identity approval, or stale/wrong-Candidate Evidence remains `indeterminate`; models and scanners cannot accept risk.

Target `npm run benchmark:calibrate -- --kind security --file /sealed/security-calibration.json --gate` evaluates off-repository human-labeled scanner/evaluator route receipts under `codewiki.security-route-calibration@1.0.0`. Exact Scanner Suite `3.0.0` and atomic evaluator `2.0.0` identities, a complete pass/fail/unavailable matrix for all six scanner families, artifact/source/request/environment/configuration digests, scanner/evaluator identities, Evidence refs, latency, and cost are required. Reports keep false passes, false failures, escaped critical defects, `indeterminate`, latency, and cost separate per route. Any false pass, escaped critical defect, incomplete matrix, protocol drift, or score below the configured threshold blocks that route. This Lab report grants no Result, promotion, or Runtime authority; sealed execution remains pending real off-repository human cases and production scanner receipts.

## Work and project control plane

Backlog is a generated intake view over persisted pending Change revisions; submission grants no semantic or execution authority. Runtime exposes one content-addressed triage projection and one bounded user/agent query with explicit readiness, supported estimates, overlap, freshness, frontier, fairness, and ordering reasons. Accepted User Standard preferences may influence protected deterministic triage ordering, but lower order is not Check failure and no model emits final rank. An authenticated user selects an exact revision to start Decision; selection grants no disposition. `codewiki.decision-attention-selection@2.0.0` binds that command to one actor-scoped idempotency key, exact Change revision, and the projection digest that already commits WorkState, triage Candidates, graph, protected config, and policy. Runtime then appends canonical `loop.attempt_started`; its operation ID is also the revision-bound job key. Pending Changes and generic triggers remain quiescent until selection. The authenticated coordinator exposes a bounded bootstrap query plus strict projection-bound follow-up queries. Pi agents may inspect this through read-only `wiki_attention`; users may browse with `/wiki-attention` and start one exact attempt only through `/wiki-select <change-id> --revision <revision-id> --projection <digest>`. No model-callable selection tool exists. Planning later decomposes approved Changes and owns Work Item execution ordering.

Change Trace Protocol `3.0.0` makes every revision a complete content-addressed semantic input rather than a skeletal issue summary and binds authority through accountable actor plus proof-backed authenticated identity. Revision identity binds current and desired state, rationale and alternatives, classification and affected targets, impact, Knowledge propagation, observable outcomes, delivery constraints, Evidence expectations, safety semantics, acceptance requirements, and any normalized defect profile. Missing assurance remains explicitly absent or unknown; intake claims never become risk or Check authority.

Decision Candidate schema `2.0.0` is materialized only from native `ProjectWorkState` plus the producer's strict disposition/rationale proposal. Runtime derives the current revision, active relationships and overlap accounting, WorkState/Knowledge/source/config/policy refs, and Candidate identity; callers cannot submit observed bases, validation state, authority, or append bindings. Native continuation admission reconstructs this exact Candidate before any canonical write. A host-configured native attempt executor now reloads fresh Git state, verifies an exact protected-source/config-bound Loop Exit binding before producer invocation, runs one versioned producer request and independent evaluation, commits Candidate through attempt end under expected-head CAS, and recovers canonical completion without reinvocation. `createDecisionGitAdmission()` supplies the production selection-side Git glue: fresh protected-config-bound triage projection, short-lived exact context reuse across authorization, expected-WorkState attempt append, no blind stale retry, and canonical post-push verification. `createPiSdkNativeDecisionCandidateProducer()` validates that exact authority-free production request, runs one isolated read-only Pi SDK session, accepts one strict proposal, and propagates cancellation through abort and disposal. `createPiNativeDecisionStartOptions()` composes those pieces for the Pi daemon when the host supplies trusted repository identity, project authority, replay policy, and Runtime continuation authority. Only approved project-local Pi coordinator connections resolve to hashed selection actors; optional project authorization can still deny them. Canonical terminal state recovers after daemon restart without a second model run. Missing mandatory trusted host inputs leave both Decision-attention projection and selection endpoints unavailable.

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

Project Runtime derives a compatible bounded job set from WorkState, admits exact lanes/Claims/capacity, invokes semantic sessions or workers, runs candidate-bound exit, and guards writes/effects. It allows unrelated authenticated selected Decision jobs and Work Item work concurrently while serializing overlapping selected scopes, one accepted Planning writer, overlapping paths, shared Integration targets, and external effects.

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

OKF provides portable Knowledge; CodeWiki adds software realization, exact authority, Change accountability, and Git/delivery proof. OKF validation, export, and consumption are owned by `src/knowledge/**` and exposed through the curated Runtime surface.

Target Knowledge support is OKF v0.2 with v0.1 fallback consumption, including `sources`, `generated`, `verified`, lifecycle/freshness metadata, meaningful concept types, unknown-field preservation, and inert Attested Computation definitions. Current executable source remains v0.1-only migration state.

Imported `generated`, `verified`, `status`, `stale_after`, provenance, or Attested Computation metadata never grants CodeWiki authority or Loop exit. Change Traces remain outside OKF.

## Relationship queries and improvement intake

WorkState and Alignment Graph queries are disposable views over canonical sources. Agents may use bounded read-only semantic queries that include snapshot digest, provenance, authority class, coverage, truncation, and staleness. No arbitrary Cypher, graph mutation, canonical graph file, or absence-as-proof under partial coverage.

CodeWiki has no separate project-learning, Feedback Bundle, or self-improvement subsystem. User feedback, benchmark regressions, CI/security findings, worker discoveries, delivery outcomes, and maintainer suggestions enter through normal bounded Change Intake. Improvement then follows the same authenticated selection, Decision, Planning, Implementation, Verification, and release authority as any other Change. CodeWiki never uploads private project traces automatically.

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
  runtime/               # generic authoritative project mechanics only
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
    loop-exit/           # common Check invocation, Exit Report admission, and routing
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
  decision/              # all Decision semantics and attempt composition
  planning/              # all Planning semantics and attempt composition
  implementation/        # all Implementation semantics and attempt composition
  verification/          # shared Check / Result / Exit Report machinery
  evidence/
  work-state/
  alignment/
  knowledge/
  project/               # protected configuration, config errors, and architecture
  execution/
    ports.ts
    pi/
  preview/
  git/
  utils/

benchmarks/              # nonproduction paired harness and release measurement
scripts/
tests/
```

Decision, Planning, and Implementation own their Candidate schemas, Check declarations, attempt composition, and interpretation. Runtime Loop Exit owns bounded Verification invocation, exact output admission, authoritative routing, persistence, and effects through one common pipeline for all three Loops. CodeWiki Server owns authentication, pairing, sessions, transport, and routing without project authority. Server and Runtime are architectural siblings; Runtime owns generic scheduling, persistence, synchronization, claims, workbenches, workers, Integration, recovery, and effects, and it does not have parallel `decision`, `planning`, `implementation`, or `verification` packages. Verification is shared Check, Result, Exit Report, policy, and repair machinery—not a fourth Loop—and cannot import Runtime or Loop implementations. Clients own user interaction. Execution implements Runtime-selected neutral ports and owns no Loop policy or canonical authority; Runtime may import `src/execution/ports.ts` but never concrete Pi adapters. Pi-specific coordinator daemon composition therefore lives under `src/execution/pi/**`, while generic Runtime startup requires an injected spawner. Neutral `src/pi-extension.ts` Package bootstrap injects narrow dashboard and project-service ports into Pi Client registration, then composes Server App and Preview lifecycle, the Runtime connection boundary, and the concrete Execution spawner. Client modules import none of those process lifecycle implementations. `src/runtime/index.ts` is the curated command, query, and gateway package surface; no `src/api/**` root exists. Shared error envelope, serialization, type guards, and operation-failure contracts remain in a lean `src/error-handling/**` package, while owner-specific configuration and Change Trace errors live with their semantic owners. Repository-root benchmarks compare every real supported execution adapter alone with the same adapter under CodeWiki and do not ship in the production package; no `src/benchmarks/**` production root exists. Clean cuts keep no old-path re-exports.

Server Authentication proof verification lives under `src/server/authentication/**`, Actor enrollment and Registry persistence under `src/server/registry/**`, Client Pairing transitions under `src/server/pairing/**`, provider repository-access checks under `src/server/repository-access/**`, and temporary credential state and endpoint-policy context under `src/server/sessions/**`. Personal App launch verifies an ephemeral local proof, persists one local User, App Pairing, and exact project route in private machine-level Registry state, resolves that binding at current Registry generation, then opens the App Session. Provider-neutral OIDC verification accepts only bounded claims from a trusted adapter after adapter-owned authorization-code, PKCE, discovery, and token cryptography; Server binds exact Client, issuer, audience, nonce, time, and adapter before deriving immutable `(issuer, subject)` identity. Actor enrollment grants no Pairing, Session, repository membership, delegation, or Runtime authority. Public Pairing issue and revoke entrypoints require one active Server Session, verifier-proven target Authentication, exact Session/Registry generation, active Actor identity, and current project/repository/Runtime-route binding before deny-by-default policy sees the fixed action and target Client; policy never receives the Session credential. Direct deterministic Pairing transitions are internal and no longer root package exports. Pairing credential generation and rotation remain blocked until an approved machine credential-store contract can retain only the necessary secret boundary without project-file or deterministic-secret fallback. `codewiki.server-repository-access@1.0.0` separately binds that verified identity and the exact CodeWiki repository identity to short-lived provider `accessible | inaccessible` evidence. It stores no token, role, permission, capability, or Runtime grant. Concrete GitHub/GitLab network adapters remain pending. Browser App transport lives under `src/server/app/**`, bounded App/Change/configuration/Dev Log queries live under `src/runtime/queries/**`, and browser presentation lives under `src/clients/app/**`. App launch establishes a generation-bound Server Session through a same-origin endpoint, stores only an `HttpOnly; SameSite=Strict` cookie in the browser, and authorizes every App endpoint against the exact repository binding before dispatch. Bounded authenticated Actor and Client context crosses the Server-Runtime gateway on every Runtime projection and remains attached per event stream; credentials never enter App API query strings or browser storage. Server reaches Runtime only through `src/runtime/gateway.ts`; it does not import Runtime query, persistence, coordinator, Trace, Knowledge, or project-state implementations. The legacy `src/dashboard/**` source root is gone. Canonical Change Trace protocol, JSONL history, Change-backed storage, reduction, replay, synchronization support, retention, and owner-specific errors now live under `src/changes/trace/**`; Alignment projection and bounded queries live under `src/alignment/**`, with no legacy Trace source or test roots. Canonical current-state, blocker, conflict, quality-readiness, trace-goal, trace-board, work-plan, and work-queue projections now live under `src/work-state/**`; snapshot-bound status, resume, trace-queue, trigger, and runtime-board reads live under `src/runtime/queries/**`, with no generic View source or test root. Shared quality graph, pack, profile, runner, judge, and evaluator mechanics now live under `src/verification/quality/**`, while Implementation owns its quality feedback reducer; no generic Loop source or test root or root semantic-Loop module survives. Internal query reduction still depends on transitional Verification-owned `LoopQuality*` contracts, Loop-named Runtime modules, Decision/Planning/Implementation Quality machinery, broad SDK candidate schema, and legacy projection-field vocabulary as executable migration state. Ordered migration and exact deletion map live in [`REFACTORING_PLAN.md`](REFACTORING_PLAN.md).

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

- [Maintainer intent](.codewiki/kb/product/stories/maintainer/maintain-intent.md)
- [Design system](.codewiki/kb/product/DESIGN.md)
- [System architecture](.codewiki/kb/system/diagrams/architecture.yaml)
- [Alignment](.codewiki/kb/system/components/alignment.md)
- [Verification](.codewiki/kb/system/components/verification.md)
- [Runtime](.codewiki/kb/system/components/runtime.md)
- [Knowledge](.codewiki/kb/system/components/knowledge.md)
- [Lexicon](.codewiki/kb/lexicon.md)
- [Temporary refactoring plan](REFACTORING_PLAN.md)
