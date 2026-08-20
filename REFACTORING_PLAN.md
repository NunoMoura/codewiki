# CodeWiki Refactoring Plan

## Purpose and current checkpoint

This plan ratifies the deletion-first path from the current replay-qualified DSH Runtime slice to the production CodeWiki architecture. It is the implementation roadmap, not a compatibility promise and not canonical runtime input.

Current executable checkpoint before this refactor: `833f838` (`feat: add admitted DSH context query tools`). That checkpoint proves exact DSH `0.1.0-rc.6` provenance, authenticated Run Processes, isolated replay Sessions, Runtime Builds, immutable context bundles, direct and batch query admission, Execution Ledgers, raw logs, durable evidence stores, Runtime-authored receipt contracts, and a clean production dependency audit. It does not yet implement the ratified production material, continuity, incremental Planning, Work Unit completion, aggregate Review, live-provider, or sandbox architecture.

The Knowledge Base is intended design truth. Source and tests remain executable truth until each slice lands. Every temporary mismatch must be explicit and short-lived.

## Delivery rules

1. Create an exhaustive HEAD-anchored clean-cut manifest before each structural slice. Manifests are audit-only and never runtime or package inputs.
2. Prefer breaking ownership cuts. Do not retain aliases, compatibility barrels, duplicate contracts, selectors, route fallbacks, `Work Item` terminology, rolling-planning adapters, or a permanent Pi/DSH engine switch.
3. Ship one green commit per slice. Every changed line must belong to the slice.
4. Preserve canonical bytes, deterministic identity, expected-head compare-and-swap, authority, provenance, replay, recovery, and effect boundaries.
5. Update Knowledge, source, tests, README, exports, package smoke, and changelog together when executable behavior changes.
6. Use Pi-native development tools in this repository. Never load or dogfood CodeWiki here. Test the packaged extension only in disposable external projects.
7. Stop rather than fabricate a Candidate, Result, integration, transition, receipt, or effect when required evidence is absent or stale.

## Ratified architecture

```text
CodeWiki Project Server
  -> Runtime
    -> authenticated Run Process
      -> CodeWiki DSH Adapter
        -> exact pinned DSH AgentLoop
```

Project Server owns project meaning and authority. Runtime owns bounded execution and Runtime-authored receipts. DSH remains an in-process library inside authenticated empty-environment Run Processes and never speaks the Runtime protocol directly.

### Four Stage Loops

```text
Decision(change)
  -> Planning(change)
    -> Implementation(work-unit-1..N)
      -> Review(exact aggregate change lineage)
```

Decision, Planning, Implementation, and Review produce Candidates. Checks independently judge exact Candidates. Gates reduce completed Results. Project Server alone applies canonical graph changes, Claims, Assignments, integrations, lifecycle transitions, and protected effects.

### Decision

Decision evaluates one exact proposed Change against accepted state and the accepted active Changes. The required invariant is no unresolved semantic contradiction, not no overlap.

The default Decision policy includes an `active_change_compatibility` Model Check over:

- the exact Decision Candidate;
- every relevant accepted nonterminal Change revision;
- explicit `depends_on`, `coordinated_with`, `duplicates`, `supersedes`, and conflict relationships;
- the accepted Work Graph projection;
- complete comparison coverage;
- exact accepted active Changes and WorkState digests.

Existing deterministic target-overlap accounting remains. The model Check adds semantic comparison and cannot replace explicit relationships, CAS, Planning graph validation, or integration proof. Incomplete coverage stops the Gate.

A passed Decision Gate grants no semantic authority. An authorized actor confirms the unchanged Candidate and Gate digest against current accepted active Changes and WorkState heads. Project Server applies confirmation by expected-head CAS. If another Change was accepted after evaluation, affected Results become stale.

Conflict ownership is layered:

| Conflict | Owner |
| --- | --- |
| Contradictory intended states, duplication, supersession | Decision |
| Dependencies, path overlap, execution ordering | Planning |
| Live workers, machines, consent, privacy, budget | Project Server scheduler |
| Actual patch, merge, build, and cross-unit interaction | Integration and Review |

