# CodeWiki Refactoring Plan

## Purpose

This temporary document tracks executable drift from accepted `.codewiki/kb/**` architecture. CodeWiki Runtime is not active in this source checkout. Source and tests are executable truth; Git records checkpoints. Delete this file when completion conditions pass.

## Ratified target

CodeWiki is a standalone local-first intent-to-production application:

```text
Users and services
        |
User Interfaces implemented by Clients
App | CLI | Pi | Claude Code | Codex | channels
        |
CodeWiki Client-Server Protocol
        |
CodeWiki Server
Authentication | Pairing | Sessions | Registry | Routing | Delivery
        |
Project Runtime gateway
        |
Authoritative per-project Runtime
Authority | Provenance | Claims | Assignments | Workbenches
Integration | Verification | Recovery | Guarded effects
        |
Workers using Workbenches and Model Providers
        |
Knowledge | Change Trace | Git | Evidence
```

One logical CodeWiki Server serves a deployment and routes many Clients to one authoritative Runtime per managed project. Server and Runtime are architectural siblings that may share a process or machine; co-location grants neither ownership over the other. Server owns connection trust, transport, pairing, sessions, project routing, transport deduplication, reconnect, redaction, and delivery. Runtime owns project AuthZ, semantic idempotency, canonical meaning, admission, provenance, persistence, scheduling, Integration, Verification routing, and effects. Server calls one narrow Runtime gateway and never reads Runtime persistence internals.

A User is a human. An Actor is an accountable authenticated User or service. A User Interface is a human-facing surface implemented by a Client. A Client is software that speaks CodeWiki protocol. Claude Code or Codex acts as a Client while inspecting or requesting work and as a Worker only while executing an accepted Assignment. A Worker is an Agent, process, or service executing one bounded Assignment in one Runtime-owned Workbench. A Model Provider supplies local or remote inference and is distinct from the Worker that owns the Agent loop, tools, Workbench, tests, and Candidate. Worker Node remains deferred until physical placement, capacity, health, or draining becomes first-class.

Authentication proves the identity connecting now. Pairing enrolls one Client installation for one Actor. Session represents one temporary authenticated connection. Runtime Authorization determines whether the Actor may perform one exact project operation. Pairing, Client kind, repository access, job title, profile, model, and Worker ownership grant no project authority. Personal loopback mode uses local pairing. Team mode uses provider-neutral OIDC with GitHub or GitLab OAuth as first adapters and stable `(issuer, subject)` identity. Repository access supplies coarse membership only. CodeWiki adds no password system; hosted identity services remain optional future adapters.

Collaboration follows one rule:

```text
Actor Profile    -> likely fit
Authority Grant  -> may decide within exact scope
Claim            -> currently responsible
Operation        -> proves who performed the exact action
```

Contribution Routing is a read-only Alignment projection over exact Change revision, responsibility rules, Profiles, Grants, Claims, availability, and Worker Offers. It suggests eligible reviewers, contributors, and Workers with reasons, coverage, unknowns, and staleness; initial assignment remains explicit. Mutable reviewer, assignee, Worker, and machine allocation stays outside immutable Change meaning. Review progresses through exact Review Requirement, Review Claim, and immutable Review Submission. Archive follows an explicit `approve | request_revision | defer | reject` disposition and never substitutes for it.

One versioned Client-Server command/query/operation/event protocol serves every binding. MCP `2026-07-28` is preferred where supported. MCP may use “host” for its normative protocol role, but Host is not a CodeWiki architecture role. CLI remains deterministic human, scripting, and high-authority confirmation access. Request context separates accountable Actor identity from Client kind/instance and explicit delegation. Pi is the sole shipped fully managed execution engine.

Every observed Git state receives positive provenance accounting:

```text
exact Runtime Candidate Manifest + custody
  -> controlled provenance
  -> managed when complete Pi receipt exists
  -> MCP-mediated when exact admitted Worker operations exist

no exact custody match
  -> external provenance
  -> immutable External Candidate Capture
  -> exact accepted-Change admission or Change Intake
  -> fresh Verification before certification
```

