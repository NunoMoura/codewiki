import { resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
	resolveCommandProject,
} from "../../../application/project.ts";
import {
	withUiErrorHandling,
	refreshStatusDock,
    queueAudit,
} from "../ui/manager.ts";
import { 
    maybeReadRoadmapState, 
    maybeReadGraph,
    maybeReadTaskContext,
    maybeReadStatusState,
    rebuildAndSummarize,
    runRebuild
} from "../../../application/state-artifacts.ts";
import {
	readRoadmapFile,
    taskLoopEvidenceLine,
    updateRoadmapTask,
    isRoadmapTaskToken,
    resolveRoadmapTask,
    isClosedRoadmapStatus,
} from "../../../application/roadmap.ts";
import { assessRoadmapTaskBoundary } from "../../../domain/roadmap/task-boundary.ts";
import { currentTaskLink, piSessionPorts } from "../session.ts";
import { recordSessionTaskAction } from "../../../application/session.ts";
import {
	artifactScopeLabel,
	artifactStatusesForScopes,
	buildChangeClaimState,
	hasBlockingArtifactStatus,
	mutateChangeClaims,
	normalizeScopes,
	readChangeClaimsFile,
} from "../../../application/claims.ts";
import { stableAgentName } from "../../../application/state-builders.ts";
import { 
    splitCommandArgs, 
    joinCommandArgs,
    nowIso,
    unique
} from "../../../domain/shared/utils.ts";
import { 
    statusColor,
    statusLevel
} from "../ui/theme.ts";
import { codePrompt } from "../../../application/prompt.ts";
import type { 
    RoadmapFile, 
    RoadmapTaskRecord, 
    TaskSessionLinkRecord,
    RoadmapStatus,
    TaskSessionAction,
	ChangeClaimScope,
	ChangeClaimState,
	ArtifactStatusRecord,
	WikiProject
} from "../../../domain/shared/types.ts";

/**
 * Register the wiki-resume command.
 */
export function registerResumeCommand(pi: ExtensionAPI): void {
	pi.registerCommand(`wiki-resume`, {
		description:
			"Resume roadmap work from current task focus or next open task. Usage: /wiki-resume [TASK-###] [repo-path] [-- follow-up intent]",
		handler: async (args, ctx) => {
			await withUiErrorHandling(ctx, async () => {
				await runResumeCommand(pi, "wiki-resume", args, ctx);
			});
		},
	});
}

async function runResumeCommand(
	pi: ExtensionAPI,
	commandName: "wiki-resume",
	args: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const { requestedTaskId, pathArg, followUpIntent } = normalizeCodeArgs(args);
	const project = await resolveCommandProject(ctx, pathArg, commandName);
	const summary = await rebuildAndSummarize(project);
	const graph = await maybeReadGraph(project.graphPath);
	const statusState = await maybeReadStatusState(project.statusStatePath);
	const persistedFocusTaskId = requestedTaskId
		? null
		: String(statusState?.resume?.task_id || statusState?.roadmap?.focused_task_id || "").trim() || null;
	const roadmap = await readRoadmapFile(
		resolve(project.root, project.roadmapPath),
	);
	const sessionId = String(ctx.sessionManager?.getSessionId?.() || "session-unknown").trim() || "session-unknown";
	const artifactState = buildChangeClaimState(await readChangeClaimsFile(project));
	const selection = resolveImplementationTask(
		roadmap,
		currentTaskLink(ctx),
		requestedTaskId,
		persistedFocusTaskId,
		artifactState,
		sessionId,
	);
	if (!selection.task) {
		ctx.ui.notify(
			`${project.label}: no artifact-available roadmap task for /${commandName}. ${selection.skipped.length > 0 ? `Skipped: ${selection.skipped.slice(0, 3).join("; ")}. ` : ""}Open /wiki-status or use Alt+W if you need a different direction.`,
			"warning",
		);
		await refreshStatusDock(project, ctx, currentTaskLink(ctx));
		return;
	}
	const task = selection.task;
	let resumedTask = task;
	let roadmapState = await maybeReadRoadmapState(project.roadmapStatePath);
	let runtimeTask = roadmapState?.tasks?.[task.id] ?? null;
	const desiredStatus: RoadmapStatus =
		task.status === "todo" || task.status === "blocked"
			? "in_progress"
			: task.status;
	if (desiredStatus !== task.status) {
		resumedTask = (
			await updateRoadmapTask(project, {
				taskId: task.id,
				status: desiredStatus,
			})
		).task;
		roadmapState = await maybeReadRoadmapState(project.roadmapStatePath);
		runtimeTask = roadmapState?.tasks?.[task.id] ?? null;
	}
	const selectionReason = describeResumeSelection(
		roadmap,
		currentTaskLink(ctx),
		requestedTaskId,
		persistedFocusTaskId,
		resumedTask,
		selection,
	);
	const action: TaskSessionAction = "progress";
	const sessionSummary = `Resumed roadmap work on ${resumedTask.id} through /${commandName}.`;
	await recordSessionTaskAction(project, {
		taskId: resumedTask.id,
		action,
		summary: sessionSummary,
		setSessionName: false,
	}, piSessionPorts(pi, ctx));
	const usageSummary = await markResumeArtifactsInUse(project, resumedTask, sessionId);
	const activeLink: TaskSessionLinkRecord = {
		taskId: resumedTask.id,
		action,
		summary: sessionSummary,
		filesTouched: [],
		spawnedTaskIds: [],
		timestamp: nowIso(),
	};
	const evidence = [
		taskLoopEvidenceLine(runtimeTask),
		describeArtifactPromptContext(selection.artifact_statuses, usageSummary, selection.skipped),
	].filter(Boolean).join("\n");
	await runRebuild(project);
	const refreshedRoadmapState = await maybeReadRoadmapState(
		project.roadmapStatePath,
	);
	const refreshedRuntimeTask =
		refreshedRoadmapState?.tasks?.[resumedTask.id] ?? null;
	const taskContext = await maybeReadTaskContext(
		project,
		resumedTask.id,
		refreshedRuntimeTask,
	);
	const refreshedGraph = (await maybeReadGraph(project.graphPath)) ?? graph;
	ctx.ui.notify(
		`${project.label}: queued ${resumedTask.status} for ${resumedTask.id} — ${resumedTask.title}. ${selectionReason} ${usageSummary} Deterministic preflight is ${statusColor(summary.report)}.`,
		statusLevel(summary.report),
	);
	await refreshStatusDock(project, ctx, activeLink);
	await queueAudit(
		pi,
		ctx,
		codePrompt(
			project,
			refreshedGraph,
			summary.report,
			resumedTask,
			evidence,
			taskContext,
			followUpIntent,
		),
	);
}

