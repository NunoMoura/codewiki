Intelligently onboard the project after /wiki-bootstrap completed for {{projectName}}.

Wiki root: {{root}}
Inferred project state: {{inferredProjectState}}
Inferred boundaries: {{inferredBoundaries}}

Tasks:
1. Inspect the repo and current wiki/spec structure.
2. Confirm or refine inferred project shape: greenfield vs brownfield, app vs library vs service vs monorepo, and major ownership seams.
3. Infer what can be learned confidently from the codebase before asking the user anything.
4. Ask at most 4 high-value questions only when answers materially reduce ambiguity or edit scope.
5. Use roadmap as the top-level container, sprint metadata for related task cohorts, tasks as atomic work units, and Pi sessions as native execution history.
6. When accepted intent suggests 3+ related tasks or a multi-loop cohort, route sprint metadata decisions to planning/tool support instead of creating a container task.
7. Keep canonical/generated/runtime path classes separate; generated roadmap task pages and runtime queues are not durable product truth.

Output format:
- Inferred project shape
- Confident assumptions
- Questions for the user (only if truly needed)
- Suggested next step using wiki_state or /wiki-resume

Do not dump large file listings. Be concise and evidence-backed.
