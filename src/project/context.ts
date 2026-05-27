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
	return path ? normalizeRelativePath(path) : undefined;
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

export async function resolveStatusDockProject(
	ctx: CodewikiContextPort,
	options?: { allowWhenOff?: boolean },
): Promise<ResolvedStatusDockProject | null> {
	const { maybeReadStatusState } = await import("../state/artifacts.ts");
	const prefs = await readStatusDockPrefs();
	if (prefs.mode === "off" && !options?.allowWhenOff) return null;
	const localProject = await maybeLoadProject(ctx.cwd || ctx.workspaceRoot || "");
	if (localProject) {
		await rememberStatusDockProject(localProject, prefs);
		return {
			...localProject,
			project: localProject,
			statusState: (await maybeReadStatusState(localProject.statusStatePath)) ?? undefined,
			source: "cwd",
		};
	}
	const fallbackRoots = unique([
		...(prefs.mode === "pin" && prefs.pinnedRepoPath
			? [prefs.pinnedRepoPath]
			: []),
		...(prefs.lastRepoPath ? [prefs.lastRepoPath] : []),
	]);
	for (const root of fallbackRoots) {
		const fallbackProject = await maybeLoadProject(root);
		if (!fallbackProject) continue;
		await rememberStatusDockProject(fallbackProject, prefs);
		return {
			...fallbackProject,
			project: fallbackProject,
			statusState: (await maybeReadStatusState(fallbackProject.statusStatePath)) ?? undefined,
			source: "pinned",
		};
	}
	return null;
}

export async function resolveToolProject(
	startDir: string,
	repoPath: string | undefined,
	toolName: string,
): Promise<WikiProject> {
	if (repoPath) {
		const requestedPath = resolve(startDir, repoPath);
		const project = await maybeLoadProject(requestedPath);
		if (!project) {
			throw new Error(
				`${toolName}: could not resolve repoPath ${requestedPath}. No .codewiki/config.json found in that path or its ancestors.`,
			);
		}
		await rememberStatusDockProject(project);
		return project;
	}

	try {
		const project = await maybeLoadProject(startDir);
		if (project) {
			await rememberStatusDockProject(project);
			return project;
		}
	} catch {
		// Fall back to pinned/last-used repo below.
	}
	{
		const prefs = await readStatusDockPrefs();
		const fallbackRoots = unique([
			...(prefs.mode === "pin" && prefs.pinnedRepoPath
				? [prefs.pinnedRepoPath]
				: []),
			...(prefs.lastRepoPath ? [prefs.lastRepoPath] : []),
		]);
		for (const root of fallbackRoots) {
			const project = await maybeLoadProject(root);
			if (!project) continue;
			await rememberStatusDockProject(project, prefs);
			return project;
		}
		throw new Error(
			[
				`${toolName}: no repo-local wiki found from ${startDir}.`,
				"codewiki tools are available globally, but each run mutates one repo-local wiki.",
				`Retry with repoPath set to the target repo root, or any path inside that repo.`,
			].join(" "),
		);
	}
}

export async function resolveCommandProject(
	ctx: CodewikiContextPort,
	pathArg: string | null,
	commandName: string,
): Promise<WikiProject> {
	const { findWikiRootsBelow } = await import("./root.ts");
	if (pathArg) {
		const requestedPath = resolve(ctx.cwd || ctx.workspaceRoot || process.cwd(), pathArg);
		const project = await maybeLoadProject(requestedPath);
		if (!project) {
			throw new Error(
				`${commandName}: could not resolve repo path ${requestedPath}. No .codewiki/config.json found in that path or its ancestors.`,
			);
		}
		await rememberStatusDockProject(project);
		return project;
	}

	try {
		const project = await maybeLoadProject(ctx.cwd || ctx.workspaceRoot || "");
		if (project) {
			await rememberStatusDockProject(project);
			return project;
		}
	} catch {
		// Fall back to wiki roots below cwd.
	}
	{
		const candidates = await findWikiRootsBelow(ctx.cwd || ctx.workspaceRoot || process.cwd());
		if (candidates.length > 0) {
			const pickedRoot = await pickCommandProjectRoot(
				ctx,
				commandName,
				candidates,
			);
			if (pickedRoot) {
				const project = await loadProject(pickedRoot);
				await rememberStatusDockProject(project);
				return project;
			}
		}
		throw new Error(
			`${commandName}: No repo-local wiki found from ${ctx.cwd || ctx.workspaceRoot || process.cwd()}. CodeWiki commands may be loaded globally, but each run targets one repo-local wiki. Use /wiki-bootstrap first, work inside a repo with .codewiki/config.json, or pass an explicit repo path like /${commandName} /path/to/repo.`,
		);
	}
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
