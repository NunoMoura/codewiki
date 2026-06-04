import { basename, posix } from "node:path";
import { renderPromptAsset } from "../adapters/pi/prompt-assets.ts";

export interface StarterBoundary {
	codePath: string;
	slug: string;
	title: string;
}

export interface StarterBrownfieldHints {
	boundaries: StarterBoundary[];
	repoMarkdownGlobs: string[];
	codeGlobs: string[];
}

export interface StarterTemplateInput {
	projectName: string;
	date: string;
	brownfieldHints?: StarterBrownfieldHints;
}

interface BasicDocTemplateInput {
	projectName: string;
	date: string;
	slug: string;
	title: string;
	summary: string;
}

interface ComponentDocTemplateInput extends BasicDocTemplateInput {
	codePaths: string[];
}

export function starterDirectories(): string[] {
	return [
		".codewiki/research",
		".codewiki/sources",
		".codewiki/builds",
		".codewiki/validation",
		".codewiki/roadmap/tasks",
		".codewiki/session",
		".codewiki/kb/product/users",
		".codewiki/kb/product/stories",
		".codewiki/kb/product/uis",
		".codewiki/kb/system/diagrams",
	];
}

export function starterFiles(
	input: StarterTemplateInput,
): Record<string, string> {
	const projectName = input.projectName.trim() || basename(process.cwd());
	const date = input.date;
	const brownfieldHints = input.brownfieldHints ?? {
		boundaries: [],
		repoMarkdownGlobs: [],
		codeGlobs: [],
	};
	const files: Record<string, string> = {
		".codewiki/config.json": configJson(projectName, date, brownfieldHints),
		".codewiki/sources/.gitkeep": "",
		".codewiki/research/.gitkeep": "",

		".codewiki/kb/lexicon.md": lexiconDoc(projectName, date),
		".codewiki/kb/product/overview.md": productSpecDoc(projectName, date),
		".codewiki/kb/product/users/maintainers.md": productUserDoc({
			projectName,
			date,
			slug: "maintainers",
			title: "Maintainers",
			summary:
				"Human maintainers who need project intent, roadmap state, and implementation evidence close to the repository.",
		}),
		".codewiki/kb/product/users/agents.md": productUserDoc({
			projectName,
			date,
			slug: "agents",
			title: "Pi Agents and Subagents",
			summary:
				"AI agents that use CodeWiki as persistent project memory and fresh-context worker state.",
		}),
		".codewiki/kb/product/stories/intent.md": productStoryDoc({
			projectName,
			date,
			slug: "intent",
			title: "Maintain Fresh Intent",
			summary:
				"Preserve current project intent so future sessions do not rediscover goals from chat history or raw diffs.",
		}),
		".codewiki/kb/product/stories/navigation.md": productStoryDoc({
			projectName,
			date,
			slug: "navigation",
			title: "Navigate With Low Token Cost",
			summary:
				"Start from compact graph-backed state and expand only to exact needed context.",
		}),
		".codewiki/kb/product/uis/terminal.md": productUiDoc({
			projectName,
			date,
			slug: "terminal",
			title: "Pi TUI Diagram Rendering",
			summary:
				"Future Pi TUI ASCII/Unicode rendering for source-backed system diagrams.",
		}),
		".codewiki/kb/product/uis/board.md": productUiDoc({
			projectName,
			date,
			slug: "board",
			title: "Board UI",
			summary:
				"Roadmap, inferred-delta, approvals, and next-action visibility.",
		}),
		".codewiki/kb/product/uis/agent-tools.md": productUiDoc({
			projectName,
			date,
			slug: "agent-tools",
			title: "Agent Tools UI",
			summary: "AI-facing CodeWiki tool expectations.",
		}),
		".codewiki/kb/system/overview.md": systemSpecDoc(
			projectName,
			date,
			brownfieldHints.boundaries,
		),
		".codewiki/kb/system/adapters.md": systemClientDoc({
			projectName,
			date,
			slug: "adapters",
			title: "Adapters",
			summary:
				"Technical distribution boundary for Pi, CLI, TUI, MCP, editor, package API, and future harness clients.",
		}),
		".codewiki/kb/system/api.md": systemClientDoc({
			projectName,
			date,
			slug: "api",
			title: "CodeWiki API",
			summary:
				"Stable semantic operations used by adapters, tools, UI, and future integrations.",
		}),
		".codewiki/kb/system/extension.md": architectureComponentDoc({
			projectName,
			date,
			slug: "extension",
			title: "CodeWiki Extension",
			summary:
				"Pi package extension surface for backend commands, skills, and agent tools.",
			codePaths: [],
		}),
		".codewiki/kb/system/knowledge.md": architectureComponentDoc({
			projectName,
			date,
			slug: "knowledge",
			title: "Canonical Knowledge",
			summary: "Durable product and system truth maintained by agents.",
			codePaths: [".codewiki/kb"],
		}),
		".codewiki/kb/system/graph.md": architectureComponentDoc({
			projectName,
			date,
			slug: "graph",
			title: "Generated Graph",
			summary: "Tool-owned generated graph consumed by agents and UI.",
			codePaths: [".codewiki/index_graph.json"],
		}),
		".codewiki/kb/system/roadmap.md": architectureComponentDoc({
			projectName,
			date,
			slug: "roadmap",
			title: "Roadmap Queue",
			summary:
				"Queue and task truth for active work ordering and closure state.",
			codePaths: [".codewiki/roadmap/queue.json"],
		}),
		".codewiki/kb/system/compilers.md": architectureFlowDoc({
			projectName,
			date,
			slug: "compilers",
			title: "Compiler Flow",
			summary:
				"User intent moves through decision, planning, implementation, and validation boundaries; decision builds replace the old split intent/knowledge handoff.",
		}),
		".codewiki/kb/system/validation-gateway.md": runtimePolicyDoc(
			projectName,
			date,
		),
		".codewiki/roadmap/queue.json": roadmapJson(projectName, date),
	};

	return {
		...files,
		...boundarySpecFiles(projectName, date, brownfieldHints.boundaries),
	};
}

