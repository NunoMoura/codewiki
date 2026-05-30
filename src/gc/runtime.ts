import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { CodewikiGcToolInput } from "./types.ts";
import type { WikiProject } from "../project/types.ts";
import { nowIso } from "../shared/utils.ts";

export type CodewikiGcCandidateKind = "build" | "validation" | "runtime";

export interface CodewikiGcCandidate {
	path: string;
	kind: CodewikiGcCandidateKind;
	bytes: number;
	reason: string;
	restore_command?: string;
}

export interface CodewikiGcResult {
	status: "dry-run" | "purged" | "blocked";
	action: "dry-run" | "purge";
	changed: boolean;
	ledger_path?: string;
	archive?: {
		commit_sha?: string;
		tree_sha?: string;
		ref?: string;
	};
	candidates: {
		tracked: CodewikiGcCandidate[];
		runtime: CodewikiGcCandidate[];
	};
	deleted: {
		tracked: CodewikiGcCandidate[];
		runtime: CodewikiGcCandidate[];
	};
	blocked_reasons: string[];
	summary: string;
}

interface GraphGcClasses {
	purgeable?: {
		build_paths?: string[];
		validation_paths?: string[];
	};
}

const DEFAULT_MAX_DELETES = 1000;

export async function runCodewikiGc(
	project: WikiProject,
	input: CodewikiGcToolInput,
): Promise<CodewikiGcResult> {
	const action = input.action ?? "dry-run";
	const include = new Set(input.include?.length ? input.include : ["tracked", "runtime"]);
	const maxDeletes = input.max_deletes ?? DEFAULT_MAX_DELETES;
	const scopes = (input.scopes ?? []).map(normalizeScope).filter(Boolean);
	const archive = {
		commit_sha: input.archive_sha?.trim(),
		tree_sha: input.tree_sha?.trim(),
		ref: input.archive_ref?.trim(),
	};
	const blocked_reasons: string[] = [];
	const candidates = {
		tracked: include.has("tracked") ? collectTrackedCandidates(project, scopes) : [],
		runtime: include.has("runtime") ? collectRuntimeCandidates(project, scopes) : [],
	};
	const deleteCount = candidates.tracked.length + candidates.runtime.length;

	if (deleteCount > maxDeletes) {
		blocked_reasons.push(`GC candidate count ${deleteCount} exceeds max_deletes ${maxDeletes}.`);
	}
	if (action === "purge" && candidates.tracked.length > 0) {
		blocked_reasons.push(...verifyArchiveProof(project, archive));
		for (const candidate of candidates.tracked) {
			candidate.restore_command = restoreCommand(archive.commit_sha || "<archive-sha>", candidate.path);
		}
	}

	if (action === "dry-run" || blocked_reasons.length > 0) {
		const status = blocked_reasons.length > 0 ? "blocked" : "dry-run";
		return buildResult({
			status,
			action,
			archive,
			candidates,
			deleted: { tracked: [], runtime: [] },
			blocked_reasons,
		});
	}

	let ledger_path: string | undefined;
	if (candidates.tracked.length > 0) {
		ledger_path = await writeRestoreLedger(project, input, archive, candidates);
	}

	const deleted = { tracked: [] as CodewikiGcCandidate[], runtime: [] as CodewikiGcCandidate[] };
	for (const candidate of candidates.tracked) {
		await deleteCandidate(project, candidate.path);
		deleted.tracked.push(candidate);
	}
	for (const candidate of candidates.runtime) {
		await deleteCandidate(project, candidate.path);
		deleted.runtime.push(candidate);
	}

	return buildResult({
		status: "purged",
		action,
		archive,
		candidates,
		deleted,
		blocked_reasons,
		ledger_path,
	});
}

async function deleteCandidate(project: WikiProject, relPath: string): Promise<void> {
	const abs = safeResolve(project, relPath);
	if (!abs || !existsSync(abs)) return;
	await rm(abs, { recursive: true, force: true });
}

