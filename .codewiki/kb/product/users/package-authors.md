---
id: spec.product.users.package-authors
title: Extension and Workflow Authors
state: active
summary: Authors who extend CodeWiki through package resources, workflow policy, adapters,
  skills, or visual surfaces.
owners:
- product
updated: '2026-05-09'
code_paths:
- src/index.ts
- package.json
code_paths_mode: explicit_override
---

# Extension and Workflow Authors

Extension and workflow authors use CodeWiki's structure and capability contracts without adopting CodeWiki as a sandbox, telemetry runtime, or general execution framework.

They need stable semantics for:

- compact state reads,
- roadmap work mutation,
- session focus notes,
- compiler builds,
- validation reports,
- graph/index rebuilds,
- gated agency controls,
- publication support,
- packaged workflow skills,
- future visual or non-visual access surfaces.

## Success signals

- Authors can extend workflows without bypassing `.codewiki/` semantics.
- Skill packages compose with CodeWiki rather than replacing roadmap, build, validation, or graph truth.
- Technical access surfaces use typed capabilities for semantic writes.
- Visual surfaces read canonical and generated state rather than creating hidden UI-only truth.

## Related docs

- [CodeWiki API](../../system/api.md)
- [Compilers](../../system/compilers.md)
- [Extension](../../system/extension.md)
- [Adapters](../../system/adapters.md)
