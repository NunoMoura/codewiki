# codewiki

Repo-local, docs-first wiki tooling for [Pi](https://github.com/mariozechner/pi-coding-agent).

Inspired by Karpathy's [LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) and adapted for development-project documentation instead of general personal knowledge bases.

This package now ships:

- **one Pi extension**: `codewiki`
- **one Pi skill**: `codewiki`

That is the right shape for this package:

- the **extension** provides commands, tools, and runtime behavior
- the **skill** teaches the agent when and how to use the package

## What you get

### Commands

Public command surface is intentionally small:

- `/wiki-bootstrap [project name] [--force]`
- `/wiki-status [docs|code|both] [repo-path]`
- `/wiki-fix [docs|code|both] [repo-path]`
- `/wiki-review [idea|architecture] [repo-path]`
- `/wiki-code [TASK-###] [repo-path]`

### Internal agent tools

- `codewiki_setup`
- `codewiki_bootstrap`
- `codewiki_rebuild`
- `codewiki_status`
- `codewiki_roadmap_append`
- `codewiki_roadmap_update`
- `codewiki_task_session_link`

All internal `codewiki_*` tools also accept optional `repoPath` so agents can target a repo explicitly when Pi is running outside that repo.

### Skill

- `/skill:codewiki`

The skill tells Pi when to use the package for:

- intelligent bootstrap/onboarding of a repo-local wiki
- wiki health/status review across docs, code, or both
- drift correction across docs, code, or both
- senior review from idea or architecture perspectives
- internal roadmap/task/session operations behind the simplified UX

## Simplified model

Codewiki now centers on only three canonical artifact classes:

- **research** — compact evidence capture in wiki/research JSONL collections
- **specs** — intended system truth in wiki/specs markdown hierarchy
- **roadmap** — top-level container for tracked delta work in `wiki/roadmap.json`
- **task** — atomic work unit inside roadmap, canonically named `TASK-###`

Generated navigation stays separate:

- `wiki/index.md`
- `wiki/roadmap.md`
- `.wiki/registry.json`
- `.wiki/backlinks.json`
- `.wiki/lint.json`
- `.wiki/roadmap-state.json`

Pi session linkage stays local and operational:

- Pi session JSONL remains Pi-owned
- codewiki appends custom session entries linking tasks to sessions
- current task focus is read live from Pi session state at runtime
- `.wiki/roadmap-state.json` is the denormalized roadmap/task read model used by the built-in roadmap widget and any future third-party UI readers

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
- runtime operations can discover the nearest ancestor containing `.wiki/config.json`
- when current cwd is outside a repo wiki, commands can accept an explicit repo path or offer a repo picker in UI mode
- one global install can operate across many repos

### Recommended: global install

From git:

```bash
pi install git:github.com/NunoMoura/codewiki
```

From npm:

```bash
pi install npm:codewiki
```

From a local checkout:

```bash
pi install /absolute/path/to/codewiki
```

### Optional: project-local install

If you want the package source pinned in one repo's `.pi/settings.json`, you can still use `-l`:

```bash
pi install -l /absolute/path/to/codewiki
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
/wiki-code
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
  "docs_root": "wiki",
  "specs_root": "wiki/specs",
  "research_root": "wiki/research",
  "index_path": "wiki/index.md",
  "roadmap_path": "wiki/roadmap.json",
  "roadmap_doc_path": "wiki/roadmap.md",
  "roadmap_events_path": ".wiki/roadmap-events.jsonl",
  "meta_root": ".wiki",
  "codewiki": {
    "rebuild_command": ["python", "scripts/rebuild_docs_meta.py"]
  }
}
```

The rebuild command should update at least:

- `wiki/index.md`
- `wiki/roadmap.md`
- `.wiki/registry.json`
- `.wiki/lint.json`
- `.wiki/roadmap-state.json`

## Recommended dogfooding workflow

When maintaining `codewiki` itself, use the package on its own repo.

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

- edit canonical sources (`README.md`, spec docs under `wiki/specs/`, `wiki/roadmap.json`, runtime code)
- rebuild generated outputs after changes
- do not hand-edit generated outputs under `wiki/index.md`, `wiki/roadmap.md`, or `.wiki/*.json`

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

Internally, agent tools may still use `codewiki_setup` as a safe non-overwriting adopt step and `codewiki_bootstrap` for explicit starter scaffolding.

Starter bootstrap includes:

- `.wiki/config.json`
- `.wiki/events.jsonl`
- `.wiki/sources/`
- `scripts/rebuild_docs_meta.py`
- `wiki/specs/product.md`
- `wiki/specs/system/overview.md`
- `wiki/specs/shared/overview.md`
- inferred first-pass boundary `overview.md` files under `wiki/specs/` when brownfield structure is detected
- `wiki/research/inspiration.jsonl`
- `wiki/roadmap.json`
- generated outputs like `wiki/index.md`, `wiki/roadmap.md`, `.wiki/registry.json`, `.wiki/backlinks.json`, `.wiki/lint.json`, `.wiki/roadmap-state.json`

### Status, fix, and review

`/wiki-status` is the main health command. It rebuilds metadata, reports deterministic preflight state, lists specs with mapped code paths and drift signals, includes a compact roadmap working set, and queues a semantic review for `docs`, `code`, or `both`.

`/wiki-fix` is the corrective command. It uses repo evidence first, asks only high-value clarifying questions when needed, then fixes drift in `docs`, `code`, or `both`.

`/wiki-review` is the senior analysis command. Use `idea` for business value and product coherence review, or `architecture` for technical execution and design review.

`/wiki-status`, `/wiki-fix`, `/wiki-review`, and `/wiki-code` all accept an optional repo path. If Pi is running outside a repo with `wiki/` and `.wiki/`, pass the target repo path explicitly. In UI mode, commands can also offer a repo picker when no repo-local wiki is found from current cwd.

`/wiki-code` is the implementation segue. With no argument it resumes the current focused roadmap task when one exists, otherwise it picks the next open task from the roadmap working set. Pass `TASK-###` to force a specific open task.

### Roadmap TUI

The extension also renders a compact roadmap widget above the editor. It reads `.wiki/roadmap-state.json`, shows health and counts, prefers the current session's focused task when known, then shows in-progress and next todo work instead of dumping the entire roadmap by default.

### Runtime operations

Per Pi's settings model, project settings are loaded from `<cwd>/.pi/settings.json`, while packages can also be installed globally. codewiki therefore binds runtime to repo-local wiki config, not to Pi install location.

Runtime rule:

- first resolve the nearest ancestor containing `.wiki/config.json` from current cwd
- if no repo-local wiki exists from current cwd, `/wiki-status`, `/wiki-fix`, `/wiki-review`, and `/wiki-code` may target an explicit repo path instead
- in UI mode, those commands may offer a picker across candidate repos discovered below current cwd
- if no wiki exists yet, `/wiki-bootstrap` targets the enclosing git repo root when present, else the current working directory

It then uses that repo config to:

- find docs, specs, research, index, and roadmap paths
- run the configured rebuild command
- read `.wiki/registry.json`, `.wiki/lint.json`, `.wiki/events.jsonl`
- build semantic audit scopes from `.wiki/config.json`
- append structured roadmap tasks to `wiki/roadmap.json` when audits uncover real unresolved delta
- update or close existing roadmap tasks through package-native mutation tools instead of manual JSON edits
- append Pi custom session entries that link current session to roadmap tasks
- read active task context from Pi session state at runtime
- maintain `.wiki/roadmap-state.json` so the first-party roadmap widget and any future third-party UI can read compact roadmap/task state without mutating canonical files

That means one global package install can operate across many repos, while each repo keeps its own `wiki/`, `.wiki/`, and rebuild contract.

## Philosophy

This package assumes:

- specs are source of truth for intended design
- research is compact evidence, not longform archive by default
- roadmap is freshest delta tracker between specs and code
- Pi sessions are execution history, not canonical roadmap truth
- history defaults to git for full diffs, `.wiki/events.jsonl` for compact lifecycle events, and `.wiki/roadmap-events.jsonl` for roadmap mutations; package does not generate a separate compact-history file by default
- code is implementation evidence
- there is one generated live index
- machine metadata stays hidden under `.wiki/`
- plans and drift are better modeled as roadmap tasks than as separate top-level doc buckets

## Repo layout

```text
extensions/
  codewiki/
    bootstrap.ts
    index.ts
    project-root.ts
    templates.ts
skills/
  codewiki/
    SKILL.md
LICENSE
README.md
package.json
```

## Development

Install this repo globally while developing:

```bash
pi install /absolute/path/to/codewiki
```

Or install it project-locally if you want this repo alone to pin the package source:

```bash
pi install -l /absolute/path/to/codewiki
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