function boundarySpecFiles(
	projectName: string,
	date: string,
	boundaries: StarterBoundary[],
): Record<string, string> {
	return Object.fromEntries(
		boundaries.map((boundary) => {
			const flatSlug = boundary.slug.replaceAll("/", "-");
			return [
				`.codewiki/kb/system/${flatSlug}.md`,
				boundarySpecDoc(projectName, date, boundary),
			];
		}),
	);
}

function configJson(
	projectName: string,
	date: string,
	brownfieldHints: StarterBrownfieldHints,
): string {
	const repoMarkdown = defaultedUniqueStrings(
		brownfieldHints.repoMarkdownGlobs,
		["README.md", "src/**/README.md", "backend/**/README.md"],
	);
	const codeGlobs = defaultedUniqueStrings(brownfieldHints.codeGlobs, [
		"src/**",
		"app/**",
		"backend/**",
		"server/**",
	]);
	const indexTitle = wikiIndexTitle(projectName);

	return (
		JSON.stringify(
			{
				version: 2,
				schema_version: 4,
				project_name: projectName,
				template: {
					name: "codewiki-starter",
					version: 1,
					generated_on: date,
				},
				index_title: indexTitle,
				docs_root: ".codewiki/kb",
				specs_root: ".codewiki/kb",
				research_root: ".codewiki/research",
				roadmap_path: ".codewiki/roadmap/queue.json",
				roadmap_retention: {
					closed_task_limit: 50,
					archive_path: ".codewiki/roadmap/archive.jsonl",
					compress_archive: false,
				},
				meta_root: ".codewiki",
				views_root: ".codewiki/views",
				sources_root: ".codewiki/sources",
				generated_files: [".codewiki/index_graph.json"],
				lint: {
					repo_markdown: repoMarkdown,
					forbidden_headings: [
						"## Purpose",
						"## When To Read",
						"## Content",
						"## Summary",
						"## How To Use This Doc",
					],
					word_count_warn: 1600,
					word_count_exempt: [],
				},
				codewiki: {
					name: `${projectName} codebase wiki`,
					rebuild: {
						quiet: true,
						freshness_check: true,
						debounce_ms: 250,
					},
					agency: {
						level: "task",
						approval_cadence: "task",
						default_scope: { kind: "roadmap" },
						context_reset: {
							enabled: true,
							auto_pickup: true,
							strategy: "soft-first",
							max_resets_per_run: 5,
							require_source_backed_kickoff: true,
							require_idle_boundary: true,
						},
						stop_gates: [
							"semantic_decision",
							"validation_block",
							"artifact_conflict",
							"risk_escalation",
							"publication",
							"destructive_action",
							"unsafe_reset_boundary",
						],
						budgets: {
							default: {
								maxCycles: 3,
								maxWallSeconds: 600,
								maxTokens: 60000,
								maxCostUsd: 3,
								maxWrites: 24,
								maxSessions: 2,
								risk: "medium",
							},
							roadmap: {
								maxCycles: 4,
								maxWallSeconds: 900,
								maxTokens: 90000,
								maxCostUsd: 5,
								maxWrites: 40,
								maxSessions: 3,
								risk: "medium",
							},
							sprint: {
								maxCycles: 3,
								maxWallSeconds: 600,
								maxTokens: 60000,
								maxCostUsd: 3,
								maxWrites: 24,
								maxSessions: 3,
								risk: "medium",
							},
							task: {
								maxCycles: 2,
								maxWallSeconds: 300,
								maxTokens: 25000,
								maxCostUsd: 1,
								maxWrites: 12,
								maxSessions: 1,
								risk: "medium",
							},
						},
						parallelism: {
							max_sessions: 3,
							session_per_sprint: true,
							require_claims: true,
						},
					},
					gc: {
						hot_days: 7,
						warm_days: 30,
						cold_days: 90,
						purge_days: 180,
						sprint_close_hook: true,
					},
					gateway: {
						enabled: true,
						mode: "read-only",
						allow_paths: [
							".codewiki/kb/**",
							".codewiki/roadmap/queue.json",
							".codewiki/roadmap/tasks/**",
							".codewiki/sources/**",
							".codewiki/research/**",
							".codewiki/session/queue.json",
							".codewiki/index_graph.json",
						],
						write_paths: [
							".codewiki/kb/**",
							".codewiki/sources/**",
							".codewiki/research/**",
						],
						generated_readonly_paths: [
							".codewiki/index_graph.json",
							".codewiki/roadmap/tasks/**",
						],
						deny_paths: [
							"**/.env*",
							"**/*secret*",
							".codewiki/sources/private/**",
						],
						network: false,
						max_stdout_bytes: 12000,
						max_read_bytes: 200000,
						max_write_bytes: 50000,
					},
					runtime: {
						adapter: "codewiki-gateway-v1",
						patch_schema: "codewiki.patch.v1",
						future_executor: "think-code",
						notes:
							"codewiki owns .codewiki semantics; generic sandbox execution may be delegated to think-code when available.",
					},
					self_drift_scope: {
						include: [
							".codewiki/kb/**/*.md",
							".codewiki/roadmap/queue.json",
							".codewiki/roadmap/tasks/**",
							".codewiki/sources/**",
							".codewiki/research/**",
						],
						exclude: [],
					},
					code_drift_scope: {
						docs: [".codewiki/kb/**/*.md"],
						repo_docs: repoMarkdown,
						code: codeGlobs,
					},
				},
			},
			null,
			2,
		) + "\n"
	);
}

