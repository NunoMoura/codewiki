---
id: spec.system.file-structure
title: File Structure
state: active
summary: Target knowledge-base and package file structure for CodeWiki.
owners:
  - architecture
updated: "2026-05-31"
diagram_refs:
  - file-structure-map:intended_file_structure
  - file-structure-map:current_layered_source
  - file-structure-map:concept_root_target
  - file-structure-map:structure_drift_lens
  - file-structure-map:first_concept_root_pilot
  - file-structure-map:migration_compatibility_constraints
  - file-structure-map:project_concept_root_boundary
  - file-structure-map:knowledge_concept_root_boundary
  - file-structure-map:checks_concept_root_boundary
  - file-structure-map:workflow_tool_wrappers
  - file-structure-map:deferred_concept_roots
---

# File Structure

## Knowledge-base contract

CodeWiki projects use this top-level knowledge-base shape:

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

Product docs define users/stories/UIs. System docs define architecture, API, adapters, distribution, ownership, and diagram raw data.

At `.codewiki/`, active surfaces are config, KB, roadmap, session coordination, builds, validation, runtime diff tables, source/research support, and generated graph state. Here `.codewiki/` is dogfood state, not package source. Legacy `.codewiki/index/**` and `.codewiki/evidence/**` stay deprecated; use `.codewiki/index_graph.json`, builds, validation reports, and `.codewiki/sources/**` or `research_root`.

System component docs stay flat: one component per `system/*.md`; `system/diagrams/**` is the only nested system folder. Diagrams are the vNext allowlist/navigation spine. Migrated system docs declare `diagram_refs` except overview/README docs. Primary refs use `<diagram-file-stem>:<local-id>`; `<diagram-id>:<local-id>` is an alias.

## Diagram raw-data contract

`system/diagrams/**` stores canonical, agent-editable raw diagram data. YAML is the default raw format because it is readable, diffable, and easier for agents to edit safely than dense diagram DSL.

Default diagram families:

| File | Diagram kind | Purpose | Renderer target |
| --- | --- | --- | --- |
| `diagrams/context-map.yaml` | Context map | Users, access surfaces, external systems, and project boundary. | Graph/SVG or Mermaid flowchart. |
| `diagrams/component-map.yaml` | Component/container map | Major runtime components, adapters, data stores, and dependency direction. | Layered graph, custom SVG, or Mermaid flowchart. |
| `diagrams/key-flow.yaml` | Key flow sequence | Most important user/agent workflow end to end. | Mermaid sequence diagram or custom sequence renderer. |
| `diagrams/data-model.yaml` | Data/domain model | Durable entities, generated state, evidence, and ownership. | Mermaid ER/custom ER renderer. |
| `diagrams/state-lifecycle.yaml` | State/lifecycle map | Task, compiler, validation, build, and release lifecycles. | Mermaid state diagram or custom state renderer. |
| `diagrams/file-structure-map.yaml` | File-structure map | Intended source/tree ownership, current implementation shape, approved migration deltas, and drift-lens categories. | Tree graph, layered graph, or Mermaid flowchart. |

Renderer-specific Mermaid, SVG, HTML, Unicode, ASCII, or graph JSON output is generated unless promoted. `system/diagrams/architecture.yaml` is canonical; hand-maintained `system/architecture.mmd` is removed. New diagram work targets `system/diagrams/**`.

## Component-doc map

