import { basename, posix } from "node:path";

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

export function starterDirectories(): string[] {
	return [
		".wiki/evidence",
		".wiki/knowledge/product",
		".wiki/knowledge/clients/surfaces",
		".wiki/knowledge/system",
		".wiki/sources",
		"scripts",
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
		".wiki/config.json": configJson(projectName, date, brownfieldHints),
		".wiki/events.jsonl": bootstrapEvent(projectName),
		".wiki/sources/.gitkeep": "",
		"scripts/rebuild_docs_meta.py": rebuildScript(),
		".wiki/knowledge/product/overview.md": productSpecDoc(projectName, date),
		".wiki/knowledge/clients/overview.md": uxOverviewDoc(projectName, date),
		".wiki/knowledge/clients/surfaces/roadmap.md": uxRoadmapSurfaceDoc(
			projectName,
			date,
		),
		".wiki/knowledge/clients/surfaces/status-panel.md": uxStatusPanelDoc(
			projectName,
			date,
		),
		".wiki/knowledge/system/overview.md": systemSpecDoc(
			projectName,
			date,
			brownfieldHints.boundaries,
		),
		".wiki/knowledge/system/runtime/overview.md": runtimePolicyDoc(
			projectName,
			date,
		),
		".wiki/evidence/inspiration.jsonl": researchJsonl(projectName, date),
		".wiki/roadmap.json": roadmapJson(projectName, date),
	};

	for (const boundary of brownfieldHints.boundaries) {
		files[`.wiki/knowledge/system/${boundary.slug}/overview.md`] =
			boundarySpecDoc(projectName, date, boundary);
	}

	return files;
}

