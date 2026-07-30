---
type: Concept
title: Dictionary
description: Product workspace rendering CodeWiki's canonical vocabulary from root Lexicon without creating a copied glossary or second authority.
tags:
  - codewiki
  - product
  - dictionary
  - lexicon
  - dashboard
timestamp: 2026-07-30T00:00:00Z
resource: ../lexicon.md
---
# Dictionary

Dictionary is the Product workspace rendering canonical [Lexicon](../lexicon.md). It helps humans and agents understand exact vocabulary when Runtime activity introduces unfamiliar or confusable terms.

Lexicon remains sole vocabulary contract. Dictionary is source-backed projection, not copied glossary, generated summary, browser database, or second authority.

## Navigation and retrieval

Product contains Users, Stories, and Dictionary. Dictionary supports exact-term lookup, superseded-term lookup, text search, alphabetical navigation, and stable anchors from Work/Product/System/Design/Change views.

Selecting a term shows canonical definition, technical backing, related terms, and clean-cut replacement where applicable. Contextual help may show excerpt but links exact entry and cannot invent definition.

## Truth and editing

Dictionary reads current Lexicon Markdown and preserves structure, tables, code, and links. Search indexes, alphabetical grouping, and related-term edges are disposable. Unknown terms remain visibly undefined; model output or usage frequency cannot create authoritative vocabulary.

Definition changes require accountable Change, expected source digest, deterministic patch, rendered diff, Markdown/link validation, and Git proof. Unknown frontmatter/OKF extensions are preserved.

## Minimum distinctions

User-facing explanations distinguish:

- **Change**: accountable intent and complete durable dossier;
- **Change operation**: immutable typed content-addressed canonical fact;
- **Semantic Loop**: Decision, Planning, or Implementation only;
- **Candidate**: exact immutable output proposed by one Loop attempt;
- **Evidence Record**: immutable typed observation with no verdict or route authority;
- **Check**: one versioned requirement/execution/measurement/evidence contract;
- **Code Check** versus **Model Check**: deterministic CodeWiki code versus independent bounded Pi session;
- **Check Result**: one exact Check outcome;
- **Resolved Exit Policy**: candidate-specific active Check contract;
- **Exit Report**: complete deterministic aggregate for exact candidate;
- **Validation Bundle**: mutable CodeWiki/pull-request review projection, not approval;
- **Approval receipt**: Runtime-correlated authenticated approval Evidence Record;
- **Runtime route**: next action, separate from Report status;
- **Work Item**: Planning-owned worker-ready outcome;
- **Change Claim**: exclusive authority for one exact Change revision/purpose;
- **Work Item Claim**: exclusive authority for one exact Work Item/Assignment attempt;
- **Assignment**: exact bounded worker-attempt contract;
- **Assignment packet**: private serialized handoff;
- **Worker Report**: immutable adapter outcome and potential Candidate material;
- **Integration proof**: exact combined content boundary, not merge/push/publication;
- **Alignment Graph**: deterministic first-class projection whose facts retain underlying provenance;
- **Repair Episode/Pattern**: derived learning views, not authority;
- **Feedback Bundle**: user-reviewed privacy-preserving diagnostics, not full trace telemetry.

Superseded Stage/Quality/Standard/Assessment/Gate vocabulary appears only in clean-cut guidance and executable legacy surfaces awaiting deletion.

## Related docs

- [Lexicon](../lexicon.md)
- [Product](./overview.md)
- [Project Dashboard and Optional Pi Client](uis/terminal.md)
- [Runtime](../system/components/runtime.md)
- [Loop Exit](../system/components/loop-exit.md)
- [Session Coordination](../system/components/session-coordination.md)