export function normalizeCodeArgs(args: string): {
	requestedTaskId: string | null;
	pathArg: string | null;
	followUpIntent: string;
} {
	const tokens = splitCommandArgs(args);
	if (tokens.length === 0) {
		return { requestedTaskId: null, pathArg: null, followUpIntent: "" };
	}

	const delimiterIndex = tokens.indexOf("--");
	const commandTokens = delimiterIndex >= 0 ? tokens.slice(0, delimiterIndex) : tokens;
	const explicitIntent = delimiterIndex >= 0 ? joinIntentTokens(tokens.slice(delimiterIndex + 1)) : "";
	if (commandTokens.length === 0) {
		return { requestedTaskId: null, pathArg: null, followUpIntent: explicitIntent };
	}

	const first = commandTokens[0];
	const last = commandTokens[commandTokens.length - 1];
	if (isRoadmapTaskToken(first)) {
		const remainderTokens = commandTokens.slice(1);
		const remainder = joinCommandArgs(remainderTokens) ?? "";
		return looksLikePathArg(remainder) || explicitIntent
			? { requestedTaskId: first, pathArg: remainder || null, followUpIntent: explicitIntent }
			: { requestedTaskId: first, pathArg: null, followUpIntent: joinIntentTokens(remainderTokens) };
	}
	if (commandTokens.length > 1 && isRoadmapTaskToken(last)) {
		return {
			requestedTaskId: last,
			pathArg: joinCommandArgs(commandTokens.slice(0, -1)) || null,
			followUpIntent: explicitIntent,
		};
	}
	const remainder = joinCommandArgs(commandTokens) ?? "";
	return looksLikePathArg(remainder) || explicitIntent
		? { requestedTaskId: null, pathArg: remainder || null, followUpIntent: explicitIntent }
		: { requestedTaskId: null, pathArg: null, followUpIntent: joinIntentTokens(commandTokens) };
}

function joinIntentTokens(tokens: string[]): string {
	return tokens.join(" ").trim();
}

function looksLikePathArg(value: string): boolean {
	const trimmed = value.trim();
	return Boolean(
		trimmed &&
		(
			trimmed.startsWith(".") ||
			trimmed.startsWith("/") ||
			trimmed.startsWith("~") ||
			/^[A-Za-z]:[\\/]/.test(trimmed) ||
			trimmed.includes("/") ||
			trimmed.includes("\\")
		),
	);
}

export interface ResumeSelection {
	task: RoadmapTaskRecord | null;
	source: "explicit" | "session-focus" | "persisted-focus" | "roadmap-order" | "none";
	artifact_statuses: ArtifactStatusRecord[];
	skipped: string[];
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

function describeResumeSelection(
	_roadmap: RoadmapFile,
	_activeLink: TaskSessionLinkRecord | null,
	requestedTaskId: string | null,
	_persistedFocusTaskId: string | null,
	task: RoadmapTaskRecord,
	selection: ResumeSelection,
): string {
	if (requestedTaskId) return `User requested ${task.id} explicitly; artifact status allowed start.`;
	const skipped = selection.skipped.length > 0 ? ` Skipped ${selection.skipped.slice(0, 3).join("; ")}.` : "";
	if (selection.source === "session-focus") return `Continuing session-focused ${task.status} work after artifact-status check.${skipped}`;
	if (selection.source === "persisted-focus") return `Continuing persisted ${task.status} focus after artifact-status check.${skipped}`;
	return `Selected next artifact-available ${task.status} task from fresh roadmap/session queue state.${skipped}`;
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

function taskArtifactScopes(task: RoadmapTaskRecord): ChangeClaimScope[] {
	return normalizeScopes([
		{ layer: "roadmap", task_id: task.id },
		...task.spec_paths.map((path) => ({ layer: layerForArtifactPath(path, "knowledge"), path: pathScope(path) })),
		...task.code_paths.map((path) => ({ layer: layerForArtifactPath(path, "code"), path: pathScope(path) })),
	]);
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

async function markResumeArtifactsInUse(project: WikiProject, task: RoadmapTaskRecord, sessionId: string): Promise<string> {
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

function describeArtifactPromptContext(statuses: ArtifactStatusRecord[], usageSummary: string, skipped: string[]): string {
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
