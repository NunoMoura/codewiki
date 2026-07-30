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
