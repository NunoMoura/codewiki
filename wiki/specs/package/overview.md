---
id: spec.package.overview
title: Package Surface
state: active
summary: codewiki ships one extension and one skill as globally installable Pi package surface with repo-local wiki data.
owners:
- architecture
updated: '2026-04-17'
---

# Package Surface

## Public shape

Package should expose:

- one extension: `codewiki`
- one skill: `codewiki`
- no split install story across many tiny extensions
- global install should work cleanly
- project-local install remains optional when teams want pinned shared setup

## Why this shape

- users get one reload target
- runtime commands and tools stay together
- skill teaches agent when to use package contract
- package can be installed once globally while still operating on many repos

## Install boundary

Runtime should bind to repo-local `.wiki/config.json`, not `.pi/settings.json`.

Discovery rule:

- resolve the nearest ancestor containing `.wiki/config.json` from current cwd
- if no repo-local wiki is found from current cwd, public commands may accept an explicit repo path
- in UI mode, public commands may offer a repo picker across candidate repos found below current cwd
- if no wiki exists yet, `/wiki-bootstrap` targets enclosing git repo root when present, else current working directory

## Brownfield bootstrap goal

Bootstrap should be able to infer first-pass `wiki/specs/**` ownership docs from meaningful repo boundaries so existing repos start from something closer to real architecture than generic placeholders.

## Public UX shape

- public commands stay limited to `/wiki-bootstrap`, `/wiki-status`, `/wiki-fix`, `/wiki-review`, and `/wiki-code`
- deeper composability lives in internal tools and prompts, rather than exposing separate user-facing wiki mutation commands
- internal `codewiki_*` tools may accept an explicit `repoPath` so global installs can still target the intended repo safely when cwd is elsewhere

## Model naming

- roadmap stays the top-level container for delta/work
- task is the atomic work unit and canonically uses `TASK-###`
- Pi sessions stay native JSONL execution history linked to tasks through custom entries and live runtime reads

## Compatibility goal

A repo using this package should only need:

- `.wiki/config.json`
- `scripts/rebuild_docs_meta.py`
- `wiki/research/`
- `wiki/specs/`
- `wiki/roadmap.json`
- `.wiki/roadmap-state.json`

## Related docs

- [Product](../product.md)
- [System Overview](../system/overview.md)
- [Extension Runtime](../extension/overview.md)
- [Templates and Rebuild](../templates/overview.md)
- [Roadmap](../../roadmap.md)
