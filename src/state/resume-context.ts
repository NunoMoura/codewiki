import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
	artifactScopeLabel,
	artifactStatusesForScopes,
	buildChangeClaimState,
	hasBlockingArtifactStatus,
	mutateChangeClaims,
	normalizeScopes,
	readChangeClaimsFile,
} from "../session/claims.ts";
import { codePrompt, statusColor } from "./prompt.ts";
import {
	isClosedRoadmapStatus,
	readRoadmapFile,
	resolveRoadmapTask,
	taskLoopEvidenceLine,
} from "../roadmap/runtime.ts";
import {
	loadCodewikiStateArtifacts,
	maybeReadTaskContext,
} from "./artifacts.ts";
import { stableAgentName } from "./builders.ts";
import { assessRoadmapTaskBoundary } from "../roadmap/task-boundary.ts";
import { unique } from "../shared/utils.ts";
import type { WikiProject } from "../project/types.ts";
import type { RoadmapFile, RoadmapTaskRecord } from "../roadmap/types.ts";
import type {
	ArtifactStatusRecord,
	ChangeClaimScope,
	ChangeClaimState,
	TaskSessionLinkRecord,
} from "../session/types.ts";
import type { GraphFile, RoadmapStateFile, RoadmapTaskContextPacket } from "./types.ts";
import type { LintReport } from "../validation/types.ts";

export interface ResumeSelection {
	task: RoadmapTaskRecord | null;
	source: "explicit" | "session-focus" | "persisted-focus" | "roadmap-order" | "none";
	artifact_statuses: ArtifactStatusRecord[];
	skipped: string[];
}

export interface BuildCodewikiResumeContextInput {
	requestedTaskId?: string | null;
	followUpIntent?: string;
	activeLink?: TaskSessionLinkRecord | null;
	sessionId?: string | null;
	refresh?: boolean;
}

export interface CodewikiResumeContextPacket {
	project_label: string;
	repo_root: string;
	prompt: string;
	task: RoadmapTaskRecord;
	selection: ResumeSelection;
	preflight: {
		color: "green" | "yellow" | "red";
		errors: number;
		warnings: number;
		total: number;
	};
	evidence: string;
	follow_up_intent: string;
	context_path: string | null;
	source_refs: string[];
}

export interface CodewikiResumeContextUnavailable {
	project_label: string;
	repo_root: string;
	prompt: "";
	task: null;
	selection: ResumeSelection;
	preflight: {
		color: "green" | "yellow" | "red";
		errors: number;
		warnings: number;
		total: number;
	};
	evidence: string;
	follow_up_intent: string;
	context_path: null;
	source_refs: string[];
}

export type CodewikiResumeContextResult = CodewikiResumeContextPacket | CodewikiResumeContextUnavailable;

export async function buildCodewikiResumeContext(
	project: WikiProject,
	input: BuildCodewikiResumeContextInput = {},
): Promise<CodewikiResumeContextResult> {
	const artifacts = await loadCodewikiStateArtifacts(project, input.refresh ?? true);
	if (!artifacts.report) {
		throw new Error("CodeWiki resume context requires generated graph lint state. Re-run with refresh=true.");
	}
	const report = artifacts.report;
	const roadmap = await readRoadmapFile(resolve(project.root, project.roadmapPath));
	const requestedTaskId = normalizeOptionalTaskId(input.requestedTaskId);
	const persistedFocusTaskId = requestedTaskId
		? null
		: String(artifacts.statusState?.resume?.task_id || artifacts.statusState?.roadmap?.focused_task_id || "").trim() || null;
	const sessionId = String(input.sessionId || "resume-context").trim() || "resume-context";
	const artifactState = buildChangeClaimState(await readChangeClaimsFile(project));
	const selection = resolveImplementationTask(
		roadmap,
		input.activeLink ?? null,
		requestedTaskId,
		persistedFocusTaskId,
		artifactState,
		sessionId,
	);
	if (!selection.task) {
		return unavailableResumeContext(project, report, selection, input.followUpIntent || "");
	}
	return buildResumeContextForTask(project, {
		task: selection.task,
		selection,
		report,
		roadmapState: artifacts.roadmapState,
		graph: artifacts.graph,
		followUpIntent: input.followUpIntent || "",
		usageSummary: "read-only resume context build; no artifact-status claim marked",
	});
}

