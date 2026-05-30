import {
	artifactScopeLabel,
	artifactStatusesForScopes,
	buildChangeClaimState,
	hasBlockingArtifactStatus,
	mutateChangeClaims,
	normalizeScopes,
	readChangeClaimsFile,
} from "../session/claims.ts";
import {
	isClosedRoadmapStatus,
	resolveRoadmapTask,
} from "../roadmap/store.ts";
import { assessRoadmapTaskBoundary } from "../roadmap/task-boundary.ts";
import { stableAgentName } from "./builders.ts";
import type { WikiProject } from "../project/types.ts";
import type { RoadmapFile, RoadmapTaskRecord } from "../roadmap/types.ts";
import type {
	ArtifactStatusRecord,
	ChangeClaimScope,
	ChangeClaimState,
	TaskSessionLinkRecord,
} from "../session/types.ts";

export interface ResumeSelection {
	task: RoadmapTaskRecord | null;
	source:
		| "explicit"
		| "session-focus"
		| "persisted-focus"
		| "roadmap-order"
		| "none";
	artifact_statuses: ArtifactStatusRecord[];
	skipped: string[];
}

export type TaskImplementationReadiness = Record<string, string[]>;

export interface ResumeCandidate {
	task: RoadmapTaskRecord;
	source: ResumeSelection["source"];
	boundary: ReturnType<typeof assessRoadmapTaskBoundary>;
}

function taskReadinessGaps(
	task: RoadmapTaskRecord,
	readiness: TaskImplementationReadiness = {},
): string[] {
	return readiness[task.id] ?? [];
}

export function resolveImplementationTask(
	roadmap: RoadmapFile,
	activeLink: TaskSessionLinkRecord | null,
	requestedTaskId: string | null,
	persistedFocusTaskId: string | null = null,
	artifactState: ChangeClaimState,
	sessionId: string,
	implementationReadiness: TaskImplementationReadiness = {},
): ResumeSelection {
	const ordered = roadmap.order
		.map((taskId) => roadmap.tasks[taskId])
		.filter((task): task is RoadmapTaskRecord => Boolean(task));
	if (requestedTaskId) {
		const requestedTask = resolveRoadmapTask(roadmap, requestedTaskId);
		if (!requestedTask)
			throw new Error(`Roadmap task not found: ${requestedTaskId}`);
		if (isClosedRoadmapStatus(requestedTask.status))
			throw new Error(`Roadmap task already closed: ${requestedTask.id}`);
		const requestedBoundary = assessRoadmapTaskBoundary(requestedTask);
		if (!requestedBoundary.executable) {
			throw new Error(
				`Roadmap task ${requestedTask.id} is not executable work. Use a sprint for grouping. ${requestedBoundary.reasons.join("; ")}`,
			);
		}
		const readinessGaps = taskReadinessGaps(
			requestedTask,
			implementationReadiness,
		);
		if (readinessGaps.length > 0) {
			throw new Error(
				`Roadmap task ${requestedTask.id} is not implementation-ready. ${readinessGaps.join("; ")}`,
			);
		}
		const artifactStatuses = artifactStatusesForScopes(
			taskArtifactScopes(requestedTask),
			artifactState,
			sessionId,
			"write",
		);
		if (hasBlockingArtifactStatus(artifactStatuses)) {
			throw new Error(
				`Roadmap task ${requestedTask.id} cannot start yet. ${formatBlockingArtifactStatuses(artifactStatuses)}`,
			);
		}
		return {
			task: requestedTask,
			source: "explicit",
			artifact_statuses: artifactStatuses,
			skipped: [],
		};
	}

	const candidates = resumeCandidates(
		roadmap,
		activeLink,
		persistedFocusTaskId,
	);
	const skipped: string[] = [];
	for (const candidate of candidates) {
		const artifactStatuses = artifactStatusesForScopes(
			taskArtifactScopes(candidate.task),
			artifactState,
			sessionId,
			"write",
		);
		if (!candidate.boundary.executable) {
			skipped.push(
				`${candidate.task.id}: non-executable container task (${candidate.boundary.reasons.join("; ")})`,
			);
			continue;
		}
		const readinessGaps = taskReadinessGaps(
			candidate.task,
			implementationReadiness,
		);
		if (readinessGaps.length > 0) {
			skipped.push(
				`${candidate.task.id}: not implementation-ready (${readinessGaps.join("; ")})`,
			);
			continue;
		}
		if (hasBlockingArtifactStatus(artifactStatuses)) {
			skipped.push(
				`${candidate.task.id}: ${formatBlockingArtifactStatuses(artifactStatuses)}`,
			);
			continue;
		}
		return {
			task: candidate.task,
			source: candidate.source,
			artifact_statuses: artifactStatuses,
			skipped,
		};
	}

	for (const task of ordered.filter(
		(item) => !isClosedRoadmapStatus(item.status),
	)) {
		const boundary = assessRoadmapTaskBoundary(task);
		if (!boundary.executable) {
			skipped.push(
				`${task.id}: non-executable container task (${boundary.reasons.join("; ")})`,
			);
			continue;
		}
		const readinessGaps = taskReadinessGaps(task, implementationReadiness);
		if (readinessGaps.length > 0) {
			skipped.push(
				`${task.id}: not implementation-ready (${readinessGaps.join("; ")})`,
			);
			continue;
		}
		const artifactStatuses = artifactStatusesForScopes(
			taskArtifactScopes(task),
			artifactState,
			sessionId,
			"write",
		);
		if (!hasBlockingArtifactStatus(artifactStatuses)) {
			return {
				task,
				source: "roadmap-order",
				artifact_statuses: artifactStatuses,
				skipped,
			};
		}
	}
	return { task: null, source: "none", artifact_statuses: [], skipped };
}

