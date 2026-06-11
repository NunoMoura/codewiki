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
	graph_lens: string;
	expected_output: string;
	constraints: Record<string, unknown>;
	blockers: string[];
	artifact_status: ArtifactStatusRecord[];
	content_evidence_requirements: string[];
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
	const tracePrimaryHandoff = await taskTracePrimaryHandoffEvidence(
		project,
		input.task,
	);
	const evidence = [
		taskLoopEvidenceLine(runtimeTask),
		await taskBuildEvidence(project, input.task.id),
		tracePrimaryHandoff.evidence,
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
	const sourceRefs = resumeContextSourceRefs(
		project,
		input.graph,
		input.task,
		taskContext,
		tracePrimaryHandoff.refs,
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
		source_refs: sourceRefs,
		graph_lens: resumeGraphLens(input.task),
		expected_output: resumeExpectedOutput(input.task),
		constraints: resumeConstraints(input.task),
		blockers: resumeBlockers(input.selection),
		artifact_status: input.selection.artifact_statuses,
		content_evidence_requirements: resumeContentEvidenceRequirements(
			input.task,
		),
	};
}

function resumeGraphLens(task: RoadmapTaskRecord): string {
	return task.id ? `task:${task.id}` : "task";
}

function resumeExpectedOutput(task: RoadmapTaskRecord): string {
	return (
		task.delta.closure?.trim() ||
		task.goal.outcome?.trim() ||
		`Implementation evidence for ${task.id}.`
	);
}

function resumeConstraints(task: RoadmapTaskRecord): Record<string, unknown> {
	return {
		non_goals: task.goal.non_goals,
		verification: task.goal.verification,
		spec_paths: task.spec_paths,
		code_paths: task.code_paths,
		runtime_constraints: [
			"Context refresh blocks when required intent or runtime constraints are only chat-local.",
			"Fresh validation gates stay independent; gate verdict/report refs return to the originating compiler context.",
			"Agent scratch prefers repo-local ignored scratch/cache or in-memory streams; durable evidence uses canonical source refs.",
		],
		constraint_classes: [
			"durable-policy",
			"task-constraint",
			"session-runtime",
		],
		inheritance:
			"Refresh, spawn, and resume packets must carry active constraints as bounded refs or block before crossing the boundary.",
	};
}

function resumeBlockers(selection: ResumeSelection): string[] {
	return unique([
		...selection.skipped,
		...selection.artifact_statuses
			.filter((status) => status.status !== "available")
			.map(
				(status) =>
					`${status.status}: ${status.artifact.task_id || status.artifact.path || status.artifact.ref || status.artifact.description || "artifact"}`,
			),
	]);
}

function resumeContentEvidenceRequirements(task: RoadmapTaskRecord): string[] {
	const verification = task.goal.verification.map((item) => item.toLowerCase());
	return unique([
		"source_refs",
		"artifact_status",
		"expected_output",
		"content_evidence",
		...(verification.some((item) => item.includes("typecheck"))
			? ["npm run typecheck"]
			: []),
	]);
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

interface TracePrimaryHandoffEvidence {
	evidence: string;
	refs: string[];
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
		gateEvidence: string[];
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
					gateEvidence: stringArray(
						data?.["che" + "cks_run"] || data?.closure_brief?.["che" + "cks"],
					),
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
			const gateEvidence =
				item.gateEvidence.length > 0
					? ` evidence=${item.gateEvidence.slice(0, 5).join("; ")}`
					: "";
			const summary = item.summary ? ` — ${item.summary}` : "";
			return `- ${item.path} (${item.kind})${summary}${gateEvidence}`;
		}),
	].join("\n");
}

