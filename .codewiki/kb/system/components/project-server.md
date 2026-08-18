---
type: System Component
title: Project Server
description: Owns transport, AuthN, project AuthZ, canonical state, Stage Loops, Workbenches, transitions, effects, and one subordinate Runtime for a governed project.
status: stable
tags: [system, component]
codewiki_component: project-server
codewiki_source_patterns: ["src/project-server/**", "src/git/**", "src/utils/**"]
codewiki_test_patterns: ["tests/project-server/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Project Server keeps accepted work reachable, authorized, recoverable, and safely progressing.
  - type: realizes
    target: /product/stories/maintainer/account-for-drift.md
    rationale: Project Server classifies every observed Candidate and Git state by positive provenance proof.
---
# Project Server

Project Server is the sole authoritative semantic control plane and long-lived owner for one governed project. It combines the former protocol edge and project control plane: transport, authentication, project authorization, canonical project state, Stage Loops, Checks, Workbenches, transitions, guarded effects, and recovery share one owner. Each Project Server owns one subordinate Runtime for bounded execution. Runtime cannot authorize project operations or mutate canonical state.

A CodeWiki process may host several Project Servers behind one shared listener. The listener performs only connection acceptance and project lookup; it is not a semantic Gateway and owns no identity, policy, project state, or lifecycle. Client disconnection never stops accepted work.

## Request boundary

Every request follows one fixed order:

```text
Client transport
  -> Project Server AuthN
  -> Project Server project AuthZ
  -> command or query
  -> optional Run Request to Runtime
  -> Run Receipt
  -> Candidate admission, Checks, Gate, and transition
```

Authentication proves the Actor connecting now. Pairing durably enrolls one Client installation for one Actor. A Client Session represents one temporary authenticated connection. Project authorization independently decides whether that Actor may perform one exact project operation. Pairing, Client kind, repository access, job title, model identity, and transport never imply project authority.

AuthN remains a narrow internal component rather than a separately deployed service. Local mode verifies ephemeral local proof and stable private identity mapping. Team mode may use provider-neutral OIDC adapters. Trusted adapters own authorization-code exchange, PKCE, redirect validation, discovery, signature, algorithm, and key checks before returning bounded claims. Project Server derives stable identity only from immutable issuer and subject. Credentials never enter project files, Run Requests, model context, Pairing records, or Runtime state.

Client Sessions use digest-only credential bindings, bounded lifetimes, rotation, revocation, generation compare-and-swap, and endpoint policy that never receives raw credentials. AuthN, Pairing, Client Sessions, repository-access observation, and project AuthZ remain distinct internal responsibilities. Browser App requests use secure same-origin, `HttpOnly`, and `SameSite=Strict` session handling; installed CLI, Pi, and MCP Clients require explicit enrollment according to policy.

## Project authority

Project Server owns Actor and delegation binding, semantic idempotency, identity, admission, time, digests, freshness, expected-head compare-and-swap, provenance, canonical mutation, Stage Producer attempts, the accepted active-Change portfolio, canonical global Work Graph, scheduling, Claims, Assignments, Implementation Workers, private Change integration lineages, persistence, synchronization, recovery, transitions, and effects. It authorizes the accountable Actor, not the Client or executor.

Git owns content-addressed artifact history. A commit, branch, pull request, author, trailer, note, or provider status may identify Evidence or part of an immutable subject; none is a lifecycle transition by itself. External Git state is captured without changing accepted head and receives no inherited execution proof. Divergence pauses guarded effects; Project Server never silently adopts, overwrites, discards, or certifies it.

Project Server invokes exactly four Stage Loops under `src/loops/**`: Decision, Planning, Implementation, and Review. Checks is a separate root domain under `src/checks/**`; it owns Check Packs, completed Results, caching, fail-fast coordination, and Gate Reports. Stage Loops own exact subjects, Candidate and attempt semantics, and feedback interpretation. Project Server builds immutable refreshable Project Material Generations for producers and freezes separate immutable Gate Evaluation Packages for exact Candidates and Checks.

Project Server applies one fixed authority model with Work Unit-granular Implementation:

```text
Decision approve passed + authorized exact-Candidate confirmation + portfolio CAS -> Planning
Decision reject | defer | withdraw passed + confirmation                         -> typed terminal/deferred state
Decision failed                                                                  -> Decision
Planning delta passed + Work Graph CAS                                            -> Implementation
Planning failed                                                                  -> Planning
Work Unit Implementation passed                                                   -> integration pending
Work Unit integration stale | conflicted                                          -> same Work Unit Implementation
All required Work Units passed + integrated                                       -> Review
Review passed                                                                     -> separately guarded delivery
Review failed: unit defect                                                        -> affected Work Unit Implementation
Review failed: decomposition defect                                               -> explicit Planning amendment
Review failed: meaning defect                                                     -> Decision
Any Gate stopped                                                                  -> preserve state and stop attempt
```

Gate pass means the exact Candidate meets current Checks; it is not semantic acceptance, integration, or delivery. Decision disposition is applied only after an authorized Actor confirms the exact passed Candidate and Gate digest against current WorkState and active-portfolio head. A passing Planning Candidate is applied only as a Change-scoped Work Graph delta. A passing Work Unit Candidate advances only that unit; deterministic completion of all required integrated units advances the Change. Checks, Runtime Plugins, Runs, and model-authored workflows cannot alter lifecycle transitions or perform effects.

## Runtime ownership

Project Server constructs an immutable Run Request only after exact subject, context, Skills, tools, model route, workspace, budget, deadline, custody, and Runtime Build have been authorized. Runtime executes that request and returns a CodeWiki-authored Run Receipt. Project Server validates the receipt against its persisted attempt or Assignment before admitting any Candidate.

Runtime owns Run and Run Process mechanics. It does not own project meaning, Stage Loop retry, Candidate admission, Check Result, Gate reduction, transition, Workbench custody, or effects. Project Server may restart its Runtime after failure and reconstruct pending work from canonical state and durable receipts. Runtime receives bounded capabilities, never canonical storage handles.

Only Implementation uses Workbenches. Project Server may claim independent ready Work Units up to configured limits, bind each exact Assignment to one Implementation Worker and isolated Workbench, dispatch a Run or delegated operation, persist one immutable worker report, and run the same resolved stage-wide Implementation Check Pack policy over every exact Work Unit Candidate with unit-specific inputs. Passing fresh Candidates enter the owning Change's private integration lineage through expected-head compare-and-swap. Project Server distinguishes Gate pass from integration and advances the Change only after deterministic all-unit completion. Decision, Planning, Review, and Model Checks receive no writable Workbench authority.

## Custody and recovery

Controlled provenance requires exact persisted custody appropriate to the stage. Backend-owned custody adds a complete Run Receipt and CodeWiki-controlled Execution Ledger. Backend-delegated custody binds exact dispatch, delegate identity, configuration policy, process lifecycle, Workbench when applicable, final output, admitted artifacts, and explicit unknown child internals. External-client provenance binds only authenticated CodeWiki operations and any admitted Workbench custody. Candidate-supplied receipts or Gate claims are untrusted.

On restart, Project Server reloads accepted Change Trace, active Change revisions and relationships, accepted Change-scoped Work Graph deltas, synchronized Git facts, configuration, current Skills and Checks, jobs, Claims, Assignments, private integration lineages, Workbenches, Run Receipts and Ledgers, Gate receipts, and guarded-effect records. It deterministically rebuilds WorkState and Alignment, reconciles interrupted work by exact identity, and never fabricates a Result, integration, completion, or transition when execution evidence is missing.

The supported operational package surface is `src/project-server/index.ts`, published as `@nunomoura/codewiki/project-server`. Its public API exposes bounded commands, queries, operations, and events. Internal coordination remains under `src/project-server/coordinator/**`; this implementation detail is not a second product owner. Project Server imports no DSH, Cordis, or delegated-harness implementation; those remain behind Runtime contracts.
