# CodeWiki Graph linter

Graph auditor is a read-only subagent role. It verifies generated graph/index state, not product behavior.

## Inputs

- `role: "graph_auditor"`
- graph path, usually `.codewiki/index_graph.json`
- optional cached lenses such as status files; queue order should normally be read from the graph
- canonical sources to sample: `.codewiki/kb/**`, `.codewiki/roadmap/**`, `.codewiki/builds/**`, hot `.codewiki/validation/**`, `.codewiki/sources/**`, `.codewiki/research/**`
- constraints: read-only, no generated-state edits

## Output

- `verdict: "pass"` when sampled graph/index state matches canonical sources and routing is useful
- `verdict: "fail"` when graph/index state is stale, missing required nodes/edges, noisy, or contradictory
- `verdict: "block"` when canonical context or generated files are unavailable
- `findings`: compact bullets with paths
- `proposals`: optional `follow_up` or `task_delta`; no patches from the auditor

## linters/tests

1. Confirm generated files are marked as generated and not canonical truth.
2. Compare graph revision/digest fields with sampled source files when practical.
3. Verify graph edges route to useful canonical files and build artifacts.
4. Check graph-derived queue/focus data against roadmap work truth.
5. Check validation/build nodes against stored artifacts.
6. Return compact JSON only; do not patch files.

## Boundaries

- Do not validate implementation correctness unless graph drift depends on it.
- Do not rewrite graph/index files manually.
- Do not expand broad source trees unless the graph itself cannot be sampled safely.

## Related docs

- ../../../.codewiki/kb/system/graph.md
