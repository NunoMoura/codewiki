---
type: Concept
title: Knowledge
description: Knowledge is accepted durable Product, System, and Design intent. It is portable through OKF, distinct from workflow history and implementation truth, and may intentionally lead source only when an exact active Change accounts for the transition.
tags:
  - codewiki
  - system
  - knowledge
timestamp: 2026-07-30T00:00:00Z
codewiki_component: knowledge
codewiki_components:
  - knowledge
codewiki_source_patterns:
  - src/knowledge/**
  - .codewiki/kb/**
codewiki_test_patterns:
  - tests/knowledge/**
  - tests/scaffold-core.test.mjs
codewiki_role: hot_knowledge
codewiki_source_map:
  - id: knowledge
    source_patterns:
      - src/knowledge/**
      - .codewiki/kb/**
    test_patterns:
      - tests/knowledge/**
      - tests/scaffold-core.test.mjs
    role: hot_knowledge
---
# Knowledge

Knowledge is accepted durable Product, System, and Design intent. It is not workflow history, WorkState, a generated relationship graph, a Work Item archive, a trace archive, or a code artifact store.

Hot Knowledge lives under:

```text
.codewiki/kb/**
```

Git preserves history. Change Traces preserve accountable transitions. Source/tests/Git preserve implementation truth.

Accepted Knowledge may describe future intent before source realizes it, but one or more exact active Changes must account for that discrepancy. Unaccounted divergence is drift; insufficient coverage remains explicitly unknown.

## Product structure

```text
.codewiki/kb/product/
  overview.md
  DESIGN.md
  users/
  stories/
  uis/
```

Product Knowledge defines users, outcomes, stories, behavior, vocabulary, and user-visible design. It avoids implementation detail unless that detail changes user value, constraints, or observable behavior.

## System structure

```text
.codewiki/kb/system/
  components/
  flows/
  diagrams/
```

System Knowledge defines architecture, responsibilities, interfaces, authority boundaries, and operational flows. Diagram YAML remains canonical diagram source; Mermaid, Cytoscape, SVG, image, and terminal renderings remain generated views.

## Decision-owned propagation

Decision owns accepted Knowledge meaning. There is no separate Knowledge Loop.

A Change may originate in any layer:

- Product changes can require System and source changes.
- System changes can require Product updates when user-visible.
- Implementation discoveries can route to Planning or Decision.
- Source/Knowledge divergence can create a Decision question.

Decision records exact Knowledge impact and provenance in the Change Candidate and accepted operations. It may exit only when affected Knowledge is updated, explicitly unaffected, grounded as an accounted transition, deferred with authority, or routed to the proper owner.

Planning consumes exact approved Change revisions and current Knowledge refs. Implementation realizes accepted obligations and may not invent new Knowledge meaning during coding.

## Current executable drift

Current `.codewiki/kb/**` export is an OKF v0.1 markdown/frontmatter bundle. Current executable durable workflow truth remains JSONL under `.codewiki/traces/TRACE-*.jsonl`. Target emits OKF v0.2 and accepts hot Change operations through `codewiki/state`, with local `.codewiki/changes/**` only a materialization. Backlog, Planning, Implementation, Sprint, work-queue, and Change dossier screens are WorkState-backed projections throughout the cut. OKF concept frontmatter is the active KB-code-test ownership source.

## OKF compatibility

CodeWiki targets OKF v0.2 for `.codewiki/kb/**/*.md`. Generic imported bundles may use a bounded v0.1 fallback reader, but CodeWiki does not emit two internal Knowledge contracts or preserve legacy Change Trace compatibility.

Target support includes:

- `sources` for document- or assertion-level provenance;
- `generated` for truthful producer/time metadata;
- `verified` as advisory confirmation metadata;
- `status` and `stale_after` lifecycle/freshness hints;
- Attested Computation definitions;
- meaningful software-domain `type` values;
- unknown frontmatter round-trip preservation;
- progressive disclosure through generated indexes;
- authored Knowledge relationships limited to `depends_on`, `constrains`, `refines`, `realizes`, `verifies`, `supersedes`, and `derived_from`.

CodeWiki does not treat OKF claims as runtime authority:

| OKF field | Does not prove |
| --- | --- |
| `sources` | Acceptance or correctness |
| `generated` | Approval authority |
| `verified` | Check pass or Loop exit |
| `status: stable` | Implementation realization |
| `stale_after` | Exact candidate freshness |
| Attested Computation | Permission to execute arbitrary code |

Runtime materializes any runtime-owned producer metadata before immutable candidate checking. It does not add machine `verified` metadata after checking because that would change the exact candidate digest the Exit Report covers.

Attested Computation may later define sanctioned production-outcome measurements under a closed, digest-pinned executor/attester catalog. Imported definitions are parsed as untrusted data and never execute automatically.

## Provenance versus realization

Keep two directions distinct:

```text
sources / accepted Change provenance
→ why Knowledge exists

