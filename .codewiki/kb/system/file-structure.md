---
id: spec.system.file-structure
title: File Structure
state: active
summary: Target knowledge-base and package file structure for CodeWiki.
owners:
  - architecture
updated: "2026-05-17"
code_paths:
  - .codewiki/kb
  - src
  - skills/codewiki
---

# File Structure

## Knowledge-base contract

Every CodeWiki project should use the same top-level knowledge-base shape:

```text
.codewiki/kb/
  product/
    overview.md
    users/
    stories/
    uis/
  system/
    overview.md
    file-structure.md
    <component>.md
    diagrams/
      README.md
      context-map.yaml
      component-map.yaml
      key-flow.yaml
      data-model.yaml
      state-lifecycle.yaml
```

Product docs define users, user stories, and visual user interfaces. System docs define the technical architecture, API, adapters, distribution mechanisms, component ownership, and diagram raw data that implement product intent.

At the `.codewiki/` root, active contract surfaces are limited to config, knowledge, roadmap queue/tasks, session queue coordination, builds, validation, runtime diff tables, sources/research support, and generated graph state. In this repository, `.codewiki/` is dogfood state for maintaining CodeWiki; it is not package source code. Legacy `.codewiki/index/` and default `.codewiki/evidence/**` surfaces are deprecated: `.codewiki/index_graph.json` is the generated index, implementation builds hold execution evidence, validation reports hold hot gateway decisions, and source/research support belongs under `.codewiki/sources/**` or an explicit `research_root`.

System component docs should stay flat. Each major system component should have one matching `.md` file under `system/`. Diagram raw data is the one intended nested system folder and lives under `system/diagrams/**`.

Avoid nested component folders and avoid `overview.md` files except `product/overview.md`, `system/overview.md`, and the diagram contract `system/diagrams/README.md`.

## Diagram raw-data contract

`system/diagrams/**` stores canonical, agent-editable raw diagram data. YAML is the default raw format because it is readable, diffable, and easier for agents to edit safely than dense diagram DSL.

The five default diagram families are:

| File | Diagram kind | Purpose | Renderer target |
| --- | --- | --- | --- |
| `diagrams/context-map.yaml` | Context map | Users, access surfaces, external systems, and project boundary. | Graph/SVG or Mermaid flowchart. |
| `diagrams/component-map.yaml` | Component/container map | Major runtime components, adapters, data stores, and dependency direction. | Cytoscape/custom SVG or Mermaid flowchart. |
| `diagrams/key-flow.yaml` | Key flow sequence | Most important user/agent workflow end to end. | Mermaid sequence diagram or custom sequence renderer. |
| `diagrams/data-model.yaml` | Data/domain model | Durable entities, generated state, evidence, and ownership. | Mermaid ER/custom ER renderer. |
| `diagrams/state-lifecycle.yaml` | State/lifecycle map | Task, compiler, validation, build, and release lifecycles. | Mermaid state diagram or custom state renderer. |

Renderer-specific Mermaid, Cytoscape, or SVG output should be treated as generated or renderer input unless a later task explicitly promotes a renderer-specific source file to canonical truth.

`system/architecture.mmd` is a compatibility source for the existing architecture renderer until CodeWiki UI and status panel rendering migrate to `system/diagrams/component-map.yaml`. New diagram work should target `system/diagrams/**`.

## Component-doc map