export function resumeCandidates(
	roadmap: RoadmapFile,
	activeLink: TaskSessionLinkRecord | null,
	persistedFocusTaskId: string | null,
): ResumeCandidate[] {
	const ordered = roadmap.order
		.map((taskId) => roadmap.tasks[taskId])
		.filter(
			(task): task is RoadmapTaskRecord =>
				Boolean(task) && !isClosedRoadmapStatus(task.status),
		);
	const candidates: ResumeCandidate[] = [];
	const add = (
		task: RoadmapTaskRecord | null,
		source: ResumeSelection["source"],
	) => {
		if (!task || isClosedRoadmapStatus(task.status)) return;
		if (candidates.some((item) => item.task.id === task.id)) return;
		candidates.push({
			task,
			source,
			boundary: assessRoadmapTaskBoundary(task),
		});
	};
	if (activeLink)
		add(resolveRoadmapTask(roadmap, activeLink.taskId), "session-focus");
	if (persistedFocusTaskId)
		add(resolveRoadmapTask(roadmap, persistedFocusTaskId), "persisted-focus");
	for (const task of ordered) add(task, "roadmap-order");
	return candidates;
}

export function describeResumeSelection(
	requestedTaskId: string | null,
	task: RoadmapTaskRecord,
	selection: ResumeSelection,
): string {
	if (requestedTaskId)
		return `User requested ${task.id} explicitly; artifact status allowed start.`;
	const skipped =
		selection.skipped.length > 0
			? ` Skipped ${selection.skipped.slice(0, 3).join("; ")}.`
			: "";
	if (selection.source === "session-focus")
		return `Continuing session-focused ${task.status} work after artifact-status check.${skipped}`;
	if (selection.source === "persisted-focus")
		return `Continuing persisted ${task.status} focus after artifact-status check.${skipped}`;
	return `Selected next artifact-available ${task.status} task from fresh roadmap/session queue state.${skipped}`;
}

export function taskArtifactScopes(
	task: RoadmapTaskRecord,
): ChangeClaimScope[] {
	return normalizeScopes([
		{ layer: "roadmap", task_id: task.id },
		...task.spec_paths.map((path) => ({
			layer: layerForArtifactPath(path, "knowledge"),
			path: pathScope(path),
		})),
		...task.code_paths.map((path) => ({
			layer: layerForArtifactPath(path, "code"),
			path: pathScope(path),
		})),
	]);
}

export async function markResumeArtifactsInUse(
	project: WikiProject,
	task: RoadmapTaskRecord,
	sessionId: string,
): Promise<string> {
	const state = buildChangeClaimState(await readChangeClaimsFile(project));
	if (
		state.claims.some(
			(claim) => claim.session_id === sessionId && claim.task_id === task.id,
		)
	) {
		return `Artifact status: already in-use by this session for ${task.id}.`;
	}
	const scopes = taskArtifactScopes(task);
	if (scopes.length === 0)
		return "Artifact status: no scoped artifacts declared for this task.";
	await mutateChangeClaims(
		project,
		{
			action: "claim",
			mode: "write",
			role: "builder",
			taskId: task.id,
			summary: `Artifact usage for ${task.id} via /wiki-resume.`,
			scopes,
			ttl_minutes: 240,
		},
		{ sessionId, agentName: stableAgentName(sessionId) },
	);
	return `Artifact status: marked in-use by this session for ${scopes.length} artifact(s).`;
}

function layerForArtifactPath(
	path: string,
	fallback: ChangeClaimScope["layer"],
): ChangeClaimScope["layer"] {
	if (path.startsWith(".codewiki/kb/")) return "knowledge";
	if (path.startsWith(".codewiki/roadmap/")) return "roadmap";
	if (path.startsWith(".codewiki/builds/")) return "build";
	if (path.startsWith(".codewiki/validation/")) return "validation";
	if (
		path === ".codewiki/index_graph.json" ||
		path.startsWith(".codewiki/views/")
	)
		return "graph";
	return fallback;
}

function pathScope(path: string): string {
	const normalized = path
		.replace(/^\.\//, "")
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/");
	const last = normalized.split("/").pop() || "";
	if (normalized.includes("*")) return normalized;
	if (normalized.endsWith("/")) return `${normalized}**`;
	if (last.includes(".")) return normalized;
	return `${normalized}/**`;
}

export function formatBlockingArtifactStatuses(
	statuses: ArtifactStatusRecord[],
): string {
	const blocking = statuses.filter((status) => status.status === "conflict");
	if (blocking.length === 0) return "Artifact status is available.";
	return `Artifact conflict: ${blocking
		.slice(0, 4)
		.map((status) => {
			const holders =
				status.holders
					.map((holder) => `${holder.record_id}:${holder.session_id}`)
					.join(", ") || "unknown holder";
			return `${artifactScopeLabel(status.artifact)} in-use by ${holders}`;
		})
		.join("; ")}.`;
}
