---
id: spec.system.overview
title: System Overview
state: active
summary: Main runtime areas and ownership boundaries for codewiki.
owners:
- architecture
updated: '2026-04-29'
---

# System Overview

## Main boundaries

Map codewiki into meaningful ownership areas. Each area should get one canonical overview doc before any deeper split.

- product-facing boundary
- runtime or service boundary
- shared or package boundary

## Inferred brownfield boundaries

Setup detected these candidate ownership seams from repo structure. Refine, collapse, or rename them if the codebase uses different stable boundaries.

- [Extensions / Codewiki](extensions/codewiki/overview.md) — owns `extensions/codewiki`

## Architecture organization rule

System docs mirror meaningful project hierarchy, not arbitrary doc categories.

- one folder per real boundary when needed
- one canonical `overview.md` per boundary
- local decisions live inside owning spec, not in a global ADR bucket

## Brownfield mapping rule

For existing repos, setup should infer first-pass ownership specs from repo-relative boundaries before humans refine the language and invariants.

## Related docs

- [Product](../product/overview.md)
- [Clients Overview](../clients/overview.md)
