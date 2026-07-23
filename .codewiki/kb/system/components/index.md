# Components Knowledge Index

## Concepts

* [Adapters and UI Component](adapters-and-ui.md) - Pi, dashboard, CLI, and future harness adapters connect to the CodeWiki project control plane without owning canonical semantics or runtime lifetime.
* [Alignment Model](alignment-model.md) - Alignment means all durable sources tell the same story about current intent, state, implementation, and proof.
* [API](api.md) - `src/api/**` is the stable harness-neutral facade used by the project control plane and clients; Pi client/execution adapters remain entrypoint-isolated and source-checkout dogfooding stays disabled.
* [API Facade Component](api-facade.md) - The API facade is the stable boundary that exposes CodeWiki operations to adapters, scripts, UI surfaces, skills, CLI/MCP wrappers, and future harness integrations. It converts external requests into typed CodeWiki capabilities and keeps callers away from direct `.codewiki/` file mutation.
* [API Tool Surface](api-tools.md) - CodeWiki clients expose bounded state, Change, authority, and config capabilities while the project control plane schedules semantic sessions and workers through execution adapters.
* [Decision Loop](decision-loop.md) - The Decision loop receives and refines persisted Changes, validates exact revisions against current WorkState, and appends binding approval or terminal disposition facts to each Change Trace.
* [Implementation Loop](implementation-loop.md) - The Implementation loop continuously receives planned Work Items and worker reports, then accepts Change realization only after scoped integration, checks, evidence, and content proof pass.
* [Knowledge](knowledge.md) - Knowledge is the durable intended truth for product and system design. It is not a log, generated view, Work Item archive, trace archive, or code artifact store.
* [Knowledge Base Component](knowledge-base.md) - The knowledge base stores intended product and system truth. Parser code loads Markdown, headings, diagram refs, links, source-map entries, and source refs so semantic loops, exit conditions, and generated views can reason about the project.
* [Lab](lab.md) - The CodeWiki lab is the isolated experimentation area for improving loop exit conditions before changing production loop behavior. It replaces the previous benchmark-first approach during core hardening.
* [Live Preview Runtime](preview-runtime.md) - CodeWiki binds approved frontend-impact work to loopback preview profiles, supervises native development servers, and opens browser sessions without creating another semantic authority.
* [Loop Contracts](loop-contracts.md) - CodeWiki has exactly three semantic loops: decision, planning, and implementation. There is no fourth knowledge, validation, runtime, publication, roadmap, graph, or recovery loop.
* [Loop Model](loop-model.md) - CodeWiki is a Change-trace-backed software-development OS whose project control plane schedules compatible work across exactly three quality-governed semantic loops.
* [Package Boundary](package.md) - Package manifest, README, TypeScript entrypoint, and install/readiness contract for CodeWiki distribution.
* [Pi Extension](extension.md) - CodeWiki ships a project control plane plus a thin Pi client and execution adapter, while source-checkout self-hosting remains disabled until external gates pass.
* [Planning Loop](planning-loop.md) - The Planning loop continuously turns the relevant portfolio of approved Changes into globally coherent Sprints, Work Items, dependencies, resolutions, and execution constraints.
* [Project Dashboard and Pi Client Architecture](terminal-ui.md) - The dashboard and Pi extension are concurrent clients of one local CodeWiki project control plane that owns Work scheduling, execution sessions, guarded writes, and projections.
* [Runtime](runtime.md) - Runtime is CodeWiki's project-scoped control plane. It derives WorkState, schedules a compatible set of invariant repairs, owns session and worker lifecycles, guards writes and integration, and quiesces safely.
* [Session Coordination Component](session-coordination.md) - Session coordination gives one project control plane safe concurrent semantic sessions and isolated implementation workers without making session state canonical.
* [Source Map](source-map.md) - OKF frontmatter is the active source ownership read path; no source-map YAML file is active truth.
* [System Overview](overview.md) - CodeWiki is being rebuilt from a clean source scaffold. The old implementation archive has been removed after migration audit; the new Pi extension is package-installable, and repo-local CodeWiki dogfooding stays disabled while production readiness is hardened. This checkout uses `.codewiki/kb/**` as design truth while source stabilizes. The current migration inventory and remaining gaps are tracked in [Migration Audit](../flows/migration-audit.md).
* [Traces](traces.md) - CodeWiki stores one append-only JSONL Change Trace for each persisted Change journey from intake through approval, planning, implementation, outcome disposition, and retention.
* [WorkState](work-state.md) - WorkState is the disposable project-wide projection that lets runtime and all three semantic loops reason from the same current state without creating another truth store.
* [Worktree Isolation](worktree-isolation.md) - The old worktree-isolation workflow is deprecated during the rebuild. Useful ideas should migrate into `src/runtime/**` and `src/git/**` as trace-owned claims, leases, work-unit claim boundaries, budgets, and content-evidence requirements.