### Planning

Planning operates on one ratified Change. It produces one immutable Change-scoped Work Graph delta, not a whole-project replacement plan.

A Planning Candidate contains:

- exact ratified Change revision;
- observed Work Graph digest;
- singly owned Work Units;
- internal and cross-Change dependency edges;
- explicit Change acceptance coverage;
- independently judgeable outcomes;
- component and path scope;
- technical and Knowledge obligations;
- required capabilities, tools, Skills, custody, and verification;
- strategic parallelism and declarative resource requirements;
- aggregate Review obligations.

Project Server owns the canonical global Work Graph as the union of accepted Change-scoped deltas. A passing Planning Candidate is CAS-appended only when its Change revision and graph head remain current. Planning never selects a worker, machine, provider, live capacity, or schedule. It cannot rewrite unrelated accepted, claimed, or executing units.

Changing accepted decomposition requires an explicit Planning amendment owned by that Change. Shared foundational work should normally become its own Change with dependency edges rather than a multi-owned Work Unit.

Delete rolling multi-Change Planning, planning horizons, Sprints as canonical execution plans, participant-Change epochs, active-work disposition rewrites, and the project-scoped planner Session. Optional future cross-Change optimization is advisory and may propose explicit traced amendments; it never silently replaces the graph.

### Work Unit Implementation

Every Work Unit has exactly one owning Change and one logical Implementation continuity. Independent ready units may execute and be judged concurrently.

Each Work Unit Candidate binds:

- exact owning Change and Work Unit;
- Assignment, Claim, Workbench, and custody;
- dependency outputs and pinned base;
- resulting tree or patch and changed paths;
- source, tests, Knowledge, configuration, and expected heads;
- Evidence, usage, Execution Ledger, raw artifact, and Run Receipt;
- exactly one producing Run.

One resolved stage-wide Implementation Check Pack policy applies to every Work Unit Candidate. Planning, workers, routes, and models cannot select Work Unit-specific Packs. Candidate-specific evaluation packages vary only through exact owning Change acceptance slice, Work Unit obligations, base, dependency outputs, changed paths, Evidence, and receipts. Deterministic applicability may report `not_applicable`; it does not create another policy.

A failed Gate returns feedback to the same Work Unit continuity. A passed Gate qualifies only that Candidate. Project Server then attempts expected-head-safe admission to the Change-owned private integration lineage. Gate pass, integration pending, integrated, stale, and conflicted are distinct states. Changed bytes, base drift, claim loss, custody loss, or merge conflict requires a new Candidate and Gate.

No long-lived Change-level model coordinator owns Implementation. Project Server, WorkState, and the canonical Work Graph coordinate units. If several agents collaborate on one unit, split the unit or make one Run the sole Candidate producer while subordinate outputs remain contributions and Evidence.

### Aggregate Review

A Change remains in Implementation until all required Work Units:

- have current passing Gates;
- integrate successfully;
- satisfy dependency closure;
- cover accepted Planning obligations;
- yield one exact immutable aggregate Change lineage head.

Review uses a fresh independent Session and judges that exact aggregate head. It proves complete ratified Change acceptance, cross-unit behavior, aggregate-only criteria, full build and integration behavior, scope discipline, provenance, and delivery readiness. Work Unit Gates cannot certify merged bytes.

A Review failure normally reopens affected Work Unit Implementation. A decomposition defect requires an explicit Planning amendment. Changed or contradictory meaning requires Decision. Project Server owns these typed routes; Checks and models do not select lifecycle transitions.

Only a fresh passed Review Gate plus separate current authority permits protected delivery.

## Canonical ownership

### Project Server owns