export async function buildResumeContextForTask(
	project: WikiProject,
	input: {
		task: RoadmapTaskRecord;
		selection: ResumeSelection;
		report: LintReport;
		roadmapState: RoadmapStateFile | null;
		graph: GraphFile | null;
		followUpIntent?: string;
		usageSummary?: string;
	},
): Promise<CodewikiResumeContextPacket> {
	const runtimeTask = input.roadmapState?.tasks?.[input.task.id] ?? null;
	const taskContext = await maybeReadTaskContext(project, input.task.id, runtimeTask);
	const usageSummary = input.usageSummary || "read-only resume context build; no artifact-status claim marked";
	const evidence = [
		taskLoopEvidenceLine(runtimeTask),
		await taskBuildEvidence(project, input.task.id),
		describeArtifactPromptContext(input.selection.artifact_statuses, usageSummary, input.selection.skipped),
	].filter(Boolean).join("\n");
	const prompt = renderResumePrompt(
		project,
		input.graph,
		input.report,
		input.task,
		evidence,
		taskContext,
		input.followUpIntent || "",
	);
	return {
		project_label: project.label,
		repo_root: project.root,
		prompt,
		task: input.task,
		selection: input.selection,
		preflight: preflightSummary(input.report),
		evidence,
		follow_up_intent: input.followUpIntent || "",
		context_path: taskContext?.context_path ?? null,
		source_refs: resumeContextSourceRefs(project, input.task, taskContext),
	};
}

export function renderResumePrompt(
	project: WikiProject,
	graph: GraphFile | null,
	report: LintReport,
	task: RoadmapTaskRecord,
	evidence: string,
	taskContext: RoadmapTaskContextPacket | null,
	followUpIntent = "",
): string {
	return codePrompt(project, graph, report, task, evidence, taskContext, followUpIntent);
}

export function resolveImplementationTask(
	roadmap: RoadmapFile,
	activeLink: TaskSessionLinkRecord | null,
	requestedTaskId: string | null,
	persistedFocusTaskId: string | null = null,
	artifactState: ChangeClaimState,
	sessionId: string,
): ResumeSelection {
	const ordered = roadmap.order
		.map((taskId) => roadmap.tasks[taskId])
		.filter((task): task is RoadmapTaskRecord => Boolean(task));
	if (requestedTaskId) {
		const requestedTask = resolveRoadmapTask(roadmap, requestedTaskId);
		if (!requestedTask) throw new Error(`Roadmap task not found: ${requestedTaskId}`);
		if (isClosedRoadmapStatus(requestedTask.status)) throw new Error(`Roadmap task already closed: ${requestedTask.id}`);
		const requestedBoundary = assessRoadmapTaskBoundary(requestedTask);
		if (!requestedBoundary.executable) {
			throw new Error(`Roadmap task ${requestedTask.id} is not executable work. Use a sprint for grouping. ${requestedBoundary.reasons.join("; ")}`);
		}
		const artifactStatuses = artifactStatusesForScopes(taskArtifactScopes(requestedTask), artifactState, sessionId, "write");
		if (hasBlockingArtifactStatus(artifactStatuses)) {
			throw new Error(`Roadmap task ${requestedTask.id} cannot start yet. ${formatBlockingArtifactStatuses(artifactStatuses)}`);
		}
		return { task: requestedTask, source: "explicit", artifact_statuses: artifactStatuses, skipped: [] };
	}

	const candidates = resumeCandidates(roadmap, activeLink, persistedFocusTaskId);
	const skipped: string[] = [];
	for (const candidate of candidates) {
		const artifactStatuses = artifactStatusesForScopes(taskArtifactScopes(candidate.task), artifactState, sessionId, "write");
		if (!candidate.boundary.executable) {
			skipped.push(`${candidate.task.id}: non-executable container task (${candidate.boundary.reasons.join("; ")})`);
			continue;
		}
		if (hasBlockingArtifactStatus(artifactStatuses)) {
			skipped.push(`${candidate.task.id}: ${formatBlockingArtifactStatuses(artifactStatuses)}`);
			continue;
		}
		return { task: candidate.task, source: candidate.source, artifact_statuses: artifactStatuses, skipped };
	}

	for (const task of ordered.filter((item) => !isClosedRoadmapStatus(item.status))) {
		const boundary = assessRoadmapTaskBoundary(task);
		if (!boundary.executable) {
			skipped.push(`${task.id}: non-executable container task (${boundary.reasons.join("; ")})`);
			continue;
		}
		const artifactStatuses = artifactStatusesForScopes(taskArtifactScopes(task), artifactState, sessionId, "write");
		if (!hasBlockingArtifactStatus(artifactStatuses)) {
			return { task, source: "roadmap-order", artifact_statuses: artifactStatuses, skipped };
		}
	}
	return { task: null, source: "none", artifact_statuses: [], skipped };
}

