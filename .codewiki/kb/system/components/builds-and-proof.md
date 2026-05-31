---
id: spec.system.components.builds-and-proof
title: Builds and Proof Component
state: active
component_id: builds_proof
diagram_refs:
  - component-map:builds
  - component-map:publication
  - file-structure-map:build_validation_gateway_wave
  - file-structure-map:publication_proof
source_roots:
  - src/build/**
  - src/gc/**
owners:
  - architecture
updated: "2026-06-01"
summary: Compiler build artifacts, publication evidence, and post-commit garbage-collection proof.
---

# Builds and Proof Component

## Responsibility

Builds capture compact handoff evidence between compiler loops. Proof records exact content through commits, trees, package digests, archives, remotes, or restore ledgers. Garbage collection removes eligible hot artifacts only after archive proof exists.

## Owned paths

- `src/build/**` owns build artifact writing and schemas.
- `src/gc/**` owns GC classification, ledgers, and purge behavior.
- `.codewiki/builds/**`, `.codewiki/validation/**`, and Git refs carry proof inputs.

## Contracts

- Builds are transient payloads, not canonical long-term truth.
- Validation reports attest evidence; Git/package/archive/remote refs prove content.
- Tracked CodeWiki GC is post-commit and must write restore evidence before purging.

## Flow links

- [Implementation, validation, and close](../flows/implementation-validation-close.md)
- [Publication and GC](../flows/publication-gc.md)

## Related docs

- [System overview](../overview.md)
- [File structure](../file-structure.md)
- [Component map](../diagrams/component-map.yaml)