- Actor, project, delegation, authorization, and confirmation;
- accepted active Changes and semantic relationships;
- Change Trace and canonical WorkState;
- Project Material Generation construction and authorization;
- Gate Evaluation Package construction;
- canonical global Work Graph and Change-scoped delta application;
- readiness, durable queueing, Worker Offers, Claims, Assignments, placement, custody, and policy;
- private Change integration lineages and aggregate completion;
- DSH logical-continuity bindings, exclusive Session leases, and expected-head CAS;
- Candidate admission, Gates, typed feedback routes, transitions, and guarded effects;
- durable evidence retention and receipt admission.

### Runtime owns

- exact Runtime Build resolution and admission;
- authenticated Run Process launch and supervision;
- bounded process lifetime, cancellation, quiescence, and exit observation;
- authorized material mounts and private protocol transport;
- Execution Ledger and raw-log capture;
- Runtime-authored Run Receipt creation from validated terminal facts;
- no project meaning, Work Graph, queue, Claim, Assignment, Gate, transition, or effect.

### DSH owns

- AgentLoop request, streaming, tool pairing, and continuation mechanics;
- persistent Agent Session event history;
- checkpoint and compaction mechanics;
- cancellation convergence;
- optional controlled Goal continuation and within-Run ephemeral fan-out;
- no CodeWiki lifecycle, canonical state, scheduling, judgment, or authority.

### Checks owns

- Check and Pack contracts;
- deterministic resolved stage-wide policy snapshots;
- Code and Model Check execution coordination;
- completed Results and exact cache identity;
- Gate Reports;
- no production, route selection, lifecycle transition, or effect.

## Material and evaluation boundary

### Project Material Generation

A `ProjectMaterialGeneration` is an immutable content-addressed locally queryable producer substrate built by Project Server. It contains normalized OKF Knowledge, Alignment and provenance, active Changes, accepted Work Graph and WorkState projections, prior Gate feedback, repository material, Evidence and Results, complete manifest and coverage, and exact query-engine identity.

A producer Session may switch from generation M1 to M2 only at controlled idle turn boundaries. Every query records its generation digest. Old generations and chunks remain reproducible while referenced. Runs mount material read-only and receive no live Project Server storage handle, ambient working-tree fallback, environment, credentials, or unrestricted network.

Typed local services should express CodeWiki semantics rather than arbitrary SQL or graph languages:

- `knowledge_query`;
- `alignment_query`;
- `project_state_query`;
- `repository_query`;
- `project_query_batch`;
- bounded high-level change-delta discovery.

Direct and batch primitives remain available to trusted composition. DSH Code Mode may expose only generated typed SDK bindings once a secure Code Runtime qualifies.

### Gate Evaluation Package

A `GateEvaluationPackage` is a separate immutable authoritative Check input package frozen only after Candidate checkpoint. It binds exact Candidate, repository/tree/base, Change revision, WorkState, Knowledge, Alignment, Evidence, Results, Check Pack files, configuration, routes, and declared inputs.

Checks receive no producer material handle, producer Session, live Project Server handle, or undeclared input. Model Checks remain tool-free. The current `StageContextBundle`, `query_stage_context`, and batch replay path are qualification evidence, not the final production context contract.

## Sessions, Runs, Candidates, and checks

```text
Stage != logical continuity != DSH Agent Session != Run != process/container
```

Provisional continuity keys are now ratified as:

```text
decision:<change-id>
planning:<change-id>
implementation:<work-unit-id>
review:<change-id>:<implementation-lineage>
```

A producer Session may span several bounded Runs and Candidate attempts. Every Candidate has exactly one producing Run. A Run may instead terminate `blocked`, `cancelled`, or `failed` without a Candidate.

Only one writer may execute against a DSH Agent Session. Project Server must issue an exclusive lease and expected Session head. Run Request and Receipt must bind logical continuity, Session ID, expected head, resulting head, exact Runtime Build and protocol, material generation, stage and subject, feedback, raw artifact digest, ledger head, usage, and terminal state.

Same-Session resume requires the original Runtime Build and protocol. Build or protocol change requires Session rollover with deterministic canonical rehydration.

Every top-level Model Check invocation uses one fresh isolated tool-free Agent Session. Independent Model Checks may run in bounded parallel. A retry always uses another fresh Session. Model Checks do not compact, continue producer conversation, share results, or use DSH production tools. Code Checks do not use DSH.

