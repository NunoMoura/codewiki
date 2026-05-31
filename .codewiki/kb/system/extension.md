---
id: spec.system.extension
title: Extension
state: active
summary: Packaged CodeWiki distribution, current Pi extension surface, and terminal-first CodeWiki UX integration.
owners:
  - architecture
  - engineering
updated: "2026-06-01"
---

# Extension

## Responsibility

The extension package distributes CodeWiki for the current Pi host runtime. It registers Pi commands, tools, compact visual status UI, terminal-first CodeWiki UX integration, lifecycle hooks, packaged skills, resource discovery, and a small CodeWiki system-prompt contract, then delegates semantic work to application tools.

The extension is the current product boundary for a Pi-based CodeWiki distribution. CodeWiki is the repo-local contract, compiler workflow, state engine, API, Pi-hosted terminal product, and workflow policy. Pi is the foundation harness; CodeWiki should configure Pi with CodeWiki defaults rather than fork Pi internals by default.

## Current Pi surface

The Pi adapter owns:

- `/wiki-*` commands,
- `wiki_<name>` tools,
- `Alt+W` compact visual status UI,
- terminal-first `/wiki-*` command surfaces and Pi TUI panels; `/wiki-ui` is deprecated and should be removed or changed to a deprecation message during web UI cleanup,
- `wiki_agency` as the current Pi-facing agency controller entrypoint until the vNext runtime workflow supersedes direct agency execution,
- session lifecycle hooks,
- CodeWiki system-prompt injection for repos with `.codewiki/config.json`,
- packaged workflow skills,
- bootstrap/adoption entrypoints that call API/concept tools,
- package smoke and resource loading coverage.

## Package support files

- `src/index.ts` should remain a thin entrypoint.
- `src/project/**` owns project loading, root resolution, starter templates, and setup/bootstrap use cases.
- `src/api/**` exposes stable package/tool use-case facades over concept tool entrypoints such as `src/state/tool.ts`, `src/state/resume-tool.ts`, `src/roadmap/tool.ts`, and `src/session/**`.
- `skills/codewiki/bootstrap/**` owns bootstrap workflow guidance and starter contract assets.
- `skills/codewiki/prompts/**` owns prompt templates as skill assets.
- `src/shared/**` holds primitive ports, pure helpers, and session-independent lock helpers; it must not become a dumping ground for concept behavior.
- `scripts/**`, when present, is optional developer convenience only and must not be required for product behavior or gateway policy.

## Boundaries

- Pi SDK and TUI imports belong only in the Pi adapter.
- Browser UI and local web-server code must not depend on Pi SDK or Pi TUI packages.
- Pi-specific behavior must translate into API use cases, not own domain semantics.
- VCC recall, generic native compaction, and session-reset hooks are adapter recovery points, not normal CodeWiki memory. Pi may use CodeWiki-owned compaction as the normal same-session soft refresh path because the injected summary is regenerated from `wiki_resume_context`, implementation builds, roadmap state, validation, and graph state.
- Agency behavior must enforce gated agency budgets and stop conditions instead of running unbounded work.
- The Pi extension should not become a fork of Pi Code or a general sandbox, hosted service, unbounded long-running runtime, or replacement for harness execution.
- Optional direct CLI support may cover bootstrap, CI, audit, or admin workflows, but interactive CodeWiki use should remain Pi-hosted unless a future decision changes the product boundary.
- Runtime checks must validate actual package loading under supported Node versions.
- Pi package imports use current `@earendil-works/*` names; deprecated `@mariozechner/*` imports must not reappear.

## Invariants

- Keep the public extension entrypoint small and stable.
- Keep harness-specific code inside adapters.
- Keep generated graph state read-only outside rebuild paths.
- Keep package smoke, typecheck, source-owned architecture/audit checks, and pack dry-run green after structural moves.
- Test runtime ESM/package loading, not only TypeScript typechecking.

## Related docs

- [Terminal UI and Agent Visual Language](terminal-ui.md)
- [Deprecated Browser UI](control-room-ui.md)
- [Adapters](adapters.md)
- [API](api.md)
- [File Structure](file-structure.md)
