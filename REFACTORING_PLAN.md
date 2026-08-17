# CodeWiki Refactoring Plan

## Purpose

This temporary document tracks executable drift from accepted `.codewiki/kb/**` architecture. CodeWiki Runtime is not active in this source checkout. Source and tests are executable truth; Git records checkpoints. Delete this file when completion conditions pass.

## Ratified target

CodeWiki is a standalone local-first intent-to-production application:

```text
Users and services
        |
Standalone App | CLI | optional Agent-product Clients | channels
        |
CodeWiki Client-Server Protocol and reserved MCP binding
        |
Standalone CodeWiki Backend
        |
CodeWiki Server | one authoritative Project Runtime per governed project
Authentication | Authority | Provenance | Stage Context | Fixed Lifecycle | Gates | Effects
        |
Decision | Planning | Implementation | Review
        |
Stage Producers | Implementation Workers | Checks
        |
Agent Supervisor -> isolated DSH Agent Runners -> optional Claude/Codex/ACP delegates
External Agent Clients -> MCP -> Server
        |
Runtime-owned Workbenches | WorkState | Knowledge | Alignment | Change Trace | Git | Evidence | Results
```

CodeWiki is a standalone software-evolution Backend that may run as a local daemon or hosted service. It runs behind the project rather than inside another Agent product. One logical CodeWiki Server serves a deployment and routes many Clients to one authoritative Runtime per governed project. Server and Runtime are architectural siblings that may share a process or machine; co-location grants neither ownership over the other. Server owns connection trust, transport, pairing, sessions, project routing, MCP binding, transport deduplication, reconnect, redaction, and delivery. Runtime owns project AuthZ, semantic idempotency, canonical meaning, Stage Context admission, producer attempts, provenance, persistence, scheduling, Integration, fixed lifecycle, Gate admission, and effects. Checks is a root domain owning Check Pack files, optional Pack Skill snapshots, the Check Author SDK contract, bounded Code and Model Check execution, completed Results, caching, fail-fast reduction, and Gate Reports. Four Stage Loops own Decision, Planning, Implementation, and Review semantics. WorkState, Knowledge, Alignment, repository, Change, Evidence, and Result owners supply immutable Stage Context; no duplicate context graph or store is introduced. Server calls one narrow Runtime gateway and never reads Runtime persistence internals. Agent Supervisor and isolated DSH Agent Runners implement neutral Execution Ports without receiving canonical storage authority.

A User is a human. An Actor is an accountable authenticated User or service. A User Interface is a human-facing surface implemented by a Client. A Client is software that speaks CodeWiki protocol. A Stage Producer creates a Decision, Planning, Implementation, or Review Candidate without owning Gate judgment or transition authority. Worker means only Implementation Worker: an Agent, process, or service executing one accepted Work Item through one bounded Assignment in one Runtime-owned Workbench. A Backend Agent Run uses DSH's native Turn Loop under exact CodeWiki composition. A Delegated Agent Run is launched by Backend Execution through Claude Code, Codex, ACP, or another delegate adapter while declaring unknown child internals. An External Agent Client owns its pipeline and calls CodeWiki through MCP. A Model Provider supplies local or remote inference and is distinct from producer, Worker, Check executor, Client, Agent Runner, and delegate. Worker Node remains deferred until physical placement, capacity, health, or draining becomes first-class.

Authentication proves the identity connecting now. Pairing enrolls one Client installation for one Actor. Session represents one temporary authenticated connection. Runtime Authorization determines whether the Actor may perform one exact project operation. Pairing, Client kind, repository access, job title, profile, model, and Worker ownership grant no project authority. Personal loopback mode uses local pairing. Team mode uses provider-neutral OIDC with GitHub or GitLab OAuth as first adapters and stable `(issuer, subject)` identity. Repository access supplies coarse membership only. CodeWiki adds no password system; hosted identity services remain optional future adapters.

Collaboration follows one rule:

```text
Actor Profile    -> likely fit
Authority Grant  -> may decide within exact scope
Claim            -> currently responsible
Operation        -> proves who performed the exact action
```

Contribution Routing is a read-only Alignment projection over exact Change revision, responsibility rules, Profiles, Grants, Claims, availability, and Worker Offers. It suggests eligible reviewers, contributors, and Implementation Workers with reasons, coverage, unknowns, and staleness; initial assignment remains explicit. Mutable reviewer, contributor, stage-producer, Implementation Worker, and machine allocation stays outside immutable Change meaning. Review progresses through exact Review Requirement, Review Claim, and immutable Review Submission. Archive follows an explicit `approve | request_revision | defer | reject` disposition and never substitutes for it.

One versioned Client-Server command/query/operation/event protocol serves every binding. MCP `2026-07-28` is preferred for External Agent Clients where supported; it is an inbound participation surface, not Backend outbound delegation. MCP may use “host” for its normative protocol role, but that role is not CodeWiki Backend, Agent Supervisor, or Agent Runner. CLI remains deterministic human, scripting, and high-authority confirmation access. Request context separates accountable Actor identity from Client kind/instance and explicit delegation. Standalone CodeWiki packages one exact pinned DSH composition inside isolated Agent Runners. The optional Pi extension is an ordinary external Client Integration, not the product host or Agent engine.

Every observed Git state receives positive provenance accounting:

```text
exact Runtime Candidate + stage-appropriate custody
  -> controlled provenance
  -> backend-owned when complete DSH input/query/execution receipt exists
  -> backend-delegated when exact dispatch, process, Workbench, artifacts, and custody gaps exist
  -> external-client only for exact authenticated CodeWiki operations
  -> Workbench custody additionally required for Implementation

no exact custody match
  -> external provenance
  -> immutable External Candidate Capture
  -> exact accepted-Change admission or Change Intake
  -> fresh Implementation and Review Gates before delivery
```

Git remains the content-addressed artifact-history owner; CodeWiki governs semantic transitions between project states. Stage Gates judge immutable stage subjects, which may include a commit or tree but are never inferred from a commit alone. Branch names, commits, authors, trailers, Git notes, and producer claims cannot prove provenance. External work may be useful and certifiable, but inherits no execution proof. Divergence pauses guarded effects and is never silently adopted, overwritten, discarded, or certified. CodeWiki targets accountability closure for accepted transitions rather than surveillance of every incidental Agent or repository interaction.

### Ratified Checks, Gates, and Stage Loops

Checks, Changes, and Stage Loops are peer root domains. A Change carries one proposed transition from accepted state `S0` to intended state `S1`. Exactly four semantic Stage Loops exist: Decision, Planning, Implementation, and Review. A passed Decision Gate certifies one exact Candidate but accepts no meaning by itself; an authorized Actor must confirm the unchanged Candidate and Gate digest against current WorkState before Runtime applies `approve | reject | defer | withdraw`, and only confirmed `approve` advances to Planning. Passed Planning advances to Implementation; passed Implementation advances to Review; passed Review permits guarded delivery; Decision, Planning, and Implementation failure repeats the same Stage Loop; Review failure returns to Implementation; any stopped Gate preserves current state and stops that automation attempt. No generic Router, Loop Exit subsystem, or separate shared Verification component survives.

Active Pack content is direct user-editable source under `.codewiki/check-packs/<stage>/<pack>/`. Every Check remains a direct `<check-id>/` directory containing `check.json` and exactly one `CHECK.md` or `CHECK.mjs`. A Pack may additionally contain one optional standard Agent Skill under `skill/<skill-name>/`; there is no extra `checks/` level or required local Pack manifest. Bootstrap materializes one deliberately bare-bones empty `default/` Pack per stage once. Defaults are examples, not protected floors. Users may edit or delete any Pack, Skill, or Check; CodeWiki never restores them automatically. Zero Checks passes with a visible non-blocking `no_checks_configured` warning even when a Skill exists. Malformed content or unavailable execution stops only the affected stage operation and never crashes CodeWiki.

Pack Skills shape producer behavior but never judge output. Runtime supplies exact stage Skills in stable Pack-ID order only to work-producing Agents, and their complete immutable digests bind producer attempts and receipts. Ambient Agent Runner and delegated-product Skills remain disabled for Backend-owned production. A delegated route is eligible for a Pack Skill only when its adapter binds and receipts the exact supplied bytes. Skill scripts and setup guidance may use only tools and capabilities already admitted for the stage attempt or Implementation Assignment; `allowed-tools` cannot add authority. Code and Model Check executors never inherit Pack Skills, resources, tools, context, or memory. Skill identity remains separate from Check Pack and Result cache identity.

Every present registered Check gates its stage. A Check defines one pass condition, one fail condition, one stable failure code, and one feedback contract. Code and Model are the only Check implementation kinds. Binary and quantitative are the measurement kinds; a quantitative threshold deterministically reduces to pass or fail. Completed Results are only `passed | failed`. Timeout, invalid output, unavailable sandbox or model, exhausted budget, cancellation, failed input collection, incomplete snapshot query, or unrecoverable staleness creates a stopped Check Run and Gate, not an indeterminate Result or semantic failure. Failed Results send exact feedback to the responsible Stage Loop; stopped runs send operational recovery to the User.

The Check SDK has two composition layers: Probes gather bounded snapshot-bound facts without deciding pass or fail, and Checks evaluate facts as binary or quantitative judgments. Author source may import pure libraries, Probes, and Checks normally and bundle that complete closure into one readable self-contained `CHECK.mjs`. The top-level Check registered beside `check.json` is the only Result, cache, retry, failure-code, feedback, and Gate boundary. Composed Checks inherit its context, limits, and cancellation and create no independent platform Result. Installed Checks never invoke another installed Check by Pack identity.

Code Checks receive one reserved read-only SDK binding over declared OKF Knowledge, repository, code, tests, local revisions and commits, exact pull-request Evidence, Change state, and Alignment facts. Queries support horizontal inspection and vertical traversal from Knowledge through source ownership, tests, revisions, accepted work, Evidence, and Results. Every page binds query and complete snapshot digests, source references, deterministic ordering, provenance, coverage, unknowns, truncation, cursor position, query-engine identity, and staleness. Checks takes one immutable snapshot of exact stage subject, Check Pack, input, Evidence, configuration, and execution identities, resolves exact cache hits, runs remaining Code Checks in bounded parallel, stops before Model Checks when Code fails or stops, otherwise runs Model Checks in bounded parallel, and stops launching queued work after a conclusive failure or stop condition. Model Checks remain tool-free and separate from producer and Implementation Worker models. Code Checks run only in admitted sandboxes, and their query activity remains Skill-free Result provenance rather than producer-session context or cache identity.

CodeWiki never autonomously authors Skill or Check content. After one-time bootstrap, Pack changes occur only through direct project-file edits or explicit authenticated App actions. Users may edit files manually, through a user-controlled external Agent following public schemas, or through App forms. Check Authors keep source, tests, fixtures, and dependencies in their own package or repository; only `check.json` and self-contained `CHECK.mjs` enter the active Pack. The App edits standard Pack Skills, creates Model Checks from structured fields, accepts one-file Code Check uploads, previews Checks, and installs marketplace Packs.

Check Pack transport uses ordinary npm, Git, and local package-source ergonomics without admitting Backend Plugins, DSH or Cordis plugins, product prompts, themes, settings, or hooks. Npm discovery uses the `codewiki-check-pack` keyword, and exact npm versions, Git revisions, or local package paths expose a `codewiki.checkPacks` manifest or conventional `check-packs/` directories. `package.json` is transport metadata and never replaces `check.json`. Package sources are transport only: no lifecycle scripts, Skill code, or Check code execute during install; resolved source, integrity, separate Skill and Check base digests, complete package digest, and local divergence are recorded; only declared Skill and runtime Check files are vendored; updates never overwrite local changes silently.

Review is a separate Stage Loop with its own stage Packs because exact-head delivery standards and the Implementation-to-Review feedback cycle are distinct. Human Review Evidence is optional. Projects may rely entirely on independent Code and Model Checks, require authenticated human Review through their own Check, or combine both. A fully automated delivery still requires prior User-configured authority plus a passed fresh Review Gate.

Post-Gate Outcome Diagnostics may analyze bounded repeated outcomes and propose exact changes to Skills, Checks, Stage Context APIs, model routes, budgets, or configuration. They never repair the current Candidate, reinterpret a Result, mutate project files, or receive privileged self-evolution authority. Every suggestion is ordinary Change Intake Material and traverses the same four-stage lifecycle.

