import {
	access,
	mkdir,
	readdir,
	readFile,
	stat,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { serializeOkfDocument } from "../knowledge/okf-frontmatter.ts";
import {
	mergeOkfSourceMapExtension,
	okfSourceMapExtensionForDoc,
} from "../knowledge/okf-source-map.ts";
import {
	parseSourceMapYaml,
	type SourceMapContract,
} from "../knowledge/source-map.ts";
import { resolveWikiConfig } from "./config.ts";
import { WIKI_CONFIG_PATH } from "./config-file.ts";

export interface BootstrapOptions {
	projectName?: string;
	force?: boolean;
}

export interface BootstrapBoundary {
	path: string;
	kind: "source" | "tests" | "docs";
}

export type BootstrapProjectKind = "empty" | "brownfield";

export interface BootstrapAudit {
	projectKind: BootstrapProjectKind;
	existing: {
		codewiki: boolean;
		config: boolean;
		kb: boolean;
		traces: boolean;
		views: boolean;
	};
	staleRoots: string[];
}

export interface BootstrapResult {
	repoRoot: string;
	project: string;
	created: string[];
	updated: string[];
	skipped: string[];
	preserved: string[];
	brownfield: boolean;
	audit: BootstrapAudit;
	boundaries: BootstrapBoundary[];
}

interface BootstrapPlan {
	directories: string[];
	files: Record<string, string>;
	boundaries: BootstrapBoundary[];
}

const TARGET_DIRECTORIES = [
	".codewiki/kb/product/users",
	".codewiki/kb/product/stories",
	".codewiki/kb/product/uis",
	".codewiki/kb/system/diagrams",
	".codewiki/traces",
	".codewiki/views",
];
const TARGET_CODEWIKI_ROOTS = new Set(["config.json", "kb", "traces", "views"]);

const SOURCE_ROOT_CANDIDATES = [
	"src",
	"app",
	"lib",
	"server",
	"packages",
	"apps",
	"services",
] as const;
const TEST_ROOT_CANDIDATES = ["tests", "test", "spec"] as const;
const DOC_ROOT_CANDIDATES = ["docs"] as const;
const EXCLUDED_NAMES = new Set([
	".codewiki",
	".git",
	".pi",
	"node_modules",
	"dist",
	"coverage",
]);
const OKF_BOOTSTRAP_TIMESTAMP = "2026-06-30T00:00:00Z";

export async function bootstrapCodewiki(
	repoRoot: string,
	options: BootstrapOptions = {},
): Promise<BootstrapResult> {
	const project = await bootstrapProjectName(repoRoot, options.projectName);
	const plan = await buildBootstrapPlan(repoRoot, project);
	const audit = await auditBootstrapState(repoRoot, plan.boundaries);
	const result: BootstrapResult = {
		repoRoot,
		project,
		created: [],
		updated: [],
		skipped: [],
		preserved: preservedBootstrapPaths(audit, options.force === true),
		brownfield: audit.projectKind === "brownfield",
		audit,
		boundaries: plan.boundaries,
	};
	for (const directory of plan.directories) {
		await mkdir(join(repoRoot, directory), { recursive: true });
	}
	for (const [path, content] of Object.entries(plan.files)) {
		await writeBootstrapFile(
			repoRoot,
			path,
			content,
			options.force === true,
			result,
		);
	}
	return result;
}

export async function buildBootstrapPlan(
	repoRoot: string,
	project: string,
): Promise<BootstrapPlan> {
	const boundaries = await detectBootstrapBoundaries(repoRoot);
	return {
		directories: TARGET_DIRECTORIES,
		files: starterFiles(project, boundaries),
		boundaries,
	};
}

export async function auditBootstrapState(
	repoRoot: string,
	boundaries: BootstrapBoundary[] = [],
): Promise<BootstrapAudit> {
	const codewikiPath = join(repoRoot, ".codewiki");
	const codewiki = await isDirectory(codewikiPath);
	const entries = codewiki ? await safeReaddir(codewikiPath) : [];
	const staleRoots = entries
		.map((entry) => entry.name)
		.filter((name) => !TARGET_CODEWIKI_ROOTS.has(name))
		.map((name) => `.codewiki/${name}`)
		.sort();
	const existing = {
		codewiki,
		config: await pathExists(join(repoRoot, WIKI_CONFIG_PATH)),
		kb: await isDirectory(join(repoRoot, ".codewiki", "kb")),
		traces: await isDirectory(join(repoRoot, ".codewiki", "traces")),
		views: await isDirectory(join(repoRoot, ".codewiki", "views")),
	};
	return {
		projectKind:
			boundaries.length > 0 || existing.codewiki ? "brownfield" : "empty",
		existing,
		staleRoots,
	};
}

function preservedBootstrapPaths(
	audit: BootstrapAudit,
	force: boolean,
): string[] {
	return [
		audit.existing.config && !force ? WIKI_CONFIG_PATH : "",
		audit.existing.kb ? ".codewiki/kb" : "",
		audit.existing.traces ? ".codewiki/traces" : "",
		audit.existing.views ? ".codewiki/views" : "",
	].filter(Boolean);
}

export async function detectBootstrapBoundaries(
	repoRoot: string,
): Promise<BootstrapBoundary[]> {
	const entries = await safeReaddir(repoRoot);
	const names = new Set(entries.map((entry) => entry.name));
	const boundaries: BootstrapBoundary[] = [];
	for (const name of SOURCE_ROOT_CANDIDATES) {
		if (names.has(name) && (await isDirectory(join(repoRoot, name)))) {
			boundaries.push({ path: `${name}/**`, kind: "source" });
		}
	}
	for (const name of TEST_ROOT_CANDIDATES) {
		if (names.has(name) && (await isDirectory(join(repoRoot, name)))) {
			boundaries.push({ path: `${name}/**`, kind: "tests" });
		}
	}
	for (const name of DOC_ROOT_CANDIDATES) {
		if (names.has(name) && (await isDirectory(join(repoRoot, name)))) {
			boundaries.push({ path: `${name}/**`, kind: "docs" });
		}
	}
	if (names.has("README.md")) {
		boundaries.push({ path: "README.md", kind: "docs" });
	}
	return boundaries.filter((boundary) => !EXCLUDED_NAMES.has(boundary.path));
}

function starterFiles(
	project: string,
	boundaries: BootstrapBoundary[],
): Record<string, string> {
	const sourceMapText = sourceMapYaml(boundaries);
	const sourceMap = parseSourceMapYaml(sourceMapText);
	const markdownFiles: Record<string, string> = {
		".codewiki/kb/lexicon.md": lexiconDoc(project),
		".codewiki/kb/product/overview.md": productOverviewDoc(project),
		".codewiki/kb/product/users/maintainers.md": simpleDoc(
			"Maintainers",
			`Maintainers use CodeWiki to keep ${project} intent, work state, and implementation evidence close to source.`,
		),
		".codewiki/kb/product/users/agents.md": simpleDoc(
			"Agents",
			"Agents use CodeWiki traces and KB refs to resume work without treating chat history as source truth.",
		),
		".codewiki/kb/product/stories/intent.md": simpleDoc(
			"Intent",
			"CodeWiki preserves accepted intent as decisions, planned work, implementation evidence, and source-backed references.",
		),
		".codewiki/kb/product/stories/navigation.md": simpleDoc(
			"Navigation",
			"CodeWiki starts from compact state views and expands to exact KB, trace, source, test, and Git refs only when needed.",
		),
		".codewiki/kb/product/uis/terminal.md": simpleDoc(
			"Terminal UI",
			"Terminal and CLI surfaces expose disposable views over KB and trace truth.",
		),
		".codewiki/kb/system/overview.md": systemOverviewDoc(project, boundaries),
		".codewiki/kb/system/loop-model.md": loopModelDoc(),
		".codewiki/kb/system/decision-loop.md": loopDoc(
			"Decision Loop",
			"Decision iterations capture accepted intent, alternatives, risks, and knowledge impact before planning starts.",
		),
		".codewiki/kb/system/planning-loop.md": loopDoc(
			"Planning Loop",
			"Planning iterations map approved decision refs into executable work units, dependencies, acceptance criteria, and explicit non-executable resolutions.",
		),
		".codewiki/kb/system/implementation-loop.md": loopDoc(
			"Implementation Loop",
			"Implementation iterations record source changes, tests, evidence, worker claims, and coverage of planned work refs.",
		),
		".codewiki/kb/system/traces.md": tracesDoc(),
		".codewiki/kb/system/api.md": apiDoc(),
		".codewiki/kb/system/runtime.md": runtimeDoc(),
		".codewiki/kb/system/knowledge.md": knowledgeDoc(),
		".codewiki/kb/system/source-map.md": sourceMapDoc(),
	};
	return {
		[WIKI_CONFIG_PATH]: configJson(project),
		...Object.fromEntries(
			Object.entries(markdownFiles).map(([path, body]) => [
				path,
				starterOkfConcept(path, body, sourceMap),
			]),
		),
		".codewiki/kb/system/source-map.yaml": sourceMapText,
	};
}

function configJson(project: string): string {
	return `${JSON.stringify(resolveWikiConfig({ project }), null, "\t")}\n`;
}

function starterOkfConcept(
	path: string,
	body: string,
	sourceMap: SourceMapContract,
): string {
	const frontmatter = {
		type: "Concept",
		title: markdownTitle(body),
		description: markdownDescription(body),
		tags: okfTagsForPath(path),
		timestamp: OKF_BOOTSTRAP_TIMESTAMP,
	};
	const extension = okfSourceMapExtensionForDoc(sourceMap, path);
	return serializeOkfDocument({
		frontmatter: extension
			? mergeOkfSourceMapExtension(frontmatter, extension)
			: frontmatter,
		body,
	});
}

function markdownTitle(body: string): string {
	return body.match(/^#\s+(.+)$/m)?.[1]?.trim() || "CodeWiki Knowledge";
}

function markdownDescription(body: string): string {
	return (
		body
			.split(/\n\n+/)
			.map((paragraph) => paragraph.trim().replace(/\s+/g, " "))
			.find(
				(paragraph) =>
					paragraph &&
					!paragraph.startsWith("#") &&
					!paragraph.startsWith("```") &&
					!paragraph.startsWith("- "),
			) || markdownTitle(body)
	);
}

function okfTagsForPath(path: string): string[] {
	return uniqueStrings([
		"codewiki",
		...path
			.replace(/^\.codewiki\/kb\//, "")
			.replace(/\.md$/, "")
			.split(/[/\s_-]+/),
	]);
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.toLowerCase().trim()).filter(Boolean)),
	);
}

