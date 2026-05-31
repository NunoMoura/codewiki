---
id: spec.system.flows.artifact-claim-wait-wake
title: Artifact Claim Wait/Wake Flow
state: active
owners:
  - architecture
flow_id: artifact_claim_wait_wake
participants:
  - builder
  - validator
  - publisher
  - session_queue
  - roadmap
component_ids:
  - session_queue
  - runtime
  - roadmap
  - builds_proof
diagram_refs:
  - file-structure-map:session_concept_root_boundary
  - component-map:runtime
source_refs:
  - .codewiki/kb/system/api.md
  - .codewiki/kb/system/worktree-isolation.md
code_paths:
  - src/session
code_paths_mode: explicit_override
updated: "2026-06-01"
summary: Temporary artifact claims coordinate parallel sessions and wake waiters without replacing truth.
---

# Artifact Claim Wait/Wake Flow

1. A session marks narrow scopes before non-trivial overlapping writes.
2. If a needed scope is unavailable, the session can wait instead of forcing a conflict.
3. Holders heartbeat or release claims. Expired claims become stale and can be cleared by policy.
4. A released blocker wakes waiters with the claim id, task/build refs, and scopes.
5. The woken agent must refresh CodeWiki state and re-check artifact status before writing.

Artifact status is runtime coordination evidence only. Roadmap tasks, builds, validation reports, code, and Git refs remain canonical truth and proof.

## Related docs

- [Compilers](../compilers.md)
- [Runtime](../runtime.md)
- [Validation Gateway](../validation-gateway.md)
- [Key flow diagram](../diagrams/key-flow.yaml)