CodeWiki extensibility has four non-overlapping surfaces. First-party Backend Plugins contribute narrow Agent Runner capabilities such as tools, context bindings, Pack Skill providers, model or delegate adapters, observers, and compaction policy; raw Cordis context and canonical Runtime state remain inaccessible. Check Packs are project-owned policy and guidance files, not executable Backend plugins. Core Adapters implement trusted repository, Workbench, persistence, transport, authentication, and delivery ports. Client Integrations speak CodeWiki protocol. Runtime's authority kernel remains plugin-free, and v1 permits no project-installed or third-party Backend Plugin.

The DSH capability disposition in Knowledge is normative for implementation: adopt scoped lifecycle, Agent registry, standard Turn Loop, append-only Session log, request-reconstruction invariants, prompt/tool assembly, LLM transport, persistence, and subagent mechanics; wrap Skills, compaction, Code Mode, telemetry, and execution storage under CodeWiki contracts; use Claude Code, Codex, and ACP only as custody-limited delegated adapters; and disable ambient profiles, user patches, workspace instructions, filesystem Skills, HMR, dynamic Cordis, creation mode, DSH product UI and Host API, product MCP client, workflows, Ralph, goals, plan mode, model-facing jobs, and local approval/settings authority in production.

### Ratified context, session, and compaction boundary

Architecture evidence was pinned through static source review of Prime Intellect `prime-agent` `0.7.2` at `97b994c3d7c45ca1ae635190e91e9e58ddf2577c` and DeepSeek Harness `0.1.0-rc.5` at `47f943859bef60e4160492346772ded9b24f765a`; their upstream suites were not run. Prime remains a reference. DSH is the selected Agent Runner engine but never CodeWiki authority, and its compatibility-breaking preview status requires an exact package/commit closure plus CodeWiki conformance on every upgrade. Prime demonstrates cumulative structured summaries, safe recent-tail retention, turn-boundary scheduling, file-operation tracking, and compaction-surviving executable scratch, but its best-effort `dill` kernel snapshots and Worker OS authority are unsuitable as canonical state. DSH supplies strict separation between append-only raw events and replaceable model surface, request reconstruction, source-linked compaction events, deterministic tool-result pruning before summarization, scoped Agent composition, replaceable Turn Loop mechanics, fresh programmatic Code Mode, and named native or delegated subagents; its worker-thread and VM containment are explicitly not security boundaries.

CodeWiki therefore separates three concerns:

1. Canonical project truth remains in Change Trace, WorkState, Knowledge, Alignment, repository snapshots, Evidence, Results, and configuration.
2. Exact Backend-owned execution history remains in an append-only bounded ledger binding every CodeWiki-controlled model-visible prompt, Skill, tool schema, model route, context snapshot, query request and response digest, compaction replacement, budget, usage, output, raw DSH event-log identity, and isolation fact.
3. The model-facing session surface may be deterministically pruned and lossily compacted, but each checkpoint cites exact replaced ledger ranges, keeps a recent tail, and rehydrates canonical stage facts from their owners.

Decision, Planning, Review, each Implementation Assignment, and each Model Check use isolated sessions. User-facing continuity comes from WorkState and immutable operation identities, not one giant transcript. Exactly one compaction owner operates per session. CodeWiki supplies one state-aware compaction Backend Plugin over DSH's append-only Session events, deterministic tool-result pruning, source-linked surface replacements, cancellation, and request-reconstruction invariants; it rehydrates canonical facts without running a competing scheduler.

Backend Agent Stage Context starts with a compact immutable baseline and expands through typed direct or declarative batch queries. Optional `codewiki_context_run` ships only if benchmarks show material benefit; every run is fresh, read-only, snapshot-bound, import-free, filesystem-free, network-free, process-free, environment-free, credential-free, bounded, cancellable, ledgered, and canonical-JSON-only. Optional cross-call scratch may later use bounded canonical JSON with compare-and-swap, but no persistent Python/V8 heap, provider memory, or summary becomes canonical state.

Backend-owned custody covers every CodeWiki-controlled session input and query. Backend-delegated custody covers exact task dispatch, adapter and configuration policy, process lifecycle, admitted Workbench and artifacts, final output, and declared unknown child internals. External-client custody covers only authenticated CodeWiki operations and admitted Candidate or Workbench state. No Backend Plugin, raw Cordis plugin, delegated harness, External Agent Client, or model-authored workflow may replace authentication, CAS, lifecycle transitions, Gate semantics, provenance, or fixed Runtime invariants.

## Target source topology

The tree below names responsibilities, not permission to create empty directories:

```text
src/
  index.ts
  main.ts                # primary standalone CodeWiki Backend bootstrap
  pi-extension.ts        # optional external Pi Client Integration
  error-handling/        # shared envelope and operation-failure contract only
  protocol/
    client-server.ts
    client-pairing.ts
  clients/
    app/
    cli/
    pi/
  server/
    app/
    authentication/
    pairing/
    sessions/
    registry/
    routing/
    delivery/
    channels/
    mcp/
  runtime/
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
    persistence/
    synchronization/
    recovery/
    effects/
    stage-context/       # immutable facade over existing query owners
    queries/
  changes/
    intake/
    triage/
    review/
    trace/
  checks/
    contracts/
    packs/
    runner/
    gate/
  loops/
    decision/
    planning/
    implementation/
    review/
  evidence/
  work-state/
  alignment/
  knowledge/
  project/
  execution/
    ports.ts
    supervisor/          # Agent Supervisor and Runner lifecycle
    dsh/
      runner/            # isolated exact DSH composition and process protocol
      plugins/           # first-party Backend Plugins only
      delegates/         # Claude Code, Codex, ACP, and future adapters
    checks/              # Code sandbox and isolated tool-free Model transport
  preview/
  git/
  utils/

benchmarks/
scripts/
tests/
```

`src/protocol/**` contains only shared Client-Server wire contracts. Domain protocols remain with their owners. `src/error-handling/**` stays a lean Package-owned foundation for the common error envelope, serialization, type guards, and stable operation-failure contract; owner-specific error semantics do not accumulate there. `src/checks/**` owns Check contracts, Pack loading, generic Code and Model execution coordination, cache identity, completed Results, and Gate Reports. `src/loops/**` owns Decision, Planning, Implementation, and Review Stage Loop semantics. Runtime invokes Checks, records authoritative Gate state, and applies one fixed lifecycle without a Router. `src/execution/supervisor/**` owns Agent Runner process lifecycle and custody-scoped receipts through neutral ports. `src/execution/dsh/**` owns the exact pinned DSH composition, first-party Backend Plugins, and delegate adapters; no DSH or Cordis value escapes that implementation boundary. `src/execution/checks/**` owns concrete Check transports without Result authority. Existing `src/execution/pi/**` and `src/execution/review/**` are migration debt outside target topology and are deleted after DSH and Review parity rather than retained behind compatibility. `src/runtime/index.ts` is the curated operational package surface published as `@nunomoura/codewiki/runtime`; `src/runtime/coordinator/**` remains internal. Public `./coordinator`, root `coordinator.ts`, generic `composition/**`, `src/runtime/loop-exit/**`, and `src/verification/**` do not survive. `src/main.ts` composes the standalone CodeWiki Backend, including Server, Runtime, first-party Clients, Agent Supervisor, isolated DSH Agent Runners, and Check Runners. `src/pi-extension.ts` is only an optional external Pi Client and owns no Backend lifecycle.

Target dependency direction is:

```text
clients               -> protocol
server                -> protocol + Runtime gateway
runtime               -> Stage Loops + checks + domain owners + neutral Execution Ports
checks                -> Evidence contracts + Project configuration + neutral Execution Ports
execution/supervisor  -> neutral Execution Ports + Runner process protocol
execution/dsh         -> neutral Execution Ports + pinned DSH/Cordis packages
execution/checks      -> neutral Check execution ports
main bootstrap        -> clients + server + runtime + Agent Supervisor + concrete DSH/Check Runners
optional Pi Client    -> protocol only
```

Forbidden directions include `runtime -> server`, `runtime -> clients`, `runtime -> concrete DSH/Cordis/delegate`, `checks -> Runtime lifecycle`, `checks -> concrete DSH/Cordis/delegate`, `Agent Runner -> Runtime persistence internals`, `Backend Plugin -> canonical state/effects`, `server -> Runtime persistence internals`, `domain -> server`, and `clients -> Server, Runtime, Agent Supervisor, or concrete Runner lifecycle`.

Source ownership clean cuts are:

```text
src/host/**          -> src/server/**
src/api/protocol.ts  -> src/protocol/**
other src/api/**     -> Runtime commands/queries or domain owner
src/cli/**           -> src/clients/cli/**
src/change-trace/**  -> src/changes/trace/**
src/traces/**        -> Change Trace or Runtime persistence owner
src/views/**                         -> Alignment, WorkState, or Runtime queries
src/semantic-loop.ts                 -> src/loops contracts or delete
src/decision/**                      -> src/loops/decision/**
src/planning/**                      -> src/loops/planning/**
src/implementation/review/**         -> src/loops/review/**, Checks, or delete
other src/implementation/**           -> src/loops/implementation/**
src/verification/**                  -> src/checks/** or delete obsolete machinery
src/runtime/loop-exit/**              -> src/checks/gate/**, Runtime lifecycle, or delete
legacy Quality and repair machinery   -> atomic Check feedback or delete
src/error-handling/config-errors.ts   -> src/project/config-errors.ts
src/error-handling/trace-errors.ts    -> Change Trace owner
src/benchmarks/**                     -> benchmarks/**
src/execution/pi/**                   -> DSH-backed replacement then delete without compatibility
src/execution/review/**               -> Review/Checks replacement then delete
```

Canonical project layout is:

```text
.codewiki/
  config.json
  kb/
    product/
    system/
  traces/
    TRACE-CHG-<id>.jsonl
  check-packs/
    decision/
      default/
      <pack-name>/
    planning/
      default/
      <pack-name>/
    implementation/
      default/
      <pack-name>/
    review/
      default/
      <pack-name>/
  check-packs.lock.json
  views/      # disposable projections
  runtime/    # private operational state
```

Knowledge, Change Traces, project configuration, tracked Pack Skills, and tracked Check definitions are source truth. Each optional Skill lives under `<stage>/<pack>/skill/<skill-name>/`; each Check lives directly at `<stage>/<pack>/<check-id>/check.json` beside one `CHECK.md` or `CHECK.mjs`; no extra `checks/` directory exists. `check-packs.lock.json` records installed npm, Git, or local source provenance, separate Skill and Check base digests, complete package digest, and local divergence without making files immutable. Compact Evidence metadata enters Change Trace while large or private bytes stay in their existing authority boundary. No canonical `.codewiki/evidence/` database or `.codewiki/changes.log` exists. Root `CHANGELOG.md` records package releases. This source checkout keeps active Change Traces and project Check Packs absent because CodeWiki cannot dogfood its own extension during stabilization.

## Clean-cut rules and budgets

Use breaking clean cuts. No compatibility aliases, old-path re-exports, dual contracts, transitional writes, stale package roots, or global prose replacement. Build a new HEAD-anchored manifest before structural source moves; preserve `.tmp-worktrees/deep-clean-file-budget.json` and `/tmp/codewiki-kb-pre-clean-cut.diff` as historical evidence only.

### Historical checkpoints

The following paragraphs preserve completed names, paths, protocol IDs, manifests, and counts as historical evidence. They do not define current desired vocabulary.

Ratification checkpoint before executable clean cuts:

| Area | Ratification | Trace-host cut | Conversational Pi cut | Managed Execution move | Runtime/Host ownership cut | App shell cut | Host App lifecycle cut | App/Pi bridge cut | App read-only cut | Host App transport cut | Factual activity cut | Runtime App queries cut | Hard cap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tracked total | 655 | 641 | 639 | 640 | 642 | 641 | 641 | 639 | 636 | 637 | 636 | 637 | 575 |
| `src/**` | 375 | 367 | 366 | 366 | 366 | 365 | 364 | 362 | 360 | 360 | 359 | 359 | 315 |
| `tests/**` | 211 | 204 | 202 | 202 | 202 | 201 | 201 | 200 | 198 | 198 | 197 | 197 | 190 |
| `benchmarks/**` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| `scripts/**` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `lab/**` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| packed files | 753 | 737 | 735 | 735 | 735 | 733 | 731 | 727 | 723 | 723 | 721 | 721 | 650 |

The trace-host cut is recorded by `.tmp-worktrees/trace-host-clean-cut-manifest.json`, exhaustively anchored to `fafafc8` with 639 keeps and 16 deletions. Its green checkpoint is 943 full-suite tests, 116 coordinator tests, a passing packed-install smoke test, and zero production audit vulnerabilities.