function defaultedUniqueStrings(
	values: string[],
	defaults: string[],
): string[] {
	if (values.length > 0) return uniqueStrings(values);
	return uniqueStrings(defaults);
}

function wikiIndexTitle(projectName: string): string {
	if (projectName.toLowerCase().endsWith("wiki")) return `${projectName} Index`;
	return `${projectName} Wiki Index`;
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values)].filter(Boolean);
}

function lexiconDoc(projectName: string, date: string): string {
	return [
		"---",
		"id: spec.lexicon",
		"title: Lexicon",
		"state: active",
		`summary: Shared ${projectName} vocabulary for agents, humans, tasks, and generated views.`,
		"owners:",
		"- product",
		"- architecture",
		`updated: '${date}'`,
		"---",
		"",
		"# Lexicon",
		"",
		"## Canonical truth",
		"",
		"Durable project intent that agents may update through approved tools or exact wiki edits.",
		"",
		"## View",
		"",
		"A generated view optimized for agent navigation and UI rendering. Views are consumed by agents but never hand-edited.",
		"",
		"## Canonical/view boundary",
		"",
		"Durable changes flow into canonical truth first, then tools rebuild views. Views must not become hidden sources of truth.",
		"",
		"## Knowledge",
		"",
		"Fresh, current project truth under `.codewiki/kb/**`.",
		"",
		"## Roadmap task",
		"",
		"An atomic tracked delta from current reality to intended knowledge.",
		"",
		"## Evidence",
		"",
		"Compact proof or support for a claim, check, research result, or task closure.",
		"",
		"## Context window",
		"",
		"The active Pi agent session memory. It is volatile RAM and expensive because it is reloaded with each prompt in the session.",
		"",
		"## Surface",
		"",
		"A way humans or AI users interact with the project, such as Pi tools, commands, CLI, TUI, MCP, or package APIs.",
		"",
		"## Related docs",
		"",
		"- [Product](product/overview.md)",
		"- [System Overview](system/overview.md)",
		"",
	].join("\n");
}

