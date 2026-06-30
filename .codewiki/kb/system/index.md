# System Knowledge Index

## Concepts

* [Alignment Model](alignment-model.md) - Alignment means all durable sources tell the same story about current intent, state, implementation, and proof.
* [API](api.md) - `src/api/**` is the stable package/source facade. Root exports are reduced to the core `wiki_*` facades and stable types. `src/pi/**` contains the Pi-native tool/command adapter exposed by package metadata for external installs and repo-local dogfooding. `src/cli/index.ts` remains a temporary development/test harness, not the normal product surface.
* [API Tool Surface](api-tools.md) - CodeWiki should be operated through a small set of explicit tools backed by the same core package APIs. The tools are required for CodeWiki as a software-development OS: without them, an agent can read files, but it cannot safely execute semantic loop iterations and trace state updates. Runtime coordination remains backend/host plumbing, not a model-facing mega-tool.
* [Change Lifecycle](change-lifecycle.md) - A CodeWiki change starts as user intent and becomes durable when it is represented consistently in KB, JSONL traces, source/tests, and Git proof.
* [Decision Loop](decision-loop.md) - The decision loop owns product and system intent and KB meaning updates. It turns user goals, current project state, alternatives, risks, and knowledge impact into user-validated decision rows that can become an accepted decision output Planning can trust.
* [Implementation Loop](implementation-loop.md) - The implementation loop owns code, docs, tests, checks, worker evidence, acceptance proof, and final content proof. It turns accepted planning output, or an eligible direct implementation decision row, into verified project changes.
* [Knowledge](knowledge.md) - Knowledge is the durable intended truth for product and system design. It is not a log, generated view, task archive, trace archive, or code artifact store.
* [Lab](lab.md) - The CodeWiki lab is the isolated experimentation area for improving loop exit conditions before changing production loop behavior. It replaces the previous benchmark-first approach during core hardening.
* [Loop Contracts](loop-contracts.md) - CodeWiki has exactly three semantic loops: decision, planning, and implementation. There is no fourth knowledge, validation, runtime, publication, roadmap, graph, or recovery loop.
* [Loop Model](loop-model.md) - CodeWiki is a trace-backed software-development OS built around loops.
* [Migration Audit](migration-audit.md) - CodeWiki has completed the useful migration audit from the old implementation into the clean `src/**` scaffold. The `_OLD_VERSION/**` archive has been removed; archived Pi extension code, graph truth roots, roadmap truth roots, validation roots, and CodeWiki-owned compaction must not be reintroduced wholesale.
* [Pi Extension](extension.md) - The CodeWiki package exposes the Pi extension for external package installs through `package.json` `pi.extensions`. This checkout uses controlled repo-local dogfooding through the project-local package path `..` in `.pi/settings.json`; Pi resolves relative package paths against the settings file, so `..` points at the package root. It intentionally does not auto-load CodeWiki through a `.pi/extensions/codewiki.ts` shim. Rebuild `dist/**` and restart/reload Pi before relying on repo-local dogfood after source changes. Temp-project package smokes also exercise `dist/pi/extension.js`.
* [Pi Terminal UX](terminal-ui.md) - CodeWiki is backend-first for the current architecture wave, but Pi terminal rendering is now a primary product surface because it makes the agent's semantic work observable without spending extra model tokens.
* [Planning Loop](planning-loop.md) - The planning loop owns executable work shaping and trace-queue health. It turns accepted decision output into work units, ordering, conflicts, path scopes, component refs, and acceptance criteria that implementation and runtime can trust. Most accepted project-affecting decisions enter planning; tiny/small low-risk decisions may bypass planning only when the Decision loop records a safe direct implementation route.
* [Production readiness audit](production-readiness-audit.md) - Status: controlled dogfood enabled for `TRACE-production-readiness-audit`.
* [Runtime](runtime.md) - Runtime is CodeWiki's outer control loop. It is not a semantic loop and it does not own semantic truth. It is the sole trace writer: semantic loops produce appendable reports, and runtime validates and appends trace records.
* [Source Map](source-map.md) - `source-map.yaml` is now a deprecated migration input kept until OKF-backed source ownership parity and caller migration are complete.
* [System Overview](overview.md) - CodeWiki is being rebuilt from a clean source scaffold. The old implementation archive has been removed after migration audit; the new Pi extension is package-installable, and repo-local CodeWiki dogfooding stays disabled while production readiness is hardened. This checkout uses `.codewiki/kb/**` as design truth while source stabilizes. The current migration inventory and remaining gaps are tracked in [Migration Audit](migration-audit.md).
* [Traces](traces.md) - CodeWiki traces are the durable workflow and state record for software work. One trace represents one accountable change journey from user intent through decision, planning, implementation, runtime coordination, content evidence, and retention.
* [Worktree Isolation](worktree-isolation.md) - The old worktree-isolation workflow is deprecated during the rebuild. Useful ideas should migrate into `src/runtime/**` and `src/git/**` as trace-owned claims, leases, work-unit claim boundaries, budgets, and content-evidence requirements.

## Directories

* [Components](components/) - 5 concepts under `system/components/`.
* [Diagrams](diagrams/) - 1 concept under `system/diagrams/`.
* [Flows](flows/) - 5 concepts under `system/flows/`.
