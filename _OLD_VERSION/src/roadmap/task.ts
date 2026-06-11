/**
 * roadmap/task.ts
 *
 * Task mutation use cases — create, update, close, append evidence.
 * Orchestrates roadmap task mutation helpers behind port interfaces.
 */
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { WikiProject } from "../project/types.ts";
import type {
	RoadmapTaskRecord,
	RoadmapTaskInput,
	CodewikiRoadmapPatchInput,
	CodewikiRoadmapEvidenceInput,
	RoadmapStatus,
} from "./types.ts";
import {
	appendRoadmapTasks,
	updateRoadmapTask,
	appendCodewikiTaskEvidence,
	readRoadmapTask,
	hasCodewikiTaskPatchChanges,
	buildRoadmapTaskUpdateFromCodewikiPatch,
	hasRoadmapTaskUpdateFields,
} from "./store.ts";
import { maybeReadRoadmapState } from "../state/artifacts.ts";
import type { FileStore, RebuildRunner, MessageBus } from "../shared/ports.ts";

// ---------------------------------------------------------------------------
// Port dependencies
// ---------------------------------------------------------------------------

export interface TaskMutationPorts {
	fileStore: FileStore;
	rebuildRunner: RebuildRunner;
	messageBus: MessageBus;
}

// ---------------------------------------------------------------------------
// Create tasks
// ---------------------------------------------------------------------------

export async function createCodewikiTasks(
	project: WikiProject,
	inputs: RoadmapTaskInput[],
	ports: TaskMutationPorts,
): Promise<{
	created: RoadmapTaskRecord[];
	reused: RoadmapTaskRecord[];
	refined: RoadmapTaskRecord[];
}> {
	const result = await appendRoadmapTasks(
		null as any,
		project,
		null as any,
		inputs,
		{ refresh: false },
	);
	await ports.rebuildRunner.run(project);
	return result;
}

// ---------------------------------------------------------------------------
// Update task (patch-style from wiki_roadmap tool)
// ---------------------------------------------------------------------------

export async function patchCodewikiTask(
	project: WikiProject,
	taskId: string,
	patch: CodewikiRoadmapPatchInput,
	ports: TaskMutationPorts,
): Promise<{ task: RoadmapTaskRecord; changed: boolean }> {
	const task = await readRoadmapTask(project, taskId);
	if (!task) throw new Error(`Roadmap task not found: ${taskId}`);

	const state = await maybeReadRoadmapState(project.roadmapStatePath);
	const stateTask = state?.tasks?.[task.id] ?? null;

	if (!hasCodewikiTaskPatchChanges(patch)) {
		return { task, changed: false };
	}

	const update = buildRoadmapTaskUpdateFromCodewikiPatch(
		task,
		stateTask,
		patch,
	);

	if (!hasRoadmapTaskUpdateFields(update)) {
		return { task, changed: false };
	}

	const result = await updateRoadmapTask(project, update, { refresh: false });
	if (result.changed) await ports.rebuildRunner.run(project);
	return result;
}

// ---------------------------------------------------------------------------
// Close task with verification gateway
// ---------------------------------------------------------------------------

function hasPublisherTaskCloseEvidence(isolation: any): boolean {
	return Boolean(
		isolation?.published_sha ||
			isolation?.tree_sha ||
			isolation?.archive_ref ||
			isolation?.remote_ref,
	);
}

function validationContentRefs(isolation: any): string[] {
	return [
		isolation?.validated_sha,
		isolation?.head_sha,
		isolation?.published_sha,
		isolation?.tree_sha,
		isolation?.package_digest,
		isolation?.archive_ref,
		isolation?.remote_ref,
		isolation?.working_tree_digest,
		isolation?.worktree_digest,
	]
		.map((value) => String(value || "").trim())
		.filter(Boolean);
}

function contentRefsOverlap(left: string[], right: string[]): boolean {
	if (left.length === 0 || right.length === 0) return false;
	const rightSet = new Set(right);
	return left.some((ref) => rightSet.has(ref));
}

async function readTaskValidationReports(
	project: WikiProject,
	taskId: string,
): Promise<any[]> {
	const validationDir = resolve(project.root, ".codewiki/validation");
	let entries: string[];
	try {
		entries = await readdir(validationDir);
	} catch {
		return [];
	}
	const reports: any[] = [];
	for (const entry of entries) {
		if (!entry.endsWith(".json")) continue;
		try {
			const data = JSON.parse(
				await readFile(resolve(validationDir, entry), "utf8"),
			);
			if (
				data?.kind === "validation_report" &&
				data?.task_id === taskId &&
				data?.verdict === "pass"
			)
				reports.push(data);
		} catch {
			// Ignore malformed or partial validation files; validation writer owns schema errors.
		}
	}
	return reports;
}