function productSpecDoc(projectName: string, date: string): string {
	return [
		"---",
		"id: spec.product",
		"title: Product",
		"state: active",
		`summary: Product intent and navigation for ${projectName}'s users, stories, and UIs.`,
		"owners:",
		"- product",
		`updated: '${date}'`,
		"---",
		"",
		"# Product",
		"",
		`${projectName} keeps repository intent fresh, explicit, and actionable for Pi coding agents and humans. It turns user intent, product decisions, system structure, roadmap tasks, compiler builds, validation reports, and evidence into repo-local memory that agents can maintain and consume efficiently.`,
		"",
		"The product tower owns user-facing intent:",
		"",
		"- `users/**` describes who the project serves.",
		"- `stories/**` describes jobs, outcomes, and acceptance signals.",
		"- `uis/**` describes human and AI-facing interaction expectations.",
		"- [Lexicon](../lexicon.md) defines shared project vocabulary.",
		"",
		"Folders do not need `overview.md` files by default. Add a navigation page only when the folder becomes hard to scan or needs explicit ownership rules.",
		"",
		"## Product boundaries",
		"",
		"Product UI docs describe the experience that humans and agents should have. System client docs describe the technical distribution and adapter mechanisms that deliver those experiences.",
		"",
		"## Success signals",
		"",
		"- User intent is captured before implementation expands.",
		"- Product stories map to roadmap tasks and system components.",
		"- Agents consume compact graph/index state instead of rereading the entire knowledge base.",
		"- Knowledge remains fresh while historical recovery relies on git, session storage, and compact semantic summaries.",
		"",
		"## Related docs",
		"",
		"- [Maintainers](users/maintainers.md)",
		"- [Agents](users/agents.md)",
		"- [Maintain Fresh Intent](stories/intent.md)",
		"- [Low-Token Navigation](stories/navigation.md)",
		"- [Pi TUI Diagram Rendering](uis/terminal.md)",
		"- [Lexicon](../lexicon.md)",
		"",
	].join("\n");
}