async function writeRestoreLedger(
	project: WikiProject,
	input: CodewikiGcToolInput,
	archive: CodewikiGcResult["archive"],
	candidates: { tracked: CodewikiGcCandidate[]; runtime: CodewikiGcCandidate[] },
): Promise<string> {
	const created = nowIso();
	const defaultPath = `.codewiki/gc/ledgers/${created.replace(/[:.]/g, "").replace("T", "-").replace("Z", "Z")}.json`;
	const relPath = normalizeRepoPath(project, input.ledger_path || defaultPath);
	const absPath = safeResolve(project, relPath);
	if (!absPath) throw new Error(`Invalid GC ledger path: ${input.ledger_path || defaultPath}`);
	const removed = candidates.tracked.map((candidate) => ({
		kind: candidate.kind,
		path: candidate.path,
		bytes: candidate.bytes,
		reason: candidate.reason,
		restore_command: restoreCommand(archive?.commit_sha || "<archive-sha>", candidate.path),
	}));
	const ledger = {
		kind: "wiki_gc_ledger",
		version: 1,
		created_at: created,
		archive,
		removed,
		runtime_removed: candidates.runtime.map((candidate) => ({
			kind: candidate.kind,
			path: candidate.path,
			bytes: candidate.bytes,
			reason: candidate.reason,
		})),
		restore_commands: removed.map((entry) => entry.restore_command),
		notes: [
			"This ledger indexes files removed after the archive commit captured full revive context.",
			"Restore tracked files with the listed git restore commands, then re-run CodeWiki state/audits as needed.",
		],
	};
	await mkdir(dirname(absPath), { recursive: true });
	await writeFile(absPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
	return relPath;
}

function buildResult(args: {
	status: CodewikiGcResult["status"];
	action: CodewikiGcResult["action"];
	archive: CodewikiGcResult["archive"];
	candidates: CodewikiGcResult["candidates"];
	deleted: CodewikiGcResult["deleted"];
	blocked_reasons: string[];
	ledger_path?: string;
}): CodewikiGcResult {
	const trackedBytes = sumBytes(args.candidates.tracked);
	const runtimeBytes = sumBytes(args.candidates.runtime);
	const changed = args.deleted.tracked.length + args.deleted.runtime.length > 0 || Boolean(args.ledger_path);
	return {
		status: args.status,
		action: args.action,
		changed,
		ledger_path: args.ledger_path,
		archive: args.archive,
		candidates: args.candidates,
		deleted: args.deleted,
		blocked_reasons: args.blocked_reasons,
		summary: `tracked=${args.candidates.tracked.length} (${trackedBytes} bytes), runtime=${args.candidates.runtime.length} (${runtimeBytes} bytes)`,
	};
}

function collectTrackedCandidates(project: WikiProject, scopes: string[]): CodewikiGcCandidate[] {
	const classes = readGraphGcClasses(project);
	const purgeable = classes?.purgeable || {};
	const buildPaths = normalizeList(purgeable.build_paths);
	const validationPaths = normalizeList(purgeable.validation_paths);
	const candidates: CodewikiGcCandidate[] = [];
	for (const path of buildPaths) {
		const candidate = buildTrackedCandidate(project, path, "build", "graph classifies build as purgeable after downstream/archive evidence");
		if (candidate && matchesScopes(candidate.path, scopes)) candidates.push(candidate);
	}
	for (const path of validationPaths) {
		if (!isPurgeableValidation(project, path)) continue;
		const candidate = buildTrackedCandidate(project, path, "validation", "graph classifies pass validation as purgeable after archive evidence");
		if (candidate && matchesScopes(candidate.path, scopes)) candidates.push(candidate);
	}
	return uniqueCandidates(candidates);
}

function buildTrackedCandidate(
	project: WikiProject,
	path: string,
	kind: "build" | "validation",
	reason: string,
): CodewikiGcCandidate | null {
	const relPath = normalizeRepoPath(project, path);
	if (!relPath || !relPath.startsWith(".codewiki/")) return null;
	const abs = safeResolve(project, relPath);
	if (!abs || !existsSync(abs)) return null;
	return { path: relPath, kind, bytes: safeSize(abs), reason };
}

function isPurgeableValidation(project: WikiProject, path: string): boolean {
	const relPath = normalizeRepoPath(project, path);
	const abs = relPath ? safeResolve(project, relPath) : null;
	if (!abs || !existsSync(abs)) return false;
	try {
		const data = JSON.parse(readFileSync(abs, "utf8"));
		return String(data?.verdict || "").toLowerCase() === "pass";
	} catch {
		return false;
	}
}

function collectRuntimeCandidates(project: WikiProject, scopes: string[]): CodewikiGcCandidate[] {
	const runtimeRoot = resolve(project.root, ".codewiki/runtime/session-handoffs");
	if (!existsSync(runtimeRoot)) return [];
	const candidates: CodewikiGcCandidate[] = [];
	for (const absPath of listFiles(runtimeRoot)) {
		const relPath = normalizeRepoPath(project, absPath);
		if (!relPath || !matchesScopes(relPath, scopes)) continue;
		if (!isPurgeableRuntimeHandoff(absPath)) continue;
		candidates.push({
			path: relPath,
			kind: "runtime",
			bytes: safeSize(absPath),
			reason: "runtime session-boundary artifact is ignored operational state and already consumed or legacy disposable state",
		});
	}
	return uniqueCandidates(candidates);
}

function isPurgeableRuntimeHandoff(absPath: string): boolean {
	try {
		const data = JSON.parse(readFileSync(absPath, "utf8"));
		if (data?.kind !== "wiki_session_handoff") return true;
		const status = String(data?.status || "").trim().toLowerCase();
		return ["completed", "cancelled", "external", "failed"].includes(status);
	} catch {
		return true;
	}
}

function listFiles(root: string): string[] {
	const entries = readdirSync(root, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const abs = resolve(root, entry.name);
		if (entry.isSymbolicLink()) continue;
		if (entry.isDirectory()) files.push(...listFiles(abs));
		else if (entry.isFile()) files.push(abs);
	}
	return files.sort();
}

function readGraphGcClasses(project: WikiProject): GraphGcClasses | null {
	const graphPath = safeResolve(project, project.graphPath || ".codewiki/index_graph.json");
	if (!graphPath || !existsSync(graphPath)) return null;
	try {
		const graph = JSON.parse(readFileSync(graphPath, "utf8"));
		return graph?.views?.gc?.classes ? graph.views.gc.classes : graph?.status?.gc?.classes ? graph.status.gc.classes : null;
	} catch {
		return null;
	}
}

function verifyArchiveProof(
	project: WikiProject,
	archive: CodewikiGcResult["archive"],
): string[] {
	const reasons: string[] = [];
	if (!archive?.commit_sha) reasons.push("Tracked GC purge requires archive_sha naming the commit that still contains purged files.");
	if (!archive?.tree_sha) reasons.push("Tracked GC purge requires tree_sha for the archive commit.");
	if (reasons.length > 0) return reasons;
	const commitSha = archive?.commit_sha || "";
	const treeSha = archive?.tree_sha || "";
	if (!/^[a-f0-9]{7,64}$/i.test(commitSha)) reasons.push("archive_sha must be a Git commit SHA or unique abbreviation.");
	if (!/^[a-f0-9]{7,64}$/i.test(treeSha)) reasons.push("tree_sha must be a Git tree SHA or unique abbreviation.");
	if (reasons.length > 0) return reasons;
	try {
		execFileSync("git", ["cat-file", "-e", `${commitSha}^{commit}`], { cwd: project.root, stdio: "pipe" });
		const actualTree = execFileSync("git", ["rev-parse", `${commitSha}^{tree}`], { cwd: project.root, encoding: "utf8", stdio: "pipe" }).trim();
		const expected = treeSha;
		if (!(actualTree === expected || actualTree.startsWith(expected) || expected.startsWith(actualTree))) {
			reasons.push(`tree_sha does not match archive_sha tree (${actualTree}).`);
		}
	} catch {
		reasons.push("archive_sha must be reachable as a local Git commit before tracked GC purge.");
	}
	return reasons;
}

function normalizeList(values: unknown): string[] {
	return Array.isArray(values) ? values.map((value) => String(value || "").trim()).filter(Boolean).sort() : [];
}

function uniqueCandidates(candidates: CodewikiGcCandidate[]): CodewikiGcCandidate[] {
	const seen = new Set<string>();
	const unique: CodewikiGcCandidate[] = [];
	for (const candidate of candidates) {
		const key = `${candidate.kind}:${candidate.path}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(candidate);
	}
	return unique.sort((a, b) => a.path.localeCompare(b.path));
}

function normalizeScope(scope: string): string {
	return String(scope || "").trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/\*\*$/, "");
}

function matchesScopes(path: string, scopes: string[]): boolean {
	if (scopes.length === 0) return true;
	const normalized = normalizeScope(path);
	return scopes.some((scope) => normalized === scope || normalized.startsWith(`${scope}/`));
}

function normalizeRepoPath(project: WikiProject, value: string): string {
	const raw = String(value || "").trim();
	if (!raw) return "";
	const abs = resolve(project.root, raw);
	const rel = relative(project.root, raw.startsWith("/") ? raw : abs).replace(/\\/g, "/");
	if (!rel || rel.startsWith("..") || rel.includes("/../")) return "";
	return rel;
}

function safeResolve(project: WikiProject, relPath: string): string | null {
	const normalized = normalizeRepoPath(project, relPath);
	if (!normalized) return null;
	const abs = resolve(project.root, normalized);
	const rel = relative(project.root, abs);
	if (rel.startsWith("..") || rel === "") return null;
	return abs;
}

function safeSize(absPath: string): number {
	try {
		return statSync(absPath).size;
	} catch {
		return 0;
	}
}

function sumBytes(candidates: CodewikiGcCandidate[]): number {
	return candidates.reduce((sum, candidate) => sum + candidate.bytes, 0);
}

function restoreCommand(commitSha: string, path: string): string {
	return `git restore --source=${commitSha} -- ${path}`;
}
