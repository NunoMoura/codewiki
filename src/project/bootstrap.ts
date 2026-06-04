import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { renderPromptAsset } from "../adapters/pi/prompt-assets.ts";
import { withLockedPaths } from "../shared/lock.ts";
import { resolveSetupRoot } from "./root.ts";
import {
	type StarterBoundary,
	type StarterBrownfieldHints,
	starterDirectories,
	starterFiles,
} from "./templates.ts";

const GENERATED_OUTPUTS = [
	".codewiki/index_graph.json",
] as const;
const CONTAINER_DIR_NAMES = new Set([
	"apps",
	"components",
	"domains",
	"extensions",
	"libs",
	"modules",
	"packages",
	"services",
	"skills",
	"surfaces",
]);
const EXCLUDED_DIR_NAMES = new Set([
	".bandwagon",
	".docs",
	".codewiki",
	".git",
	".github",
	".idea",
	".next",
	".nuxt",
	".pi",
	".pytest_cache",
	".turbo",
	".venv",
	".vscode",
	"__pycache__",
	"assets",
	"build",
	"coverage",
	"dist",
	"docs",
	"wiki",
	"fixtures",
	"migrations",
	"node_modules",
	"out",
	"public",
	"scripts",
	"static",
	"target",
	"test",
	"tests",
	"tmp",
	"vendor",
]);
const CODE_FILE_EXTENSIONS = new Set([
	".c",
	".cc",
	".cpp",
	".cs",
	".go",
	".java",
	".js",
	".jsx",
	".kt",
	".mjs",
	".php",
	".py",
	".rb",
	".rs",
	".scala",
	".swift",
	".ts",
	".tsx",
]);
const MANIFEST_FILE_NAMES = new Set([
	"Cargo.toml",
	"go.mod",
	"package.json",
	"pom.xml",
	"pyproject.toml",
	"requirements.txt",
	"setup.py",
	"tsconfig.json",
]);

export interface BootstrapOptions {
	projectName?: string;
	force?: boolean;
}

export interface BootstrapResult {
	root: string;
	projectName: string;
	created: string[];
	updated: string[];
	skipped: string[];
	inferredProjectState: "greenfield" | "brownfield";
	inferredBoundaries: string[];
}

export function bootstrapToolPorts() {
	return {
		resolveStartDir: resolveToolStartDir,
		setup: setupCodewiki,
		bootstrap: bootstrapFromCurrentProject,
		format: formatBootstrapSummary,
	};
}

export async function setupCodewiki(
	startDir: string,
	options: Omit<BootstrapOptions, "force"> = {},
): Promise<BootstrapResult> {
	const root = await resolveSetupRoot(startDir);
	return bootstrapCodewiki(root, {
		projectName: options.projectName,
		force: false,
	});
}

export async function bootstrapFromCurrentProject(
	startDir: string,
	options: BootstrapOptions = {},
): Promise<BootstrapResult> {
	const root = await resolveSetupRoot(startDir);
	return bootstrapCodewiki(root, options);
}

export async function bootstrapCodewiki(
	root: string,
	options: BootstrapOptions = {},
): Promise<BootstrapResult> {
	const projectName = bootstrapProjectName(root, options);
	const date = new Date().toISOString().slice(0, 10);
	const brownfieldHints = await detectBrownfieldHints(root);
	const inferredProjectState = await inferProjectState(root, brownfieldHints);
	const files = starterFiles({ projectName, date, brownfieldHints });

	return withLockedPaths(bootstrapTargetPaths(root, files), async () => {
		const result = createBootstrapResult(
			root,
			projectName,
			inferredProjectState,
			brownfieldHints,
		);
		await ensureStarterDirectories(root);
		await writeStarterFiles(root, files, options.force === true, result);
		await runRebuild(root);
		return result;
	});
}

function bootstrapProjectName(root: string, options: BootstrapOptions): string {
	return (options.projectName?.trim() || basename(root)).trim();
}

async function inferProjectState(
	root: string,
	brownfieldHints: StarterBrownfieldHints,
): Promise<BootstrapResult["inferredProjectState"]> {
	if (brownfieldHints.boundaries.length > 0) return "brownfield";
	if (await looksLikeBoundary(root, 0)) return "brownfield";
	return "greenfield";
}

