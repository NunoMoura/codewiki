---
id: spec.system.extension
title: Pi Distribution Integration
state: active
summary: Packaged CodeWiki distribution, current Pi foundation surface, and terminal-first CodeWiki UX integration.
owners:
  - architecture
  - engineering
updated: "2026-06-03"
---

# Pi Distribution Integration

## Responsibility

The package distributes CodeWiki for the current Pi host runtime. It registers Pi commands, tools, compact visual status UI, terminal-first CodeWiki UX integration, lifecycle hooks, the three workflow skills, resource discovery, and the CodeWiki system-prompt contract, then delegates semantic work to loop/API tools.

The extension is the current product boundary for a Pi-based CodeWiki distribution. CodeWiki is the repo-local contract, compiler workflow, state engine, API, Pi-hosted terminal product, and workflow policy. Pi is the foundation harness; CodeWiki should configure Pi with CodeWiki defaults rather than fork Pi internals by default.

## Current Pi surface

The Pi integration owns:

- `/wiki-*` commands,
- `wiki_<name>` tools,
- terminal-first `/wiki-*` command surfaces and Pi-hosted status/config views; `/wiki-ui` is a deprecated shim that points to active commands,
- `wiki_agency` and runtime workflow entrypoints as current Pi-facing agency/daemon controls until the three-loop telemetry model fully supersedes legacy direct agency execution,
- session lifecycle hooks,
- CodeWiki system-prompt injection for repos with `.codewiki/config.json`, carrying the always-on CodeWiki OS contract,
- packaged workflow skills only for the three loops: decision, planning, and implementation,
- bootstrap/adoption entrypoints that call API/concept tools,
- package smoke and resource loading coverage.

## Package support files

- `src/index.ts` should remain a thin entrypoint.
- `src/project/**` owns project loading, root resolution, starter templates, and setup/bootstrap use cases.
- `src/api/**` exposes stable package/tool facades over target loop, graph, telemetry, runtime, and Pi integration entrypoints. Compatibility paths such as `src/state/tool.ts`, `src/state/resume-tool.ts`, `src/roadmap/tool.ts`, and `src/session/**` remain temporary migration surfaces.
- bootstrap workflow guidance and starter contract assets should live in package docs or prompt-template assets rather than a generic router skill.
- prompt templates should live in package prompt assets rather than under a generic router skill.
- `src/shared/**` holds primitive ports, pure helpers, and session-independent lock helpers; it must not become a dumping ground for concept behavior.
- `scripts/**`, when present, is optional developer convenience only and must not be required for product behavior or gateway policy.

## Boundaries

- Pi SDK and TUI imports belong only in Pi integration.
- Deprecated browser UI and local web-server code must not re-enter the active package without a new accepted decision and validation plan.
- Pi-specific behavior must translate into API/loop use cases, not own CodeWiki semantics.
- VCC recall, generic native compaction, and session-reset hooks are adapter recovery points, not normal CodeWiki memory. Pi may use CodeWiki-owned compaction as the normal same-session soft refresh path because the injected summary is regenerated from `wiki_resume_context`, implementation builds, roadmap state, validation, and graph state.
- Agency behavior must enforce gated agency budgets and stop conditions instead of running unbounded work.
- The Pi extension should not become a fork of Pi Code or a general sandbox, hosted service, unbounded long-running runtime, or replacement for harness execution.
- Optional direct CLI support may cover bootstrap, CI, audit, or admin workflows, but interactive CodeWiki use should remain Pi-hosted unless a future decision changes the product boundary.
- Runtime checks must validate actual package loading under supported Node versions.
- Pi package imports use current `@earendil-works/*` names; deprecated `@mariozechner/*` imports must not reappear.

## Invariants

- Keep the public extension entrypoint small and stable.
- Keep Pi/harness-specific code inside Pi integration or future adapter roots.
- Keep generated graph state read-only outside rebuild paths.
- Keep package smoke, typecheck, source-owned architecture/audit checks, and pack dry-run green after structural moves.
- Test runtime ESM/package loading, not only TypeScript typechecking.

## Related docs

- [Terminal UI and Agent Visual Language](terminal-ui.md)
- [Adapters](adapters.md)
- [API](api.md)
- [File Structure](file-structure.md)
