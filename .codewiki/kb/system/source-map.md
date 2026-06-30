---
type: Concept
title: Source Map
description: "`source-map.yaml` is the canonical machine-readable mapping between CodeWiki docs, source paths, tests, generated views, and trace/event responsibilities during OKF migration."
tags:
  - codewiki
  - system
  - source
  - map
timestamp: 2026-06-30T00:00:00Z
codewiki_components:
  - project
  - utils
codewiki_source_patterns:
  - src/project/**
  - src/utils/**
codewiki_test_patterns:
  - tests/scaffold.test.mjs
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
      - tests/scaffold.test.mjs
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

`source-map.yaml` is the canonical machine-readable mapping between CodeWiki docs, source paths, tests, generated views, and trace/event responsibilities during OKF migration.

KB Markdown concepts use OKF v0.1 frontmatter. CodeWiki ownership fields in that frontmatter are generated from `source-map.yaml`; they are exchange metadata, not a second hand-maintained ownership source. Doc identity remains the canonical `kb:<relative-path>` ref. Human title remains the first `#` heading.

## Why one map

A single map prevents duplicate links from drifting.

```text
source-map.yaml -> doc -> source paths -> tests -> generated views -> trace responsibilities
```

Tools can use the same map in both directions:

- source path to owning doc;
- doc to owned source paths;
- source path to tests;
- test path to owning source/doc;
- trace event to owning loop/component;
- generated view to owner.

## Structure policy

Docs, source, and tests do not need mirrored folder trees. The source map declares ownership explicitly.

Rules:

- subpaths inherit the nearest owning source-map component;
- new source ownership roots require a source-map entry;
- each component needs one owning doc;
- each component needs tests or explicit no-test rationale;
- diagrams map concepts, not source ownership;
- OKF frontmatter ownership fields are generated from this map until read-path parity allows deprecation.

## Validation policy

Source-map validation checks must verify:

- all active `src/**` files have an owning component unless excluded;
- every mapped owning doc exists;
- every mapped test pattern matches tests or has explicit test rationale;
- source-map source docs exist;
- KB Markdown concept files validate as OKF documents when frontmatter is present.

Validation helpers are pure. They accept repo file lists and Markdown/frontmatter presence facts from callers rather than reading the filesystem directly.

If ownership mapping is needed, add it to `source-map.yaml` while it remains canonical. If conceptual diagram metadata is needed, keep it in the owning diagram YAML without making it source ownership truth. If exchange metadata is needed, derive it from path, first heading, Git, or generated source-map extension fields.

## Agent navigation rule

When editing source:

1. Look up the source path in `source-map.yaml`.
2. Read the owning doc.
3. Read mapped tests or test rationale.
4. Edit only within the mapped ownership scope unless explicitly changing the map.
5. Update the owning doc when responsibility or contract changes.
6. Run mapped tests plus broader checks when needed.

## Related docs

- [Source Map](source-map.md)
- [Loop Model](loop-model.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