Branch names, commits, authors, trailers, Git notes, and producer claims cannot prove provenance. External work may be useful and certifiable, but inherits no execution proof. Divergence pauses protected effects and is never silently adopted, overwritten, discarded, or certified.

## Target source topology

The tree below names responsibilities, not permission to create empty directories:

```text
src/
  index.ts
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
    queries/
  changes/
    intake/
    triage/
    review/
    trace/
  decision/
  planning/
  implementation/
  verification/
  evidence/
  work-state/
  alignment/
  knowledge/
  project/
  execution/
    ports.ts
    pi/
  preview/
  git/
  utils/

benchmarks/
scripts/
tests/
```

`src/protocol/**` contains only shared Client-Server wire contracts. Domain protocols remain with their owners. `src/runtime/index.ts` is the curated operational package surface published as `@nunomoura/codewiki/runtime`; `src/runtime/coordinator/**` remains an internal Runtime subsystem. Public `./coordinator`, root `coordinator.ts`, and generic `composition/**` do not survive the clean cut. A neutral `src/main.ts` may later construct Server and Runtime siblings only when standalone process bootstrap genuinely requires it.

Target dependency direction is:

```text
clients   -> protocol
server    -> protocol + Runtime gateway
runtime   -> domain owners + neutral Execution Ports
execution -> ports it implements
bootstrap -> server + runtime + concrete execution
```

Forbidden directions include `runtime -> server`, `runtime -> clients`, `runtime -> concrete Pi`, `server -> Runtime persistence internals`, `domain -> server`, and `clients -> Server process lifecycle`.

Source ownership clean cuts are:

```text
src/host/**          -> src/server/**
src/api/protocol.ts  -> src/protocol/**
other src/api/**     -> Runtime commands/queries or domain owner
src/cli/**           -> src/clients/cli/**
src/change-trace/**  -> src/changes/trace/**
src/traces/**        -> Change Trace or Runtime persistence owner
src/views/**         -> Alignment, WorkState, or Runtime queries
src/loops/**         -> Decision, Planning, Implementation, Verification
src/error-handling/**-> colocated owners
src/benchmarks/**    -> benchmarks/**
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
  check-packs.lock.json
  views/      # disposable projections
  runtime/    # private operational state
```

Knowledge, Change Traces, protected configuration, and tracked Check definitions are source truth. Compact Evidence metadata enters Change Trace while large or private bytes stay in their existing authority boundary. No canonical `.codewiki/evidence/` database or `.codewiki/changes.log` exists. Root `CHANGELOG.md` records package releases. This source checkout keeps active Change Traces absent because CodeWiki cannot dogfood its own extension during stabilization.

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

Rules:

- Until caps pass, each source slice adds no more files than it deletes or merges and should reduce net count.
- Moves improve ownership but do not count as reduction.
- Merge only one responsibility and lifecycle; never combine unrelated code to hit a number.
- Delete stale architecture before adding replacement breadth whenever dependencies permit.
- Server/App/MCP work consumes old Dashboard, trace-host, Client/Harness, Quality, View, and compatibility footprint; caps do not increase.
- `test:coordinator` remains focused and is not rerun inside `audit:codewiki`.

## Work slices

### 1. Ratify architecture and replace stale vocabulary

- [x] Define User, Actor, User Interface, Client, CodeWiki Server, Project Runtime, Worker, Assignment, Workbench, and Model Provider in Knowledge.
- [x] Ratify Server and per-project Runtime as architectural siblings with one-way Server-to-Runtime gateway access.
- [x] Separate Authentication, Pairing, Session, and Runtime Authorization responsibilities.
- [x] Ratify Profile, Authority Grant, Claim, immutable Operation, Contribution Routing, and review lifecycle semantics.
- [x] Ratify `src/protocol/**`, `src/server/**`, `src/runtime/index.ts`, `@nunomoura/codewiki/runtime`, target dependency direction, and `.codewiki/**` canonical layout.
- [x] Define controlled, managed, MCP-mediated, and external provenance plus External Candidate Capture.
- [x] Make Runtime—not Loops—invoke shared Verification and select routes.
- [x] Preserve first-party App, CLI, and Pi Clients while allowing external Clients to accept bounded Worker Assignments.
- [ ] Update README and package description after executable topology exists; do not advertise unfinished capability.

