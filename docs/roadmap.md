---
id: roadmap.live
title: Roadmap
state: active
summary: Numbered, trackable delta tasks for codebase-wiki.
owners:
- engineering
updated: '2026-04-17'
---

# Roadmap

Generated: 2026-04-17T23:02:59Z

Canonical source: [roadmap.json](roadmap.json)

Roadmap is freshest representation of gap between desired state in specs and current implementation reality.

## In progress

_None._

## Todo

_None._

## Blocked

_None._

## Done

### TASK-001 — Finish simplified research/specs/roadmap refactor

- Status: done
- Priority: critical
- Kind: architecture
- Summary: Replace legacy top-level taxonomy with simplified contract across templates, runtime prompts, README, and package docs.
- Specs:
  - [docs/specs/product.md](specs/product.md)
  - [docs/specs/shared/overview.md](specs/shared/overview.md)
  - [docs/specs/templates/overview.md](specs/templates/overview.md)
- Code:
  - extensions/codebase-wiki/templates.ts
  - extensions/codebase-wiki/index.ts
  - README.md
  - skills/codebase-wiki/SKILL.md
- Research: RES-001, RES-002
- Labels: refactor, v2
- Desired: Package ships one clear model: research evidence, spec truth, roadmap delta.
- Current: Starter templates, runtime prompts, package docs, and self-wiki now use research/specs/roadmap as canonical model.
- Closure: Done for current package contract. Future roadmap work continues on automation, brownfield mapping, and history strategy.

### TASK-002 — Generate brownfield spec hierarchy from repo structure

- Status: done
- Priority: high
- Kind: bootstrap
- Summary: Setup/bootstrap now infer first-pass boundary specs from meaningful repo structure so brownfield repos start closer to real ownership seams.
- Specs:
  - [docs/specs/system/overview.md](specs/system/overview.md)
  - [docs/specs/templates/overview.md](specs/templates/overview.md)
- Code:
  - extensions/codebase-wiki/bootstrap.ts
  - extensions/codebase-wiki/templates.ts
  - scripts/smoke-test.mjs
- Research: RES-001, RES-002
- Labels: brownfield, bootstrap
- Desired: Existing repos get useful boundary-shaped specs on first pass.
- Current: Setup/bootstrap now infer first-pass boundary specs and brownfield drift scopes from repo structure before humans refine the docs.
- Closure: Done for first-pass ownership inference. Future work can improve deeper heuristics for repos whose real seams only appear below top-level boundaries.

### TASK-003 — Emit roadmap-ready tasks from drift audits

- Status: done
- Priority: high
- Kind: agent-workflow
- Summary: Self-drift and code-drift flows should output roadmap task objects so unresolved deltas can be promoted with minimal manual rewriting.
- Specs:
  - [docs/specs/extension/overview.md](specs/extension/overview.md)
  - [docs/specs/shared/overview.md](specs/shared/overview.md)
  - [docs/specs/templates/overview.md](specs/templates/overview.md)
- Code:
  - extensions/codebase-wiki/index.ts
  - skills/codebase-wiki/SKILL.md
  - scripts/smoke-test.mjs
- Research: RES-001
- Labels: roadmap, automation
- Desired: Audit output converts directly into `docs/roadmap.json` task entries.
- Current: Drift prompts now instruct roadmap task-object emission and package tool appends structured tasks with automatic TASK ids and rebuild.
- Closure: Done for append-new-task flow. Future work can add update/close mutation support for existing roadmap tasks.

### TASK-004 — Decide compact history strategy after archive deprecation

- Status: done
- Priority: medium
- Kind: process
- Summary: Need explicit answer for how historical docs changes are preserved once archive is no longer default top-level bucket.
- Specs:
  - [docs/specs/shared/overview.md](specs/shared/overview.md)
  - [docs/specs/templates/overview.md](specs/templates/overview.md)
- Code:
  - extensions/codebase-wiki/templates.ts
