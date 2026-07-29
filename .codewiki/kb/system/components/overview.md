---
type: Concept
title: System Overview
description: CodeWiki is an intent-to-production alignment runtime built as a standalone CLI, Project Runtime, and dashboard over Pi, with exactly three semantic Loops and candidate-bound exit Checks.
tags:
  - codewiki
  - system
  - overview
timestamp: 2026-06-30T00:00:00Z
---
# System Overview

CodeWiki turns accepted intent into accountable project change. Primary boundary is standalone CLI, Project Runtime, dashboard, and embedded published Pi SDK. Optional Pi extension is a thin client.

Source checkout uses `.codewiki/kb/**` as intended design truth, source/tests as executable truth, and Git as history/checkpoint proof. It does not load or dogfood its own extension during stabilization.

## Mental model

```text
(Kₜ, Gₜ, Pₜ) + ΔIntent
  ──CodeWiki──>
(Kₜ₊₁, Gₜ₊₁, Pₜ₊₁, Evidence)
```

`K` is accepted Knowledge, `G` exact Git state, `P` delivery state, and Evidence includes immutable typed Evidence Records, exact Check Results and Exit Reports, authority receipts, Integration proof, and observations.

```text
Project Runtime
├── Decision Loop
├── Planning Loop
└── Implementation Loop
```

Each Loop has versioned Loop Protocol, exact typed input, immutable candidate, candidate-specific Resolved Exit Policy, Code/Model Checks, Check Results, and immutable Exit Report.

```text
Change
→ Loop
→ Candidate
→ Resolved Exit Policy
→ Checks
→ Check Results
→ Exit Report
→ Runtime route
```

Runtime validates freshness, generation, authority, and CAS before append/effect. A passing Report permits exact Loop exit only.

## Ownership boundary

Pi owns providers, credentials, model transport, sessions, compaction, tools, extensions, and Skills.

CodeWiki owns Change Traces, WorkState, Loops, Loop Protocols, Checks/exit, Workbenches, workers, Integration, routing, and guarded effects. Future harness adapters cannot replace semantic authority.

## Truth and projections

- `.codewiki/kb/**`: accepted Product/System/Design Knowledge, portable through OKF.
- `.codewiki/traces/TRACE-CHG-*.jsonl`: append-only Change progression and reusable evidence in consuming projects.
- source/tests: executable truth.
- Git/remote/artifact observations: exact content and delivery-boundary proof.
- configuration: approved policy and capabilities.

WorkState, Work/Alignment/Learning graphs, indexes, dashboard state, `.codewiki/views/**`, and `.codewiki/runtime/learning/**` are disposable projections/caches. Private Workbenches, raw model/tool output, failed patches, credentials, and reasoning stay under bounded runtime storage and never become trace truth.

Alignment means every discrepancy is resolved, tied to an exact active Change, or explicitly unknown and blocked from unsafe progression.

## Target source roots

```text
src/
  semantic-loop.ts
  loop-exit/**
  decision/**
  planning/**
  implementation/**
  runtime/loop-exit-runtime.ts
  dashboard/**
  traces/**
  views/**
  knowledge/**
  git/**
  runtime/**
  error-handling/**
  pi/**
  project/**
  utils/**
  api/**
```

Shared `src/loop-exit/**` cannot import Loop implementations. Runtime composes one immutable `LoopExitSuite`. Current `src/loops/**` checking/judge/graph machinery is migration state and will be deleted by clean cuts without old-path re-exports.

## Work and execution

Decision creates accepted semantic revisions and Knowledge impact. Planning globally shapes approved Changes into Sprints and worker-ready Work Items. Runtime provisions bounded Workbenches and Assignments, materializes typed Evidence Records, and correlates exact approval. Implementation accepts exact realization candidates. For required team review, Runtime may publish an isolated draft-pull-request Validation Bundle before final exit solely to gather evidence. Runtime then serializes post-exit Integration and separately guarded project merge, ordinary push, publication, release, and future deployment effects.

Workers and Model Checks are isolated and non-authoritative. Worker completion, screenshots/videos, and provider comments are evidence material until Runtime validates typed records and trusted Checks consume them. Model Check operational failure is indeterminate. Pi-Lens/tools/Skills help build and repair candidates but cannot attest acceptance.

## Learning and feedback

Compact candidate/Check/repair/outcome lineage persists in Change Traces. Repair Episodes and Repair Patterns are derived project-local views, not truth or another Loop. Learned context cannot alter activation, thresholds, authority, or exit.

Suspected CodeWiki defects may produce local allowlisted Feedback Bundles only after user preview/redaction and separate approval. No full-trace telemetry or automatic upload.

## Guarantee boundary

CodeWiki guarantees bounded process integrity, exact identity, independent checking, deterministic threshold/reduction, guarded progression, provenance, and explicit uncertainty. It does not guarantee unknowable semantic perfection or permanent remote state.

## Related docs

- [Alignment Model](alignment-model.md)
- [Loop Model](loop-model.md)
- [CodeWiki OS and Loop Protocols](codewiki-os.md)
- [Loop Exit](loop-exit.md)
- [Evidence Records](evidence.md)
- [Worker Workbench](worker-workbench.md)
- [Model Routing](model-routing.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
- [Migration Audit](../flows/migration-audit.md)
- [Source Map](source-map.md)
- [API Tool Surface](api-tools.md)