### 2. Execute deletion-first ownership cut

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
- [ ] Delete legacy Quality, generic View authority, obsolete Loop compatibility, and old Trace/ChangeRecord paths as replacement consumers land.
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
- [x] Move shared wire contracts to `src/protocol/**` and clean-cut protocol IDs to `codewiki.client-server@1.0.0`, `codewiki.client-pairing@1.0.0`, and `codewiki.server-registry@1.0.0` without dual parsing.
- [ ] Move semantic `src/api/**` handlers to Runtime commands/queries or their domain owners; remove the `api <-> runtime` dependency cycle.
- [x] Add a narrow Project Runtime gateway for commands, bounded queries, durable operations, and events; Server cannot read Runtime persistence internals.
- [x] Replace public `./coordinator` with curated `./runtime` backed by `src/runtime/index.ts`; delete duplicate Host/Runtime coordinator entrypoint barrels without aliases.
- [ ] Move `src/cli/**` to `src/clients/cli/**` and remove Client-to-Server lifecycle imports through neutral bootstrap wiring.
- [ ] Implement one machine-level Server registry over separate per-project Runtime processes.
- [ ] Implement loopback binding, origin/token checks, pairing, stable actor mappings, reconnect cursors, deep links, redaction, and durable delivery.
- [ ] Implement local pairing for personal mode and provider-neutral OIDC with GitHub/GitLab OAuth first for team mode; persist immutable `(issuer, subject)`, not mutable usernames.
- [ ] Treat provider repository access as coarse project membership only; require secure Server session authentication and exact Runtime AuthZ for every protected operation.
- [ ] Keep Clerk, WorkOS, password authentication, and enterprise identity lifecycle dependencies outside the initial foundation.
- [ ] Ensure browser or terminal closure cannot stop accepted work.
- [ ] Make adapter capability declaration intersect actor Authority Grants, explicit delegation, project policy, and current Runtime guards.

### 4. Build CodeWiki App and first-party Clients

- [x] Replace Dashboard-local workflow/session query ownership with bounded Runtime projections; typed Runtime mutation operations remain pending.
- [ ] Implement App surfaces for Change, Decision, Planning, Implementation, Work Items, Candidates, provenance, Checks, Evidence, Exit Reports, Repair, Integration, and effects.
- [ ] Keep CLI as full deterministic operational and high-authority confirmation surface.
- [ ] Keep Pi TUI as optional expert Client; it cannot double as controlled execution.
- [ ] Validate keyboard, assistive technology, reduced motion, contrast, bounded rendering, reconnect, reset, and actionable failure states.

### 5. Implement stateless MCP Client and Worker binding

- [ ] Implement modern MCP `2026-07-28` as preferred binding; isolate legacy compatibility only when exact external-client gates require it.
- [ ] Expose a small stable catalog over Server Protocol for intake, bounded context, work admission, Workbench operations, status, submission, and cancellation.
- [ ] Carry explicit project, Change, attempt, claim, workbench, expected-tree, and idempotency identities on calls; never rely on MCP session state.
- [ ] Return durable CodeWiki operation IDs; MCP disconnect cannot cancel accepted work.
- [ ] Treat `clientInfo`, JSON-RPC IDs, instructions, and elicitation as non-authoritative.
- [ ] Provide project integration that strongly directs Claude Code and Codex through MCP using required server configuration, read-only native mutation policy, and supported hooks, while acknowledging those controls are not a universal security boundary.
- [ ] Classify any resulting unmatched tree as external provenance rather than silently inheriting mediated custody.
- [ ] Test exact supported Claude Code and Codex versions in disposable external projects.

### 6. Harden Managed Execution

