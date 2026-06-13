# Knowledge Base Component

## Responsibility

The knowledge base stores intended product and system truth. Parser code loads Markdown, headings, diagram refs, links, source-map entries, and source refs so semantic loops, exit conditions, and generated views can reason about the project.

## Owned paths

- `.codewiki/kb/**` is canonical repo-local knowledge.
- `src/knowledge/**` owns parser and document-loading behavior.

## Contracts

- Product/system intent changes flow through decision loop output and exit conditions.
- Knowledge docs should link to generated or source-owned detail rather than duplicating raw history.
- Diagram-backed docs should keep stable diagram ids and source refs aligned.

## Flow links

- [Decision to planning](../flows/decision-to-planning.md)

## Related docs

- [System overview](../overview.md)
- [File structure](../file-structure.md)
- [Component map](../diagrams/component-map.yaml)
