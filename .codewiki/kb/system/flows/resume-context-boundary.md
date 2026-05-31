---
id: spec.system.flows.resume-context-boundary
title: Resume Context Boundary Flow
state: active
owners:
  - architecture
flow_id: resume_context_boundary
participants:
  - state_engine
  - runtime
  - adapter
  - worker_session
component_ids:
  - state_engine
  - runtime
  - adapters_ui
  - api_facade
diagram_refs:
  - component-map:resume_context
  - component-map:state_engine
  - key-flow:resume_context
source_refs:
  - .codewiki/kb/system/api.md
  - .codewiki/kb/system/runtime.md
  - .codewiki/kb/system/compilers.md
code_paths:
  - src/state
  - src/runtime
  - src/adapters
code_paths_mode: explicit_override
updated: "2026-06-01"
summary: Context refresh, compaction, and replacement-session starts are seeded from CodeWiki source refs.
---

# Resume Context Boundary Flow

1. State reads graph, roadmap, task context shards, builds, validation reports, and source refs.
2. `wiki_resume_context` emits a bounded source-backed packet for the next loop.
3. Same-agent context refresh or compaction may use that packet after safe visible tool results.
4. Hard replacement sessions use adapter-owned session boundary capability and source-backed kickoff.
5. The next loop reads exact refs directly before semantic edits.

Normal continuation uses CodeWiki refs, not VCC recall, generic chat summaries, or slash-command injection. Adapter limitations must be visible and must fail closed when the host cannot provide a required boundary.

## Related docs

- [Compilers](../compilers.md)
- [Runtime](../runtime.md)
- [Validation Gateway](../validation-gateway.md)
- [Key flow diagram](../diagrams/key-flow.yaml)