async function taskCloseReadiness(
	project: WikiProject,
	taskId: string,
): Promise<{ ready: boolean; missing: string[] }> {
	const reports = await readTaskValidationReports(project, taskId);
	const taskCloseReports = reports.filter(
		(report) => report?.profile === "task-close",
	);
	const shipReadyReports = reports.filter(
		(report) => report?.profile === "ship-ready",
	);
	const missing = new Set<string>();
	if (taskCloseReports.length === 0) missing.add("task-close validation pass");
	if (shipReadyReports.length === 0)
		missing.add("task-scoped ship-ready validation pass");
	for (const taskClose of taskCloseReports) {
		const taskCloseIsolation = taskClose?.isolation || {};
		if (taskCloseIsolation.fresh_context !== true)
			missing.add("fresh_context=true");
		if (taskCloseIsolation.clean !== true) missing.add("clean=true");
		if (!hasPublisherTaskCloseEvidence(taskCloseIsolation))
			missing.add("publisher result evidence");
		const closeRefs = validationContentRefs(taskCloseIsolation);
		if (
			shipReadyReports.some((shipReady) => {
				const shipReadyIsolation = shipReady?.isolation || {};
				return (
					shipReadyIsolation.fresh_context === true &&
					shipReadyIsolation.clean === true &&
					(closeRefs.length === 0 ||
						contentRefsOverlap(
							closeRefs,
							validationContentRefs(shipReadyIsolation),
						))
				);
			})
		) {
			return { ready: true, missing: [] };
		}
		if (shipReadyReports.length > 0)
			missing.add("ship-ready validation for exact content candidate");
	}
	return { ready: false, missing: [...missing] };
}

export async function closeCodewikiTask(
	project: WikiProject,
	taskId: string,
	ports: TaskMutationPorts,
	evidence?: CodewikiRoadmapEvidenceInput,
	summary?: string,
): Promise<{
	closed: boolean;
	verification: any;
	reason: string;
}> {
	const task = await readRoadmapTask(project, taskId);
	if (!task) throw new Error(`Roadmap task not found: ${taskId}`);

	// The validation gateway owns task-close decisions. Closing is a
	// publication/content-evidence boundary, so it must cite passing task-close
	// validation and task-scoped ship-ready validation for the exact content
	// candidate rather than dirty pre-commit implementation evidence or
	// validator-only attestations.
	const readiness = await taskCloseReadiness(project, task.id);
	if (!readiness.ready) {
		throw new Error(
			`Task close blocked for ${task.id}: next_loop=validation; run ship-ready then task-close validation with fresh_context=true, clean=true, publisher result evidence (published_sha/tree_sha/archive_ref/remote_ref), and exact content evidence. Missing: ${readiness.missing.join(", ") || "task-close validation evidence"}.`,
		);
	}

	await updateRoadmapTask(
		project,
		{
			taskId: task.id,
			status: "done",
			summary: summary?.trim() || evidence?.summary?.trim() || "Task closed.",
		},
		{ refresh: false },
	);

	await ports.rebuildRunner.run(project);

	return {
		closed: true,
		verification: null,
		reason: "Task closed.",
	};
}

// ---------------------------------------------------------------------------
// Append evidence
// ---------------------------------------------------------------------------

export async function appendTaskEvidence(
	project: WikiProject,
	taskId: string,
	evidence: CodewikiRoadmapEvidenceInput,
	ports: TaskMutationPorts,
): Promise<void> {
	const task = await readRoadmapTask(project, taskId);
	if (!task) throw new Error(`Roadmap task not found: ${taskId}`);
	await appendCodewikiTaskEvidence(project, task, evidence, false);
	await ports.rebuildRunner.run(project);
}

// ---------------------------------------------------------------------------
// Cancel task
// ---------------------------------------------------------------------------

export async function cancelCodewikiTask(
	project: WikiProject,
	taskId: string,
	ports: TaskMutationPorts,
	summary?: string,
): Promise<void> {
	const task = await readRoadmapTask(project, taskId);
	if (!task) throw new Error(`Roadmap task not found: ${taskId}`);

	await updateRoadmapTask(
		project,
		{
			taskId: task.id,
			status: "cancelled" as RoadmapStatus,
			summary: summary ?? task.summary,
		},
		{ refresh: false },
	);
	await ports.rebuildRunner.run(project);
}
