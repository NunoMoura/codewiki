# codebase-wiki

Repo-local, docs-first wiki tooling for [Pi](https://github.com/mariozechner/pi-coding-agent).

This package now ships:

- **one Pi extension**: `codebase-wiki`
- **one Pi skill**: `codebase-wiki`

That is the right shape for this package:

- the **extension** provides commands, tools, and runtime behavior
- the **skill** teaches the agent when and how to use the package

## What you get

### Commands

- `/wiki-bootstrap [project name] [--force]`
- `/wiki-rebuild`
- `/wiki-lint`
- `/wiki-lint show`
- `/wiki-status`
- `/wiki-self-drift`
- `/wiki-code-drift`

### Tools

- `codebase_wiki_bootstrap`
- `codebase_wiki_rebuild`
- `codebase_wiki_status`

### Skill

- `/skill:codebase-wiki`

The skill tells Pi when to use the package for:

- bootstrapping a repo-local wiki
- rebuilding generated docs metadata
- deterministic docs linting
- docs-vs-docs drift review
- docs-vs-code drift review

## Install

### From git

```bash
pi install git:github.com/NunoMoura/codebase-wiki
```

Project-local install:

```bash
pi install -l git:github.com/NunoMoura/codebase-wiki
```

### From a local checkout

```bash
pi install /absolute/path/to/codebase-wiki
```

Or try it for one run:

```bash
pi -e /absolute/path/to/codebase-wiki
```

After install, run `/reload` if the session was already open.

## Quick start

### New repo

1. Install the package.
2. Open Pi in the target repo.
3. Run:

```text
/wiki-bootstrap My Project
```

Or ask the agent to do it if tool use is appropriate.

4. Replace the starter docs with real project content.
5. Use:

```text
/wiki-rebuild
/wiki-lint
/wiki-self-drift
/wiki-code-drift
```

### Existing repo

If the repo already has a compatible wiki contract, skip bootstrapping and use the operational commands.

Minimum expected contract:

```json
{
  "docs_root": "docs",
  "schema_path": "docs/schema.md",
  "index_path": "docs/index.md",
  "meta_root": ".docs",
  "codebase_wiki": {
    "rebuild_command": ["python", "scripts/rebuild_docs_meta.py"]
  }
}
```

The rebuild command should update at least:

- `docs/index.md`
- `.docs/registry.json`
- `.docs/lint.json`

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

### Bootstrap

`/wiki-bootstrap` or `codebase_wiki_bootstrap` scaffolds a starter wiki into the current repo, including:

- `.docs/config.json`
- `.docs/events.jsonl`
- `.docs/sources/`
- `scripts/rebuild_docs_meta.py`
- `docs/schema.md`
- `docs/specs/product/prd.md`
- `docs/specs/architecture/system-overview.md`
- `docs/decisions/ADR-001-documentation-wiki-model.md`
- `docs/plans/roadmap.md`
- `docs/archive/README.md`
- generated outputs like `docs/index.md`, `.docs/registry.json`, `.docs/backlinks.json`, `.docs/lint.json`

### Runtime operations

The extension walks upward from the current working directory looking for `.docs/config.json`.

It then uses the repo config to:

- find docs root and schema/index paths
- run the configured rebuild command
- read `.docs/registry.json`, `.docs/lint.json`, `.docs/events.jsonl`
- build semantic audit scopes from `.docs/config.json`

## Philosophy

This package assumes:

- docs are source of truth for intended design
- code is implementation evidence
- there is one generated live index
- machine metadata stays hidden under `.docs/`
- archive docs exist but do not drive live design
- drift should be visible instead of implicit

## Repo layout

```text
extensions/
  codebase-wiki/
    bootstrap.ts
    index.ts
    templates.ts
skills/
  codebase-wiki/
    SKILL.md
LICENSE
README.md
package.json
```

## Development

Load this repo directly in Pi while developing:

```bash
pi -e /absolute/path/to/codebase-wiki
```

Or install it from the local path:

```bash
pi install /absolute/path/to/codebase-wiki
```

## License

MIT
