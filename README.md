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
- `Alt+W`
  - toggles live Codewiki status panel
- `/wiki-config`
  - opens interactive Codewiki configuration with option lists and toggles
  - optional args remain available for direct fallback updates: `[show|auto|pin|off|minimal|standard|full] [repo-path]`
- `/wiki-resume [TASK-###] [repo-path]`

### Internal agent tools

- `codewiki_setup`
- `codewiki_bootstrap`
- `codewiki_state`
- `codewiki_task`
- `codewiki_session`

All internal `codewiki_*` tools accept optional `repoPath` so agents can target a repo explicitly when Pi is running outside that repo. Day-to-day execution should center on one read entrypoint (`codewiki_state`), one canonical task mutation entrypoint (`codewiki_task`), and one runtime session entrypoint (`codewiki_session`).

### Skill

- `/skill:codewiki`

The skill tells Pi when to use the package for:

- intelligent bootstrap/onboarding of a repo-local wiki
- wiki bootstrap and configuration
- status inspection and roadmap resumption
- internal roadmap/task/session operations behind the simplified UX

## Simplified model

Codewiki now centers on a hidden `.wiki` knowledge system plus derived views:

- **knowledge** — canonical markdown knowledge nodes under `.wiki/knowledge/product/`, `.wiki/knowledge/clients/`, and `.wiki/knowledge/system/`
- **sources** — raw provenance under `.wiki/sources/`
- **evidence** — compact machine-managed validation findings in `.wiki/evidence/*.jsonl`
- **roadmap** — machine-managed tracked delta in `.wiki/roadmap.json`
- **events** — portable mutation history in `.wiki/events.jsonl`
- **task** — atomic work unit inside roadmap, canonically named `TASK-###`

Derived navigation and UI views stay hidden under `.wiki/`:

- `.wiki/graph.json` as the primary derived relationship graph and shared view substrate
- `.wiki/lint.json`
- `.wiki/roadmap-state.json`
- `.wiki/status-state.json`
- `.wiki/graph.json` is the shared derived relationship substrate; no separate registry/backlinks compatibility layer is required
- top-level generated `wiki/**` files are no longer emitted by default

Pi session linkage stays local and operational:

- Pi session JSONL remains Pi-owned
- codewiki appends custom session entries linking tasks to sessions
- current task focus is read live from Pi session state at runtime
- `.wiki/graph.json` is the derived relationship graph and shared view substrate compiled from knowledge, evidence, and roadmap truth
- `.wiki/roadmap-state.json` is the denormalized roadmap/task read model
- `.wiki/status-state.json` is the denormalized status read model used by the built-in summary/panel surfaces and any future third-party UI readers

Task identity and compatibility:

- canonical task ids use `TASK-###`
- new appended tasks always use `TASK-###`
- runtime still accepts legacy `ROADMAP-###` lookups for task browsing, linking, and session-derived roadmap views during migration

Working rule:

- `.wiki/knowledge/` = canonical desired state
- `.wiki/sources/` = raw provenance
- `.wiki/evidence/` = machine-managed validation evidence
- `.wiki/roadmap.json` = machine-managed tracked delta from desired state to current reality
- `.wiki/events.jsonl` = portable lifecycle log
- task = atomic work unit inside roadmap
- Pi session = native execution history linked to tasks

Goal quality rule:

