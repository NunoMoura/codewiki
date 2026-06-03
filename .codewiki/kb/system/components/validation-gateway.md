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
  - src/validation/**
owners:
  - architecture
updated: "2026-06-03"
summary: Independent gateway that evaluates loop exit gates and emits verdicts, findings, and remediation.
---

# Gateway Component

## Responsibility

The gateway reviews named evidence and records `pass`, `fail`, or `block` for the decision, planning, and implementation gates. It does not define requirements, compile output, mutate work/KB truth, or prove content by itself. Gate criteria define requirements, linter profiles, risk tiers, approval requirements, and Git proof requirements.

## Owned paths

- `src/gateway/**` currently owns report, preflight, transaction, and tool behavior.
- `src/policy/**` currently owns gate policy compatibility behavior.
- `src/validation/**` is compatibility-oriented gateway glue.
- Target loop gates move toward `src/decision/gate.ts`, `src/planning/gate.ts`, and `src/implementation/gate.ts`, with only truly shared gateway primitives kept under `src/gateway/**`.
- Target state embeds gate verdicts/findings/remediation in `.codewiki/telemetry/<trace_id>/{decision,planning,implementation}.json`; `.codewiki/validation/**` is compatibility storage.

## Contracts

- Graph context helps routing; canonical sources and content proof remain authoritative.
- Fail/block verdicts must classify findings and recommend the smallest safe next loop.
- Gate diagnostics use findings/remediation items, not legacy wording.
- Implementation completion requires immutable Git proof when claiming production-ready code.

## Flow links

- [Implementation, validation, and close](../flows/implementation-validation-close.md)
- [Publication and GC](../flows/publication-gc.md)

## Related docs

- [System overview](../overview.md)
- [Gateway](../validation-gateway.md)
- [File structure](../file-structure.md)
- [Component map](../diagrams/component-map.yaml)