## Compaction and continuity

DSH owns token measurement, pressure detection, oversized tool-result pruning, event replacement, and retained raw Session history. CodeWiki owns stage-aware semantic summarization, authority promotion, deterministic rehydration, predictive pressure policy, and rollover.

Authority-relevant facts must leave model conversation state before compaction. Predict pressure from current envelope plus expected next-Run input, tool-result reserve, and Candidate-output reserve. Compact only while idle, especially after durable Candidate/Results/feedback, after distilled fan-out, before material or Session-head switches, or before pressured continuation.

Never compact during an open turn, unmatched tool pair, pending child work, before Candidate freezing, solely because a process exits, or unconditionally after every Candidate.

Session rollover is required for build/protocol incompatibility, corruption, repeated summary drift, role change, unrecoverable compaction lock, or benchmarked quality decline.

## Isolation and provider boundary

Production requires two separately qualified boundaries:

1. Outer whole-DSH Run Process containment protecting host, canonical repository, Project Server, credentials, protocol descriptors, and protected effects.
2. Inner model-authored Code Mode process/container protecting trusted DSH Adapter, Session state, material, evidence stream, and protocol from model code.

The outer sandbox permits read-only Runtime Build and authorized material, bounded private scratch, and an Implementation-only Workbench. It denies canonical writes, protected refs, ambient environment, credentials, unrestricted network, inherited authority, and unbounded resources.

The inner sandbox permits no filesystem, network, environment, inherited descriptors, DSH Session files, or protocol pipes. It exposes only authenticated typed async bindings and enforces hard termination plus cumulative call and byte budgets.

DSH's worker-thread Code Runtime is containment, not a security boundary, and cannot qualify. Official DSH filesystem sandboxing also does not solve network or whole-process isolation. Defer implementation until final integration, but make exact provider version, adversarial qualification, and fail-closed admission production release gates.

DSH receives no provider credentials and ideally no raw network. Runtime supplies a private authenticated model capability through a host-side provider-neutral broker. Live-provider qualification uses disposable infrastructure with no committed credentials or mandatory paid calls.

## Completed foundation

- [x] Four Stage Loop and Checks/Gate ownership cuts.
- [x] Exact Candidate, Result, Gate, Change Trace, authority, and expected-head foundations.
- [x] Project Server/Runtime ownership cut.
- [x] Exact DSH `0.1.0-rc.6` pin and reviewed-source provenance.
- [x] Authenticated DSH Run Process and isolated replay Session vertical slice.
- [x] Self-contained content-addressed Runtime Builds and handshake admission.
- [x] Runtime-authored receipt contracts and process supervision.
- [x] Durable Runtime Build, Execution Ledger, raw-log, evidence-CAS, and receipt stores.
- [x] Immutable replay `StageContextBundle`, direct and batch DSH tools, budgets, cursor integrity, and ledger capture.
- [x] Packed-install, production audit, typecheck, build, package smoke, and replay qualification for checkpoint `833f838`.
- [x] Ratified incremental Change-scoped Planning, Work Unit Implementation, shared Implementation policy, and aggregate Review in Knowledge and this plan.

## Refactoring sequence

### Slice 1 — Ratified Knowledge and clean-cut audit

- [x] Replace rolling Planning intent with one Change-scoped Work Graph delta.
- [x] Ratify Decision accepted active Changes compatibility and CAS admission.
- [x] Ratify Work Unit-granular Implementation and same stage-wide Implementation policy.
- [x] Ratify private Change integration lineage and aggregate Review.
- [x] Ratify Change-scoped Planning and Work Unit-scoped Session continuity.
- [x] Ratify Project Material Generation versus Gate Evaluation Package.
- [x] Rename Knowledge terminology from `Work Item` to `Work Unit` without alias.
- [x] Validate all Knowledge links, limits, diagrams, and source-pattern coverage.
- [x] Commit documentation-only green checkpoint.

### Slice 2A — Executable Work Unit vocabulary

