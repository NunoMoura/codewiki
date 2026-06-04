# CodeWiki Research

## Memory policy

Run research in a fresh or bounded context when possible. Parent session should pass the question, linked specs/tasks, and budget; research returns compact findings, citations, implications for canonical knowledge, and task deltas. Do not paste broad source dumps into parent RAM.

Research supports canonical knowledge. It is not part of every implementation loop.

## Rules

- Research evidence supports `.codewiki/kb/**` and planning decisions.
- Execution evidence supports task closure. Keep these concepts distinct.
- Prefer local code inspection when the answer is inside the repo.
- Use web/code research when external/library/source truth is needed.
- Cite sources and capture stable facts, not generic summaries.
- Do not create a parallel docs system outside `.codewiki/kb`.

## Workflow

1. **Define claim/question**
   - State the knowledge claim or decision the research must support.
   - Identify which owning spec may change.

2. **Gather evidence**
   - For library internals, use source-backed research with permalinks.
   - For public docs, prefer official docs and version-specific references.
   - For repo-local behavior, inspect code/tests/history directly.

3. **Synthesize**
   - Separate fact, inference, and recommendation.
   - Surface uncertainty and conflicts.

4. **Update CodeWiki**
   - Patch owning knowledge specs when intended behavior or rationale changes.
   - Create or update roadmap tasks if research exposes implementation delta.
   - Append research/source evidence using CodeWiki evidence conventions when available.

## Subagent contract

Input: `SubagentBrief` with `role: "researcher"`, a bounded `question`, linked specs/tasks, source budget, and constraints.

Output: `SubagentResult`:

- `verdict`: `pass` when evidence supports useful findings, `fail` when evidence contradicts the claim, `block` when sources or access are insufficient
- `findings`: sourced compact facts
- `issues`: conflicts, weak evidence, or missing citations
- `proposals`: `knowledge_patch`, `task_delta`, or `follow_up` only; parent applies any canonical writes
- `rationale`: uncertainty and recommendation

Do not mutate `.codewiki/` from researcher worker context.

## Related docs

- ../../../.codewiki/kb/system/knowledge.md