function lexiconDoc(project: string): string {
	return `# Lexicon\n\n${project} uses CodeWiki terms exactly. Semantic loops are decision, planning, and implementation. Runtime is an outer coordination loop. Trace JSONL is append-only workflow truth. Views are disposable projections.\n`;
}

function productOverviewDoc(project: string): string {
	return `# Product Overview\n\n${project} uses CodeWiki to keep product intent, system design, and work evidence source-backed. The KB explains intended behavior. Trace records explain workflow history. Source and tests remain implementation truth.\n`;
}

function systemOverviewDoc(
	project: string,
	boundaries: BootstrapBoundary[],
): string {
	const boundaryLines = boundaries.length
		? boundaries.map((boundary) => `- ${boundary.kind}: \`${boundary.path}\``)
		: ["- No source boundaries detected yet."];
	return `# System Overview\n\n${project} CodeWiki state has three durable roots: KB knowledge, trace JSONL workflow records, and disposable views.\n\n## Detected boundaries\n\n${boundaryLines.join("\n")}\n`;
}

function loopModelDoc(): string {
	return `# Loop Model\n\nCodeWiki has exactly three semantic loops: decision, planning, and implementation. Runtime coordinates work outside those loops. Each semantic loop emits durable facts with \`loop\` naming the semantic authority and \`event\` naming what changed, plus output, progress, and exit status.\n`;
}

