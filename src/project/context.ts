import { resolve, dirname, basename } from "node:path";
import type { RoadmapTaskRecord } from "../roadmap/types.ts";
import type { TaskSessionLinkRecord } from "../session/types.ts";
import type { ResolvedStatusDockProject, StatusDockPrefs } from "../state/types.ts";
import {
	nowIso,
	unique,
	formatError,
} from "../shared/utils.ts";
import {
	readStatusDockPrefs,
	writeStatusDockPrefs,
} from "../state/local/status-dock-prefs.ts";
import type { CodewikiFileStore } from "./local/file-store.ts";
import { nodeFileStore } from "./local/file-store.ts";
import type { WikiProject, DocsConfig } from "./types.ts";

export interface CodewikiUiPort {
	setStatus(key: string, value: string | undefined): void;
	input?(prompt: string, initial?: string): Promise<string>;
}

export interface CodewikiContextPort {
	cwd?: string;
	workspaceRoot?: string;
	ui: CodewikiUiPort | any;
}

/**
 * Load a wiki project from a root directory.
 */
export async function loadProject(
	root: string,
	files: CodewikiFileStore = nodeFileStore(),
): Promise<WikiProject> {
	const configPath = resolve(root, ".codewiki/config.json");
	let config: DocsConfig = {};
	try {
		config = await files.readJson<DocsConfig>(configPath);
	} catch (error) {
		throw new Error(`No .codewiki/config.json found at ${configPath}. ${formatError(error)}`);
	}

	const metaRoot = config.meta_root || ".codewiki";
	const viewsRoot = config.views_root || ".codewiki/views";
	const roadmapEventsPath = "";

	return {
		root,
		config,
		docsRoot: config.docs_root || ".codewiki/kb",
		specsRoot: config.specs_root || config.docs_root || ".codewiki/kb",
		evidenceRoot: config.evidence_root || "",
		researchRoot: config.research_root || ".codewiki/research",
		indexPath: config.index_path || "",
		roadmapPath: config.roadmap_path || ".codewiki/roadmap/queue.json",
		roadmapDocPath: config.roadmap_doc_path || "",
		roadmapEventsPath,
		metaRoot,
		viewsRoot,
		label: config.project_name || basename(root),
		configPath,
		graphPath: resolve(root, metaRoot, "index_graph.json"),
		lintPath: resolve(root, metaRoot, "index_graph.json"),
		roadmapStatePath: resolve(root, metaRoot, "index_graph.json"),
		statusStatePath: resolve(root, metaRoot, "index_graph.json"),
		eventsPath: "",
	};
}

/**
 * Find the wiki root by searching upwards for a .codewiki directory.
 */
export async function findWikiRoot(
	ctx: CodewikiContextPort,
	files: CodewikiFileStore = nodeFileStore(),
): Promise<string | null> {
	return findWikiRootFromPath(ctx.cwd || ctx.workspaceRoot || "", files);
}