The conversational Pi cut is recorded by `.tmp-worktrees/pi-conversational-semantic-clean-cut-manifest.json`, exhaustively anchored to `4d4f075` with 638 keeps and 3 deletions. It removes ambient Client scheduling and three Candidate tools while preserving explicit `/wiki-select`, bounded reads, deterministic commands, and isolated managed Pi execution. Its green checkpoint is 938 full-suite tests, 116 coordinator tests, 735 packed files, passing project-local and external packed-install lifecycle gates, and zero production audit vulnerabilities.

The managed Execution move is recorded by `.tmp-worktrees/managed-execution-move-manifest.json`, exhaustively anchored to `5144116` with 620 keeps and 19 moves. It moves neutral ports and every managed Pi adapter/test to `src/execution/**` and `tests/execution/**`, renames public Harness vocabulary without aliases, and freezes the remaining five-file container/coordinator Harness closure as legacy debt. Its green checkpoint is 941 full-suite tests, 116 coordinator tests, 735 packed files, passing project-local and external packed-install lifecycle/failure gates, and zero production audit vulnerabilities. The one tracked-file increase is this required move manifest; source, test, and packed counts do not increase.

The Runtime workbench move is recorded by `.tmp-worktrees/runtime-workbench-container-move-manifest.json`, exhaustively anchored to `a6f384a` with 635 keeps and 5 moves. It moves OCI execution, worktree Git validation, container isolation options, cancellation, report persistence, and cleanup proof to `src/runtime/workbenches/container/**`.

The final generic Harness deletion is recorded by `.tmp-worktrees/host-coordinator-entrypoint-move-manifest.json`, exhaustively anchored to `a6f384a` with 639 keeps and 1 move. It moves package composition to `src/host/coordinator-entrypoint.ts`, retains the public `./coordinator` subpath at its new artifact, and removes `src/harnesses/**` and `dist/harnesses/**` completely. Together these moves have a green checkpoint of 942 full-suite tests, 116 coordinator tests, 735 packed files, passing project-local and external packed-install lifecycle/failure gates, and zero production audit vulnerabilities.

The App shell cut is recorded by `.tmp-worktrees/app-shell-move-manifest.json`, exhaustively anchored to `57fb49a` with 637 keeps, 3 moves, and 2 deletions. It moves the browser shell and logo to `src/clients/app/**`, moves the browser contract test to `tests/clients/app/**`, deletes an unused standalone Dashboard renderer/test pair, and freezes the remaining 13-file `src/dashboard/**` transport/projection/mutation knot for contract-led Host and Runtime separation. Its green checkpoint is 941 full-suite tests, 116 coordinator tests, 733 packed files, passing project-local and external packed-install lifecycle/failure gates, and zero production audit vulnerabilities.

The Host App lifecycle cut is recorded by `.tmp-worktrees/host-app-lifecycle-move-manifest.json`, exhaustively anchored to `fea8e1b` with 637 keeps, 3 moves, and 1 deletion. It moves daemon bootstrap and installed-package identity checks to `src/host/app/**`, moves lifecycle proof to `tests/host/app/**`, deletes the Dashboard barrel, and freezes the remaining 10-file `src/dashboard/**` service knot. Its green checkpoint is 941 full-suite tests, 116 coordinator tests, 731 packed files, passing project-local and external packed-install lifecycle/failure gates, and zero production audit vulnerabilities.

The App/Pi bridge clean cut is recorded by `.tmp-worktrees/app-pi-session-action-clean-cut-manifest.json`, exhaustively anchored to `9d5ea31` with 638 keeps and 3 deletions. It removes browser session-action controls and state, the same-session HTTP route, ambient Pi `sendUserMessage` adaptation, the dedicated bridge test, and both packed source artifacts. Its green checkpoint is 937 full-suite tests, 116 coordinator tests, 727 packed files, passing project-local and external packed-install lifecycle/failure gates, and zero production audit vulnerabilities.

The App read-only clean cut is recorded by `.tmp-worktrees/app-direct-mutation-clean-cut-manifest.json`, exhaustively anchored to `bfdbce2` with 635 keeps and 4 deletions. It removes Dashboard-local Change and configuration mutation controls, their browser buttons/forms, both POST command routes, and dedicated mutation tests. Changes and effective configuration remain bounded read-only projections until typed Runtime commands exist. Its green checkpoint is 932 full-suite tests, 116 coordinator tests, 723 packed files, passing project-local and external packed-install lifecycle/failure gates, and zero production audit vulnerabilities.

The Host App transport move is recorded by `.tmp-worktrees/host-app-transport-move-manifest.json`, exhaustively anchored to `22af603` with 632 keeps and 4 moves. It moves App HTTP transport, endpoint lifecycle, request validation, coordinator observation, and Preview command delivery to `src/host/app/**`; moves focused integration proof to `tests/host/app/**`; and clean-cuts exported server, request-error, and private temp-directory vocabulary without aliases. Its green checkpoint is 932 full-suite tests, 116 coordinator tests, 723 packed files, passing project-local and external packed-install lifecycle/failure gates, and zero production audit vulnerabilities.

The factual activity clean cut is recorded by `.tmp-worktrees/app-factual-activity-clean-cut-manifest.json`, exhaustively anchored to `9cddba3` with 635 keeps and 2 deletions. It deletes projection-authored Activity Feed impact and next-action narration and its claim-authoring test. The App renders the existing bounded factual trace activities without a compatibility field. Its green checkpoint is 930 full-suite tests, 116 coordinator tests, 721 packed files, passing project-local and external packed-install lifecycle/failure gates, and zero production audit vulnerabilities.

The Runtime App query move is recorded by `.tmp-worktrees/runtime-app-queries-move-manifest.json`, exhaustively anchored to `06031a5` with 627 keeps and 9 moves. It moves canonical Change/configuration reads and bounded App, activity, quality, worker, and Dev Log reductions to `src/runtime/queries/**`, moves focused tests to `tests/runtime/queries/**`, and removes `src/dashboard/**` plus `tests/dashboard/**` completely. Host retains App transport; the browser Client retains presentation. Exported query/state vocabulary is clean-cut without aliases or old-path re-exports. Its green checkpoint is 930 full-suite tests, 116 coordinator tests, 721 packed files, passing project-local and external packed-install lifecycle/failure gates, and zero production audit vulnerabilities.

The controlled Implementation worker path clean cut is recorded by `.tmp-worktrees/runtime-controlled-worker-path-clean-cut-manifest.json`, exhaustively anchored to `03ea724` with 633 keeps, 2 moves, and 2 deletions. It removes the direct Runtime claim-to-session starter and manual Host handoff manifest/API, moves bounded prompt construction into the authoritative dispatcher path, requires exact isolated-worktree custody on every Implementation Worker Assignment, leaves Pi session mechanics under Managed Execution ownership, and retains durable coordinator scheduling, recovery, cancellation, immutable reports, claim release, Integration, and cleanup as the sole controlled Implementation worker route. No old path or compatibility export survives. Its green checkpoint is 921 full-suite tests, 117 coordinator tests, 719 packed files, passing project-local and external packed-install lifecycle/failure gates, and zero production audit vulnerabilities.

The Host/Client protocol clean cut is recorded by `.tmp-worktrees/host-client-protocol-clean-cut-manifest.json`, exhaustively anchored to `74fd712` with 634 keeps and 2 moves. It consolidates shared API validation into `src/api/protocol.ts`, defines strict `codewiki.host-client@1.0.0` command/query/operation/event envelopes, separates accountable actor from Client transport and optional delegation, and gives Host transport deduplication and Runtime semantic idempotency different identities. Change Trace Protocol `3.0.0` and Provider Check Receipt Adapter `2.0.0` replace ambiguous legacy identity vocabulary with proof-backed authenticated identity without aliases. Host authentication, actor mapping, registry, pairing, and endpoint wiring remain pending. Its green checkpoint is 924 full-suite tests, 117 coordinator tests, 719 packed files, passing Pi and external packed-install lifecycle/failure gates, and zero production audit vulnerabilities.

The Host registry and pairing contract slice is recorded by `.tmp-worktrees/host-registry-pairing-contract-manifest.json`, exhaustively anchored to `3606baf` with 636 keeps, 1 deletion, and 1 planned addition. It adds strict `codewiki.host-registry@1.0.0` machine-level actor, paired Client, and project-route state under `src/host/registry/**`; private canonical persistence with a no-follow read descriptor, exclusive lock, atomic replacement, directory synchronization, generation CAS, and append-preserving stable-identity transitions; and fail-closed exact-generation resolution from a trusted authentication-adapter assertion. It rejects caller actor declaration, credentials in registry shape, malformed or non-private files, duplicate identities, ambiguous active Client instances, disabled/revoked/expired records, assertion mismatch, and unknown projects. The server-only App request error wrapper is merged into its sole owner so source and test counts remain flat. Authentication adapters, pairing commands, delegation authorization, Host process supervision, endpoint binding, reconnect cursors, redaction, and delivery remain pending. Its green checkpoint is 928 full-suite tests, 117 coordinator tests, 719 packed files, passing Pi and external packed-install lifecycle/failure gates, zero production audit vulnerabilities, and unchanged source/test file counts at 358/196.

The Host pairing and authentication contract slice is recorded by `.tmp-worktrees/host-pairing-authentication-contract-manifest.json`, exhaustively anchored to `3a98d39` with 637 keeps, 1 deletion, and 1 planned addition. It adds strict `codewiki.host-pairing@1.0.0` transient-proof verification and pure generation-bound issuance/revocation transitions under `src/host/pairing/**`. Pairing derives actor identity only from a trusted normalized assertion and active registry mapping, Host time owns audit timestamps and derived bounded expiry, revocation requires fresh authentication by the owning actor plus authentication-reference CAS, and no raw proof, caller actor, authority, credential, Runtime time, delegation, or effect enters registry state. The orphan App daemon entrypoint is deleted because development composition already imports the Host server directly. Concrete proof adapters, credential storage, actor enrollment, pairing endpoint authorization, delegation authorization, Host process supervision, endpoint binding, reconnect cursors, redaction, and delivery remain pending. Its green checkpoint is 930 full-suite tests, 117 coordinator tests, 719 packed files, passing Pi and external packed-install lifecycle/failure gates, zero production audit vulnerabilities, and unchanged source/test file counts at 358/196.

The public Runtime gateway clean cut is recorded by `.tmp-worktrees/runtime-public-gateway-clean-cut-manifest.json`, exhaustively anchored to `41340bf` with 637 keeps, 2 deletions, and 2 planned additions. It replaces public `./coordinator` with curated `./runtime`, deletes both `src/host/coordinator-entrypoint.ts` and the duplicate `src/runtime/coordinator/entrypoint.ts`, and adds `src/runtime/index.ts` plus `src/runtime/gateway.ts`. The gateway exposes bounded state, inspection, Decision attention, exact Decision selection, Candidate submission, cursor-bound events, heartbeat, disconnect, and shutdown without exporting Coordinator-named declarations, scheduler/Worker internals, Integration/effect scheduling, Loop bindings, or OCI adapters. Host App coordinator observation consumes the gateway and an architecture gate prevents Host transport from importing `runtime/coordinator/**`. Full Server isolation remains pending because App projection assembly still reads Runtime query and persistence modules directly. Its green checkpoint is 932 full-suite tests, 118 coordinator tests, 719 packed files, zero production audit vulnerabilities, and unchanged source/test counts at 358/196.

The Client-Server protocol ownership clean cut is recorded by `.tmp-worktrees/client-server-protocol-clean-cut-manifest.json`, exhaustively anchored to `6bf2b66` with 638 keeps and 2 moves. It moves the shared wire contract from `src/api/protocol.ts` to `src/protocol/client-server.ts`, moves its focused proof to `tests/protocol/client-server.test.mjs`, clean-cuts the sole accepted ID to `codewiki.client-server@1.0.0`, and replaces Host-named exported wire vocabulary without aliases, dual parsing, or old-path exports. API-only input validation remains with the API error owner. Pairing and registry protocols remain Host-named until their Server ownership cut. Its green checkpoint is 932 full-suite tests, 118 coordinator tests, 719 packed files, zero production audit vulnerabilities, and unchanged source/test counts at 358/196.