| Architecture node | Owning doc | Primary paths |
| --- | --- | --- |
| CodeWiki UI | `control-room-ui.md` | `src/ui/web/**`, local UI launch commands |
| Extension | `extension.md` | `src/index.ts`, package support files |
| Adapters | `adapters.md` | `src/adapters/**`, harness/protocol translation only |
| CodeWiki API | `api.md` | `src/application/tools/**`, focused application use-case modules, domain contracts |
| Agency controller | `agency.md` | application use cases and adapter-exposed agency entrypoints |
| Compilers | `compilers.md` | `src/application/builds.ts`, `src/application/roadmap.ts`, `src/application/task.ts`, focused `skills/codewiki-*/SKILL.md` compiler skills |
| Validation gateway | `validation-gateway.md` | `src/application/builds.ts`, `src/application/gateway/**`, `skills/codewiki-validation/SKILL.md`, hot fail/block/policy-required/current validation reports |
| Knowledge | `knowledge.md` | `.codewiki/kb/**` |
| Builds | `builds.md` | `.codewiki/builds/**`, implementation evidence and publication payloads |
| Alignment model | `alignment-model.md` | graph/gateway/content-proof precedence and semantic-change rules |
| Audits | `audits.md` | audit engine, `/audit [flags]`, gateway-required audit profiles |
| Roadmap | `roadmap.md` | `.codewiki/roadmap/queue.json`, active task state, release checkpoints, archive files |
| Session queue coordination | `api.md`, `adapters.md`, `graph.md` | `.codewiki/session/queue.json`, artifact statuses, generated session views |
| Generated state and graph | `graph.md` | `.codewiki/index_graph.json`, `src/application/state*.ts`, `src/application/graph/**`, `src/domain/state/**` |
| Task-linked tests | `file-structure.md` | `tests/tasks/TASK-###/**`, stable smoke/regression tests under `tests/smoke/**` |
| Skill assets and bootstrap | `extension.md`, `adapters.md`, `compilers.md` | `skills/codewiki/**` prompt templates, bootstrap workflow assets, loops, and playbooks |
| Pi project prompt boundary | `adapters.md`, `file-structure.md` | `.pi/APPEND_SYSTEM.md` clarifies `.codewiki/` dogfood state vs package source |

`system/diagrams/*.yaml` may also show external artifacts such as users, code/tests, and publication outputs. Those are not system component docs unless they become owned system components.

## CodeWiki system docs

The CodeWiki project should use this system set:

```text
.codewiki/kb/system/
  overview.md
  file-structure.md
  api.md
  extension.md
  adapters.md
  agency.md
  compilers.md
  validation-gateway.md
  builds.md
  graph.md
  alignment-model.md
  change-lifecycle.md
  audits.md
  knowledge.md
  roadmap.md
  control-room-ui.md
  architecture.mmd        # compatibility during diagram migration
  diagrams/
    README.md
    context-map.yaml
    component-map.yaml
    key-flow.yaml
    data-model.yaml
    state-lifecycle.yaml
```

Deprecated `.codewiki/` data paths that must not be recreated by new templates or normal agent writes:

```text
.codewiki/index/**
.codewiki/evidence/**
```

Legacy system KB paths removed by the flattening migration:

```text
.codewiki/kb/system/clients/**
.codewiki/kb/system/compilers/**
.codewiki/kb/system/components/**
.codewiki/kb/system/extensions/**
.codewiki/kb/system/flows/**
.codewiki/kb/system/runtime/**
.codewiki/kb/system/architecture.json
.codewiki/kb/system/v2-operating-model.md
```

## Path taxonomy

| Class | Paths | Rule |
| --- | --- | --- |
| Product/package source | `src/**`, `skills/**`, `tests/**`, `README.md`, `package.json`, lockfile, `tsconfig.json` | Implements and packages CodeWiki itself. |
| Optional developer helpers | `scripts/**` | Disposable wrappers or one-off local helpers only; source, tests, gateways, and skills must not depend on scripts for authoritative semantics. |
| Dogfood canonical state | `.codewiki/config.json`, `.codewiki/kb/**`, `.codewiki/roadmap/queue.json` | Maintains this repository with CodeWiki; not package source. |
| Generated state/views | `.codewiki/index_graph.json`, `.codewiki/roadmap/tasks/**` | Rebuilt from roadmap queue and KB inputs; never hand-edit. |
| Transient handoffs | `.codewiki/builds/**` | Compiler build artifacts that can be archived/purged after downstream truth and publication proof. |
| Validation/audit evidence | `.codewiki/validation/**` and policy-required audit reports | Attestations and deterministic evidence, not content proof by themselves. |
| Runtime/session state | `.codewiki/session/**`, `.codewiki/runtime/**` | Coordination and pending feedback UI state; not durable product truth unless compiled into builds. |
| Publication proof | Git commits/tree SHAs, package digests, archive ledgers, remote refs | Immutable or external proof of content and publication assertions. |

