---
type: Concept
title: Source Map
description: "OKF frontmatter is the active source ownership read path; no source-map YAML file is active truth."
tags:
  - codewiki
  - system
  - source
  - map
timestamp: 2026-07-30T00:00:00Z
codewiki_components:
  - project
  - utils
codewiki_source_patterns:
  - src/project/**
  - src/utils/**
codewiki_test_patterns:
  - tests/scaffold-core.test.mjs
  - tests/project/**
  - tests/implementation/repo-proof.test.mjs
  - tests/runtime/wiki-config.test.mjs
codewiki_roles:
  - project_boundary
  - domain_free_primitives
codewiki_test_policy: inherited
codewiki_test_rationale: Domain-free utilities are tested through owning consumers until a utility grows its own contract.
codewiki_source_map:
  - id: project
    source_patterns:
      - src/project/**
    test_patterns:
      - tests/scaffold-core.test.mjs
      - tests/project/**
      - tests/implementation/repo-proof.test.mjs
      - tests/runtime/wiki-config.test.mjs
    role: project_boundary
  - id: utils
    source_patterns:
      - src/utils/**
    role: domain_free_primitives
    test_policy: inherited
    test_rationale: Domain-free utilities are tested through owning consumers until a utility grows its own contract.
---
# Source Map

OKF frontmatter is the active source-ownership read path. There is no separate `source-map.yaml` truth file.

Current KB Markdown concepts use OKF v0.1 frontmatter plus CodeWiki extension keys. The executable reader now accepts declared v0.1 and v0.2 bundles, retains a bounded v0.1 fallback, and preserves unknown producer fields; the target Knowledge cut emits v0.2. CodeWiki ownership fields live in concept frontmatter and are read through the OKF-backed ownership view. Imported provenance, generated/verified, lifecycle/freshness, and Attested Computation metadata remain advisory and cannot grant source ownership or Runtime authority. Non-KB owners, such as the package component whose human entrypoint is `README.md`, use `codewiki_source_map[].doc` to point at that artifact from an OKF concept inside `.codewiki/kb`. Doc identity remains the canonical `kb:<relative-path>` ref for KB concepts. Human title remains the first `#` heading.

## Why one map

One ownership map is assembled directly from OKF concept frontmatter so source, docs, tests, generated views, and Change-operation responsibilities cannot drift from a duplicate YAML snapshot.

```text
OKF concept frontmatter -> owner doc -> source paths -> tests -> generated views -> operation responsibilities
```

Tools can use the same map in both directions:

- source path to owning doc;
- doc to owned source paths;
- source path to tests;
- test path to owning source/doc;
- Change operation kind to owning Loop/component;
- generated view to owner.

## Structure policy

Docs, source, and tests do not need mirrored folder trees. The source map declares ownership explicitly.

Rules:

- subpaths inherit the nearest owning source ownership component;
- new source ownership roots require OKF ownership frontmatter;
- each component needs one owning doc;
- each component needs tests or explicit no-test rationale;
- diagrams and the derived Alignment Graph map concepts, not source ownership;
- OKF frontmatter ownership fields are read directly through the ownership view;
- bootstrap writes OKF ownership metadata, not a parallel YAML map.

## Target source architecture

The active ownership map above describes the current checkout. The following layout is the ratified destination for clean-cut work; a destination path does not become active ownership until its source and tests move in the same slice.

```text
src/
  semantic-loop.ts        # closed three-Loop primitive
  api/                    # thin standalone facade
  changes/
    trace/                # canonical immutable Change operation protocol and Git persistence
    intake/
    triage/
    defect-profile.ts
  work-state/             # one canonical deterministic ProjectWorkState projection
  alignment/              # one canonical Alignment Graph projection and query surface
  benchmarks/              # isolated nonproduction comparison harnesses
  decision/               # all Decision-specific semantics and attempt composition
  planning/               # all Planning-specific semantics and attempt composition
  implementation/         # all Implementation-specific semantics and attempt composition
  verification/           # shared Check, Result, Exit Report, and Check-policy kernel
    custom-checks/
    standard-checks/
    security/
  evidence/
    adapters/
  runtime/                # generic project-control mechanics only
    coordinator/
    persistence/
    synchronization/
    claims/
    workers/
    integration/
    effects/
    recovery/
    lifecycle/
  pi/                     # Pi-only adapters
    coordinator/
    sessions/
    workers/
    ui/
  dashboard/
  preview/
  project/
  knowledge/
  git/
  error-handling/
  utils/
  cli/
```

The destination has exactly three semantic Loop packages: `decision`, `planning`, and `implementation`. Runtime must not gain matching `decision`, `planning`, `implementation`, or `loop-exit` subtrees, files, or policy modules. `src/verification/**` is shared machinery, not a fourth Loop; it replaces the target package name `src/loop-exit/**` only when one clean move removes the old path. `src/changes/trace/**` replaces the target role currently split between `src/change-trace/**`, `src/traces/**`, and legacy Change-record files. `src/work-state/**` and `src/alignment/**` each own one canonical projection rather than a second legacy model. Current `src/views/**` is a legacy Trace/view facade with no target root: delete it when canonical WorkState, Alignment, API, and Dashboard projections replace its callers. `src/benchmarks/**` remains a separate nonproduction measurement package until a later Lab rehome is independently justified.

## Target dependency direction

Dependencies flow inward:

```text
utils and closed protocol contracts
→ changes, evidence, work-state, alignment, verification
→ decision, planning, implementation
→ runtime outer composition
→ api, cli, dashboard, pi, preview adapters
```

Rules:

- A Loop package owns its Candidate schema, Loop-specific Check declarations, semantic attempt composition, interpretation, and route recommendation. It accepts injected ports and does not import Runtime implementations or own global scheduling, claims, persistence, recovery, or effects.
- Runtime is outer composition: it imports typed Loop entry ports, supplies generic scheduling, synchronization, canonical persistence, claims, workers, Integration, recovery, and guarded effects, and contains no Loop-specific Candidate construction, policy, or semantic evaluation.
- Verification owns shared Check/Evidence-obligation/Result/Report mechanics and declares its own generic execution-port interfaces. Runtime supplies implementations; Verification cannot import Runtime or any Loop implementation.
- Pi owns only Pi SDK, session, process, command, tool, and UI adapters. It implements Runtime ports and cannot own Loop policy or canonical authority.
- API, CLI, dashboard, preview, and Pi are outer adapters. Core/domain packages cannot import them; Runtime cannot import Pi.
- A clean move updates imports, tests, ownership metadata, package exports, and all callers in one slice. No old-path re-export, compatibility alias, or dual contract is allowed.

## Validation policy

Source-map validation checks must verify:

- all active `src/**` files have an owning component unless excluded;
- every mapped owning doc exists;
- every mapped test pattern matches tests or has explicit test rationale;
- ownership source docs exist;
- KB Markdown concept files validate as OKF documents when frontmatter is present.

Validation helpers are pure. They accept repo file lists and Markdown/frontmatter presence facts from callers rather than reading the filesystem directly.

If ownership mapping changes, update the owning OKF concept frontmatter and keep ownership tests passing. If conceptual diagram metadata is needed, keep it in the owning diagram YAML without making it source ownership truth. Dynamic source/Change relationships belong in operation projection, not authored OKF churn. Every Alignment Graph fact retains underlying ownership or analysis provenance. If exchange metadata is needed, derive it from path, first heading, Git, or generated OKF extension fields.

## Agent navigation rule

When editing source:

1. Look up the source path through the OKF-backed source ownership compatibility view.
2. Read the owning doc.
3. Read mapped tests or test rationale.
4. Edit only within the mapped ownership scope unless explicitly changing ownership metadata.
5. Update the owning doc when responsibility or contract changes.
6. Run mapped tests plus broader checks when needed.

## Related docs

- [Knowledge](knowledge.md)
- [Loop Model](loop-model.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