| Architecture node | Owning doc | Primary paths |
| --- | --- | --- |
| Terminal UI | `terminal-ui.md` | `src/adapters/pi/ui/**`, `src/adapters/pi/commands/**`, terminal command views |
| Deprecated browser UI | `control-room-ui.md` | Removed source path; `/wiki-ui` remains only a deprecation shim |
| Extension | `extension.md` | `src/index.ts`, package support files |
| Adapters | `adapters.md` | `src/adapters/**`, harness/protocol translation only |
| CodeWiki API | `api.md` | `src/api/**` facade modules, `src/workflow/**` normal workflow-tool wrappers, concept tool modules such as `src/roadmap/tool.ts`, focused use-case modules, and stable contracts |
| Agency controller | `agency.md` | `src/agency/**` agency policy, planning, budget/risk gates, and adapter-exposed `wiki_agency` entrypoint |
| CodeWiki runtime | `runtime.md` | `src/runtime/**` bounded execution orchestration, harness capability ports, claims/gateway/context-boundary coordination, and workflow-efficiency evidence |
| Compilers | `compilers.md` | `src/build/**`, `src/roadmap/store.ts`, `src/roadmap/task.ts`, focused `skills/codewiki-*/SKILL.md` compiler skills |
| Validation gateway | `validation-gateway.md` | `src/gateway/**` gateway report/preflight/tool/type/transaction ownership, `src/validation/**` compatibility re-export shims, `skills/codewiki-validation/SKILL.md`, hot fail/block/policy-required/current validation reports |
| Gate policy | `validation-gateway.md` | `src/policy/**`, gate requirements, risk tiers, approval/proof requirements, production-readiness policy, review thresholds, package readiness, and waiver policy |
| Knowledge | `knowledge.md` | `.codewiki/kb/**`, `src/knowledge/**` parser ownership |
| Builds | `builds.md` | `.codewiki/builds/**`, implementation evidence and publication payloads |
| Alignment model | `alignment-model.md` | graph/gateway/content-proof precedence and semantic-change rules |
| Checks | `audits.md` | `src/checks/**`, deterministic evidence collectors consumed by audit and gateway surfaces |
| Audits | `audits.md` | `src/audit/**`, `/audit [flags]`, audit facade/tool behavior, gateway-required check profiles |
| Roadmap | `roadmap.md` | `src/roadmap/**`, `.codewiki/roadmap/queue.json`, active task state, release checkpoints, archive files |
| Session queue coordination | `api.md`, `adapters.md`, `graph.md` | `src/session/**`, `.codewiki/session/queue.json`, artifact statuses, generated session views |
| Generated state and graph | `graph.md` | `.codewiki/index_graph.json`, `src/state/**` |
| File-structure map and drift lens | `file-structure.md` | `.codewiki/kb/system/diagrams/file-structure-map.yaml`, repository tree audit inputs, source-layout migration deltas |
| Task-linked tests | `file-structure.md` | `tests/tasks/TASK-###/**`, stable smoke/regression tests under `tests/smoke/**` |
| Skill assets and bootstrap | `extension.md`, `adapters.md`, `compilers.md` | `skills/codewiki/**` router/bootstrap/prompt/playbook/reference assets and focused `skills/codewiki-*/SKILL.md` compiler skills |
| Pi project prompt boundary | `adapters.md`, `file-structure.md` | `.pi/APPEND_SYSTEM.md` clarifies `.codewiki/` dogfood state vs package source |

`system/diagrams/*.yaml` may show users, code/tests, and publication outputs; those are not component docs unless promoted.

## CodeWiki system docs

CodeWiki keeps one flat system doc per component, plus `overview.md`, UI/migration docs, and raw diagrams under `diagrams/**`. The component-doc map owns expected docs and primary paths.

Deprecated `.codewiki/` paths must not be recreated:

```text
.codewiki/index/**
.codewiki/evidence/**
```

Legacy nested system KB folders removed by flattening remain invalid: `clients/**`, `compilers/**`, `extensions/**`, `runtime/**`, `architecture.json`, and `v2-operating-model.md`. Active `components/**` and `flows/**` detail docs remain valid until a future flattening decision replaces their refs.

## Path taxonomy

| Class | Paths | Rule |
| --- | --- | --- |
| Product/package source | `src/**`, `skills/**`, `tests/**`, `README.md`, `package.json`, lockfile, `tsconfig.json` | Implements and packages CodeWiki itself. |
| Optional developer helpers | `scripts/**` | Disposable wrappers or one-off local helpers only; source, tests, gateways, and skills must not depend on scripts for authoritative semantics. |
| Dogfood canonical state | `.codewiki/config.json`, `.codewiki/kb/**`, `.codewiki/roadmap/queue.json` | Maintains this repository with CodeWiki; not package source. |
| Generated state/views | `.codewiki/index_graph.json`, `.codewiki/roadmap/tasks/**` | Rebuilt from roadmap queue and KB inputs; never hand-edit. |
| Transient handoffs | `.codewiki/builds/**` | Compiler build artifacts that can be archived/purged after downstream truth and publication proof. |
| Validation/audit evidence | `.codewiki/validation/**` and policy-required audit reports | Attestations and deterministic evidence, not content proof by themselves. |
| Dogfood runtime/session state | `.codewiki/session/**`, `.codewiki/runtime/**` | Repo-local coordination and pending decision UI state; not package source and not durable product truth unless compiled into builds. |
| Publication proof | Git commits/tree SHAs, package digests, archive ledgers, remote refs | Immutable or external proof of content and publication assertions. |

