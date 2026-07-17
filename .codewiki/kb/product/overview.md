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
- a durable Changes Backlog for mutable pre-Decision Changes;
- append-only JSONL traces as workflow/state truth;
- independent trace execution coordinated by the runtime outer loop;
- decision, planning, and implementation semantic loops;
- loop outputs and exit conditions;
- generated status/resume/work views;
- Git-backed content proof and retention;
- package APIs and future host adapters.

Product docs own user definitions, user stories, value, workflows, and non-goals. They define only the active Pi session and local dashboard surfaces retained for this wave.

## UI position

Previous status panels, status docks, Board, Map, Product/System navigation panels, write-capable browser Control Room concepts, and persistent terminal card widgets are deprecated for now.

The retained UI direction is a focused Pi conversation plus a local retro dashboard that opens automatically once when an eligible Pi TUI session starts. The Pi conversation is the main user session: the user and agent brainstorm, create and refine Changes, validate exact revisions, and supervise active work there. There is no separate Ideas Workspace product or domain. Mutable Change records are durable in the Changes Backlog so conversation compaction or restart does not lose proposed work. Before Decision, the user confirms a Sprint Map that groups exact validated Change revisions under one accountable goal, canonical Product/System Knowledge Base topics or an explicit no-impact rationale, cross-Sprint dependencies, and one rollback boundary. Sprint shaping remains mutable Change work in the main session; it is not a fourth semantic loop or a new truth store. `/wiki-dashboard` remains the explicit reopen/recovery action and can stop the local host with `--stop`.

The product hierarchy is `Change → Sprint → Work Item → Assignment`. One Sprint always equals one trace-backed lifecycle. Planning creates Work Items inside that Sprint, and runtime grants bounded Assignments for those Work Items. Internal trace and work-unit identifiers remain valid implementation details but should not replace this vocabulary in user-facing views.

Once `wiki_decide` consumes a user-confirmed Sprint Map and its validated Changes, then creates the Decision-backed trace, that trace becomes an independent unit of work. A trace-scoped runner can plan, coordinate workers, integrate results, and validate implementation while the main session continues discussing other Changes. The dashboard projects one Work Pipeline with shared Pipeline Card visuals over tagged Change and Sprint Trace projections, plus secondary Configuration. It never merges canonical stores, owns truth, or writes source directly. Trace JSONL, Change records, KB, and Git evidence remain authoritative.

Pi TUI support remains for focused command output and source-backed system diagrams as ASCII/Unicode from canonical `.codewiki/kb/system/diagrams/*.yaml` files. Backend state and continuation remain available through internal tools and APIs such as `wiki_state`, generated views derived from traces, loop outputs, and exit-condition results. `/wiki-dashboard` is the only public state/dashboard command; the former state alias is removed. No separate status command is planned. Renderer output is never canonical truth.

## Product boundaries

Tools, commands, skills, temporary CLI harness access, MCP access, package APIs, and harness adapters are not product UIs. Product stories may describe outcomes those access paths must support, but the technical access contract belongs in [CodeWiki API](../system/components/api.md), [API Tool Surface](../system/components/api-tools.md), and [Extension](../system/components/extension.md).

CodeWiki core is harness-agnostic. Pi is a primary host adapter, not the core. MCP adapters should expose the same semantics when added. The source CLI remains a temporary development/test harness and is not a product host.

CodeWiki should optimize for the best achievable code quality with the least useful token spend. Ceremony that does not improve quality, recovery, or agent efficiency should be questioned instead of preserved by default.

## Success signals

- User intent is captured before implementation expands.
- Product stories map to semantic loops and system components without duplicating technical design.
- Backend state is inspectable through `wiki_state` and generated views.
- Loop outputs are high-signal enough for downstream loops without chat archaeology.
- Workflow ceremony improves code quality or token efficiency; otherwise it is removed or challenged.
- Exit conditions make next actions, blockers, and route-backs explicit.
- System diagrams can be rendered in Pi TUI as ASCII/Unicode from canonical YAML.
- Historical recovery relies on Git, harness session storage, compact trace iterations, and retained refs rather than product doc event logs.

## Related docs

- [Maintainers](users/maintainers.md)
- [Agents](users/agents.md)
- [Extension and Workflow Authors](users/package-authors.md)
- [Future External Users](users/external-users.md)
- [Maintain Fresh Intent](stories/intent.md)
- [Use Loop-Governed Automation](stories/automation.md)
- [Low-Token Navigation](stories/navigation.md)
- [Lexicon](../lexicon.md)
- [System Overview](../system/components/overview.md)
