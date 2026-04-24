---
id: spec.package.overview
title: Package Surface
state: active
summary: codewiki ships one extension and one skill as a globally installable Pi package surface with a small public workflow centered on bootstrap, status, resume, and separate configuration.
owners:
- architecture
updated: '2026-04-21'
code:
- package.json
- README.md
- extensions/codewiki/index.ts
- skills/codewiki/SKILL.md
---

# Package Surface

## Public shape

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

The package should:

- resolve the nearest ancestor containing `.wiki/config.json` from current cwd
- let public commands accept an explicit repo path when cwd does not resolve a repo-local wiki
- allow repo switching inside the status panel when multiple known repos exist
- let `/wiki-status` offer bootstrap or adopt guidance when no wiki exists yet
- keep `/wiki-bootstrap` as the explicit setup command
- treat footer visibility preferences, repo pinning, and external channel secrets as user-owned runtime state rather than repo-owned wiki truth
- target the enclosing git repo root for bootstrap when no wiki exists yet, else the current working directory

## Brownfield bootstrap goal

Brownfield repos should gain a usable wiki contract with minimal manual setup while still letting humans refine inferred ownership boundaries after bootstrap.

## Public UX shape

Public UX should converge on:

- `/wiki-bootstrap`
- `/wiki-status`
- `/wiki-resume`
- `/wiki-config`
- `Alt+W` as the interactive shortcut for `/wiki-status`

The package should also follow these rules:

- `/wiki-status` and `Alt+W` open the same live status panel
- `/wiki-config` remains the separate home for footer visibility, repo pinning, density, and later runtime settings
- deeper composability lives in a small internal tool contract (`codewiki_state`, `codewiki_task`, `codewiki_session`) plus prompts and panel actions rather than exposing many user-facing wiki mutation commands
- internal `codewiki_*` tools may accept an explicit `repoPath` so global installs can still target the intended repo safely when cwd is elsewhere
- public workflow should converge on `/wiki-bootstrap`, `/wiki-status`, `/wiki-resume`, and `/wiki-config` without keeping deprecated command affordances visible
- `/wiki-pause` is not part of the committed public surface yet and should only become public if autonomous execution needs an explicit stop affordance

## Model naming

- `wiki` stays the authored intent tree under `.wiki/knowledge/product`, `.wiki/knowledge/clients`, and `.wiki/knowledge/system`
- `roadmap` stays the top-level container for accepted delta and tracked work
- `task` is the atomic work unit and canonically uses `TASK-###`
- `status panel` is organized into `Wiki`, `Roadmap`, `Agents`, and `Channels`, with `Wiki` grouped as Product, System, and Clients
- `agent` means an execution actor or session with task ownership, mode, and current status
- `channel` means a communication route; channel secrets and personal delivery settings stay outside repo-owned truth
- Pi sessions stay native JSONL execution history linked to tasks through custom entries and live runtime reads

## Compatibility goal

The package should preserve migration headroom while moving toward the simpler model. Compatibility aliases are acceptable when they reduce breakage, but they should narrow toward the canonical bootstrap, status, resume, and config workflow instead of becoming permanent parallel entrypoints.

## Related docs

- [Product](../../product/overview.md)
- [System Overview](../overview.md)
- [Extension Runtime](../extension/overview.md)
- [Status Panel](../../clients/surfaces/status-panel.md)
- [Roadmap Surface](../../clients/surfaces/roadmap.md)
- [Roadmap](../../../../wiki/roadmap.md)
