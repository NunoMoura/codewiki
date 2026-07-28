---
type: Concept
title: Product
description: CodeWiki is a project-scoped development operating system specialized as an intent-to-production alignment runtime that permits exact project state to advance only when required evidence is complete, fresh, and authorized.
tags:
  - codewiki
  - product
  - overview
timestamp: 2026-06-30T00:00:00Z
---
# Product

CodeWiki is an intent-to-production alignment runtime. It turns accepted user intent into an accountable transition of project Knowledge and implementation, then permits exact Git and delivery state to advance only when required evidence is complete, fresh, and authorized.

> **A Change is accountable intent and a durable dossier. Runtime owns the portfolio pipeline.**
>
> **CodeWiki turns accepted intent into accountable project change. Decision, Planning, and Implementation each produce exact candidates that may exit only through immutable Check Results and an Exit Report. Change Traces preserve every transition, enabling project-local learning and optional privacy-preserving feedback that improves CodeWiki itself without weakening authority, provenance, or user control.**

The product does not promise that ambiguous intent became semantically perfect code. It provides bounded semantic checking, exact candidate identity, progression integrity, provenance, guarded effects, and explicit uncertainty.

## Product structure

The dashboard has four primary destinations:

- **Work** presents Backlog, Planning, and Implementation as separate operational workspaces.
- **Product** presents Users, Stories, and Dictionary from canonical Product Markdown.
- **System** renders canonical System diagrams and component/flow Knowledge.
- **Design** presents Guidelines and UIs from canonical design concepts.

Work opens by default. Change detail remains available from every destination as a cross-cutting dossier. It explains exact intent, revisions, authority, Product/System/Design impact, Planning coverage, Loop attempts, Checks, realization, Git/delivery proof, route-backs, learning provenance, and outcomes. It does not reproduce a private pipeline inside each Change.

Product/System/Design Knowledge, source/tests, Git, Change Traces, and external observations keep separate authority. Dashboard views connect them without creating another truth store.

## Change model

One Change owns one append-only JSONL Change Trace. A Change records one accountable outcome through:

```text
intent
→ Decision candidates and exit
→ global Planning coverage
→ Work Items and Assignments
→ Implementation candidates and exit
→ Integration and Git proof
→ delivery effects
→ outcome disposition
```

Failed and indeterminate attempts remain durable repair and learning evidence. A materially different outcome creates a linked Change instead of silently changing identity.

Changes do not own scheduling. Project Runtime processes the portfolio through compatible Decision work, one global Planning writer, parallel isolated Implementation Work Items, serialized Integration, and separately authorized effects.

## Work model

Backlog is the open intake and Decision surface. Authenticated users, agents, and future bounded integrations may submit proposals concurrently. Submission grants no approval, filesystem, model, or execution authority.

Planning is project-wide. It observes a bounded horizon of approved Changes and produces coherent Sprints, Work Items, dependencies, contribution, conflicts, integration/rollback boundaries, Workbench requirements, and verification obligations.

Implementation consumes the ready frontier. Runtime may assign independent Work Items concurrently while serializing conflicts and shared integration/effect targets. Workers return candidate evidence. The Implementation Loop alone decides whether one exact realization candidate may exit.

Each Loop evaluates one exact candidate through a Resolved Exit Policy containing Code Checks and Model Checks. Every Check produces one Check Result. Required Results fan into one immutable Exit Report. Runtime routes and appends only after freshness and authority revalidation.

## Runtime and clients

Primary product boundary:

```text
CodeWiki CLI
+ Project Runtime
+ dashboard
+ embedded published Pi SDK
```

The Pi extension is an optional thin conversational client to the same Project Runtime. It supports intent intake, authority, explanation, supervision, and dashboard access without owning project lifetime or duplicating runtime authority.

Pi owns providers, credentials, model transport, sessions, compaction, tools, extensions, and ordinary Skills. CodeWiki owns project workflow, Change Traces, WorkState, Loop Protocols, Checks, Workbenches, workers, Integration, routing, and guarded effects.

Harness-neutral execution boundaries allow future adapters, including possible OpenClaw clients or workers, without changing CodeWiki semantics. CodeWiki does not fork or rebrand Pi.

## Source-backed Knowledge

CodeWiki renders and edits the canonical Markdown/YAML that agents consume. OKF provides portable Knowledge concepts, provenance, trust/freshness metadata, and standard links. CodeWiki adds software-specific realization, authority, Change accountability, source/test ownership, and Git/delivery evidence.

Imported OKF metadata remains untrusted until project authority accepts it. Generated graph/search indexes remain disposable.

## Alignment

Alignment does not require every durable source to be equal during active work. Every discrepancy must be:

- resolved;
- accounted for by one exact active Change; or
- explicitly unknown and blocked from unsafe progression.

CodeWiki keeps vertical, horizontal, temporal, and delivery alignment visible rather than collapsing them into one score.

## Compounding project intelligence

> **Changes improve future Changes.**

Change Traces preserve exact candidate, Check, Result, repair, Git, delivery, and outcome lineage. Runtime may derive Repair Episodes and recurring Repair Patterns so future candidate producers avoid project-specific mistakes.

Learning remains advisory until validated. It cannot suppress required Checks, lower thresholds, choose authority, or attest acceptance. Stable promoted guidance enters Knowledge, configuration, or source only through another accountable Change.

Persistent suspected CodeWiki failures may be exported through a user-reviewed, allowlisted, pseudonymized Feedback Bundle. Full traces, intent, Knowledge, source, paths, prompts, reasoning, raw tool output, credentials, and exact project identities are excluded by default. Initial feedback transport is manual and opt-in.

## Product boundaries

CodeWiki does not build or compete on generic provider breadth, everyday coding UX, channels, arbitrary orchestration, worktree management, task boards, code intelligence, or CI/CD. It reuses Pi, Pi-Lens/LSP, Git, existing build/test tools, and external delivery systems.

CodeWiki remains local-private by default. It exposes no public proposal endpoint, public tunnel, arbitrary shell strings, silent dependency installation, automatic telemetry upload, or hidden content database.

The source repository does not load or dogfood its own extension during stabilization. Packed candidates are tested only in disposable external projects with isolated Pi settings.

## Success signals

- Every promoted Git tree has accountable intent.
- Every accepted intent has visible realization state.
- Every discrepancy is resolved, Change-accounted, or explicitly unknown.
- Every required Check Result binds the exact candidate and policy.
- Every remote claim names exact commit/artifact/environment evidence.
- No worker, model, Skill, Check, or client can attest its own acceptance.
- Project-specific repair repetition falls without increasing false passes or escaped regressions.
- Users can export useful CodeWiki diagnostics without sharing project content by default.
- Workflow ceremony improves alignment, recovery, assurance, or token efficiency; otherwise it is removed.

## Competitive survival rule

If CodeWiki does not materially reduce drift, false acceptance, lost context, repeated repair, and integration errors enough to offset latency and ceremony, it should shrink into a thin Pi/OpenClaw extension instead of maintaining a separate runtime.

## Related docs

- [CodeWiki Design System](DESIGN.md)
- [Project Dashboard and Optional Pi Client](uis/terminal.md)
- [Maintainers](users/maintainers.md)
- [Agents](users/agents.md)
- [Dictionary](dictionary.md)
- [Lexicon](../lexicon.md)
- [System Overview](../system/components/overview.md)
- [Alignment Model](../system/components/alignment-model.md)
- [Loop Exit](../system/components/loop-exit.md)