Architecture and audit checks use these classes to prevent dogfood/generated/package-source drift.

## Package target layout

Accepted direction: concept-root source ownership. Concepts live in `src/<concept>/**` with models, use cases, tool/API entrypoints, and local implementation nearby. Adapters expose host surfaces; shared code stays primitive-only; no top-level `infrastructure/` exists.

Current roots:

```text
src/{api,agency,audit,build,change,checks,gc,gateway,knowledge,project,roadmap,runtime,session,state,shared,workflow,adapters}/

Compatibility shims:

```text
src/validation/** -> src/gateway/**
```
```

Deprecated:

```text
src/{domain,application}/
```

Closed roots: `agency` (TASK-015/TASK-020), `audit` (TASK-021), `build`/`validation`/`gateway` (TASK-022), `project` (TASK-024), `knowledge` (TASK-025), `change`/`diff-table` (TASK-026), `gc` (TASK-027), `session` (TASK-028), `roadmap` (TASK-029), `state` (TASK-030), and `api`/`shared` cleanup (TASK-031). TASK-031 removes residual `src/domain/**` and `src/application/**` owner paths, exposes adapter/script use cases through `src/api/**`, and keeps shared primitives under `src/shared/**`. TASK-047 adds `runtime` as a concept root for bounded CodeWiki execution orchestration; approved daemon-runtime direction expands this root toward daemon job dispatch, Pi Code foundation use, runtime capability contracts, and pass-boundary session spawning. This root is package source and is distinct from `.codewiki/runtime/**` dogfood operational state. TASK-058 moves validation gateway implementation ownership into `src/gateway/**` and leaves `src/validation/**` as compatibility-only re-export shims. TASK-080 adds `src/workflow/**` as the normal workflow-tool wrapper root over lower-level compatibility primitives; it is source ownership for orchestration glue, not a new user-facing command surface.

Skills own workflow assets under `skills/codewiki*/**`; source executes workflows through API/concept entrypoints. `scripts/**` is optional developer convenience and must be safe to delete without changing product behavior, gateway policy, tests, or package semantics.

## Dependency direction

```text
adapters/ui/skills/scripts -> api facade or concept tool entrypoints -> concept use cases -> concept models
concept local implementations -> concept contracts / shared ports
shared -> primitives only
```

Legacy `adapters -> application -> domain` layering is retired. New code follows `adapters/scripts -> api facade -> concept roots -> shared primitives`.

Rules:

- `src/runtime/**` is the only package source root that owns the CodeWiki Runtime concept. Domain-specific files named `runtime.ts`, such as roadmap persistence/mutation helpers, are migration targets and should be renamed to `store`, `repository`, `reader`, `writer`, or another domain-specific name when touched.
- Pi Code is the primary runtime foundation dependency for CodeWiki. Optional model/runtime plug points must sit behind explicit capability contracts and must not turn CodeWiki into a generic chat gateway.
- Concept model code has no Node I/O, Pi, adapter, UI, skill, or script imports.
- Concept use cases own concrete behavior and may use concept-local runtime implementations behind contracts.
- Cross-concept APIs must be explicit through the API facade, shared ports, or named contracts; do not recreate a dumping-ground `shared` or `application` under a new name.
- `adapters/**` translate host/protocol APIs into API/concept calls and translate results back. Current Pi-hosted UI panels stay under `src/adapters/pi/ui/**`; browser UI source has been removed.
- `src/shared/**` stays small and primitive-only; `src/domain/shared/**` must not be recreated.
- `core/**`, `engine/**`, `src/domain/**`, `src/application/**`, and top-level `infrastructure/**` must not exist in target source.

## Current migration warning

The repo has no transitional `core/**` or `engine/**` source folders. Generated task shards are runtime outputs, not target source architecture.

Migration from `src/domain/**` + `src/application/**` to concept roots is complete. The drift lens treats recreated `src/domain/**` or `src/application/**` files as deprecated-path failures unless a future decision approves a temporary shim with owner, expiry, and tests. Migration tasks must preserve public behavior, compatibility exports, direct Node execution, package loading, and typechecking.

## Related docs

- [Architecture Diagram](diagrams/architecture.yaml)
- [Diagram Raw Data](diagrams/README.md)
- [API](api.md)
- [Adapters](adapters.md)
- [Alignment Model](alignment-model.md)
- [Audits](audits.md)
