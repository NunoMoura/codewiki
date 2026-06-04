| Class | Paths | Rule |
| --- | --- | --- |
| Canonical knowledge | `.codewiki/kb/**`, `.codewiki/config.json` | Durable project truth. Edit through CodeWiki workflows or exact human review. |
| Roadmap truth | `.codewiki/roadmap/queue.json` | Machine-managed task ordering, lifecycle truth, and sprint metadata. Mutate through CodeWiki APIs. |
| Sprint metadata | `.codewiki/roadmap/queue.json` `sprints` | Related-task cohort scope, outcome, budget, gates, and sequencing. Use when accepted intent creates 3+ related tasks or a multi-loop cohort. |
| Generated state/views | `.codewiki/index_graph.json`, `.codewiki/roadmap/tasks/**` | Tool-owned read models. Never hand-edit or cite as canonical truth when source files are available. |
| Runtime/session state | `.codewiki/session/**`, `.codewiki/runtime/**` | Local coordination, handoffs, and pending UI state. Useful operational context, not durable product truth. |
| Build/validation artifacts | `.codewiki/builds/**`, `.codewiki/validation/**` | Compiler handoffs and gateway decisions. Use as evidence, then compile durable changes into knowledge, roadmap, tests, code, or publication evidence. |
| Source/research support | `.codewiki/sources/**`, `.codewiki/research/**` | Provenance and compact findings that support knowledge changes. |
| Product/package source | Repository code, tests, scripts, package files, and skill assets outside `.codewiki/**` | Implements {{projectName}} itself. Do not confuse package source with repo-local CodeWiki state. |