- [x] Create an exhaustive HEAD-anchored vocabulary manifest after Slice 1.
- [x] Rename executable `WorkItem`, `workItem`, `work_item`, `work-item`, and user-facing terms to `WorkUnit`, `workUnit`, `work_unit`, and `work-unit` in one breaking cut.
- [x] Rename Change Trace operation kinds, payload fields, graph facts, query families, Claims, Assignments, effects, projections, fixtures, tests, and UI vocabulary without aliases.
- [x] Advance affected Change Trace, Planning, WorkState, Alignment, Change Intake, Review, Assignment, dispatch, integration, effect, and coordinator schema identities.
- [x] Regenerate exact canonical fixture bytes and identities.
- [x] Commit one green executable vocabulary checkpoint.

Success: no active executable or Knowledge `Work Item` spelling or parser survives; historical changelog prose remains history rather than a compatibility surface.

### Slice 2B — Rolling-planning deletion

Create a new exhaustive HEAD-anchored deletion manifest after Slice 2A commit.

- [x] Delete `src/changes/trace/rolling-planning.ts` and rolling epoch contracts, reducers, views, active-work dispositions, planning horizons, participant-Change semantics, Sprint execution-plan ownership, and obsolete tests.
- [x] Replace multi-Change Planning Candidate schemas with one Change-scoped graph-delta schema.
- [x] Remove contributing ownership fields; enforce exactly one owning Change per Work Unit.
- [x] Preserve cross-Change dependencies through explicit graph edges.
- [x] Update exports, package smoke, fixtures, and canonical protocol versions where bytes change.
- [x] Commit one green rolling-planning deletion checkpoint.

Success: no rolling-planning, horizon, participant, or canonical Sprint-plan compatibility surface remains.

### Slice 3 — Decision active-Change compatibility

- [x] Add exact accepted active Changes and accepted Work Graph projection to Decision Candidate evaluation inputs.
- [x] Add structured compatibility relationships and complete coverage.
- [x] Add default `active_change_compatibility` Model Check and deterministic overlap/accounting Check.
- [x] Bind affected Results to Candidate, accepted active Changes, relationship, graph, pack, route, and configuration identity.
- [x] Require accepted active Changes expected-head CAS during confirmation.
- [x] Test concurrent conflicting Decision Candidates so only one stale-free confirmation can commit.
- [x] Commit one green Decision accepted active Changes checkpoint.

Success: unresolved semantic contradiction cannot pass or race through stale confirmation; dependencies and resource contention remain outside Decision authority.

### Slice 4 — Change-scoped Planning delta and canonical Work Graph

- Add immutable Work Graph delta Candidate and exact acceptance-coverage contracts.
- Persist one accepted Planning delta per Change revision with explicit amendment lineage.
- Build canonical global Work Graph from accepted deltas and current statuses.
- Validate ownership, dependency existence, acyclicity, overlap ordering, resource declarations, active-work immutability, and aggregate Review coverage.
- CAS-apply deltas against exact Change and graph heads.
- Allow disjoint Change-scoped Planning producers to run concurrently; serialize only graph application.
- Replace project-scoped Planning continuity with `planning:<change-id>`.

Success: accepting a new Change appends only its validated graph delta and never regenerates unrelated work.

### Slice 5 — Project Server readiness and scheduling cut

- Derive ready Work Units from accepted Work Graph plus WorkState.
- Keep Worker Offers, Claims, Assignments, placement, consent, privacy, custody, budget, and queue jobs exclusively in Project Server.
- Remove Sprint and planning-session scheduling authority.
- Preserve one exact Assignment per Work Unit attempt and one isolated Workbench.
- Prove restart recovery and stale Claim/Assignment rejection.

Success: Runtime receives exact admitted Run Requests and owns no queue or placement state.

### Slice 6 — Work Unit Candidate and shared Implementation policy

