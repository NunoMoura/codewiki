---
type: Concept
title: Dictionary
description: Product contract for rendering CodeWiki's canonical vocabulary from the root Lexicon without creating a copied glossary.
tags:
  - codewiki
  - product
  - dictionary
  - lexicon
  - dashboard
timestamp: 2026-07-21T00:00:00Z
resource: ../lexicon.md
---
# Dictionary

Dictionary is a Product workspace that renders the canonical [Lexicon](../lexicon.md). It helps humans and agents understand CodeWiki's exact vocabulary, especially when runtime activity introduces a term that is unfamiliar or easy to confuse with a related term.

The Lexicon remains the single vocabulary contract. Dictionary is a source-backed projection, not a copied glossary, generated summary, browser database, or second authority. Changes to definitions must modify `.codewiki/kb/lexicon.md` through the same digest-guarded, previewed, validated Change workflow used for other canonical Product Knowledge.

## Navigation and retrieval

Product contains three workspaces:

1. Users;
2. Stories;
3. Dictionary.

Dictionary supports exact-term lookup, aliases and deprecated-term lookup, text search, alphabetical navigation, and stable anchors for direct links from Work, Product, System, Design, Change dossiers, inspectors, and help text. Selecting a term shows its canonical definition, technical backing when present, related terms, and replacement guidance when the selected wording is deprecated.

Runtime and UI copy should prefer qualified terms such as **Assignment packet** and **Worker report** instead of unexplained bare words such as “packet” or “report.” Contextual help may show a short excerpt, but it links to the exact Dictionary entry and must not invent a competing definition.

## Truth and editing

Dictionary reads current Lexicon Markdown and preserves its section structure, tables, code examples, and links. Search indexes, alphabetical groupings, and related-term edges are disposable projections. Unknown terms remain visibly undefined; the dashboard must not generate authoritative definitions from usage frequency or model output.

A proposed definition change includes the expected Lexicon source digest, deterministic patch, rendered diff, Markdown and link validation, and a Change that explains why vocabulary changed. Accepted writes carry source and Git proof. Unsupported Markdown and unknown frontmatter fields are preserved.

## Initial vocabulary assurance

At minimum, user-facing runtime explanations distinguish:

- **Work Item**: what Planning says should be done;
- **Claim**: canonical temporary authority to execute it;
- **Assignment**: exact bounded contract for one worker attempt;
- **Assignment packet**: private serialized handoff for that attempt;
- **Worker report**: immutable adapter outcome and candidate evidence for one exact attempt;
- **Claim release**: end of reservation, not proof of success.

## Related docs

- [Lexicon](../lexicon.md)
- [Product](overview.md)
- [Project Dashboard and Pi Client](uis/terminal.md)
- [Runtime](../system/components/runtime.md)
- [Session Coordination](../system/components/session-coordination.md)