Architecture and audit checks must understand these classes so dogfood state, generated outputs, and package source cannot drift silently again.

## Package target layout

The package should be domain-led. Domain concepts define CodeWiki's language and invariants; application code runs compiler/gateway/state/tool workflows over those concepts; adapters and UIs expose the workflows without owning semantics. There is no top-level `infrastructure/` layer because filesystem, Git, process, locking, and persistence are implementation details behind application ports or local runtime services.

```text
src/
  index.ts                 # thin package entrypoint
  domain/
    task/
    roadmap/
    session/               # session queue, artifact statuses, focus, handoff concepts
    build/
    validation/
    state/                 # generated-state and reconciliation domain concepts
    shared/                # tiny primitives only
  application/
    tools/                 # agent-callable use-case API used by adapters, skills, CLI, MCP
    gateway/               # local policy/patch gateway implementation
    graph/                 # generated graph rebuild orchestration
    knowledge/             # knowledge parsing and link extraction
    local/                 # built-in local fs/git/process/persistence implementations
    state*.ts              # generated state read/rebuild helpers
    builds.ts              # compiler build writers
    roadmap.ts             # roadmap use cases
    task.ts                # task mutation use cases
    ports.ts
  adapters/
    pi/
      commands/
      tools/
      ui/
  ui/
    web/
    tui/
```

Skill assets own agent workflow guidance, prompt templates, bootstrap guidance, and optional helper scripts/tools. Source code may execute those workflows through `src/application/tools/**`, but skills remain the asset owner.

```text
skills/codewiki/
  SKILL.md
  loops/
  playbooks/
  bootstrap/
  prompts/
  tools/                  # optional skill helper entrypoints over application tools
```

`scripts/**`, when present, is optional developer convenience. A script may wrap an application tool for local use, but it must be safe to delete without changing CodeWiki product behavior, gateway policy, tests, or package semantics.

Future adapter directories may be introduced only when there is an implementation need:

```text
src/adapters/claude-code/
src/adapters/codex/
src/adapters/cli/
src/adapters/mcp/
```

## Dependency direction

```text
adapters -> application tools/use cases -> domain
ui -> application read/state services -> domain
skill helper scripts/tools -> application/tools
optional scripts -> application/tools
application/local -> application ports / domain contracts
domain/shared -> primitives only, no product behavior
```

Rules:

- `domain/**` has no Node I/O, no Pi imports, no adapter imports, and no application imports.
- `application/**` owns concrete use cases: compiler build writing, validation report writing, roadmap/session operations, generated state/graph rebuild and query helpers, agent-callable tool APIs, ports, and built-in local runtime implementations. It must remain agent-agnostic and must not import adapters, UI code, skills, scripts, or Pi SDK/TUI packages.
- `adapters/**` translate harness APIs or protocol surfaces into application tools and translate results back into commands, tools, protocol messages, sessions, or host-native compact UI. Browser UI source belongs under `src/ui/**`, not `src/adapters/**`.
- `domain/**` owns product semantics for tasks, roadmap, session queue, builds, validation, and state. `domain/shared/**` stays small and cannot become a dumping ground.
- `core/**`, `engine/**`, and top-level `infrastructure/**` must not exist in the target implementation; former responsibilities now live under `domain/**`, `application/**`, and `adapters/**`.

## Current migration warning

The repository no longer contains transitional `core/**` or `engine/**` source folders. Generated task shards remain runtime outputs, not target source architecture.

Runtime checks must cover direct Node execution and package loading, not only TypeScript typechecking.

## Related docs

- [Architecture Diagram](architecture.mmd)
- [Diagram Raw Data](diagrams/README.md)
- [API](api.md)
- [Adapters](adapters.md)
- [Alignment Model](alignment-model.md)
- [Audits](audits.md)
