# codebase-wiki

Repo-local, docs-first wiki tooling for [Pi](https://github.com/mariozechner/pi-coding-agent).

Inspired by Karpathy's [LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) and adapted for development-project documentation instead of general personal knowledge bases.

This package now ships:

- **one Pi extension**: `codebase-wiki`
- **one Pi skill**: `codebase-wiki`

That is the right shape for this package:

- the **extension** provides commands, tools, and runtime behavior
- the **skill** teaches the agent when and how to use the package

## What you get

### Commands

Public command surface is intentionally small:

- `/wiki-bootstrap [project name] [--force]`
- `/wiki-status [docs|code|both]`
- `/wiki-fix [docs|code|both]`
- `/wiki-review [idea|architecture]`

### Internal agent tools

- `codebase_wiki_setup`
- `codebase_wiki_bootstrap`
- `codebase_wiki_rebuild`
- `codebase_wiki_status`
- `codebase_wiki_roadmap_append`
- `codebase_wiki_task_session_link`

### Skill

- `/skill:codebase-wiki`

The skill tells Pi when to use the package for:

- intelligent bootstrap/onboarding of a repo-local wiki
- wiki health/status review across docs, code, or both
- drift correction across docs, code, or both
- senior review from idea or architecture perspectives
- internal roadmap/task/session operations behind the simplified UX

## Simplified model

Codebase Wiki now centers on only three canonical artifact classes:

- **research** — compact evidence capture in docs/research JSONL collections
- **specs** — intended system truth in docs/specs markdown hierarchy
- **roadmap** — top-level container for tracked delta work in `docs/roadmap.json`
- **task** — atomic work unit inside roadmap, canonically named `TASK-###`

Generated navigation stays separate:

- `docs/index.md`
- `docs/roadmap.md`
- `.docs/registry.json`
- `.docs/backlinks.json`
- `.docs/lint.json`
- `.docs/task-session-index.json`
- `.docs/roadmap-state.json`

Pi session linkage stays local and operational:

- Pi session JSONL remains Pi-owned
- codebase-wiki appends custom session entries linking tasks to sessions
- `.docs/task-session-index.json` is derived metadata for navigation and resume flow
- `.docs/roadmap-state.json` is the denormalized read model used by the built-in roadmap widget and any future third-party UI readers

Task identity and compatibility:

- canonical task ids use `TASK-###`
- new appended tasks always use `TASK-###`
- runtime still accepts legacy `ROADMAP-###` lookups for task browsing, linking, and session-derived roadmap views during migration

Working rule:

- research = evidence
- specs = desired state
- roadmap = container for trackable delta from desired state to current reality
- task = atomic work unit inside roadmap
- Pi session = native execution history linked to tasks

## Install

This package is designed to work well as a **global Pi package**.

Why:

- Pi packages can be installed globally via `~/.pi/agent/settings.json`
- Pi project settings are cwd-scoped, so repo binding should live in repo-local wiki config, not package install location
- runtime operations can discover the nearest ancestor containing `.docs/config.json`
- one global install can operate across many repos

### Recommended: global install

From git:

```bash
pi install git:github.com/NunoMoura/codebase-wiki
```

From npm:

```bash
pi install npm:codebase-wiki
```

From a local checkout:

```bash
pi install /absolute/path/to/codebase-wiki
```

### Optional: project-local install

If you want the package source pinned in one repo's `.pi/settings.json`, you can still use `-l`:

```bash
pi install -l /absolute/path/to/codebase-wiki
```

After install, run `/reload` if the session was already open.

## Runtime prerequisites

The starter rebuild flow shells out to Python and the generated `scripts/rebuild_docs_meta.py` imports `yaml`.

Minimum runtime requirements for bootstrap/rebuild:

- Python 3 available as `python3` or `python`
- PyYAML installed for that interpreter

Example:

```bash
python3 -m pip install pyyaml
```

## Quick start

### New repo

1. Install the package once with `pi install <package-source>`.
2. Open Pi in the repo root, or in a subdirectory if you want bootstrap to target the enclosing git repo.
3. Run:

```text
/wiki-bootstrap My Project
```

4. Let the intelligent onboarding follow-up inspect repo shape, infer greenfield vs brownfield signals, and ask only a few high-value questions when needed.
5. Refine the starter docs until they match real ownership seams.
6. Use:

```text
/wiki-status both
/wiki-fix docs
/wiki-review architecture
```

### Existing repo

If the repo already has a compatible wiki contract, open Pi anywhere inside that wiki tree and use the operational commands.

If the repo needs the contract created first, run:

```text
/wiki-bootstrap
```

from the repo root, or from a subdirectory if you want bootstrap to target the enclosing git repo.

Minimum expected contract:

```json
{
  "docs_root": "docs",
  "specs_root": "docs/specs",
  "research_root": "docs/research",
  "index_path": "docs/index.md",
  "roadmap_path": "docs/roadmap.json",
  "roadmap_doc_path": "docs/roadmap.md",
  "roadmap_events_path": ".docs/roadmap-events.jsonl",
  "meta_root": ".docs",
  "codebase_wiki": {
    "rebuild_command": ["python", "scripts/rebuild_docs_meta.py"]
  }
}
```

The rebuild command should update at least:

- `docs/index.md`
- `docs/roadmap.md`
- `.docs/registry.json`
- `.docs/lint.json`
- `.docs/task-session-index.json` (empty or populated)
- `.docs/roadmap-state.json`

## Recommended dogfooding workflow

When maintaining `codebase-wiki` itself, use the package on its own repo.

Recommended loop:

1. Edit live docs or runtime code.
2. Run:

```text
/wiki-status both
```

3. If status comes back yellow or red, run:

```text
/wiki-fix both
```

4. When you want a higher-level assessment, run:

```text
/wiki-review architecture
/wiki-review idea
```

5. Let the agent use internal roadmap/task tools when work maps to existing tasks or when unresolved delta should become a new task.

Working rule for this repo:

- edit canonical sources (`README.md`, spec docs under `docs/specs/`, `docs/roadmap.json`, runtime code)
- rebuild generated outputs after changes
- do not hand-edit generated outputs under `docs/index.md`, `docs/roadmap.md`, or `.docs/*.json`

## Why one extension and one skill

### One extension

There is no real user value in splitting bootstrap and runtime operations into separate extensions.

One extension is simpler because:

- one package surface
- one reload target
- one place for commands and tools
- fewer moving parts for users
- easier community adoption

Internally, the code can still be modular. In this repo, bootstrap logic is implemented as helper modules behind one extension entrypoint.

### One skill

A skill is better than telling users to patch `AGENTS.md` for package behavior.

Why:

- skills are the native Pi mechanism for reusable, on-demand task instructions
- the package can ship the skill with the extension
- the skill is portable across repos
- the skill describes when to use the package, not just what files exist
- `AGENTS.md` is better for repo-specific local policy layered on top

Use `AGENTS.md` for project conventions. Use the packaged skill for package behavior.

## How it works

### Bootstrap and onboarding

`/wiki-bootstrap` is the single public onboarding entrypoint. It safely adopts or scaffolds the repo-local wiki contract, reuses an existing ancestor wiki root when one is already present, and supports `--force` only when the user explicitly wants starter files overwritten.

Internally, agent tools may still use `codebase_wiki_setup` as a safe non-overwriting adopt step and `codebase_wiki_bootstrap` for explicit starter scaffolding.

Starter bootstrap includes:

- `.docs/config.json`
- `.docs/events.jsonl`
- `.docs/sources/`
- `scripts/rebuild_docs_meta.py`
- `docs/specs/product.md`
- `docs/specs/system/overview.md`
- `docs/specs/shared/overview.md`
- inferred first-pass boundary `overview.md` files under `docs/specs/` when brownfield structure is detected
- `docs/research/inspiration.jsonl`
- `docs/roadmap.json`
- generated outputs like `docs/index.md`, `docs/roadmap.md`, `.docs/registry.json`, `.docs/backlinks.json`, `.docs/lint.json`, `.docs/task-session-index.json`, `.docs/roadmap-state.json`

### Status, fix, and review

`/wiki-status` is the main health command. It rebuilds metadata, reports deterministic preflight state, lists specs with mapped code paths and drift signals, includes a compact roadmap working set, and queues a semantic review for `docs`, `code`, or `both`.

`/wiki-fix` is the corrective command. It uses repo evidence first, asks only high-value clarifying questions when needed, then fixes drift in `docs`, `code`, or `both`.

`/wiki-review` is the senior analysis command. Use `idea` for business value and product coherence review, or `architecture` for technical execution and design review.

### Roadmap TUI

The extension also renders a compact roadmap widget above the editor. It reads `.docs/roadmap-state.json`, shows health and counts, prefers the current session's focused task when known, then shows in-progress and next todo work instead of dumping the entire roadmap by default.

### Runtime operations

Per Pi's settings model, project settings are loaded from `<cwd>/.pi/settings.json`, while packages can also be installed globally. codebase-wiki therefore binds runtime to repo-local wiki config, not to Pi install location.

Runtime rule:

- resolve the nearest ancestor containing `.docs/config.json` from current cwd
- if no wiki exists yet, `/wiki-bootstrap` targets the enclosing git repo root when present, else the current working directory

It then uses that repo config to:

- find docs, specs, research, index, and roadmap paths
- run the configured rebuild command
- read `.docs/registry.json`, `.docs/lint.json`, `.docs/events.jsonl`
- build semantic audit scopes from `.docs/config.json`
- append structured roadmap tasks to `docs/roadmap.json` when audits uncover real unresolved delta
- append Pi custom session entries that link current session to roadmap tasks
- maintain `.docs/task-session-index.json` so generated roadmap view can show session continuity
- maintain `.docs/roadmap-state.json` so the first-party roadmap widget and any future third-party UI can read compact roadmap/task/session state without mutating canonical files

That means one global package install can operate across many repos, while each repo keeps its own `docs/`, `.docs/`, and rebuild contract.

## Philosophy

This package assumes:

- specs are source of truth for intended design
- research is compact evidence, not longform archive by default
- roadmap is freshest delta tracker between specs and code
- Pi sessions are execution history, not canonical roadmap truth
- code is implementation evidence
- there is one generated live index
- machine metadata stays hidden under `.docs/`
- plans and drift are better modeled as roadmap tasks than as separate top-level doc buckets

## Repo layout

```text
extensions/
  codebase-wiki/
    bootstrap.ts
    index.ts
    project-root.ts
    templates.ts
skills/
  codebase-wiki/
    SKILL.md
LICENSE
README.md
package.json
```

## Development

Install this repo globally while developing:

```bash
pi install /absolute/path/to/codebase-wiki
```

Or install it project-locally if you want this repo alone to pin the package source:

```bash
pi install -l /absolute/path/to/codebase-wiki
```

Smoke-test the package locally:

```bash
npm test
```

That runs:

- a package manifest check
- a `DefaultResourceLoader` package-load smoke test
- a starter wiki bootstrap + rebuild smoke test
- an `npm pack --dry-run` tarball validation

If `pi-coding-agent` is not installed in a standard local/global location, set:

```bash
PI_CODING_AGENT_ROOT=/absolute/path/to/@mariozechner/pi-coding-agent npm test
```

## License

MIT