function configJson(
	projectName: string,
	date: string,
	brownfieldHints: StarterBrownfieldHints,
): string {
	const repoMarkdown = uniqueStrings(
		brownfieldHints.repoMarkdownGlobs.length
			? brownfieldHints.repoMarkdownGlobs
			: ["README.md", "src/**/README.md", "backend/**/README.md"],
	);
	const codeGlobs = uniqueStrings(
		brownfieldHints.codeGlobs.length
			? brownfieldHints.codeGlobs
			: ["src/**", "app/**", "backend/**", "server/**"],
	);
	const indexTitle = projectName.toLowerCase().endsWith("wiki")
		? `${projectName} Index`
		: `${projectName} Wiki Index`;

	return (
		JSON.stringify(
			{
				version: 2,
				project_name: projectName,
				template: {
					name: "codewiki-starter",
					version: 1,
					generated_on: date,
				},
				index_title: indexTitle,
				docs_root: ".wiki/knowledge",
				specs_root: ".wiki/knowledge",
				evidence_root: ".wiki/evidence",
				roadmap_path: ".wiki/roadmap.json",
				roadmap_events_path: ".wiki/roadmap-events.jsonl",
				roadmap_retention: {
					closed_task_limit: 50,
					archive_path: ".wiki/roadmap-archive.jsonl",
					compress_archive: false,
				},
				meta_root: ".wiki",
				sources_root: ".wiki/sources",
				generated_files: [
					".wiki/graph.json",
					".wiki/lint.json",
					".wiki/roadmap-state.json",
					".wiki/status-state.json",
				],
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
					rebuild_command: ["python", "scripts/rebuild_docs_meta.py"],
					gateway: {
						enabled: true,
						mode: "read-only",
						allow_paths: [
							".wiki/knowledge/**",
							".wiki/roadmap/tasks/**",
							".wiki/evidence/**",
							".wiki/graph.json",
							".wiki/status-state.json",
							".wiki/roadmap-state.json",
							".wiki/roadmap.json",
							".wiki/roadmap-events.jsonl",
							".wiki/events.jsonl",
						],
						write_paths: [".wiki/knowledge/**", ".wiki/evidence/**"],
						generated_readonly_paths: [
							".wiki/graph.json",
							".wiki/lint.json",
							".wiki/status-state.json",
							".wiki/roadmap-state.json",
							".wiki/roadmap/**",
						],
						deny_paths: ["**/.env*", "**/*secret*", ".wiki/sources/private/**"],
						network: false,
						max_stdout_bytes: 12000,
						max_read_bytes: 200000,
						max_write_bytes: 50000,
					},
					runtime: {
						adapter: "codewiki-gateway-v1",
						transaction_schema: "codewiki.transaction.v1",
						future_executor: "think-code",
						notes:
							"codewiki owns .wiki semantics; generic sandbox execution may be delegated to think-code when available.",
					},
					self_drift_scope: {
						include: [
							".wiki/knowledge/**/*.md",
							".wiki/roadmap.json",
							".wiki/evidence/**",
						],
						exclude: [],
					},
					code_drift_scope: {
						docs: [".wiki/knowledge/**/*.md"],
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

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values)].filter(Boolean);
}

function bootstrapEvent(projectName: string): string {
	return (
		JSON.stringify({
			ts: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
			kind: "bootstrap",
			title: "Bootstrapped simplified codebase wiki",
			summary: `Created starter intent-first wiki and machine-managed .wiki contract for ${projectName}.`,
		}) + "\n"
	);
}

function productSpecDoc(projectName: string, date: string): string {
	return [
		"---",
		"id: spec.product",
		"title: Product",
		"state: active",
		`summary: Product intent, users, and value boundaries for ${projectName}.`,
		"owners:",
		"- product",
		`updated: '${date}'`,
		"---",
		"",
		"# Product",
		"",
		`## Intent`,
		"",
		`Describe what ${projectName} exists to do, who it serves, and which user outcomes matter most.`,
		"",
		"## Users",
		"",
		"- primary users",
		"- operator or maintainer users",
		"- agent workflows that depend on this project",
		"",
		"## Success criteria",
		"",
		"- user intent is explicit before implementation expands",
		"- architecture and client surfaces stay grounded in product goals",
		"- roadmap reflects approved delta from intent to current code",
		"- Pi sessions can resume task work cleanly because sessions link back to roadmap tasks",
		"",
		"## Goal quality rule",
		"",
		"Each foundational spec should define clear goals, success signals, non-goals, and verification expectations so drift can be measured instead of guessed.",
		"",
		"## Non-goals",
		"",
		"- duplicated narrative across many docs",
		"- stale historical buckets mixed with live design",
		"- manual roadmap bookkeeping as the primary user workflow",
		"",
		"## Related docs",
		"",
		"- [Clients Overview](../clients/overview.md)",
		"- [System Overview](../system/overview.md)",
		"",
	].join("\n");
}

function uxOverviewDoc(projectName: string, date: string): string {
	return [
		"---",
		"id: spec.clients.overview",
		"title: Clients Overview",
		"state: active",
		`summary: User-facing workflow and status-surface expectations for ${projectName}.`,
		"owners:",
		"- design",
		`updated: '${date}'`,
		"---",
		"",
		"# Clients Overview",
		"",
		"## Core experience",
		"",
		`Describe how users author intent in ${projectName}, how the system validates that intent, and how Pi should surface next actions without forcing users into raw machine files.`,
		"",
		"## Primary flows",
		"",
		"- shape product intent before code drifts too far",
		"- define client flows and surfaces that explain expected user interaction",
		"- inspect evidence and inferred delta inside Pi",
		"- approve tracked work into roadmap state",
		"- resume implementation from tracked roadmap focus",
		"",
		"## Goal quality rule",
		"",
		"Client specs should describe not only desired behavior, but also how success will be recognized, which behavior is out of scope, and what evidence should be reviewed before work is considered done.",
		"",
		"## Surface rules",
		"",
		"- keep canonical knowledge under `.wiki/knowledge/`",
		"- keep machine-managed sources, roadmap, evidence, graph, and views under `.wiki/`",
		"- make `Alt+W` the primary control room for status, inferred delta, and tracked work",
		"- keep the optional summary line short enough to coexist with other Pi extension statuses",
		"",
		"## Related docs",
		"",
		"- [Product](../product/overview.md)",
		"- [Roadmap Surface](surfaces/roadmap.md)",
		"- [Status Panel](surfaces/status-panel.md)",
		"- [System Overview](../system/overview.md)",
		"",
	].join("\n");
}

function uxRoadmapSurfaceDoc(projectName: string, date: string): string {
	return [
		"---",
		"id: spec.ux.surface.roadmap",
		"title: Roadmap Surface",
		"state: active",
		`summary: TUI-first roadmap and inferred-delta experience for ${projectName}.`,
		"owners:",
		"- design",
		`updated: '${date}'`,
		"---",
		"",
		"# Roadmap Surface",
		"",
		"## Intent",
		"",
		`Describe how ${projectName} should surface tracked work, inferred work, approvals, and next action inside Pi before users ever inspect raw machine state files.`,
		"",
		"## Related docs",
		"",
		"- [Clients Overview](../overview.md)",
		"- [Status Panel](status-panel.md)",
		"- [System Overview](../../system/overview.md)",
		"",
	].join("\n");
}

function uxStatusPanelDoc(projectName: string, date: string): string {
	return [
		"---",
		"id: spec.ux.surface.status-panel",
		"title: Status Panel",
		"state: active",
		`summary: Compact status-line and panel rules for ${projectName}.`,
		"owners:",
		"- design",
		`updated: '${date}'`,
		"---",
		"",
		"# Status Panel",
		"",
		"## Intent",
		"",
		`Describe how ${projectName} should summarize health, focus, and next action in a panel-first flow while keeping the optional one-line summary short enough to coexist with other Pi extensions.`,
		"",
		"## Related docs",
		"",
		"- [Clients Overview](../overview.md)",
		"- [Roadmap Surface](roadmap.md)",
		"- [System Overview](../../system/overview.md)",
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

	if (boundaries.length) {
		lines.push(
			"## Inferred brownfield boundaries",
			"",
			"Setup detected these candidate ownership seams from repo structure. Refine, collapse, or rename them if the codebase uses different stable boundaries.",
			"",
		);
		for (const boundary of boundaries) {
			const target = `.wiki/knowledge/system/${boundary.slug}/overview.md`;
			lines.push(
				`- [${boundary.title}](${posix.relative(".wiki/knowledge/system", target)}) — owns \`${boundary.codePath}\``,
			);
		}
		lines.push("");
	}

	lines.push(
		"## Architecture organization rule",
		"",
		"System docs mirror meaningful project hierarchy, not arbitrary doc categories.",
		"",
		"- one folder per real boundary when needed",
		"- one canonical `overview.md` per boundary",
		"- local decisions live inside owning spec, not in a global ADR bucket",
		"",
		"## Brownfield mapping rule",
		"",
		"For existing repos, setup should infer first-pass ownership specs from repo-relative boundaries before humans refine the language and invariants.",
		"",
		"## Related docs",
		"",
		"- [Product](../product/overview.md)",
		"- [Clients Overview](../clients/overview.md)",
		"",
	);

	return lines.join("\n");
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
		"---",
		"",
		"# Runtime Policy",
		"",
		"## Responsibility",
		"",
		"The runtime policy keeps agent-facing wiki operations small, inspectable, and bound to the repo-local `.wiki/config.json` contract.",
		"",
		"## Split of responsibility",
		"",
		"- `.wiki/config.json` declares readable paths, direct writable paths, generated read-only paths, byte caps, and runtime adapter metadata.",
		"- `scripts/codewiki-gateway.mjs` is the current adapter for compact reads and validated transaction application.",
		"- A future `think-code` executor may provide generic sandbox isolation while reusing the same policy and transaction schema.",
		"- codewiki owns domain semantics: generated files stay read-only, evidence is append-only, roadmap/task state goes through canonical mutation APIs, and generated state is rebuilt after accepted writes.",
		"",
		"## Transaction v1",
		"",
		"Transactions are JSON objects with `version: 1`, a short `summary`, and an `ops` array. Supported direct ops are exact-text `patch` and `append_jsonl`.",
		"",
		"```json",
		"{",
		'  "version": 1,',
		'  "summary": "Update wiki evidence.",',
		'  "ops": [',
		'    { "kind": "patch", "path": ".wiki/knowledge/system/overview.md", "oldText": "old exact text", "newText": "new exact text" },',
		'    { "kind": "append_jsonl", "path": ".wiki/evidence/runtime.jsonl", "value": { "summary": "Evidence entry" } }',
		"  ]",
		"}",
		"```",
		"",
		"## Related docs",
		"",
		"- [System Overview](../overview.md)",
		"- [Product](../../product/overview.md)",
		"",
	].join("\n");
}

function boundarySpecDoc(
	projectName: string,
	date: string,
	boundary: StarterBoundary,
): string {
	const docPath = `.wiki/knowledge/system/${boundary.slug}/overview.md`;
	const docDir = posix.dirname(docPath);
	const productLink = posix.relative(
		docDir,
		".wiki/knowledge/product/overview.md",
	);
	const uxLink = posix.relative(docDir, ".wiki/knowledge/clients/overview.md");
	const systemLink = posix.relative(
		docDir,
		".wiki/knowledge/system/overview.md",
	);
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
		`- [Clients Overview](${uxLink})`,
		`- [System Overview](${systemLink})`,
		"",
	].join("\n");
}

function researchJsonl(projectName: string, date: string): string {
	return (
		[
			JSON.stringify({
				id: "RES-001",
				title: `Initial documentation pattern note for ${projectName}`,
				summary:
					"Replace this seed with real external evidence or implementation findings.",
				web_link: "https://example.com",
				source_type: "bootstrap",
				tags: ["seed"],
				created: date,
				updated: date,
			}),
		].join("\n") + "\n"
	);
}

function roadmapJson(projectName: string, date: string): string {
	return (
		JSON.stringify(
			{
				version: 1,
				updated: date,
				order: ["TASK-001", "TASK-002", "TASK-003"],
				tasks: {
					"TASK-001": {
						id: "TASK-001",
						title: "Lock product intent in specs",
						status: "todo",
						priority: "high",
						kind: "docs",
						summary: `Turn ${projectName} intent into explicit product and system docs.`,
						spec_paths: [
							".wiki/knowledge/product/overview.md",
							".wiki/knowledge/system/overview.md",
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
						spec_paths: [".wiki/knowledge/system/overview.md"],
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
						spec_paths: [".wiki/knowledge/clients/overview.md"],
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

function rebuildScript(): string {
	return '#!/usr/bin/env python3\nfrom __future__ import annotations\n\nimport gzip\nimport hashlib\nimport json\nimport os\nimport re\nimport subprocess\nfrom collections import Counter\nfrom datetime import datetime, timezone\nfrom pathlib import Path\nfrom typing import Any, cast\n\nimport yaml\n\nROOT = Path(__file__).resolve().parents[1]\nCONFIG_PATH = ROOT / ".wiki" / "config.json"\n\nDEFAULT_FORBIDDEN_HEADINGS = {\n    "## Purpose",\n    "## When To Read",\n    "## Content",\n    "## Summary",\n    "## How To Use This Doc",\n}\nDEFAULT_WORD_COUNT_WARN = 1600\nDEFAULT_WORD_COUNT_EXEMPT = set()\nDEFAULT_REPO_MARKDOWN_PATTERNS = [\n    "README.md",\n    "src/**/README.md",\n    "backend/**/README.md",\n]\nDEFAULT_REQUIRED_FIELDS = ["id", "title", "state", "summary", "owners", "updated"]\nDEFAULT_STATE_BY_TYPE = {\n    "spec": "active",\n    "roadmap": "active",\n}\nLINK_RE = re.compile(r"(?<!!)\\[[^\\]]+\\]\\(([^)]+)\\)")\nH1_RE = re.compile(r"^#\\s+(.+)$", re.MULTILINE)\nBACKTICK_DOC_PATH_RE = re.compile(r"\\`((?:\\.\\.?/)*(?:wiki|\\.wiki/knowledge)/[^\\`\\s]+)\\`")\n\n\ndef load_config() -> dict[str, Any]:\n    if not CONFIG_PATH.exists():\n        return {}\n    data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))\n    return data if isinstance(data, dict) else {}\n\n\ndef maybe_str_list(value: Any) -> list[str] | None:\n    if not isinstance(value, list):\n        return None\n    return [str(item) for item in value]\n\n\ndef maybe_dict(value: Any) -> dict[str, Any] | None:\n    return value if isinstance(value, dict) else None\n\n\nCONFIG = load_config()\nLINT_CONFIG = maybe_dict(CONFIG.get("lint")) or {}\nPROJECT_NAME = str(CONFIG.get("project_name", ROOT.name))\nDOCS_ROOT_VALUE = str(CONFIG.get("docs_root", ".wiki/knowledge")).strip().strip("/") or ".wiki/knowledge"\nSPECS_ROOT_VALUE = str(CONFIG.get("specs_root", DOCS_ROOT_VALUE)).strip().strip("/") or DOCS_ROOT_VALUE\nDOCS_ROOT = ROOT / DOCS_ROOT_VALUE\nSPECS_ROOT = ROOT / SPECS_ROOT_VALUE\nRESEARCH_ROOT = ROOT / str(CONFIG.get("evidence_root", CONFIG.get("research_root", ".wiki/evidence")))\nROADMAP_PATH = ROOT / str(CONFIG.get("roadmap_path", ".wiki/roadmap.json"))\nROADMAP_EVENTS_PATH = ROOT / str(CONFIG.get("roadmap_events_path", ".wiki/roadmap-events.jsonl"))\nROADMAP_RETENTION_CONFIG = maybe_dict(CONFIG.get("roadmap_retention")) or {}\nCLOSED_TASK_RETENTION_LIMIT = max(0, int(ROADMAP_RETENTION_CONFIG.get("closed_task_limit", 50)))\nROADMAP_ARCHIVE_PATH = ROOT / str(ROADMAP_RETENTION_CONFIG.get("archive_path", ".wiki/roadmap-archive.jsonl"))\nROADMAP_ARCHIVE_COMPRESSED = bool(ROADMAP_RETENTION_CONFIG.get("compress_archive", False))\nif ROADMAP_ARCHIVE_COMPRESSED and ROADMAP_ARCHIVE_PATH.suffix != ".gz":\n    ROADMAP_ARCHIVE_PATH = ROADMAP_ARCHIVE_PATH.with_suffix(ROADMAP_ARCHIVE_PATH.suffix + ".gz")\nMETA_ROOT = ROOT / str(CONFIG.get("meta_root", ".wiki"))\nROADMAP_STATE_PATH = META_ROOT / "roadmap-state.json"\nSTATUS_STATE_PATH = META_ROOT / "status-state.json"\nROADMAP_FOLDER_PATH = META_ROOT / "roadmap"\nROADMAP_TASKS_PATH = ROADMAP_FOLDER_PATH / "tasks"\n\ndef optional_output_path(config_key: str) -> Path | None:\n    value = CONFIG.get(config_key)\n    if not isinstance(value, str) or not value.strip():\n        return None\n    return ROOT / value.strip().strip("/")\n\nROADMAP_DOC_PATH = optional_output_path("roadmap_doc_path")\nINDEX_PATH = optional_output_path("index_path")\nDEFAULT_INDEX_TITLE = f"{PROJECT_NAME} Index" if PROJECT_NAME.lower().endswith("wiki") else f"{PROJECT_NAME} Wiki Index"\nINDEX_TITLE = str(CONFIG.get("index_title", DEFAULT_INDEX_TITLE))\nFORBIDDEN_HEADINGS = set(maybe_str_list(LINT_CONFIG.get("forbidden_headings")) or sorted(DEFAULT_FORBIDDEN_HEADINGS))\nWORD_COUNT_WARN = int(LINT_CONFIG.get("word_count_warn", DEFAULT_WORD_COUNT_WARN))\nWORD_COUNT_EXEMPT = set(maybe_str_list(LINT_CONFIG.get("word_count_exempt")) or sorted(DEFAULT_WORD_COUNT_EXEMPT))\nREPO_MARKDOWN_PATTERNS = maybe_str_list(LINT_CONFIG.get("repo_markdown")) or DEFAULT_REPO_MARKDOWN_PATTERNS\nPRODUCT_SPEC_PREFIX = f"{SPECS_ROOT_VALUE}/product/"\nSYSTEM_SPEC_PREFIX = f"{SPECS_ROOT_VALUE}/system/"\nCLIENTS_SPEC_PREFIXES = [prefix for prefix in [f"{SPECS_ROOT_VALUE}/clients/", f"{SPECS_ROOT_VALUE}/ux/"] if prefix]\nPRIMARY_CLIENTS_SPEC_PREFIX = CLIENTS_SPEC_PREFIXES[0] if CLIENTS_SPEC_PREFIXES else f"{SPECS_ROOT_VALUE}/clients/"\n\n\ndef now_iso() -> str:\n    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")\n\n\ndef sha256_text(text: str) -> str:\n    return hashlib.sha256(text.encode("utf-8")).hexdigest()\n\n\ndef canonical_digest(value: Any) -> str:\n    return sha256_text(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False))\n\n\ndef git_output(args: list[str]) -> str:\n    try:\n        return subprocess.check_output(["git", *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()\n    except (subprocess.CalledProcessError, FileNotFoundError):\n        return ""\n\n\ndef git_head_commit() -> str:\n    return git_output(["rev-parse", "HEAD"])\n\n\ndef git_path_commit(path: str) -> str:\n    return git_output(["log", "-1", "--format=%H", "--", path])\n\n\ndef git_status_paths() -> list[str]:\n    raw = git_output(["status", "--porcelain", "--untracked-files=no"])\n    paths: list[str] = []\n    for line in raw.splitlines():\n        if len(line) < 4:\n            continue\n        path = line[3:].strip()\n        if " -> " in path:\n            path = path.rsplit(" -> ", 1)[-1].strip()\n        if path:\n            paths.append(path)\n    return sorted(set(paths))\n\n\ndef git_anchor(paths: list[str] | None = None) -> dict[str, Any]:\n    scoped_paths = sorted(set([str(path).strip() for path in paths or [] if str(path).strip()]))\n    dirty_paths = git_status_paths()\n    scoped_dirty = [path for path in dirty_paths if not scoped_paths or path in scoped_paths or any(path.startswith(f"{prefix.rstrip(\'/\')}/") for prefix in scoped_paths)]\n    commits = {path: git_path_commit(path) for path in scoped_paths if (ROOT / path).exists()}\n    return {\n        "head": git_head_commit(),\n        "dirty": bool(scoped_dirty),\n        "dirty_paths": scoped_dirty[:50],\n        "paths": commits,\n    }\n\n\ndef semantic_doc_revision(doc: dict[str, Any]) -> dict[str, Any]:\n    frontmatter = dict(doc.get("frontmatter", {}) if isinstance(doc.get("frontmatter"), dict) else {})\n    frontmatter.pop("updated", None)\n    payload = {\n        "frontmatter": frontmatter,\n        "body": str(doc.get("body", "")).strip().replace("\\r\\n", "\\n"),\n    }\n    return {\n        "digest": canonical_digest(payload),\n        "git": git_anchor([str(doc.get("path", "")).strip()]),\n    }\n\n\ndef task_revision(task: dict[str, Any]) -> dict[str, Any]:\n    payload = {\n        key: task.get(key)\n        for key in ["id", "title", "status", "priority", "kind", "summary", "labels", "goal", "spec_paths", "code_paths", "research_ids", "delta"]\n    }\n    return {"digest": canonical_digest(payload)}\n\n\ndef load_previous_status_state() -> dict[str, Any]:\n    if not STATUS_STATE_PATH.exists():\n        return {}\n    try:\n        data = json.loads(STATUS_STATE_PATH.read_text(encoding="utf-8"))\n    except json.JSONDecodeError:\n        return {}\n    return data if isinstance(data, dict) else {}\n\n\ndef split_frontmatter(text: str) -> tuple[dict[str, Any], str]:\n    if not text.startswith("---\\n"):\n        return {}, text\n    end = text.find("\\n---\\n", 4)\n    if end == -1:\n        return {}, text\n    raw = text[4:end]\n    body = text[end + 5 :]\n    loaded = yaml.safe_load(raw) or {}\n    data: dict[str, Any] = loaded if isinstance(loaded, dict) else {}\n    return data, body\n\n\ndef extract_title(path: Path, body: str, frontmatter: dict[str, Any]) -> str:\n    if isinstance(frontmatter.get("title"), str) and frontmatter["title"].strip():\n        return frontmatter["title"].strip()\n    match = H1_RE.search(body)\n    if match:\n        return match.group(1).strip()\n    stem = path.stem.replace("-", " ").replace("_", " ").strip()\n    return stem.title() if stem else path.name\n\n\ndef classify_doc(path: Path) -> str:\n    if ROADMAP_DOC_PATH is not None and path == ROADMAP_DOC_PATH:\n        return "roadmap"\n    if path.is_relative_to(SPECS_ROOT):\n        return "spec"\n    return "doc"\n\n\ndef markdown_doc_files() -> list[Path]:\n    generated_outputs = {path for path in [INDEX_PATH, ROADMAP_DOC_PATH] if path is not None}\n    files: list[Path] = []\n    if SPECS_ROOT.exists():\n        for path in sorted(SPECS_ROOT.rglob("*.md")):\n            if path in generated_outputs:\n                continue\n            if path.is_relative_to(SPECS_ROOT / "_templates"):\n                continue\n            files.append(path)\n    if ROADMAP_DOC_PATH is not None and ROADMAP_DOC_PATH.exists():\n        files.append(ROADMAP_DOC_PATH)\n    return files\n\n\ndef read_jsonl(path: Path) -> list[dict[str, Any]]:\n    if not path.exists():\n        return []\n    items: list[dict[str, Any]] = []\n    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):\n        line = raw_line.strip()\n        if not line:\n            continue\n        try:\n            data = json.loads(line)\n        except json.JSONDecodeError as exc:\n            raise ValueError(f"{path.relative_to(ROOT).as_posix()}:{line_number} invalid JSON: {exc}") from exc\n        if not isinstance(data, dict):\n            raise ValueError(f"{path.relative_to(ROOT).as_posix()}:{line_number} is not a JSON object")\n        items.append(data)\n    return items\n\n\ndef read_roadmap_file(path: Path) -> dict[str, Any]:\n    if not path.exists():\n        return {"version": 1, "updated": now_iso(), "order": [], "tasks": {}}\n    data = json.loads(path.read_text(encoding="utf-8"))\n    if not isinstance(data, dict):\n        raise ValueError(f"{path.relative_to(ROOT).as_posix()} is not a JSON object")\n    tasks = data.get("tasks") if isinstance(data.get("tasks"), dict) else {}\n    order = [str(item) for item in data.get("order", []) if str(item).strip()] if isinstance(data.get("order"), list) else []\n    return {\n        "version": int(data.get("version", 1)),\n        "updated": str(data.get("updated", now_iso())),\n        "order": order,\n        "tasks": tasks,\n    }\n\n\ndef closed_task_sort_key(task_id: str, task: dict[str, Any]) -> tuple[str, str, str]:\n    return (\n        str(task.get("updated", "")),\n        str(task.get("created", "")),\n        task_id,\n    )\n\n\ndef archive_existing_task_ids(path: Path) -> set[str]:\n    if not path.exists():\n        return set()\n    opener = gzip.open if path.suffix == ".gz" else open\n    result: set[str] = set()\n    with opener(path, "rt", encoding="utf-8") as handle:\n        for raw in handle:\n            line = raw.strip()\n            if not line:\n                continue\n            try:\n                record = json.loads(line)\n            except json.JSONDecodeError:\n                continue\n            task = record.get("task") if isinstance(record, dict) else None\n            task_id = task.get("id") if isinstance(task, dict) else None\n            if isinstance(task_id, str) and task_id.strip():\n                result.add(task_id.strip())\n    return result\n\n\ndef append_archived_tasks(path: Path, records: list[dict[str, Any]]) -> None:\n    if not records:\n        return\n    path.parent.mkdir(parents=True, exist_ok=True)\n    opener = gzip.open if path.suffix == ".gz" else open\n    with opener(path, "at", encoding="utf-8") as handle:\n        for record in records:\n            handle.write(json.dumps(record, separators=(",", ":"), sort_keys=False) + "\\n")\n\n\ndef compact_roadmap_hot_set(roadmap: dict[str, Any]) -> bool:\n    tasks_raw = roadmap.get("tasks")\n    tasks: dict[str, Any] = tasks_raw if isinstance(tasks_raw, dict) else {}\n    order_raw = roadmap.get("order")\n    order_values = order_raw if isinstance(order_raw, list) else []\n    order = [str(task_id) for task_id in order_values if str(task_id) in tasks]\n    closed_ids = [task_id for task_id in order if is_closed_task_status(tasks[task_id].get("status"))]\n    if len(closed_ids) <= CLOSED_TASK_RETENTION_LIMIT:\n        return False\n    keep_closed = set(sorted(closed_ids, key=lambda task_id: closed_task_sort_key(task_id, tasks[task_id]), reverse=True)[:CLOSED_TASK_RETENTION_LIMIT])\n    archive_ids = [task_id for task_id in closed_ids if task_id not in keep_closed]\n    existing_archive_ids = archive_existing_task_ids(ROADMAP_ARCHIVE_PATH)\n    archived_at = now_iso()\n    archive_records = [\n        {\n            "archived_at": archived_at,\n            "reason": "closed_task_retention",\n            "task": tasks[task_id],\n        }\n        for task_id in archive_ids\n        if task_id not in existing_archive_ids\n    ]\n    append_archived_tasks(ROADMAP_ARCHIVE_PATH, archive_records)\n    for task_id in archive_ids:\n        tasks.pop(task_id, None)\n    roadmap["order"] = [task_id for task_id in order if task_id not in set(archive_ids)]\n    roadmap["tasks"] = tasks\n    roadmap["updated"] = archived_at\n    return True\n\n\ndef roadmap_entries(roadmap: dict[str, Any]) -> list[dict[str, Any]]:\n    tasks = roadmap.get("tasks", {}) if isinstance(roadmap.get("tasks"), dict) else {}\n    order = roadmap.get("order", []) if isinstance(roadmap.get("order"), list) else []\n    result: list[dict[str, Any]] = []\n    seen: set[str] = set()\n    for task_id in order:\n        key = str(task_id)\n        task = tasks.get(key)\n        if isinstance(task, dict):\n            result.append(task)\n            seen.add(key)\n    for key in sorted(tasks.keys()):\n        if key in seen:\n            continue\n        task = tasks.get(key)\n        if isinstance(task, dict):\n            result.append(task)\n    return result\n\n\ndef normalize_local_link(source_rel: Path, target: str) -> str | None:\n    target_path = (ROOT / source_rel.parent / target).resolve()\n    try:\n        return target_path.relative_to(ROOT).as_posix()\n    except ValueError:\n        return None\n\n\ndef extract_links(body: str, rel_path: Path) -> list[str]:\n    links: list[str] = []\n    for match in LINK_RE.finditer(body):\n        target = match.group(1).strip()\n        if not target or target.startswith("#"):\n            continue\n        if "://" in target or target.startswith("mailto:"):\n            continue\n        base = target.split("#", 1)[0]\n        if not base:\n            continue\n        normalized = normalize_local_link(rel_path, base)\n        if normalized:\n            links.append(normalized)\n    return sorted(set(links))\n\n\ndef parse_doc(path: Path) -> dict[str, Any]:\n    text = path.read_text(encoding="utf-8")\n    frontmatter, body = split_frontmatter(text)\n    rel = path.relative_to(ROOT)\n    title = extract_title(path, body, frontmatter)\n    summary_raw = frontmatter.get("summary")\n    summary = summary_raw if isinstance(summary_raw, str) else ""\n    owners_raw = frontmatter.get("owners")\n    owners = owners_raw if isinstance(owners_raw, list) else []\n    tags_raw = frontmatter.get("tags")\n    tags = tags_raw if isinstance(tags_raw, list) else []\n    code_paths_raw = frontmatter.get("code_paths")\n    code_paths = code_paths_raw if isinstance(code_paths_raw, list) else []\n    doc_type = classify_doc(path)\n    return {\n        "path": rel.as_posix(),\n        "frontmatter": frontmatter,\n        "body": body,\n        "title": title,\n        "id": str(frontmatter.get("id", rel.as_posix())),\n        "doc_type": doc_type,\n        "state": str(frontmatter.get("state", "")),\n        "summary": summary.strip(),\n        "owners": [str(x) for x in owners],\n        "tags": [str(x) for x in tags],\n        "code_paths": [str(x) for x in code_paths],\n        "links": extract_links(body, rel),\n        "word_count": len(re.findall(r"\\S+", body)),\n        "revision": semantic_doc_revision({"path": rel.as_posix(), "frontmatter": frontmatter, "body": body}),\n    }\n\n\ndef load_research_collections() -> list[dict[str, Any]]:\n    collections: list[dict[str, Any]] = []\n    if not RESEARCH_ROOT.exists():\n        return collections\n    for path in sorted(RESEARCH_ROOT.rglob("*.jsonl")):\n        entries = read_jsonl(path)\n        payload_entries = []\n        for entry in entries:\n            payload_entries.append(\n                {\n                    "id": str(entry.get("id", "")).strip(),\n                    "title": str(entry.get("title", "")).strip(),\n                    "summary": str(entry.get("summary", "")).strip(),\n                    "web_link": str(entry.get("web_link", "")).strip(),\n                    "updated": str(entry.get("updated", "")).strip(),\n                    "tags": [str(value) for value in entry.get("tags", []) if str(value).strip()],\n                    "revision": {"digest": canonical_digest(entry), "git": git_anchor([path.relative_to(ROOT).as_posix()])},\n                }\n            )\n        collections.append(\n            {\n                "path": path.relative_to(ROOT).as_posix(),\n                "entry_count": len(payload_entries),\n                "entries": payload_entries,\n            }\n        )\n    return collections\n\n\ndef build_graph(docs: list[dict[str, Any]], research: list[dict[str, Any]], roadmap_entries: list[dict[str, Any]]) -> dict[str, Any]:\n    nodes: list[dict[str, Any]] = []\n    edges: list[dict[str, Any]] = []\n    seen_nodes: set[str] = set()\n    seen_edges: set[tuple[str, str, str]] = set()\n\n    def add_node(node_id: str, **payload: Any) -> None:\n        if not node_id or node_id in seen_nodes:\n            return\n        seen_nodes.add(node_id)\n        node = {"id": node_id}\n        node.update(payload)\n        nodes.append(node)\n\n    def add_edge(kind: str, source: str, target: str, **payload: Any) -> None:\n        if not source or not target:\n            return\n        key = (kind, source, target)\n        if key in seen_edges:\n            return\n        seen_edges.add(key)\n        edge = {"kind": kind, "from": source, "to": target}\n        edge.update(payload)\n        edges.append(edge)\n\n    code_paths: set[str] = set()\n    research_entry_ids: list[str] = []\n\n    for doc in sorted(docs, key=lambda item: item["path"]):\n        doc_path = str(doc["path"])\n        doc_id = f"doc:{doc_path}"\n        group = spec_group(doc_path) if str(doc.get("doc_type", "")) == "spec" else ""\n        add_node(\n            doc_id,\n            kind="doc",\n            path=doc_path,\n            title=str(doc.get("title", "")).strip(),\n            doc_type=str(doc.get("doc_type", "doc")).strip(),\n            state=str(doc.get("state", "")).strip(),\n            group=group,\n            summary=str(doc.get("summary", "")).strip(),\n            owners=[str(value) for value in doc.get("owners", []) if str(value).strip()],\n            tags=[str(value) for value in doc.get("tags", []) if str(value).strip()],\n            revision=doc.get("revision", {}),\n        )\n        for target in [str(value) for value in doc.get("links", []) if str(value).strip()]:\n            add_edge("doc_link", doc_id, f"doc:{target}")\n        for code_path in [str(value) for value in doc.get("code_paths", []) if str(value).strip()]:\n            code_paths.add(code_path)\n            add_node(f"code:{code_path}", kind="code_path", path=code_path)\n            add_edge("doc_code_path", doc_id, f"code:{code_path}")\n\n    for collection in research:\n        collection_path = str(collection.get("path", "")).strip()\n        collection_id = f"research_collection:{collection_path}"\n        add_node(\n            collection_id,\n            kind="research_collection",\n            path=collection_path,\n            entry_count=int(collection.get("entry_count", 0)),\n        )\n        for entry in collection.get("entries", []):\n            entry_id = str(entry.get("id", "")).strip()\n            if not entry_id:\n                continue\n            research_entry_ids.append(entry_id)\n            entry_node_id = f"research_entry:{entry_id}"\n            add_node(\n                entry_node_id,\n                kind="research_entry",\n                research_id=entry_id,\n                title=str(entry.get("title", "")).strip(),\n                summary=str(entry.get("summary", "")).strip(),\n                web_link=str(entry.get("web_link", "")).strip(),\n                updated=str(entry.get("updated", "")).strip(),\n                tags=[str(value) for value in entry.get("tags", []) if str(value).strip()],\n                revision=entry.get("revision", {}),\n            )\n            add_edge("collection_contains_entry", collection_id, entry_node_id)\n\n    status_counts = Counter(str(item.get("status", "todo")) for item in roadmap_entries)\n    for task in roadmap_entries:\n        task_id = str(task.get("id", "")).strip()\n        if not task_id:\n            continue\n        task_node_id = f"task:{task_id}"\n        add_node(\n            task_node_id,\n            kind="roadmap_task",\n            task_id=task_id,\n            title=str(task.get("title", "")).strip(),\n            status=str(task.get("status", "todo")).strip(),\n            priority=str(task.get("priority", "medium")).strip(),\n            task_kind=str(task.get("kind", "task")).strip(),\n            summary=str(task.get("summary", "")).strip(),\n            updated=str(task.get("updated", "")).strip(),\n            labels=[str(value) for value in task.get("labels", []) if str(value).strip()],\n            revision=task_revision(task),\n        )\n        for spec_path in [str(value) for value in task.get("spec_paths", []) if str(value).strip()]:\n            add_edge("task_spec", task_node_id, f"doc:{spec_path}")\n        for code_path in [str(value) for value in task.get("code_paths", []) if str(value).strip()]:\n            code_paths.add(code_path)\n            add_node(f"code:{code_path}", kind="code_path", path=code_path)\n            add_edge("task_code_path", task_node_id, f"code:{code_path}")\n        for research_id in [str(value) for value in task.get("research_ids", []) if str(value).strip()]:\n            add_edge("task_research", task_node_id, f"research_entry:{research_id}")\n\n    doc_paths = sorted(str(doc["path"]) for doc in docs)\n    spec_paths = sorted(str(doc["path"]) for doc in docs if str(doc.get("doc_type", "")) == "spec")\n    grouped_spec_paths = {\n        "product": [path for path in spec_paths if path.startswith(PRODUCT_SPEC_PREFIX)],\n        "system": [path for path in spec_paths if path.startswith(SYSTEM_SPEC_PREFIX)],\n        "clients": [path for path in spec_paths if path_starts_with_any(path, CLIENTS_SPEC_PREFIXES)],\n    }\n\n    revision = {\n        "git": git_anchor(doc_paths + sorted(code_paths) + [ROADMAP_PATH.relative_to(ROOT).as_posix()]),\n        "spec_digest": canonical_digest({path: (next((doc.get("revision", {}) for doc in docs if str(doc.get("path", "")) == path), {}) or {}).get("digest", "") for path in spec_paths}),\n        "task_digest": canonical_digest({str(item.get("id", "")).strip(): task_revision(item).get("digest", "") for item in roadmap_entries if str(item.get("id", "")).strip()}),\n        "evidence_digest": canonical_digest(research),\n    }\n\n    return {\n        "version": 1,\n        "generated_at": now_iso(),\n        "revision": revision,\n        "nodes": nodes,\n        "edges": edges,\n        "views": {\n            "docs": {\n                "all_paths": doc_paths,\n                "spec_paths": spec_paths,\n                "by_group": grouped_spec_paths,\n                "by_type": {\n                    "spec": spec_paths,\n                    "roadmap": [path for path in doc_paths if ROADMAP_DOC_PATH is not None and path == ROADMAP_DOC_PATH.relative_to(ROOT).as_posix()],\n                    "doc": [path for path in doc_paths if path not in spec_paths and (ROADMAP_DOC_PATH is None or path != ROADMAP_DOC_PATH.relative_to(ROOT).as_posix())],\n                },\n            },\n            "roadmap": {\n                "task_ids": [str(item.get("id", "")).strip() for item in roadmap_entries if str(item.get("id", "")).strip()],\n                "open_task_ids": [str(item.get("id", "")).strip() for item in roadmap_entries if is_open_task_status(item.get("status", "todo")) and str(item.get("id", "")).strip()],\n                "in_progress_task_ids": [str(item.get("id", "")).strip() for item in roadmap_entries if is_active_task_status(item.get("status", "todo")) and str(item.get("id", "")).strip()],\n                "todo_task_ids": [str(item.get("id", "")).strip() for item in roadmap_entries if str(item.get("status", "todo")).strip() == "todo" and str(item.get("id", "")).strip()],\n                "blocked_task_ids": [str(item.get("id", "")).strip() for item in roadmap_entries if str(item.get("status", "")).strip() == "blocked" and str(item.get("id", "")).strip()],\n                "done_task_ids": [str(item.get("id", "")).strip() for item in roadmap_entries if str(item.get("status", "")).strip() == "done" and str(item.get("id", "")).strip()],\n                "cancelled_task_ids": [str(item.get("id", "")).strip() for item in roadmap_entries if str(item.get("status", "")).strip() == "cancelled" and str(item.get("id", "")).strip()],\n                "recent_task_ids": [str(item.get("id", "")).strip() for item in sorted(roadmap_entries, key=lambda item: (str(item.get("updated", "")), str(item.get("id", ""))), reverse=True) if str(item.get("id", "")).strip()],\n                "status_counts": dict(status_counts),\n            },\n            "research": {\n                "collection_paths": [str(collection.get("path", "")).strip() for collection in research if str(collection.get("path", "")).strip()],\n                "entry_ids": sorted(set(research_entry_ids)),\n            },\n            "code": {\n                "paths": sorted(code_paths),\n            },\n        },\n    }\n\n\ndef issue(severity: str, kind: str, path: str, message: str) -> dict[str, Any]:\n    return {\n        "severity": severity,\n        "kind": kind,\n        "path": path,\n        "message": message,\n    }\n\n\ndef extract_raw_link_targets(body: str) -> list[str]:\n    return [match.group(1).strip() for match in LINK_RE.finditer(body)]\n\n\ndef lint_markdown_docs(docs: list[dict[str, Any]]) -> list[dict[str, Any]]:\n    issues: list[dict[str, Any]] = []\n    ids = Counter(doc["id"] for doc in docs)\n\n    for doc in docs:\n        for field in DEFAULT_REQUIRED_FIELDS:\n            value = doc["frontmatter"].get(field)\n            if value in (None, "", []):\n                issues.append(issue("error", "missing-field", doc["path"], f"Missing required frontmatter field: {field}"))\n        if ids[doc["id"]] > 1:\n            issues.append(issue("error", "duplicate-id", doc["path"], f"Duplicate id: {doc[\'id\']}"))\n\n        for raw_target in extract_raw_link_targets(doc["body"]):\n            if raw_target.startswith("#") or "://" in raw_target or raw_target.startswith("mailto:"):\n                continue\n            base = raw_target.split("#", 1)[0]\n            if not base:\n                continue\n            target_abs = (ROOT / Path(doc["path"]).parent / base).resolve()\n            if not target_abs.exists():\n                issues.append(issue("error", "broken-link", doc["path"], f"Broken link: {raw_target}"))\n\n        for code_path in doc["code_paths"]:\n            candidate = (ROOT / code_path).resolve()\n            if not candidate.exists():\n                issues.append(issue("warning", "missing-code-path", doc["path"], f"Referenced code path does not exist: {code_path}"))\n\n        if doc["path"] not in WORD_COUNT_EXEMPT and doc["word_count"] > WORD_COUNT_WARN:\n            issues.append(issue("warning", "large-doc", doc["path"], f"Live doc has {doc[\'word_count\']} words; consider split or cut."))\n\n        for heading in FORBIDDEN_HEADINGS:\n            if heading in doc["body"]:\n                issues.append(issue("warning", "forbidden-heading", doc["path"], f"Forbidden heading in live doc: {heading}"))\n\n        if "## Related docs" not in doc["body"]:\n            issues.append(issue("warning", "missing-related-docs", doc["path"], "Live doc should end with \'## Related docs\'."))\n\n    return issues\n\n\ndef lint_research_collections(collections: list[dict[str, Any]]) -> list[dict[str, Any]]:\n    issues: list[dict[str, Any]] = []\n    seen_ids: set[str] = set()\n\n    for collection in collections:\n        source_path = collection["path"]\n        for index, entry in enumerate(collection["entries"], start=1):\n            entry_id = entry.get("id", "")\n            if not entry_id:\n                issues.append(issue("error", "research-missing-id", source_path, f"Entry {index} missing id"))\n                continue\n            if entry_id in seen_ids:\n                issues.append(issue("error", "research-duplicate-id", source_path, f"Duplicate research id: {entry_id}"))\n            seen_ids.add(entry_id)\n            for field in ["title", "summary", "web_link", "updated"]:\n                if not str(entry.get(field, "")).strip():\n                    issues.append(issue("error", f"research-missing-{field}", source_path, f"{entry_id} missing {field}"))\n            web_link = str(entry.get("web_link", "")).strip()\n            if web_link and not (web_link.startswith("http://") or web_link.startswith("https://")):\n                issues.append(issue("warning", "research-bad-link", source_path, f"{entry_id} should use http/https web_link"))\n\n    return issues\n\n\ndef lint_roadmap_entries(entries: list[dict[str, Any]], research_collections: list[dict[str, Any]]) -> list[dict[str, Any]]:\n    issues: list[dict[str, Any]] = []\n    seen_ids: set[str] = set()\n    allowed_status = {"todo", "research", "implement", "verify", "done", "cancelled", "in_progress", "blocked"}\n    allowed_priority = {"critical", "high", "medium", "low"}\n    source_path = ROADMAP_PATH.relative_to(ROOT).as_posix()\n    research_ids = {\n        entry["id"]\n        for collection in research_collections\n        for entry in collection["entries"]\n        if entry.get("id")\n    }\n\n    for index, entry in enumerate(entries, start=1):\n        entry_id = str(entry.get("id", "")).strip()\n        if not entry_id:\n            issues.append(issue("error", "roadmap-missing-id", source_path, f"Entry {index} missing task id"))\n            continue\n        if entry_id in seen_ids:\n            issues.append(issue("error", "roadmap-duplicate-id", source_path, f"Duplicate roadmap task id: {entry_id}"))\n        seen_ids.add(entry_id)\n\n        for field in ["title", "status", "priority", "kind", "summary", "created", "updated"]:\n            if not str(entry.get(field, "")).strip():\n                issues.append(issue("error", f"roadmap-missing-{field}", source_path, f"{entry_id} missing {field}"))\n\n        status = str(entry.get("status", "todo"))\n        if status not in allowed_status:\n            issues.append(issue("error", "roadmap-bad-status", source_path, f"{entry_id} has invalid status: {status}"))\n\n        priority = str(entry.get("priority", "medium"))\n        if priority not in allowed_priority:\n            issues.append(issue("error", "roadmap-bad-priority", source_path, f"{entry_id} has invalid priority: {priority}"))\n\n        spec_paths = [str(value) for value in entry.get("spec_paths", []) if str(value).strip()]\n        code_paths = [str(value) for value in entry.get("code_paths", []) if str(value).strip()]\n        research_refs = [str(value) for value in entry.get("research_ids", []) if str(value).strip()]\n        goal_raw = entry.get("goal")\n        goal: dict[str, Any] = cast(dict[str, Any], goal_raw) if isinstance(goal_raw, dict) else {}\n        acceptance = [str(value).strip() for value in goal.get("acceptance", []) if str(value).strip()] if isinstance(goal.get("acceptance"), list) else []\n        non_goals = [str(value).strip() for value in goal.get("non_goals", []) if str(value).strip()] if isinstance(goal.get("non_goals"), list) else []\n        verification = [str(value).strip() for value in goal.get("verification", []) if str(value).strip()] if isinstance(goal.get("verification"), list) else []\n        outcome = str(goal.get("outcome", "")).strip()\n\n        if goal and not outcome and not acceptance and not non_goals and not verification:\n            issues.append(issue("warning", "roadmap-empty-goal", source_path, f"{entry_id} includes a goal object with no meaningful content"))\n        if goal and not verification:\n            issues.append(issue("warning", "roadmap-missing-verification", source_path, f"{entry_id} goal should define at least one verification step"))\n\n        if not spec_paths and not code_paths:\n            issues.append(issue("warning", "roadmap-unscoped", source_path, f"{entry_id} should reference at least one spec_paths or code_paths entry"))\n\n        for spec_path in spec_paths:\n            if not (ROOT / spec_path).exists():\n                issues.append(issue("error", "roadmap-missing-spec-path", source_path, f"{entry_id} references missing spec path: {spec_path}"))\n\n        for code_path in code_paths:\n            if not (ROOT / code_path).exists():\n                issues.append(issue("warning", "roadmap-missing-code-path", source_path, f"{entry_id} references missing code path: {code_path}"))\n\n        for research_id in research_refs:\n            if research_id not in research_ids:\n                issues.append(issue("warning", "roadmap-missing-research-id", source_path, f"{entry_id} references unknown research id: {research_id}"))\n\n    return issues\n\n\ndef repo_markdown_files() -> list[Path]:\n    files: set[Path] = set()\n    for pattern in REPO_MARKDOWN_PATTERNS:\n        for path in ROOT.glob(pattern):\n            if path.is_file():\n                files.add(path)\n    return sorted(files)\n\n\ndef lint_repo_markdown_doc_links() -> list[dict[str, Any]]:\n    issues: list[dict[str, Any]] = []\n    docs_prefix = DOCS_ROOT.relative_to(ROOT).as_posix().rstrip("/") + "/"\n    meta_prefix = META_ROOT.relative_to(ROOT).as_posix().rstrip("/") + "/"\n    for path in repo_markdown_files():\n        text = path.read_text(encoding="utf-8")\n        rel = path.relative_to(ROOT).as_posix()\n        refs = list(extract_raw_link_targets(text)) + [match.group(1).strip() for match in BACKTICK_DOC_PATH_RE.finditer(text)]\n        for raw_target in refs:\n            if raw_target.startswith("#") or "://" in raw_target or raw_target.startswith("mailto:"):\n                continue\n            base = raw_target.split("#", 1)[0]\n            if not base:\n                continue\n            target_abs = (path.parent / base).resolve()\n            try:\n                target_rel = target_abs.relative_to(ROOT).as_posix()\n            except ValueError:\n                continue\n            if target_rel.startswith(docs_prefix) or target_rel.startswith(meta_prefix):\n                if not target_abs.exists():\n                    issues.append(issue("error", "repo-doc-link", rel, f"Broken docs link/path: {raw_target}"))\n    return issues\n\n\ndef lint(docs: list[dict[str, Any]], roadmap_entries: list[dict[str, Any]], research_collections: list[dict[str, Any]]) -> dict[str, Any]:\n    issues: list[dict[str, Any]] = []\n    issues.extend(lint_markdown_docs(docs))\n    issues.extend(lint_research_collections(research_collections))\n    issues.extend(lint_roadmap_entries(roadmap_entries, research_collections))\n    issues.extend(lint_repo_markdown_doc_links())\n    return {\n        "generated_at": now_iso(),\n        "counts": Counter(item["kind"] for item in issues),\n        "issues": issues,\n    }\n\n\ndef lint_health(lint_report: dict[str, Any]) -> dict[str, Any]:\n    issues_raw = lint_report.get("issues")\n    issues = [item for item in issues_raw if isinstance(item, dict)] if isinstance(issues_raw, list) else []\n    errors = sum(1 for item in issues if str(item.get("severity", "")) == "error")\n    warnings = sum(1 for item in issues if str(item.get("severity", "")) == "warning")\n    color = "red" if errors > 0 else "yellow" if warnings > 0 else "green"\n    return {\n        "color": color,\n        "errors": errors,\n        "warnings": warnings,\n        "total_issues": len(issues),\n    }\n\n\ndef normalize_task_phase(value: Any) -> str:\n    phase = str(value or "").strip()\n    if phase == "research":\n        return "implement"\n    return phase if phase in {"implement", "verify", "done"} else "implement"\n\n\ndef next_task_phase(phase: str) -> str:\n    if phase == "implement":\n        return "verify"\n    if phase == "verify":\n        return "done"\n    return "done"\n\n\ndef default_task_phase(status: str) -> str:\n    normalized = str(status or "todo").strip()\n    if normalized == "research":\n        return "implement"\n    if normalized in {"implement", "verify", "done"}:\n        return normalized\n    if normalized == "todo":\n        return "implement"\n    if normalized in {"in_progress", "blocked"}:\n        return "implement"\n    return "implement"\n\n\ndef roadmap_task_stage(status: Any, loop_phase: Any = "") -> str:\n    normalized = str(status or "todo").strip()\n    if normalized == "research":\n        return "research"\n    if normalized in {"todo", "implement", "verify", "done"}:\n        return normalized\n    if normalized in {"in_progress", "blocked"}:\n        return normalize_task_phase(loop_phase)\n    return "todo"\n\n\ndef is_closed_task_status(status: Any) -> bool:\n    return str(status or "").strip() in {"done", "cancelled"}\n\n\ndef is_open_task_status(status: Any) -> bool:\n    return str(status or "").strip() in {"todo", "research", "implement", "verify", "in_progress", "blocked"}\n\n\ndef is_active_task_status(status: Any) -> bool:\n    return str(status or "").strip() in {"research", "implement", "verify", "in_progress", "blocked"}\n\n\ndef build_task_loop_state(task_id: str, status: str, events: list[dict[str, Any]]) -> dict[str, Any]:\n    phase = default_task_phase(status)\n    updated_at = ""\n    evidence: dict[str, Any] | None = None\n\n    for event in events:\n        if str(event.get("task_id", "")).strip() != task_id:\n            continue\n        kind = str(event.get("kind", "")).strip()\n        timestamp = str(event.get("ts", "")).strip()\n        if kind == "task_phase_started":\n            phase = normalize_task_phase(event.get("phase"))\n            updated_at = timestamp or updated_at\n        elif kind == "task_phase_passed":\n            phase = next_task_phase(normalize_task_phase(event.get("phase")))\n            updated_at = timestamp or updated_at\n        elif kind == "task_phase_failed":\n            phase = "implement"\n            updated_at = timestamp or updated_at\n        elif kind == "task_phase_blocked":\n            phase = normalize_task_phase(event.get("phase"))\n            updated_at = timestamp or updated_at\n        elif kind == "task_evidence_recorded":\n            evidence = {\n                "verdict": str(event.get("verdict", "pass")).strip() or "pass",\n                "summary": str(event.get("summary", "")).strip(),\n                "checks_run": [str(value).strip() for value in event.get("checks_run", []) if str(value).strip()] if isinstance(event.get("checks_run"), list) else [],\n                "files_touched": [str(value).strip() for value in event.get("files_touched", []) if str(value).strip()] if isinstance(event.get("files_touched"), list) else [],\n                "issues": [str(value).strip() for value in event.get("issues", []) if str(value).strip()] if isinstance(event.get("issues"), list) else [],\n                "updated_at": timestamp,\n            }\n            updated_at = timestamp or updated_at\n\n    return {\n        "phase": phase,\n        "updated_at": updated_at,\n        "evidence": evidence,\n    }\n\n\ndef build_roadmap_state(entries: list[dict[str, Any]], graph: dict[str, Any], lint_report: dict[str, Any], events: list[dict[str, Any]] | None = None) -> dict[str, Any]:\n    graph_views = graph.get("views", {}) if isinstance(graph.get("views"), dict) else {}\n    graph_roadmap = graph_views.get("roadmap", {}) if isinstance(graph_views.get("roadmap"), dict) else {}\n    ordered = [str(item.get("id", "")).strip() for item in entries if str(item.get("id", "")).strip()]\n    status_counts = Counter(str(item.get("status", "todo")) for item in entries)\n    priority_counts = Counter(str(item.get("priority", "medium")) for item in entries)\n    tasks: dict[str, Any] = {}\n\n    for item in entries:\n        task_id = str(item.get("id", "")).strip()\n        if not task_id:\n            continue\n        tasks[task_id] = {\n            "id": task_id,\n            "title": str(item.get("title", task_id)).strip(),\n            "status": str(item.get("status", "todo")),\n            "priority": str(item.get("priority", "medium")),\n            "kind": str(item.get("kind", "task")).strip(),\n            "summary": str(item.get("summary", "")).strip(),\n            "labels": [str(value) for value in item.get("labels", []) if str(value).strip()],\n            "goal": {\n                "outcome": str(((item.get("goal") or {}).get("outcome", ""))).strip(),\n                "acceptance": [str(value) for value in (((item.get("goal") or {}).get("acceptance")) or []) if str(value).strip()],\n                "non_goals": [str(value) for value in (((item.get("goal") or {}).get("non_goals")) or []) if str(value).strip()],\n                "verification": [str(value) for value in (((item.get("goal") or {}).get("verification")) or []) if str(value).strip()],\n            },\n            "spec_paths": [str(value) for value in item.get("spec_paths", []) if str(value).strip()],\n            "code_paths": [str(value) for value in item.get("code_paths", []) if str(value).strip()],\n            "updated": str(item.get("updated", "")).strip(),\n            "revision": task_revision(item),\n            "context_path": (ROADMAP_TASKS_PATH / task_id / "context.json").relative_to(ROOT).as_posix(),\n            "loop": build_task_loop_state(task_id, str(item.get("status", "todo")), events or []),\n        }\n\n    sorted_entries = sorted(entries, key=roadmap_sort_key)\n    recent_entries = sorted(entries, key=lambda item: (str(item.get("updated", "")), str(item.get("id", ""))), reverse=True)\n    blocked_task_ids = [\n        str(item.get("id", "")).strip()\n        for item in sorted_entries\n        if str(item.get("id", "")).strip()\n        and (\n            str(item.get("status", "todo")).strip() == "blocked"\n            or str((((tasks.get(str(item.get("id", "")).strip(), {}) or {}).get("loop") or {}).get("evidence") or {}).get("verdict", "")).strip() == "blocked"\n        )\n    ]\n    return {\n        "version": 2,\n        "generated_at": now_iso(),\n        "health": lint_health(lint_report),\n        "source": {\n            "graph_version": int(graph.get("version", 0) or 0),\n            "graph_generated_at": str(graph.get("generated_at", "")).strip(),\n            "revision": graph.get("revision", {}),\n            "roadmap_folder": ROADMAP_FOLDER_PATH.relative_to(ROOT).as_posix(),\n            "task_context_root": ROADMAP_TASKS_PATH.relative_to(ROOT).as_posix(),\n        },\n        "summary": {\n            "task_count": len(entries),\n            "open_count": int(sum(1 for item in entries if is_open_task_status(item.get("status", "todo")))),\n            "status_counts": dict(graph_roadmap.get("status_counts", {})) if isinstance(graph_roadmap.get("status_counts"), dict) and graph_roadmap.get("status_counts") else dict(status_counts),\n            "priority_counts": dict(priority_counts),\n        },\n        "views": {\n            "ordered_task_ids": [str(value).strip() for value in graph_roadmap.get("task_ids", []) if str(value).strip()] or ordered,\n            "open_task_ids": [str(value).strip() for value in graph_roadmap.get("open_task_ids", []) if str(value).strip()] or [str(item.get("id", "")).strip() for item in sorted_entries if is_open_task_status(item.get("status", "todo")) and str(item.get("id", "")).strip()],\n            "in_progress_task_ids": [str(value).strip() for value in graph_roadmap.get("in_progress_task_ids", []) if str(value).strip()] or [str(item.get("id", "")).strip() for item in sorted_entries if is_active_task_status(item.get("status", "todo")) and str(item.get("id", "")).strip()],\n            "todo_task_ids": [str(value).strip() for value in graph_roadmap.get("todo_task_ids", []) if str(value).strip()] or [str(item.get("id", "")).strip() for item in sorted_entries if str(item.get("status", "todo")) == "todo" and str(item.get("id", "")).strip()],\n            "blocked_task_ids": [str(value).strip() for value in graph_roadmap.get("blocked_task_ids", []) if str(value).strip()] or blocked_task_ids,\n            "done_task_ids": [str(value).strip() for value in graph_roadmap.get("done_task_ids", []) if str(value).strip()] or [str(item.get("id", "")).strip() for item in sorted_entries if str(item.get("status", "todo")) == "done" and str(item.get("id", "")).strip()],\n            "cancelled_task_ids": [str(value).strip() for value in graph_roadmap.get("cancelled_task_ids", []) if str(value).strip()] or [str(item.get("id", "")).strip() for item in sorted_entries if str(item.get("status", "todo")) == "cancelled" and str(item.get("id", "")).strip()],\n            "recent_task_ids": [str(value).strip() for value in graph_roadmap.get("recent_task_ids", []) if str(value).strip()] or [str(item.get("id", "")).strip() for item in recent_entries if str(item.get("id", "")).strip()],\n        },\n        "tasks": tasks,\n    }\n\n\ndef compact_code_area(code_paths: list[str]) -> str:\n    cleaned = [str(value).strip() for value in code_paths if str(value).strip()]\n    if not cleaned:\n        return "\u2014"\n    if len(cleaned) == 1:\n        return cleaned[0]\n    areas: list[str] = []\n    for path in cleaned:\n        head = path.split("/", 1)[0]\n        if head not in areas:\n            areas.append(head)\n    if len(areas) == 1:\n        return f"{areas[0]} +{len(cleaned) - 1} more"\n    visible = areas[:2]\n    suffix = f" +{len(areas) - len(visible)} more" if len(areas) > len(visible) else ""\n    return ", ".join(visible) + suffix\n\n\ndef path_starts_with_any(path: str, prefixes: list[str]) -> bool:\n    return any(path.startswith(prefix) for prefix in prefixes)\n\n\ndef spec_group(path: str) -> str:\n    if path.startswith(PRODUCT_SPEC_PREFIX):\n        return "product"\n    if path_starts_with_any(path, CLIENTS_SPEC_PREFIXES):\n        return "clients"\n    return "system"\n\n\ndef spec_requires_code_mapping(path: str) -> bool:\n    if path.startswith(f"{SYSTEM_SPEC_PREFIX}runtime/"):\n        return False\n    return path.startswith(SYSTEM_SPEC_PREFIX)\n\n\ndef bar_state(label: str, value: int, total: int) -> dict[str, Any]:\n    safe_total = total if total > 0 else 0\n    percent = int(round((value / safe_total) * 100)) if safe_total > 0 else 100\n    return {\n        "label": label,\n        "value": int(value),\n        "total": int(total),\n        "percent": percent,\n    }\n\n\ndef unique(values: list[str]) -> list[str]:\n    seen: list[str] = []\n    for value in values:\n        text = str(value).strip()\n        if text and text not in seen:\n            seen.append(text)\n    return seen\n\n\ndef lane_stats(rows: list[dict[str, Any]]) -> dict[str, Any]:\n    counts = Counter(str(row.get("drift_status", "aligned")) for row in rows)\n    return {\n        "total_specs": len(rows),\n        "aligned_specs": counts.get("aligned", 0),\n        "tracked_specs": counts.get("tracked", 0),\n        "untracked_specs": counts.get("untracked", 0),\n        "blocked_specs": counts.get("blocked", 0),\n        "unmapped_specs": counts.get("unmapped", 0),\n    }\n\n\ndef previous_heartbeat_lane(previous_status: dict[str, Any], lane_id: str) -> dict[str, Any] | None:\n    heartbeat = previous_status.get("heartbeat") if isinstance(previous_status.get("heartbeat"), dict) else {}\n    lanes = heartbeat.get("lanes", []) if isinstance(heartbeat, dict) else []\n    for lane in lanes if isinstance(lanes, list) else []:\n        if isinstance(lane, dict) and str(lane.get("id", "")).strip() == lane_id:\n            return lane\n    return None\n\n\ndef lane_revision_anchor(row_paths: list[str], code_paths: list[str], open_task_ids: list[str], spec_rows_by_path: dict[str, dict[str, Any]], roadmap_entries: list[dict[str, Any]]) -> dict[str, Any]:\n    tasks_by_id = {str(task.get("id", "")).strip(): task for task in roadmap_entries if str(task.get("id", "")).strip()}\n    spec_digests = {\n        path: str(((spec_rows_by_path.get(path, {}) or {}).get("revision") or {}).get("digest", "")).strip()\n        for path in row_paths\n    }\n    task_digests = {\n        task_id: str(task_revision(tasks_by_id[task_id]).get("digest", "")).strip()\n        for task_id in open_task_ids\n        if task_id in tasks_by_id\n    }\n    code_digest = canonical_digest({path: sha256_text((ROOT / path).read_text(encoding="utf-8", errors="ignore")) for path in code_paths if (ROOT / path).is_file()})\n    anchor = {\n        "git": git_anchor(row_paths + code_paths + [ROADMAP_PATH.relative_to(ROOT).as_posix()]),\n        "spec_digest": canonical_digest(spec_digests),\n        "task_digest": canonical_digest(task_digests),\n        "code_digest": code_digest,\n    }\n    anchor["digest"] = canonical_digest(anchor)\n    return anchor\n\n\ndef lane_freshness(anchor: dict[str, Any], previous_lane: dict[str, Any] | None, checked_at: str) -> dict[str, Any]:\n    if not previous_lane:\n        return {\n            "status": "fresh",\n            "basis": "revision",\n            "checked_at": checked_at,\n            "reason": "no previous heartbeat anchor; current revision captured",\n            "stale_state_guidance": "Resume normally; future spec, task, or mapped code revision changes will mark this lane stale.",\n        }\n    previous_revision = previous_lane.get("revision")\n    previous_anchor: dict[str, Any] = cast(dict[str, Any], previous_revision) if isinstance(previous_revision, dict) else {}\n    changed = []\n    for key in ["spec_digest", "task_digest", "code_digest"]:\n        if str(anchor.get(key, "")) != str(previous_anchor.get(key, "")):\n            changed.append(key.replace("_digest", ""))\n    if changed:\n        return {\n            "status": "stale",\n            "basis": "revision",\n            "checked_at": checked_at,\n            "reason": f"revision changed: {\', \'.join(changed)}",\n            "stale_state_guidance": "Re-run status or resume implementation before trusting prior drift analysis.",\n        }\n    return {\n        "status": "fresh",\n        "basis": "revision",\n        "checked_at": checked_at,\n        "reason": "revision anchors unchanged since previous heartbeat",\n        "stale_state_guidance": "Prior drift analysis remains correlated with current spec, task, and mapped code revisions.",\n    }\n\n\ndef build_heartbeat_lane(\n    lane_id: str,\n    title: str,\n    cadence: str,\n    fallback_max_age_hours: int,\n    triggers: list[str],\n    spec_paths: list[str],\n    spec_rows_by_path: dict[str, dict[str, Any]],\n    roadmap_entries: list[dict[str, Any]],\n    recommendation: dict[str, str],\n    previous_status: dict[str, Any],\n) -> dict[str, Any]:\n    rows = [spec_rows_by_path[path] for path in spec_paths if path in spec_rows_by_path]\n    row_paths = [str(row.get("path", "")).strip() for row in rows if str(row.get("path", "")).strip()]\n    code_paths = unique([\n        str(code_path)\n        for row in rows\n        for code_path in row.get("code_paths", [])\n        if str(code_path).strip()\n    ])\n\n    open_task_ids: list[str] = []\n    for task in roadmap_entries:\n        task_id = str(task.get("id", "")).strip()\n        if not task_id:\n            continue\n        if not is_open_task_status(task.get("status", "todo")):\n            continue\n        task_spec_paths = [str(value) for value in task.get("spec_paths", []) if str(value).strip()]\n        task_code_paths = [str(value) for value in task.get("code_paths", []) if str(value).strip()]\n        if set(task_spec_paths) & set(row_paths) or set(task_code_paths) & set(code_paths):\n            open_task_ids.append(task_id)\n\n    checked_at = now_iso()\n    normalized_open_task_ids = unique(open_task_ids)\n    revision = lane_revision_anchor(row_paths, code_paths, normalized_open_task_ids, spec_rows_by_path, roadmap_entries)\n\n    return {\n        "id": lane_id,\n        "title": title,\n        "cadence": cadence,\n        "freshness_basis": "work-first",\n        "fallback_max_age_hours": fallback_max_age_hours,\n        "interval_hours": fallback_max_age_hours,\n        "triggers": triggers,\n        "checked_at": checked_at,\n        "revision": revision,\n        "freshness": lane_freshness(revision, previous_heartbeat_lane(previous_status, lane_id), checked_at),\n        "spec_paths": row_paths,\n        "code_paths": code_paths,\n        "code_area": compact_code_area(code_paths),\n        "open_task_ids": normalized_open_task_ids,\n        "risky_spec_paths": [path for path in row_paths if str(spec_rows_by_path.get(path, {}).get("drift_status", "aligned")) != "aligned"],\n        "stats": lane_stats(rows),\n        "recommendation": recommendation,\n    }\n\n\ndef build_resume_state(\n    roadmap_state: dict[str, Any],\n    heartbeat_lanes: list[dict[str, Any]],\n    next_step: dict[str, str],\n) -> dict[str, Any]:\n    views = roadmap_state.get("views", {}) if isinstance(roadmap_state.get("views"), dict) else {}\n    tasks = roadmap_state.get("tasks", {}) if isinstance(roadmap_state.get("tasks"), dict) else {}\n    in_progress_ids = [str(value).strip() for value in views.get("in_progress_task_ids", []) if str(value).strip()]\n    todo_ids = [str(value).strip() for value in views.get("todo_task_ids", []) if str(value).strip()]\n    open_task_id = (in_progress_ids + todo_ids + [""])[0]\n    task = tasks.get(open_task_id) if open_task_id else None\n    if isinstance(task, dict):\n        goal = task.get("goal", {}) if isinstance(task.get("goal"), dict) else {}\n        verification = [str(value).strip() for value in goal.get("verification", []) if str(value).strip()]\n        loop = task.get("loop", {}) if isinstance(task.get("loop"), dict) else {}\n        evidence = loop.get("evidence", {}) if isinstance(loop.get("evidence"), dict) else {}\n        evidence_parts = [str(evidence.get("summary", "")).strip()]\n        checks_run = [str(value).strip() for value in evidence.get("checks_run", []) if str(value).strip()] if isinstance(evidence.get("checks_run"), list) else []\n        issues = [str(value).strip() for value in evidence.get("issues", []) if str(value).strip()] if isinstance(evidence.get("issues"), list) else []\n        if checks_run:\n            evidence_parts.append(f"{len(checks_run)} check(s)")\n        if issues:\n            evidence_parts.append(f"{len(issues)} issue(s)")\n        evidence_text = " \u00b7 ".join([part for part in evidence_parts if part]) or "No closure evidence recorded yet."\n        phase = normalize_task_phase(loop.get("phase"))\n        return {\n            "source": "task",\n            "task_id": open_task_id,\n            "lane_id": "",\n            "heading": f"{open_task_id} \u2014 {str(task.get(\'title\', \'\')).strip()}".strip(" \u2014"),\n            "command": f"/wiki-resume {open_task_id}",\n            "reason": f"Resume roadmap task ({str(task.get(\'status\', \'todo\')).strip() or \'todo\'} \u00b7 {phase}).",\n            "phase": phase,\n            "verification": verification[0] if verification else "No explicit verification step yet.",\n            "evidence": evidence_text,\n            "heartbeat": "Roadmap task should stay grounded in current heartbeat cues.",\n        }\n\n    stale_lane: dict[str, Any] | None = None\n    for lane in heartbeat_lanes:\n        freshness_raw = lane.get("freshness")\n        freshness: dict[str, Any] = {}\n        if isinstance(freshness_raw, dict):\n            freshness = freshness_raw\n        if freshness.get("status") == "stale" or (lane.get("risky_spec_paths") or lane.get("open_task_ids") or ((lane.get("stats") or {}).get("untracked_specs", 0)) or ((lane.get("stats") or {}).get("blocked_specs", 0))):\n            stale_lane = lane\n            break\n    if stale_lane:\n        return {\n            "source": "heartbeat",\n            "task_id": "",\n            "lane_id": str(stale_lane.get("id", "")).strip(),\n            "heading": str(stale_lane.get("title", "")).strip(),\n            "command": str(((stale_lane.get("recommendation") or {}).get("command", "")).strip()),\n            "reason": "Resume from stale heartbeat lane.",\n            "phase": "implement",\n            "verification": str(((stale_lane.get("recommendation") or {}).get("reason", "")).strip()),\n            "evidence": "No closure evidence recorded yet.",\n            "heartbeat": str(((stale_lane.get("freshness") or {}).get("stale_state_guidance", "")).strip()) or f"{len(stale_lane.get(\'risky_spec_paths\', []))} risky spec(s) and {len(stale_lane.get(\'open_task_ids\', []))} open task(s).",\n        }\n\n    return {\n        "source": "next_step",\n        "task_id": "",\n        "lane_id": "",\n        "heading": "Roadmap clear",\n        "command": str(next_step.get("command", "")).strip(),\n        "reason": str(next_step.get("reason", "")).strip(),\n        "phase": "implement",\n        "verification": "No urgent verification cue.",\n        "evidence": "No closure evidence recorded yet.",\n        "heartbeat": "All heartbeat lanes currently fresh.",\n    }\n\n\nAGENT_NAME_POOL = [\n    "Otter", "Kestrel", "Marten", "Heron", "Fox", "Raven", "Panda", "Lynx",\n    "Badger", "Cormorant", "Falcon", "Tern", "Wren", "Puma", "Seal", "Yak",\n    "Ibis", "Manta", "Orca", "Puffin", "Sable", "Swift", "Wolf", "Quail",\n    "Mole", "Bison", "Gecko", "Jaguar", "Koala", "Narwhal", "Robin", "Stoat",\n]\n\n\ndef stable_agent_name(session_id: str) -> str:\n    value = 0\n    for ch in session_id:\n        value = ((value * 33) + ord(ch)) & 0xFFFFFFFF\n    return AGENT_NAME_POOL[value % len(AGENT_NAME_POOL)]\n\n\ndef assign_agent_names(session_ids: list[str]) -> dict[str, str]:\n    used: dict[str, int] = {}\n    assigned: dict[str, str] = {}\n    for session_id in sorted(session_ids):\n        base = stable_agent_name(session_id)\n        count = used.get(base, 0) + 1\n        used[base] = count\n        assigned[session_id] = base if count == 1 else f"{base} {count}"\n    return assigned\n\n\ndef build_parallel_session_state(events: list[dict[str, Any]], roadmap_state: dict[str, Any]) -> dict[str, Any]:\n    latest_by_session: dict[str, dict[str, Any]] = {}\n    for event in events:\n        if str(event.get("kind", "")).strip() != "task_session_link":\n            continue\n        session_id = str(event.get("session_id", "")).strip()\n        task_id = str(event.get("task_id", "")).strip()\n        timestamp = str(event.get("ts", "")).strip()\n        action = str(event.get("action", "focus")).strip() or "focus"\n        if not session_id or not timestamp:\n            continue\n        if action == "clear":\n            latest_by_session.pop(session_id, None)\n            continue\n        if not task_id:\n            continue\n        latest_by_session[session_id] = {\n            "session_id": session_id,\n            "task_id": task_id,\n            "action": action,\n            "timestamp": timestamp,\n            "title": str(event.get("title", "")).strip(),\n            "summary": str(event.get("summary", "")).strip(),\n        }\n\n    sessions = sorted(latest_by_session.values(), key=lambda item: (str(item.get("timestamp", "")), str(item.get("session_id", ""))), reverse=True)\n    agent_names = assign_agent_names([str(item.get("session_id", "")).strip() for item in sessions if str(item.get("session_id", "")).strip()])\n    for item in sessions:\n        item["agent_name"] = agent_names.get(str(item.get("session_id", "")).strip(), "Agent")\n    counts = Counter(str(item.get("task_id", "")).strip() for item in sessions if str(item.get("task_id", "")).strip())\n    collision_task_ids = [task_id for task_id, count in counts.items() if count > 1]\n    return {\n        "generated_at": now_iso(),\n        "active_session_count": len(sessions),\n        "collision_task_ids": sorted(collision_task_ids),\n        "sessions": sessions[:8],\n    }\n\n\ndef build_status_state(docs: list[dict[str, Any]], graph: dict[str, Any], roadmap_entries: list[dict[str, Any]], lint_report: dict[str, Any], roadmap_state: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any]:\n    previous_status = load_previous_status_state()\n    health = lint_health(lint_report)\n    doc_by_path = {str(doc.get("path", "")).strip(): doc for doc in docs if str(doc.get("path", "")).strip()}\n    graph_doc_code_paths: dict[str, list[str]] = {}\n    for edge in graph.get("edges", []) if isinstance(graph.get("edges"), list) else []:\n        if str(edge.get("kind", "")).strip() != "doc_code_path":\n            continue\n        source = str(edge.get("from", "")).strip()\n        target = str(edge.get("to", "")).strip()\n        if not source.startswith("doc:") or not target.startswith("code:"):\n            continue\n        graph_doc_code_paths.setdefault(source.replace("doc:", "", 1), []).append(target.replace("code:", "", 1))\n    graph_spec_docs = []\n    for node in graph.get("nodes", []) if isinstance(graph.get("nodes"), list) else []:\n        if str(node.get("kind", "")).strip() != "doc" or str(node.get("doc_type", "")).strip() != "spec":\n            continue\n        path = str(node.get("path", "")).strip()\n        if not path:\n            continue\n        doc = doc_by_path.get(path, {})\n        doc_code_paths = doc.get("code_paths", [])\n        if not isinstance(doc_code_paths, list):\n            doc_code_paths = []\n        graph_spec_docs.append({\n            **doc,\n            "path": path,\n            "title": str(node.get("title", doc.get("title", path))).strip(),\n            "summary": str(doc.get("summary", node.get("summary", ""))).strip(),\n            "doc_type": "spec",\n            "code_paths": unique(graph_doc_code_paths.get(path, []) or [str(value) for value in doc_code_paths if str(value).strip()]),\n            "revision": node.get("revision", doc.get("revision", {})),\n        })\n    spec_docs = sorted(graph_spec_docs or [doc for doc in docs if doc.get("doc_type") == "spec"], key=lambda doc: str(doc.get("path", "")))\n    raw_issues_value = lint_report.get("issues")\n    raw_issues: list[Any] = raw_issues_value if isinstance(raw_issues_value, list) else []\n    issues: list[dict[str, Any]] = [issue for issue in raw_issues if isinstance(issue, dict)]\n    open_tasks_by_spec: dict[str, list[dict[str, Any]]] = {}\n    blocked_tasks_by_spec: dict[str, list[dict[str, Any]]] = {}\n    done_tasks_by_spec: dict[str, list[dict[str, Any]]] = {}\n\n    for task in roadmap_entries:\n        spec_paths = [str(value) for value in task.get("spec_paths", []) if str(value).strip()]\n        status = str(task.get("status", "todo"))\n        for spec_path in spec_paths:\n            if status == "blocked":\n                blocked_tasks_by_spec.setdefault(spec_path, []).append(task)\n            elif is_open_task_status(status):\n                open_tasks_by_spec.setdefault(spec_path, []).append(task)\n            elif status == "done":\n                done_tasks_by_spec.setdefault(spec_path, []).append(task)\n\n    spec_rows: list[dict[str, Any]] = []\n    counts = Counter()\n    risky_paths: list[str] = []\n\n    for doc in spec_docs:\n        path = str(doc.get("path", "")).strip()\n        code_paths = [str(value) for value in doc.get("code_paths", []) if str(value).strip()]\n        related_issues = [\n            issue\n            for issue in issues\n            if str(issue.get("path", "")).strip() in {path, path.replace("wiki/", "docs/", 1)}\n        ]\n        issue_errors = sum(1 for issue in related_issues if str(issue.get("severity", "")) == "error")\n        issue_warnings = sum(1 for issue in related_issues if str(issue.get("severity", "")) == "warning")\n        open_tasks = sorted(open_tasks_by_spec.get(path, []), key=roadmap_sort_key)\n        blocked_tasks = sorted(blocked_tasks_by_spec.get(path, []), key=roadmap_sort_key)\n        done_tasks = sorted(done_tasks_by_spec.get(path, []), key=roadmap_sort_key)\n\n        requires_mapping = spec_requires_code_mapping(path)\n\n        if blocked_tasks and not open_tasks:\n            drift_status = "blocked"\n            primary_task = blocked_tasks[0]\n            note = f"blocked by {primary_task.get(\'id\', \'task\')}"\n        elif open_tasks:\n            drift_status = "tracked"\n            primary_task = open_tasks[0]\n            note = f"tracked by {primary_task.get(\'id\', \'task\')}"\n        elif not code_paths and requires_mapping:\n            drift_status = "unmapped"\n            primary_task = None\n            note = "no mapped code area"\n        elif related_issues:\n            drift_status = "untracked"\n            primary_task = None\n            issue_total = issue_errors + issue_warnings\n            note = f"{issue_total} deterministic issue{\'s\' if issue_total != 1 else \'\'} with no open roadmap task"\n        else:\n            drift_status = "aligned"\n            primary_task = done_tasks[0] if done_tasks else None\n            note = "no deterministic drift signals"\n\n        counts[drift_status] += 1\n        if drift_status != "aligned":\n            risky_paths.append(path)\n        spec_rows.append(\n            {\n                "path": path,\n                "title": str(doc.get("title", path)).strip(),\n                "summary": str(doc.get("summary", "")).strip(),\n                "drift_status": drift_status,\n                "code_paths": code_paths,\n                "code_area": compact_code_area(code_paths),\n                "issue_counts": {\n                    "errors": issue_errors,\n                    "warnings": issue_warnings,\n                    "total": issue_errors + issue_warnings,\n                },\n                "related_task_ids": [str(item.get("id", "")).strip() for item in [*open_tasks, *blocked_tasks, *done_tasks] if str(item.get("id", "")).strip()],\n                "primary_task": {\n                    "id": str(primary_task.get("id", "")).strip(),\n                    "status": str(primary_task.get("status", "")).strip(),\n                    "title": str(primary_task.get("title", "")).strip(),\n                } if isinstance(primary_task, dict) else None,\n                "revision": doc.get("revision", {}),\n                "note": note,\n            }\n        )\n\n    status_order = {"untracked": 0, "blocked": 1, "tracked": 2, "unmapped": 3, "aligned": 4}\n    risky_specs = sorted(spec_rows, key=lambda item: (status_order.get(str(item.get("drift_status", "aligned")), 99), str(item.get("path", ""))))\n    spec_rows_by_path = {str(row.get("path", "")).strip(): row for row in spec_rows if str(row.get("path", "")).strip()}\n    mapping_target_specs = [row for row in spec_rows if spec_requires_code_mapping(str(row.get("path", "")))]\n    total_specs = len(mapping_target_specs)\n    mapped_specs = len([row for row in mapping_target_specs if str(row.get("drift_status", "aligned")) != "unmapped"])\n    drift_total = counts.get("tracked", 0) + counts.get("untracked", 0) + counts.get("blocked", 0)\n    tracked_total = counts.get("tracked", 0) + counts.get("blocked", 0)\n    task_summary = roadmap_state.get("summary", {}) if isinstance(roadmap_state.get("summary"), dict) else {}\n    task_status_counts = task_summary.get("status_counts", {}) if isinstance(task_summary.get("status_counts"), dict) else {}\n\n    product_spec_paths = [str(row.get("path", "")).strip() for row in spec_rows if str(row.get("path", "")).startswith(PRODUCT_SPEC_PREFIX)]\n    system_spec_paths = [str(row.get("path", "")).strip() for row in spec_rows if str(row.get("path", "")).startswith(SYSTEM_SPEC_PREFIX)]\n    ux_spec_paths = [str(row.get("path", "")).strip() for row in spec_rows if path_starts_with_any(str(row.get("path", "")).strip(), CLIENTS_SPEC_PREFIXES)]\n    heartbeat_lanes = [\n        build_heartbeat_lane(\n            "product_system",\n            "Product \u2194 System",\n            "low",\n            24,\n            [\n                "spec_change:product",\n                "spec_change:system",\n                "task_close:architecture",\n                "manual_review",\n            ],\n            unique(product_spec_paths + system_spec_paths),\n            spec_rows_by_path,\n            roadmap_entries,\n            {\n                "kind": "status",\n                "command": "/wiki-status",\n                "reason": "Strategic intent drift should first be inspected through the canonical status surface.",\n            },\n            previous_status,\n        ),\n        build_heartbeat_lane(\n            "system_code",\n            "System \u2194 Code",\n            "high",\n            1,\n            [\n                "spec_change:system",\n                "code_change:mapped",\n                "task_progress",\n                "rebuild_complete",\n                "pre_close_check",\n            ],\n            unique(system_spec_paths),\n            spec_rows_by_path,\n            roadmap_entries,\n            {\n                "kind": "implement",\n                "command": "/wiki-resume",\n                "reason": "Implementation drift should be checked most frequently against owning system specs.",\n            },\n            previous_status,\n        ),\n        build_heartbeat_lane(\n            "product_system_ux",\n            "Product + System \u2194 UX",\n            "medium",\n            6,\n            [\n                "spec_change:product",\n                "spec_change:system",\n                "spec_change:ux",\n                "code_change:ux_surface",\n                "manual_review",\n            ],\n            unique(product_spec_paths + system_spec_paths + ux_spec_paths),\n            spec_rows_by_path,\n            roadmap_entries,\n            {\n                "kind": "status",\n                "command": "/wiki-status",\n                "reason": "User-visible drift should first be inspected through the canonical status surface.",\n            },\n            previous_status,\n        ),\n    ]\n\n    if counts.get("untracked", 0) > 0:\n        next_step = {\n            "kind": "status",\n            "command": "/wiki-status",\n            "reason": f"{counts.get(\'untracked\', 0)} untracked spec drift needs inspection through the canonical status surface.",\n        }\n    elif counts.get("blocked", 0) > 0 or int(task_status_counts.get("blocked", 0)) > 0:\n        next_step = {\n            "kind": "status",\n            "command": "/wiki-status",\n            "reason": "Blocked drift exists; inspect constraints in status before resuming implementation.",\n        }\n    elif isinstance(roadmap_state.get("views"), dict) and roadmap_state["views"].get("in_progress_task_ids"):\n        task_id = str(roadmap_state["views"]["in_progress_task_ids"][0])\n        next_step = {\n            "kind": "code",\n            "command": f"/wiki-resume {task_id}",\n            "reason": "Roadmap already covers current delta; continue in-progress implementation.",\n        }\n    elif isinstance(roadmap_state.get("views"), dict) and roadmap_state["views"].get("todo_task_ids"):\n        task_id = str(roadmap_state["views"]["todo_task_ids"][0])\n        next_step = {\n            "kind": "code",\n            "command": f"/wiki-resume {task_id}",\n            "reason": "Roadmap is ready; continue with the next open task.",\n        }\n    else:\n        next_step = {\n            "kind": "observe",\n            "command": "Observe \u2014 roadmap clear",\n            "reason": "No open deterministic drift requires action right now.",\n        }\n\n    heartbeat_summary = {\n        "lane_count": len(heartbeat_lanes),\n        "freshness_basis": "work-first",\n        "high_cadence_lane_ids": [str(item.get("id", "")) for item in heartbeat_lanes if str(item.get("cadence", "")) == "high" and str(item.get("id", "")).strip()],\n        "medium_cadence_lane_ids": [str(item.get("id", "")) for item in heartbeat_lanes if str(item.get("cadence", "")) == "medium" and str(item.get("id", "")).strip()],\n        "low_cadence_lane_ids": [str(item.get("id", "")) for item in heartbeat_lanes if str(item.get("cadence", "")) == "low" and str(item.get("id", "")).strip()],\n    }\n    parallel = build_parallel_session_state(events, roadmap_state)\n    resume = build_resume_state(roadmap_state, heartbeat_lanes, next_step)\n\n    wiki_sections = {\n        "product": {"id": "product", "label": "Product", "rows": []},\n        "system": {"id": "system", "label": "System", "rows": []},\n        "clients": {"id": "clients", "label": "Clients", "rows": []},\n    }\n    for row in risky_specs:\n        row_path = str(row.get("path", "")).strip()\n        group = spec_group(row_path)\n        wiki_sections[group]["rows"].append(row)\n\n    roadmap_columns = [\n        {"id": "todo", "label": "Todo", "task_ids": []},\n        {"id": "research", "label": "Research", "task_ids": []},\n        {"id": "implement", "label": "Implement", "task_ids": []},\n        {"id": "verify", "label": "Verify", "task_ids": []},\n        {"id": "done", "label": "Done", "task_ids": []},\n    ]\n    roadmap_tasks = roadmap_state.get("tasks") if isinstance(roadmap_state.get("tasks"), dict) else {}\n    ordered_task_ids = (((roadmap_state.get("views") or {}).get("ordered_task_ids")) or []) if isinstance(roadmap_state.get("views"), dict) else []\n    for task_id in ordered_task_ids if isinstance(ordered_task_ids, list) else []:\n        task = roadmap_tasks.get(str(task_id)) if isinstance(roadmap_tasks, dict) else None\n        if not isinstance(task, dict):\n            continue\n        if str(task.get("status", "")).strip() == "cancelled":\n            continue\n        stage = roadmap_task_stage(task.get("status", ""), ((task.get("loop") or {}).get("phase", "")))\n        column = next((item for item in roadmap_columns if str(item.get("id", "")) == stage), roadmap_columns[0])\n        column["task_ids"].append(str(task.get("id", task_id)).strip())\n\n    direction = [\n        next_step["reason"],\n        f"Parallel sessions: {int(parallel[\'active_session_count\'])} active, {len(parallel[\'collision_task_ids\'])} collision task(s).",\n        f"Heartbeat lanes: {heartbeat_summary[\'lane_count\']} work-first (high={len(heartbeat_summary[\'high_cadence_lane_ids\'])}, medium={len(heartbeat_summary[\'medium_cadence_lane_ids\'])}, low={len(heartbeat_summary[\'low_cadence_lane_ids\'])}).",\n        f"Mapped specs: {mapped_specs}/{total_specs}.",\n        f"Tracked drift coverage: {tracked_total}/{drift_total}." if drift_total > 0 else "No tracked spec drift is open.",\n    ]\n\n    return {\n        "version": 1,\n        "generated_at": now_iso(),\n        "source": {\n            "graph_version": int(graph.get("version", 0) or 0),\n            "graph_generated_at": str(graph.get("generated_at", "")).strip(),\n            "revision": graph.get("revision", {}),\n        },\n        "project": {\n            "name": PROJECT_NAME,\n            "docs_root": DOCS_ROOT.relative_to(ROOT).as_posix(),\n            "roadmap_path": ROADMAP_PATH.relative_to(ROOT).as_posix(),\n        },\n        "health": health,\n        "summary": {\n            "total_specs": total_specs,\n            "mapped_specs": mapped_specs,\n            "aligned_specs": counts.get("aligned", 0),\n            "tracked_specs": counts.get("tracked", 0),\n            "untracked_specs": counts.get("untracked", 0),\n            "blocked_specs": counts.get("blocked", 0),\n            "unmapped_specs": counts.get("unmapped", 0),\n            "task_count": int(task_summary.get("task_count", len(roadmap_entries))),\n            "open_task_count": int(task_summary.get("open_count", 0)),\n            "done_task_count": int(task_status_counts.get("done", 0)),\n        },\n        "bars": {\n            "tracked_drift": bar_state("Tracked drift", tracked_total, drift_total),\n            "roadmap_done": bar_state("Roadmap done", int(task_status_counts.get("done", 0)), int(task_summary.get("task_count", len(roadmap_entries)))),\n            "spec_mapping": bar_state("Spec mapping", mapped_specs, total_specs),\n        },\n        "views": {\n            "risky_spec_paths": [str(item.get("path", "")) for item in risky_specs if str(item.get("path", ""))],\n            "top_risky_spec_paths": [str(item.get("path", "")) for item in risky_specs[:5] if str(item.get("path", ""))],\n            "open_task_ids": [str(value) for value in (((roadmap_state.get("views") or {}).get("open_task_ids")) or []) if str(value).strip()],\n        },\n        "heartbeat": {\n            "generated_at": now_iso(),\n            "summary": heartbeat_summary,\n            "lanes": heartbeat_lanes,\n        },\n        "parallel": parallel,\n        "resume": resume,\n        "wiki": {\n            "rows": risky_specs,\n            "sections": [section for section in [wiki_sections["product"], wiki_sections["system"], wiki_sections["clients"]] if section.get("rows")],\n        },\n        "roadmap": {\n            "focused_task_id": str(resume.get("task_id", "")).strip() if str(resume.get("source", "")).strip() == "task" else "",\n            "blocked_task_ids": [str(value).strip() for value in (((roadmap_state.get("views") or {}).get("blocked_task_ids")) or []) if str(value).strip()],\n            "in_progress_task_ids": [str(value).strip() for value in (((roadmap_state.get("views") or {}).get("in_progress_task_ids")) or []) if str(value).strip()],\n            "next_task_id": str((((roadmap_state.get("views") or {}).get("todo_task_ids")) or [""])[0]).strip(),\n            "columns": roadmap_columns,\n        },\n        "agents": {\n            "rows": [\n                {\n                    "id": f"session:{str(item.get(\'session_id\', \'\')).strip()}",\n                    "label": str(item.get("agent_name", "")).strip() or str(item.get("session_id", "")).strip(),\n                    "name": str(item.get("agent_name", "")).strip() or str(item.get("session_id", "")).strip(),\n                    "task_id": str(item.get("task_id", "")).strip(),\n                    "task_title": str((((roadmap_state.get("tasks") or {}).get(str(item.get("task_id", "")).strip(), {}) or {}).get("title", ""))).strip(),\n                    "mode": "manual",\n                    "status": "blocked" if str(item.get("action", "")).strip() == "blocked" else "active",\n                    "last_action": str(item.get("summary", "")).strip() or str(item.get("action", "")).strip(),\n                    "constraint": "Pi session-linked execution",\n                    "session_id": str(item.get("session_id", "")).strip(),\n                }\n                for item in parallel.get("sessions", [])\n                if str(item.get("session_id", "")).strip()\n            ],\n        },\n        "channels": {\n            "add_label": "Add channel",\n            "rows": [],\n        },\n        "specs": risky_specs,\n        "next_step": next_step,\n        "direction": direction,\n    }\n\n\ndef docs_relative_link(root_relative_path: str) -> str:\n    abs_path = ROOT / root_relative_path\n    output_root = (ROADMAP_DOC_PATH or INDEX_PATH or META_ROOT).parent\n    return os.path.relpath(abs_path, output_root).replace("\\\\", "/")\n\n\ndef roadmap_sort_key(item: dict[str, Any]) -> tuple[int, int, str]:\n    status_order = {"implement": 0, "verify": 1, "in_progress": 0, "blocked": 1, "todo": 2, "research": 2, "done": 3, "cancelled": 4}\n    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}\n    status = str(item.get("status", "todo"))\n    priority = str(item.get("priority", "medium"))\n    return (status_order.get(status, 99), priority_order.get(priority, 99), str(item.get("id", "")))\n\n\ndef render_roadmap(entries: list[dict[str, Any]]) -> str:\n    generated_at = now_iso()\n    lines = [\n        "---",\n        "id: roadmap.live",\n        "title: Roadmap",\n        "state: active",\n        f"summary: Numbered, trackable delta tasks for {PROJECT_NAME}.",\n        "owners:",\n        "- engineering",\n        f"updated: \'{generated_at[:10]}\'",\n        "---",\n        "",\n        "# Roadmap",\n        "",\n        f"Generated: {generated_at}",\n        "",\n        f"Canonical source: [{ROADMAP_PATH.name}]({docs_relative_link(ROADMAP_PATH.relative_to(ROOT).as_posix())})",\n        "",\n        "Roadmap is freshest representation of gap between desired state in authored docs and current implementation reality.",\n        "",\n    ]\n\n    buckets = [\n        ("In progress", [item for item in entries if str(item.get("status", "")) == "in_progress"]),\n        ("Todo", [item for item in entries if str(item.get("status", "todo")) == "todo"]),\n        ("Blocked", [item for item in entries if str(item.get("status", "")) == "blocked"]),\n        ("Done", [item for item in entries if str(item.get("status", "")) == "done"]),\n    ]\n\n    for title, bucket in buckets:\n        lines.extend([f"## {title}", ""])\n        if not bucket:\n            lines.extend(["_None._", ""])\n            continue\n        for item in bucket:\n            task_id = str(item.get("id", "UNKNOWN"))\n            task_title = str(item.get("title", task_id))\n            priority = str(item.get("priority", "medium"))\n            kind = str(item.get("kind", "task"))\n            summary = str(item.get("summary", "")).strip()\n            lines.append(f"### {task_id} \u2014 {task_title}")\n            lines.append("")\n            lines.append(f"- Status: {str(item.get(\'status\', \'todo\'))}")\n            lines.append(f"- Priority: {priority}")\n            lines.append(f"- Kind: {kind}")\n            if summary:\n                lines.append(f"- Summary: {summary}")\n\n            spec_paths = [str(value) for value in item.get("spec_paths", []) if str(value).strip()]\n            code_paths = [str(value) for value in item.get("code_paths", []) if str(value).strip()]\n            research_ids = [str(value) for value in item.get("research_ids", []) if str(value).strip()]\n            labels = [str(value) for value in item.get("labels", []) if str(value).strip()]\n            goal_raw = item.get("goal")\n            goal: dict[str, Any] = {}\n            if isinstance(goal_raw, dict):\n                goal.update(goal_raw)\n            delta_raw = item.get("delta")\n            delta: dict[str, Any] = {}\n            if isinstance(delta_raw, dict):\n                delta.update(delta_raw)\n\n            if spec_paths:\n                lines.append("- Specs:")\n                for spec_path in spec_paths:\n                    lines.append(f"  - [{spec_path}]({docs_relative_link(spec_path)})")\n            if code_paths:\n                lines.append("- Code:")\n                for code_path in code_paths:\n                    lines.append(f"  - {code_path}")\n            if research_ids:\n                lines.append(f"- Evidence: {\', \'.join(research_ids)}")\n            if labels:\n                lines.append(f"- Labels: {\', \'.join(labels)}")\n            goal_outcome = str(goal.get("outcome", "")).strip()\n            goal_acceptance = [str(value) for value in goal.get("acceptance", []) if str(value).strip()] if isinstance(goal.get("acceptance"), list) else []\n            goal_non_goals = [str(value) for value in goal.get("non_goals", []) if str(value).strip()] if isinstance(goal.get("non_goals"), list) else []\n            goal_verification = [str(value) for value in goal.get("verification", []) if str(value).strip()] if isinstance(goal.get("verification"), list) else []\n            if goal_outcome:\n                lines.append(f"- Goal: {goal_outcome}")\n            if goal_acceptance:\n                lines.append("- Success signals:")\n                for item_text in goal_acceptance:\n                    lines.append(f"  - {item_text}")\n            if goal_non_goals:\n                lines.append("- Non-goals:")\n                for item_text in goal_non_goals:\n                    lines.append(f"  - {item_text}")\n            if goal_verification:\n                lines.append("- Verification:")\n                for item_text in goal_verification:\n                    lines.append(f"  - {item_text}")\n            if delta:\n                desired = str(delta.get("desired", "")).strip()\n                current = str(delta.get("current", "")).strip()\n                closure = str(delta.get("closure", "")).strip()\n                if desired:\n                    lines.append(f"- Desired: {desired}")\n                if current:\n                    lines.append(f"- Current: {current}")\n                if closure:\n                    lines.append(f"- Closure: {closure}")\n            lines.append("")\n\n    lines.extend([\n        "## Related docs",\n        "",\n        "- [Wiki Index](index.md)",\n        f"- [Product]({docs_relative_link(f\'{PRODUCT_SPEC_PREFIX}overview.md\')})",\n        f"- [Clients Overview]({docs_relative_link(f\'{PRIMARY_CLIENTS_SPEC_PREFIX}overview.md\')})",\n        f"- [System Overview]({docs_relative_link(f\'{SYSTEM_SPEC_PREFIX}overview.md\')})",\n        "",\n    ])\n    return "\\n".join(lines).rstrip() + "\\n"\n\n\ndef index_line(path: str, title: str, summary: str, state: str, doc_type: str) -> str:\n    rel = docs_relative_link(path)\n    marker = ""\n    default_state = DEFAULT_STATE_BY_TYPE.get(doc_type)\n    if state and default_state and state != default_state:\n        marker = f" _({state})_"\n    summary_part = f" \u2014 {summary}" if summary else ""\n    return f"- [{title}]({rel}){marker}{summary_part}"\n\n\ndef render_index(docs: list[dict[str, Any]], research_collections: list[dict[str, Any]], roadmap_entries: list[dict[str, Any]]) -> str:\n    spec_docs = sorted([doc for doc in docs if doc["doc_type"] == "spec"], key=lambda item: item["path"])\n    root_specs = [doc for doc in spec_docs if Path(doc["path"]).relative_to(SPECS_ROOT.relative_to(ROOT)).parts.__len__() == 1]\n    grouped: dict[str, list[dict[str, Any]]] = {}\n    for doc in spec_docs:\n        rel = Path(doc["path"]).relative_to(SPECS_ROOT.relative_to(ROOT))\n        if len(rel.parts) <= 1:\n            continue\n        grouped.setdefault(rel.parts[0], []).append(doc)\n\n    roadmap_counts = Counter(str(item.get("status", "todo")) for item in roadmap_entries)\n    roadmap_doc_rel = ROADMAP_DOC_PATH.relative_to(ROOT).as_posix() if ROADMAP_DOC_PATH is not None else ""\n    lines = [\n        f"# {INDEX_TITLE}",\n        "",\n        f"Generated: {now_iso()}",\n        "",\n        "## Roadmap",\n        "",\n        f"- [Roadmap]({docs_relative_link(roadmap_doc_rel)}) \u2014 {len(roadmap_entries)} task(s); " + ", ".join(f"{key}={value}" for key, value in sorted(roadmap_counts.items())) if roadmap_entries else f"- [Roadmap]({docs_relative_link(roadmap_doc_rel)}) \u2014 0 tasks",\n        "",\n        "## Docs \u2014 Root",\n        "",\n    ]\n\n    if root_specs:\n        for doc in root_specs:\n            lines.append(index_line(doc["path"], doc["title"], doc["summary"], doc["state"], doc["doc_type"]))\n    else:\n        lines.append("_None._")\n    lines.append("")\n\n    for group_name in sorted(grouped):\n        lines.extend([f"## {group_name.replace(\'-\', \' \').title()}", ""])\n        for doc in grouped[group_name]:\n            lines.append(index_line(doc["path"], doc["title"], doc["summary"], doc["state"], doc["doc_type"]))\n        lines.append("")\n\n    lines.extend(["## Evidence", ""])\n    if not research_collections:\n        lines.extend(["_None._", ""])\n    else:\n        for collection in research_collections:\n            lines.append(f"- [{Path(collection[\'path\']).name}]({docs_relative_link(collection[\'path\'])}) \u2014 {collection[\'entry_count\']} entr{\'y\' if collection[\'entry_count\'] == 1 else \'ies\'}")\n            for entry in collection["entries"][:5]:\n                summary = entry.get("summary", "")\n                lines.append(f"  - {entry.get(\'id\', \'UNKNOWN\')} \u2014 {entry.get(\'title\', \'Untitled\')}{\' \u2014 \' + summary if summary else \'\'}")\n            if collection["entry_count"] > 5:\n                lines.append(f"  - ... {collection[\'entry_count\'] - 5} more")\n        lines.append("")\n\n    return "\\n".join(lines).rstrip() + "\\n"\n\n\ndef write_json(path: Path, data: Any) -> None:\n    path.parent.mkdir(parents=True, exist_ok=True)\n    path.write_text(json.dumps(data, indent=2, sort_keys=False) + "\\n", encoding="utf-8")\n\n\ndef code_paths_digest(paths: list[str]) -> str:\n    payload: dict[str, str] = {}\n    for path in paths:\n        candidate = ROOT / path\n        if candidate.is_file():\n            payload[path] = sha256_text(candidate.read_text(encoding="utf-8", errors="ignore"))\n    return canonical_digest(payload)\n\n\ndef task_context_rel_path(task_id: str) -> str:\n    return (ROADMAP_TASKS_PATH / task_id / "context.json").relative_to(ROOT).as_posix()\n\n\ndef compact_task_goal(task: dict[str, Any]) -> dict[str, Any]:\n    goal_raw = task.get("goal")\n    goal = goal_raw if isinstance(goal_raw, dict) else {}\n    return {\n        "outcome": str(goal.get("outcome", "")).strip(),\n        "acceptance": [str(value).strip() for value in goal.get("acceptance", []) if str(value).strip()] if isinstance(goal.get("acceptance"), list) else [],\n        "non_goals": [str(value).strip() for value in goal.get("non_goals", []) if str(value).strip()] if isinstance(goal.get("non_goals"), list) else [],\n        "verification": [str(value).strip() for value in goal.get("verification", []) if str(value).strip()] if isinstance(goal.get("verification"), list) else [],\n    }\n\n\ndef compact_revision_digest(revision: Any) -> dict[str, str]:\n    if not isinstance(revision, dict):\n        return {"digest": ""}\n    return {"digest": str(revision.get("digest", "")).strip()}\n\n\ndef compact_git_anchor(paths: list[str]) -> dict[str, Any]:\n    anchor = git_anchor(paths)\n    raw_paths = anchor.get("paths", {}) if isinstance(anchor.get("paths"), dict) else {}\n    return {\n        "head": str(anchor.get("head", "")).strip(),\n        "dirty": bool(anchor.get("dirty", False)),\n        "dirty_paths": [str(path).strip() for path in anchor.get("dirty_paths", [])[:12] if str(path).strip()] if isinstance(anchor.get("dirty_paths"), list) else [],\n        "paths": {str(path): str(commit)[:12] for path, commit in raw_paths.items()},\n    }\n\n\ndef compact_graph_revision(graph: dict[str, Any]) -> dict[str, Any]:\n    revision = graph.get("revision") if isinstance(graph.get("revision"), dict) else {}\n    git = revision.get("git") if isinstance(revision.get("git"), dict) else {}\n    return {\n        "git": {\n            "head": str(git.get("head", "")).strip(),\n            "dirty": bool(git.get("dirty", False)),\n        },\n        "spec_digest": str(revision.get("spec_digest", "")).strip(),\n        "task_digest": str(revision.get("task_digest", "")).strip(),\n        "evidence_digest": str(revision.get("evidence_digest", "")).strip(),\n    }\n\n\ndef compact_spec_contract(path: str, docs_by_path: dict[str, dict[str, Any]]) -> dict[str, Any]:\n    doc = docs_by_path.get(path) or {}\n    return {\n        "path": path,\n        "title": str(doc.get("title", Path(path).stem)).strip(),\n        "summary": str(doc.get("summary", "")).strip(),\n        "state": str(doc.get("state", "")).strip(),\n        "owners": [str(value).strip() for value in doc.get("owners", []) if str(value).strip()] if isinstance(doc.get("owners"), list) else [],\n        "code_paths": [str(value).strip() for value in doc.get("code_paths", []) if str(value).strip()] if isinstance(doc.get("code_paths"), list) else [],\n        "revision": compact_revision_digest(doc.get("revision", {})),\n        "expand": {"read": path},\n    }\n\n\ndef build_task_context_packet(task: dict[str, Any], runtime_task: dict[str, Any], docs_by_path: dict[str, dict[str, Any]], graph: dict[str, Any]) -> dict[str, Any]:\n    task_id = str(task.get("id", "")).strip()\n    spec_paths = [str(value).strip() for value in task.get("spec_paths", []) if str(value).strip()] if isinstance(task.get("spec_paths"), list) else []\n    code_paths = [str(value).strip() for value in task.get("code_paths", []) if str(value).strip()] if isinstance(task.get("code_paths"), list) else []\n    spec_digests: dict[str, str] = {}\n    for path in spec_paths:\n        doc = docs_by_path.get(path)\n        revision_raw = doc.get("revision") if isinstance(doc, dict) else {}\n        revision_doc = revision_raw if isinstance(revision_raw, dict) else {}\n        spec_digests[path] = str(revision_doc.get("digest", "")).strip()\n    loop_raw = runtime_task.get("loop")\n    loop: dict[str, Any] = loop_raw if isinstance(loop_raw, dict) else {}\n    evidence_raw = loop.get("evidence")\n    latest_evidence = evidence_raw if isinstance(evidence_raw, dict) else None\n    phase = str(loop.get("phase", default_task_phase(task.get("status", "todo")))).strip()\n    revision = {\n        "task": task_revision(task),\n        "git": compact_git_anchor(spec_paths + code_paths + [ROADMAP_PATH.relative_to(ROOT).as_posix()]),\n        "spec_digest": canonical_digest(spec_digests),\n        "code_digest": code_paths_digest(code_paths),\n        "graph": compact_graph_revision(graph),\n    }\n    return {\n        "version": 1,\n        "generated_at": now_iso(),\n        "context_path": task_context_rel_path(task_id),\n        "budget": {\n            "target_tokens": 6000,\n            "policy": "Use this packet first. Expand only listed specs/code/evidence when phase or stale revision requires exact source.",\n        },\n        "task": {\n            "id": task_id,\n            "title": str(task.get("title", task_id)).strip(),\n            "status": str(task.get("status", "todo")).strip(),\n            "phase": phase,\n            "priority": str(task.get("priority", "medium")).strip(),\n            "kind": str(task.get("kind", "task")).strip(),\n            "summary": str(task.get("summary", "")).strip(),\n            "labels": [str(value).strip() for value in task.get("labels", []) if str(value).strip()] if isinstance(task.get("labels"), list) else [],\n            "goal": compact_task_goal(task),\n            "delta": task.get("delta", {}) if isinstance(task.get("delta"), dict) else {},\n        },\n        "revision": revision,\n        "specs": [compact_spec_contract(path, docs_by_path) for path in spec_paths],\n        "code": {\n            "paths": code_paths,\n            "digest": revision["code_digest"],\n            "expand": [{"read": path} for path in code_paths],\n        },\n        "evidence": latest_evidence,\n        "expansion": {\n            "task_json": (ROADMAP_TASKS_PATH / task_id / "task.json").relative_to(ROOT).as_posix(),\n            "roadmap_state": ROADMAP_STATE_PATH.relative_to(ROOT).as_posix(),\n            "status_state": STATUS_STATE_PATH.relative_to(ROOT).as_posix(),\n            "graph": (META_ROOT / "graph.json").relative_to(ROOT).as_posix(),\n        },\n    }\n\n\ndef write_roadmap_folder_view(roadmap_items: list[dict[str, Any]], roadmap_state: dict[str, Any], docs: list[dict[str, Any]], graph: dict[str, Any]) -> None:\n    ROADMAP_FOLDER_PATH.mkdir(parents=True, exist_ok=True)\n    docs_by_path = {str(doc.get("path", "")).strip(): doc for doc in docs if str(doc.get("path", "")).strip()}\n    runtime_tasks = roadmap_state.get("tasks", {}) if isinstance(roadmap_state.get("tasks"), dict) else {}\n    task_index: list[dict[str, Any]] = []\n    for task in roadmap_items:\n        task_id = str(task.get("id", "")).strip()\n        if not task_id:\n            continue\n        task_dir = ROADMAP_TASKS_PATH / task_id\n        runtime_task = runtime_tasks.get(task_id, {}) if isinstance(runtime_tasks.get(task_id), dict) else {}\n        context = build_task_context_packet(task, runtime_task, docs_by_path, graph)\n        write_json(task_dir / "task.json", task)\n        write_json(task_dir / "context.json", context)\n        task_index.append({\n            "id": task_id,\n            "title": str(task.get("title", task_id)).strip(),\n            "status": str(task.get("status", "todo")).strip(),\n            "context_path": task_context_rel_path(task_id),\n        })\n    write_json(ROADMAP_FOLDER_PATH / "index.json", {\n        "version": 1,\n        "generated_at": now_iso(),\n        "source": ROADMAP_PATH.relative_to(ROOT).as_posix(),\n        "state_path": (ROADMAP_FOLDER_PATH / "state.json").relative_to(ROOT).as_posix(),\n        "events_path": (ROADMAP_FOLDER_PATH / "events.jsonl").relative_to(ROOT).as_posix(),\n        "task_context_root": ROADMAP_TASKS_PATH.relative_to(ROOT).as_posix(),\n        "tasks": task_index,\n    })\n    write_json(ROADMAP_FOLDER_PATH / "state.json", roadmap_state)\n    events_text = ROADMAP_EVENTS_PATH.read_text(encoding="utf-8") if ROADMAP_EVENTS_PATH.exists() else ""\n    (ROADMAP_FOLDER_PATH / "events.jsonl").write_text(events_text, encoding="utf-8")\n\n\ndef main() -> None:\n    META_ROOT.mkdir(parents=True, exist_ok=True)\n    roadmap = read_roadmap_file(ROADMAP_PATH)\n    if compact_roadmap_hot_set(roadmap):\n        write_json(ROADMAP_PATH, roadmap)\n    roadmap_items = roadmap_entries(roadmap)\n    if ROADMAP_DOC_PATH is not None:\n        ROADMAP_DOC_PATH.parent.mkdir(parents=True, exist_ok=True)\n        ROADMAP_DOC_PATH.write_text(render_roadmap(roadmap_items), encoding="utf-8")\n\n    research_collections = load_research_collections()\n    docs = [parse_doc(path) for path in markdown_doc_files()]\n    graph = build_graph(docs, research_collections, roadmap_items)\n\n    write_json(META_ROOT / "graph.json", graph)\n    if not (META_ROOT / "events.jsonl").exists():\n        (META_ROOT / "events.jsonl").write_text("", encoding="utf-8")\n    if not ROADMAP_EVENTS_PATH.exists():\n        ROADMAP_EVENTS_PATH.write_text("", encoding="utf-8")\n    if INDEX_PATH is not None:\n        INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)\n        INDEX_PATH.write_text(render_index(docs, research_collections, roadmap_items), encoding="utf-8")\n    lint_report = lint(docs, roadmap_items, research_collections)\n    write_json(META_ROOT / "lint.json", lint_report)\n    roadmap_state = build_roadmap_state(roadmap_items, graph, lint_report, read_jsonl(META_ROOT / "events.jsonl"))\n    write_json(ROADMAP_STATE_PATH, roadmap_state)\n    write_roadmap_folder_view(roadmap_items, roadmap_state, docs, graph)\n    events = read_jsonl(META_ROOT / "events.jsonl")\n    write_json(STATUS_STATE_PATH, build_status_state(docs, graph, roadmap_items, lint_report, roadmap_state, events))\n\n\nif __name__ == "__main__":\n    main()\n';
}
