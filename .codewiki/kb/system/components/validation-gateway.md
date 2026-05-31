---
id: spec.system.components.validation-gateway
title: Validation Gateway Component
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
updated: "2026-06-01"
summary: Independent gateway that attests cycle builds, closure readiness, and proof evidence.
---

# Validation Gateway Component

## Responsibility

The validation gateway reviews named evidence and records `pass`, `fail`, or `block`. It does not define requirements, compile handoffs, mutate roadmap or knowledge truth, or prove content by itself. Policy modules define gate requirements, audit profiles, risk tiers, approval requirements, and proof requirements.

## Owned paths

- `src/gateway/**` owns report, preflight, transaction, and tool behavior.
- `src/policy/**` owns gate policy.
- `src/validation/**` is compatibility-oriented gateway glue.
- `.codewiki/validation/**` stores hot validation reports.

## Contracts

- Graph context helps routing; canonical sources and content proof remain authoritative.
- Fail/block reports must classify the failure and recommend the smallest safe next loop.
- Implementation validation may use a dirty working-tree digest; task-close, ship-ready, publish, and release require clean immutable proof.

## Flow links

- [Implementation, validation, and close](../flows/implementation-validation-close.md)
- [Publication and GC](../flows/publication-gc.md)