async function taskTracePrimaryHandoffEvidence(
	project: WikiProject,
	task: RoadmapTaskRecord,
): Promise<TracePrimaryHandoffEvidence> {
	const planningBuilds = await taskPlanningBuilds(project, task.id);
	const latest = planningBuilds.at(-1);
	if (!latest) return { evidence: "", refs: [] };
	const sourceDecisionBuild = String(
		latest.data?.source_decision_build || "",
	).trim();
	const decisionBuild = sourceDecisionBuild
		? await readJsonRef(project, sourceDecisionBuild)
		: null;
	const decisionGateRefs = sourceDecisionBuild
		? await validationRefsForSource(project, sourceDecisionBuild, "decision")
		: [];
	const planningGateRefs = await validationRefsForSource(
		project,
		latest.path,
		"planning",
	);
	const approvedRows = unique([
		...stringArray(decisionBuild?.approved_decision_rows),
		...recordArray(asRecord(decisionBuild?.decision_table).rows)
			.filter((item) => {
				const approval = asRecord(asRecord(item).approval);
				return String(approval.status || "") === "approved";
			})
			.map((item) => String(item.id || "").trim())
			.filter(Boolean),
	]);
	const knowledgeRefs = unique([
		...stringArray(decisionBuild?.knowledge_changes),
		...nestedStringRefs(decisionBuild?.row_to_kb_mappings, "knowledge_refs"),
		...nestedStringRefs(decisionBuild?.row_to_kb_mappings, "diagram_refs"),
	]);
	const decisionPropagation = asRecord(decisionBuild?.propagation);
	const downstreamQuestions = unique([
		...stringArray(decisionBuild?.downstream_planning_questions),
		...stringArray(decisionPropagation.downstream_planning_questions),
	]);
	const downstreamResolutions: string[] = Array.isArray(
		latest.data?.downstream_question_resolutions,
	)
		? recordArray(latest.data.downstream_question_resolutions)
				.map((item) => {
					const question = String(
						item.question || item.question_id || "",
					).trim();
					const resolution = String(item.resolution || "").trim();
					const taskIds = stringArray(item.task_ids).join(", ");
					return [question, resolution, taskIds ? `tasks=${taskIds}` : ""]
						.filter(Boolean)
						.join(" -> ");
				})
				.filter(Boolean)
		: [];
	const risks = unique([
		...stringArray(latest.data?.risks),
		...stringArray(decisionBuild?.risks),
		...stringArray(decisionBuild?.audit_reports),
	]);
	const requirements: string[] = Array.isArray(latest.data?.requirements)
		? recordArray(latest.data.requirements)
				.map((item) =>
					`${String(item.id || "").trim()}: ${String(item.text || "").trim()}`.trim(),
				)
				.filter((item: string) => item && !item.endsWith(":"))
		: [];
	const impact = [
		...stringArray(decisionPropagation.product_impact),
		...stringArray(decisionPropagation.system_impact),
	]
		.slice(0, 6)
		.join("; ");
	const refs = unique(
		[
			latest.path,
			sourceDecisionBuild,
			...decisionGateRefs,
			...planningGateRefs,
			...knowledgeRefs,
		].filter(Boolean),
	);
	const evidenceLines = [
		"Trace-primary handoff:",
		`- Planning build: ${latest.path}`,
		...(sourceDecisionBuild
			? [`- Source decision build: ${sourceDecisionBuild}`]
			: []),
		...(decisionGateRefs.length > 0
			? [`- Decision gate refs: ${decisionGateRefs.slice(0, 3).join(", ")}`]
			: []),
		...(planningGateRefs.length > 0
			? [`- Planning gate refs: ${planningGateRefs.slice(0, 3).join(", ")}`]
			: []),
		...(approvedRows.length > 0
			? [`- Approved rows: ${approvedRows.slice(0, 12).join(", ")}`]
			: []),
		...(knowledgeRefs.length > 0
			? [`- KB/diagram refs: ${knowledgeRefs.slice(0, 12).join(", ")}`]
			: []),
		...(impact ? [`- Risk/impact summary: ${impact}`] : []),
		...(downstreamResolutions.length > 0
			? [
					"- Downstream planning resolutions:",
					...downstreamResolutions.slice(0, 8).map((item) => `  - ${item}`),
				]
			: downstreamQuestions.length > 0
				? [
						"- Downstream planning questions:",
						...downstreamQuestions.slice(0, 8).map((item) => `  - ${item}`),
					]
				: []),
		...(risks.length > 0
			? ["- Blockers/risks:", ...risks.slice(0, 6).map((item) => `  - ${item}`)]
			: ["- Blockers/risks: none recorded in source handoff"]),
		...(requirements.length > 0
			? [
					"- Next safe actions:",
					...requirements.slice(0, 5).map((item) => `  - ${item}`),
				]
			: [`- Next safe actions: implement ${task.id} — ${task.title}`]),
		"- Bootstrap mode: current Pi extension/tools remain authoritative until source/prompt/skill changes land and the agent asks the user to run /reload.",
	];
	return { evidence: evidenceLines.join("\n"), refs };
}

