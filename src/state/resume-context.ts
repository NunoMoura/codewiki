import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
	artifactScopeLabel,
	buildChangeClaimState,
	readChangeClaimsFile,
} from "../session/claims.ts";
import { codePrompt, statusColor } from "./prompt.ts";
import { readRoadmapFile, taskLoopEvidenceLine } from "../roadmap/store.ts";
import {
	loadCodewikiStateArtifacts,
	maybeReadTaskContext,
} from "./artifacts.ts";
import { unique } from "../shared/utils.ts";
import { roadmapImplementationReadiness } from "../build/shared.ts";
import {
	resolveImplementationTask,
	type ResumeSelection,
} from "./resume-selection.ts";
import type { WikiProject } from "../project/types.ts";
import type { RoadmapTaskRecord } from "../roadmap/types.ts";
import type {
	ArtifactStatusRecord,
	TaskSessionLinkRecord,
} from "../session/types.ts";
import type {
	GraphFile,
	RoadmapStateFile,
	RoadmapTaskContextPacket,
} from "./types.ts";
import type { LintReport } from "../gateway/types.ts";

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

export type CodewikiResumeContextResult =
	| CodewikiResumeContextPacket
	| CodewikiResumeContextUnavailable;

export async function buildCodewikiResumeContext(
	project: WikiProject,
	input: BuildCodewikiResumeContextInput = {},
): Promise<CodewikiResumeContextResult> {
	const artifacts = await loadCodewikiStateArtifacts(
		project,
		input.refresh ?? true,
	);
	if (!artifacts.report) {
		throw new Error(
			"CodeWiki resume context requires generated graph lint state. Re-run with refresh=true.",
		);
	}
	const report = artifacts.report;
	const roadmap = await readRoadmapFile(
		resolve(project.root, project.roadmapPath),
	);
	const requestedTaskId = normalizeOptionalTaskId(input.requestedTaskId);
	const persistedFocusTaskId = requestedTaskId
		? null
		: String(
				artifacts.statusState?.resume?.task_id ||
					artifacts.statusState?.roadmap?.focused_task_id ||
					"",
			).trim() || null;
	const sessionId =
		String(input.sessionId || "resume-context").trim() || "resume-context";
	const artifactState = buildChangeClaimState(
		await readChangeClaimsFile(project),
	);
	const selection = resolveImplementationTask(
		roadmap,
		input.activeLink ?? null,
		requestedTaskId,
		persistedFocusTaskId,
		artifactState,
		sessionId,
		roadmapImplementationReadiness(project, roadmap),
	);
	if (!selection.task) {
		return unavailableResumeContext(
			project,
			report,
			selection,
			input.followUpIntent || "",
		);
	}
	return buildResumeContextForTask(project, {
		task: selection.task,
		selection,
		report,
		roadmapState: artifacts.roadmapState,
		graph: artifacts.graph,
		followUpIntent: input.followUpIntent || "",
		usageSummary:
			"read-only resume context build; no artifact-status claim marked",
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
	const taskContext = await maybeReadTaskContext(
		project,
		input.task.id,
		runtimeTask,
	);
	const usageSummary =
		input.usageSummary ||
		"read-only resume context build; no artifact-status claim marked";
	const evidence = [
		taskLoopEvidenceLine(runtimeTask),
		await taskBuildEvidence(project, input.task.id),
		describeArtifactPromptContext(
			input.selection.artifact_statuses,
			usageSummary,
			input.selection.skipped,
		),
	]
		.filter(Boolean)
		.join("\n");
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
	return codePrompt(
		project,
		graph,
		report,
		task,
		evidence,
		taskContext,
		followUpIntent,
	);
}

async function taskBuildEvidence(
	project: WikiProject,
	taskId: string,
): Promise<string> {
	const dirs = [
		".codewiki/builds/implementation",
		".codewiki/builds/planning",
		".codewiki/builds/decision",
	];
	const refs: Array<{
		path: string;
		kind: string;
		summary: string;
		checks: string[];
	}> = [];
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
				const taskIds = [
					String(data?.task_id || ""),
					...stringArray(data?.task_ids),
					...stringArray(data?.consumes?.roadmap),
					...stringArray(data?.produces?.roadmap),
				];
				if (!taskIds.includes(taskId)) continue;
				refs.push({
					path: relPath,
					kind: String(
						data?.kind || data?.build_kind || dir.split("/").pop() || "build",
					),
					summary: String(
						data?.summary || data?.closure_brief?.user_intent || "",
					).trim(),
					checks: stringArray(data?.checks_run || data?.closure_brief?.checks),
				});
			} catch (error) {
				void error;
			}
		}
	}
	const latest = refs.slice(-5).reverse();
	if (latest.length === 0) return "";
	return [
		"Recent task build evidence:",
		...latest.map((item) => {
			const checks =
				item.checks.length > 0
					? ` checks=${item.checks.slice(0, 5).join("; ")}`
					: "";
			const summary = item.summary ? ` — ${item.summary}` : "";
			return `- ${item.path} (${item.kind})${summary}${checks}`;
		}),
	].join("\n");
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => String(item || "").trim()).filter(Boolean)
		: [];
}

export function describeArtifactPromptContext(
	statuses: ArtifactStatusRecord[],
	usageSummary: string,
	skipped: string[],
): string {
	const lines = [
		"Artifact status preflight:",
		`- Temporary session usage record: ${usageSummary}`,
		...statuses.slice(0, 10).map(describeArtifactStatusLine),
	];
	if (skipped.length > 0) {
		lines.push(
			"Skipped artifact conflicts or coordination tasks:",
			...unique(skipped)
				.slice(0, 8)
				.map((item) => `- ${item}`),
		);
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
		evidence:
			selection.skipped.length > 0
				? `Skipped: ${unique(selection.skipped).join("; ")}`
				: "No artifact-available executable roadmap task found.",
		follow_up_intent: followUpIntent,
		context_path: null,
		source_refs: [
			project.roadmapPath,
			project.graphPath.replace(`${project.root}/`, ""),
			project.statusStatePath,
		],
	};
}

function describeArtifactStatusLine(status: ArtifactStatusRecord): string {
	const holders = status.holders
		.map(
			(holder) =>
				`${holder.record_id}:${holder.session_id}${holder.agent_name ? `/${holder.agent_name}` : ""}`,
		)
		.join(", ");
	const waiters = status.waiters
		.map(
			(waiter) =>
				`${waiter.record_id}:${waiter.session_id}${waiter.agent_name ? `/${waiter.agent_name}` : ""}`,
		)
		.join(", ");
	return [
		`- ${artifactScopeLabel(status.artifact)}: ${status.status}`,
		holders ? `holders=[${holders}]` : "holders=[]",
		waiters ? `waiters=[${waiters}]` : "waiters=[]",
	].join("; ");
}

function preflightSummary(
	report: LintReport,
): CodewikiResumeContextPacket["preflight"] {
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
		taskContext?.context_path ||
			`.codewiki/roadmap/tasks/${task.id}/context.json`,
		...task.spec_paths,
		...task.code_paths,
	]);
}

function normalizeOptionalTaskId(
	value: string | null | undefined,
): string | null {
	const trimmed = String(value || "").trim();
	return trimmed || null;
}
