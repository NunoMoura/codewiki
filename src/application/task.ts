/**
 * application/task.ts
 *
 * Task mutation use cases — create, update, close, append evidence.
 * Orchestrates roadmap task mutation helpers behind port interfaces.
 */
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { WikiProject, RoadmapTaskRecord, RoadmapTaskInput, CodewikiTaskPatchInput, CodewikiTaskEvidenceInput, RoadmapStatus } from "../domain/shared/types.ts";
import { appendRoadmapTasks, updateRoadmapTask, appendCodewikiTaskEvidence, readRoadmapTask, hasCodewikiTaskPatchChanges, buildRoadmapTaskUpdateFromCodewikiPatch, hasRoadmapTaskUpdateFields } from "./roadmap.ts";
import { maybeReadRoadmapState } from "./state-artifacts.ts";
import type { FileStore, RebuildRunner, MessageBus } from "./ports.ts";

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
): Promise<{ created: RoadmapTaskRecord[]; reused: RoadmapTaskRecord[]; refined: RoadmapTaskRecord[] }> {
	const result = await appendRoadmapTasks(null as any, project, null as any, inputs, { refresh: false });
	await ports.rebuildRunner.run(project);
	return result;
}

// ---------------------------------------------------------------------------
// Update task (patch-style from codewiki_task tool)
// ---------------------------------------------------------------------------

export async function patchCodewikiTask(
	project: WikiProject,
	taskId: string,
	patch: CodewikiTaskPatchInput,
	ports: TaskMutationPorts,
): Promise<{ task: RoadmapTaskRecord; changed: boolean }> {
	const task = await readRoadmapTask(project, taskId);
	if (!task) throw new Error(`Roadmap task not found: ${taskId}`);

	const state = await maybeReadRoadmapState(project.roadmapStatePath);
	const runtimeTask = state?.tasks?.[task.id] ?? null;

	if (!hasCodewikiTaskPatchChanges(patch)) {
		return { task, changed: false };
	}

	const update = buildRoadmapTaskUpdateFromCodewikiPatch(task, runtimeTask, patch);

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

function hasPublisherTaskCloseProof(isolation: any): boolean {
	return Boolean(
		isolation?.published_sha ||
		isolation?.tree_sha ||
		isolation?.archive_ref ||
		isolation?.remote_ref,
	);
}

async function hasPassingTaskCloseValidation(project: WikiProject, taskId: string): Promise<boolean> {
	const validationDir = resolve(project.root, ".codewiki/validation");
	let entries: string[];
	try {
		entries = await readdir(validationDir);
	} catch {
		return false;
	}
	for (const entry of entries) {
		if (!entry.endsWith(".json")) continue;
		try {
			const data = JSON.parse(await readFile(resolve(validationDir, entry), "utf8"));
			const isolation = data?.isolation || {};
			if (
				data?.kind === "validation_report" &&
				data?.profile === "task-close" &&
				data?.task_id === taskId &&
				data?.verdict === "pass" &&
				isolation.fresh_context === true &&
				isolation.clean === true &&
				hasPublisherTaskCloseProof(isolation)
			) return true;
		} catch {
			// Ignore malformed or partial validation files; validation writer owns schema errors.
		}
	}
	return false;
}

export async function closeCodewikiTask(
	project: WikiProject,
	taskId: string,
	ports: TaskMutationPorts,
	evidence?: CodewikiTaskEvidenceInput,
	summary?: string,
): Promise<{
	closed: boolean;
	verification: any;
	reason: string;
}> {
	const task = await readRoadmapTask(project, taskId);
	if (!task) throw new Error(`Roadmap task not found: ${taskId}`);

	// The validation gateway owns task-close decisions. Closing is a
	// publication/content-proof boundary, so it must cite a passing task-close
	// validation report with clean publisher result proof rather than dirty
	// pre-commit implementation evidence or validator-only attestations.
	if (!await hasPassingTaskCloseValidation(project, task.id)) {
		throw new Error(
			`Task close blocked for ${task.id}: requires passing task-close validation with fresh_context=true, clean=true, and publisher result proof (published_sha/tree_sha/archive_ref/remote_ref).`,
		);
	}

	await updateRoadmapTask(project, {
		taskId: task.id,
		status: "done",
		summary: summary?.trim() || evidence?.summary?.trim() || "Task closed.",
	}, { refresh: false });

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
	evidence: CodewikiTaskEvidenceInput,
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

	await updateRoadmapTask(project, {
		taskId: task.id,
		status: "cancelled" as RoadmapStatus,
		summary: summary ?? task.summary,
	}, { refresh: false });
	await ports.rebuildRunner.run(project);
}