function loopDoc(title: string, body: string): string {
	return `# ${title}\n\n${body}\n\nExit conditions belong to this loop. They may use deterministic helper predicates, but verdict and routing stay loop-owned. Valid exit statuses are \`continue\`, \`exit\`, \`route_back\`, and \`blocked\`.\n`;
}

function tracesDoc(): string {
	return `# Traces\n\nTrace files live at \`.codewiki/traces/TRACE-*.jsonl\`. Records are append-only. Semantic events include \`loop\` plus a specific event such as \`rows_approved\`, \`work_units_created\`, or \`evidence_accepted\`. Runtime events coordinate claims and omit \`loop\`; they are not semantic loop truth.\n`;
}

function apiDoc(): string {
	return `# API\n\nCodeWiki host adapters should call core facades for state, config, decisions, planning, implementation, runtime work-unit claims, and archive lifecycle. Adapters must not introduce alternate workflow truth.\n`;
}

function runtimeDoc(): string {
	return `# Runtime\n\nRuntime schedules and claims executable work from disposable views. Runtime is an outer coordination loop, not a fourth semantic loop. Runtime policy comes from config and durable work state comes from traces.\n`;
}

function knowledgeDoc(): string {
	return `# Knowledge\n\nKnowledge lives in \`.codewiki/kb/**\`. Product docs explain user-facing intent. System docs explain architecture and loop behavior. Markdown concept docs use OKF v0.1 frontmatter with CodeWiki extension fields generated from \`source-map.yaml\` where ownership exists.\n`;
}

