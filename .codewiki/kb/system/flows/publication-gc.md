---
id: spec.system.flows.publication-gc
title: Publication and GC Flow
state: active
owners:
  - architecture
flow_id: publication_gc
participants:
  - implementation_build
  - validation_gateway
  - publisher
  - git
  - gc
component_ids:
  - builds_proof
  - validation_gateway
  - roadmap
  - api_facade
diagram_refs:
  - component-map:publication
  - file-structure-map:publication_proof
source_refs:
  - .codewiki/kb/system/validation-gateway.md
  - .codewiki/kb/system/roadmap.md
  - .codewiki/kb/system/api.md
code_paths:
  - src/gc
  - src/gateway
code_paths_mode: explicit_override
updated: "2026-06-01"
summary: Exact content proof gates publication and safe cleanup of hot CodeWiki artifacts.
---

# Publication and GC Flow

1. Implementation evidence and validation reports identify the exact content to promote.
2. Ship-ready, publish, or release gates require clean immutable proof such as commit SHA, tree SHA, package digest, archive ref, or remote ref.
3. Publication/push outputs must include safe-to-push or equivalent policy evidence when required.
4. After a close, sprint-close, publication, or roadmap-end commit exists, GC may run a dry-run.
5. Tracked artifact purge requires archive commit/tree proof and writes a restore ledger before deletion.

GC is hygiene only. A restore ledger does not replace validation, task-close, publication, or content-proof evidence.

## Related docs

- [Compilers](../compilers.md)
- [Runtime](../runtime.md)
- [Validation Gateway](../validation-gateway.md)
- [Key flow diagram](../diagrams/key-flow.yaml)
