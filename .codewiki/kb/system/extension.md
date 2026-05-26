---
id: spec.system.extension
title: Extension
state: active
summary: Packaged CodeWiki distribution, current Pi extension surface, and CodeWiki UI launch integration.
owners:
  - architecture
  - engineering
updated: "2026-05-16"
code_paths:
  - src/index.ts
  - src/project/bootstrap.ts
  - src/project/templates.ts
  - src/adapters/pi/bootstrap.ts
  - src/application/prompt.ts
  - src/adapters/pi
  - skills/codewiki
  - tests/smoke/package-smoke.test.mjs
---

# Extension

## Responsibility

The extension package distributes CodeWiki for the current Pi host runtime. It registers Pi commands, tools, compact visual status UI, CodeWiki UI launch integration, lifecycle hooks, packaged skills, and resource discovery, then delegates semantic work to application tools.

The extension is not the product boundary. CodeWiki is the repo-local contract, compiler workflow, state engine, API, and standalone local CodeWiki UI. Pi is the current adapter and distribution channel.

## Current Pi surface

The Pi adapter owns:

- `/wiki-*` commands,
- `codewiki_*` tools,
- `Alt+W` compact visual status UI,
- `/wiki-ui [repo-path] [port]` to start the local CodeWiki UI, attempt to open its browser URL, and print a plain local URL fallback,
- `codewiki_agency` as the current Pi-facing agency controller entrypoint,
- session lifecycle hooks,
- packaged workflow skills,
- bootstrap/adoption entrypoints that call application tools,
- package smoke and resource loading coverage.

## Package support files

- `src/index.ts` should remain a thin entrypoint.
- `src/project/**` owns project loading, root resolution, starter templates, and setup/bootstrap use cases.
- `src/application/tools/**` owns agent-callable state, task, session queue, and publication use cases that have not yet moved to concept roots.
- `skills/codewiki/bootstrap/**` owns bootstrap workflow guidance and starter contract assets.
- `skills/codewiki/prompts/**` owns prompt templates as skill assets.
- `mutation-queue.ts` is a transitional support file until folded behind application ports/local runtime services.
- `scripts/**`, when present, is optional developer convenience only and must not be required for product behavior or gateway policy.

## Boundaries

- Pi SDK and TUI imports belong only in the Pi adapter.
- Browser UI and local web-server code must not depend on Pi SDK or Pi TUI packages.
- Pi-specific behavior must translate into API use cases, not own domain semantics.
- VCC recall, generic native compaction, and session-reset hooks are adapter recovery points, not normal CodeWiki memory. Pi may use CodeWiki-owned compaction as the normal same-session soft refresh path because the injected summary is regenerated from `codewiki_resume_context`, implementation builds, roadmap state, validation, and graph state.
- Agency behavior must enforce gated agency budgets and stop conditions instead of running unbounded work.
- The package should not become a general sandbox, hosted service, unbounded long-running runtime, or replacement for harness execution.
- Runtime checks must validate actual package loading under supported Node versions.
- Pi package imports use current `@earendil-works/*` names; deprecated `@mariozechner/*` imports must not reappear.

## Invariants

- Keep the public extension entrypoint small and stable.
- Keep harness-specific code inside adapters.
- Keep generated graph state read-only outside rebuild paths.
- Keep package smoke, typecheck, source-owned architecture/audit checks, and pack dry-run green after structural moves.
- Test runtime ESM/package loading, not only TypeScript typechecking.

## Related docs

- [CodeWiki UI](control-room-ui.md)
- [Adapters](adapters.md)
- [API](api.md)
- [File Structure](file-structure.md)