async function taskBuildEvidence(project: WikiProject, taskId: string): Promise<string> {
	const dirs = [
		".codewiki/builds/implementation",
		".codewiki/builds/planning",
		".codewiki/builds/decision",
	];
	const refs: Array<{ path: string; kind: string; summary: string; checks: string[] }> = [];
	for (const dir of dirs) {
		const absDir = resolve(project.root, dir);
		let names: string[] = [];
		try {
			names = await readdir(absDir);
		} catch {
			continue;
		}
		for (const name of names.filter((item) => item.endsWith(".json")).sort()) {
			const relPath = `${dir}/${name}`;
			try {
				const data = JSON.parse(await readFile(join(absDir, name), "utf8"));
				const taskIds = [String(data?.task_id || ""), ...stringArray(data?.task_ids), ...stringArray(data?.consumes?.roadmap), ...stringArray(data?.produces?.roadmap)];
				if (!taskIds.includes(taskId)) continue;
				refs.push({
					path: relPath,
					kind: String(data?.kind || data?.build_kind || dir.split("/").pop() || "build"),
					summary: String(data?.summary || data?.closure_brief?.user_intent || "").trim(),
					checks: stringArray(data?.checks_run || data?.closure_brief?.checks),
				});
			} catch {
				continue;
			}
		}
	}
	const latest = refs.slice(-5).reverse();
	if (latest.length === 0) return "";
	return [
		"Recent task build evidence:",
		...latest.map((item) => {
			const checks = item.checks.length > 0 ? ` checks=${item.checks.slice(0, 5).join("; ")}` : "";
			const summary = item.summary ? ` — ${item.summary}` : "";
			return `- ${item.path} (${item.kind})${summary}${checks}`;
		}),
	].join("\n");
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

export function describeResumeSelection(
	requestedTaskId: string | null,
	task: RoadmapTaskRecord,
	selection: ResumeSelection,
): string {
	if (requestedTaskId) return `User requested ${task.id} explicitly; artifact status allowed start.`;
	const skipped = selection.skipped.length > 0 ? ` Skipped ${selection.skipped.slice(0, 3).join("; ")}.` : "";
	if (selection.source === "session-focus") return `Continuing session-focused ${task.status} work after artifact-status check.${skipped}`;
	if (selection.source === "persisted-focus") return `Continuing persisted ${task.status} focus after artifact-status check.${skipped}`;
	return `Selected next artifact-available ${task.status} task from fresh roadmap/session queue state.${skipped}`;
}

export function taskArtifactScopes(task: RoadmapTaskRecord): ChangeClaimScope[] {
	return normalizeScopes([
		{ layer: "roadmap", task_id: task.id },
		...task.spec_paths.map((path) => ({ layer: layerForArtifactPath(path, "knowledge"), path: pathScope(path) })),
		...task.code_paths.map((path) => ({ layer: layerForArtifactPath(path, "code"), path: pathScope(path) })),
	]);
}

export async function markResumeArtifactsInUse(project: WikiProject, task: RoadmapTaskRecord, sessionId: string): Promise<string> {
	const state = buildChangeClaimState(await readChangeClaimsFile(project));
	if (state.claims.some((claim) => claim.session_id === sessionId && claim.task_id === task.id)) {
		return `Artifact status: already in-use by this session for ${task.id}.`;
	}
	const scopes = taskArtifactScopes(task);
	if (scopes.length === 0) return "Artifact status: no scoped artifacts declared for this task.";
	await mutateChangeClaims(project, {
		action: "claim",
		mode: "write",
		role: "builder",
		taskId: task.id,
		summary: `Artifact usage for ${task.id} via /wiki-resume.`,
		scopes,
		ttl_minutes: 240,
	}, { sessionId, agentName: stableAgentName(sessionId) });
	return `Artifact status: marked in-use by this session for ${scopes.length} artifact(s).`;
}

export function describeArtifactPromptContext(statuses: ArtifactStatusRecord[], usageSummary: string, skipped: string[]): string {
	const lines = [
		"Artifact status preflight:",
		`- Temporary session usage record: ${usageSummary}`,
		...statuses.slice(0, 10).map(describeArtifactStatusLine),
	];
	if (skipped.length > 0) {
		lines.push("Skipped artifact conflicts or coordination tasks:", ...unique(skipped).slice(0, 8).map((item) => `- ${item}`));
	}
	return lines.join("\n");
}

function unavailableResumeContext(
	project: WikiProject,
	report: LintReport,
	selection: ResumeSelection,
	followUpIntent: string,
): CodewikiResumeContextUnavailable {
	return {
		project_label: project.label,
		repo_root: project.root,
		prompt: "",
		task: null,
		selection,
		preflight: preflightSummary(report),
		evidence: selection.skipped.length > 0 ? `Skipped: ${unique(selection.skipped).join("; ")}` : "No artifact-available executable roadmap task found.",
		follow_up_intent: followUpIntent,
		context_path: null,
		source_refs: [project.roadmapPath, project.graphPath.replace(`${project.root}/`, ""), project.statusStatePath],
	};
}

function resumeCandidates(
	roadmap: RoadmapFile,
	activeLink: TaskSessionLinkRecord | null,
	persistedFocusTaskId: string | null,
): Array<{ task: RoadmapTaskRecord; source: ResumeSelection["source"]; boundary: ReturnType<typeof assessRoadmapTaskBoundary> }> {
	const ordered = roadmap.order
		.map((taskId) => roadmap.tasks[taskId])
		.filter((task): task is RoadmapTaskRecord => Boolean(task) && !isClosedRoadmapStatus(task.status));
	const candidates: Array<{ task: RoadmapTaskRecord; source: ResumeSelection["source"]; boundary: ReturnType<typeof assessRoadmapTaskBoundary> }> = [];
	const add = (task: RoadmapTaskRecord | null, source: ResumeSelection["source"]) => {
		if (!task || isClosedRoadmapStatus(task.status)) return;
		if (candidates.some((item) => item.task.id === task.id)) return;
		candidates.push({ task, source, boundary: assessRoadmapTaskBoundary(task) });
	};
	if (activeLink) add(resolveRoadmapTask(roadmap, activeLink.taskId), "session-focus");
	if (persistedFocusTaskId) add(resolveRoadmapTask(roadmap, persistedFocusTaskId), "persisted-focus");
	for (const task of ordered) add(task, "roadmap-order");
	return candidates;
}

function layerForArtifactPath(path: string, fallback: ChangeClaimScope["layer"]): ChangeClaimScope["layer"] {
	if (path.startsWith(".codewiki/kb/")) return "knowledge";
	if (path.startsWith(".codewiki/roadmap/")) return "roadmap";
	if (path.startsWith(".codewiki/builds/")) return "build";
	if (path.startsWith(".codewiki/validation/")) return "validation";
	if (path === ".codewiki/index_graph.json" || path.startsWith(".codewiki/views/")) return "graph";
	return fallback;
}

function pathScope(path: string): string {
	const normalized = path.replace(/^\.\//, "").replace(/\\/g, "/").replace(/\/+/g, "/");
	const last = normalized.split("/").pop() || "";
	if (normalized.includes("*")) return normalized;
	if (normalized.endsWith("/")) return `${normalized}**`;
	if (last.includes(".")) return normalized;
	return `${normalized}/**`;
}

function formatBlockingArtifactStatuses(statuses: ArtifactStatusRecord[]): string {
	const blocking = statuses.filter((status) => status.status === "conflict");
	if (blocking.length === 0) return "Artifact status is available.";
	return `Artifact conflict: ${blocking.slice(0, 4).map((status) => {
		const holders = status.holders.map((holder) => `${holder.record_id}:${holder.session_id}`).join(", ") || "unknown holder";
		return `${artifactScopeLabel(status.artifact)} in-use by ${holders}`;
	}).join("; ")}.`;
}

function describeArtifactStatusLine(status: ArtifactStatusRecord): string {
	const holders = status.holders
		.map((holder) => `${holder.record_id}:${holder.session_id}${holder.agent_name ? `/${holder.agent_name}` : ""}`)
		.join(", ");
	const waiters = status.waiters
		.map((waiter) => `${waiter.record_id}:${waiter.session_id}${waiter.agent_name ? `/${waiter.agent_name}` : ""}`)
		.join(", ");
	return [
		`- ${artifactScopeLabel(status.artifact)}: ${status.status}`,
		holders ? `holders=[${holders}]` : "holders=[]",
		waiters ? `waiters=[${waiters}]` : "waiters=[]",
	].join("; ");
}

function preflightSummary(report: LintReport): CodewikiResumeContextPacket["preflight"] {
	return {
		color: statusColor(report),
		errors: Number(report.counts.error || 0),
		warnings: Number(report.counts.warning || 0),
		total: report.issues.length,
	};
}

function resumeContextSourceRefs(
	project: WikiProject,
	task: RoadmapTaskRecord,
	taskContext: RoadmapTaskContextPacket | null,
): string[] {
	return unique([
		project.roadmapPath,
		project.statusStatePath,
		project.graphPath.replace(`${project.root}/`, ""),
		taskContext?.context_path || `.codewiki/roadmap/tasks/${task.id}/context.json`,
		...task.spec_paths,
		...task.code_paths,
	]);
}

function normalizeOptionalTaskId(value: string | null | undefined): string | null {
	const trimmed = String(value || "").trim();
	return trimmed || null;
}