- Labels: history, archive
- Desired: History stays cheap and accessible without reviving bulky archive docs.
- Current: Package now explicitly documents git for full diffs, `.docs/events.jsonl` for compact lifecycle events, and `.docs/roadmap-events.jsonl` for roadmap mutation history.
- Closure: Done by deciding against a separate compact-history artifact by default and documenting lightweight history expectations in shared/template/package docs.

### TASK-005 — Support roadmap update and close mutations

- Status: done
- Priority: medium
- Kind: agent-workflow
- Summary: After append flow, package should let agents update or close existing roadmap tasks without manual roadmap JSON editing.
- Specs:
  - [docs/specs/extension/overview.md](specs/extension/overview.md)
  - [docs/specs/templates/overview.md](specs/templates/overview.md)
- Code:
  - extensions/codebase-wiki/index.ts
- Labels: roadmap, automation, follow-up
- Desired: Agents can append, update, and close roadmap tasks through package-native workflow.
- Current: Runtime now supports append plus mutation of existing task ids through codebase_wiki_roadmap_update with automatic rebuilds.
- Closure: Done via codebase_wiki_roadmap_update, mutation history/events logging, and smoke coverage for closing an appended task.

### TASK-006 — Link Pi sessions to roadmap tasks

- Status: done
- Priority: high
- Kind: agent-workflow
- Summary: Keep Pi session JSONL native, append custom task-link entries, and read active task focus directly from Pi session state instead of maintaining repo-owned session caches.
- Specs:
  - [docs/specs/extension/overview.md](specs/extension/overview.md)
  - [docs/specs/shared/overview.md](specs/shared/overview.md)
  - [docs/specs/templates/overview.md](specs/templates/overview.md)
- Code:
  - extensions/codebase-wiki/index.ts
  - extensions/codebase-wiki/templates.ts
  - scripts/rebuild_docs_meta.py
  - skills/codebase-wiki/SKILL.md
  - README.md
- Labels: sessions, roadmap, pi
- Desired: Task work can be resumed across Pi sessions without replacing Pi session JSONL format.
- Current: Extension now appends Pi custom task-link entries, resolves current task focus from the live Pi session branch, and no longer maintains a repo-owned task-session index file.
- Closure: Done for native Pi session linkage and runtime focus overlay. Future work can add richer historical analytics if needed, but session truth stays in Pi sessions.

### TASK-007 — Expand smoke coverage for full public command surface

- Status: done
- Priority: medium
- Kind: testing
- Summary: Smoke tests should fail if any documented public command disappears from the packaged extension.
- Specs:
  - [docs/specs/extension/overview.md](specs/extension/overview.md)
  - [docs/specs/package/overview.md](specs/package/overview.md)
- Code:
  - scripts/smoke-test.mjs
- Labels: testing, dogfood, public-surface
- Desired: Packaged smoke checks cover the documented command surface closely enough to catch accidental public API drift.
- Current: Smoke tests now assert every documented command and tool name, and they exercise setup/bootstrap, roadmap append, session-link, and inferred brownfield starter behavior.
- Closure: Done for current public surface. Extend the assertions whenever new commands or tools are added.

### TASK-008 — Support global install with cwd-based wiki discovery

- Status: done
- Priority: critical
- Kind: architecture
- Summary: Extension runtime should load from a global Pi package install while discovering the active repo-local wiki from current cwd.
- Specs:
  - [docs/specs/package/overview.md](specs/package/overview.md)
  - [docs/specs/extension/overview.md](specs/extension/overview.md)
  - [docs/specs/system/overview.md](specs/system/overview.md)
- Code:
  - extensions/codebase-wiki/project-root.ts
  - extensions/codebase-wiki/bootstrap.ts
  - extensions/codebase-wiki/index.ts
  - scripts/smoke-test.mjs
  - README.md
  - skills/codebase-wiki/SKILL.md
- Labels: pi, install, discovery
- Desired: One global package install should work across many repos while runtime state stays repo-local.
- Current: Runtime now discovers the nearest ancestor with `.docs/config.json`, setup/bootstrap fall back to enclosing git repo root when no wiki exists yet, and nested-cwd smoke coverage protects the model.
- Closure: Done for the global-install plus repo-local discovery architecture adopted in this package.