- [ ] Pin supported Pi SDK version and update package ranges deliberately.
- [ ] Require explicit ResourceLoader, tool allowlist, isolated agent directory, Runtime-owned worktree, CodeWiki context envelope, exact model route, budgets, cancellation, and disabled ambient prompts/extensions/skills/settings/project-agent config.
- [ ] Define execution receipts binding Pi version, route, tools, context, claim, worktree, base, timing, cancellation, usage, and output.
- [ ] Route Decision, Planning, Implementation, Repair, research, assisted authoring, and Model Checks through managed Pi ports where model execution is required.
- [ ] Keep Pi sessions disposable; canonical continuity uses Change, Candidate, Work Item, operation, and Exit Report identity.
- [ ] Missing exact capability yields unavailable or indeterminate without fallback or policy weakening.

### 7. Activate Runtime-owned parallel workbenches

- [ ] Make isolated worktrees mandatory for every controlled Candidate producer, including serial execution.
- [ ] Keep `runtime.maxWorkers = 1` as safe concurrency default.
- [ ] For `maxWorkers > 1`, claim independent ready Work Items and require one isolated worktree, assignment, worker identity, cancellation path, report, and usage receipt per claim.
- [ ] Integrate compatible reports deterministically with expected-head CAS, then verify combined Candidate.
- [ ] Deny canonical descendant scheduling, mutable workspace sharing, implicit authority renewal, canonical writes, and effects from Workers.
- [ ] Implement cancellation, crash recovery, stale claim recovery, conflict handling, and workbench cleanup.

### 8. Implement total provenance and External Candidate Intake

- [ ] Define Candidate Manifest and External Candidate Capture schemas with repository, base, head, tree, scope, custody, provenance, and digest bindings.
- [ ] Recognize controlled provenance only from exact persisted Runtime custody.
- [ ] Detect local dirty trees, direct commits, pushes, PRs, and synchronized branch divergence against accepted state.
- [ ] Capture tracked changes under Runtime-owned refs/worktrees without mutating user branch; require explicit selection for untracked files.
- [ ] Route exact accepted-Change captures through Candidate admission and fresh Verification.
- [ ] Route missing-intent or out-of-scope captures through Change Intake, deduplication, triage, proposed Change, and explicit acceptance.
- [ ] Separate GitHub issue intake from GitHub PR/commit/push Candidate intake.
- [ ] Project required CodeWiki GitHub Check and branch protection where configured; detect administrator overrides as external divergence on next synchronization.
- [ ] Create or update one integrated PR per Change after fresh combined Verification; do not create one PR per Work Item by default.
- [ ] Retrieve authenticated provider reviews and Checks, correlate exact heads, and guard merge with current Runtime authority, policy, and CAS.
- [ ] Route exact PR findings to current repair when scope remains within the Change or to new Change Intake when intent or scope differs.
- [ ] Never treat PR state, labels, branch names, authors, or provider conclusions as CodeWiki acceptance, provenance, Result, or merge authority.

### 9. Finish Change, WorkState, Alignment, and synchronization cuts

- [ ] Move canonical Change protocol, encoding, manifests, reduction, and replay to `src/changes/trace/**`.
- [ ] Move Alignment Graph and bounded queries to `src/alignment/**`.
- [ ] Keep canonical current projection in `src/work-state/**`.
- [ ] Delete intermediate `src/change-trace/**`, legacy `src/traces/**`, obsolete WorkState paths, and generic `src/views/**` after callers move.
- [ ] Preserve append-only history, deterministic replay, expected-head CAS, provenance, remote synchronization, and recovery behavior.
- [ ] Stabilize read-only bounded snapshot-bound context, state, attention, explanation, and Change queries with coverage, truncation, provenance, and staleness.
- [ ] Define Actor Profiles, scoped Authority Grants, responsibility rules, Review Requirements, per-requirement Review Claims, and immutable Review Submissions.
- [ ] Populate owner, user, reviewer, contributor, and Worker eligibility through read-only Contribution Routing before any automatic assignment.
- [ ] Keep Profile fit, Authority Grant, active Claim, and authenticated Operation as separate facts; never infer authority from expertise or ownership hints.

### 10. Complete Check Pack and Verification execution

Already complete: local Pack catalog and configuration contracts; conservative Candidate applicability; Candidate-bound policy persistence; Check Invocation/Observation; admitted Results; complete Exit Reports; structured findings; Repair Profiles; Repair Frontiers; Repair Briefs/Bundles; native Verification projection.