CodeWiki source ownership and Change-operation/Git evidence
→ where Knowledge is realized
```

Standard OKF `sources` describes upstream provenance. CodeWiki's structured source-map extension describes downstream component/source/test realization. One must not replace the other.

Current `codewiki_source_map` is the canonical structured CodeWiki ownership extension. Existing flat convenience fields are executable drift; the clean Knowledge cut removes duplicate authority once source/tests use one structured profile.

## Links and Alignment Graph projection

Knowledge docs use sparse intentional Markdown links. Ordinary links remain `references`; vague `related_to` is rejected. Closed authored relationships carry only stable accepted Knowledge semantics and do not encode every dynamic relationship manually.

The wholly derived Alignment Graph projects:

- OKF concept metadata and links;
- provenance refs;
- CodeWiki source ownership;
- accepted Change and Planning refs;
- source/test/Git facts;
- Check Results and delivery evidence.

Stable semantic persistence should stop at outcome, behavior/invariant, system responsibility/interface, source ownership boundary, and tests/evidence. Fine-grained symbol relationships remain derived from LSP, AST, or Pi-Lens.

Agents may query bounded Work, Alignment, and Learning views. Every returned graph fact names underlying refs and `canonical_binding`, `observed_binding`, `deterministic_analysis`, or `inferred_analysis` provenance plus coverage, truncation, and staleness. Queries cannot mutate Knowledge, operations, or progression authority.

## Progressive brownfield adoption

A brownfield project may begin with sparse Knowledge and provisional ownership. CodeWiki should:

- preserve accepted known concepts;
- label uncovered areas honestly as unknown;
- inherit bounded source ownership where available;
- derive provisional code relationships without making them truth;
- expand validated Knowledge through actual Changes;
- prevent unsafe progression when required semantics remain unknown.

No complete ontology is required before useful work begins.

## Workflow boundary

Change, Change Trace, Decision, Planning, Implementation, WorkState, Sprint, Work Item, Assignment, Check, and Exit Report are defined as Knowledge concepts. Their live instances are not KB documents.

One Change's workflow truth is its accepted typed operation history. Hot segments are accepted through `codewiki/state`; terminal immutable segments live on `codewiki/archive`; local `.codewiki/changes/**` is a materialization. Backlog, Planning, Implementation, Change dossier, relationship, and learning screens remain projections over operations plus current Knowledge/source/Git/Runtime facts.

## Rules

- Keep current accepted intent in Knowledge; keep raw history in Git and Change Traces.
- Never treat imported trust metadata as authenticated CodeWiki authority.
- Keep Change Traces outside OKF.
- Use generated views for navigation, status, freshness, backlinks, relationship queries, and learning retrieval.
- Use source/tests for executable truth and Git for exact content/delivery identity.
- Prefer sparse intentional links over exhaustive meshes.
- Keep the Alignment Graph artifact derived and every graph/search index disposable.
- Do not reintroduce roadmap, graph, artifact, validation, or telemetry roots as project truth.
- Do not fabricate provenance, verification, freshness, or semantic coverage.

## Related docs

- [Product](../../product/overview.md)
- [Alignment Model](alignment-model.md)
- [Loop Model](loop-model.md)
- [Decision Loop](decision-loop.md)
- [Loop Exit](loop-exit.md)
- [Traces](traces.md)
- [Source Map](source-map.md)
