---
id: spec.system.components.validation-gateway
title: Gateway Component
state: active
component_id: validation_gateway
diagram_refs:
  - component-map:validation_gateway
  - file-structure-map:build_validation_gateway_wave
source_roots:
  - src/gateway/**
  - src/policy/**
owners:
  - architecture
updated: "2026-06-07"
summary: Shared gateway compatibility component for loop-owned decision, planning, and implementation gate evidence.
---

# Gateway Component

## Responsibility

The gateway reviews named evidence and records `pass`, `fail`, or `block` for loop-owned decision, planning, and implementation gates. It does not define requirements, compile output, mutate work/KB truth, or prove content by itself. Gate criteria define requirements, linter profiles, risk tiers, approval requirements, and Git proof requirements. Tests, linters, audits, and Git refs are evidence providers, not criteria owners.

## Owned paths

- `src/gateway/**` currently owns report, preflight, transaction, and tool behavior.
- `src/policy/**` currently owns gate policy compatibility behavior.
- `src/validation/**`, `src/publish/**`, and `src/publication/**` are not allowed package-source roots.
- Target loop gates move toward `src/decision/gate.ts`, `src/planning/gate.ts`, and `src/implementation/gate.ts`, with only truly shared gateway primitives kept under `src/gateway/**`.
- Target state embeds gate verdicts/findings/remediation in `.codewiki/traces/TRACE-*.jsonl` under `decision.gate_history`, `planning.gate_history`, and `implementation.gate_history`; `.codewiki/validation/**` is compatibility storage.

## Contracts

- Graph context helps routing; canonical sources and content proof remain authoritative.
- Fail/block verdicts must classify findings and recommend the smallest safe next loop.
- Gate diagnostics use findings/remediation items, not legacy wording.
- Implementation completion requires immutable Git proof when claiming production-ready code.
- Publication, publish, release, task-close, and ship-ready compatibility profiles remain implementation-owned criteria; they do not create validation or publish loop roots.

## Flow links

- [Implementation, validation, and close](../flows/implementation-validation-close.md)
- [Publication and GC](../flows/publication-gc.md)

## Related docs

- [System overview](../overview.md)
- [Gateway](../validation-gateway.md)
- [File structure](../file-structure.md)
- [Component map](../diagrams/component-map.yaml)