function sourceMapDoc(): string {
	return `# Source Map\n\n\`source-map.yaml\` maps source, tests, generated views, trace events, and owning KB docs. It remains the canonical machine-readable ownership contract while OKF concept frontmatter carries generated CodeWiki extension fields for knowledge exchange.\n`;
}

function simpleDoc(title: string, body: string): string {
	return `# ${title}\n\n${body}\n`;
}

function sourceMapYaml(boundaries: BootstrapBoundary[]): string {
	const sourcePatterns = boundaries
		.filter((boundary) => boundary.kind === "source")
		.map((boundary) => boundary.path);
	const testPatterns = boundaries
		.filter((boundary) => boundary.kind === "tests")
		.map((boundary) => boundary.path);
	const docPatterns = boundaries
		.filter((boundary) => boundary.kind === "docs")
		.map((boundary) => boundary.path);
	return [
		"schema_version: 1",
		"id: spec.system.source-map",
		"title: CodeWiki Source Ownership Map",
		"kind: source_map",
		"purpose: Canonical machine-readable mapping between source ownership roots, KB docs, tests, generated views, and trace/event responsibilities.",
		"source_docs:",
		"  - .codewiki/kb/system/source-map.md",
		"  - .codewiki/kb/system/loop-model.md",
		"  - .codewiki/kb/system/overview.md",
		"defaults:",
		"  inheritance: true",
		"  max_owner_depth: 2",
		"  excluded:",
		"    - node_modules/**",
		"    - .git/**",
		"    - .pi/**",
		"    - dist/**",
		"    - coverage/**",
		"rules:",
		"  - Source ownership is declared here; generated OKF extension fields derive from this map.",
		"  - Every active source ownership root needs one owning doc and tests or an explicit no-test rationale.",
		"components:",
		"  package:",
		"    doc: README.md",
		"    source:",
		"      - package.json",
		"      - README.md",
		"    tests:",
		...(testPatterns.length > 0
			? testPatterns.map((pattern) => `      - ${pattern}`)
			: ["      - .codewiki/kb/system/source-map.yaml"]),
		"    role: package_entrypoint",
		"  knowledge:",
		"    doc: .codewiki/kb/system/knowledge.md",
		"    source:",
		"      - .codewiki/kb/**",
		"    tests:",
		"      - .codewiki/kb/system/source-map.yaml",
		"    role: hot_knowledge",
		...(sourcePatterns.length > 0
			? [
					"  source:",
					"    doc: .codewiki/kb/system/overview.md",
					"    source:",
					...sourcePatterns.map((pattern) => `      - ${pattern}`),
					"    tests:",
					...(testPatterns.length > 0
						? testPatterns.map((pattern) => `      - ${pattern}`)
						: [
								"    test_policy: inherited",
								"    test_rationale: No test root detected during bootstrap.",
							]),
					"    role: implementation_source",
				]
			: []),
		...(docPatterns.length > 0
			? [
					"  repo_docs:",
					"    doc: .codewiki/kb/product/overview.md",
					"    source:",
					...docPatterns.map((pattern) => `      - ${pattern}`),
					"    test_policy: inherited",
					"    test_rationale: Repository documentation is reviewed through knowledge and source ownership checks.",
					"    role: repository_docs",
				]
			: []),
		"",
	].join("\n");
}

async function bootstrapProjectName(
	repoRoot: string,
	projectName?: string,
): Promise<string> {
	const explicit = text(projectName);
	if (explicit) return explicit;
	const packageJson = objectRecord(
		await readOptionalJson(join(repoRoot, "package.json")),
	);
	return text(packageJson.name) || basename(repoRoot) || "codewiki-project";
}

async function writeBootstrapFile(
	repoRoot: string,
	path: string,
	content: string,
	force: boolean,
	result: BootstrapResult,
): Promise<void> {
	const absolute = join(repoRoot, path);
	const exists = await pathExists(absolute);
	if (exists && !force) {
		result.skipped.push(path);
		return;
	}
	await mkdir(dirname(absolute), { recursive: true });
	await writeFile(absolute, content, "utf8");
	if (exists) result.updated.push(path);
	else result.created.push(path);
}

async function safeReaddir(path: string): Promise<{ name: string }[]> {
	try {
		return await readdir(path, { withFileTypes: true });
	} catch (error) {
		if (isNotFound(error)) return [];
		throw error;
	}
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function readOptionalJson(path: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (isNotFound(error)) return {};
		throw error;
	}
}

function objectRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function isNotFound(error: unknown): boolean {
	return Boolean(
		error &&
			typeof error === "object" &&
			"code" in error &&
			(error as { code?: unknown }).code === "ENOENT",
	);
}