- Make Implementation subject one exact Work Unit and owning Change acceptance slice.
- Use one persistent `implementation:<work-unit-id>` DSH Session across bounded attempts.
- Enforce exactly one producing Run per Candidate.
- Resolve one stage-wide Implementation Check Pack policy and prohibit Work Unit-specific selection.
- Build Work Unit-specific Gate Evaluation Packages under that shared policy.
- Track `gate_failed`, `gate_passed`, `integration_pending`, `integrated`, `stale`, and `conflicted` separately.
- Run independent Work Unit Code and Model Checks with bounded parallelism; keep one fresh Session per Model Check.

Success: unit Checks begin as each Candidate arrives, while Pack policy remains identical across units.

### Slice 7 — Private Change integration lineage and completion

- Add content-addressed private integration lineage per Change.
- Admit only fresh passing Work Unit Candidates by expected-head CAS.
- Reject changed bytes, stale bases, missing custody, dependency drift, and conflicts.
- Persist integration receipts and exact contributing Candidate identities.
- Add deterministic all-required-unit completion reducer.
- Freeze aggregate head only when Gates, integration, dependency closure, and acceptance coverage are complete.

Success: no single unit Gate advances the Change; no partial lineage mutates protected target state.

### Slice 8 — Aggregate Review and feedback ownership

- Bind Review to exact aggregate Change lineage, target base, ratified Change, accepted Planning delta, all Work Units, Candidates, Evidence, and Results.
- Use fresh independent `review:<change-id>:<implementation-lineage>` Session.
- Add default aggregate acceptance, cross-unit, full-build, integration, provenance, and scope Checks.
- Invalidate all Review Results on aggregate-head change.
- Route unit defects to affected Implementation, decomposition defects to explicit Planning amendment, and meaning defects to Decision through Project Server-owned typed rules.
- Guard delivery with current authority and target-head CAS.

Success: Review proves the complete Change and no Work Unit Result is misrepresented as aggregate proof.

### Slice 9 — Project Material Generation

- Specify normalized material manifest, chunking, digest, retention, authorization, and query-engine contracts.
- Decide full read-only repository mount versus derived index plus bounded file material through benchmark evidence.
- Build Project Server material construction and content-addressed reuse.
- Mount authorized generations read-only in Run Processes.
- Replace producer `StageContextBundle` transport and generic route lookup with typed local material services.
- Preserve direct, batch, cursor, bounds, coverage, source refs, staleness, generation identity, and exact inner-result ledger capture.
- Add controlled idle-boundary generation refresh.

Success: producer queries are local, immutable, generation-bound, and never proxy each read through Project Server.

### Slice 10 — Gate Evaluation Package

- Define immutable Candidate-checkpoint package and declared Check-input projections.
- Freeze exact repository/tree/base, Change, WorkState, Knowledge, Alignment, Evidence, Results, Check files, configuration, and routes.
- Prohibit producer material handles and live Project Server access from Checks.
- Bind Check cache and Gate identity to package inputs.
- Prove tamper, omission, staleness, and unknown-coverage failures.

Success: producer inquiry may refresh; Candidate judgment remains exact and immutable.

### Slice 11 — Persistent Session leases and multi-Run receipts

- Persist logical continuity to DSH Session binding independently of process lifetime.
- Add exclusive lease acquisition, expiry, cancellation, and expected Session-head CAS.
- Extend Run Request and Receipt with continuity key, Session ID, expected/resulting heads, material digest, feedback, raw artifact, ledger head, and build/protocol identity.
- Prove process restart, Project Server restart, same-build resume, competing writer rejection, and build-change rollover.
- Keep Review separate from Implementation and Model Checks fresh.

Success: one Session may span Runs without hidden warm-process state or concurrent writers.

### Slice 12 — Durable DSH completion

- Connect Run Process ledger and raw log to durable evidence stores during execution.
- Validate terminal Candidate or stopped outcome, raw artifacts, quiescence, process exit, and evidence closure.
- Atomically commit Runtime-authored Run Receipt only after all required evidence is durable.
- Recover interrupted append and receipt commit without duplicate authority.

Success: Project Server never receives an admitted Candidate without complete durable receipt evidence.