function productUserDoc(input: BasicDocTemplateInput): string {
	const { projectName, date, slug, title, summary } = input;
	return [
		"---",
		`id: spec.product.users.${slug}`,
		`title: ${title}`,
		"state: active",
		`summary: ${summary}`,
		"owners:",
		"- product",
		`updated: '${date}'`,
		"---",
		"",
		`# ${title}`,
		"",
		summary,
		"",
		"## Needs",
		"",
		`Describe what this user type needs from ${projectName} and which decisions or evidence make success visible.`,
		"",
		"## Related docs",
		"",
		"- [Product](../overview.md)",
		"",
	].join("\n");
}

function productStoryDoc(input: BasicDocTemplateInput): string {
	const { projectName, date, slug, title, summary } = input;
	return [
		"---",
		`id: spec.product.stories.${slug}`,
		`title: ${title}`,
		"state: active",
		`summary: ${summary}`,
		"owners:",
		"- product",
		`updated: '${date}'`,
		"---",
		"",
		`# ${title}`,
		"",
		summary,
		"",
		"## Acceptance signals",
		"",
		`- ${projectName} makes this outcome visible without requiring raw machine-file inspection.`,
		"- Roadmap tasks or validation reports capture follow-up when the outcome is not satisfied.",
		"",
		"## Related docs",
		"",
		"- [Product](../overview.md)",
		"- [Agents](../users/agents.md)",
		"",
	].join("\n");
}

function productUiDoc(input: BasicDocTemplateInput): string {
	const { projectName, date, slug, title, summary } = input;
	return [
		"---",
		`id: spec.product.uis.${slug}`,
		`title: ${title}`,
		"state: active",
		`summary: ${summary}`,
		"owners:",
		"- product",
		`updated: '${date}'`,
		"---",
		"",
		`# ${title}`,
		"",
		summary,
		"",
		"## Experience contract",
		"",
		`Describe how humans or agents interact with ${projectName} through this UI and which status, decisions, or evidence it should expose.`,
		"",
		"## Related docs",
		"",
		"- [Product](../overview.md)",
		"- [Adapters](../../system/adapters.md)",
		"",
	].join("\n");
}

function systemClientDoc(input: BasicDocTemplateInput): string {
	const { projectName, date, slug, title, summary } = input;
	return [
		"---",
		`id: spec.system.${slug}`,
		`title: ${title}`,
		"state: active",
		`summary: ${summary}`,
		"owners:",
		"- architecture",
		`updated: '${date}'`,
		"code_paths:",
		"- .codewiki/config.json",
		"code_paths_mode: explicit_override",
		"---",
		"",
		`# ${title}`,
		"",
		summary,
		"",
		"## Technical contract",
		"",
		`Describe how this client distributes or adapts ${projectName} while preserving CodeWiki's semantic write boundaries, graph/index contract, compiler builds, and validation reports.`,
		"",
		"## Related docs",
		"",
		"- [System Overview](overview.md)",
		"- [Validation Gateway](validation-gateway.md)",
		"",
	].join("\n");
}

function architectureComponentDoc(input: ComponentDocTemplateInput): string {
	const { date, slug, title, summary, codePaths } = input;
	return [
		"---",
		`id: system.components.${slug}`,
		`title: ${title}`,
		"state: active",
		`summary: ${summary}`,
		"owners:",
		"- architecture",
		`updated: '${date}'`,
		"code_paths:",
		...codePaths.map((path) => `- ${path}`),
		"code_paths_mode: explicit_override",
		"---",
		"",
		`# ${title}`,
		"",
		"## Responsibilities",
		"",
		summary,
		"",
		"## Invariants",
		"",
		"- Canonical changes flow through knowledge, roadmap tasks, or evidence before views are rebuilt.",
		"- Generated views must not be hand-edited.",
		"",
		"## Related docs",
		"",
		"- [System Overview](overview.md)",
		"- [Generated Graph](graph.md)",
		"",
	].join("\n");
}

