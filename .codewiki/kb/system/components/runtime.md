---
type: Concept
title: Runtime
description: Runtime is CodeWiki's project-scoped control plane. Project Runtime derives WorkState, schedules compatible work, owns exact identities and lifecycles, executes Loop exit, guards canonical writes and effects, and quiesces safely.
tags:
  - codewiki
  - system
  - runtime
timestamp: 2026-07-29T12:02:37.000Z
codewiki_components:
  - error_handling
  - runtime
codewiki_source_patterns:
  - src/error-handling/**
  - src/runtime/**
codewiki_test_patterns:
  - tests/runtime/**
  - tests/helpers/runtime-implementation.mjs
codewiki_trace_events:
  - runtime.work_unit.claimed
  - runtime.work_unit.claim.released
  - runtime.work_unit.claim.expired
  - runtime.work_unit.claim.cancelled
  - runtime.integration.proven
  - runtime.project_branch.merged
  - runtime.project_branch.pushed
  - runtime.product.published
  - runtime.product.released
  - runtime.host.started
  - runtime.host.observed
  - runtime.host.blocked
  - runtime.host.completed
  - runtime.host.stopped
codewiki_roles:
  - shared_error_contracts
  - outer_loop_coordination
codewiki_source_map:
  - id: error_handling
    source_patterns:
      - src/error-handling/**
    test_patterns:
      - tests/runtime/**
    role: shared_error_contracts
  - id: runtime
    source_patterns:
      - src/runtime/**
    test_patterns:
      - tests/runtime/**
      - tests/helpers/runtime-implementation.mjs
    trace_events:
      - runtime.work_unit.claimed
      - runtime.work_unit.claim.released
      - runtime.work_unit.claim.expired
      - runtime.work_unit.claim.cancelled
      - runtime.integration.proven
      - runtime.project_branch.merged
      - runtime.project_branch.pushed
      - runtime.product.published
      - runtime.product.released
      - runtime.host.started
      - runtime.host.observed
      - runtime.host.blocked
      - runtime.host.completed
      - runtime.host.stopped
    role: outer_loop_coordination
---
# Runtime

Project Runtime is CodeWiki's project-scoped control plane and outer control loop. It is logically available, event-driven, supervised, and physically quiescent when no eligible work exists. It owns workflow execution, not Product meaning or semantic acceptance.

```text
trigger or client request
→ refresh WorkState and bounded relationship views
→ derive eligible semantic/mechanical jobs
→ select compatible bounded set
→ acquire lanes, Claims, capacity, and effect guards
→ bind exact input, CodeWiki OS, Loop Protocol, route, context, and authority
→ run candidate producer or isolated worker
→ resolve candidate-specific Exit Policy
→ run bounded Code/Model Checks
→ build immutable Exit Report
→ revalidate freshness, generation, authority, and CAS
→ append exact accepted/remediation facts
→ schedule separately permitted effects
→ repeat or quiesce
```

Exactly three semantic Loops exist: Decision, Planning, and Implementation. Runtime is not a fourth Loop. Several compatible invariants may progress concurrently, but one semantic owner governs each invariant.

## Primary product boundary

```text
CodeWiki CLI
+ Project Runtime
+ dashboard
+ embedded published Pi SDK
```

Pi extension is an optional thin client. Dashboard, CLI, Pi, tests, and future adapters connect to the same Runtime through bounded local capabilities. Client lifetime never defines Runtime lifetime.

Pi owns providers, credentials, model transport, sessions, compaction, tools, extensions, and Skills. Runtime consumes published Pi SDK APIs and normalized capabilities; credentials never enter CodeWiki traces, prompts, manifests, or errors.

Future OpenClaw support may implement client or Assignment execution adapters. It cannot become semantic or canonical authority.

## Runtime authority

Runtime exclusively owns:

- WorkState refresh, projection, invalidation, and impact-bounded Loop selection;
- candidate, Evidence Record, Resolved Exit Policy, Check Result, Exit Report, semantic-job, and effect-job identity;
- evidence normalization, artifact/provenance/freshness/privacy validation, approval-receipt correlation, and contradiction preservation;
- Check activation, thresholds, freshness, scheduling, caching, cancellation, and required-result fan-in;
- generation fencing, exact CAS, idempotency, and recovery;
- append to `.codewiki/traces/**`;
- Planning epoch preflight and partial-commit repair;
- Work Item readiness, Claims, Assignments, Workbench activation, and worker lifecycle;
- Integration workspace lifecycle and exact proof;
- guarded pre-exit review publication plus post-exit merge, push, publication, release, and future deployment effects;
- bounded budgets, capacity, retries, supervision, temporary artifacts, retention, and cleanup.

Runtime cannot:

- invent or approve Change meaning;
- create Planning truth outside passed-and-appended Planning output;
- accept worker completion as Implementation truth;
- let candidates, clients, Skills, workers, tools, Checks, models, or adapters supply canonical identity, authority, CAS guards, runtime timestamps, activation, thresholds, or final routes;
- interpret generated views as authority;
- weaken protected Checks or broaden permissions because automation is enabled;
- continue when required supervision, authority, capability, or safe certainty disappears.

In short: Runtime does not approve Change meaning and does not create Sprint or Work Item truth. It schedules and guards semantic owners' exact outputs.

## Elected ownership and clients

One elected coordinator generation owns scheduling and durable write authority for one project. “Coordinator” names this internal scheduling/ownership role; Project Runtime names the whole control plane.

The local service uses exclusive project ownership, loopback-only transport, private endpoint metadata, bearer authentication, leased clients, and generation-scoped capabilities. A dead owner may be replaced under a new generation. Stale processes are fenced before append/effect even if sockets remain alive.

A bounded event journal exposes operational invalidations and lifecycle state to authenticated clients. Cursor gaps or generation changes require canonical snapshot refresh. Events are never semantic truth.

Clients may submit bounded intent, authority, evidence, control requests, and trigger kinds. They cannot provide observation time, select semantic work, replace repository identity, or append directly.

## Triggers and quiescence

Triggers may come from user/agent intent, Change revisions, approval, Knowledge/source/test/Git/config changes, Work Item readiness, worker reports/timeouts/cancellation, Integration results/conflicts, preview observations, schedules, or explicit continue/stop requests.

A trigger requests observation; it grants no semantic authority.

Runtime quiesces or blocks when:

- no eligible work exists;
- user/external authority is required;
- policy or supervision blocks action;
- capacity/budget is exhausted;
- guarded state changed and candidate is stale;
- conflict needs Planning or Decision;
- required capability or Check service is unavailable;
- cancellation or stop applies.

Quiescence is healthy and resumable.

## WorkState-driven scheduling

```text
unapproved Change revision              → Decision eligible
approved Changes lacking current plan   → Planning dirty
ready Work Item                         → Assignment eligible
matching Worker/Integration evidence    → Implementation eligible
passed Integration proof                → guarded effect may become eligible
no eligible job                         → quiescent
```

Eligibility and admission are separate. Runtime first derives candidate jobs, then admits a deterministic compatible set under lane, dependency, path/component conflict, target/base, capacity, budget, supervision, and authority constraints.

Lane constraints:

- one Decision writer per exact Change revision; unrelated Changes may run concurrently;
- one accepted global Planning writer; read-only analysis may run concurrently;
- one active Claim per Work Item;
- multiple non-conflicting Assignments within capacity;
- one Integration writer per exact target/base;
- serialized commit, merge, push, publication, release, and other effect targets.

Callers cannot self-label work `routine`. Runtime derives Implementation tier from accepted Change/Planning facts, risk, dependencies, actual candidate growth, capability, and configured policy. Derived risk may rise but cannot silently fall.

## Semantic jobs

Each selected semantic invariant becomes one exact runtime job with:

- selected Loop and target;
- coordinator generation;
- observed WorkState/Knowledge/Git/config snapshots;
- exact Change/Planning revisions;
- CodeWiki OS and Loop Protocol identities;
- model route and bounded context;
- iteration, wall-clock, token, cost, and retry budgets;
- cancellation and durable recovery probes.

The job invokes only its selected Loop adapter. It cannot drift into another lane. Each Loop owns its role-specific `*CandidateContent` contract; Runtime owns the surrounding semantic context, identity, freshness, authority, actor/time, and route. Direct adapters, isolated Pi SDK sessions, and remote coordinator submissions pass through the same strict recursive candidate admission. Top-level and nested fields, arrays, values, and closed enums follow exact Loop-owned schemas; unknown fields and attempted Runtime-owned authority, actor/time, assurance, proof, or routing controls fail before core Loop invocation. Missing required Runtime semantic context fails closed. Route-back is appended as evidence and stops forward repetition until the target owner responds.

A compare-and-swap race invalidates the observation. Runtime requeues or reruns against fresh state under budget; it never appends stale output. A replacement generation recovers exact completed event evidence before considering reinvocation.

Current executable source retains one-shot and compatibility primitives while the standalone Runtime boundary is consolidated. Cancellation-aware draining of active semantic SDK jobs remains an explicit open migration item.

## Loop-exit runtime

Runtime owns the shared exit pipeline:

```text
immutable role-specific candidate
→ admission
→ Resolved Exit Policy
→ shared fact extraction
→ bounded resource-specific Check fan-out
→ required-result fan-in
→ immutable Exit Report
→ route selection
→ final generation/freshness/authority/CAS guard
```

Code Checks execute trusted deterministic CodeWiki implementations. Model Checks run independent bounded Pi sessions with no producer conversational state. Timeout/provider/malformed/cancelled outcomes are `indeterminate`.

Required Exit Report reduction is fixed:

```text
required fail exists          → fail
else required indeterminate   → indeterminate
else                           → pass
```

A passing Report permits exact Loop exit only. Append and every effect remain separately guarded.

Native Decision research now has one Runtime-specific bridge under `src/runtime/decision-research.ts`. Runtime materializes bounded citation material as observed, immutable, exact Change-revision Evidence and runs the protected deterministic provenance Check against exact freshness and subject obligations. Missing or stale input becomes an indeterminate Result; invalid temporal provenance becomes a failing Result while retaining the Evidence. This bridge does not yet collect external research, execute the independent claim-support Model Check, persist native Decision reports, or replace production Decision ref-count evaluation.

Independent Checks continue after unrelated failure. Resource-specific pools bound provider/model, CPU, test/build, and external-service work. Exact cache identity includes candidate, Check binding, implementation/configuration, and evidence inputs. TTL and path overlap can evict or invalidate, never authorize reuse.

Preview and append use the same candidate and Report. Historical views use persisted identities rather than current catalog reinterpretation.

## Global Planning

Planning is a project lane, not a session attached to one Change. Runtime coalesces approved-portfolio changes into one bounded planning horizon and admits one accepted Planning writer while preserving claimed-work stability.

For one Planning epoch Runtime:

1. freezes participant Change revisions, trace tails, plan revisions, WorkState, Knowledge/config/Git/Integration refs;
2. obtains one exact Planning candidate and Exit Report;
3. validates Sprints, Work Items, ownership, contribution, dependencies, coverage, and protected claimed work;
4. slices output by affected Change Trace;
5. preflights every trace tail and event identity;
6. appends deterministic epoch events;
7. detects and repairs any partial multi-file commit before downstream Claims.

Filesystem multi-trace append is not treated as atomic. Epoch id, participant set, batch digest, deterministic event ids, and private bounded recovery packet expose crash windows and permit idempotent repair.

## Work Items, Workbenches, and Assignments

Planning creates worker-ready Work Items and declares Workbench requirements. Runtime selects model tier/route, resolves Skills/tools, probes capabilities, provisions one private Workbench, and grants one bounded Assignment attempt.

Before Claim append, Runtime creates an inert digest-bound Workbench manifest containing exact source/base, context, Skills/tools, tier/route, minimum Checks/evidence obligations, isolation, budgets, and report contract. Only a matching active Claim activates it.

A Claim binds:

- Work Item, Workbench, owning Change Trace, and worker;
- accepted Change and Planning revisions;
- source base and worktree/Integration refs;
- exact path/component scope;
- policy snapshot and lease, plus expected evidence contract;
- deterministic runtime job and private packet digest.

Runtime selects only current ready work. Overlapping paths, incompatible bases, dependencies, shared Integration targets, or stale approval hold otherwise-ready items.

## Worker lifecycle and isolation

```text
ready Work Item
→ tier/Workbench resolution and capability probe
→ guarded Claim append
→ isolated worker start
→ bounded observation/cancellation
→ immutable Worker Report
→ Implementation candidate and Checks
→ accepted repair or remediation
→ Integration proof
→ release/cancel/expire
→ proof-authorized cleanup
```

Workers receive CodeWiki OS, Implementation Loop Protocol, Assignment scope, bounded source/context, ordinary scoped Pi Skills/tools, and evidence requirements. They have no peer/shared private memory and cannot append semantic events, approve Changes, change Planning, widen paths/capabilities, choose tier, integrate outside authority, publish, or relax Checks.

Pi process workers run in explicit Git worktrees. Opt-in OCI adapters use digest-pinned preinstalled images, structured Docker/Podman arguments, read-only root, dropped capabilities, no privilege escalation, bounded resources/output, exact mounts/environment, and no network unless a restricted network is explicitly authorized. No implicit pull occurs before Claim append.

Worker liveness is operational observation. Raw logs/heartbeats remain private. Worker completion supplies evidence only; Implementation Exit Report determines semantic acceptance.

## Integration

Independent worktrees are not combined product state. Planning declares Integration boundaries. Runtime serializes accepted worker outputs into one private Integration workspace per exact target/base, validates scope and patch application, runs trusted checks, and creates a local proof commit without moving the project checkout.

`runtime.integration.proven` binds exact runtime job, Claim, Assignment, Worker Report, target refs, base/parent/commit/tree, changed paths, patch digest, and Check evidence. Digest-bound in-progress manifests plus commit trailers close merge-to-append crash windows. Cleanup requires canonical Integration proof.

Integration proof does not merge the project branch, push, publish, release, deploy, or prove user outcome.

## Separately guarded effects

Every boundary below requires exact canonical predecessor proof, elected-generation ownership, target CAS, explicit capability, and its own authority. Review publication is the only permitted pre-exit external project-publication/mutation effect and exists solely to gather required human/team evidence; provider/model/research reads remain bounded observations, not project progression:

```text
exact pending Implementation candidate
→ optional guarded review publication to isolated ref + draft pull request
→ approval/request-changes Evidence Records
→ final Implementation Exit Report
→ Integration proof
→ optional project-branch fast-forward merge
→ optional remote push
→ optional product publication
→ optional release
→ future deployment/observation
```

### Review publication

After all required non-approval work needed for safe review is complete, Runtime may publish an exact Validation Bundle under explicit project/user authority. It binds candidate/tree/head, destination CAS, provider adapter/configuration, idempotency, privacy policy, preview artifact digests, required reviewer roles, and post-operation observation. It may push only an isolated review ref and create or update a draft pull request. It cannot target the project/protected branch, force-push, auto-merge, publish a product artifact, claim semantic exit, or transfer provider authority into CodeWiki.

Provider reviews are untrusted observations until Runtime revalidates repository, pull request, exact head, authenticated reviewer/role, decision, event identity, bundle digest, and freshness into an approval-receipt Evidence Record. Head/candidate/bundle drift invalidates approval. Projects that forbid review publication collect approval through CodeWiki and publish the pull request only after exit.

### Project branch merge

Requires exact Integration proof, expected checked-out local branch/head, matching tree/paths, bounded dirtiness, explicit authority, and fast-forward-only structured Git invocation. No candidate or remote client supplies authority.

### Push

Requires canonical merge proof, exact local/remote state, safe configured credential-free remote reference, user authority, and structured non-force push. Prepared/pushed manifests and remote re-observation prove attribution. Ambiguous provider acceptance remains blocked.

### Publication

Requires exact push proof, bounded private artifact path, source commit/tree and digest, destination CAS, trusted adapter idempotency, explicit user authority, and post-operation observation. Credentials remain provider-owned.

### Release

Requires exact publication identity, artifact/revision/digest, channel CAS, trusted adapter idempotency, explicit user authority, and channel re-observation. Release cannot rebuild, republish, deploy, push, tag, announce, or prove adoption.

Generic deployment remains deferred until CodeWiki has a real hosted target.

## Automation gates, supervision, and autonomy

Unattended worker start remains gated until explicit project policy, supervision rules, external lifecycle/failure proof, and required capability evidence permit it.

Automation is bounded by effective configuration, accepted Change constraints, Planning output, current host authority, and capabilities. Higher autonomy permits eligible mechanical continuation only. It never grants semantic approval, arbitrary shell, Check changes, publication, or irreversible authority.

Under supervised policy, losing all approved supervisors blocks new starts and initiates explicit cancellation/grace behavior. Unattended continuation requires separate approved project policy.

## Error contract

Operational failures remain operational facts, not fabricated Check failures. Structured errors include stable code, kind, message, owning refs, retryability/terminality, evidence refs, and recommended Runtime or semantic route.

Runtime preserves exact rejection behavior at public authority boundaries during clean cuts unless the ratified contract explicitly replaces that boundary.

## Trace append contract

Runtime is sole canonical trace writer. Before append it verifies:

- known Change Trace and exact expected byte/tail/sequence;
- exact entity, Change, Planning, Knowledge/config/Git/WorkState versions;
- event schema and canonical refs;
- candidate, policy, Results, Report, and Loop correspondence;
- authority and generation;
- deterministic event/batch idempotency;
- no prior close record;
- effect-specific predecessor proof when applicable.

Semantic sessions and workers return candidate or evidence material. Runtime alone materializes canonical Evidence Records. Model Checks return bounded observations used to construct Results. None appends directly.

## Retention, learning, and cleanup

Private runtime material lives under bounded `.codewiki/runtime/**`. Failed patches, Workbenches, raw tool/model output, credentials, and private reasoning never enter Change Traces.

Compact reusable Evidence Records persist in traces while exact source, Git, provider, and content-addressed artifact bytes remain in their owning boundaries. Screenshots/videos/captured pages and bounded outputs follow explicit retention and privacy policy; closure cannot delete the only required artifact before durable replacement or retention proof. Repair Episodes/Patterns and graph indexes are derived in memory or disposable `.codewiki/runtime/learning/**`. User-facing views and pull-request Validation Bundles remain projections, not authority.

Cleanup failure cannot corrupt semantic state. Closed traces compact only after Git restore refs preserve full history and no live Planning, Assignment, Integration, preview, observation, or recovery dependency remains.

## Source-checkout boundary

CodeWiki does not load or dogfood its own extension in this source repository during stabilization. Repo-local Pi uses native coding tools and Pi-Lens only. Packed candidates run in disposable external projects with isolated Pi settings. Those fixtures exercise Runtime, traces, workers, clients, failures, guarded effects, and cleanup without granting candidate code authority over its own checkout.

## Related docs

- [WorkState](work-state.md)
- [CodeWiki OS and Loop Protocols](codewiki-os.md)
- [Loop Exit](loop-exit.md)
- [Evidence Records](evidence.md)
- [Worker Workbench](worker-workbench.md)
- [Model Routing](model-routing.md)
- [Loop Model](loop-model.md)
- [Loop Contracts](loop-contracts.md)
- [Traces](traces.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Worktree Isolation](worktree-isolation.md)
