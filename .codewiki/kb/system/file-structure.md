---
id: spec.system.file-structure
title: File Structure
state: active
summary: Target knowledge-base and package file structure for CodeWiki.
owners:
  - architecture
updated: "2026-05-26"
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
| Compilers | `compilers.md` | `src/build/**`, `src/application/roadmap.ts`, `src/application/task.ts`, focused `skills/codewiki-*/SKILL.md` compiler skills |
| Validation gateway | `validation-gateway.md` | `src/validation/**`, `src/gateway/**`, `skills/codewiki-validation/SKILL.md`, hot fail/block/policy-required/current validation reports |
| Knowledge | `knowledge.md` | `.codewiki/kb/**` |
| Builds | `builds.md` | `.codewiki/builds/**`, implementation evidence and publication payloads |
| Alignment model | `alignment-model.md` | graph/gateway/content-proof precedence and semantic-change rules |
| Audits | `audits.md` | `src/audit/**`, `/audit [flags]`, `codewiki_audit`, gateway-required audit profiles |
| Roadmap | `roadmap.md` | `.codewiki/roadmap/queue.json`, active task state, release checkpoints, archive files |
| Session queue coordination | `api.md`, `adapters.md`, `graph.md` | `.codewiki/session/queue.json`, artifact statuses, generated session views |
| Generated state and graph | `graph.md` | `.codewiki/index_graph.json`, `src/application/state*.ts`, `src/application/graph/**`, `src/domain/state/**` |
| File-structure map and drift lens | `file-structure.md` | `.codewiki/kb/system/diagrams/file-structure-map.yaml`, repository tree audit inputs, source-layout migration deltas |
| Task-linked tests | `file-structure.md` | `tests/tasks/TASK-###/**`, stable smoke/regression tests under `tests/smoke/**` |
| Skill assets and bootstrap | `extension.md`, `adapters.md`, `compilers.md` | `skills/codewiki/**` router/bootstrap/prompt/playbook/reference assets and focused `skills/codewiki-*/SKILL.md` compiler skills |
| Pi project prompt boundary | `adapters.md`, `file-structure.md` | `.pi/APPEND_SYSTEM.md` clarifies `.codewiki/` dogfood state vs package source |

`system/diagrams/*.yaml` may also show external artifacts such as users, code/tests, and publication outputs. Those are not system component docs unless they become owned system components.

## CodeWiki system docs

The CodeWiki project keeps one flat system doc per major component under `.codewiki/kb/system/`, plus `overview.md`, `architecture.mmd` during renderer migration, and canonical diagram raw data under `diagrams/**`. The component-doc map above is the source list for expected owners and primary paths.

Deprecated `.codewiki/` paths must not be recreated by templates or normal agent writes:

```text
.codewiki/index/**
.codewiki/evidence/**
```

Legacy nested system KB folders removed by the flattening migration remain invalid: `clients/**`, `compilers/**`, `components/**`, `extensions/**`, `flows/**`, `runtime/**`, `architecture.json`, and `v2-operating-model.md`.

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

The accepted vNext direction is concept-root source ownership: main concepts should be findable from `src/<concept>/**` with model, use cases, tool/API entrypoints, and concept-local implementation nearby. Adapters and UI remain exposure layers; shared code stays primitive-only; no top-level `infrastructure/` layer should exist.

Current staged implementation is a hybrid: validated concept roots exist for agency and audit, while remaining concepts still live in domain/application until their migration tasks close.

```text
src/{agency,audit,domain,application,adapters,ui}/
```

Target roots:

```text
src/{api,agency,audit,build,change,gc,gateway,knowledge,project,roadmap,session,state,validation,shared}/
src/{adapters,ui}/
```

Primary deltas move domain/application pairs into concept roots: session, state/graph/resume, roadmap, build, validation/gateway, audit, project, knowledge, GC, change, and concept-owned tool entrypoints behind an API facade.

`agency` is the validated pilot. TASK-015 introduced `src/agency/**`; TASK-020 removed the old `src/domain/agency/types.ts`, `src/application/agency.ts`, and `src/application/tools/agency.ts` shims. Old agency shims must not be recreated.

Post-TASK-021 planning maps the accepted FS-ROOT-CONCEPTS decision into the next executable wave. TASK-021 closed the first non-agency boundary by moving audit types and tool execution to `src/audit/types.ts` and `src/audit/tool.ts`, removing old `src/domain/audit/types.ts` and `src/application/tools/audit.ts` paths, and passing task-close validation with file-structure audit evidence. TASK-022 is the next wave: migrate tightly coupled build, validation, and gateway ownership to `src/build/**`, `src/validation/**`, and `src/gateway/**`. Session, roadmap, state/graph/resume, project, knowledge, GC, change, and API/shared cleanup wait until TASK-022 task-close evidence proves the compiler/gateway seam.

Skills own agent workflow assets under `skills/codewiki*/**`; source executes workflows through API/concept entrypoints. `scripts/**` is optional developer convenience and must be safe to delete without changing product behavior, gateway policy, tests, or package semantics.

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
