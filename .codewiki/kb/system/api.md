---
id: spec.system.api
title: API
state: active
summary: Stable source facade over target CodeWiki modules during the traces-first rebuild.
owners:
  - architecture
updated: "2026-06-11"
---

# API

`src/api/**` is the stable package/source facade. It should re-export public contracts from target roots without owning business behavior.

Target facade roots:

- `src/api/decision.ts`
- `src/api/planning.ts`
- `src/api/implementation.ts`
- `src/api/traces.ts`
- `src/api/views.ts`
- `src/api/index.ts`

The API layer must not recreate old graph, telemetry, agency, gateway, roadmap, state, or validation roots. Those concepts are either deprecated, folded into runtime, or represented by traces/views.

Pi extension entrypoints remain disabled until a future explicit decision reintroduces them.

## Related docs

- [File Structure](file-structure.md)
- [Traces](traces.md)
