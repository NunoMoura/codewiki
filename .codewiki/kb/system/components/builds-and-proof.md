---
id: spec.system.components.builds-and-proof
title: Telemetry and Git Proof Component
state: active
component_id: builds_proof
diagram_refs:
  - component-map:builds
  - component-map:publication
  - file-structure-map:build_validation_gateway_wave
  - file-structure-map:publication_proof
source_roots:
  - src/traces/**
  - src/git/**
  - src/build/**
  - src/gc/**
owners:
  - architecture
updated: "2026-06-03"
summary: JSONL traces, compiler output, Git proof refs, and hot-artifact retention.
---

# Telemetry and Git Proof Component

## Responsibility

JSONL traces capture compact workflow evidence between loop compilers and gates. Git proof records exact content through commits, trees, package digests, tags, and remote refs. Retention removes eligible hot details only after trace summaries and Git proof preserve recovery paths.

## Owned paths

- Target `src/traces/**` owns trace read/write, normalization, and retention.
- Target `src/git/**` owns Git proof, worktree proof, publisher proof, and content ref helpers.
- Compatibility `src/build/**` owns historic artifact writing and schemas until migration.
- Compatibility `src/gc/**` owns current GC classification, ledgers, and purge behavior until retention moves into trace/Git proof.
- Target state uses `.codewiki/traces/**`; compatibility state may still use `.codewiki/builds/**` and `.codewiki/validation/**`.

## Contracts

- Compiler output is transient payload inside loop traces, not canonical long-term truth.
- Gate verdicts attest evidence; Git/package/remote refs prove content.
- Hot retention is post-commit/post-proof and must preserve trace discoverability.
- Full old reports should be found through traces and Git, not a separate flat archive pile.

## Flow links

- [Implementation, validation, and close](../flows/implementation-validation-close.md)
- [Publication and GC](../flows/publication-gc.md)

## Related docs

- [System overview](../overview.md)
- [File structure](../file-structure.md)
- [Compiler Output Artifacts](../builds.md)
- [Component map](../diagrams/component-map.yaml)
