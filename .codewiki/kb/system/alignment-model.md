---
id: spec.system.alignment-model
title: Alignment Model
state: active
summary: Core CodeWiki model for context-driven development alignment across intent, knowledge, roadmap, tests, code, validation, commits, and publication.
owners:
  - architecture
  - product
updated: "2026-05-26"
---

# Alignment Model

## Intent

CodeWiki's main product promise is context-driven software development through alignment at every stage of the development process. The system must preserve traceability from user-agent interaction through decision, roadmap, tests, code, validation, commits, and publication.

Alignment is not a single artifact. It is the result of canonical sources, compiler builds, state reconciliation, deterministic audits, independent gateway validation, and immutable content proof working together.

## Layers

| Layer | Role | Canonical evidence |
| --- | --- | --- |
| User-agent interaction | Captures intent, ambiguity, tradeoffs, and approval. | Approved decision rows. |
| Decision | Captures approved semantic intent plus knowledge update evidence. | `decision_build` files. |
| Product knowledge | Defines users, stories, UI behavior, and product intent. | `.codewiki/kb/product/**`. |
| System knowledge | Defines architecture, workflows, policies, file ownership, and diagram-backed system ontology. | `.codewiki/kb/system/**` plus `system/diagrams/**`. |
| Roadmap | Defines executable work, priority, state, acceptance, non-goals, and verification. | `.codewiki/roadmap/queue.json`. |
| Tests | Proves intended behavior or records justified test-design evidence. | `tests/**` and implementation-build test evidence. |
| Code | Implements behavior and package surfaces. | `src/**`, `skills/**`, tests, package files, and other product source. Optional `scripts/**` helpers are not authoritative product source. |
| Builds | Compact handoff evidence between compiler loops. | `.codewiki/builds/**`. |
| Validation | Independent gateway judgment over source-backed evidence. | Validation reports and validation verdict metadata. |
| Commits | Immutable proof of repository content at a point in time. | Git tree/commit SHA. |
| Publication | Proof of what was shipped or claimed externally. | Package digest, archive ledger, PR/release text, remote refs, safe-to-push evidence. |

## Vertical alignment

Vertical alignment means changes propagate through the development stack without missing required layers. A semantic change should be traceable through generated state from accepted intent or decision build to durable knowledge, roadmap work, tests/code, implementation evidence, validation, and publication when applicable.

Product-first and system-first decisions may enter different abstraction layers. Product-first decisions update product meaning before system impact is checked. System-first decisions update system diagrams/knowledge before user-visible product impact is checked. Both paths require explicit propagation or no-impact evidence.

Generated state is the derived vertical state machine. It encodes expected layer edges and reconciliation gaps, but it is not canonical truth. The state engine routes the next loop and points to source refs; agents and gateways must read canonical sources directly before changing or validating semantics.

## Graph-backed transition model

CodeWiki's operational transition model is graph-backed, not chat-backed. Each compiler or gateway cycle starts from canonical sources and graph-derived routing context, produces a build, validation verdict, task update, proof, or reconciliation item, then the graph is regenerated from source truth.

A Markov-chain view can be useful only as a compact projection over this graph-backed state. The projected state must include enough source-backed context, such as loop, scope, lifecycle, failure class, risk tier, policy, proof status, and freshness, for the next transition to be independent of chat history. Loop names alone are not sufficient state.

Markov-style transition metrics and future MDP-style agency policies are generated analytics. They can help detect retry traps, expected cycle counts, and escalation policy quality, but they do not replace the graph, canonical source reads, gateway policy, or immutable content proof.

## Horizontal alignment

Horizontal alignment means sources within a layer do not contradict each other. Examples include product docs agreeing with system docs, roadmap acceptance matching tests, code boundaries matching file-structure policy, and commit or release text matching implemented changes.

Compilers create source-backed builds. Gateways independently verify horizontal and cross-layer consistency at boundaries using generated-state context, canonical sources, audit evidence, and content proofs.

## Precedence

When evidence conflicts, CodeWiki uses this precedence:

1. Immutable content proof: Git tree/commit SHA, package digest, archive ledger, and remote refs.
2. Canonical source files: knowledge, roadmap queue, tests, code, package files, and approved build artifacts.
3. Gateway policy: pass/block criteria and required evidence for a boundary.
4. Deterministic audit outputs and check logs.
5. Graph state: derived route, reconciliation, freshness, and traceability summary.
6. Validation report: gateway attestation over the evidence checked at a specific time.
7. Chat/session memory: useful context only, never canonical truth.

A validation report is not proof that code or docs changed. It is an attestation that a validator checked named evidence. The report is valid only when it cites source refs, audit/check evidence, and checked content proof required by policy. Implementation validation may use a dirty pre-commit working-tree digest. Task-close, publication, publish, and release require clean immutable proof such as tree SHA, commit SHA, package digest, archive ref, or remote ref so closed work can be recovered from durable history.

## Semantic change rule

Every semantic change must trace to an accepted compiler build before it can close, validate, or publish. A semantic change includes product intent, system design, architecture, roadmap/task meaning, test expectations, code behavior, security policy, dependencies, package contents, or publication assertions.

Generated files, runtime/session queue state, validation/audit reports, and purely mechanical formatting do not require their own build. If they are part of a semantic change set, they must attach to the relevant accepted build and evidence mapping.

## Change type

All agent-led semantic work starts with decision classification, then routes to the owning loop. Builds and task metadata use `change_type` for the target that changed:

| Change type | Primary owner | Required propagation check |
| --- | --- | --- |
| `product` | Decision compiler | Product docs, system impact or no-system-impact evidence, roadmap/tests/code needs. |
| `system` | Decision compiler | System diagrams/docs, file ownership, graph/gateway policy, product impact or no-product-impact evidence, roadmap/code needs. |
| `task` | Planning -> implementation | Existing accepted decision/task links, tests/code evidence. |
| `code` | Decision, planning, or implementation | Upward decision/roadmap impact if behavior changes. |

Security, audit, publication, and maintenance describe risk, workflow, or intent. They should be represented as labels, profiles, risk metadata, or publication context rather than primary change types. Generated, runtime, and mechanical-only work should use traceability exemption metadata (`generated`, `runtime`, or `mechanical`) and `semantic=false` when policy allows.

When intent is unclear, work routes back to the decision proposal phase before canonical docs, roadmap, tests, or code change.

Routine decisions combine user semantic approval and knowledge updates into one decision build. Lower-layer task creation, implementation, closure, and publication are validated by gateways; user approval is reserved for semantic decisions and configured risk escalations.

## Rules

- Graph routes and summarizes; it never overrides canonical sources or immutable content proof.
- Markov/MDP-style transition analytics are derived views over graph-backed reconciliation transitions; they never replace graph traceability or canonical evidence.
- Gateways decide boundary outcomes, but their reports are attestations over evidence, not content proof.
- Commits, tree SHAs, and package digests anchor what exists or shipped.
- Build artifacts carry traceability between loops, not permanent source truth.
- Decision builds are the semantic root for intent-to-knowledge work.
- Implementation validation proves commit-readiness; task closure proves an actual immutable recovery commit exists.
- Commits are required content-proof checkpoints for task closure; commit bodies should include task id, build refs, validation refs, checks, and recovery/update notes.
- Publication is an alignment layer and must match accepted builds, validation, and content proof.
- Dogfood state and product source must remain separated by explicit path taxonomy.

## Related docs

- [Compilers](compilers.md)
- [Builds](builds.md)
- [Graph](graph.md)
- [Validation Gateway](validation-gateway.md)
- [Audits](audits.md)
- [File Structure](file-structure.md)
