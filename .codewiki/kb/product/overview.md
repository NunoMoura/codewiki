---
type: Concept
title: Product
description: CodeWiki exists to keep repository intent fresh, explicit, actionable, and recoverable for humans and agents.
tags:
  - codewiki
  - product
  - overview
timestamp: 2026-06-30T00:00:00Z
---
# Product

CodeWiki exists to keep repository intent fresh, explicit, actionable, and recoverable for humans and agents.

For the current architecture wave, CodeWiki is backend-first. The active product focus is:

- hot knowledge in `.codewiki/kb/**`;
- a Google DESIGN.md-compatible `.codewiki/kb/product/DESIGN.md` for normative visual identity, tokens, typography, iconography, component rules, and durable visual references;
- one durable append-only JSONL Change Trace for every explicitly persisted Change journey;
- Changes Backlog, Sprint, queue, and journey views derived from Change Traces and WorkState;
- an event-driven supervised runtime outer loop that remains available and quiesces safely;
- Decision, Planning, and Implementation semantic loops;
- loop outputs and exit conditions;
- generated status/resume/work views;
- Git-backed content proof and retention;
- package APIs and future host adapters.

Product docs own user definitions, user stories, value, workflows, non-goals, branding, and visual identity. `product/DESIGN.md` is the canonical design-system contract and combines Google DESIGN.md tokens with CodeWiki-compatible OKF metadata. Product UI docs define behavior and information architecture; DESIGN.md defines visual rationale and normative token values.

## UI position

Previous status panels, status docks, Board, Map, Product/System navigation panels, write-capable browser Control Room concepts, and persistent terminal card widgets are deprecated for now.

The retained UI direction is a focused Pi conversation plus a local retro dashboard that opens automatically once when an eligible Pi TUI session starts. The Pi conversation is the main user session: the user and agent brainstorm, explicitly persist Changes, refine exact revisions through Decision, approve them, and supervise active work. There is no separate Ideas Workspace or hidden Change store. First persistence creates the Change Trace, so conversation compaction or restart cannot lose retained intent. `/wiki-dashboard` remains the explicit reopen/recovery action and can stop the local host with `--stop`.

Change is the accountable product carrier. Decision is the loop that approves an exact Change revision, not another entity. Planning creates Sprints and Work Items from the relevant portfolio of approved Changes; runtime grants bounded Assignments. Relationships are `Change * ↔ * Sprint`, `Sprint → Work Item`, and `Work Item → Assignment attempts`. Each Work Item has one owning Change and may contribute to others.

One Change owns one JSONL Change Trace from intake through outcome disposition. A Sprint is a Planning-created execution grouping and generated view across one or more Change Traces, not a trace lifecycle. Runtime can coordinate global Planning, parallel workers, integration, and Implementation while the main session continues discussing other Changes. The dashboard projects one Change-rooted Work Pipeline plus Sprint, Work Item, Assignment, preview, and Configuration views. It never owns truth or writes source directly. Change Traces, KB, source/tests, Git evidence, and bounded config remain authoritative.

Pi TUI support remains for focused command output and source-backed system diagrams as ASCII/Unicode from canonical `.codewiki/kb/system/diagrams/*.yaml` files. Backend state and continuation remain available through internal tools and APIs such as `wiki_state`, generated views derived from traces, loop outputs, and exit-condition results. `/wiki-dashboard` is the only public state/dashboard command; the former state alias is removed. No separate status command is planned. Renderer output is never canonical truth.

## Product boundaries

Tools, commands, skills, temporary CLI harness access, MCP access, package APIs, and harness adapters are not product UIs. Product stories may describe outcomes those access paths must support, but the technical access contract belongs in [CodeWiki API](../system/components/api.md), [API Tool Surface](../system/components/api-tools.md), and [Extension](../system/components/extension.md).

CodeWiki core is harness-agnostic. Pi is a primary host adapter, not the core. MCP adapters should expose the same semantics when added. The source CLI remains a temporary development/test harness and is not a product host.

CodeWiki should optimize for the best achievable code quality with the least useful token spend. Ceremony that does not improve quality, recovery, or agent efficiency should be questioned instead of preserved by default.

## Success signals

- User intent is captured in one accountable Change Trace before implementation expands.
- Approved Changes receive globally coherent Planning coverage across Sprints without losing per-Change accountability.
- Product stories map to semantic loops and system components without duplicating technical design.
- Backend state is inspectable through `wiki_state` and generated views.
- Loop outputs are high-signal enough for downstream loops without chat archaeology.
- Workflow ceremony improves code quality or token efficiency; otherwise it is removed or challenged.
- Exit conditions make next actions, blockers, and route-backs explicit.
- System diagrams can be rendered in Pi TUI as ASCII/Unicode from canonical YAML.
- Historical recovery relies on Git, harness session storage, compact trace iterations, and retained refs rather than product doc event logs.

## Related docs

- [CodeWiki Design System](DESIGN.md)
- [Maintainers](users/maintainers.md)
- [Agents](users/agents.md)
- [Extension and Workflow Authors](users/package-authors.md)
- [Future External Users](users/external-users.md)
- [Maintain Fresh Intent](stories/intent.md)
- [Use Loop-Governed Automation](stories/automation.md)
- [Low-Token Navigation](stories/navigation.md)
- [Lexicon](../lexicon.md)
- [System Overview](../system/components/overview.md)