Remaining:

- [ ] Replace active legacy Quality and Custom Check consumers with native Verification, then delete old contracts and modules.
- [ ] Materialize Default Pack and exact local/npm/Git installation with `.codewiki/check-packs.lock.json`, no lifecycle scripts, immutable integrity, and trust approval.
- [ ] Run every code Check in admitted sandbox; no sandbox yields unavailable.
- [ ] Run every Model Check tool-free with exact Pi route, bounded context, structured output, and isolation; missing capability yields indeterminate or unavailable.
- [ ] Keep Check evaluator route independent from authoring or repair route.
- [ ] Implement deterministic forms, developer mode, and explicit Managed Execution-assisted authoring over same tracked files.
- [ ] Preserve exactly one Result per selected Check and existing fail-closed reduction.
- [ ] Preserve only SARIF, JUnit XML, LCOV, Cobertura, CycloneDX, SPDX, Pact, OpenAPI, and provider-check receipt as bounded Evidence formats.

### 11. Normalize repair, discovery, and improvement

- [ ] Define versioned producer-neutral Discovery Finding and shared worker Observation schemas.
- [ ] Keep current Candidate failure in `Result → Exit Report → Repair Bundle → repaired Candidate`.
- [ ] Route new or out-of-scope work through Discovery Finding and Change Intake Material.
- [ ] Keep required out-of-scope blockers blocked until dependency Change or explicit scope expansion is accepted.
- [ ] Name deliberate operational discovery Improvement Assessment.
- [ ] Never let discovery classification convert failing required Check into pass.
- [ ] Never let installed CodeWiki automatically file work against upstream CodeWiki.

### 12. Build external product Benchmarks

- [ ] Move supported measurement code from `src/benchmarks/**` to repository-root `benchmarks/**` and do not ship it.
- [ ] Compare the same Worker or managed Agent, model route, task, repository, tools, network, budget, timeout, concurrency, retries, environment, and trials in `alone` and `codewiki` modes.
- [ ] Use external fixtures and oracles; operational discovery is not Benchmarking.
- [ ] Benchmark digest-bound repair variants without automatic promotion.
- [ ] Block release on false exits, unauthorized effects, or escaped critical defects regardless of aggregate score.

### 13. Add collaboration channels incrementally

- [ ] Add first-party Slack and GitHub adapters after Client-Server Protocol stabilizes.
- [ ] Permit Change Intake from any paired channel capable of bounded authenticated input, including WhatsApp.
- [ ] Keep submitting intake distinct from accepting Change or granting protected authority.
- [ ] Evaluate optional OpenClaw connector before native broad-channel expansion.
- [ ] Add native WhatsApp only when demand justifies credential, delivery, and maintenance cost.
- [ ] Never inject ambient channel history, secrets, or full diffs into Managed Execution by default.

### 14. External proof and release gates

- [ ] Run real Gitleaks, Semgrep, and offline Trivy profiles with exact receipts.
- [ ] Run sealed scanner/evaluator calibration against independent human-labeled cases.
- [ ] Prove provider authentication, actor authority, expected-head mutation, Pi credential isolation, MCP-mediated workbench custody, and OCI execution externally.
- [ ] Build and pack reviewed candidates, then install only in disposable external projects with isolated Pi settings.
- [ ] Verify Server/App/CLI/Pi/MCP lifecycle, Check Packs, assisted authoring, managed receipts, external capture, guarded writes, failure paths, and cleanup.
- [ ] Resolve optional Pi SDK dependency advisories or document accepted external constraints.
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
- optional Pi SDK dependency advisories;
- Graphify adapters and controlled paired Benchmark environments.

## Completion and deletion condition

Delete this file when:

- target topology and dependency boundaries are realized;
- CodeWiki Server, Clients, Project Runtime, Worker, Managed Execution, provenance, MCP, and Verification contracts are executable;
- legacy Harness, Dashboard, trace-host, Quality, Trace, ChangeRecord, generic View, compatibility, and self-dogfood paths are gone;
- source, tests, packed output, and Knowledge agree;
- all hard file budgets and external packed-install gates pass;
- no remaining local task needs this tracker.