The Server ownership clean cut is recorded by `.tmp-worktrees/server-ownership-clean-cut-manifest.json`, exhaustively anchored to `3046930` with 633 keeps, 7 moves, 1 deletion, and 1 planned addition. It moves every tracked `src/host/**` and `tests/host/**` file to `src/server/**` and `tests/server/**`, clean-cuts protocol identities to `codewiki.client-pairing@1.0.0` and `codewiki.server-registry@1.0.0`, places shared Pairing message normalization in `src/protocol/client-pairing.ts`, and replaces active Host-named pairing, authentication, registry, connection, state-root, package, test, script, and validation vocabulary without aliases, dual parsing, or old paths. The misclassified `host-errors.ts` module is deleted; its still-used execution-data projection is merged into the existing generic CodeWiki error owner because it is not Server transport state, and the active completion field is clean-cut from `hostError` to `executionError` without dual serialization. Authentication proof verification and Pairing transitions still share one Server module, and App projections still read Runtime query/persistence internals directly, so those boundaries remain pending. Its green checkpoint is 933 full-suite tests, 118 coordinator tests, 719 packed files, zero production audit vulnerabilities, and unchanged source/test counts at 358/196.

The Server-Runtime isolation clean cut is recorded by `.tmp-worktrees/server-runtime-isolation-clean-cut-manifest.json`, exhaustively anchored to `078f083` with 642 keeps. It extends the narrow Project Runtime gateway with bounded App, Change, and configuration projection queries over authenticated generation-checked, lease-bound RPC and one co-located Runtime-owned projection subscription. Server imports no Runtime query, persistence, coordinator, Trace, Knowledge, or project-state implementation and architecture permits only `runtime/gateway.ts`. Preview control owns project-context loading, so raw Trace records do not cross the Server boundary. Connected remote mode performs no local canonical-state reads or watchers; App pull queries, Preview commands, SSE refresh, Runtime events, reconnect, heartbeat, and shutdown retain behavior. Its green checkpoint is 933 full-suite tests, 118 coordinator tests, 719 packed files, zero production audit vulnerabilities, and unchanged source/test counts at 358/196.

The Server Authentication and Pairing ownership clean cut is recorded by `.tmp-worktrees/server-authentication-pairing-clean-cut-manifest.json`, exhaustively anchored to `74cf826` with 642 keeps, 1 deletion, and 1 planned addition. `src/server/authentication/proof.ts` exclusively owns transient proof requests, trusted adapter assertions, strict normalization, and verification. `src/server/pairing/commands.ts` owns only issue/revoke enrollment transitions, while `src/server/registry/state.ts` retains persistence and connection resolution and consumes the Authentication assertion contract. No compatibility export remains from Pairing. The one-line `src/api/wiki-config.ts` compatibility re-export is deleted and consumers use canonical `src/project/config.ts`, keeping source/test counts flat at 358/196. Its green checkpoint is 934 full-suite tests, 118 coordinator tests, 719 packed files, and zero production audit vulnerabilities.

The Server Session foundation clean cut is recorded by `.tmp-worktrees/server-session-foundation-clean-cut-manifest.json`, exhaustively anchored to `cdc0cbf` with 642 keeps, 2 deletions, and 2 planned additions. Server-owned `codewiki.server-session@1.0.0` contracts and lifecycle under `src/server/sessions/**` bind one temporary connection to exact actor, Client transport, project, Runtime route, generation, digest-only credential, issuance, update, expiry, and revocation state. Open, rotation, revocation, and endpoint authorization reject unsupported authority fields, use generation CAS and constant-time credential comparison, expose no raw credential to state or endpoint policy, and yield bounded Client-Server request context plus policy-adapter identity after policy allows the exact endpoint. This grants no Runtime operation authority. Compatibility barrels `src/api/views.ts` and `src/api/traces.ts` are deleted; consumers import deterministic projection, Trace, and Runtime persistence owners directly, keeping source/test counts flat at 358/196. Its green checkpoint is 936 full-suite tests, 118 coordinator tests, 719 packed files, and zero production audit vulnerabilities.

The Server App Session transport clean cut is recorded by `.tmp-worktrees/server-app-session-transport-clean-cut-manifest.json`, exhaustively anchored to `01af4fa` with 644 keeps, 1 deletion, and 1 planned addition. Browser App launch uses a generation-bound fragment credential only for same-origin Session establishment, then relies on an `HttpOnly; SameSite=Strict` cookie. Every App projection, event stream, Preview command, metadata request, and shutdown request passes exact repository-bound endpoint policy; bounded authenticated Actor and Client context crosses the Server-Runtime gateway for every Runtime projection and remains attached per event stream. Query-token and browser-storage authorization are removed. App shutdown revokes the active Session. Callers may inject an Authentication/Registry-resolved App binding and policy; the current personal loopback composition still uses a bounded local service binding until local Pairing and Actor enrollment become executable. The seven-line `src/project/config-digest.ts` helper is merged into canonical `src/project/config-file.ts` without a compatibility path, preserving source/test counts at 358/196.

The personal App Pairing clean cut is recorded by `.tmp-worktrees/server-local-app-pairing-clean-cut-manifest.json`, exhaustively anchored to `a78e815` with 645 keeps, 1 deletion, and 1 planned addition. Default App launch now verifies a fresh ephemeral local proof, persists one stable local User identity, project-bound App Pairing, and exact canonical project route in private machine-level Server Registry state, resolves the current Registry generation, and only then opens the App Session. Revoked Pairings, disabled records, identity drift, repository drift, and stale generations fail closed without reactivation. Registry state persists no proof, credential, Runtime role, or project authority. The three-line `src/utils/time.ts` one-consumer abstraction is deleted and its `IsoTimestamp` type moves to the owning legacy Trace type module, keeping source/test counts flat at 358/196.

The Server OIDC and Actor enrollment clean cut is recorded by `.tmp-worktrees/server-oidc-actor-enrollment-clean-cut-manifest.json`, exhaustively anchored to `40b97ff` with 645 keeps, 2 deletions, and 2 planned additions. Provider-neutral OIDC verification receives opaque proof through a trusted adapter that owns authorization-code exchange, PKCE S256, redirect, discovery, signature, algorithm, and key validation. Server verifies exact Client, canonical HTTPS issuer, audience, high-entropy nonce, issued-at, expiry, adapter, and bounded token lifetime before deriving immutable `(issuer, subject)` identity. Registry advances cleanly to `codewiki.server-registry@2.0.0` with typed `local | oidc` identities and no parser for legacy string-only identity arrays. Generation-bound idempotent enrollment creates only one active User mapping and grants no Pairing, Session, repository membership, delegation, role, project permission, or Runtime authority. Raw codes, tokens, PKCE verifiers, nonces, and mutable profile claims are not persisted. Two test-only five-line Loop declaration files are deleted after their constants move to existing Planning and Implementation owner modules, preserving source/test counts at 358/196. Concrete GitHub/GitLab network adapters and provider repository-access checks remain pending.

The Server provider repository-access clean cut is recorded by `.tmp-worktrees/server-provider-repository-access-clean-cut-manifest.json`, exhaustively anchored to `8216792` with 646 keeps, 2 deletions, and 1 planned addition. `codewiki.server-repository-access@1.0.0` separates coarse provider membership evidence from OIDC Authentication, Actor enrollment, Pairing, Sessions, Registry state, and Runtime authorization. A credential-isolated trusted adapter receives only verifier-proven immutable OIDC identity, the exact CodeWiki repository digest, and an opaque provider repository reference; Server binds exact issuer, provider, adapter, identity, repository, observation time, and bounded expiry into provenance-backed `accessible | inaccessible` evidence. Tokens, roles, permissions, capabilities, project-operation decisions, and authority are absent. A production-dead Worker-observation classifier and its dedicated test are deleted, keeping source count flat at 358 and reducing tests to 195. Concrete GitHub/GitLab HTTP adapters, provider credential storage, automatic rechecks, Pairing endpoint authorization, credential rotation, project membership, and exact Runtime AuthZ remain pending.

The Server Pairing endpoint authorization clean cut is recorded by `.tmp-worktrees/server-pairing-endpoint-authorization-clean-cut-manifest.json`, exhaustively anchored to `d1dab05` with 647 keeps, 1 deletion, and 1 planned addition. Public Pairing issue and revoke entrypoints now require an active generation-bound Server Session, verifier-proven transition Authentication, exact active Actor identity, current Registry generation, and exact project, repository, and Runtime-route binding before deny-by-default policy sees the fixed action and target Client. Session credentials remain inside Session verification; invalid credentials cannot query Registry-specific binding state, and denial causes no transition. Direct deterministic Pairing commands remain internal and are removed from the root package API. Shared Authentication assertion provenance rejects structurally forged transition assertions. The five-line Runtime Decision authority declaration moves to the Decision Candidate proposal owner and its old file is deleted, preserving source/test counts at 358/195. Pairing credential generation and rotation remain blocked until an approved machine credential-store contract exists; this cut does not create an unusable secret, persist raw secret bytes, or derive deterministic credentials. Concrete GitHub/GitLab adapters, secure provider credential storage, automatic access rechecks, Pairing transport endpoint wiring, project membership, and exact Runtime AuthZ remain pending.

The Runtime API ownership clean cut is recorded by `.tmp-worktrees/runtime-api-ownership-clean-cut-manifest.json`, exhaustively anchored to `2f592c9` with 628 keeps, 17 moves, 4 deletions, and 1 planned addition. It deletes `src/api/**` completely, merges the strict OKF operation into Knowledge and the default Loop execution-port binding into Runtime coordinator, moves Change and Decision commands to their domain owners, and moves Planning, Implementation, archive, work, and state operations to `src/runtime/commands/**` or `src/runtime/queries/**`. Focused tests move with those owners and the duplicate Runtime state-query test merges into one file. `src/runtime/index.ts` is now the explicit operational package surface; the root package remains owner-direct and contract-focused, with no old path, barrel, alias, or shim. Pi-specific coordinator daemon composition moves from Client to Managed Execution, while generic Runtime startup requires an injected spawner and imports no concrete Pi implementation. New neutral `src/pi-extension.ts` Package bootstrap wires Client registration to the Runtime connection boundary and concrete Execution spawner; Client modules import neither lifecycle implementation. Generic command failures use operation-error ownership and domain vocabulary instead of deleted API vocabulary while preserving exact messages and codes. The ownership audit retains the shared CodeWiki error envelope and operation-failure contract as a lean Package foundation instead of deprecating error handling wholesale; only configuration and Change Trace specializations remain explicit colocation debt. Disposable multiprocess, project-local, and external lifecycle probes consume current Runtime service and endpoint artifacts instead of the already-deleted Host entrypoint. Exact validation errors remain stable. Its green checkpoint is 942 full-suite tests, 119 coordinator tests, 715 packed files (1.3 MB packed and 4.6 MB unpacked), passing Pi install, RPC, multiprocess, SDK, SDK-package, project-local install, external lifecycle, external failure, and readiness gates, and zero production audit vulnerabilities. Source/test counts fall from 358/195 to 356/194.

The Client lifecycle ownership clean cut is recorded by `.tmp-worktrees/client-lifecycle-ownership-clean-cut-manifest.json`, exhaustively anchored to `4eeed50` with 645 keeps and 2 moves. It moves the deterministic CLI and its focused proof to `src/clients/cli/**` and `tests/clients/cli/**` without compatibility paths. Pi Client registration now receives narrow dashboard and project-service ports; neutral `src/pi-extension.ts` alone composes Server App and Preview lifecycle, the Runtime gateway, and the concrete Execution spawner. Client source imports no Server App, Runtime process, or concrete Execution process lifecycle value. Its green checkpoint is 942 full-suite tests, 119 coordinator tests, 715 packed files (1.3 MB packed and 4.6 MB unpacked), passing Pi install, RPC, multiprocess, SDK, SDK-package, project-local install, external lifecycle, external failure, and readiness gates, and zero production audit vulnerabilities. Source/test counts remain flat at 356/194.

The Change Trace ownership clean cut is recorded by `.tmp-worktrees/change-trace-ownership-clean-cut-manifest.json`, exhaustively anchored to `25b3e7a` with 603 keeps and 45 moves. It consolidates canonical Change protocol, JSONL encoding, Change-backed storage, manifests, reduction, replay, synchronization support, retention, and specialized errors under `src/changes/trace/**`; graph projection, Knowledge augmentation, and bounded queries move directly to `src/alignment/**`. Focused proofs move to `tests/changes/trace/**` and `tests/alignment/**`. `src/change-trace/**`, `src/traces/**`, `src/error-handling/trace-errors.ts`, and `tests/traces/**` are deleted without compatibility paths, while root package exports retain the same names through owner-direct modules. Frozen Change Trace v1 fixtures preserve their content-addressed historical source references and identities as product data, not surviving module paths. Source/test counts remain flat at 356/194; strict ownership accounting advances to 329 target-owned files and 27 explicit legacy files with zero overlap. Its green checkpoint is 942 full-suite tests, 119 coordinator tests, 715 packed files (1.3 MB packed and 4.6 MB unpacked), passing Pi install, RPC, multiprocess, SDK, SDK-package, project-local install, external lifecycle, external failure, and readiness gates, and zero production audit vulnerabilities.

