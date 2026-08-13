---
type: System Component
title: Project Runtime
description: Owns per-project authority, provenance, admission, scheduling, persistence, synchronization, Integration, recovery, lifecycle, and effects.
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

Runtime owns exact project AuthZ, actor and delegation binding, semantic idempotency, identity, admission, time, digests, freshness, expected-head CAS, provenance, canonical mutation, scheduling, Claims, Assignments, Runtime-owned workbenches, Workers, Integration, persistence, synchronization, recovery, lifecycle, final routing, and guarded effects. Runtime authorizes the accountable actor, not Client kind, User Interface, repository access, job title, profile, model, or Worker ownership.

Runtime invokes exactly three semantic Loops—Decision, Planning, and Implementation—plus shared Verification and neutral Execution Ports. Domain modules such as Change, Evidence, and Verification own their contracts and deterministic semantics without needing to live beneath `src/runtime/**`. Runtime owns authority to invoke those semantics, admit their output, persist canonical operations, and perform effects. Loops own Candidate meaning and route recommendations; Verification owns common policy and evaluation machinery; Runtime alone creates canonical Results, selects final routes, and mutates protected state.

Runtime recognizes controlled provenance only when an exact Candidate Manifest matches persisted custody. Managed provenance adds a complete Pi execution receipt. MCP-mediated Worker activity binds admitted operations and workbench identity without claiming complete external prompt or agent-loop custody. Any observed tree without matching custody is external provenance, regardless of branch, author, trailer, note, Client, Worker, or claimed producer.

External Git state is captured without changing accepted head, then either admitted against an exact accepted Change or normalized through Change Intake when intent or scope is missing. It receives no inherited execution proof and undergoes fresh policy resolution and Verification. Divergence pauses protected effects; Runtime never silently adopts, overwrites, discards, or certifies it.

Every controlled Candidate producer uses a Runtime-owned isolated workbench. Runtime may claim independent ready Work Items up to `maxWorkers`, bind one exact Assignment among Work Item, Worker, and Workbench, recover or cancel the durable job, persist one immutable report, integrate compatible outputs deterministically, and verify the combined Candidate. Workers cannot grant Claims, schedule canonical descendants, share mutable workspaces, write canonical state, create authoritative Results, or perform guarded effects.

The supported operational package surface lives at `src/runtime/index.ts` and publishes as `@nunomoura/codewiki/runtime`. The internal coordinator remains under `src/runtime/coordinator/**`; Runtime's public facade is not named Coordinator. Deployment bootstrap remains neutral and will be introduced only when one standalone process truly constructs Server and Runtime siblings.
