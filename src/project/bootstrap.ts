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
	".codewiki/kb/product/stories/maintainer",
	".codewiki/kb/system/components",
	".codewiki/kb/system/flows",
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
	const sourcePatterns = boundaries
		.filter((boundary) => boundary.kind === "source")
		.map((boundary) => boundary.path);
	const testPatterns = boundaries
		.filter((boundary) => boundary.kind === "tests")
		.map((boundary) => boundary.path);
	return {
		[WIKI_CONFIG_PATH]: configJson(project),
		".codewiki/kb/lexicon.md": nativeDocument(
			{
				okf_version: "0.2",
				type: "Lexicon",
				title: `${project} Lexicon`,
				description: `Active vocabulary for ${project}.`,
				status: "stable",
				tags: ["system", "vocabulary"],
			},
			`# ${project} Lexicon\n\n| Term | Definition | Owner |\n| --- | --- | --- |\n| Knowledge | Accepted desired Product and System state. | [Knowledge](system/components/knowledge.md) |\n| Maintainer | Accountable human who accepts project intent. | [Maintainer](product/users/maintainer.md) |\n`,
		),
		".codewiki/kb/product/DESIGN.md": starterDesignDoc(project),
		".codewiki/kb/product/users/maintainer.md": nativeDocument(
			{
				type: "User",
				title: "Maintainer",
				description: `Accountable human who maintains ${project} intent.`,
				status: "stable",
				tags: ["product", "user"],
			},
			`# Maintainer\n\nMaintainers accept desired state, authorize protected actions, and inspect whether ${project} realization remains aligned.\n`,
		),
		".codewiki/kb/product/stories/maintainer/maintain-intent.md": nativeDocument(
			{
				type: "User Story",
				title: "Maintain Intent",
				description: `A maintainer wants ${project} desired state kept close to its realization.`,
				status: "stable",
				codewiki_user: "/product/users/maintainer.md",
				tags: ["product", "story"],
			},
			`# Maintain Intent\n\nAs a maintainer, I want accepted Product and System intent recorded as desired Knowledge so implementation can be checked against an explicit target.\n`,
		),
		".codewiki/kb/system/components/source.md": starterComponent({
			id: "source",
			title: "Source",
			description: `Owns ${project} production source and test realization.`,
			sourcePatterns,
			testPatterns,
			body: `# Source\n\nSource and tests realize accepted ${project} Knowledge. Each production path has one intended Component owner.\n`,
		}),
		".codewiki/kb/system/components/knowledge.md": starterComponent({
			id: "knowledge",
			title: "Knowledge",
			description: `Owns ${project} desired-state concepts and topology.`,
			sourcePatterns: [".codewiki/kb/**"],
			testPatterns: [],
			body: `# Knowledge\n\nKnowledge contains accepted desired state only. Git carries content history, while generated navigation remains disposable.\n`,
		}),
		".codewiki/kb/system/flows/project-realization.md": nativeDocument(
			{
				type: "System Flow",
				title: "Project Realization",
				description: `Relates ${project} desired Knowledge to source and test realization.`,
				status: "stable",
				tags: ["system", "flow"],
				codewiki_relationships: [realizesMaintainerStory("Project realization provides the stable alignment path required by this Story.")],
			},
			`# Project Realization\n\nAccepted Knowledge constrains source and tests. Implementation Evidence establishes realization without allowing executable state to silently redefine intent.\n`,
		),
		".codewiki/kb/system/diagrams/architecture.yaml": starterArchitectureDiagram(),
	};
}

function configJson(project: string): string {
	return `${JSON.stringify(resolveWikiConfig({ project }), null, "\t")}\n`;
}

function nativeDocument(
	frontmatter: Record<string, unknown>,
	body: string,
): string {
	return serializeOkfDocument({ frontmatter, body });
}

function starterComponent(input: {
	id: string;
	title: string;
	description: string;
	sourcePatterns: string[];
	testPatterns: string[];
	body: string;
}): string {
	return nativeDocument(
		{
			type: "System Component",
			title: input.title,
			description: input.description,
			status: "stable",
			tags: ["system", "component"],
			codewiki_component: input.id,
			codewiki_source_patterns: input.sourcePatterns,
			codewiki_test_patterns: input.testPatterns,
			...(input.testPatterns.length === 0
				? {
						codewiki_test_policy: "inherited",
						codewiki_test_rationale:
							"This Component is verified by bundle-level Knowledge validation.",
					}
				: {}),
			codewiki_relationships: [
				realizesMaintainerStory(`${input.title} supplies the System responsibility required by this Story.`),
			],
		},
		input.body,
	);
}

function realizesMaintainerStory(rationale: string): Record<string, string> {
	return {
		type: "realizes",
		target: "/product/stories/maintainer/maintain-intent.md",
		rationale,
	};
}

function starterDesignDoc(project: string): string {
	return nativeDocument(
		{
			version: "alpha",
			name: project,
			colors: {
				canvas: "#F8FAFC",
				surface: "#FFFFFF",
				ink: "#111827",
				accent: "#0F766E",
				error: "#B42318",
			},
			typography: {
				body: {
					fontFamily: "system-ui",
					fontSize: "16px",
					fontWeight: 400,
					lineHeight: 1.5,
				},
			},
			spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px" },
			rounded: { sm: "4px", md: "8px", lg: "12px" },
			components: {},
			type: "Design System",
			title: `${project} Design System`,
			description: `Visual and interaction rules for ${project}.`,
			status: "stable",
			tags: ["product", "design"],
		},
		`# ${project} Design System\n\n## Overview\n\nUse calm, accessible surfaces that expose exact project facts without fabricating status or certainty.\n\n## Colors\n\nUse accent for permitted action and error only for failure or danger. Color never carries meaning alone.\n\n## Typography\n\nUse readable system typography and preserve visible focus.\n\n## Layout\n\nUse mobile-first hierarchy with no horizontal overflow.\n\n## Elevation & Depth\n\nPrefer borders and tonal surfaces over decorative shadows.\n\n## Shapes\n\nUse the token scale consistently and preserve 44px touch targets.\n\n## Iconography\n\nUse consistent labeled icons that reinforce text without carrying state alone.\n\n## Components\n\nComponents expose state, authority, and unavailable conditions before progressive detail.\n\n## Do's and Don'ts\n\n- Do preserve accessible contrast and reduced motion.\n- Don't hide uncertainty or duplicate System policy.\n\n## Visual References\n\nTreat visual references as illustrative inputs and validate resulting surfaces against tokens, accessibility requirements, and exact project facts.\n`,
	);
}

function starterArchitectureDiagram(): string {
	return `id: architecture
purpose: Show desired Knowledge and executable source as separately owned Components connected by one stable realization Flow.
components:
  - { id: source, concept: /system/components/source.md, label: Source, zone: repository }
  - { id: knowledge, concept: /system/components/knowledge.md, label: Knowledge, zone: repository }
connections:
  - { id: source-reads-knowledge, from: source, to: knowledge, type: reads, label: reads accepted desired state }
  - { id: knowledge-returns-source, from: knowledge, to: source, type: returns, label: returns validated intent and ownership }
flows:
  - concept: /system/flows/project-realization.md
    paths:
      - connections: [source-reads-knowledge, knowledge-returns-source]
`;
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