The View ownership clean cut is recorded by `.tmp-worktrees/view-ownership-clean-cut-manifest.json`, exhaustively anchored to `5eca8b6` with 634 keeps, 14 moves, 1 deletion, and 1 planned addition. Deterministic blocker, conflict, quality-readiness, trace-goal, trace-board, work-plan, and work-queue reductions and contracts move to `src/work-state/**`; status, resume, trace-queue, trigger, and runtime-board reductions and contracts move to `src/runtime/queries/**`. Focused proofs move to `tests/runtime/queries/**`. `src/views/**` and `tests/views/**` are deleted without compatibility paths or packed artifacts. The unexported test-only disposable View writer and its sole proof are deleted rather than preserved as dead production code; `.codewiki/views/` remains disposable product vocabulary. Public root type names and projection shapes remain stable. Source/test file counts remain flat at 356/194; strict ownership accounting advances to 342 target-owned files and 14 explicit legacy files with zero overlap. Its green checkpoint is 941 full-suite tests, 119 coordinator tests, 715 packed files (1.3 MB packed and 4.6 MB unpacked), passing Pi install, RPC, multiprocess, SDK, SDK-package, project-local install, external lifecycle, external failure, and readiness gates, and zero production audit vulnerabilities.

The Loop quality ownership clean cut is recorded by `.tmp-worktrees/loop-quality-ownership-clean-cut-manifest.json`, exhaustively anchored to `0d68c1d` with 634 keeps, 15 moves, and 1 deletion. Shared graph, declarative pack, activation profile, bounded runner, judge, prompt, provider-resolution, standard, and evaluator mechanics move to `src/verification/quality/**`; the Implementation-only feedback reducer moves to `src/implementation/quality-feedback.ts`; and five focused proofs move to `tests/verification/quality/**`. The closed semantic Loop discriminator merges into Verification contracts instead of surviving as a one-line generic package. `src/loops/**`, `tests/loops/**`, `src/semantic-loop.ts`, and packed `dist/loops/**` are deleted without aliases, compatibility barrels, old-path exports, duplicate contracts, or replacement generic Loop ownership. Decision, Planning, and Implementation retain Candidate-specific Check composition and interpretation; the later Runtime Loop Exit cut establishes authoritative route ownership. Graph identities, quality result shapes, judge behavior, deterministic evaluation, trace bytes, and root package contracts remain unchanged. Source/test file counts fall to 355/194; strict ownership accounting advances to 352 target-owned files and 3 explicit legacy files with zero overlap. Its green checkpoint is 941 full-suite tests, 119 coordinator tests, 713 packed files (1.3 MB packed and 4.6 MB unpacked), passing Pi install, RPC, multiprocess, SDK, SDK-package, project-local install, external lifecycle, external failure, and readiness gates, and zero production audit vulnerabilities.

The Project configuration-error ownership clean cut is recorded by `.tmp-worktrees/project-config-error-ownership-clean-cut-manifest.json`, exhaustively anchored to `101ef73` with 649 keeps and 1 move. The structured configuration error contract moves unchanged from `src/error-handling/config-errors.ts` to `src/project/config-errors.ts`; Project and Preview callers and direct tests use the owner path. Error codes, class identity, messages, structured path/value data, causes, recoverability, and suggested action remain stable. The shared Package error foundation retains generic envelopes and operation contracts only. No alias, compatibility barrel, old-path export, duplicate class, or packed `dist/error-handling/config-errors.*` artifact survives. Source/test counts remain flat at 355/194; strict ownership accounting advances to 353 target-owned files and 2 explicit legacy files with zero overlap. Its green checkpoint is 941 full-suite tests, 119 coordinator tests, 713 packed files (1.3 MB packed and 4.6 MB unpacked), passing Pi install, RPC, multiprocess, SDK, SDK-package, project-local install, external lifecycle, external failure, and readiness gates, and zero production audit vulnerabilities.

The Benchmark production extraction clean cut is recorded by `.tmp-worktrees/benchmark-production-extraction-clean-cut-manifest.json`, exhaustively anchored to `1b2c91a` with 649 keeps and 2 moves. Deterministic Alignment retrieval measurement and adapter code moves from `src/benchmarks/**` to repository-root `benchmarks/**`; focused proofs remain under `tests/benchmarks/**`. Benchmark TypeScript stays in the project typecheck but is excluded from `tsconfig.build.json`, production declarations, and npm package contents. Snapshot binding, method order, adapters, metrics, error visibility, and report digests remain unchanged. `src/benchmarks/**` and packed `dist/benchmarks/**` are deleted without aliases, compatibility imports, duplicate harnesses, or replacement production ownership. Production source/test counts fall to 353/194; every production source file now has exactly one target owner, with zero explicit legacy files and zero overlap. Its green checkpoint is 941 full-suite tests, 119 coordinator tests, 709 packed files (1.3 MB packed and 4.6 MB unpacked), passing Pi install, RPC, multiprocess, SDK, SDK-package, project-local install, external lifecycle, external failure, and readiness gates, and zero production audit vulnerabilities.

The Runtime Loop Exit ownership clean cut is recorded by `.tmp-worktrees/runtime-loop-exit-ownership-clean-cut-manifest.json`, exhaustively anchored to `771d8ea` with 648 keeps, 3 moves, 1 deletion, and 1 planned addition. Native Decision Check orchestration and security policy assembly move from `src/decision/exit/**` to `src/runtime/loop-exit/**`; one generic Runtime router now reduces `pass | fail | indeterminate` consistently for all three semantic Loops. Decision retains Candidate, Check, Evidence, research, and security-scanner semantics. The test-only Decision exit barrel and all old paths, names, aliases, and compatibility exports are deleted. Decision Exit Report, Runtime Route, canonical trace bytes, operation order, and identities remain unchanged; source and test counts remain flat. Its green checkpoint is 943 full-suite tests, 119 coordinator tests, 709 packed files (1.3 MB packed and 4.6 MB unpacked), passing Pi install, RPC, multiprocess, SDK, SDK-package, project-local install, external lifecycle, external failure, and readiness gates, and zero production audit vulnerabilities.

The Checks and four-Loop topology clean cut is recorded by `.tmp-worktrees/checks-four-loop-ownership-clean-cut-manifest.json`, exhaustively anchored to `c250c03` with 507 keeps, 147 moves, 1 deletion, and 1 planned addition. Check mechanics move to `src/checks/**`; Decision, Planning, and Implementation move to `src/loops/**`; legacy implementation-review and security execution move to `src/execution/**`; fixed Decision lifecycle handling moves to `src/runtime/lifecycle/**`; and the generic Router is deleted. The cut adds one immutable exact-head Review attempt binding under `src/loops/review/**` and removes the transitional public Loop Exit names without aliases. It deliberately preserves singular legacy Quality, repair, protected-floor, activation, evaluator, indeterminate, and direct generic review-execution callers for the next contract-replacement slice. Source and test counts remain flat at 353/194. Its green checkpoint is 944 full-suite tests, 119 coordinator tests, 709 packed files, passing Pi install, SDK-package, project-local install, external lifecycle, external failure, and packed-install gates, with zero production audit vulnerabilities.

The Check, Result, and Gate contract clean cut is recorded by `.tmp-worktrees/check-result-gate-contract-clean-cut-manifest.json`, exhaustively anchored to `dd027ea` with 601 keeps, 7 moves, 48 deletions, and 2 planned additions. It publishes strict versioned Check Definition, bounded selector, Invocation, Output, completed Result, warning, stopped-reason, and Gate Report schemas; admits only `passed | failed` Results; and represents operational inability as a stopped Gate with no fabricated Result. Stage-first immutable Pack loading replaces protected floors, activation, hidden catalogs, managed Pack authoring, Repair layers, and specialized Decision orchestration. Execution uses exact cache identity, Code-before-Model fail-fast scheduling, bounded concurrency and retries, fresh per-attempt cancellation, hermetic Code sandbox admission, and independent tool-free Model transport. Runtime-facing Decision state uses Gate and transition vocabulary while the historical Change Trace wire boundary remains byte-compatible. Change Intake owns user-standard distillation. Source and test path counts fall to 323/178. Its green checkpoint is 821 full-suite tests, 119 coordinator tests, 649 packed files, passing Pi install, RPC, multiprocess, SDK, SDK-package, project-local install, external lifecycle, external failure, readiness, and packed-install gates, with zero production audit vulnerabilities.

Rules:

- Until caps pass, each source slice adds no more files than it deletes or merges and should reduce net count.
- Moves improve ownership but do not count as reduction.
- Merge only one responsibility and lifecycle; never combine unrelated code to hit a number.
- Delete stale architecture before adding replacement breadth whenever dependencies permit.
- Server/App/MCP work consumes old Dashboard, trace-host, Client/Harness, Quality, View, and compatibility footprint; caps do not increase.
- `test:coordinator` remains focused and is not rerun inside `audit:codewiki`.

## Work slices

### 1. Ratify architecture and replace stale vocabulary

- [x] Define User, Actor, User Interface, Client, CodeWiki Backend, CodeWiki Server, Project Runtime, Agent Supervisor, CodeWiki Agent Runner, Backend Plugin, Worker, Assignment, Workbench, and Model Provider in Knowledge.
- [x] Ratify standalone CodeWiki Backend as durable authority behind each project, with Server and per-project Runtime as architectural siblings and DSH Agent Runners as isolated execution-plane children.
- [x] Separate Authentication, Pairing, Session, Runtime Authorization, Agent supervision, Runner execution, delegated execution, and External Agent Client responsibilities.
- [x] Ratify Profile, Authority Grant, Claim, immutable Operation, Contribution Routing, and Review lifecycle semantics.
- [x] Ratify `src/protocol/**`, `src/server/**`, `src/runtime/index.ts`, `@nunomoura/codewiki/runtime`, target dependency direction, and `.codewiki/**` canonical layout.
- [x] Define controlled, Backend-owned, Backend-delegated, external-client, and external provenance plus External Candidate Capture and accountability closure.
- [x] Supersede Verification and Loop Exit with root Checks, four Stage Loop owners under `src/loops/**`, per-stage Gates, and fixed Runtime lifecycle transitions.
- [x] Distinguish CodeWiki Stage Loops from DSH and delegated-harness Turn Loops; use DSH's standard Turn Loop rather than reimplementing four semantic loops inside DSH.
- [x] Ratify bare-bones editable and removable defaults, user-only Pack authoring, npm/Git/local marketplace transport, Code/Model Checks, binary/quantitative measurements, atomic feedback, parallel cache-aware fail-fast execution, and stopped Gate semantics.
- [x] Ratify exact pinned DSH as the sole Backend Agent Runner engine; retain Pi only as optional external Client Integration and temporary execution migration evidence until clean deletion.
- [x] Ratify inbound MCP for External Agent Clients and outbound DSH subagent adapters for Backend-launched Claude Code, Codex, ACP, and future delegated harnesses.
- [x] Ratify Backend Plugin, Check Pack, Core Adapter, and Client Integration as separate extension surfaces; v1 permits first-party Backend Plugins only and exposes no raw Cordis project loading.
- [x] Ratify the DSH adopt/wrap/disable matrix, exact composition, no ambient profiles or Skills, state-aware compaction plugin, runner-local session evidence, and CodeWiki conformance on every DSH upgrade.
- [x] Narrow Worker to Implementation Worker and distinguish Stage Producer, Check executor, Client, Agent Runner, delegated harness, External Agent Client, and Model Provider.
- [x] Ratify one proposed `S0 → S1` Change transition, fixed stage projections, and separate passed-Decision Gate from authorized exact-Candidate confirmation.
- [x] Ratify immutable Stage Context over existing owners, exact Backend-owned Execution Ledgers, custody-limited delegated/external receipts, and fresh bounded programmatic queries.
- [x] Ratify Git as artifact-history owner and CodeWiki as semantic transition control; commits may enter exact subjects or drift intake but never imply stage progression.
- [x] Ratify post-Gate Outcome Diagnostics as ordinary Change Intake with no privileged Skill, Check, context, route, plugin, or configuration mutation path.
- [x] Preserve first-party App and CLI plus optional external Agent-product Clients without making any Client the product host.
- [ ] Update README and package description only after executable standalone Backend, DSH Runner, and MCP topology exists; do not advertise unfinished capability.

### 2. Preserve completed deletion-first ownership evidence and finish residual deletion

