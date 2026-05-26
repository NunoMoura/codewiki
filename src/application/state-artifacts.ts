import { resolve } from "node:path";
import type { WikiProject } from "../project/types.ts";
import type { RoadmapStatus, ToolTaskStatus } from "../domain/roadmap/types.ts";
import type {
	StatusStateFile,
	RoadmapStateFile,
	GraphFile,
	RoadmapTaskContextPacket,
	RoadmapStateTaskSummary,
} from "../domain/state/types.ts";
import type { LintReport } from "../validation/types.ts";
import { maybeReadJson, readJson } from "../project/local/filesystem.ts";
import {
	runRebuild as runApplicationRebuild,
	runRebuildUnlocked as runApplicationRebuildUnlocked,
} from "./rebuild.ts";
import type { RebuildRunner } from "./ports.ts";
export { rebuildTargetPaths } from "./rebuild.ts";

/**
 * Run the rebuild command for a project.
 */
export async function runRebuild(project: WikiProject): Promise<void> {
	return runApplicationRebuild(project, defaultRebuildRunner);
}

/**
 * Rebuild the project and summarize the current state.
 */
export async function rebuildAndSummarize(
	project: WikiProject,
): Promise<{ text: string; issueCount: number; report: LintReport }> {
	await runRebuild(project);
	const indexGraph = await readJson<any>(project.graphPath);
	const report = indexGraph?.lenses?.lint as LintReport;
	const kinds = Object.entries(report.counts)
		.map(([kind, count]) => `${kind}=${count}`)
		.join(" ");
	return {
		text: `${project.label}: ${report.issues.length} issue(s) (${kinds})`,
		issueCount: report.issues.length,
		report,
	};
}

/**
 * Run the rebuild command without locking (caller must lock).
 */
export async function runRebuildUnlocked(project: WikiProject): Promise<void> {
	return runApplicationRebuildUnlocked(project, defaultRebuildRunner);
}

const defaultRebuildRunner: RebuildRunner = {
	run: async (project) => {
		const { runConfiguredOrDefaultRebuild } = await import("./local/rebuild-runner.ts");
		await runConfiguredOrDefaultRebuild(project);
	},
};

/**
 * Load all core state artifacts, optionally refreshing them first.
 */
export async function loadCodewikiStateArtifacts(
	project: WikiProject,
	refresh: boolean,
): Promise<{
	refreshPerformed: boolean;
	report: LintReport | null;
	statusState: StatusStateFile | null;
	roadmapState: RoadmapStateFile | null;
	graph: GraphFile | null;
}> {
	let refreshPerformed = false;
	if (refresh) {
		await runRebuild(project);
		refreshPerformed = true;
	}
	let graph = await maybeReadJson<(GraphFile & { lenses?: { lint?: LintReport; status?: StatusStateFile; roadmap?: RoadmapStateFile } })>(project.graphPath);
	if (!graph && !refreshPerformed) {
		await runRebuild(project);
		refreshPerformed = true;
		graph = await maybeReadJson<(GraphFile & { lenses?: { lint?: LintReport; status?: StatusStateFile; roadmap?: RoadmapStateFile } })>(project.graphPath);
	}
	const report = graph?.lenses?.lint ?? null;
	const statusState = graph?.lenses?.status ?? null;
	const roadmapState = graph?.lenses?.roadmap ?? null;
	return { refreshPerformed, report, statusState, roadmapState, graph };
}

export async function maybeReadStatusState(path: string): Promise<StatusStateFile | null> {
	const value = await maybeReadJson<any>(path);
	return value?.lenses?.status ?? value ?? null;
}

export async function maybeReadRoadmapState(path: string): Promise<RoadmapStateFile | null> {
	const value = await maybeReadJson<any>(path);
	return value?.lenses?.roadmap ?? value ?? null;
}

export async function maybeReadGraph(path: string): Promise<GraphFile | null> {
	return maybeReadJson<GraphFile>(path);
}

/**
 * Determine the API status for a roadmap task.
 */
export function roadmapApiTaskState(
	task: { status: RoadmapStatus },
	_runtimeTask?: RoadmapStateTaskSummary | null,
): { status: ToolTaskStatus } {
	return { status: task.status };
}

/**
 * Map tool task status back to a roadmap status.
 */
export function mapToolTaskStatusToRoadmapStatus(
	status: ToolTaskStatus,
): RoadmapStatus {
	switch (status) {
		case "todo":
			return "todo";
		case "blocked":
			return "blocked";
		case "done":
			return "done";
		case "cancelled":
			return "cancelled";
		case "in_progress":
			return "in_progress";
	}
}

/**
 * Resolve the path to a task context file.
 */
export function resolveTaskContextPath(
	project: WikiProject,
	taskId: string,
	runtimeTask?: RoadmapStateTaskSummary | null,
): string {
	const relative =
		runtimeTask?.context_path || `.codewiki/roadmap/tasks/${taskId}/context.json`;
	return resolve(project.root, relative);
}

/**
 * Read the task context packet if it exists.
 */
export async function maybeReadTaskContext(
	project: WikiProject,
	taskId: string,
	runtimeTask?: RoadmapStateTaskSummary | null,
): Promise<RoadmapTaskContextPacket | null> {
	return maybeReadJson<RoadmapTaskContextPacket>(
		resolveTaskContextPath(project, taskId, runtimeTask),
	);
}

