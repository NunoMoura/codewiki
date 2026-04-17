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

Generated: 2026-04-17T08:55:31Z

Canonical source: [roadmap.json](roadmap.json)

Roadmap is freshest representation of gap between desired state in specs and current implementation reality.

## In progress

_None._

## Todo

### ROADMAP-004 — Decide compact history strategy after archive deprecation

- Status: todo
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
- Current: Current stance prefers git plus `.docs/events.jsonl`, but package does not yet document compact history patterns deeply.
- Closure: Choose and document whether events-only is enough or if compact history JSONL should be generated.

### ROADMAP-005 — Support roadmap update and close mutations

- Status: todo
- Priority: medium
- Kind: agent-workflow
- Summary: After append flow, package should let agents update or close existing roadmap items without manual roadmap JSON editing.
- Specs:
  - [docs/specs/extension/overview.md](specs/extension/overview.md)
  - [docs/specs/templates/overview.md](specs/templates/overview.md)
- Code:
  - extensions/codebase-wiki/index.ts
- Labels: roadmap, automation, follow-up
- Desired: Agents can append, update, and close roadmap items through package-native workflow.
- Current: Current implementation appends new tasks only; existing items still need manual edits for closure or rewrite.
- Closure: Add safe mutation tool for targeting existing roadmap ids and rebuilding generated outputs after edit.

## Blocked

_None._

## Done

### ROADMAP-001 — Finish simplified research/specs/roadmap refactor

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

### ROADMAP-002 — Generate brownfield spec hierarchy from repo structure

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

### ROADMAP-003 — Emit roadmap-ready tasks from drift audits

- Status: done
- Priority: high
- Kind: agent-workflow
- Summary: Self-drift and code-drift flows should output task-shaped roadmap items so unresolved deltas can be promoted with minimal manual rewriting.
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
- Current: Drift prompts now instruct task-shaped emission and package tool appends structured tasks with automatic ids and rebuild.
- Closure: Done for append-new-task flow. Future work can add update/close mutation support for existing roadmap items.

### ROADMAP-006 — Link Pi sessions to roadmap tasks

- Status: done
- Priority: high
- Kind: agent-workflow
- Summary: Keep Pi session JSONL native, append custom task-link entries, and derive local task-session metadata for roadmap navigation.
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
- Current: Extension now appends Pi custom task-link entries, maintains `.docs/task-session-index.json`, and surfaces session continuity in generated roadmap view.
- Closure: Done for link and derive flow. Future work can add richer session analytics or task-aware resume helpers.

### ROADMAP-007 — Expand smoke coverage for full public command surface

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

### ROADMAP-008 — Support global install with cwd-based wiki discovery

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

### ROADMAP-009 — Browse roadmap tasks in terminal UI

- Status: done
- Priority: medium
- Kind: agent-workflow
- Summary: Extension now exposes /wiki-roadmap so users can inspect roadmap tasks and task details directly inside Pi's terminal UI.
- Specs:
  - [docs/specs/extension/overview.md](specs/extension/overview.md)
- Code:
  - extensions/codebase-wiki/index.ts
  - scripts/smoke-test.mjs
  - README.md
  - skills/codebase-wiki/SKILL.md
- Labels: roadmap, tui, pi
- Desired: Users should be able to inspect the live roadmap without leaving Pi or manually opening docs/roadmap.md in another tool.
- Current: The extension now provides a terminal roadmap browser with searchable task selection and per-task detail views, plus smoke coverage for the public command surface.
- Closure: Done for the first terminal roadmap browser. Future work can add inline mutations or richer task navigation if needed.

## Related docs

- [Docs Index](index.md)
- [Product](specs/product.md)
- [System Overview](specs/system/overview.md)
- [Shared Rules](specs/shared/overview.md)