Checked items below preserve completed historical cuts and their then-current vocabulary; they are not active architecture. Only unchecked items remain executable work.

- [x] Create and execute the reviewed `fafafc8`-anchored trace-host keep/delete manifest covering every tracked file in that slice.
- [x] Delete remaining Pi/Dashboard trace-host shell, lifecycle branches, HTTP controls, tests, exports, and assets that depend on hidden semantic sessions.
- [x] Create and execute the reviewed `4d4f075`-anchored conversational Pi keep/delete manifest before this structural cut.
- [x] Delete hidden semantic-loop tools and ambient Runtime scheduling from conversational Pi registration.
- [x] Create and execute the reviewed `5144116`-anchored managed Execution keep/move manifest before this structural move.
- [x] Create and execute the reviewed `a6f384a`-anchored Runtime workbench keep/move manifest before the OCI ownership move.
- [x] Create and execute the reviewed `a6f384a`-anchored Host composition keep/move manifest before deleting the final generic Harness root.
- [x] Create and execute the reviewed `57fb49a`-anchored App shell keep/move/delete manifest before establishing the browser Client root.
- [x] Create and execute the reviewed `fea8e1b`-anchored Host App lifecycle keep/move/delete manifest before removing the Dashboard barrel.
- [x] Create and execute the reviewed `9d5ea31`-anchored App/Pi bridge keep/delete manifest before removing same-session prompt injection.
- [x] Create and execute the reviewed `bfdbce2`-anchored App direct-mutation keep/delete manifest before making Change and configuration surfaces read-only.
- [x] Create and execute the reviewed `22af603`-anchored Host App transport keep/move manifest before removing the Dashboard transport owner.
- [x] Create and execute the reviewed `9cddba3`-anchored factual activity keep/delete manifest before removing projection-authored causality.
- [x] Create and execute the reviewed `06031a5`-anchored Runtime App query keep/move manifest before deleting the final Dashboard roots.
- [x] Create and execute the reviewed `03ea724`-anchored controlled Implementation worker keep/move/delete manifest before removing direct session and manual Host handoff bypasses.
- [x] Create and execute the reviewed `0d68c1d`-anchored Loop quality ownership manifest before deleting generic Loop source and test roots.
- [x] Historical checkpoint: move shared quality mechanics to Verification, move quality feedback to Implementation, and merge the then-current Loop discriminator into Verification contracts without compatibility paths.
- [x] Historical checkpoint: establish transitional Runtime-owned Loop Exit routing and move native Decision orchestration from Decision to Runtime.
- [x] Create and execute the reviewed `101ef73`-anchored Project configuration-error ownership manifest and delete the old Package error path without compatibility exports.
- [x] Create and execute the reviewed `c250c03`-anchored manifest for the root Checks and four-Loop topology clean cut.
- [x] Move Decision, Planning, and Implementation under `src/loops/**` and add one immutable exact-head Review attempt contract under `src/loops/review/**`.
- [x] Implement Review attempt persistence, Gate execution, and fixed failed-Review feedback return to Implementation.
- [x] Move surviving Check contracts, Pack loading, execution coordination, cache, Results, and Gate reduction to `src/checks/**`; delete `src/verification/**`, `src/runtime/loop-exit/**`, per-Loop `exit/**`, and the generic Router without aliases.
- [x] Update exact Knowledge concept-count, index, source-ownership, and source-architecture assertions atomically with the source cut without weakening desired ownership metadata.
- [x] Delete Repair Profile/Frontier/Brief/Bundle, protected-floor/activation machinery, indeterminate Results, obsolete Loop Exit compatibility, and hidden Check catalogs as replacement consumers land.
- [ ] Delete isolated legacy Loop Quality and old ChangeRecord contracts after their remaining projection consumers move.
- [x] Move surviving Pi execution modules from `src/harnesses/pi/**` to `src/execution/pi/**` and ports to `src/execution/ports.ts`; rename public Harness vocabulary atomically.
- [x] Move container/worktree execution custody to Runtime workbench/isolation ownership.
- [x] Move coordinator package composition to Host ownership and remove the generic Harness source/package root.
- [x] Move the browser shell/assets directly into `src/clients/app/**` and delete the unused standalone Dashboard renderer.
- [x] Move App daemon bootstrap and installed-runtime identity checks into `src/host/app/**`; delete the Dashboard barrel.
- [x] Delete App-to-ambient-Pi session actions and prompt injection; preserve explicit user `/wiki-*` commands.
- [x] Delete Dashboard-local Change/configuration mutation authority and keep those App surfaces read-only until typed Runtime commands land.
- [x] Move App HTTP transport and lifecycle into `src/host/app/**`; retain no old-path transport exports.
- [x] Replace the four remaining Dashboard query/projection files with Runtime query contracts while preserving Client-owned presentation; no old Dashboard query protocol survives.
- [x] Delete direct Runtime claim-to-session and manual Host handoff execution; controlled Implementation workers now require exact Runtime-owned worktree custody and durable coordinator jobs.
- [x] Update managed Execution package exports, scripts, tests, and packed-install gates in the same cut; repeat for later Host/App cuts.

### 3. Clean-cut Server, Protocol, and Runtime boundaries

- [x] Define versioned command, bounded query, durable operation, and event envelopes under the historical Host-named protocol.
- [x] Bind Server-authenticated actor context, separate Client kind/instance, optional explicit delegation, repository, target, expected digest, semantic idempotency key, expiry, capability, and bounded payload on every mutation.
- [x] Separate Client-instance transport deduplication from actor-scoped Runtime semantic idempotency.
- [x] Create a reviewed HEAD-anchored manifest for the Client-Server protocol naming and ownership clean cut; create separate anchored manifests for later Server, Pairing, and Registry cuts.
- [x] Move `src/host/**` and `tests/host/**` to `src/server/**` and `tests/server/**` without old-path exports.
- [x] Split Authentication proof verification from Pairing transitions; keep Session and registry ownership distinct.
- [x] Move shared wire contracts to `src/protocol/**` and clean-cut protocol IDs to `codewiki.client-server@1.0.0`, `codewiki.client-pairing@1.0.0`, and current `codewiki.server-registry@2.0.0` without dual parsing.
- [x] Move semantic `src/api/**` handlers to Runtime commands/queries or their domain owners; delete the source root and remove the `api <-> runtime` dependency cycle.
- [x] Add a narrow Project Runtime gateway for commands, bounded queries, durable operations, and events; Server cannot read Runtime persistence internals.
- [x] Replace public `./coordinator` with curated `./runtime` backed by `src/runtime/index.ts`; delete duplicate Host/Runtime coordinator entrypoint barrels without aliases.
- [x] Move `src/cli/**` to `src/clients/cli/**` and remove remaining Client-to-Server and Client-to-Runtime lifecycle imports through protocol and neutral bootstrap wiring.
- [ ] Implement one machine-level Server registry over separate per-project Runtime processes.
- [x] Replace Browser App query-token authorization with generation-bound Server Session establishment, an HttpOnly same-site cookie, exact endpoint policy, and shutdown revocation.
- [x] Replace the temporary local App service binding with local Pairing plus Authentication/Registry resolution.
- [ ] Add reconnect cursors, deep links, redaction, and durable delivery.
- [x] Implement local Pairing and stable local User mapping for personal App mode.
- [x] Implement provider-neutral OIDC verification and immutable `(issuer, subject)` Actor enrollment foundation for team mode.
- [ ] Implement concrete GitHub/GitLab OAuth/OIDC network adapters and secure callback transaction storage.
- [x] Require active Server Session, verifier-proven Authentication, exact Registry/project binding, and deny-by-default policy for public Pairing issue/revoke entrypoints.
- [ ] Define approved machine credential storage, then implement digest-only Pairing credential generation and rotation without deterministic or raw-persisted secrets.
- [x] Treat provider repository access as separate short-lived coarse membership evidence with no Pairing, Session, project-operation, or Runtime authority.
- [ ] Require secure Server session authentication and exact Runtime AuthZ for every protected operation.
- [ ] Keep Clerk, WorkOS, password authentication, and enterprise identity lifecycle dependencies outside the initial foundation.
- [ ] Ensure browser or terminal closure cannot stop accepted work.
- [ ] Make adapter capability declaration intersect actor Authority Grants, explicit delegation, project policy, and current Runtime guards.
- [ ] Split `createNativeDecisionAttemptExecutor` into independently recoverable Candidate production, exact Gate execution, durable feedback, authorized exact-digest confirmation, and lifecycle commit steps.
- [ ] Extend Runtime gateway and Client-Server Protocol with server-derived Decision confirmation identity; Candidate edits, stale WorkState, changed Gate, or missing authority require a fresh Gate and cannot commit.

### 4. Build standalone CodeWiki App and first-party Clients

- [x] Replace Dashboard-local workflow/session query ownership with bounded Runtime projections; typed Runtime mutation operations remain pending.
- [ ] Add primary `src/main.ts` standalone CodeWiki Backend composition over Server, per-project Runtime, App, CLI, Agent Supervisor, isolated DSH Agent Runners, and Check Runners without moving policy into bootstrap.
- [ ] Implement App stage workspaces for Change, Decision, Planning, Implementation, Review, Work Items, Candidates, provenance, Check Packs, optional Pack Skills, Code and Model Checks, Evidence, Gate Reports, atomic feedback, stopped recovery, Integration, and effects.
- [ ] Show exact subject, WorkState, proposed transition, producer route and custody, Stage Context snapshot, Skill composition, Gate state, pending authority, and permitted fixed transition for each stage.
- [ ] Show separate Stage Producer, Implementation Worker, delegate, and Check routes; exact Skill, Check, DSH, and Backend Plugin digests; local divergence; route compatibility; unavailable capabilities; and producer-guidance versus Gate-judgment boundaries.
- [ ] Add Backend status for Server, Runtime, Agent Supervisor, Agent and Check Runners, Workbenches, exact DSH/plugin closure, upgrade qualification, cancellation, and recovery without presenting process health as project acceptance.
- [ ] Separate Decision Gate pass from exact digest-bound authorized confirmation and invalidate eligibility after any Candidate change.
- [ ] Add Backend-owned Execution Ledger, raw DSH session, context-query, Compaction Checkpoint, Backend-delegated receipt, and External Agent Client custody inspection without presenting summaries or partial receipts as canonical truth.
- [ ] Add Developer Check mode for SDK input coverage, horizontal and vertical query facts, bundle provenance, sandbox diagnostics, fixture results, preview, and historical replay.
- [ ] Keep CLI as full deterministic operational and high-authority confirmation surface.
- [ ] Keep Pi TUI only as an optional External Agent Client Integration; delete it if App, CLI, and MCP make its remaining value insufficient.
- [ ] Validate keyboard, assistive technology, reduced motion, contrast, bounded rendering, reconnect, reset, and actionable failure states.

### 5. Implement stage-oriented MCP Server binding

- [ ] Implement `src/server/mcp/**` over modern MCP `2026-07-28` as the preferred External Agent Client binding; isolate legacy compatibility only when exact external-client gates require it.
- [ ] Keep MCP explicitly inbound: it lets independently operated harnesses participate but does not replace Backend outbound delegation through DSH subagent adapters.
- [ ] Reserve the CodeWiki tool namespace and expose only `codewiki_stage_context`, `codewiki_stage_query`, `codewiki_stage_submit`, `codewiki_stage_status`, `codewiki_stage_confirm`, and optional `codewiki_context_run`.
- [ ] Map every tool to authenticated Runtime gateway operations; MCP payloads cannot assert trusted receipts, Gate outcomes, lifecycle transitions, canonical time, or delivery authority.
- [ ] Make `codewiki_stage_query` accept bounded declarative batches with exact query/snapshot digests, source refs, ordering, coverage, unknowns, truncation, cursor, query-engine identity, and staleness.
- [ ] Carry explicit project, stage, subject, Change revision, attempt, Claim, Workbench, expected tree or state, Candidate digest, actor-scoped idempotency, and delegation identities as applicable; never rely on MCP session state.
- [ ] Return durable CodeWiki operation IDs; MCP disconnect cannot cancel accepted work.
- [ ] Treat `clientInfo`, JSON-RPC IDs, instructions, elicitation, external model claims, and Candidate-supplied receipts as non-authoritative.
- [ ] Record only actual CodeWiki calls as external-client custody and explicitly exclude external prompts, tools, Skills, local reads, subagents, models, code runtimes, and memory.
- [ ] Do not assume MCP tools appear inside an External Agent Client's Python or TypeScript Code Mode; declarative batch queries remain the universal programmatic surface.
- [ ] Benchmark direct calls, declarative batches, and optional `codewiki_context_run`; retain the programmatic form only with material context or turn savings.
- [ ] If retained, make each context run fresh, immutable, import-free, filesystem-free, network-free, process-free, environment-free, credential-free, bounded, cancellable, ledgered, and canonical-JSON-only; optional scratch is bounded canonical JSON with CAS.
- [ ] Classify any unmatched tree as external provenance rather than silently inheriting external-client custody.
- [ ] Test exact supported Claude Code, Codex, Pi, DSH, and future External Agent Client versions in disposable external projects independently from Backend-delegated adapter tests.