function architectureFlowDoc(input: BasicDocTemplateInput): string {
	const { date, slug, title, summary } = input;
	return [
		"---",
		`id: system.flows.${slug}`,
		`title: ${title}`,
		"state: active",
		`summary: ${summary}`,
		"owners:",
		"- architecture",
		`updated: '${date}'`,
		"code_paths:",
		"- .codewiki/builds",
		"code_paths_mode: explicit_override",
		"---",
		"",
		`# ${title}`,
		"",
		"## Flow",
		"",
		summary,
		"",
		"## Related docs",
		"",
		"- [System Overview](overview.md)",
		"- [System Overview](overview.md)",
		"",
	].join("\n");
}

function systemSpecDoc(
	projectName: string,
	date: string,
	boundaries: StarterBoundary[],
): string {
	const lines = [
		"---",
		"id: spec.system.overview",
		"title: System Overview",
		"state: active",
		`summary: Main runtime areas and ownership boundaries for ${projectName}.`,
		"owners:",
		"- architecture",
		`updated: '${date}'`,
		"---",
		"",
		"# System Overview",
		"",
		"## Main boundaries",
		"",
		`Map ${projectName} into meaningful ownership areas. Each area should get one canonical overview doc before any deeper split.`,
		"",
		"- product-facing boundary",
		"- runtime or service boundary",
		"- shared or package boundary",
		"",
	];

	lines.push(...inferredBoundaryLines(boundaries));

	lines.push(
		"## Architecture organization rule",
		"",
		"System docs mirror meaningful project ownership, not arbitrary doc categories.",
		"",
		"- one flat system `.md` file per major boundary",
		"- nested system folders are reserved for diagram raw data",
		"- local decisions live inside owning spec, not in a global ADR bucket",
		"",
		"## Brownfield mapping rule",
		"",
		"For existing repos, setup should infer first-pass ownership specs from repo-relative boundaries before humans refine the language and invariants.",
		"",
		"## Path taxonomy",
		"",
		renderPromptAsset("bootstrap/starter-taxonomy.md", { projectName }),
		"",
		"## Related docs",
		"",
		"- [Product](../product/overview.md)",
		"- [Adapters](adapters.md)",
		"",
	);

	return lines.join("\n");
}

function inferredBoundaryLines(boundaries: StarterBoundary[]): string[] {
	if (boundaries.length === 0) return [];
	return [
		"## Inferred brownfield boundaries",
		"",
		"Setup detected these candidate ownership seams from repo structure. Refine, collapse, or rename them if the codebase uses different stable boundaries.",
		"",
		...boundaries.map(inferredBoundaryLine),
		"",
	];
}

function inferredBoundaryLine(boundary: StarterBoundary): string {
	const target = `.codewiki/kb/system/${boundary.slug.replaceAll("/", "-")}.md`;
	return `- [${boundary.title}](${posix.relative(".codewiki/kb/system", target)}) — owns \`${boundary.codePath}\``;
}

