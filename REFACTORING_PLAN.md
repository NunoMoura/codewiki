# CodeWiki Refactoring Plan

## Purpose

This temporary document tracks executable drift from accepted `.codewiki/kb/**` architecture. CodeWiki does not load or dogfood its Pi extension in this source checkout. Knowledge is intended design truth; source and tests are executable truth; Git is checkpoint evidence. Delete this file when remaining completion conditions pass.

## Ratified architecture

CodeWiki is the product. One CodeWiki process may host several Project Servers. Each Project Server is the sole authority for one governed project and owns one subordinate Runtime.

```text
CodeWiki
|
+-- Clients
|   +-- App
|   +-- CLI
|   +-- optional Pi integration
|   +-- External Agent Clients through MCP
|
+-- Project Server A
|   +-- transport
|   +-- AuthN
|   +-- project AuthZ
|   +-- canonical project state
|   +-- Decision, Planning, Implementation, Review
|   +-- Checks and Gates
|   +-- Implementation Workbenches
|   +-- transitions and guarded effects
|   +-- recovery
|   `-- Runtime
|       +-- Run Requests
|       +-- Runs
|       +-- Run Processes
|       +-- Runtime Builds
|       +-- Run Receipts
|       +-- Code and Model Check execution
|       `-- temporary Pi executor migration debt
|
`-- Project Server B
    `-- Runtime
```

A shared listener may accept connections and locate the named Project Server, but it is transport plumbing rather than a semantic Gateway. AuthN remains an internal Project Server component. Pairing enrolls a Client installation, Client Session identifies one temporary authenticated connection, and project AuthZ determines whether the Actor may perform one exact operation.

Project Server owns project meaning and authority. Runtime owns bounded execution mechanics only. Project Server constructs one immutable Run Request and validates the returned Run Receipt before admitting output. Runtime cannot create Check Results, reduce Gates, advance stages, mutate canonical state, own Workbench custody, or perform guarded effects.

```text
Client
  -> Project Server transport
  -> AuthN
  -> project AuthZ
  -> command or query
  -> optional Run Request
  -> Runtime
  -> Run Process
  -> optional CodeWiki DSH Adapter
  -> DSH Agent + AgentLoop + Agent Session
  -> Runtime creates Run Receipt
  -> Project Server admits output, runs Gate, and applies fixed transition
```

Exactly four semantic Stage Loops exist: Decision, Planning, Implementation, and Review. A Stage Loop may issue several Runs across attempts. Each model-driven producer, Implementation Worker, Review producer, and Model Check uses an isolated DSH Agent Session. DSH AgentLoop owns model/tool continuation inside one Run; it never owns a Stage Loop.

## Canonical vocabulary

| Term | Meaning |
| --- | --- |
| CodeWiki | Complete product |
| Project Server | One project's authoritative long-lived owner, including transport, AuthN, AuthZ, canonical state, lifecycle, Workbenches, and subordinate Runtime |
| Runtime | Project Server-owned bounded execution subsystem |
| Run Request | Immutable execution request from Project Server to Runtime |
| Run | One bounded execution attempt |
| Run Process | OS process controlled by Runtime for one Run |
| Run Sandbox | Enforced containment boundary; ordinary child processes are not mislabeled as sandboxes |
| Runtime Build | Immutable content-addressed CodeWiki DSH Adapter and execution closure |
| Workbench | Implementation-only repository and command environment for one Assignment |
| Run Receipt | CodeWiki-authored durable account of one Run |
| DSH Adapter | CodeWiki translation between Run Request and upstream DSH APIs |
| DSH AgentLoop | Upstream model/tool continuation mechanism |
| DSH Agent Session | Isolated DSH conversation and event state for one model-driven Run |

`Thread` is not a CodeWiki concept. Bare `Session` is avoided: use Client Session or DSH Agent Session. Runtime is the only unqualified CodeWiki architectural Runtime; upstream runtime API names remain DSH-qualified implementation details.

Custody classes remain the serialized values `backend-owned`, `backend-delegated`, and `external-client`. They describe proof scope, not a separate product component.

## Fixed lifecycle and authority

```text
Decision approve passed + authorized exact-Candidate confirmation -> Planning
Decision reject | defer | withdraw passed + confirmation          -> terminal/deferred state
Decision failed                                                   -> Decision
Planning passed                                                   -> Implementation
Planning failed                                                   -> Planning
Implementation passed                                             -> Review
Implementation failed                                             -> Implementation
Review passed                                                     -> separately guarded delivery
Review failed                                                     -> Implementation
Any Gate stopped                                                  -> preserve state and stop attempt
```

Checks judge immutable stage subjects. Completed Check Results are only `passed` or `failed`. Operational inability produces a stopped Check Run and Gate without fabricating a Result. Pack Skills guide producers but never judge output or grant authority. Candidate, receipt, branch, commit, author, trailer, note, model, Run Process, and delegated harness claims cannot self-grant authority.

Git owns content-addressed artifact history. Project Server governs semantic transitions. Change Trace records authority operations, Execution Ledger records controlled Run provenance, and Git records artifact history. Accepted transitions must identify prior state, proposal, custody, exact judged subject, Checks and Evidence, authority, effects, and resulting state.

## Runtime and DSH end goal

DSH is an exact pinned upstream package dependency, not copied source and not a CodeWiki fork. CodeWiki owns the DSH Adapter and Runtime composition. Production uses DSH's standard Agent, AgentLoop, Agent Session, streaming, tool pairing, cancellation, quiescence, compaction mechanics, provider transport, and delegated child-process plumbing.