export async function findWikiRootFromPath(
	startPath: string,
	files: CodewikiFileStore = nodeFileStore(),
): Promise<string | null> {
	if (!startPath) return null;
	let current = resolve(startPath);
	if ((await files.pathExists(current)) && !(await files.isDirectory(current))) {
		current = dirname(current);
	}
	while (true) {
		const configPath = resolve(current, ".codewiki", "config.json");
		if (await files.pathExists(configPath)) return current;
		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

/**
 * Load the project for the current extension context.
 */
export async function maybeLoadProject(
	ctxOrPath: CodewikiContextPort | string,
	files: CodewikiFileStore = nodeFileStore(),
): Promise<WikiProject | null> {
	let wikiRoot: string | null = null;
	if (typeof ctxOrPath === "string") {
		wikiRoot = await findWikiRootFromPath(ctxOrPath, files);
	} else {
		wikiRoot = await findWikiRoot(ctxOrPath, files);
	}
	if (!wikiRoot) return null;
	return loadProject(wikiRoot, files);
}

/**
 * Append a task session event to the events file.
 */
export async function appendTaskSessionEvent(
	project: WikiProject,
	task: RoadmapTaskRecord,
	link: TaskSessionLinkRecord,
	sessionId: string,
): Promise<void> {
	const { appendProjectEvent } = await import("../roadmap/runtime.ts");
	await appendProjectEvent(project, {
		ts: nowIso(),
		kind: "roadmap_task_session_link",
		taskId: task.id,
		title: task.title,
		action: link.action,
		summary: link.summary,
		files_touched: link.filesTouched,
		spawnedTaskIds: link.spawnedTaskIds,
		session_id: sessionId,
	});
}

/**
 * Normalize a relative path.
 */
export function normalizeRelativePath(path: string): string {
	return path.replace(/^\.\//, "").replace(/\/$/, "");
}

/**
 * Normalize a relative path if it's not null/undefined.
 */
export function optionalRelativePath(path: string | undefined): string | undefined {
	if (!path) return undefined;
	return normalizeRelativePath(path);
}

/**
 * Reload the project configuration.
 */
export async function reloadProjectConfig(project: WikiProject): Promise<WikiProject> {
	return loadProject(project.root);
}

export const DEFAULT_DOCS_ROOT = ".codewiki/kb";
export const DEFAULT_SPECS_ROOT = ".codewiki/kb";
export const DEFAULT_EVIDENCE_ROOT = "";
export const DEFAULT_INDEX_PATH = "";
export const DEFAULT_ROADMAP_PATH = ".codewiki/roadmap/queue.json";
export const DEFAULT_ROADMAP_DOC_PATH = "";
export const DEFAULT_ROADMAP_EVENTS_PATH = "";
export const DEFAULT_META_ROOT = ".codewiki";

export async function rememberStatusDockProject(
	project: WikiProject,
	prefs: StatusDockPrefs | null = null,
): Promise<void> {
	const current = prefs ?? (await readStatusDockPrefs());
	if (current.lastRepoPath === project.root) return;
	await writeStatusDockPrefs({ ...current, lastRepoPath: project.root });
}

function contextStartPath(ctx: CodewikiContextPort): string {
	return ctx.cwd || ctx.workspaceRoot || process.cwd();
}

function statusDockFallbackRoots(prefs: StatusDockPrefs): string[] {
	const roots: string[] = [];
	if (prefs.mode === "pin" && prefs.pinnedRepoPath) roots.push(prefs.pinnedRepoPath);
	if (prefs.lastRepoPath) roots.push(prefs.lastRepoPath);
	return unique(roots);
}

async function statusDockResult(
	project: WikiProject,
	prefs: StatusDockPrefs,
	source: "cwd" | "pinned",
): Promise<ResolvedStatusDockProject> {
	const { maybeReadStatusState } = await import("../state/artifacts.ts");
	await rememberStatusDockProject(project, prefs);
	return {
		...project,
		project,
		statusState: (await maybeReadStatusState(project.statusStatePath)) ?? undefined,
		source,
	};
}

async function firstRememberedProject(
	prefs: StatusDockPrefs,
): Promise<WikiProject | null> {
	return firstLoadableProject(statusDockFallbackRoots(prefs));
}

async function firstLoadableProject(
	roots: string[],
	index = 0,
): Promise<WikiProject | null> {
	const root = roots[index];
	if (!root) return null;
	const project = await maybeLoadProject(root);
	if (project) return project;
	return firstLoadableProject(roots, index + 1);
}

export async function resolveStatusDockProject(
	ctx: CodewikiContextPort,
	options?: { allowWhenOff?: boolean },
): Promise<ResolvedStatusDockProject | null> {
	const prefs = await readStatusDockPrefs();
	if (prefs.mode === "off" && !options?.allowWhenOff) return null;
	const localProject = await maybeLoadProject(ctx.cwd || ctx.workspaceRoot || "");
	if (localProject) return statusDockResult(localProject, prefs, "cwd");
	const fallbackProject = await firstRememberedProject(prefs);
	if (!fallbackProject) return null;
	return statusDockResult(fallbackProject, prefs, "pinned");
}

async function rememberAndReturnProject(
	project: WikiProject,
	prefs?: StatusDockPrefs,
): Promise<WikiProject> {
	await rememberStatusDockProject(project, prefs ?? null);
	return project;
}

async function resolveExplicitProject(
	path: string,
	errorMessage: string,
): Promise<WikiProject> {
	const project = await maybeLoadProject(path);
	if (!project) throw new Error(errorMessage);
	return rememberAndReturnProject(project);
}

async function resolveLocalProject(startDir: string): Promise<WikiProject | null> {
	try {
		const project = await maybeLoadProject(startDir);
		if (project) return rememberAndReturnProject(project);
	} catch {
		// Fall back to pinned/last-used repo below.
	}
	return null;
}

async function resolveRememberedProject(): Promise<WikiProject | null> {
	const prefs = await readStatusDockPrefs();
	const project = await firstRememberedProject(prefs);
	if (!project) return null;
	return rememberAndReturnProject(project, prefs);
}

export async function resolveToolProject(
	startDir: string,
	repoPath: string | undefined,
	toolName: string,
): Promise<WikiProject> {
	if (repoPath) {
		const requestedPath = resolve(startDir, repoPath);
		return resolveExplicitProject(
			requestedPath,
			`${toolName}: could not resolve repoPath ${requestedPath}. No .codewiki/config.json found in that path or its ancestors.`,
		);
	}

	const localProject = await resolveLocalProject(startDir);
	if (localProject) return localProject;
	const rememberedProject = await resolveRememberedProject();
	if (rememberedProject) return rememberedProject;
	throw new Error(
		[
			`${toolName}: no repo-local wiki found from ${startDir}.`,
			"codewiki tools are available globally, but each run mutates one repo-local wiki.",
			`Retry with repoPath set to the target repo root, or any path inside that repo.`,
		].join(" "),
	);
}

async function loadPickedCommandProject(
	ctx: CodewikiContextPort,
	commandName: string,
	startPath: string,
): Promise<WikiProject | null> {
	const { findWikiRootsBelow } = await import("./root.ts");
	const candidates = await findWikiRootsBelow(startPath);
	if (candidates.length === 0) return null;
	const pickedRoot = await pickCommandProjectRoot(ctx, commandName, candidates);
	if (!pickedRoot) return null;
	return rememberAndReturnProject(await loadProject(pickedRoot));
}

export async function resolveCommandProject(
	ctx: CodewikiContextPort,
	pathArg: string | null,
	commandName: string,
): Promise<WikiProject> {
	const startPath = contextStartPath(ctx);
	if (pathArg) {
		const requestedPath = resolve(startPath, pathArg);
		return resolveExplicitProject(
			requestedPath,
			`${commandName}: could not resolve repo path ${requestedPath}. No .codewiki/config.json found in that path or its ancestors.`,
		);
	}

	const localProject = await resolveLocalProject(ctx.cwd || ctx.workspaceRoot || "");
	if (localProject) return localProject;
	const pickedProject = await loadPickedCommandProject(ctx, commandName, startPath);
	if (pickedProject) return pickedProject;
	throw new Error(
		`${commandName}: No repo-local wiki found from ${startPath}. CodeWiki commands may be loaded globally, but each run targets one repo-local wiki. Use /wiki-bootstrap first, work inside a repo with .codewiki/config.json, or pass an explicit repo path like /${commandName} /path/to/repo.`,
	);
}

async function pickCommandProjectRoot(
	ctx: CodewikiContextPort,
	commandName: string,
	candidates: string[],
): Promise<string | null> {
	if (candidates.length === 1) return candidates[0];
	if (!ctx.ui.input) return candidates[0] ?? null;
	const picked = await ctx.ui.input(
		`${commandName}: Multiple wikis found below current directory. Pick one:`,
		candidates[0],
	);
	return picked || null;
}
