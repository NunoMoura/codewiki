---
type: System Component
title: Project Runtime
description: Owns per-project authority, provenance, admission, scheduling, persistence, synchronization, Integration, recovery, fixed lifecycle, and effects.
status: stable
tags: [system, component]
codewiki_component: runtime
codewiki_source_patterns: ["src/runtime/**", "src/git/**", "src/utils/**"]
codewiki_test_patterns: ["tests/runtime/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Runtime supplies authoritative coordination and guarded progression.
  - type: realizes
    target: /product/stories/maintainer/account-for-drift.md
    rationale: Runtime classifies every observed Candidate and Git state by positive provenance proof.
---
# Project Runtime

Project Runtime is the sole authoritative semantic control plane for one governed project. It is an architectural sibling of CodeWiki Server inside the standalone CodeWiki Backend and exposes a narrow command, query, operation, and event gateway. Server authenticates connections and routes requests; Runtime owns project authorization and canonical meaning. The two may be co-located, but neither owns the other, and Runtime imports neither Server, Client, DSH, Cordis, nor delegated-harness implementations.

Runtime owns exact project AuthZ, Actor and delegation binding, semantic idempotency, identity, admission, time, digests, freshness, expected-head compare-and-swap, provenance, canonical mutation, Stage Producer attempts, scheduling, Claims, Assignments, Runtime-owned Workbenches, Implementation Workers, Integration, persistence, synchronization, recovery, fixed lifecycle, and guarded effects. Runtime authorizes the accountable Actor, not Client kind, User Interface, repository access, job title, profile, model, Agent Runner, producer, delegate, or Worker ownership.

CodeWiki governs transitions between project states while Git owns content-addressed artifact history. A commit, branch, pull request, author, trailer, note, or provider status may identify Evidence or part of an immutable stage subject; none is a lifecycle transition by itself. Runtime is event-driven: accepted intent, Candidate submission, Gate completion, authority confirmation, scheduled reconciliation, or observed repository divergence may wake work. It does not infer stages from commits or continuously mutate the repository merely because it runs in the background.

Runtime invokes exactly four semantic Loops, named Stage Loops in current architecture: Decision, Planning, Implementation, and Review, under `src/loops/**`. Checks is a separate root domain under `src/checks/**`; it owns Check Pack loading, Code and Model Check coordination, completed Results, caching, fail-fast execution, and Gate Reports. Backend Execution owns Agent supervision, DSH Agent Runners, delegate adapters, and sandbox transports. Stage Loops own exact subjects, Candidate and attempt semantics, and feedback interpretation. Runtime freezes Stage Context from existing WorkState, Knowledge, Alignment, repository, Change, Evidence, and Result owners before any Backend Agent Run, Delegated Agent Run, or External Agent Client submission. Checks never selects lifecycle transitions.

Runtime applies one fixed lifecycle:

```text
Decision `approve` passed + authorized exact-Candidate confirmation → Planning
Decision `reject | defer | withdraw` passed + authorized confirmation → typed terminal or deferred state
Decision failed                      → Decision
Planning passed                      → Implementation
Planning failed                      → Planning
Implementation passed                → Review
Implementation failed                → Implementation
Review passed                         → guarded delivery
Review failed                         → Implementation
Any Gate stopped                      → stop this automation attempt and preserve current state
```

Decision's typed `approve | reject | defer | withdraw` disposition determines what Runtime may do after the Candidate passes its Gate. Gate pass means the exact Candidate meets present project Checks; it is not semantic acceptance. Runtime applies the disposition only after an authorized Actor confirms that exact passed Candidate and Gate digest against current WorkState. Editing any Candidate bytes requires a fresh Gate. Check files, Backend Plugins, Agent Runs, and model-authored workflows cannot alter lifecycle transitions or perform effects. Out-of-scope Review findings and post-Gate Outcome Diagnostics may enter Change Intake as secondary material without changing the primary lifecycle.

A Gate Report is `passed`, `failed`, or `stopped`. Runtime records only completed pass/fail Check Results. Operational inability to produce a valid Result stops the Gate after bounded retries, creates no Check Result, and causes neither an infinite wait nor a process crash. A stage with zero Checks passes with a visible `no_checks_configured` warning. Zero configured Checks do not bypass identity, authority, isolation, provenance, freshness, synchronization, or effect guards.

## Custody and accountability

Runtime recognizes controlled provenance only when the exact Candidate matches persisted custody appropriate to its stage; for repository-bearing work, the exact Candidate Manifest matches persisted custody and exact Workbench custody is proven. Backend-owned provenance adds a complete Backend Agent Run receipt and CodeWiki-controlled Execution Ledger. Backend-delegated provenance binds exact dispatch, delegate identity, explicit configuration policy, process lifecycle, Workbench, final output, resulting artifacts, and declared unknown child internals. External-client provenance binds only authenticated CodeWiki context, query, submission, confirmation, and Workbench operations. Candidate-supplied receipt or Gate claims are untrusted. Any observed tree without matching custody is external provenance regardless of branch, author, trailer, note, Client, delegate, Worker, or claimed producer.

CodeWiki targets accountability closure, not total activity surveillance. For every accepted transition, Runtime can identify exact prior and proposed states, producer and custody class, judged subject, Checks and Evidence, accountable authority, applied effects, and resulting state. Backend Execution additionally retains exact model-visible inputs for Backend Agent Runs. Delegated or external execution is never represented as fully observed when its inner prompts, tools, local reads, models, or memory are unavailable.

External Git state is captured without changing accepted head, then either admitted against one exact accepted Change or normalized through Change Intake when intent or scope is missing. It receives no inherited execution proof and runs fresh stage Checks. Divergence pauses guarded effects; Runtime never silently adopts, overwrites, discards, or certifies it.

Every Stage Producer attempt binds one exact subject, Stage Context snapshot, Skill set, producer route, budget, cancellation, custody class, and receipt. Decision, Planning, and Review producers receive immutable context and no Implementation Workbench authority. Runtime may claim independent ready Work Items up to `maxWorkers`, bind one exact Assignment among Work Item, Implementation Worker, and isolated Workbench, dispatch a Backend-owned or Backend-delegated run through neutral Execution Ports, recover or cancel the durable job, persist one immutable report, integrate compatible outputs deterministically, and run the Implementation and Review Gates over the exact integrated head. Implementation Workers cannot grant Claims, schedule canonical descendants, share mutable workspaces, write canonical state, create authoritative Results, or perform guarded effects.

The supported operational package surface lives at `src/runtime/index.ts` and publishes as `@nunomoura/codewiki/runtime`. It explicitly exports bounded commands and queries from Runtime or their semantic domain owner; there is no parallel `src/api/**` package. Snapshot-bound status, resume, trace-queue, trigger, and runtime-board reductions and their query-facing contracts live directly under `src/runtime/queries/**`; no generic source-level View owner mediates those reads. The internal coordinator remains under `src/runtime/coordinator/**`; Runtime's public facade is not named Coordinator. Generic Runtime process startup requires injected neutral Execution Ports and never resolves concrete DSH, Cordis, Pi, Claude Code, or Codex values. Standalone `src/main.ts` composes the CodeWiki Backend; optional product Clients remain outside Runtime lifecycle ownership.