function createBootstrapResult(
	root: string,
	projectName: string,
	inferredProjectState: BootstrapResult["inferredProjectState"],
	brownfieldHints: StarterBrownfieldHints,
): BootstrapResult {
	return {
		root,
		projectName,
		created: [],
		updated: [],
		skipped: [],
		inferredProjectState,
		inferredBoundaries: brownfieldHints.boundaries.map(
			(boundary) => boundary.codePath,
		),
	};
}

async function ensureStarterDirectories(root: string): Promise<void> {
	await Promise.all(
		starterDirectories().map((relativeDir) =>
			mkdir(resolve(root, relativeDir), { recursive: true }),
		),
	);
}

async function writeStarterFiles(
	root: string,
	files: Record<string, string>,
	force: boolean,
	result: BootstrapResult,
): Promise<void> {
	await Object.entries(files).reduce(async (previous, [relativePath, content]) => {
		await previous;
		const absolutePath = resolve(root, relativePath);
		const exists = await pathExists(absolutePath);
		if (exists && !force) {
			result.skipped.push(relativePath);
			return;
		}
		await mkdir(dirname(absolutePath), { recursive: true });
		await writeFile(absolutePath, content, "utf8");
		if (exists) result.updated.push(relativePath);
		else result.created.push(relativePath);
	}, Promise.resolve());
}

function bootstrapTargetPaths(
	root: string,
	files: Record<string, string>,
): string[] {
	return [...Object.keys(files), ...GENERATED_OUTPUTS].map((relativePath) =>
		resolve(root, relativePath),
	);
}

async function runRebuild(root: string): Promise<void> {
	try {
		const { CodewikiRebuilder } = await import("../state/graph/rebuilder.js");
		await new CodewikiRebuilder(root).rebuildAll();
	} catch (error) {
		console.error("Bootstrap rebuild failed with stack:", error);
		throw new Error(`Bootstrap rebuild failed: ${formatError(error)}`);
	}
}

export function parseBootstrapArgs(
	args: string,
	options: { allowForce: boolean },
): BootstrapOptions {
	const force = options.allowForce && /(?:^|\s)--force(?:\s|$)/.test(args);
	const cleaned = args.replace(/(?:^|\s)--force(?:\s|$)/g, " ").trim();
	return {
		force,
		projectName: cleaned || undefined,
	};
}

export function formatBootstrapSummary(
	action: "Configured" | "Bootstrapped",
	result: BootstrapResult,
): string {
	const parts = [
		`${action} ${result.projectName} wiki at ${result.root}.`,
		`created=${result.created.length}`,
		`updated=${result.updated.length}`,
		`skipped=${result.skipped.length}`,
		`shape=${result.inferredProjectState}`,
		`boundaries=${result.inferredBoundaries.length}`,
	];
	return parts.join(" ");
}

export function resolveToolStartDir(cwd: string, repoPath?: string): string {
	if (repoPath) return resolve(cwd, repoPath);
	return cwd;
}

function formatInferredBoundaries(paths: string[]): string {
	if (paths.length === 0) return "none detected yet";
	return paths.map((path) => `\`${path}\``).join(", ");
}

export function renderOnboardingPrompt(result: BootstrapResult): string {
	return renderPromptAsset("bootstrap/onboarding.md", {
		projectName: result.projectName,
		root: result.root,
		inferredProjectState: result.inferredProjectState,
		inferredBoundaries: formatInferredBoundaries(result.inferredBoundaries),
	});
}

async function detectBrownfieldHints(
	root: string,
): Promise<StarterBrownfieldHints> {
	const boundaries = await discoverBrownfieldBoundaries(root);
	return {
		boundaries,
		repoMarkdownGlobs: repoMarkdownGlobsForBoundaries(boundaries),
		codeGlobs: await codeGlobsForBoundaries(root, boundaries),
	};
}

function repoMarkdownGlobsForBoundaries(
	boundaries: StarterBoundary[],
): string[] {
	return unique([
		"README.md",
		...boundaries.map((boundary) => `${boundary.codePath}/**/README.md`),
	]);
}

