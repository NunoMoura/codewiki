---
id: spec.system.file-structure
title: File Structure
state: active
summary: Target knowledge-base and package file structure for CodeWiki.
owners:
  - architecture
updated: "2026-05-23"
code_paths:
  - .codewiki/kb
  - src
  - skills/codewiki
diagram_refs:
  - file-structure-map:intended_file_structure
  - file-structure-map:current_layered_source
  - file-structure-map:concept_root_target
  - file-structure-map:structure_drift_lens
  - file-structure-map:first_concept_root_pilot
  - file-structure-map:migration_compatibility_constraints
  - file-structure-map:deferred_concept_roots
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
      file-structure-map.yaml
```

Product docs define users, user stories, and visual user interfaces. System docs define the technical architecture, API, adapters, distribution mechanisms, component ownership, and diagram raw data that implement product intent.

At the `.codewiki/` root, active surfaces are config, KB, roadmap, session coordination, builds, validation, runtime diff tables, source/research support, and generated graph state. In this repository, `.codewiki/` is dogfood state, not package source. Legacy `.codewiki/index/**` and `.codewiki/evidence/**` are deprecated; use `.codewiki/index_graph.json`, builds, validation reports, and `.codewiki/sources/**` or `research_root`.

System component docs should stay flat. Each major system component should have one matching `.md` file under `system/`. Diagram raw data is the one intended nested system folder and lives under `system/diagrams/**`.

In the vNext target, system diagrams are the allowlist/navigation spine for system docs. Every system `.md` doc except `system/overview.md` and `system/diagrams/README.md` should declare valid `diagram_refs` after migration. Primary refs use `<diagram-file-stem>:<local-id>` with `<diagram-id>:<local-id>` accepted as an alias. Diagram refs may point to components, adapters, flows, domain entities, lifecycles, policy boundaries, artifacts, actors, or external systems. Diagram nodes may set `requires_doc` when a doc is mandatory; diagram nodes without that flag may remain diagram-only. `codewiki.system_diagrams.diagram_refs.mode` controls migration: `off`, `warn`, or `error`.

Avoid nested component folders and avoid `overview.md` files except `product/overview.md`, `system/overview.md`, and the diagram contract `system/diagrams/README.md`.

## Diagram raw-data contract

`system/diagrams/**` stores canonical, agent-editable raw diagram data. YAML is the default raw format because it is readable, diffable, and easier for agents to edit safely than dense diagram DSL.

The default diagram families are:

| File | Diagram kind | Purpose | Renderer target |
| --- | --- | --- | --- |
| `diagrams/context-map.yaml` | Context map | Users, access surfaces, external systems, and project boundary. | Graph/SVG or Mermaid flowchart. |
| `diagrams/component-map.yaml` | Component/container map | Major runtime components, adapters, data stores, and dependency direction. | Cytoscape/custom SVG or Mermaid flowchart. |
| `diagrams/key-flow.yaml` | Key flow sequence | Most important user/agent workflow end to end. | Mermaid sequence diagram or custom sequence renderer. |
| `diagrams/data-model.yaml` | Data/domain model | Durable entities, generated state, evidence, and ownership. | Mermaid ER/custom ER renderer. |
| `diagrams/state-lifecycle.yaml` | State/lifecycle map | Task, compiler, validation, build, and release lifecycles. | Mermaid state diagram or custom state renderer. |
| `diagrams/file-structure-map.yaml` | File-structure map | Intended source/tree ownership, current implementation shape, approved migration deltas, and drift-lens categories. | Tree graph, layered graph, or Mermaid flowchart. |

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
| File-structure map and drift lens | `file-structure.md` | `.codewiki/kb/system/diagrams/file-structure-map.yaml`, repository tree audit inputs, source-layout migration deltas |
| Task-linked tests | `file-structure.md` | `tests/tasks/TASK-###/**`, stable smoke/regression tests under `tests/smoke/**` |
| Skill assets and bootstrap | `extension.md`, `adapters.md`, `compilers.md` | `skills/codewiki/**` router/bootstrap/prompt/playbook/reference assets and focused `skills/codewiki-*/SKILL.md` compiler skills |
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
    file-structure-map.yaml
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
| Runtime/session state | `.codewiki/session/**`, `.codewiki/runtime/**` | Coordination and pending decision UI state; not durable product truth unless compiled into builds. |
| Publication proof | Git commits/tree SHAs, package digests, archive ledgers, remote refs | Immutable or external proof of content and publication assertions. |

Architecture and audit checks must understand these classes so dogfood state, generated outputs, and package source cannot drift silently again.

## Package target layout

The accepted vNext direction is concept-root source ownership. Main concepts should be findable from the `src/` root with model, use cases, tool/API entrypoints, and concept-specific local implementation nearby. Adapters and UIs remain exposure layers; shared code stays primitive-only. No top-level `infrastructure/` layer should exist.

Current implementation remains valid until migration tasks land:

```text
src/{domain,application,adapters,ui}/
```

Target concept roots:

```text
src/{api,agency,audit,build,change,gc,gateway,knowledge,project,roadmap,session,state,validation,shared}/
src/{adapters,ui}/
```

Primary deltas are `domain/session` + `application/session|claims|worktree-isolation` to `session`, `domain/state` + `application/state*|graph|resume-context` to `state`, roadmap/build/validation/audit pairs to matching roots, `application/knowledge` to `knowledge`, `application/tools` to an `api` facade plus concept-owned tool entrypoints, and `application/local` to concept-owned local implementations or truly cross-cutting shared ports.

The first approved concept-root migration boundary was `agency`. The pilot introduced `src/agency/**` as the agency source-root owner: `src/agency/types.ts` owns agency model/tool input contracts, `src/agency/planning.ts` owns the bounded agency planning use case, and `src/agency/tool.ts` owns the agency tool/API executor used by adapters. TASK-015 closed with task-close validation and compatibility evidence, so the pilot is validated. The next approved post-pilot boundary is agency shim cleanup: remove the deprecated re-export-only compatibility shims at `src/domain/agency/types.ts`, `src/application/agency.ts`, and `src/application/tools/agency.ts` only in dedicated implementation task TASK-020 after planning validation.

The agency pilot preserved public package behavior, package entrypoints, adapter schema/tool behavior, direct Node execution, package loading, TypeScript typechecking, and smoke/feature/package test coverage. Compatibility barrels or re-export shims may exist only when they preserve existing imports and are backed by tests such as `tests/tasks/TASK-015/agency-source-root.test.mjs`; cleanup of old agency paths requires its own roadmap task and validation. The cleanup task must prove internal imports no longer need the shims and must keep public commands, package entrypoints, adapter schemas/tool behavior, direct Node execution, package loading, and product behavior unchanged.

Heavier concept roots were explicitly deferred, not accidental drift. Maintainers own the deferral. The original deferral trigger—closed agency pilot with task-close validation and compatibility evidence—is satisfied, and the deferral is renewed until TASK-020 agency shim cleanup closes with task-close validation plus file-structure audit evidence. Candidate next roots should be reconsidered after cleanup evidence: audit if `/audit` compatibility risk is understood, then build/validation, then session/roadmap/state/project only after shared API/import patterns are stable.

Skill assets own agent workflow guidance under `skills/codewiki*/**`; source may execute those workflows through API/concept entrypoints, but skills remain the asset owner. `scripts/**` is optional developer convenience and must be safe to delete without changing product behavior, gateway policy, tests, or package semantics. Future adapters such as `src/adapters/cli/**` or `src/adapters/mcp/**` require an implementation need.

## Dependency direction

```text
adapters/ui/skills/scripts -> api facade or concept tool entrypoints -> concept use cases -> concept models
concept local implementations -> concept contracts / shared ports
shared -> primitives only
```

During migration, current paths still obey `adapters -> application -> domain`, `ui -> application -> domain`, and `application/local -> ports/domain contracts`.

Rules:

- Concept model code has no Node I/O, Pi, adapter, UI, skill, or script imports.
- Concept use cases own concrete behavior and may use concept-local runtime implementations behind contracts.
- Cross-concept APIs must be explicit through the API facade, shared ports, or named contracts; do not recreate a dumping-ground `shared` or `application` under a new name.
- `adapters/**` translate host/protocol APIs into API/concept calls and translate results back. Browser UI source stays under `src/ui/**`.
- `src/shared/**` and transitional `src/domain/shared/**` stay small; compatibility barrels may remain only during migrations.
- `core/**`, `engine/**`, and top-level `infrastructure/**` must not exist in target source.

## Current migration warning

The repository no longer contains transitional `core/**` or `engine/**` source folders. Generated task shards remain runtime outputs, not target source architecture.

The repository does contain an approved concept-root migration delta from the current `src/domain/**` + `src/application/**` split toward `src/<concept>/**` ownership. The deterministic drift lens should treat unmigrated concept roots as planned deltas when they have an approved boundary, owner, trigger, and rationale. Migration tasks must preserve public tool behavior, compatibility exports, direct Node execution, package loading, and TypeScript typechecking throughout the move.

Runtime checks must cover direct Node execution and package loading, not only TypeScript typechecking.

## Related docs

- [Architecture Diagram](architecture.mmd)
- [Diagram Raw Data](diagrams/README.md)
- [API](api.md)
- [Adapters](adapters.md)
- [Alignment Model](alignment-model.md)
- [Audits](audits.md)
