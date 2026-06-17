# API Facade Component

## Responsibility

The API facade is the stable boundary that exposes CodeWiki operations to adapters, scripts, UI surfaces, skills, CLI/MCP wrappers, and future harness integrations. It converts external requests into typed CodeWiki capabilities and keeps callers away from direct `.codewiki/` file mutation.

## Owned paths

- `src/api/**` re-exports stable use-case entrypoints.
- `src/decision/**`, `src/planning/**`, `src/implementation/**`, `src/traces/**`, `src/views/**`, `src/runtime/**`, `src/knowledge/**`, `src/git/**`, and `src/project/**` own behavior behind the facade.

There is no target API facade over old stored-state, roadmap, session, artifact-output, split-evaluation, or cleanup roots.

## Contracts

- Public agent tools use the `wiki_<name>` convention.
- Results should be compact envelopes with exit status, changed refs, artifact refs, next actions, and blocking questions.
- Large machine payloads belong in source refs or trace data, not chat output.
- Generated views are rebuilt from truth sources and are never hand-edited.

## Flow links

- [Decision to planning](../flows/decision-to-planning.md)
- [Planning to implementation](../flows/planning-to-implementation.md)

## Related docs

- [System overview](../overview.md)
- [Loop Model](../loop-model.md)
- [API Tool Surface](../api-tools.md)
- [File structure](../file-structure.md)
