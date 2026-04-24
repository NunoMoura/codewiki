import { execFile } from "node:child_process";
import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { withLockedPaths } from "./mutation-queue";
import { resolveSetupRoot } from "./project-root";
import {
	type StarterBoundary,
	type StarterBrownfieldHints,
	starterDirectories,
	starterFiles,
} from "./templates";

const execFileAsync = promisify(execFile);
const GENERATED_OUTPUTS = [
	"wiki/index.md",
	"wiki/roadmap.md",
	".wiki/graph.json",
	".wiki/lint.json",
	".wiki/roadmap-state.json",
	".wiki/status-state.json",
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
	".wiki",
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

const repoPathToolField = Type.Optional(
	Type.String({
		description:
			"Optional repo root, or any path inside the target repo, when the current cwd is outside that repo.",
	}),
);

export function registerBootstrapFeatures(pi: ExtensionAPI): void {
	pi.registerCommand("wiki-bootstrap", {
		description:
			"Adopt or scaffold a repo-local codebase wiki, then start intelligent onboarding. Usage: /wiki-bootstrap [project name] [--force]",
		getArgumentCompletions: (prefix) => {
			const options = ["--force"];
			const items = options.filter((item) => item.startsWith(prefix));
			return items.length
				? items.map((value) => ({ value, label: value }))
				: null;
		},
		handler: async (args, ctx) => {
			try {
				const result = await bootstrapFromCurrentProject(
					ctx.cwd,
					parseArgs(args, { allowForce: true }),
				);
				ctx.ui.notify(
					formatSummary("Bootstrapped", result),
					result.updated.length + result.created.length > 0
						? "success"
						: "info",
				);
				queueOnboardingPrompt(pi, ctx, result);
			} catch (error) {
				ctx.ui.notify(formatError(error), "error");
			}
		},
	});

	pi.registerTool({
		name: "codewiki_setup",
		label: "Codewiki Setup",
		description:
			"Configure codewiki for the current project without overwriting existing starter files",
		promptSnippet:
			"Adopt or initialize the codebase wiki contract for the current project",
		promptGuidelines: [
			"Use this as the safe default when the repo should gain codewiki support but you do not want to overwrite starter files.",
			"This reuses an existing ancestor wiki root when present, otherwise it targets the enclosing git repo root when present, else the current working directory.",
		],
		parameters: Type.Object({
			projectName: Type.Optional(
				Type.String({
					description:
						"Project name to write into starter docs; defaults to current directory name.",
				}),
			),
			repoPath: repoPathToolField,
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await setupCodewiki(
				resolveToolStartDir(ctx.cwd, params.repoPath),
				{
					projectName: params.projectName,
				},
			);
			return {
				content: [{ type: "text", text: formatSummary("Configured", result) }],
				details: result,
			};
		},
	});

	pi.registerTool({
		name: "codewiki_bootstrap",
		label: "Codewiki Bootstrap",
		description:
			"Scaffold a starter repo-local codebase wiki into the current project",
		promptSnippet:
			"Scaffold the starter codebase wiki contract into the current project",
		promptGuidelines: [
			"Use this when the user wants to create the starter codebase wiki contract in the current project.",
			"This reuses an existing ancestor wiki root when present, otherwise it targets the enclosing git repo root when present, else the current working directory.",
			"Prefer force=false unless the user explicitly asks to overwrite starter files.",
		],
		parameters: Type.Object({
			projectName: Type.Optional(
				Type.String({
					description:
						"Project name to write into starter docs; defaults to current directory name.",
				}),
			),
			force: Type.Optional(
				Type.Boolean({
					description: "Overwrite existing starter files if true.",
				}),
			),
			repoPath: repoPathToolField,
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await bootstrapFromCurrentProject(
				resolveToolStartDir(ctx.cwd, params.repoPath),
				{
					projectName: params.projectName,
					force: params.force ?? false,
				},
			);
			return {
				content: [
					{ type: "text", text: formatSummary("Bootstrapped", result) },
				],
				details: result,
			};
		},
	});
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
	const projectName = (options.projectName?.trim() || basename(root)).trim();
	const date = new Date().toISOString().slice(0, 10);
	const brownfieldHints = await detectBrownfieldHints(root);
	const inferredProjectState =
		brownfieldHints.boundaries.length > 0 || (await looksLikeBoundary(root, 0))
			? "brownfield"
			: "greenfield";
	const files = starterFiles({ projectName, date, brownfieldHints });

	return withLockedPaths(bootstrapTargetPaths(root, files), async () => {
		const result: BootstrapResult = {
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

		for (const relativeDir of starterDirectories()) {
			await mkdir(resolve(root, relativeDir), { recursive: true });
		}

		for (const [relativePath, content] of Object.entries(files)) {
			const absolutePath = resolve(root, relativePath);
			const exists = await pathExists(absolutePath);
			if (exists && !options.force) {
				result.skipped.push(relativePath);
				continue;
			}
			await mkdir(dirname(absolutePath), { recursive: true });
			await writeFile(absolutePath, content, "utf8");
			if (exists) result.updated.push(relativePath);
			else result.created.push(relativePath);
		}

		await runRebuild(root);
		return result;
	});
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
	const commands = [
		["python3", "scripts/rebuild_docs_meta.py"],
		["python", "scripts/rebuild_docs_meta.py"],
	];

	let lastError: unknown;
	for (const command of commands) {
		try {
			await execFileAsync(command[0], command.slice(1), {
				cwd: root,
				timeout: 120_000,
			});
			return;
		} catch (error) {
			lastError = error;
		}
	}
	throw new Error(`Bootstrap rebuild failed: ${formatError(lastError)}`);
}

function parseArgs(
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

function formatSummary(
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

function resolveToolStartDir(cwd: string, repoPath?: string): string {
	return repoPath ? resolve(cwd, repoPath) : cwd;
}

function queueOnboardingPrompt(
	pi: ExtensionAPI,
	ctx: { isIdle?: () => boolean },
	result: BootstrapResult,
): void {
	const prompt = [
		`Intelligently onboard the project after /wiki-bootstrap completed for ${result.projectName}.`,
		`Wiki root: ${result.root}`,
		`Inferred project state: ${result.inferredProjectState}`,
		`Inferred boundaries: ${result.inferredBoundaries.length > 0 ? result.inferredBoundaries.map((path) => `\`${path}\``).join(", ") : "none detected yet"}`,
		"Tasks:",
		"1. Inspect the repo and current wiki/spec structure.",
		"2. Confirm or refine inferred project shape: greenfield vs brownfield, app vs library vs service vs monorepo, and major ownership seams.",
		"3. Infer what can be learned confidently from the codebase before asking the user anything.",
		"4. Ask at most 4 high-value questions only when answers materially reduce ambiguity or edit scope.",
		"5. Use roadmap as the top-level container, tasks as atomic work units, and Pi sessions as native execution history.",
		"Output format:",
		"- Inferred project shape",
		"- Confident assumptions",
		"- Questions for the user (only if truly needed)",
		"- Suggested next step using /wiki-status or /wiki-resume",
		"Do not dump large file listings. Be concise and evidence-backed.",
	].join("\n");

	try {
		if (typeof ctx.isIdle === "function" && ctx.isIdle())
			pi.sendUserMessage(prompt);
		else pi.sendUserMessage(prompt, { deliverAs: "followUp" });
	} catch {
		// Ignore in smoke tests or non-standard execution contexts.
	}
}

async function detectBrownfieldHints(
	root: string,
): Promise<StarterBrownfieldHints> {
	const boundaries = await discoverBrownfieldBoundaries(root);
	const repoMarkdownGlobs = unique([
		"README.md",
		...boundaries.map((boundary) => `${boundary.codePath}/**/README.md`),
	]);
	const codeGlobs = boundaries.length
		? unique([
				...boundaries.map((boundary) => `${boundary.codePath}/**`),
				...((await pathExists(resolve(root, "scripts"))) ? ["scripts/**"] : []),
			])
		: ["src/**", "app/**", "backend/**", "server/**"];

	return {
		boundaries,
		repoMarkdownGlobs,
		codeGlobs,
	};
}

async function discoverBrownfieldBoundaries(
	root: string,
): Promise<StarterBoundary[]> {
	const entries = await readVisibleDirectories(root);
	const boundaries: StarterBoundary[] = [];

	for (const entry of entries) {
		if (CONTAINER_DIR_NAMES.has(entry)) {
			const children = await readVisibleDirectories(resolve(root, entry));
			for (const child of children) {
				const relativePath = `${entry}/${child}`;
				if (await looksLikeBoundary(resolve(root, relativePath), 0)) {
					boundaries.push(makeBoundary(relativePath));
				}
			}
			continue;
		}

		if (await looksLikeBoundary(resolve(root, entry), 0)) {
			boundaries.push(makeBoundary(entry));
		}
	}

	return boundaries.sort((a, b) => a.slug.localeCompare(b.slug));
}

async function readVisibleDirectories(path: string): Promise<string[]> {
	const entries = await readdir(path, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.filter((name) => !name.startsWith(".") && !EXCLUDED_DIR_NAMES.has(name))
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

	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue;
		if (entry.isDirectory()) {
			if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
			if (await looksLikeBoundary(resolve(path, entry.name), depth + 1))
				return true;
			continue;
		}
		if (!entry.isFile()) continue;
		if (MANIFEST_FILE_NAMES.has(entry.name)) return true;
		if (CODE_FILE_EXTENSIONS.has(extname(entry.name))) return true;
	}

	return false;
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
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
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