### TASK-009 — Prototype roadmap browsing interactions for Pi

- Status: done
- Priority: medium
- Kind: agent-workflow
- Summary: Extension delivered roadmap-browsing groundwork that validated task inspection flows before the public UX was later consolidated into fewer commands.
- Specs:
  - [docs/specs/extension/overview.md](specs/extension/overview.md)
- Code:
  - extensions/codebase-wiki/index.ts
  - scripts/smoke-test.mjs
  - README.md
  - skills/codebase-wiki/SKILL.md
- Labels: roadmap, tui, pi
- Desired: Users should be able to inspect live roadmap/task state without leaving Pi or manually opening docs/roadmap.md in another tool.
- Current: The roadmap browser work validated task inspection and task-detail rendering, and that groundwork now informs the simpler consolidated UX.
- Closure: Done for the initial browsing prototype. Future work can surface roadmap/task navigation again if it materially improves the simpler command model.

### TASK-010 — Consolidate public UX into four intelligent wiki commands

- Status: done
- Priority: high
- Kind: agent-workflow
- Summary: Refactor the public command surface down to /wiki-bootstrap, /wiki-status, /wiki-fix, and /wiki-review while keeping roadmap/task/session internals and granular tools behind the scenes.
- Specs:
  - [docs/specs/extension/overview.md](specs/extension/overview.md)
  - [docs/specs/package/overview.md](specs/package/overview.md)
  - [docs/specs/system/overview.md](specs/system/overview.md)
- Code:
  - extensions/codebase-wiki/bootstrap.ts
  - extensions/codebase-wiki/index.ts
  - scripts/smoke-test.mjs
  - README.md
  - skills/codebase-wiki/SKILL.md
- Labels: ux, commands, agent-workflow
- Desired: Users should only need four strong commands, while Pi still uses internal roadmap/task/session primitives and tools behind the scenes.
- Current: The extension now exposes a four-command public UX, /wiki-bootstrap queues intelligent onboarding, /wiki-status queues evidence-backed health review, /wiki-fix queues corrective work, and /wiki-review queues senior idea/architecture analysis.
- Closure: Done for the first simplified public UX pass. Future work can refine prompts, heuristics, and TUI presentation without re-expanding the command surface.

### TASK-011 — Add roadmap-state read model and first-party roadmap widget

- Status: done
- Priority: high
- Kind: agent-workflow
- Summary: Generate a read-only roadmap-state UI model and render a compact first-party roadmap widget so users can track focused, in-progress, and next tasks inside Pi without expanding the public command surface or persisting session caches.
- Specs:
  - [docs/specs/extension/overview.md](specs/extension/overview.md)
  - [docs/specs/extension/roadmap-ui.md](specs/extension/roadmap-ui.md)
  - [docs/specs/system/overview.md](specs/system/overview.md)
  - [docs/specs/templates/overview.md](specs/templates/overview.md)
- Code:
  - extensions/codebase-wiki/index.ts
  - extensions/codebase-wiki/bootstrap.ts
  - extensions/codebase-wiki/templates.ts
  - scripts/rebuild_docs_meta.py
  - scripts/smoke-test.mjs
  - README.md
- Labels: roadmap, tui, ux
- Desired: Roadmap progress should be readable inside Pi through a compact working-set widget and a stable read-only UI state file that other extensions can consume.
- Current: The extension now generates .docs/roadmap-state.json as roadmap/task UI state, overlays live current-session focus from Pi at runtime, and keeps default roadmap presentation focused on active, in-progress, and next tasks instead of dumping the full roadmap.
- Closure: Done for the production roadmap TUI pass with runtime session overlay. Future work can add deeper drill-down interactions on top of the same read contract without changing canonical storage or the four-command public UX.

## Related docs

- [Docs Index](index.md)
- [Product](specs/product.md)
- [System Overview](specs/system/overview.md)
- [Shared Rules](specs/shared/overview.md)
