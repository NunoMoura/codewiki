import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { GitCache } from "../../project/local/git-cache.ts";
import type { WikiProject } from "../../project/types.ts";
import type { RoadmapTaskRecord } from "../../domain/roadmap/types.ts";
import type { RoadmapStateFile } from "../../domain/state/types.ts";
import { buildGraph } from "../graph.ts";
import { buildLintReport } from "../lint.ts";
import { claimsFilePath, normalizeClaimsFile } from "../claims.ts";
import { buildRoadmapState, buildStatusState } from "../state-builders.ts";
import { buildCodewikiTaskDetail } from "../state.ts";
import { parseDoc } from "../../knowledge/doc-parser.ts";
import type { ParsedDoc } from "../../knowledge/doc-parser.ts";

export class CodewikiRebuilder {
	private readonly repoRoot: string;
	private readonly gitCache: GitCache;
	private readonly quietOverride?: boolean;

	constructor(repoRoot: string, options: { quiet?: boolean } = {}) {
		this.repoRoot = repoRoot;
		this.gitCache = new GitCache(repoRoot);
		this.quietOverride = options.quiet;
	}

	private log(message: string, quiet: boolean): void {
		if (!quiet) console.log(message);
	}

	private findMarkdownFiles(project: WikiProject): string[] {
		const docsRoot = project.docsRoot.replace(/^\.\//, "").replace(/\/$/, "");
		try {
			const raw = execFileSync("git", ["ls-files", "-z", `${docsRoot}/**/*.md`, `${docsRoot}/*.md`], {
				cwd: this.repoRoot,
				encoding: "utf8",
				stdio: "pipe"
			});
			const files = raw.split("\0").filter(Boolean);
			if (files.length > 0) return files;
		} catch {
			// Fallback if not a git repo
		}

		const walk = (dir: string, list: string[] = []) => {
			if (!existsSync(dir)) return list;
			for (const f of readdirSync(dir)) {
				const p = join(dir, f);
				if (statSync(p).isDirectory()) walk(p, list);
				else if (f.endsWith(".md")) list.push(p);
			}
			return list;
		};

		const mdFiles: string[] = [];
		walk(join(this.repoRoot, project.docsRoot), mdFiles);
		return mdFiles.map(p => relative(this.repoRoot, p).replace(/\\/g, "/"));
	}

	private writeRoadmapTaskViews(
		roadmapEntries: RoadmapTaskRecord[],
		roadmapState?: Pick<RoadmapStateFile, "tasks">,
	): void {
		const root = join(this.repoRoot, ".codewiki", "roadmap", "tasks");
		mkdirSync(root, { recursive: true });
		const expectedIds = new Set(roadmapEntries.map((task) => task.id));
		for (const name of readdirSync(root)) {
			const abs = join(root, name);
			if (statSync(abs).isDirectory() && !expectedIds.has(name)) {
				rmSync(abs, { recursive: true, force: true });
			}
		}
		for (const task of roadmapEntries) {
			const taskRoot = join(root, task.id);
			mkdirSync(taskRoot, { recursive: true });
			const runtimeTask = roadmapState?.tasks?.[task.id] ?? null;
			const detail = buildCodewikiTaskDetail(task, runtimeTask, null);
			writeFileSync(join(taskRoot, "task.json"), JSON.stringify(task, null, 2));
			writeFileSync(
				join(taskRoot, "context.json"),
				JSON.stringify((detail as { context_packet?: unknown }).context_packet, null, 2),
			);
		}
	}

	private loadResearchCollections(project: WikiProject): any[] {
		const collections: any[] = [];
		const root = join(this.repoRoot, project.researchRoot);

		const walk = (dir: string) => {
			if (!existsSync(dir)) return;
			for (const f of readdirSync(dir)) {
				const p = join(dir, f);
				if (statSync(p).isDirectory()) walk(p);
				else if (f.endsWith(".jsonl") && !f.includes("events") && !f.includes("archive")) {
					try {
						const raw = readFileSync(p, "utf8");
						const lines = raw.split(/\r?\n/).filter((l: string) => l.trim().startsWith("{"));
						const entries = lines.map((l: string) => {
							try { return JSON.parse(l); } catch { return null; }
						}).filter(Boolean).map((e: any) => ({
							id: String(e.id || "").trim(),
							title: String(e.title || "").trim(),
							summary: String(e.summary || "").trim(),
							web_link: String(e.web_link || "").trim(),
							updated: String(e.updated || "").trim(),
							tags: (e.tags || []).filter(Boolean).map(String),
							revision: { digest: "dummy" }
						}));
						collections.push({
							path: relative(this.repoRoot, p).replace(/\\/g, "/"),
							entry_count: entries.length,
							entries
						});
					} catch {}
				}
			}
		};
		walk(root);
		return collections;
	}

	public async rebuildAll(): Promise<void> {
		const configPath = join(this.repoRoot, ".codewiki", "config.json");
		const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {};
		const quiet = this.quietOverride ?? (process.env.CODEWIKI_REBUILD_VERBOSE === "1" ? false : config?.codewiki?.rebuild?.quiet !== false);
		this.log(`[Rebuild] Starting full rebuild for repo: ${this.repoRoot}`, quiet);

		this.log(`[Rebuild] Warming up git cache...`, quiet);
		this.gitCache.prefetchAllBlobOids();

		const metaRoot = config.meta_root || ".codewiki";
		const project: WikiProject = {
			root: this.repoRoot,
			label: config.project_name || "Project",
			config,
			docsRoot: config.docs_root || ".codewiki/kb",
			specsRoot: config.specs_root || config.docs_root || ".codewiki/kb",
			researchRoot: config.research_root || ".codewiki/research",
			indexPath: config.index_path || "",
			roadmapPath: config.roadmap_path || ".codewiki/roadmap/queue.json",
			roadmapDocPath: config.roadmap_doc_path || "",
			metaRoot: metaRoot,
			viewsRoot: config.views_root || ".codewiki/views",
			configPath: ".codewiki/config.json",
			lintPath: join(metaRoot, "lint.json"),
			graphPath: join(metaRoot, "index_graph.json"),
			evidenceRoot: config.evidence_root || "",
			roadmapEventsPath: "",
			eventsPath: "",
			roadmapStatePath: join(metaRoot, "index_graph.json"),
			statusStatePath: join(metaRoot, "index_graph.json"),
		};

		this.log(`[Rebuild] Loading docs...`, quiet);
		const mdFiles = this.findMarkdownFiles(project);
		const docs: ParsedDoc[] = [];
		for (const relPath of mdFiles) {
			try {
				docs.push(parseDoc(this.repoRoot, project, resolve(this.repoRoot, relPath)));
			} catch (err) {
				this.log(`[Rebuild] Failed to parse doc: ${relPath}`, quiet);
			}
		}

		this.log(`[Rebuild] Loading state JSONs...`, quiet);
		const readJson = (file: string, fallback: any) => {
			const p = join(this.repoRoot, file);
			return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback;
		};
		const readJsonLines = (file: string) => {
			const p = join(this.repoRoot, file);
			if (!existsSync(p)) return [];
			return readFileSync(p, "utf8").split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
		};

		const roadmapData = readJson(project.roadmapPath, { tasks: {}, sprints: {} });
		const roadmapEntries = Object.values(roadmapData.tasks || {}) as any[];
		const roadmapSprints = Object.values(roadmapData.sprints || {}) as any[];
		this.writeRoadmapTaskViews(roadmapEntries as RoadmapTaskRecord[]);
		const claimsPath = claimsFilePath(project);
		const claims = existsSync(claimsPath) ? normalizeClaimsFile(JSON.parse(readFileSync(claimsPath, "utf8"))) : normalizeClaimsFile(null);
		const archivePath = config.roadmap_retention?.archive_path || `${metaRoot}/roadmap/archive.jsonl`;
		const archivedRoadmapEntries = readJsonLines(archivePath);
		const archivedTaskIds = archivedRoadmapEntries.map((task: any) => String(task.id || "").trim()).filter(Boolean);
		const events: any[] = [];

		const research = this.loadResearchCollections(project);

		this.log(`[Rebuild] Discovering build artifacts...`, quiet);
		const builds: { path: string; kind: string; taskId?: string; status?: string; data: any }[] = [];
		const buildsRoot = join(this.repoRoot, ".codewiki", "builds");
		if (existsSync(buildsRoot)) {
			for (const kind of ["decision", "planning", "implementation"]) {
				const kindDir = join(buildsRoot, kind);
				if (!existsSync(kindDir)) continue;
				for (const f of readdirSync(kindDir)) {
					if (!f.endsWith(".json")) continue;
					const buildPath = `.codewiki/builds/${kind}/${f}`;
					const data = readJson(buildPath, {});
					builds.push({
						path: buildPath,
						kind: `${kind}_build`,
						taskId: data.task_id || data.taskId || undefined,
						status: data.status,
						data,
					});
				}
			}
		}

		this.log(`[Rebuild] Discovering validation reports...`, quiet);
		const validations: { path: string; taskId?: string; verdict?: string; data?: any }[] = [];
		const validationRoot = join(this.repoRoot, ".codewiki", "validation");
		if (existsSync(validationRoot)) {
			const walk = (dir: string) => {
				for (const f of readdirSync(dir)) {
					const p = join(dir, f);
					if (statSync(p).isDirectory()) { walk(p); continue; }
					if (!f.endsWith(".json")) continue;
					const relPath = relative(this.repoRoot, p).replace(/\\/g, "/");
					const vdata = readJson(relPath, {});
					validations.push({
						path: relPath,
						taskId: vdata.taskId || vdata.task_id || undefined,
						verdict: vdata.verdict,
						data: vdata,
					});
				}
			};
			walk(validationRoot);
		}

		this.log(`[Rebuild] Discovering test files...`, quiet);
		const testFiles: string[] = [];
		const scriptsDir = join(this.repoRoot, "scripts");
		if (existsSync(scriptsDir)) {
			for (const f of readdirSync(scriptsDir)) {
				const lower = f.toLowerCase();
				if ((lower.includes("test") || lower.includes("smoke") || lower.includes("benchmark") || lower.includes("check")) && (f.endsWith(".mjs") || f.endsWith(".ts") || f.endsWith(".js"))) {
					testFiles.push(`scripts/${f}`);
				}
			}
		}

		this.log(`[Rebuild] Graph and Lint dependencies resolving...`, quiet);

		const lintReport = buildLintReport(this.repoRoot, project, docs, roadmapEntries, research, { builds, validations, archivedTaskIds });
		const graph = buildGraph({ project, docs, research, roadmapEntries, roadmapSprints, archivedTaskIds, gitCache: this.gitCache, builds, validations, testFiles, claims, lintReport });
		
		this.log(`[Rebuild] Building UI state...`, quiet);
		const roadmapState = buildRoadmapState(project, roadmapEntries, graph, lintReport, events, roadmapSprints);
		
		const previousStatusPath = join(this.repoRoot, project.statusStatePath);
		const previousState = existsSync(previousStatusPath) ? JSON.parse(readFileSync(previousStatusPath, "utf8")) : {};
		const previousStatus = previousState?.lenses?.status || previousState;
		const statusState = buildStatusState(project, this.repoRoot, this.gitCache, docs, graph, roadmapEntries, lintReport, roadmapState, events, previousStatus, claims);
		
		const metaRootDir = join(this.repoRoot, metaRoot);
		if (!existsSync(metaRootDir)) mkdirSync(metaRootDir, { recursive: true });

		const indexGraph = {
			...graph,
			lenses: {
				lint: lintReport,
				roadmap: roadmapState,
				status: statusState,
			},
		};
		writeFileSync(join(metaRootDir, "index_graph.json"), JSON.stringify(indexGraph, null, 2));
		this.writeRoadmapTaskViews(roadmapEntries as RoadmapTaskRecord[], roadmapState);

		this.log(`[Rebuild] Engine pipeline completed successfully!`, quiet);
	}
}

export async function rebuildMain(args: string[]) {
	const repo = args[0] || process.cwd();
	const builder = new CodewikiRebuilder(repo, { quiet: false });
	await builder.rebuildAll();
}