### 6. Build CodeWiki Agent Runners, exact Stage Context, and state-aware sessions

Existing Pi execution remains temporary migration evidence only. This slice creates the DSH path, proves semantic parity, then removes the Pi executor without a user-facing backend selector, compatibility adapter, or dual-session contract.

- [x] Define the content-addressed Runner Bundle manifest, independent reviewed-source and executed-package closure digests, qualification Evidence binding, expected-generation activation CAS, exact new-run binding and process handshake, rollback, and same-bundle-only resume contract under neutral Execution Ports.
- [ ] Pin one exact DSH package and commit closure with no loose semver; record its Cordis and Backend Plugin closure and qualify every upgrade before activation.
- [x] Define one narrow immutable Run Specification and raw-log reference under neutral `src/execution/ports.ts`, binding exact role and stage, subject, Runner Bundle, session, Stage Context and static-input manifests, prompts, Skills, tools, model route, repository snapshot or Runtime Workbench, budgets, custody, and deadline without a generic multi-backend feature matrix.
- [x] Define the Agent Run handle, append-only event, expected-sequence cancellation, quiescence, and custody-scoped Execution Receipt contracts under the same neutral port boundary; delegated visibility gaps remain distinct from operational gaps, and incomplete execution can produce only `stopped`.
- [ ] Implement Agent Supervisor and an authenticated process protocol for isolated CodeWiki Agent Runners; Runner processes receive no Runtime persistence, canonical state, protected-ref, or credential-store handles.
- [ ] Build a CodeWiki-owned DSH composition from admitted core services rather than stock web/headless profiles; disable profile discovery, user patches, HMR, workspace instructions, filesystem Skills, dynamic Cordis, creation mode, DSH UI/Host, ambient settings, and product MCP client.
- [ ] Use DSH's standard Agent registry, scoped `setup`, Turn Loop, append-only Session events, request-reconstruction invariant, tool pipeline, LLM adapter, cancellation, and quiescence mechanics; do not reimplement CodeWiki Stage Loops inside DSH.
- [x] Retain the existing harness-neutral immutable Pack Skill snapshot and Stage Execution Port contracts as migration inputs.
- [ ] Implement a first-party Pack Skill Backend Plugin that loads only exact stable Pack-ID snapshots and intersects `allowed-tools`, scripts, and setup guidance with capabilities already admitted for the attempt or Assignment.
- [ ] Define the closed v1 first-party Backend Plugin roster and exact capability contracts for tools, context bindings, Skills, model adapters, delegate adapters, observers, and compaction; expose no raw Cordis project-plugin surface.
- [x] Preserve proof that Code and Model Check executors never inherit Pack Skills, producer tools, context, memory, credentials, or authority.
- [ ] Define one Backend Agent Run Specification binding stage, subject, WorkState, repository, Knowledge, Alignment, Pack Skills, tools, model route, DSH/plugin closure, budgets, cancellation, isolation, and custody; only Implementation Assignments receive writable Runtime Workbenches.
- [ ] Retain immutable raw DSH Session bytes and emit one append-only Execution Ledger plus receipt binding exact model-visible prompts, Skill files, tool schemas, Stage Context, each CodeWiki query request and response digest, compaction relationships, provider/model options, budgets, timing, cancellation, usage, output, and isolation.
- [ ] Implement one immutable Runtime Stage Context facade over existing WorkState, Knowledge, Alignment, repository, Change, Evidence, and Result query owners; create no duplicate graph or context store.
- [ ] Route Decision, Planning, Implementation, Review, and research through separate Backend Agent Run ports where model execution is required; use one isolated DSH session per stage attempt and per Implementation Assignment.
- [ ] Keep every Model Check in an independent tool-free DSH session with separate route, prompt, context, memory, budget, and receipt; no producer tools, Skills, or session ancestry cross the boundary.
- [ ] Implement deterministic pruning of retained large query/tool results to stable ledger locators before lossy summarization while preserving tool-call/result pairing, source event links, and exact raw history.
- [ ] Implement one state-aware compaction Backend Plugin over DSH pressure and replacement seams; retain a recent tail and deterministically rehydrate canonical stage, subject, WorkState, Knowledge, Alignment, repository, Skill, authority, and Gate feedback facts.
- [ ] Enforce exactly one compaction owner per session and keep DSH sessions and provider memory disposable; never depend on a persistent Python/V8 heap, serializer, or summary for recovery.
- [ ] Benchmark optional `codewiki_context_run` over DSH Code Mode; if retained, expose only fresh immutable generated bindings with canonical-JSON values and no filesystem, imports, network, process, environment, credentials, workflow registration, or persistent heap.
- [ ] Implement Backend-delegated Claude Code, Codex, and ACP adapters through DSH's subagent seam with explicit capability advertisements, exact Workbench cwd, scrubbed environment, process-tree disposal, final output, resulting-tree receipt, and declared unknown child internals.
- [ ] Treat stock delegated adapters as non-hermetic until CodeWiki-specific isolation proves exact product settings, tools, model, and trace custody; no adapter may silently claim Backend-owned provenance.
- [ ] Keep DSH workflows, Ralph, goals, plan mode, task lists, model-facing jobs, approval policy, local credentials, and hook bridges outside product lifecycle; add one only through a separately ratified first-party Backend Plugin need.
- [ ] Add conformance for request reconstruction, append-only history, tool-call/result pairing, tool-set monotonicity, Skill/context receipt agreement, snapshot agreement, cancellation convergence, process quiescence, session persistence, compaction, delegate cleanup, and sandbox receipt agreement without turning invariants into project Checks.
- [ ] Prove crash/restart recovery and reject active-session resume across any unqualified DSH, Cordis, Backend Plugin, model adapter, or format change.
- [ ] Port Decision production, one tool-free Model Check, one Implementation Worker, state-aware compaction, and one delegated Claude/Codex scenario before declaring parity.
- [ ] Create a HEAD-anchored clean-cut manifest, delete `src/execution/pi/**`, Pi execution tests and package dependencies, and every Pi execution branch after DSH parity; retain only optional `src/clients/pi/**` and `src/pi-extension.ts` Client integration if still valuable.
- [ ] Missing exact capability, context, Runner, delegate, sandbox, receipt agreement, or isolation yields bounded retry followed by stopped execution without fallback, policy weakening, fake Check failure, or Backend crash.

### 7. Activate Runtime-owned parallel Implementation workbenches

- [ ] Make isolated worktrees mandatory for every controlled Implementation Assignment, including serial execution; Decision, Planning, and Review producers receive immutable context without Workbench write authority.
- [ ] Keep `runtime.maxWorkers = 1` as safe Implementation concurrency default.
- [ ] For `maxWorkers > 1`, claim independent ready Work Items and require one isolated worktree, Assignment, Implementation Worker identity, cancellation path, report, and usage receipt per Claim.
- [ ] Integrate compatible reports deterministically with expected-head CAS, then run the Implementation and Review Gates over the exact integrated head.
- [ ] Deny canonical descendant scheduling, mutable workspace sharing, implicit authority renewal, canonical writes, and effects from Workers.
- [ ] Implement cancellation, crash recovery, stale claim recovery, conflict handling, and workbench cleanup.

### 8. Implement accountability-closed provenance and External Candidate Intake

- [ ] Define Candidate Manifest and External Candidate Capture schemas with repository, base, head, tree, scope, Backend-owned, Backend-delegated, external-client, or external custody, provenance, and digest bindings.
- [ ] Recognize controlled provenance only from exact persisted Runtime custody, and require each accepted transition to identify prior state, proposed state, producer and custody, judged subject, Checks and Evidence, authority, effects, and resulting state without requiring exhaustive incidental-activity logging.
- [ ] Detect local dirty trees, direct commits, pushes, PRs, and synchronized branch divergence against accepted state; observation creates Evidence or intake and never advances a Stage Loop by itself.
- [ ] Capture tracked changes under Runtime-owned refs/worktrees without mutating user branch; require explicit selection for untracked files.
- [ ] Route exact accepted-Change captures through Candidate admission and fresh Implementation and Review Gates.
- [ ] Route missing-intent or out-of-scope captures through Change Intake, deduplication, triage, proposed Change, and explicit acceptance.
- [ ] Separate GitHub issue intake from GitHub PR/commit/push Candidate intake.
- [ ] Project required CodeWiki GitHub Check and branch protection where configured; detect administrator overrides as external divergence on next synchronization.
- [ ] Create or update one integrated PR per Change after a passed Implementation Gate; do not create one PR per Work Item by default.
- [ ] Run the separate Review Stage Loop and its user-owned Packs against the exact integrated head; support fully automated Code and Model review without requiring human Evidence.
- [ ] Retrieve authenticated provider reviews and Checks when present, correlate exact heads, and guard merge with a passed Review Gate, current Runtime authority, provenance, and CAS.
- [ ] Send failed Review feedback to Implementation; send out-of-scope findings to Change Intake without a generic Router.
- [ ] Never treat PR state, labels, branch names, authors, Agent/model identity, or provider conclusions as CodeWiki acceptance, provenance, Check Result, or merge authority.

### 9. Finish Change, WorkState, Alignment, and synchronization cuts

- [x] Move canonical Change protocol, encoding, manifests, reduction, and replay to `src/changes/trace/**`.
- [x] Move Alignment Graph and bounded queries to `src/alignment/**`.
- [x] Keep canonical current projection in `src/work-state/**`.
- [x] Delete intermediate `src/change-trace/**` and legacy `src/traces/**` after callers move.
- [x] Delete obsolete WorkState paths and generic `src/views/**` after callers move.
- [x] Preserve append-only history, deterministic replay, expected-head CAS, provenance, remote synchronization, and recovery behavior.
- [ ] Stabilize read-only bounded snapshot-bound context, state, attention, explanation, and Change queries with query and complete snapshot digests, source refs, deterministic ordering, coverage, unknowns, truncation, cursor position, query-engine identity, provenance, and staleness.
- [ ] Define one `QueryPage<T>` contract and bounded declarative batch request reusable by Backend Agents, eligible delegated adapters, MCP, App, and Check SDK adapters without exposing owner internals.
- [ ] Compose one immutable Stage Context baseline from existing WorkState, Knowledge, Alignment, repository, Change, Evidence, and Result owners; create no second graph, store, or live-working-tree fallback.
- [ ] Publish Check-facing immutable query contracts for OKF Knowledge, repository content, code, tests, local revisions, commits, exact pull-request Evidence, Change and Work Item state, and Alignment facts.
- [ ] Support bounded horizontal inspection and vertical traversal from Knowledge through source ownership, tests, revisions, accepted work, Evidence, Results, and delivery while binding every response to exact snapshot identity.
- [ ] Define Actor Profiles, scoped Authority Grants, responsibility rules, Review Requirements, per-requirement Review Claims, and immutable Review Submissions.
- [ ] Populate owner, user, reviewer, contributor, stage-producer, and Implementation Worker eligibility through read-only Contribution Routing before any automatic assignment.
- [ ] Keep Profile fit, Authority Grant, active Claim, and authenticated Operation as separate facts; never infer authority from expertise or ownership hints.

### 10. Complete root Checks, Check Packs, Pack Skills, SDK, and Gates

The active kernel now has exact Candidate and execution identities, versioned Check/Invocation/Output/Result/Gate contracts, stage-first Pack and Skill snapshots, producer receipt binding, deterministic thresholds, independent Model transport, bounded scheduling and retries, exact completed-Result caching, stopped Gate semantics, executable exact-head Review persistence, and historical Change Trace boundary translation. Remaining work adds immutable repository intelligence and author-facing SDK composition without weakening that completed semantic core, then finishes product authoring, marketplace transport, and isolated Loop Quality removal.

Execution order is fixed: establish the isolated DSH Agent Runner, neutral Run Specification, first-party Backend Plugin closure, and conformance suite; implement the shared immutable query page and Stage Context facade; retain exact DSH model-visible inputs and state-aware compaction; prove one delegated adapter and clean-delete Pi execution; split Decision Candidate production, Gate, durable feedback, authorized confirmation, and commit; implement stage-oriented MCP and benchmark optional programmatic querying; build the Check SDK and use real first-party replacements for isolated Loop Quality to calibrate it; then land standalone App, marketplace, and post-Gate Outcome Diagnostics. Each structural source slice receives a new HEAD-anchored manifest and full external-package gates.

