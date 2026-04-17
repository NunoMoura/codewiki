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

- `/wiki-setup [project name]`
- `/wiki-bootstrap [project name] [--force]`
- `/wiki-rebuild`
- `/wiki-lint`
- `/wiki-lint show`
- `/wiki-status`
- `/wiki-roadmap [ROADMAP-###]`
- `/wiki-self-drift`
- `/wiki-code-drift`
- `/wiki-task <task-id> [focus|progress|blocked|done|spawn]`

### Tools

- `codebase_wiki_setup`
- `codebase_wiki_bootstrap`
- `codebase_wiki_rebuild`
- `codebase_wiki_status`
- `codebase_wiki_roadmap_append`
- `codebase_wiki_task_session_link`

### Skill

- `/skill:codebase-wiki`

The skill tells Pi when to use the package for:

- setting up or bootstrapping a repo-local wiki
- rebuilding generated docs metadata
- deterministic docs linting
- docs-vs-docs drift review
- docs-vs-code drift review
- browsing roadmap tasks in a terminal UI
- appending roadmap-ready tasks after drift audits
- linking current Pi session to roadmap tasks

## Simplified model

Codebase Wiki now centers on only three canonical artifact classes:

- **research** — compact evidence capture in docs/research JSONL collections
- **specs** — intended system truth in docs/specs markdown hierarchy
- **roadmap** — numbered delta tracker in `docs/roadmap.json`

Generated navigation stays separate:

- `docs/index.md`
- `docs/roadmap.md`
- `.docs/registry.json`
- `.docs/backlinks.json`
- `.docs/lint.json`
- `.docs/task-session-index.json`

Pi session linkage stays local and operational:

- Pi session JSONL remains Pi-owned
- codebase-wiki appends custom session entries linking tasks to sessions
- `.docs/task-session-index.json` is derived metadata for navigation and resume flow

Working rule:

- research = evidence
- specs = desired state
- roadmap = trackable delta from desired state to current reality

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
2. Open Pi in the repo root, or in a subdirectory if you want setup to target the enclosing git repo.
3. Run either:

```text
/wiki-setup My Project
```

for the safe default, or:

```text
/wiki-bootstrap My Project
```

if you want the explicit bootstrap command.

4. Replace the starter docs with real project content. On brownfield repos, setup/bootstrap may infer first-pass boundary specs from repo structure; refine or collapse them until they match real ownership seams.
5. Use:

```text
/wiki-rebuild
/wiki-lint
/wiki-status
/wiki-roadmap
/wiki-self-drift
/wiki-code-drift
```

### Existing repo

If the repo already has a compatible wiki contract, open Pi anywhere inside that wiki tree and use the operational commands.

If the repo needs the contract created first, run:

```text
/wiki-setup
```

from the repo root, or from a subdirectory if you want setup to target the enclosing git repo.

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

## Recommended dogfooding workflow

When maintaining `codebase-wiki` itself, use the package on its own repo.

Recommended loop:

1. Edit live docs or runtime code.
2. Run:

```text
/wiki-rebuild
/wiki-lint
/wiki-status
/wiki-roadmap
```

3. If work maps to an existing roadmap item, link the session:

```text
/wiki-task ROADMAP-005 focus
```

4. If you want the agent to review the docs contract before editing, run:

```text
/wiki-self-drift
/wiki-code-drift
```

5. If drift review finds real new delta, append a structured roadmap task with `codebase_wiki_roadmap_append` instead of hand-editing generated docs.

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

### Setup and bootstrap

`/wiki-setup` and `codebase_wiki_setup` are the safe default. They configure the current project for codebase-wiki without overwriting existing starter files, and reuse an existing ancestor wiki root when one is already present.

`/wiki-bootstrap` or `codebase_wiki_bootstrap` use the same starter contract, but support `--force` when the user explicitly wants starter files overwritten.

Starter setup includes:

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
- generated outputs like `docs/index.md`, `docs/roadmap.md`, `.docs/registry.json`, `.docs/backlinks.json`, `.docs/lint.json`, `.docs/task-session-index.json`

### Roadmap browser

`/wiki-roadmap` opens a terminal-friendly roadmap browser.

- without arguments, it shows the ordered roadmap task list in a searchable TUI selector
- with a task id like `/wiki-roadmap ROADMAP-008`, it opens that task's details directly
- from inside the browser, inspect a task and then use `/wiki-task <id> focus` when the current Pi session should link back to that roadmap item

### Runtime operations

Per Pi's settings model, project settings are loaded from `<cwd>/.pi/settings.json`, while packages can also be installed globally. codebase-wiki therefore binds runtime to repo-local wiki config, not to Pi install location.

Runtime rule:

- resolve the nearest ancestor containing `.docs/config.json` from current cwd
- if no wiki exists yet, `/wiki-setup` and `/wiki-bootstrap` target the enclosing git repo root when present, else the current working directory

It then uses that repo config to:

- find docs, specs, research, index, and roadmap paths
- run the configured rebuild command
- read `.docs/registry.json`, `.docs/lint.json`, `.docs/events.jsonl`
- build semantic audit scopes from `.docs/config.json`
- append structured roadmap tasks to `docs/roadmap.json` when audits uncover real unresolved delta
- append Pi custom session entries that link current session to roadmap tasks
- maintain `.docs/task-session-index.json` so generated roadmap view can show session continuity

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
- plans and drift are better modeled as roadmap items than as separate top-level doc buckets

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
