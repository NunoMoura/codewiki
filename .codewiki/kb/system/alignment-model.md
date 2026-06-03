---
id: spec.system.alignment-model
title: Alignment Model
state: active
summary: Core CodeWiki model for context-driven development alignment across intent, KB truth, telemetry traces, tests/code, gates, Git proof, and publication.
owners:
  - architecture
  - product
updated: "2026-06-03"
---

# Alignment Model

## Intent

CodeWiki's main product promise is context-driven software development through alignment at every stage of the development process. The system must preserve traceability from user-agent interaction through decision, planning, implementation, gates, Git commits, and publication when applicable.

Alignment is not a single artifact. It is the result of canonical KB truth, compact telemetry traces, generated graph reconciliation, deterministic gate evidence, gateway verdicts, executable tests/code, and immutable Git/content proof working together.

## Layers

| Layer | Role | Canonical evidence |
| --- | --- | --- |
| User-agent interaction | Captures intent, ambiguity, tradeoffs, and approval. | Approved decision rows. |
| Decision | Captures approved semantic intent plus KB/diagram propagation. | `.codewiki/telemetry/<trace_id>/decision.json`. |
| Product knowledge | Defines users, stories, UI behavior, and product intent. | `.codewiki/kb/product/**`. |
| System knowledge | Defines architecture, workflows, policies, file ownership, and diagram-backed system ontology. | `.codewiki/kb/system/**` plus `system/diagrams/**`. |
| Planning | Defines executable work, acceptance, non-goals, verification, and candidate refs. | `.codewiki/telemetry/<trace_id>/planning.json` plus roadmap compatibility state during migration. |
| Implementation | Records changed code/docs/tests, acceptance evidence, and closure readiness. | `.codewiki/telemetry/<trace_id>/implementation.json`. |
| Tests | Proves intended behavior or records justified test-design evidence. | `tests/**` and implementation trace evidence. |
| Code | Implements behavior and package surfaces. | `src/**`, `skills/**`, tests, package files, and other product source. Optional `scripts/**` helpers are not authoritative product source. |
| Gates | Independent gateway judgment over source-backed evidence. | Gate verdict/findings embedded in loop trace files. |
| Git proof | Immutable proof of repository content at a point in time. | Git tree/commit SHA, tags, package digest, and remote refs. |
| Publication | Proof of what was shipped or claimed externally. | Package digest, PR/release text, remote refs, safe-to-push evidence. |

## Vertical alignment

Vertical alignment means changes propagate through required layers without gaps:

```text
user intent -> decision.json -> planning.json -> implementation.json -> Git proof
```

Product-first and system-first decisions may enter different abstraction layers. Product-first decisions update product meaning before system impact is checked. System-first decisions update system diagrams/knowledge before user-visible product impact is checked. Both paths require explicit propagation or no-impact evidence.

The graph is the generated vertical state machine. It encodes expected layer edges and reconciliation gaps, but it is not canonical truth. Agents and gates must read source refs directly before changing or validating semantics.

## Graph-backed transition model

CodeWiki's operational transition model is graph-backed, not chat-backed. Each compiler or gate cycle starts from canonical sources and graph-derived routing context, writes loop trace evidence or a gate verdict, then the graph is regenerated from source truth.

A Markov-chain view can be useful only as a compact projection over this graph-backed state. The projected state must include enough source-backed context, such as loop, scope, lifecycle, failure class, risk tier, gate state, proof status, and freshness, for the next transition to be independent of chat history. Loop names alone are not sufficient state.

## Horizontal alignment

Horizontal alignment means sources within a layer do not contradict each other. Examples include product docs agreeing with system docs, diagram refs matching system docs, planning acceptance matching tests, code boundaries matching file-structure policy, and commit/release text matching implemented changes.

Compilers create source-backed loop trace output. Gateways independently verify horizontal and cross-layer consistency at boundaries using graph context, canonical sources, gate evidence, and content proof.

## Precedence

When evidence conflicts, CodeWiki uses this precedence:

1. Immutable content proof: Git tree/commit SHA, package digest, tags, and remote refs.
2. Canonical source files: knowledge, telemetry traces, tests, code, package files, and roadmap compatibility state.
3. Gateway policy: pass/block criteria and required evidence for a boundary.
4. Deterministic linter outputs and executable test logs.
5. Graph state: derived route, reconciliation, freshness, and traceability summary.
6. Gate verdict: gateway attestation over named evidence at a specific time.
7. Chat/session memory: useful context only, never canonical truth.

A gate verdict is not proof that code or docs changed. It is an attestation that a gate checked named evidence. The verdict is valid only when it cites source refs, required gate evidence, and checked content proof required by policy. Implementation completion requires clean immutable proof such as tree SHA, commit SHA, package digest, or remote ref when the work claims production readiness.

## Semantic change rule

Every semantic change must trace to passed loop trace evidence before it can close or publish. A semantic change includes product intent, system design, architecture, roadmap/task meaning, test expectations, code behavior, security policy, dependencies, package contents, or publication assertions.

Generated files, runtime/session coordination state, gate reports, and purely mechanical formatting do not require their own decision. If they are part of a semantic change set, they must attach to the relevant trace evidence and evidence mapping.

## Change type

All agent-led semantic work starts with decision classification, then routes to the owning loop. Trace entries and task metadata use `change_type` for the target that changed:

| Change type | Primary owner | Required propagation check |
| --- | --- | --- |
| `product` | Decision compiler | Product docs, system impact or no-system-impact evidence, planning/tests/code needs. |
| `system` | Decision compiler | System diagrams/docs, file ownership, graph/gateway policy, product impact or no-product-impact evidence, implementation needs. |
| `task` | Planning -> implementation | Existing accepted decision/task links, tests/code evidence. |
| `code` | Decision, planning, or implementation | Upward decision/planning impact if behavior changes. |

Security, publication, and maintenance describe risk, workflow, or intent. They should be represented as labels, criteria, risk metadata, or publication context rather than primary change types. Generated, runtime, and mechanical-only work should use traceability exemption metadata (`generated`, `runtime`, or `mechanical`) and `semantic=false` when policy allows.

## Rules

- Graph routes and summarizes; it never overrides canonical sources or immutable content proof.
- Markov/MDP-style transition analytics are derived views over graph-backed reconciliation transitions; they never replace graph traceability or canonical evidence.
- Gateways decide loop exit outcomes, but their verdicts are attestations over evidence, not content proof.
- Commits, tree SHAs, tags, package digests, and remote refs anchor what exists or shipped.
- Compiler output carries traceability between loops, not permanent source truth.
- Decision trace evidence is the semantic root for intent-to-knowledge work.
- Implementation gate proves commit-readiness; implementation closure requires actual Git proof.
- Commit bodies should include trace refs, gate refs, required test/linters, and recovery/update notes.
- Publication must match passed trace evidence, gate verdicts, and content proof.
- Dogfood state and product source must remain separated by explicit path taxonomy.

## Related docs

- [Lexicon](../lexicon.md)
- [Compilers](compilers.md)
- [Compiler Output Artifacts](builds.md)
- [Graph](graph.md)
- [Gateway](validation-gateway.md)
- [File Structure](file-structure.md)
