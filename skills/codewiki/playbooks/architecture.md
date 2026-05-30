# CodeWiki Architecture

Use this workflow during outer planning, not as an automatic refactor pass.

## Vocabulary

- **Module** — anything with an interface and implementation.
- **Interface** — everything a caller must know: types, invariants, errors, ordering, config.
- **Implementation** — code behind the interface.
- **Seam** — where behavior can change without editing callers in place.
- **Adapter** — concrete implementation behind a seam.
- **Depth** — lots of behavior behind a small interface.
- **Leverage** — what callers gain from depth.
- **Locality** — change, bugs, and knowledge concentrated in one place.

## Heuristics

- Deletion test: if deleting a module removes complexity, it was pass-through; if complexity reappears across callers, it earned its keep.
- Interface is the test surface.
- One adapter is a hypothetical seam; two adapters make a real seam.
- Architecture findings should become knowledge updates, roadmap tasks, or explicit non-goals.

## Workflow

1. **Read CodeWiki state**
   - Start with `wiki_state` and the smallest architecture/system view available.
   - Expand relevant `.codewiki/kb/system/**` component or flow specs only after the view points there.
   - Use repo tools or an available bounded context tool to inspect code ownership seams; avoid loading broad source trees into parent RAM.
   - Use an architecture-review subagent for large cross-cutting reviews. Send `SubagentBrief` with `role: "architecture_reviewer"`; require `SubagentResult` findings and proposals only.

2. **Find friction**
   Look for:
   - concepts spread across many shallow modules,
   - interfaces as complex as implementations,
   - extracted functions that improve tests but hurt locality,
   - seams without real adapters,
   - hard-to-test behavior hidden behind poor interfaces,
   - code/spec ownership mismatch.

3. **Present candidates**
   For each candidate:
   - files/modules,
   - problem,
   - proposed direction,
   - benefits in locality/leverage/testability,
   - affected knowledge specs,
   - possible roadmap task.

4. **Ask before design**
   - Do not propose final interfaces immediately.
   - Ask the user which candidate to explore.
   - Then run planning loop to capture decisions and tasks.

## Architecture reviewer subagent contract

Input: `SubagentBrief` with `role: "architecture_reviewer"`, focused seams/flows/components, linked system views, and code paths.

Output: `SubagentResult` with findings about ownership, locality, leverage, testability, drift, and proposals of kind `task_delta`, `knowledge_patch`, or `follow_up`. Parent decides which findings become roadmap tasks or knowledge updates.

## Non-goals

- Do not create a separate ADR tree outside `.codewiki/kb`.
- Do not refactor automatically during review.
- Do not relitigate settled knowledge unless real friction justifies it.

## Related docs

- ../../../.codewiki/kb/system/overview.md
- ../../../.codewiki/kb/system/file-structure.md
- ../../../.codewiki/kb/system/knowledge.md