CodeWiki owns exact prompts, Skills, tools, Stage Context, model route, budgets, compaction policy, Runtime Plugins, observations, ledgers, receipts, process isolation, and all project authority. Production disables ambient DSH profiles, settings, patches, filesystem Skills, workspace instructions, dynamic Cordis, creation mode, DSH UI and Host API, product MCP client, and DSH workflow/goal/task drivers.

Every Runtime Build binds:

- Run protocol and Node version
- reviewed DSH source commit
- executed DSH and Cordis package closure digests
- CodeWiki DSH Adapter and Runtime Plugin closure
- model and delegate adapter closure
- exact executable artifact bytes
- qualification suite and Evidence digests

Reviewed source commit and executed npm closure remain independent provenance facts unless upstream attestation proves equivalence. Expected-generation compare-and-swap activates one qualified build for new Runs. Existing Runs and resumable DSH Agent Sessions remain bound to their original build. Rollback changes only future Runs. No user-facing version selector or Pi fallback survives.

Current Runtime Build storage expects one exact `runtime.mjs`. Real DSH composition must prove that artifact is self-contained. If DSH requires runtime assets or dynamic modules, the artifact model changes to a canonical sealed archive or directory with an exact tree digest before production activation. Ambient `node_modules` cannot become an unrecorded fallback.

## Source topology

```text
src/
  index.ts
  pi-extension.ts                  # optional Pi Client integration
  alignment/
  changes/
    intake/
    trace/
    triage/
  checks/
    packs/
    quality/
  clients/
    app/
    cli/
    pi/
  error-handling/
  evidence/
  git/
  knowledge/
  loops/
    decision/
    implementation/
    planning/
    review/
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
  runtime/
    index.ts
    contracts.ts
    runtime.ts
    builds/
    checks/
    context/
    dsh/
    evidence/
    persistence/
    pi/                            # temporary migration evidence
    processes/
    receipts/
    review/                        # temporary legacy review execution
    security/
  utils/
  work-state/

benchmarks/
scripts/
tests/
```

Target dependency direction:

```text
Clients              -> protocol + curated Project Server API
Project Server       -> Stage Loops + Checks + domain owners + Runtime contracts
Runtime              -> Run contracts + concrete process/build/DSH/check adapters
Stage Loops          -> domain contracts, never Project Server implementations
Checks               -> Evidence + Project configuration + Runtime contracts
Run Process          -> Run Request + bounded capabilities, never Project Server state
DSH Adapter          -> Runtime contracts + exact DSH/Cordis packages
```

Temporary `src/runtime/pi/**` may import Project Server adapters only as migration debt. New Runtime process, build, DSH, and Check code may not import Project Server implementations. Workbenches remain under Project Server because they are Implementation custody, not general Runtime environments.

Public package surfaces:

```text
@nunomoura/codewiki                 broad product API
@nunomoura/codewiki/project-server  bounded Project Server API
@nunomoura/codewiki/runtime         Runtime contracts and composition
@nunomoura/codewiki/pi-sdk          temporary Pi execution SDK
```

No compatibility exports preserve former `src/server/**`, `src/execution/**`, or Project Server-at-`./runtime` paths.

## Remaining implementation slices

- [x] Merge transport, AuthN, pairing, Client Sessions, registry, project control, lifecycle, Workbenches, and effects under Project Server ownership.
- [x] Move bounded execution, Check transports, Pi migration adapters, review execution, Runtime Builds, process protocol, and process management under Runtime.
- [x] Rename Run Request, Run, Run Process, Runtime Build, and Run Receipt contracts without aliases.
- [x] Persist qualified Runtime Builds and active pointer through expected-generation compare-and-swap.
- [x] Implement authenticated isolated Node Run Process management and Runtime logical lifecycle control.
- [x] Build repository-owned production DSH Adapter and exact reproducible Runtime Build closure.
- [x] Establish auditable reviewed-source versus executed-package provenance.
- [ ] Qualify Decision, Planning, Implementation, Review, tool-free Model Check, delegated harness, cancellation, compaction, crash recovery, hostile ambient configuration, and two-build rollback scenarios.
- [ ] Complete state-aware compaction; durable Execution Ledger storage, raw-log retention, and exact Stage Context contracts are implemented.
- [x] Implement durable Run Receipt persistence and receipt-commit compare-and-swap.
- [ ] Implement stage-oriented MCP tools; immutable bounded declarative Stage Context queries and fixed native DSH direct/batch query tools are implemented.
- [ ] Split native Decision execution into recoverable Candidate production, Gate execution, feedback, confirmation, and lifecycle commit.
- [ ] Implement Check Author SDK, Outcome Diagnostics, and npm/Git/local Pack transport.
- [ ] Prove DSH parity, then delete `src/runtime/pi/**` without selector or fallback.
- [ ] Replace or delete temporary legacy `src/runtime/review/**` once Review and Check parity is complete.

## Completion conditions

- Knowledge, source, tests, package exports, and diagrams use one vocabulary and ownership model.
- Every accepted transition remains replayable from canonical state and exact receipts.
- Runtime has no project authority and Project Server imports no concrete DSH, Cordis, delegate, or Pi implementation.
- Every model-driven Run uses one exact qualified Runtime Build and isolated DSH Agent Session.
- Every Code Check runs only in an admitted deterministic sandbox.
- Missing capability, stale state, invalid output, unavailable execution, exhausted budget, or incomplete receipt fails closed.
- Pi execution is deleted after DSH parity.
- Full tests, typecheck, build, package smoke, external disposable-project gates, diagnostics, and audit pass.