function runtimePolicyDoc(projectName: string, date: string): string {
	return [
		"---",
		"id: spec.system.runtime",
		"title: Runtime Policy",
		"state: active",
		`summary: Policy boundary for codewiki runtime access in ${projectName}.`,
		"owners:",
		"- architecture",
		`updated: '${date}'`,
		"code_paths:",
		"- .codewiki/config.json",
		"code_paths_mode: explicit_override",
		"---",
		"",
		"# Runtime Policy",
		"",
		"## Responsibility",
		"",
		"The runtime policy keeps agent-facing wiki operations small, inspectable, and bound to the repo-local `.codewiki/config.json` contract.",
		"",
		"## Split of responsibility",
		"",
		"- `.codewiki/config.json` declares readable paths, direct writable paths, generated read-only paths, byte caps, and runtime adapter metadata.",
		"- Source-owned CodeWiki application APIs own compact reads and validated patch semantics; optional scripts may wrap those APIs for local developer convenience.",
		"- A future `think-code` executor may provide generic sandbox isolation while reusing the same policy and patch schema.",
		"- codewiki owns domain semantics: generated files stay read-only, implementation evidence lives in implementation builds, roadmap/task state goes through canonical mutation APIs, and views are rebuilt after accepted writes.",
		"",
		"## Patch v1",
		"",
		"Patches are JSON objects with `version: 1`, a short `summary`, and an `ops` array. Supported direct ops are exact-text `patch` and `append_jsonl`.",
		"",
		"```json",
		"{",
		'  "version": 1,',
		'  "summary": "Update CodeWiki source support.",',
		'  "ops": [',
		'    { "kind": "patch", "path": ".codewiki/kb/system/overview.md", "oldText": "old exact text", "newText": "new exact text" },',
		'    { "kind": "append_jsonl", "path": ".codewiki/sources/runtime.jsonl", "value": { "summary": "Source support entry" } }',
		"  ]",
		"}",
		"```",
		"",
		"## Related docs",
		"",
		"- [System Overview](overview.md)",
		"- [Product](../product/overview.md)",
		"",
	].join("\n");
}

function boundarySpecDoc(
	projectName: string,
	date: string,
	boundary: StarterBoundary,
): string {
	const docPath = `.codewiki/kb/system/${boundary.slug.replaceAll("/", "-")}.md`;
	const docDir = posix.dirname(docPath);
	const productLink = posix.relative(
		docDir,
		".codewiki/kb/product/overview.md",
	);
	const uiLink = posix.relative(docDir, ".codewiki/kb/product/uis/terminal.md");
	const systemLink = posix.relative(docDir, ".codewiki/kb/system/overview.md");
	const boundaryId = boundary.slug.split("/").join(".");

	return [
		"---",
		`id: spec.${boundaryId}.overview`,
		`title: ${boundary.title}`,
		"state: active",
		`summary: Inferred first-pass ownership boundary for ${boundary.codePath} in ${projectName}.`,
		"owners:",
		"- engineering",
		`updated: '${date}'`,
		"code_paths:",
		`- ${boundary.codePath}`,
		"code_paths_mode: explicit_override",
		"---",
		"",
		`# ${boundary.title}`,
		"",
		"## Boundary intent",
		"",
		`This overview was inferred during setup from the repo structure at \`${boundary.codePath}\`. Replace the starter language with the real responsibilities, invariants, and collaborators for this boundary.`,
		"",
		"## Refinement prompts",
		"",
		"- describe what this boundary owns",
		"- name the upstream and downstream collaborators",
		"- record invariants that should remain stable even as implementation details change",
		"- collapse or split this spec only when the codebase has a real ownership seam",
		"",
		"## Related docs",
		"",
		`- [Product](${productLink})`,
		`- [Product UI](${uiLink})`,
		`- [System Overview](${systemLink})`,
		"",
	].join("\n");
}