- foundational docs should define clear goals, success signals, non-goals, and verification expectations
- roadmap tasks should capture the same shape in machine-managed metadata so implementation, review, and closure can follow explicit intent instead of guesswork

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
/wiki-config
/wiki-status
/wiki-resume
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
  "docs_root": ".wiki/knowledge",
  "specs_root": ".wiki/knowledge",
  "evidence_root": ".wiki/evidence",
  "roadmap_path": ".wiki/roadmap.json",
  "roadmap_events_path": ".wiki/roadmap-events.jsonl",
  "roadmap_retention": {
    "closed_task_limit": 50,
    "archive_path": ".wiki/roadmap-archive.jsonl",
    "compress_archive": false
  },
  "meta_root": ".wiki",
  "codewiki": {
    "rebuild_command": ["python", "scripts/rebuild_docs_meta.py"]
  }
}
```

The rebuild command should update at least:

- `.wiki/graph.json`
- `.wiki/lint.json`
- `.wiki/roadmap-state.json`
- `.wiki/status-state.json`

Repos may opt into generated markdown exports by setting `index_path` or `roadmap_doc_path`, but the default contract does not create top-level `wiki/**` files.

## Recommended dogfooding workflow

When maintaining `codewiki` itself, use the package on its own repo.

Recommended loop:

1. Edit live docs or runtime code.
2. Run:

```text
/wiki-config
/wiki-config pin /home/nunoc/projects/codewiki
```

3. If status comes back yellow or red, inspect it through:

```text
/wiki-status
```

4. When roadmap work is ready to continue, run:

```text
/wiki-resume
```

5. Let the agent use internal roadmap/task tools when work maps to existing tasks or when unresolved delta should become a new task.

Working rule for this repo:

- edit canonical sources (`README.md`, knowledge docs under `.wiki/knowledge/`, `.wiki/roadmap.json`, runtime code)
- rebuild generated outputs after changes
- do not hand-edit generated outputs under `.wiki/graph.json`, `.wiki/lint.json`, `.wiki/roadmap-state.json`, or `.wiki/status-state.json`

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
- `.wiki/knowledge/product/overview.md`
- `.wiki/knowledge/clients/overview.md`
- `.wiki/knowledge/clients/surfaces/roadmap.md`
- `.wiki/knowledge/clients/surfaces/status-panel.md`
- `.wiki/knowledge/system/overview.md`
- inferred first-pass boundary `overview.md` files under `.wiki/knowledge/system/` when brownfield structure is detected
- `.wiki/evidence/inspiration.jsonl`
- `.wiki/roadmap.json`
- generated outputs like `.wiki/graph.json`, `.wiki/lint.json`, `.wiki/roadmap-state.json`, and `.wiki/status-state.json`

### Status, fix, and review

`Alt+W` is now the primary status UX. It opens a live status panel backed by the same drift-first read model and lets the user inspect the current roadmap/task situation without consuming permanent editor space.

The always-on surface is optional. When enabled it uses Pi's status area for a one-line summary instead of a tall above-editor dock. `/wiki-config` owns summary visibility, pinning, and panel density through an interactive settings panel.

`/wiki-status` is the canonical inspection command. It opens the live status surface, shows roadmap and drift state, and is the right default when the next action is not yet obvious.

`/wiki-config`, `/wiki-status`, and `/wiki-resume` all accept an optional repo path when relevant. If Pi is running outside a repo with `.wiki/`, pass the target repo path explicitly. In UI mode, commands can also offer a repo picker when no repo-local wiki is found from current cwd.

`/wiki-resume` is the implementation segue. With no argument it resumes the current focused roadmap task when one exists, otherwise it picks the next open task from the roadmap working set. Pass `TASK-###` to force a specific open task.

`/wiki-resume` runs inside the parent-owned task loop. Runtime status and resume output show the active phase plus latest structured evidence summary. Internal agent flows should read state through `codewiki_state`, record canonical task progress and evidence through `codewiki_task`, and keep runtime session focus separate through `codewiki_session`.

For token efficiency, agents should avoid raw wiki truth, full lifecycle logs, and all task shards as default context. Prefer compact state, the current task context shard, or latest lifecycle events first; expand to targeted raw specs/code only when phase or stale revision requires exact source.

### Status summary and panel

The extension renders an optional one-line status summary plus a live status panel toggled with `Alt+W`. Both read `.wiki/status-state.json` plus `.wiki/roadmap-state.json`, prefer the current repo under cwd, keep the most recently resolved wiki repo visible across global and new-session starts when cwd is elsewhere, can still fall back to a pinned repo, and support three panel densities:

- `minimal`
- `standard`
- `full`

Use `/wiki-config` to open the interactive configuration panel. Direct args like `/wiki-config pin /path/to/repo` remain available as fallback for scripting or non-UI flows.

### Runtime operations

Per Pi's settings model, project settings are loaded from `<cwd>/.pi/settings.json`, while packages can also be installed globally. codewiki therefore binds runtime to repo-local wiki config, not to Pi install location.

Runtime rule:

- first resolve the nearest ancestor containing `.wiki/config.json` from current cwd
- if no repo-local wiki exists from current cwd, `/wiki-status`, `/wiki-config`, and `/wiki-resume` may target an explicit repo path instead
- in UI mode, those commands may offer a picker across candidate repos discovered below current cwd
- summary visibility and pinned-repo fallback are user-owned UI preferences, not repo-owned wiki files
- if no wiki exists yet, `/wiki-bootstrap` targets the enclosing git repo root when present, else the current working directory

It then uses that repo config to:

- find authored docs, evidence, roadmap, and optional generated markdown export paths
- run the configured rebuild command
- read `.wiki/graph.json`, `.wiki/lint.json`, and `.wiki/events.jsonl`
- build semantic audit scopes from `.wiki/config.json`
- append structured roadmap tasks to `.wiki/roadmap.json` when audits uncover real unresolved delta
- update or close existing roadmap tasks through package-native mutation tools instead of manual JSON edits
- append Pi custom session entries that link current session to roadmap tasks
- read active task context from Pi session state at runtime
- maintain `.wiki/graph.json`, `.wiki/roadmap-state.json`, and `.wiki/status-state.json` so the first-party summary/panel surfaces and any future third-party UI can read compact derived state without mutating canonical files

That means one global package install can operate across many repos, while each repo keeps its own hidden `.wiki/` contract.

### Runtime policy and transactions

codewiki's local gateway is a transitional adapter, not the long-term generic sandbox. The intended split is:

- `.wiki/config.json` declares codewiki policy: readable paths, direct writable paths, generated read-only paths, caps, and runtime adapter metadata.
- `scripts/codewiki-gateway.mjs` validates and applies codewiki transactions today.
- a future `think-code` executor can provide generic sandbox isolation while reusing the same repo-local policy and transaction schema.

Current transaction shape:

```json
{
  "version": 1,
  "summary": "Update wiki evidence.",
  "ops": [
    {
      "kind": "patch",
      "path": ".wiki/knowledge/system/overview.md",
      "oldText": "old exact text",
      "newText": "new exact text"
    },
    {
      "kind": "append_jsonl",
      "path": ".wiki/evidence/runtime.jsonl",
      "value": { "summary": "Evidence entry" }
    }
  ]
}
```

The gateway applies only validated writes under configured `.wiki` paths and rebuilds generated state after successful writes. Generated files such as `.wiki/graph.json`, `.wiki/status-state.json`, `.wiki/roadmap-state.json`, and `.wiki/roadmap/**` are read-only transaction targets.

## Philosophy

This package assumes:

- `.wiki/knowledge/` is source of truth for intended product, clients, and system design
- `.wiki/evidence/` is compact machine-managed validation output, not longform archive by default
- `.wiki/roadmap.json` is freshest tracked delta between authored docs and code, kept as a hot working set rather than unbounded history
- closed tasks older than the configured retention window move losslessly to `.wiki/roadmap-archive.jsonl` by default
- Pi sessions are execution history, not canonical roadmap truth
- history defaults to git for full diffs, `.wiki/events.jsonl` for compact lifecycle events, `.wiki/roadmap-events.jsonl` for roadmap mutations, and the optional roadmap archive for closed-task snapshots; package does not generate a separate compact-history file by default
- code is implementation evidence
- generated read models replace top-level markdown index exports by default
- machine metadata stays hidden under `.wiki/`
- plans and drift are better modeled as roadmap tasks than as separate top-level doc buckets
- archive clearing is explicit only; normal compaction never deletes archived closed-task snapshots

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

Type-check the package with the project-local TypeScript compiler:

```bash
npm run typecheck
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

Measure approximate token expenditure for the current wiki:

```bash
npm run benchmark:tokens
npm run benchmark:tokens -- --json
```

The benchmark compares raw wiki truth, raw implementation/verification lifecycle artifacts, generated read models, task context shards, and a synthetic compact agent-default packet. Use it to keep optimizing normal agent paths toward lower context usage without requiring users to define explicit token budgets.

If `pi-coding-agent` is not installed in a standard local/global location, set:

```bash
PI_CODING_AGENT_ROOT=/absolute/path/to/@mariozechner/pi-coding-agent npm test
```

## License

MIT
