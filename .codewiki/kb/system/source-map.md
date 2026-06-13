# Source Map

`source-map.yaml` is the only canonical machine-readable mapping between CodeWiki docs, source paths, tests, generated views, and trace/event responsibilities.

KB Markdown must not use frontmatter. Doc identity is the canonical `kb:<relative-path>` ref. Human title is the first `#` heading.

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
- Markdown frontmatter is forbidden.

## Validation policy

Source-map validation checks must verify:

- all active `src/**` files have an owning component unless excluded;
- every mapped owning doc exists;
- every mapped test pattern matches tests or has explicit test rationale;
- source-map source docs exist;
- KB Markdown files do not start with frontmatter.

Validation helpers are pure. They accept repo file lists and Markdown/frontmatter presence facts from callers rather than reading the filesystem directly.

If a mapping is needed, add it to `source-map.yaml` or to an owning diagram YAML file. If doc metadata is needed, derive it from path, first heading, Git, or source-map entries.

## Agent navigation rule

When editing source:

1. Look up the source path in `source-map.yaml`.
2. Read the owning doc.
3. Read mapped tests or test rationale.
4. Edit only within the mapped ownership scope unless explicitly changing the map.
5. Update the owning doc when responsibility or contract changes.
6. Run mapped tests plus broader checks when needed.

## Related docs

- [File Structure](file-structure.md)
- [Loop Model](loop-model.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