function roadmapJson(projectName: string, date: string): string {
	return (
		JSON.stringify(
			{
				version: 2,
				updated: date,
				order: ["TASK-001", "TASK-002", "TASK-003"],
				sprints: {
					"SPRINT-001": {
						id: "SPRINT-001",
						title: "Foundation",
						status: "active",
						outcome:
							"Project intent, ownership, and roadmap truth become usable by agents and humans.",
						task_ids: ["TASK-001", "TASK-002", "TASK-003"],
						scope: { knowledge: [".codewiki/kb/**"], code: [] },
						budget: {
							maxCycles: 3,
							maxWallSeconds: 600,
							maxTokens: 60000,
							maxCostUsd: 3,
							maxWrites: 24,
							maxSessions: 2,
							risk: "medium",
						},
						gates: ["validation", "checkpoint"],
						created: date,
						updated: date,
					},
				},
				tasks: {
					"TASK-001": {
						id: "TASK-001",
						title: "Lock product intent in specs",
						status: "todo",
						priority: "high",
						kind: "docs",
						summary: `Turn ${projectName} intent into explicit product and system docs.`,
						spec_paths: [
							".codewiki/kb/lexicon.md",
							".codewiki/kb/product/overview.md",
							".codewiki/kb/product/users/maintainers.md",
							".codewiki/kb/product/users/agents.md",
							".codewiki/kb/product/stories/intent.md",
							".codewiki/kb/product/uis/terminal.md",
							".codewiki/kb/system/overview.md",
						],
						code_paths: [],
						research_ids: [],
						labels: ["foundation", "specs"],
						goal: {
							outcome:
								"Project intent and ownership boundaries are explicit enough to guide implementation.",
							acceptance: [
								"Foundational specs describe desired outcomes and major constraints.",
								"At least one roadmap task links back to those specs.",
							],
							non_goals: [
								"Document every implementation detail before the project has real seams.",
							],
							verification: [
								"Review starter specs for project-specific intent and ownership coverage.",
								"Run the rebuild command after replacing placeholders.",
							],
						},
						delta: {
							desired:
								"Product intent and architecture boundaries are explicit and stable.",
							current: "Starter docs need project-specific content.",
							closure:
								"Replace placeholders with concrete intended behavior and ownership boundaries.",
						},
						created: date,
						updated: date,
					},
					"TASK-002": {
						id: "TASK-002",
						title: "Map code ownership into spec hierarchy",
						status: "todo",
						priority: "high",
						kind: "architecture",
						summary:
							"Refine the inferred boundary docs until wiki/system mirrors the repo's real ownership seams without creating doc sprawl.",
						spec_paths: [".codewiki/kb/system/overview.md"],
						code_paths: [],
						research_ids: [],
						labels: ["brownfield", "mapping"],
						goal: {
							outcome:
								"wiki/system reflects real stable ownership seams in the repo.",
							acceptance: [
								"Each meaningful code area maps to one canonical owning spec.",
								"Unnecessary inferred boundaries are removed or collapsed.",
							],
							non_goals: [
								"Create a spec for every folder regardless of architectural value.",
							],
							verification: [
								"Review inferred boundary docs against actual repo structure.",
								"Run rebuild and inspect mapping/drift output.",
							],
						},
						delta: {
							desired:
								"Each meaningful layer or component has one canonical owning spec.",
							current:
								"Setup can infer first-pass boundaries, but humans still need to confirm or reshape them.",
							closure:
								"Add, remove, or rewrite inferred spec folders until they match real stable ownership seams.",
						},
						created: date,
						updated: date,
					},
					"TASK-003": {
						id: "TASK-003",
						title: "Keep roadmap as freshest delta log",
						status: "todo",
						priority: "medium",
						kind: "process",
						summary:
							"Move drift and plan tracking into structured roadmap tasks instead of separate prose buckets.",
						spec_paths: [".codewiki/kb/product/uis/board.md"],
						code_paths: [],
						research_ids: [],
						labels: ["roadmap", "process"],
						goal: {
							outcome:
								"Tracked delta lives in roadmap tasks instead of scattered prose.",
							acceptance: [
								"Active implementation gaps are represented by roadmap tasks.",
								"Users can resume task work from Pi surfaces without editing roadmap JSON manually.",
							],
							non_goals: [
								"Maintain separate plan and drift documents for the same live work.",
							],
							verification: [
								"Inspect generated roadmap view after rebuild.",
								"Confirm roadmap tasks cover current active delta.",
							],
						},
						delta: {
							desired:
								"Roadmap is single current queue for closing docs-to-code gaps.",
							current:
								"Teams often spread gaps across plans, drift notes, and chat.",
							closure:
								"Convert each active mismatch or sequence into a scoped roadmap task.",
						},
						created: date,
						updated: date,
					},
				},
			},
			null,
			2,
		) + "\n"
	);
}