async function taskPlanningBuilds(
	project: WikiProject,
	taskId: string,
): Promise<Array<{ path: string; data: Record<string, unknown> }>> {
	const absDir = resolve(project.root, ".codewiki/builds/planning");
	let names: string[] = [];
	try {
		names = await readdir(absDir);
	} catch {
		return [];
	}
	const builds: Array<{ path: string; data: Record<string, unknown> }> = [];
	for (const name of names.filter((item) => item.endsWith(".json")).sort()) {
		const path = `.codewiki/builds/planning/${name}`;
		const data = await readJsonRef(project, path);
		if (!data) continue;
		const consumes = asRecord(data.consumes);
		const produces = asRecord(data.produces);
		const taskIds = [
			String(data.task_id || ""),
			...stringArray(data.task_ids),
			...stringArray(consumes.roadmap),
			...stringArray(produces.roadmap),
		];
		if (taskIds.includes(taskId)) builds.push({ path, data });
	}
	return builds;
}

async function validationRefsForSource(
	project: WikiProject,
	source: string,
	profile?: string,
): Promise<string[]> {
	const absDir = resolve(project.root, ".codewiki/validation");
	let names: string[] = [];
	try {
		names = await readdir(absDir);
	} catch {
		return [];
	}
	const refs: string[] = [];
	for (const name of names.filter((item) => item.endsWith(".json")).sort()) {
		const path = `.codewiki/validation/${name}`;
		const data = await readJsonRef(project, path);
		if (!data) continue;
		if (String(data?.source || "").trim() !== source) continue;
		if (profile && String(data?.profile || data?.gate || "").trim() !== profile)
			continue;
		refs.push(path);
	}
	return refs;
}

async function readJsonRef(
	project: WikiProject,
	ref: string,
): Promise<Record<string, unknown> | null> {
	try {
		const parsed = JSON.parse(
			await readFile(resolve(project.root, ref), "utf8"),
		);
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function nestedStringRefs(value: unknown, field: string): string[] {
	return recordArray(value).flatMap((item) => stringArray(item[field]));
}

function asRecord(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {};
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
	return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function resumeLensSourceRefs(graph: GraphFile | null): string[] {
	const lenses = graph?.views?.lenses as Record<string, unknown> | undefined;
	const resumeLens = lenses?.resume as Record<string, unknown> | undefined;
	const refs = resumeLens?.source_refs;
	return Array.isArray(refs)
		? refs.map((ref) => String(ref || "").trim()).filter(Boolean)
		: [];
}

function resumeContextSourceRefs(
	project: WikiProject,
	graph: GraphFile | null,
	task: RoadmapTaskRecord,
	taskContext: RoadmapTaskContextPacket | null,
	handoffRefs: string[] = [],
): string[] {
	return unique([
		project.roadmapPath,
		project.statusStatePath,
		project.graphPath.replace(`${project.root}/`, ""),
		taskContext?.context_path ||
			`.codewiki/roadmap/tasks/${task.id}/context.json`,
		...resumeLensSourceRefs(graph),
		...handoffRefs,
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