### Slice 13 — DSH Goal and stage-aware compaction

- Spike controlled Goal activation for bounded same-Session continuation.
- Withhold `complete_goal` authority from models; Candidate submission pauses an attempt and Project Server/Gates determine completion.
- Implement authority promotion, predictive pressure, safe semantic checkpoints, CodeWiki summarizer, exact history retention, and deterministic rehydration.
- Qualify Candidate pause/resume, Gate feedback, restart, compaction, and rollover for Decision, Planning, Work Unit Implementation, and Review.

Success: long-running continuity survives compaction without moving project authority into conversation state.

### Slice 14 — Provider broker and live-model qualification

- Implement provider-neutral private model capability.
- Keep credentials and unrestricted egress outside DSH.
- Bind provider request/response, route, usage, cancellation, and receipt identity.
- Qualify disposable live infrastructure without committed credentials or mandatory paid calls.
- Preserve replay as deterministic CI route.

Success: live transport is separately qualified and provider identity grants no CodeWiki authority.

### Slice 15 — Secure Code Mode and sandbox qualification

- Benchmark native direct, native batch, and Code Mode for prompt cost, turns, bytes, latency, ledger size, compaction, and Candidate quality.
- Select only a qualified inner Code Runtime provider exposing typed async CodeWiki bindings.
- Select and pin a qualified outer whole-process sandbox provider.
- Run adversarial filesystem, network, process, descriptor, credential, resource, escape, orphan, cancellation, and evidence-integrity tests.
- Fail closed when either boundary is unavailable or version identity changes.

Success: model-authored code has no ambient authority and production cannot start without both qualified boundaries.

### Slice 16 — Pi parity and deletion

- Compare Decision, Change-scoped Planning, Work Unit Implementation, aggregate Review, Skills, Checks, material queries, cancellation, compaction, receipts, and failure behavior across temporary Pi evidence and DSH.
- Pack reviewed candidate and test only in disposable external projects with isolated Pi settings.
- Delete `src/runtime/pi/**`, temporary `./pi-sdk`, Pi execution adapters, selectors, fallbacks, and migration-only tests in one clean cut.
- Retain Pi only as optional Client integration where still product-required.

Success: one DSH execution engine remains; no selector or compatibility shell survives.

### Slice 17 — Product completion

- Implement reserved MCP material-query, submission, status, confirmation, Work Unit, and Review operations.
- Finish Check Author SDK and sandboxed Code Checks.
- Finish Outcome Diagnostics through ordinary Change Intake.
- Finish Pack transport, dashboard projections, external Candidate admission, remote synchronization, and recovery UX.
- Run full packed-install, adversarial, performance, benchmark, audit, and release qualification.

## Required verification for every executable slice

1. Manifest validation against anchored HEAD and declared dispositions.
2. Focused tests proving new invariant and stale/tamper/failure behavior.
3. Primary LSP diagnostics before build.
4. Full typecheck and build.
5. Relevant complete test suite.
6. Package-install smoke from packed artifact when exports or runtime closure change.
7. Production dependency audit; full development advisories remain separately reported.
8. Knip or equivalent dead-export check for touched surfaces.
9. `lens_diagnostics mode=all` with no blocking edited-file findings.
10. Clean Git diff, one green commit, and push only after review.

## Release blockers

- Mounted Project Material Generation and separate Gate Evaluation Package are not implemented.
- Incremental Change-scoped Planning and Work Unit aggregate completion are not implemented.
- Persistent Session lease/CAS and exact same-build resume are not implemented.
- Durable ledger/raw-log/receipt completion is not wired end to end.
- Live provider broker is not qualified.
- Secure inner Code Runtime is unavailable.
- Qualified outer whole-process containment is unavailable.
- Cancellation, compaction, rollover, and aggregate Review are not qualified.
- Pi/DSH parity and Pi execution deletion are incomplete.
- Full development audit still carries known Pi-related advisories even though production audit is clean.

No production release, protected effect, or Pi deletion may bypass these gates.