async function codeGlobsForBoundaries(
	root: string,
	boundaries: StarterBoundary[],
): Promise<string[]> {
	if (boundaries.length === 0) return ["src/**", "app/**", "backend/**", "server/**"];
	const globs = boundaries.map((boundary) => `${boundary.codePath}/**`);
	if (await pathExists(resolve(root, "scripts"))) globs.push("scripts/**");
	return unique(globs);
}

async function discoverBrownfieldBoundaries(
	root: string,
): Promise<StarterBoundary[]> {
	const entries = await readVisibleDirectories(root);
	const boundaryGroups = await Promise.all(
		entries.map((entry) => discoverEntryBoundaries(root, entry)),
	);
	return boundaryGroups.flat().sort((a, b) => a.slug.localeCompare(b.slug));
}

async function discoverEntryBoundaries(
	root: string,
	entry: string,
): Promise<StarterBoundary[]> {
	if (CONTAINER_DIR_NAMES.has(entry)) return discoverContainerBoundaries(root, entry);
	if (await looksLikeBoundary(resolve(root, entry), 0)) return [makeBoundary(entry)];
	return [];
}

async function discoverContainerBoundaries(
	root: string,
	entry: string,
): Promise<StarterBoundary[]> {
	const children = await readVisibleDirectories(resolve(root, entry));
	const candidates = await Promise.all(
		children.map(async (child) => {
			const relativePath = `${entry}/${child}`;
			if (await looksLikeBoundary(resolve(root, relativePath), 0)) {
				return makeBoundary(relativePath);
			}
			return null;
		}),
	);
	return candidates.filter((boundary): boundary is StarterBoundary => Boolean(boundary));
}

async function readVisibleDirectories(path: string): Promise<string[]> {
	const entries = await readdir(path, { withFileTypes: true });
	return entries
		.flatMap((entry) => {
			if (!entry.isDirectory()) return [];
			if (entry.name.startsWith(".") || EXCLUDED_DIR_NAMES.has(entry.name)) return [];
			return [entry.name];
		})
		.sort((a, b) => a.localeCompare(b));
}

async function looksLikeBoundary(
	path: string,
	depth: number,
): Promise<boolean> {
	if (depth > 2) return false;

	let entries;
	try {
		entries = await readdir(path, { withFileTypes: true });
	} catch {
		return false;
	}

	const checks = await Promise.all(
		entries.flatMap((entry) => {
			if (entry.name.startsWith(".")) return [];
			return [entryLooksLikeBoundary(path, depth, entry)];
		}),
	);
	return checks.some(Boolean);
}

async function entryLooksLikeBoundary(
	path: string,
	depth: number,
	entry: { name: string; isDirectory(): boolean; isFile(): boolean },
): Promise<boolean> {
	if (entry.isDirectory()) {
		if (EXCLUDED_DIR_NAMES.has(entry.name)) return false;
		return looksLikeBoundary(resolve(path, entry.name), depth + 1);
	}
	if (!entry.isFile()) return false;
	return MANIFEST_FILE_NAMES.has(entry.name) || CODE_FILE_EXTENSIONS.has(extname(entry.name));
}

function makeBoundary(relativePath: string): StarterBoundary {
	const segments = relativePath.split("/").filter(Boolean);
	const slug = segments.map(sanitizeSlugSegment).join("/");
	return {
		codePath: segments.join("/"),
		slug,
		title: segments.map(titleCase).join(" / "),
	};
}

function sanitizeSlugSegment(value: string): string {
	return (
		value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "boundary"
	);
}

function titleCase(value: string): string {
	return value
		.split(/[^a-zA-Z0-9]+/)
		.flatMap(titleCasePart)
		.join(" ");
}

function titleCasePart(part: string): string[] {
	if (!part) return [];
	return [part.charAt(0).toUpperCase() + part.slice(1)];
}

function unique(values: string[]): string[] {
	return [...new Set(values)].filter(Boolean);
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function formatError(error: unknown): string {
	if (!error) return "Unknown error";
	if (error instanceof Error) {
		const withOutput = error as Error & { stderr?: string; stdout?: string };
		const parts = [error.message];
		const stderr = withOutput.stderr?.trim();
		const stdout = withOutput.stdout?.trim();
		if (stderr) parts.push(stderr);
		else if (stdout) parts.push(stdout);
		return parts.join("\n");
	}
	return String(error);
}