#### Completed Check, Result, and Gate kernel

- [x] Implement `.codewiki/check-packs/<stage>/<pack>/<check-id>/check.json` beside exactly one `CHECK.md` or `CHECK.mjs`, with no extra `checks/` level or required local Pack manifest.
- [x] Publish versioned schemas for `check.json`, bounded input selectors, Code and Model Check outputs, completed Results, Gate Reports, warnings, and stopped execution reasons before migration consumers land.
- [x] Define and bootstrap one minimal bare-bones empty `default/` Pack for each of Decision, Planning, Implementation, and Review; permit users to edit or delete every default and never restore content on upgrade.
- [x] Treat folder presence as the active Check set; remove protected floors, enforcement tiers, required Check IDs, hidden catalogs, and activation transactions.
- [x] Make zero Checks pass with persistent `no_checks_configured` warning and make empty named Packs warn without synthetic Results.
- [x] Define only Code and Model Check implementations plus binary and quantitative measurements; derive quantitative pass/fail from finite minimum/maximum thresholds.
- [x] Require one pass condition, one fail condition, one stable failure code, and one feedback object per registered Check; permit multiple factual details or locations but no multiple authoritative failure classes.
- [x] Admit Results only for completed `passed | failed` Checks. Replace indeterminate Results with stopped Check Runs and `passed | failed | stopped` Gate Reports.
- [x] Bound retries and stop reasons for timeout, cancellation, missing input, invalid output, unavailable model or sandbox, exhausted budget, and staleness; preserve lifecycle state on stopped Gates.
- [x] Resolve exact cache hits, run uncached Code Checks in bounded parallel, fail fast before Model Checks, then run Model Checks in bounded parallel and stop queued work after conclusive failure or stop.
- [x] Keep Model Checks tool-free and independent from producer and Implementation Worker routes under one fixed structured-output protocol; delegate Code Checks only to bounded admitted hermetic sandboxes with network denial and no host fallback.
- [x] Delete Check-authored route hints and Repair Profile/Frontier/Brief/Bundle layers; failed Results carry feedback directly to the responsible Stage Loop.
- [x] Keep Check Pack creation and mutation out of CodeWiki Backend Agents and dedicated Pack-management CLI tooling; publish the core schema and stage-first layout for manual editors and user-controlled external Agents.
- [x] Preserve only SARIF, JUnit XML, LCOV, Cobertura, CycloneDX, SPDX, Pact, OpenAPI, and provider-check receipts as bounded Evidence formats.

#### Optional Pack Skills

- [x] Extend each Pack with one optional reserved `skill/<skill-name>/` standard Agent Skill while preserving direct Check directories, no `checks/` level, and no required local Pack manifest.
- [x] Validate Skill frontmatter, immediate-parent name, complete bounded file tree, path confinement, project-wide active name uniqueness, and deterministic stable Pack ordering.
- [x] Publish immutable Skill snapshot and digest contracts separate from Check Pack snapshot, Check Result, and Gate cache identity.
- [x] Bind exact Skill snapshots to producer attempts and execution receipts; make a changed Skill stale only affected producer work.
- [x] Keep ambient harness Skills disabled and prove Pack Skills reach only work-producing Agents, never Code or Model Check executors.
- [x] Permit standard Skill scripts, references, assets, setup guidance, and `allowed-tools` metadata without allowing them to exceed capabilities admitted for the current stage attempt or Implementation Assignment, or Runtime authority.
- [ ] Keep Skill improvement analysis non-authoritative and emit only ordinary Outcome Diagnostic findings or Change Intake Material after durable outcome history exists.

#### Check Author SDK and composition

- [ ] Define only Probe and Check authoring primitives: Probes return bounded snapshot-bound facts without verdicts; Checks return binary or quantitative judgments.
- [ ] Make `check.json` registration of the default top-level Check the sole Result, cache, retry, stable failure-code, feedback, and Gate boundary.
- [ ] Permit source-level import and composition of pure libraries, Probes, and Checks while forbidding runtime invocation of another installed Check by Pack identity.
- [ ] Bundle the complete author dependency closure into one readable self-contained `CHECK.mjs`; keep author source, tests, fixtures, and dependency installation outside active `.codewiki/check-packs/**` files.
- [ ] Define deterministic composition semantics for all, any, none, count, iteration, and quantitative score without introducing a workflow DAG or another domain.
- [ ] Publish one reserved read-only `codewiki` SDK binding over exact OKF Knowledge, repository, code, tests, local revisions, commits, pull-request Evidence, Change and Work Item state, Result history, and Alignment facts.
- [ ] Require every SDK query page to report query and complete snapshot digests, source refs, deterministic ordering, provenance, coverage, unknowns, truncation, cursor position, query-engine identity, and staleness.
- [ ] Bind Invocation and cache identity to the complete immutable snapshot, Probe implementation, canonical arguments, query-engine/configuration digests, and declared limits; record actual query calls afterward as Result provenance rather than a precomputed cache key.
- [ ] Add bounded diagnostic builders that preserve vertical references from Knowledge through source, tests, revisions, accepted work, Evidence, and Results.
- [ ] Add SDK validation, readable bundling, fixture testing, admitted sandbox preview, and historical Invocation replay without Pack installation or mutation authority.
- [ ] Keep producer `codewiki_context_run` outside the Check SDK; a Code Check receives only its reserved immutable binding, and a Model Check remains tool-free.
- [ ] Use the first real SDK Checks to replace remaining isolated Loop Quality debt and calibrate the API before public stability.

#### Product authoring and marketplace transport

- [ ] Implement App stage/Pack navigation, optional Skill editing, effective Skill composition, Model Check forms, one-file Code Check upload, validation, sandbox preview, delete/edit support, and developer SDK inspection over the same tracked files.
- [ ] Implement npm discovery with `codewiki-check-pack` plus exact npm, Git, and local installation through `codewiki.checkPacks` or conventional `check-packs/` resources.
- [ ] Treat `package.json` only as transport metadata; never replace `check.json` or import Pi extensions, prompts, themes, settings, or lifecycle behavior into the Pack contract.
- [ ] Run no package lifecycle, Skill, or Check code during installation; vendor only optional Skill and runtime Check files into editable project files.
- [ ] Record exact source, integrity, separate Skill and Check base digests, complete installed-package digest, and local divergence; make updates explicit and diff-safe.

### 11. Normalize feedback, discovery, and Outcome Diagnostics

- [ ] Define versioned producer-neutral Discovery Finding, Outcome Diagnostic finding, and Implementation Worker-report schemas.
- [ ] Keep current Candidate repair in `failed Check Result → one atomic feedback object → responsible Stage Loop → fresh Candidate`.
- [ ] Return Decision, Planning, and Implementation failure to the same Stage Loop; return Review failure to Implementation through fixed Runtime lifecycle.
- [ ] Send new or out-of-scope work through Discovery Finding and Change Intake Material as secondary intake, not a Router transition.
- [ ] Keep out-of-scope blockers failed until a dependency Change or explicit scope expansion is accepted.
- [ ] Run Outcome Diagnostics only after one Gate or across bounded retained outcome history; never let diagnostic classification convert a failed Check into pass or alter the current Candidate.
- [ ] Permit bounded non-authoritative findings or exact diffs for Skills, Checks, Stage Context APIs, model routes, budgets, and configuration; bind stage, base digests, supporting Results and refs, expected behavior, uncertainty, and risks.
- [ ] Normalize every diagnostic suggestion as ordinary deduplicated Change Intake Material; require Decision, Planning, Implementation, Review, authenticated authority, and expected-head application before mutation.
- [ ] Stopped Gates, unavailable execution, malformed outputs, and model speculation never count as semantic evidence for changing guidance or policy.
- [ ] Never let installed CodeWiki automatically mutate project policy or file work against upstream CodeWiki.

### 12. Build external product Benchmarks

- [x] Move supported measurement code from `src/benchmarks/**` to repository-root `benchmarks/**`, keep it typechecked, and do not ship it.
- [ ] Compare the same stage producer or Implementation Worker, model route, task, repository, tools, network, budget, timeout, concurrency, retries, environment, and trials in `alone` and `codewiki` modes.
- [ ] Use external fixtures and oracles; operational discovery is not Benchmarking.
- [ ] Benchmark digest-bound atomic feedback variants without automatic promotion.
- [ ] Block release on false exits, unauthorized effects, or escaped critical defects regardless of aggregate score.

### 13. Add collaboration channels incrementally

- [ ] Add first-party Slack and GitHub adapters after Client-Server Protocol stabilizes.
- [ ] Permit Change Intake from any paired channel capable of bounded authenticated input, including WhatsApp.
- [ ] Keep submitting intake distinct from accepting Change or granting protected authority.
- [ ] Evaluate optional OpenClaw connector before native broad-channel expansion.
- [ ] Add native WhatsApp only when demand justifies credential, delivery, and maintenance cost.
- [ ] Never inject ambient channel history, secrets, or full diffs into Backend Agent or Delegated Agent Runs by default.

### 14. External proof and release gates

- [ ] Run real Gitleaks, Semgrep, and offline Trivy profiles with exact receipts.
- [ ] Run sealed scanner, Code Check, and Model Check calibration against independent human-labeled cases.
- [ ] Prove provider authentication, Actor authority, exact Decision confirmation, expected-head mutation, DSH Runner credential isolation, delegated-adapter custody, MCP operation-scoped custody, Implementation Workbench custody, and OCI execution externally.
- [ ] Build and pack reviewed candidates, then install only in disposable external projects with isolated CodeWiki Backend homes, DSH Runner state, provider credentials, and optional Client-product settings.
- [ ] Verify standalone Backend/Server/App/CLI, Agent Supervisor, DSH Agent and Check Runners, optional Pi Client, External Agent Client MCP lifecycle, Backend-delegated Claude Code/Codex/ACP lifecycle, Stage Context, state-aware compaction, Check Packs, optional Pack Skills, npm/Git/local installation, manual and App editing, Code/Model execution, Gate outcomes, Backend-owned Ledgers, custody-limited receipts, external capture, guarded writes, failure paths, and cleanup.
- [ ] Prove exact Pack Skill activation through the first-party DSH Backend Plugin, harness-neutral Skill snapshots, delegated-route eligibility, Stage Producer and Implementation Worker capability ceilings, and complete exclusion from Code and Model Check executors.
- [ ] Prove Check SDK bundle reproducibility, malicious imported-library containment, fixture and historical replay, exact local and pull-request snapshots, and horizontal and vertical OKF/repository/Alignment query coverage.
- [ ] Resolve pinned DSH, Cordis, delegate SDK, and model-adapter dependency advisories or document accepted external constraints.
- [ ] Publish, release, deploy, mutate providers, or expose public network only with explicit maintainer approval.

## Per-slice gates

```text
focused tests
Knowledge profile and diagram validation
TypeScript LSP diagnostics
typecheck
full test suite
build
packed-package smoke
npm audit --omit=dev
git diff --check
pi-lens diagnostics
```

Commit and push every green slice unless explicitly held. Source-repository CodeWiki dogfooding remains prohibited; extension tests run only from packed installs in disposable external projects.

## External blockers

External proof does not block local clean cuts:

- real Gitleaks, Semgrep, Trivy, OCI, provider/user-auth, channel ingress, and sealed calibration;
- automatic distributed expiry without trusted remote time;
- public network exposure and provider delivery credentials;
- DSH preview churn, delegate product compatibility, and external dependency advisories;
- Graphify adapters and controlled paired Benchmark environments.

## Completion and deletion condition

Delete this file when:

- target topology and dependency boundaries are realized;
- standalone CodeWiki Backend, Server, Clients, per-project Runtime, Agent Supervisor, isolated DSH Agent and Check Runners, Backend Agent and Delegated Agent Runs, Stage Producers, Implementation Workers, Stage Context, exact Backend-owned Ledgers, custody-limited receipts, state-aware compaction, provenance, MCP, Checks, optional Pack Skills, Check SDK, four Stage Loops, and Gate contracts are executable;
- legacy Pi execution, generic Harness, Dashboard, trace-host, Verification, Loop Exit, Router, Quality, Repair Bundle, indeterminate Result, Trace, ChangeRecord, generic View, compatibility, and self-dogfood paths are gone;
- source, tests, packed output, and Knowledge agree;
- all hard file budgets and external packed-install gates pass;
- no remaining local task needs this tracker.
