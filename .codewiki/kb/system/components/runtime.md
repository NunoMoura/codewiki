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

Project Runtime is the sole authoritative semantic control plane for one managed project. It is an architectural sibling of CodeWiki Server and exposes a narrow command, query, operation, and event gateway. Server authenticates connections and routes requests through that gateway; Runtime owns project authorization and canonical meaning. The two may be co-located, but Server does not own Runtime, Runtime does not own Server, and Runtime imports neither Server nor Client implementations.

Runtime owns exact project AuthZ, actor and delegation binding, semantic idempotency, identity, admission, time, digests, freshness, expected-head compare-and-swap, provenance, canonical mutation, scheduling, Claims, Assignments, Runtime-owned workbenches, Workers, Integration, persistence, synchronization, recovery, fixed lifecycle, and guarded effects. Runtime authorizes the accountable actor, not Client kind, User Interface, repository access, job title, profile, model, or Worker ownership.

Runtime invokes exactly four semantic Loops under `src/loops/**`: Decision, Planning, Implementation, and Review. Checks is a separate root domain under `src/checks/**`; it owns Check Pack loading, Code and Model Check coordination, completed Results, caching, fail-fast execution, and Gate Reports. Managed Execution owns concrete Pi and sandbox transports. Loops own their stage subjects, attempt semantics, and interpretation. Checks never selects lifecycle transitions; Runtime applies only the fixed rules below.

Runtime applies one fixed lifecycle rather than interpreting Check-authored routes:

```text
Decision `approve` passed             → Planning
Decision `reject | defer | withdraw` passed → typed terminal or deferred state
Decision failed                      → Decision
Planning passed                      → Implementation
Planning failed                      → Planning
Implementation passed                → Review
Implementation failed                → Implementation
Review passed                         → guarded delivery
Review failed                         → Implementation
Any Gate stopped                      → stop this automation attempt and preserve current state
```

Decision's typed `approve | reject | defer | withdraw` disposition still determines whether a passed Decision advances, terminates, or remains deferred. Check files cannot alter lifecycle transitions or perform effects. Out-of-scope Review findings may enter Change Intake as secondary material without changing the fixed primary lifecycle.

A Gate Report is `passed`, `failed`, or `stopped`. Runtime records only completed pass/fail Check Results. Operational inability to produce a valid Result stops the Gate after bounded retries, creates no Check Result, and causes neither an infinite wait nor a process crash. A stage with zero Checks passes with a visible `no_checks_configured` warning. Zero configured Checks do not bypass Runtime identity, authority, isolation, provenance, freshness, synchronization, or effect guards.

Runtime recognizes controlled provenance only when an exact Candidate Manifest matches persisted custody. Managed provenance adds a complete Pi execution receipt. MCP-mediated Worker activity binds admitted operations and workbench identity without claiming complete external prompt or agent-loop custody. Any observed tree without matching custody is external provenance, regardless of branch, author, trailer, note, Client, Worker, or claimed producer.

External Git state is captured without changing accepted head, then either admitted against one exact accepted Change or normalized through Change Intake when intent or scope is missing. It receives no inherited execution proof and runs fresh stage Checks. Divergence pauses guarded effects; Runtime never silently adopts, overwrites, discards, or certifies it.

Every controlled Candidate producer uses a Runtime-owned isolated workbench. Runtime may claim independent ready Work Items up to `maxWorkers`, bind one exact Assignment among Work Item, Worker, and Workbench, recover or cancel the durable job, persist one immutable report, integrate compatible outputs deterministically, and run the Implementation and Review Gates over the exact integrated head. Workers cannot grant Claims, schedule canonical descendants, share mutable workspaces, write canonical state, create authoritative Results, or perform guarded effects.

The supported operational package surface lives at `src/runtime/index.ts` and publishes as `@nunomoura/codewiki/runtime`. It explicitly exports bounded commands and queries from Runtime or their semantic domain owner; there is no parallel `src/api/**` package. Snapshot-bound status, resume, trace-queue, trigger, and runtime-board reductions and their query-facing contracts live directly under `src/runtime/queries/**`; no generic source-level View owner mediates those reads. The internal coordinator remains under `src/runtime/coordinator/**`; Runtime's public facade is not named Coordinator. Generic Runtime process startup requires an injected daemon spawner and never resolves a concrete Pi implementation. Pi-specific daemon composition belongs to Managed Execution. The shipped Pi Package bootstrap is neutral and lives at `src/pi-extension.ts`; a separate standalone Server/Runtime process bootstrap remains pending until that process genuinely exists.
