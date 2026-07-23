---
type: Concept
title: Product
description: CodeWiki is a project-scoped development operating system that keeps intent, planning, implementation, and repository knowledge explicit, connected, actionable, and recoverable for humans and agents.
tags:
  - codewiki
  - product
  - overview
timestamp: 2026-06-30T00:00:00Z
---
# Product

CodeWiki is a project-scoped development operating system. It keeps repository intent, planning, implementation, and knowledge explicit, connected, actionable, and recoverable for humans and agents.

The runtime owns the work pipeline. Individual Changes do not. A Change is the durable accountable carrier of one intended product or system delta. Runtime processes the portfolio through Backlog and Decision, global Planning, parallel Implementation, integration, and proof.

## Product structure

The dashboard has four primary destinations:

- **Work** presents Backlog, Planning, and Implementation as separate purpose-built operational workspaces.
- **Product** presents Users, Stories, and Dictionary from canonical Product Markdown. Dictionary renders the root Lexicon as the single vocabulary contract.
- **System** renders canonical System diagrams with topology-specific views.
- **Design** presents Guidelines and UIs from the canonical design system and UI concepts.

Work opens by default. Change detail remains available from every destination as a cross-cutting dossier. It explains the exact intent, approval, Product/System/Design impact, Planning coverage, realization evidence, Git proof, route-backs, and history. It does not reproduce the project pipeline inside each Change.

Product and System Markdown, System diagram YAML, source, tests, Git, Change Traces, and runtime observations keep separate authority. Dashboard views connect them through OKF links, CodeWiki relationship metadata, source ownership, planning references, and evidence references without creating another truth store.

## Work model

Backlog is the open intake and Decision surface. Authenticated users, agents, and future bounded integrations may submit proposals concurrently. Submission grants no approval, tool, filesystem, model, or execution authority. Decision refines and dispositions one exact Change revision under explicit authority.

Planning is project-wide. It observes a bounded horizon of approved Changes and emits one coherent graph of Sprints, Work Items, dependencies, contribution, conflicts, integration boundaries, rollback boundaries, and verification requirements. Sprints group execution; they do not own Changes or become another lifecycle.

Implementation consumes the ready frontier of that graph. Runtime may assign independent Work Items concurrently while serializing conflicting paths, shared integration targets, commits, and guarded external effects. Workers return candidate evidence. The Implementation loop alone accepts semantic realization.

One Change owns one append-only JSONL Change Trace. Planning facts may be sliced across several participating Change Traces. WorkState joins those traces with current Knowledge, source ownership, source/tests, Git, configuration, integration state, and bounded runtime observations.

## Runtime and clients

CodeWiki owns one project-scoped control plane. It accepts proposals, refreshes WorkState, schedules compatible semantic and mechanical jobs, manages session and worker lifecycles, guards writes, exposes live projections, and quiesces when no eligible work exists.

Pi remains the primary agent execution engine and conversational client, but an individual Pi session does not own project runtime lifetime. The Pi extension connects to the project control plane, contributes user interaction and supervision, and reuses Pi authentication and model configuration through adapter boundaries.

Target execution uses:

- embedded Pi SDK sessions for bounded read-only Decision, Planning, and review work;
- isolated process or container workers for implementation;
- harness-neutral runtime adapter interfaces so another execution engine can be added without changing CodeWiki semantics.

Sessions are replaceable operational context. They never become canonical truth, authority, scheduler locks, or the source of a Change, plan, or accepted implementation.

## Source-backed knowledge

CodeWiki renders and edits the same canonical files that agents consume. Product, System, and Design editing uses typed operations over Markdown or YAML, expected source digests, previewed diffs, format validation, and guarded Change workflows. The dashboard never writes a hidden content database or silently infers relationships.

OKF supplies portable concept documents and standard links. CodeWiki adds explicit typed relationships where workflow, ownership, dependency, or impact semantics require more than OKF's untyped links. Product / Dictionary renders `.codewiki/kb/lexicon.md` directly, with stable term links and search, so unfamiliar runtime vocabulary is explainable without a copied glossary. Generated graph and search indexes remain disposable.

## Product boundaries

Tools, commands, package APIs, worker processes, SDK sessions, and future harness adapters are access and execution mechanisms, not product truth. Their contracts belong in System Knowledge.

CodeWiki remains local-private by default. It does not expose a public proposal endpoint, arbitrary shell strings, public tunnels, personal browser profiles, or silent dependency installation.

The CodeWiki source repository does not load or dogfood its own extension during stabilization. Packed candidates are tested only in disposable external projects with isolated Pi settings.

## Success signals

- Proposals can arrive while Planning and Implementation continue safely.
- Runtime, rather than one Change or Pi conversation, owns scheduling and project progress.
- Approved Changes receive globally coherent Planning coverage without losing per-Change accountability.
- Independent Work Items run concurrently while conflicts and shared integration remain serialized.
- Every session receives a bounded, exact, freshness-bound context slice from canonical project truth.
- Product, System, and Design views render and edit canonical Markdown/YAML without parallel state.
- Users can inspect why work is queued, running, held, accepted, routed back, or waiting for authority.
- Closing or replacing one Pi session does not corrupt or erase project work.
- Restarting the control plane reconstructs pending work without duplicate semantic writes.
- Workflow ceremony improves quality, recovery, or token efficiency; otherwise it is removed.

## Related docs

- [CodeWiki Design System](DESIGN.md)
- [Project Dashboard and Pi Client](uis/terminal.md)
- [Maintainers](users/maintainers.md)
- [Agents](users/agents.md)
- [Extension and Workflow Authors](users/package-authors.md)
- [Future External Users](users/external-users.md)
- [Maintain Fresh Intent](stories/intent.md)
- [Use Loop-Governed Automation](stories/automation.md)
- [Low-Token Navigation](stories/navigation.md)
- [Dictionary](dictionary.md)
- [Lexicon](../lexicon.md)
- [System Overview](../system/components/overview.md)
