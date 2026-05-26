import { resolve } from "node:path";
import { readFile, stat, writeFile } from "node:fs/promises";
import type { ChangeType } from "../domain/change/types.ts";
import type { WikiProject } from "../domain/project/types.ts";
import type {
	RoadmapFile,
	RoadmapSprintRecord,
	RoadmapTaskRecord,
	RoadmapTaskUpdateInput,
	RoadmapStatus,
	RoadmapPriority,
	RoadmapTaskGoal,
	CodewikiTaskPatchInput,
	CodewikiTaskEvidenceInput,
	RoadmapTaskInput,
	TaskLoopUpdateInput,
	CodewikiSprintInput,
} from "../domain/roadmap/types.ts";
import type { RoadmapStateTaskSummary } from "../domain/state/types.ts";
import type { TaskVerifierResult } from "../validation/types.ts";
import { CHANGE_TYPE_VALUES } from "../domain/change/types.ts";
import { ROADMAP_STATUS_VALUES, ROADMAP_PRIORITY_VALUES } from "../domain/roadmap/types.ts";
import { unique, nowIso, formatError } from "../domain/shared/utils.ts";
import { withLockedPaths } from "../mutation-queue.ts";
import { assertExecutableRoadmapTask, assessRoadmapTaskBoundary } from "../domain/roadmap/task-boundary.ts";
import { formatTaskId, parseTaskIdSequence, taskIdCandidates } from "../domain/roadmap/task-id.ts";
import {
	rebuildTargetPaths,
	runRebuildUnlocked,
	roadmapApiTaskState,
	mapToolTaskStatusToRoadmapStatus,
	maybeReadRoadmapState,
	maybeReadTaskContext,
} from "./state-artifacts.ts";

/**
 * Get the path to the roadmap archive file.
 */
export function roadmapArchivePath(project: WikiProject): string {
	const configured = project.config.roadmap_retention?.archive_path;
	return resolve(project.root, configured || `${project.metaRoot}/roadmap-archive.jsonl`);
}

/**
 * Check if a task patch has any actual changes.
 */
export function hasCodewikiTaskPatchChanges(
	patch: CodewikiTaskPatchInput | undefined,
): patch is CodewikiTaskPatchInput {
	return Boolean(
		patch &&
			(patch.title !== undefined ||
				patch.priority !== undefined ||
				patch.kind !== undefined ||
				patch.summary !== undefined ||
				patch.status !== undefined ||
				patch.spec_paths !== undefined ||
				patch.code_paths !== undefined ||
				patch.research_ids !== undefined ||
				patch.labels !== undefined ||
				patch.goal?.outcome !== undefined ||
				patch.goal?.acceptance !== undefined ||
				patch.goal?.non_goals !== undefined ||
				patch.goal?.verification !== undefined ||
				patch.change_type !== undefined ||
				patch.change_class !== undefined ||
				patch.delta?.desired !== undefined ||
				patch.delta?.current !== undefined ||
				patch.delta?.closure !== undefined),
	);
}

/**
 * Build a RoadmapTaskUpdateInput from a CodewikiTaskPatchInput.
 */
export function buildRoadmapTaskUpdateFromCodewikiPatch(
	task: RoadmapTaskRecord,
	runtimeTask: RoadmapStateTaskSummary | null,
	patch: CodewikiTaskPatchInput,
): RoadmapTaskUpdateInput {
	const currentState = roadmapApiTaskState(task, runtimeTask);
	const requestedStatus = patch.status ?? currentState.status;
	return {
		taskId: task.id,
		title: patch.title,
		priority: patch.priority,
		kind: patch.kind,
		summary: patch.summary,
		status: mapToolTaskStatusToRoadmapStatus(requestedStatus),
		spec_paths: patch.spec_paths,
		code_paths: patch.code_paths,
		research_ids: patch.research_ids,
		labels: patch.labels,
		change_type: patch.change_type !== undefined || patch.change_class !== undefined ? normalizeTaskChangeType(patch.change_type ?? patch.change_class, patch.kind ?? task.kind) : undefined,
		goal: patch.goal,
		delta: patch.delta,
	};
}

/**
 * Append evidence to a roadmap task.
 */
export async function appendCodewikiTaskEvidence(
	project: WikiProject,
	task: RoadmapTaskRecord,
	evidence: CodewikiTaskEvidenceInput,
	refresh = true,
): Promise<void> {
	await withLockedPaths(
		[...(refresh ? rebuildTargetPaths(project) : [])],
		async () => {
			await appendTaskEvidenceEvent(project, task, {
				verdict: evidence.result ?? "progress",
				summary: evidence.summary.trim(),
				checks_run: unique(evidence.checks_run ?? []),
				files_touched: unique(evidence.files_touched ?? []),
				issues: unique(evidence.issues ?? []),
			});
			const action = (evidence.result === "pass" || evidence.result === "fail" || evidence.result === "block" || evidence.result === "done_candidate")
				? (evidence.result === "done_candidate" ? "pass" : evidence.result)
				: "pass";
			await updateTaskLoop(project, {
				taskId: task.id,
				action,
				summary: evidence.summary.trim(),
				checks_run: evidence.checks_run,
				files_touched: evidence.files_touched,
				issues: evidence.issues,
			}, { refresh: false });
			if (refresh) await runRebuildUnlocked(project);
		},
	);
}

/**
 * Check if a RoadmapTaskUpdateInput has any fields to update.
 */
export function hasRoadmapTaskUpdateFields(input: RoadmapTaskUpdateInput): boolean {
	return Boolean(
		input.title !== undefined ||
			input.priority !== undefined ||
			input.kind !== undefined ||
			input.summary !== undefined ||
			input.status !== undefined ||
			input.spec_paths !== undefined ||
			input.code_paths !== undefined ||
			input.research_ids !== undefined ||
			input.labels !== undefined ||
			input.goal !== undefined ||
			input.delta !== undefined,
	);
}

export async function appendProjectEvent(project: WikiProject, event: any): Promise<void> {
	void project;
	void event;
}

export async function appendRoadmapEvent(project: WikiProject, event: any): Promise<void> {
	void project;
	void event;
}

export async function appendTaskEvidenceEvent(
	project: WikiProject,
	task: RoadmapTaskRecord,
	evidence: any,
): Promise<void> {
	void project;
	void task;
	void evidence;
}

/**
 * Summarize the result of a codewiki_task tool action.
 */
export function summarizeCodewikiTaskAction(result: {
	action: string;
	changed: boolean;
	canonical_task_ids: string[];
	created?: { id: string; title: string; status: string }[];
	reused?: { id: string; title: string; status: string }[];
	refined?: { id: string; title: string; status: string }[];
	evidence_recorded?: boolean;
}): string {
	const ids = result.canonical_task_ids.join(", ");
	if (result.action === "create") {
		const created = result.created?.length ?? 0;
		const reused = result.reused?.length ?? 0;
		const refined = result.refined?.length ?? 0;
		return `codewiki task: created ${created}, reused ${reused}, refined ${refined} tasks (${ids})`;
	}
	const changed = result.changed ? "updated" : "read";
	const evidence = result.evidence_recorded ? " with evidence" : "";
	return `codewiki task: ${result.action} ${ids} (${changed}${evidence})`;
}

/**
 * Build a prompt for the automatic task verifier.
 */
export type TaskVerifierProfile = "task-close" | "sprint-close" | "roadmap-check" | "drift-check";

export interface TaskVerifierBrief {
	profile: TaskVerifierProfile;
	policy: {
		mode: "read-only";
		parentWritesOnly: true;
		strictJson: true;
	};
	verdict_schema: {
		verdict: ["pass", "fail", "block"];
		taskId: "string";
		checks: "string[]";
		issues: "{severity, summary, evidence?}[]";
		rationale: "string";
	};
	task: Pick<RoadmapTaskRecord, "id" | "title" | "status" | "summary" | "goal" | "spec_paths" | "code_paths">;
	context: any;
	preflight: TaskVerifierResult;
	verifier_rubric?: string;
}

function taskVerifierBlock(taskId: string, rationale: string, checks: string[], issueSummary: string): TaskVerifierResult {
	return {
		verdict: "block",
		taskId,
		checks,
		issues: [{ severity: "medium", summary: issueSummary }],
		rationale,
	};
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

export async function runTaskClosePreflight(project: WikiProject, task: RoadmapTaskRecord, closeEvidence?: any): Promise<TaskVerifierResult> {
	const checks = ["task-close deterministic preflight"];
	const issues: TaskVerifierResult["issues"] = [];
	const boundary = assessRoadmapTaskBoundary(task);
	if (!boundary.executable) {
		issues.push({ severity: "high", summary: `Task is not self-contained executable work: ${boundary.reasons.join("; ")}` });
	}
	if (!task.goal?.outcome) issues.push({ severity: "high", summary: "Task goal.outcome missing" });
	if (!task.goal?.acceptance?.length) issues.push({ severity: "high", summary: "Task goal.acceptance missing" });
	if (!task.goal?.verification?.length) issues.push({ severity: "medium", summary: "Task goal.verification missing" });
	for (const path of [...(task.spec_paths ?? []), ...(task.code_paths ?? [])]) {
		if (!(await pathExists(resolve(project.root, path)))) {
			issues.push({ severity: "high", summary: `Linked path missing: ${path}` });
		}
	}

	const evidence = closeEvidence ?? (task as any).loop?.evidence;
	if (!evidence) {
		issues.push({ severity: "high", summary: "No task evidence recorded for closure" });
	} else if (!Array.isArray(evidence.checks_run) || evidence.checks_run.length === 0) {
		issues.push({ severity: "high", summary: "No task evidence checks_run recorded for closure" });
	}

	return {
		verdict: issues.some((issue) => issue.severity === "high") ? "fail" : issues.length ? "block" : "pass",
		taskId: task.id,
		checks,
		issues,
		rationale: issues.length ? "Deterministic preflight found closure blockers." : "Deterministic preflight passed.",
	};
}

async function maybeReadVerifierContextPack(project: WikiProject, taskId: string): Promise<any | null> {
	const path = resolve(project.root, project.viewsRoot, "context", "tasks", taskId, "validation.json");
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch {
		return null;
	}
}

function compactText(value: unknown, maxLength = 600): string {
	const text = String(value ?? "");
	return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function compactVerifierContext(context: any): any {
	if (!context || typeof context !== "object") return context;
	return {
		version: context.version,
		role: context.role,
		task: context.task ? {
			id: context.task.id,
			title: context.task.title,
			status: context.task.status,
			priority: context.task.priority,
			kind: context.task.kind,
			summary: context.task.summary,
			goal: context.task.goal,
			delta: context.task.delta,
		} : undefined,
		acceptance_matrix: Array.isArray(context.acceptance_matrix) ? context.acceptance_matrix.map((item: any) => ({
			id: item?.id,
			criterion: item?.criterion,
			status: item?.status,
			checks: Array.isArray(item?.checks) ? item.checks.slice(0, 6) : [],
		})) : [],
		non_goals: Array.isArray(context.non_goals) ? context.non_goals : [],
		required_checks: Array.isArray(context.required_checks) ? context.required_checks : [],
		recent_evidence: Array.isArray(context.recent_evidence) ? context.recent_evidence.slice(-8).map((event: any) => ({
			ts: event?.ts,
			kind: event?.kind,
			verdict: event?.verdict,
			taskId: event?.taskId,
			summary: compactText(event?.summary, 700),
			checks_run: Array.isArray(event?.checks_run) ? event.checks_run.slice(0, 10).map((check: any) => compactText(check, 160)) : [],
			files_touched: Array.isArray(event?.files_touched) ? event.files_touched.slice(0, 12) : [],
			issues: Array.isArray(event?.issues) ? event.issues.slice(0, 5).map((issue: any) => compactText(issue, 240)) : [],
		})) : [],
		context_routes: context.context_routes,
		recommended_next_reads: Array.isArray(context.recommended_next_reads) ? context.recommended_next_reads.slice(0, 16) : [],
		observability: context.observability,
		verdict_policy: context.verdict_policy,
		budget: context.budget,
	};
}

export async function buildTaskVerifierBrief(
	project: WikiProject,
	task: RoadmapTaskRecord,
	context: any,
	profile: TaskVerifierProfile = "task-close",
	closeEvidence?: any,
): Promise<TaskVerifierBrief> {
	const preflight = await runTaskClosePreflight(project, task, closeEvidence);
	const verifierRubric = await readFile(resolve(project.root, "skills", "codewiki", "loops", "validation.md"), "utf8")
		.then((text) => compactText(text, 5000))
		.catch(() => undefined);
	return {
		profile,
		policy: { mode: "read-only", parentWritesOnly: true, strictJson: true },
		verdict_schema: {
			verdict: ["pass", "fail", "block"],
			taskId: "string",
			checks: "string[]",
			issues: "{severity, summary, evidence?}[]",
			rationale: "string",
		},
		task: {
			id: task.id,
			title: task.title,
			status: task.status,
			summary: task.summary,
			goal: task.goal,
			spec_paths: task.spec_paths,
			code_paths: task.code_paths,
		},
		context: compactVerifierContext(context),
		preflight,
		verifier_rubric: verifierRubric,
	};
}

export function buildTaskVerifierPrompt(brief: TaskVerifierBrief): string {
	return [
		"You are the fresh read-only CodeWiki verifier.",
		"Return only strict JSON matching verdict_schema. No markdown, comments, or surrounding diagnostics.",
		"Do not write files or mutate canonical truth; parent process owns evidence and lifecycle writes.",
		"Judge task acceptance against brief, linked context routes, checks, and evidence.",
		brief.verifier_rubric ? `Verifier rubric:\n${brief.verifier_rubric}` : "Verifier rubric: use the CodeWiki validation gateway rubric from the active task brief.",
		`Brief: ${JSON.stringify(brief)}`,
	].join("\n");
}

function isPlainVerifierObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function extractVerifierJson(text: string, taskId = ""): TaskVerifierResult {
	let parsed: any;
	const trimmed = text.trim();
	if (!trimmed || !trimmed.startsWith("{") || !trimmed.endsWith("}")) {
		return taskVerifierBlock(taskId, "Failed to parse verifier output", ["strict verifier JSON parse"], "Malformed verifier JSON output");
	}
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return taskVerifierBlock(taskId, "Failed to parse verifier output", ["strict verifier JSON parse"], "Malformed verifier JSON output");
	}
	if (!isPlainVerifierObject(parsed)) {
		return taskVerifierBlock(taskId, "Verifier output failed schema validation", ["strict verifier JSON schema"], "Verifier output must be a JSON object");
	}
	const allowedKeys = ["verdict", "taskId", "checks", "issues", "rationale"];
	const extraKeys = Object.keys(parsed).filter((key) => !allowedKeys.includes(key));
	if (extraKeys.length) {
		return taskVerifierBlock(taskId, "Verifier output failed schema validation", ["strict verifier JSON schema"], `Verifier output contained extra fields: ${extraKeys.join(", ")}`);
	}
	const verdict = parsed.verdict;
	if (typeof verdict !== "string" || !["pass", "fail", "block"].includes(verdict)) {
		return taskVerifierBlock(taskId, "Verifier output failed schema validation", ["strict verifier JSON schema"], "Invalid or missing verifier verdict");
	}
	if (parsed?.taskId !== taskId) {
		return taskVerifierBlock(taskId, "Verifier output task id mismatch", ["strict verifier JSON schema"], "Verifier taskId did not match requested task");
	}
	if (!Array.isArray(parsed.checks) || !parsed.checks.every((check: unknown) => typeof check === "string")) {
		return taskVerifierBlock(taskId, "Verifier output failed schema validation", ["strict verifier JSON schema"], "Verifier checks must be a string array");
	}
	const allowedIssueKeys = ["severity", "summary", "evidence"];
	if (!Array.isArray(parsed.issues) || !parsed.issues.every((issue: unknown) => {
		return isPlainVerifierObject(issue)
			&& Object.keys(issue).every((key) => allowedIssueKeys.includes(key))
			&& ["high", "medium", "low"].includes(String(issue.severity))
			&& typeof issue.summary === "string"
			&& (issue.evidence === undefined || typeof issue.evidence === "string");
	})) {
		return taskVerifierBlock(taskId, "Verifier output failed schema validation", ["strict verifier JSON schema"], "Verifier issues must contain severity and summary strings");
	}
	if (typeof parsed.rationale !== "string" || !parsed.rationale.trim()) {
		return taskVerifierBlock(taskId, "Verifier output failed schema validation", ["strict verifier JSON schema"], "Verifier rationale must be a non-empty string");
	}
	return {
		verdict: verdict as "pass" | "fail" | "block",
		taskId,
		checks: parsed.checks,
		issues: parsed.issues,
		rationale: parsed.rationale,
	};
}

/**
 * Run the automatic task verifier if enabled.
 */
export type SemanticTaskVerifierRunner = (prompt: string, brief: TaskVerifierBrief) => Promise<string>;

export async function maybeRunAutomaticTaskVerifier(
	project: WikiProject,
	task: RoadmapTaskRecord,
	runSemanticVerifier?: SemanticTaskVerifierRunner,
	closeEvidence?: any,
): Promise<TaskVerifierResult | null> {
	if (process.env.PI_CODEWIKI_SKIP_VERIFIER === "1") return null;
	if (process.env.PI_CODEWIKI_VERIFIER_MODE === "off") return null;
	
	const state = await maybeReadRoadmapState(project.roadmapStatePath);
	const runtimeTask = state?.tasks?.[task.id] ?? null;
	const contextPacket = (await maybeReadVerifierContextPack(project, task.id)) ?? await maybeReadTaskContext(
		project,
		task.id,
		runtimeTask,
	);
	const brief = await buildTaskVerifierBrief(project, task, contextPacket, "task-close", closeEvidence);
	if (brief.preflight.verdict !== "pass") return brief.preflight;
	if (!runSemanticVerifier) {
		return {
			verdict: "block",
			taskId: task.id,
			checks: ["semantic verifier adapter"],
			issues: [{ severity: "medium", summary: "Semantic verifier adapter is not configured" }],
			rationale: "No semantic verifier runner was provided by the runtime adapter.",
		};
	}
	const prompt = buildTaskVerifierPrompt(brief);
	try {
		const text = await runSemanticVerifier(prompt, brief);
		return extractVerifierJson(text, task.id);
	} catch (error) {
		return {
			verdict: "block",
			taskId: task.id,
			checks: ["semantic verifier adapter"],
			issues: [
				{
					severity: "medium",
					summary: `Semantic verifier could not complete: ${formatError(error)}`,
				},
			],
			rationale: `Verifier adapter error: ${formatError(error)}`,
		};
	}
}

type RoadmapTaskReuseMatch = {
	task: RoadmapTaskRecord;
	score: number;
	reasons: string[];
};

const ACTIVE_REUSE_STATUSES = new Set<RoadmapStatus>([
	"todo",
	"in_progress",
	"blocked",
]);

const PRIORITY_RANK: Record<RoadmapPriority, number> = {
	low: 1,
	medium: 2,
	high: 3,
	critical: 4,
};

const TASK_REUSE_STOPWORDS = new Set([
	"a", "an", "and", "are", "as", "be", "by", "can", "for", "from", "has", "have", "in", "into", "is", "it", "its", "new", "of", "on", "or", "our", "should", "so", "that", "the", "their", "this", "to", "use", "user", "users", "we", "when", "with",
]);

function findRelatedRoadmapTask(roadmap: RoadmapFile, input: RoadmapTaskInput): RoadmapTaskReuseMatch | null {
	const matches = Object.values(roadmap.tasks)
		.filter((task) => ACTIVE_REUSE_STATUSES.has(task.status))
		.map((task) => scoreRoadmapTaskReuse(task, input))
		.filter(isReusableRoadmapTaskMatch)
		.sort((a, b) => b.score - a.score || a.task.id.localeCompare(b.task.id));
	return matches[0] ?? null;
}

function isReusableRoadmapTaskMatch(match: RoadmapTaskReuseMatch): boolean {
	if (match.score < 10) return false;
	const hasLabel = match.reasons.some((reason) => reason.startsWith("labels:"));
	const hasIntent = match.reasons.includes("title") || match.reasons.some((reason) => reason.startsWith("intent:"));
	const hasPath = match.reasons.some((reason) => reason.startsWith("spec_paths:") || reason.startsWith("code_paths:") || reason.startsWith("research_ids:"));
	return hasLabel || hasIntent || (hasPath && match.score >= 18);
}

function scoreRoadmapTaskReuse(task: RoadmapTaskRecord, input: RoadmapTaskInput): RoadmapTaskReuseMatch {
	let score = 0;
	const reasons: string[] = [];
	const specOverlap = overlapCount(task.spec_paths, input.spec_paths ?? []);
	if (specOverlap > 0) {
		score += 10 + specOverlap * 2;
		reasons.push(`spec_paths:${specOverlap}`);
	}
	const codeOverlap = overlapCount(task.code_paths, input.code_paths ?? []);
	if (codeOverlap > 0) {
		score += 8 + codeOverlap * 2;
		reasons.push(`code_paths:${codeOverlap}`);
	}
	const labelOverlap = overlapCount(task.labels, input.labels ?? []);
	if (labelOverlap > 0) {
		score += 6 + labelOverlap;
		reasons.push(`labels:${labelOverlap}`);
	}
	const researchOverlap = overlapCount(task.research_ids, input.research_ids ?? []);
	if (researchOverlap > 0) {
		score += 4 + researchOverlap;
		reasons.push(`research_ids:${researchOverlap}`);
	}
	if (input.kind && task.kind === input.kind) score += 1;
	const titleRelated = relatedText(task.title, input.title);
	if (titleRelated) {
		score += 8;
		reasons.push("title");
	}
	const textScore = tokenJaccard(taskIntentText(task), inputIntentText(input));
	if (textScore >= 0.35) {
		score += 8;
		reasons.push(`intent:${textScore.toFixed(2)}`);
	} else if (textScore >= 0.25) {
		score += 5;
		reasons.push(`intent:${textScore.toFixed(2)}`);
	} else if (textScore >= 0.18) {
		score += 3;
		reasons.push(`intent:${textScore.toFixed(2)}`);
	}
	return { task, score, reasons };
}

function refineRoadmapTaskFromInput(task: RoadmapTaskRecord, input: RoadmapTaskInput, reasons: string[]): boolean {
	let changed = false;
	const mergeArray = (current: string[], incoming: string[] | undefined): string[] => {
		const next = unique([...current, ...(incoming ?? [])]);
		if (next.join("\0") !== current.join("\0")) changed = true;
		return next;
	};

	if (!task.summary.trim() && input.summary?.trim()) {
		task.summary = input.summary.trim();
		changed = true;
	}
	if (task.kind === "task" && input.kind && input.kind !== task.kind) {
		task.kind = input.kind;
		changed = true;
	}
	if (input.priority && PRIORITY_RANK[input.priority] > PRIORITY_RANK[task.priority]) {
		task.priority = input.priority;
		changed = true;
	}

	task.spec_paths = mergeArray(task.spec_paths, input.spec_paths);
	task.code_paths = mergeArray(task.code_paths, input.code_paths);
	task.research_ids = mergeArray(task.research_ids, input.research_ids);
	task.labels = mergeArray(task.labels, input.labels);

	if (input.goal?.outcome?.trim()) {
		const outcome = input.goal.outcome.trim();
		if (!task.goal.outcome.trim()) {
			task.goal.outcome = outcome;
			changed = true;
		} else if (!includesText(task.goal.outcome, outcome)) {
			task.delta.desired = appendRefinementText(task.delta.desired, `Additional outcome: ${outcome}`);
			changed = true;
		}
	}
	if (input.goal?.acceptance) task.goal.acceptance = mergeArray(task.goal.acceptance, input.goal.acceptance);
	if (input.goal?.non_goals) task.goal.non_goals = mergeArray(task.goal.non_goals, input.goal.non_goals);
	if (input.goal?.verification) task.goal.verification = mergeArray(task.goal.verification, input.goal.verification);

	if (input.delta?.desired?.trim()) {
		const next = appendRefinementText(task.delta.desired, input.delta.desired.trim());
		if (next !== task.delta.desired) { task.delta.desired = next; changed = true; }
	}
	if (input.delta?.current?.trim()) {
		const next = appendRefinementText(task.delta.current, input.delta.current.trim());
		if (next !== task.delta.current) { task.delta.current = next; changed = true; }
	}
	if (input.delta?.closure?.trim()) {
		const next = appendRefinementText(task.delta.closure, input.delta.closure.trim());
		if (next !== task.delta.closure) { task.delta.closure = next; changed = true; }
	}

	if (changed) task.updated = todayIso();
	void reasons;
	return changed;
}

function overlapCount(a: string[], b: string[]): number {
	const left = new Set(a.map(normalizeMatchText).filter(Boolean));
	return b.map(normalizeMatchText).filter((item) => left.has(item)).length;
}

function relatedText(a: string, b: string): boolean {
	const left = normalizeMatchText(a);
	const right = normalizeMatchText(b);
	if (!left || !right) return false;
	return left === right || (left.length > 10 && right.includes(left)) || (right.length > 10 && left.includes(right));
}

function tokenJaccard(a: string, b: string): number {
	const left = new Set(tokenizeIntent(a));
	const right = new Set(tokenizeIntent(b));
	if (left.size === 0 || right.size === 0) return 0;
	let intersection = 0;
	for (const token of left) if (right.has(token)) intersection++;
	return intersection / (left.size + right.size - intersection);
}

function tokenizeIntent(value: string): string[] {
	return normalizeMatchText(value)
		.split(" ")
		.filter((token) => token.length >= 3 && !TASK_REUSE_STOPWORDS.has(token));
}

function taskIntentText(task: RoadmapTaskRecord): string {
	return [
		task.title,
		task.summary,
		task.kind,
		...task.labels,
		task.goal.outcome,
		...task.goal.acceptance,
		task.delta.desired,
		task.delta.current,
	].join(" ");
}

function inputIntentText(input: RoadmapTaskInput): string {
	return [
		input.title,
		input.summary ?? "",
		input.kind ?? "",
		...(input.labels ?? []),
		input.goal?.outcome ?? "",
		...(input.goal?.acceptance ?? []),
		input.delta?.desired ?? "",
		input.delta?.current ?? "",
	].join(" ");
}

function appendRefinementText(current: string, incoming: string): string {
	if (!incoming.trim()) return current;
	if (!current.trim()) return incoming.trim();
	if (includesText(current, incoming)) return current;
	return `${current.trim()}\nRefinement: ${incoming.trim()}`;
}

function includesText(current: string, incoming: string): boolean {
	return normalizeMatchText(current).includes(normalizeMatchText(incoming));
}

function normalizeMatchText(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9./_-]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Append tasks to the roadmap.
 */
export async function appendRoadmapTasks(
	_pi: unknown,
	project: WikiProject,
	_ctx: unknown,
	inputs: RoadmapTaskInput[],
	options: { refresh?: boolean } = {},
): Promise<{ created: RoadmapTaskRecord[]; reused: RoadmapTaskRecord[]; refined: RoadmapTaskRecord[] }> {
	const roadmapPath = resolve(project.root, project.roadmapPath);
	const results: { created: RoadmapTaskRecord[]; reused: RoadmapTaskRecord[]; refined: RoadmapTaskRecord[] } =
		{ created: [], reused: [], refined: [] };

	await withLockedPaths(
		roadmapMutationTargetPaths(project, options),
		async () => {
			const roadmap = await readRoadmapFile(roadmapPath);

			for (const input of inputs) {
				const existing = resolveRoadmapTask(roadmap, input.id ?? "");
				if (existing) {
					const refined = refineRoadmapTaskFromInput(existing, input, ["explicit_id"]);
					assertExecutableRoadmapTask(existing, "roadmap task reuse");
					results.reused.push(existing);
					if (refined) results.refined.push(existing);
					if (refined) {
						await appendProjectEvent(project, {
							ts: nowIso(),
							kind: "roadmap_task_refined",
							taskId: existing.id,
							title: existing.title,
							reasons: ["explicit_id"],
						});
						await appendRoadmapEvent(project, {
							ts: nowIso(),
							action: "refine",
							taskId: existing.id,
							title: existing.title,
						});
					}
					continue;
				}

				const related = findRelatedRoadmapTask(roadmap, input);
				if (related) {
					const refined = refineRoadmapTaskFromInput(related.task, input, related.reasons);
					assertExecutableRoadmapTask(related.task, "roadmap task reuse");
					results.reused.push(related.task);
					if (refined) results.refined.push(related.task);
					if (refined) {
						await appendProjectEvent(project, {
							ts: nowIso(),
							kind: "roadmap_task_refined",
							taskId: related.task.id,
							title: related.task.title,
							reasons: related.reasons,
						});
						await appendRoadmapEvent(project, {
							ts: nowIso(),
							action: "refine",
							taskId: related.task.id,
							title: related.task.title,
							reasons: related.reasons,
						});
					}
					continue;
				}

				const id = input.id ?? formatTaskId(await nextTaskIdSequenceForProject(project, roadmap));
				const task: RoadmapTaskRecord = {
					id,
					title: input.title,
					status: input.status ?? "todo",
					priority: input.priority ?? "medium",
					kind: input.kind ?? "task",
					summary: input.summary ?? "",
					spec_paths: unique(input.spec_paths ?? []),
					code_paths: unique(input.code_paths ?? []),
					research_ids: unique(input.research_ids ?? []),
					labels: unique(input.labels ?? []),
					change_type: normalizeTaskChangeType(input.change_type ?? input.change_class, input.kind),
					goal: normalizeRoadmapTaskGoal(input.goal, input.summary ?? ""),
					delta: {
						desired: input.delta?.desired ?? "",
						current: input.delta?.current ?? "",
						closure: input.delta?.closure ?? "",
					},
					created: todayIso(),
					updated: todayIso(),
				};

				assertExecutableRoadmapTask(task, "roadmap task creation");
				roadmap.tasks[id] = task;
				roadmap.order.push(id);
				results.created.push(task);

				await appendProjectEvent(project, {
					ts: nowIso(),
					kind: "roadmap_task_created",
					taskId: task.id,
					title: task.title,
				});
				await appendRoadmapEvent(project, {
					ts: nowIso(),
					action: "append",
					taskId: task.id,
					title: task.title,
				});
			}

			roadmap.updated = nowIso();
			await writeRoadmapFile(roadmapPath, roadmap);
			if (options.refresh ?? true) await runRebuildUnlocked(project);
		},
	);

	return results;
}

/**
 * Update a roadmap task.
 */
export async function updateRoadmapTask(
	project: WikiProject,
	update: RoadmapTaskUpdateInput,
	options: { refresh?: boolean } = {},
): Promise<{ task: RoadmapTaskRecord; changed: boolean }> {
	const roadmapPath = resolve(project.root, project.roadmapPath);
	let task: RoadmapTaskRecord | null = null;
	let changed = false;

	await withLockedPaths(
		roadmapMutationTargetPaths(project, options),
		async () => {
			const roadmap = await readRoadmapFile(roadmapPath);
			task = resolveRoadmapTask(roadmap, update.taskId);
			if (!task) throw new Error(`Task not found: ${update.taskId}`);

			if (update.title !== undefined && update.title !== task.title) {
				task.title = update.title;
				changed = true;
			}
			if (update.status !== undefined && update.status !== task.status) {
				task.status = update.status;
				changed = true;
			}
			if (update.priority !== undefined && update.priority !== task.priority) {
				task.priority = update.priority;
				changed = true;
			}
			if (update.kind !== undefined && update.kind !== task.kind) {
				task.kind = update.kind;
				changed = true;
			}
			if (update.summary !== undefined && update.summary !== task.summary) {
				task.summary = update.summary;
				changed = true;
			}
			if (update.spec_paths !== undefined) {
				const next = unique(update.spec_paths);
				if (next.join(",") !== task.spec_paths.join(",")) {
					task.spec_paths = next;
					changed = true;
				}
			}
			if (update.code_paths !== undefined) {
				const next = unique(update.code_paths);
				if (next.join(",") !== task.code_paths.join(",")) {
					task.code_paths = next;
					changed = true;
				}
			}
			if (update.research_ids !== undefined) {
				const next = unique(update.research_ids);
				if (next.join(",") !== task.research_ids.join(",")) {
					task.research_ids = next;
					changed = true;
				}
			}
			if (update.labels !== undefined) {
				const next = unique(update.labels);
				if (next.join(",") !== task.labels.join(",")) {
					task.labels = next;
					changed = true;
				}
			}
			if (update.change_type !== undefined || update.change_class !== undefined) {
				const next = normalizeTaskChangeType(update.change_type ?? update.change_class, task.kind);
				if (next !== task.change_type) {
					task.change_type = next;
					delete task.change_class;
					changed = true;
				}
			}
			if (update.goal) {
				const next = normalizeRoadmapTaskGoal(
					{
						outcome: task.goal.outcome,
						acceptance: task.goal.acceptance,
						non_goals: task.goal.non_goals,
						verification: task.goal.verification,
						...update.goal,
					},
					task.summary,
				);
				if (JSON.stringify(next) !== JSON.stringify(task.goal)) {
					task.goal = next;
					changed = true;
				}
			}
			if (update.delta) {
				if (update.delta.desired !== undefined)
					task.delta.desired = update.delta.desired;
				if (update.delta.current !== undefined)
					task.delta.current = update.delta.current;
				if (update.delta.closure !== undefined)
					task.delta.closure = update.delta.closure;
				changed = true;
			}

			if (changed) {
				assertExecutableRoadmapTask(task, "roadmap task update");
				task.updated = nowIso();
				roadmap.updated = nowIso();
				await writeRoadmapFile(roadmapPath, roadmap);

				await appendProjectEvent(project, {
					ts: nowIso(),
					kind: "roadmap_task_updated",
					taskId: task.id,
					title: task.title,
				});
				await appendRoadmapEvent(project, {
					ts: nowIso(),
					action: "update",
					taskId: task.id,
					title: task.title,
				});

				if (options.refresh ?? true) await runRebuildUnlocked(project);
			}
		},
	);

	if (!task) throw new Error("Unexpected state: task is null after update");
	return { task, changed };
}

/**
 * Update the task loop state.
 */
export async function updateTaskLoop(
	project: WikiProject,
	input: TaskLoopUpdateInput & { repoPath?: string },
	options: { refresh?: boolean } = {},
): Promise<{
	taskId: string;
	title: string;
	action: "pass" | "fail" | "block";
	roadmapStatus: RoadmapStatus;
}> {
	const task = await readRoadmapTask(project, input.taskId);
	if (!task) throw new Error(`Roadmap task not found: ${input.taskId}`);

	return withLockedPaths(
		roadmapMutationTargetPaths(project, options),
		async () => {
			const action = input.action;
			const kind =
				action === "pass"
					? "task_status_passed"
					: action === "fail"
						? "task_status_failed"
						: "task_status_blocked";

			const roadmapPath = resolve(project.root, project.roadmapPath);
			const roadmap = await readRoadmapFile(roadmapPath);
			const existing = resolveRoadmapTask(roadmap, task.id);
			if (!existing) throw new Error(`Roadmap task not found: ${task.id}`);
			const nextStatus: RoadmapStatus =
				action === "block" ? "blocked" : "in_progress";

			existing.status = nextStatus;
			assertExecutableRoadmapTask(existing, "task evidence update");
			existing.updated = nowIso();
			roadmap.updated = nowIso();
			await writeRoadmapFile(roadmapPath, roadmap);

			const evidence = {
				taskId: existing.id,
				title: existing.title,
				summary: input.summary,
				checks_run: unique(input.checks_run ?? []),
				files_touched: unique(input.files_touched ?? []),
				issues: unique(input.issues ?? []),
			};
			await appendProjectEvent(project, {
				ts: nowIso(),
				kind,
				...evidence,
			});
			await appendProjectEvent(project, {
				ts: nowIso(),
				kind: "task_evidence_recorded",
				verdict: action,
				...evidence,
			});

			if (options.refresh ?? true) await runRebuildUnlocked(project);

			return {
				taskId: existing.id,
				title: existing.title,
				action,
				roadmapStatus: nextStatus,
			};
		},
	);
}

/**
 * Get target paths for roadmap mutations.
 */
export function roadmapMutationTargetPaths(
	project: WikiProject,
	options: { refresh?: boolean },
): string[] {
	return [
		resolve(project.root, project.roadmapPath),
		...((options.refresh ?? true) ? rebuildTargetPaths(project) : []),
	];
}

/**
 * Get the next task ID sequence number.
 */
export function nextTaskIdSequence(roadmap: RoadmapFile, extraTaskIds: string[] = []): number {
	const sequences = [...Object.keys(roadmap.tasks), ...extraTaskIds]
		.map(parseTaskIdSequence)
		.filter((s): s is number => s !== null);
	return sequences.length > 0 ? Math.max(...sequences) + 1 : 1;
}

async function nextTaskIdSequenceForProject(project: WikiProject, roadmap: RoadmapFile): Promise<number> {
	return nextTaskIdSequence(roadmap, await archivedTaskIds(project));
}

function parseSprintIdSequence(value: string): number | null {
	const match = String(value || "").match(/^SPRINT-(\d+)$/);
	return match ? Number(match[1]) : null;
}

function nextSprintId(roadmap: RoadmapFile): string {
	const max = Math.max(0, ...Object.keys(roadmap.sprints || {})
		.map(parseSprintIdSequence)
		.filter((value): value is number => value !== null));
	return `SPRINT-${String(max + 1).padStart(3, "0")}`;
}

function sameStringArray(a: string[] | undefined, b: string[] | undefined): boolean {
	return JSON.stringify(unique(a || [])) === JSON.stringify(unique(b || []));
}

export async function upsertRoadmapSprint(
	project: WikiProject,
	input: CodewikiSprintInput,
	options: { refresh?: boolean } = {},
): Promise<{ sprint: RoadmapSprintRecord; changed: boolean; created: boolean }> {
	const title = input.title.trim();
	const outcome = input.outcome.trim();
	if (!title) throw new Error("codewiki_task sprint requires sprint.title.");
	if (!outcome) throw new Error("codewiki_task sprint requires sprint.outcome.");
	const roadmapPath = resolve(project.root, project.roadmapPath);
	let sprint!: RoadmapSprintRecord;
	let changed = false;
	let created = false;
	await withLockedPaths(roadmapMutationTargetPaths(project, options), async () => {
		const roadmap = await readRoadmapFile(roadmapPath);
		roadmap.sprints = roadmap.sprints || {};
		const requestedId = input.id?.trim();
		const id = requestedId || nextSprintId(roadmap);
		if (requestedId && !/^SPRINT-\d+$/.test(requestedId)) {
			throw new Error(`Invalid sprint id: ${requestedId}. Expected SPRINT-###.`);
		}
		const missingTaskIds = unique(input.task_ids || []).filter((taskId) => !resolveRoadmapTask(roadmap, taskId));
		if (missingTaskIds.length) throw new Error(`Sprint references unknown task(s): ${missingTaskIds.join(", ")}`);
		const existing = roadmap.sprints[id];
		const next: RoadmapSprintRecord = existing
			? { ...existing }
			: {
				id,
				title,
				status: input.status || "active",
				outcome,
				task_ids: [],
				created: nowIso(),
				updated: nowIso(),
			};
		created = !existing;
		if (next.title !== title) {
			next.title = title;
			changed = true;
		}
		const status = normalizeSprintStatus(input.status || next.status);
		if (next.status !== status) {
			next.status = status;
			changed = true;
		}
		if (next.outcome !== outcome) {
			next.outcome = outcome;
			changed = true;
		}
		const taskIds = unique(input.task_ids || next.task_ids || []);
		if (!sameStringArray(next.task_ids, taskIds)) {
			next.task_ids = taskIds;
			changed = true;
		}
		const scope = input.scope || next.scope || {};
		const normalizedScope = {
			knowledge: unique(scope.knowledge || []),
			code: unique(scope.code || []),
		};
		if (!sameStringArray(next.scope?.knowledge, normalizedScope.knowledge) || !sameStringArray(next.scope?.code, normalizedScope.code)) {
			next.scope = normalizedScope;
			changed = true;
		}
		if (input.budget !== undefined && JSON.stringify(next.budget || {}) !== JSON.stringify(input.budget || {})) {
			next.budget = input.budget;
			changed = true;
		}
		const gates = unique(input.gates || next.gates || []);
		if (!sameStringArray(next.gates, gates)) {
			next.gates = gates;
			changed = true;
		}
		if (created) changed = true;
		if (changed) {
			next.updated = nowIso();
			roadmap.sprints[id] = next;
			roadmap.updated = nowIso();
			await writeRoadmapFile(roadmapPath, roadmap);
			await appendProjectEvent(project, {
				ts: nowIso(),
				kind: created ? "roadmap_sprint_created" : "roadmap_sprint_updated",
				sprintId: id,
				title: next.title,
			});
			await appendRoadmapEvent(project, {
				ts: nowIso(),
				action: created ? "sprint-create" : "sprint-update",
				sprintId: id,
				title: next.title,
			});
		}
		sprint = next;
	});
	if ((options.refresh ?? true) && changed) await runRebuildUnlocked(project);
	return { sprint, changed, created };
}

async function archivedTaskIds(project: WikiProject): Promise<string[]> {
	const configured = project.config.roadmap_retention?.archive_path || `${project.metaRoot}/roadmap/archive.jsonl`;
	const archivePath = resolve(project.root, configured);
	try {
		const raw = await readFile(archivePath, "utf8");
		return raw
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				try { return String(JSON.parse(line)?.id || "").trim(); }
				catch { return ""; }
			})
			.filter(Boolean);
	} catch (error: any) {
		if (error?.code === "ENOENT") return [];
		throw error;
	}
}

/**
 * Write a roadmap file.
 */
export async function writeRoadmapFile(
	path: string,
	roadmap: RoadmapFile,
): Promise<void> {
	await writeFile(path, JSON.stringify(roadmap, null, 2), "utf8");
}


export type RoadmapTaskStage = "todo" | "implement" | "done";

/**
 * Get the stage of a task on the roadmap board.
 */
export function roadmapTaskStage(
	status: RoadmapStatus | string | null | undefined,
): RoadmapTaskStage {
	const normalizedStatus = status?.trim();
	if (normalizedStatus === "todo") return "todo";
	if (normalizedStatus === "done") return "done";
	return "implement";
}

/**
 * Get the board column for a task.
 */
export function taskBoardColumn(
	task: RoadmapStateTaskSummary,
): RoadmapTaskStage {
	return roadmapTaskStage(task.status);
}

/**
 * Check if a task is blocked.
 */
export function isTaskBlocked(
	task: RoadmapStateTaskSummary | null | undefined,
): boolean {
	return (
		task?.status === "blocked" || task?.loop?.evidence?.verdict === "blocked"
	);
}

/**
 * Get a one-line summary of the task loop evidence.
 */
export function taskLoopEvidenceLine(
	task: RoadmapStateTaskSummary | null | undefined,
): string {
	const evidence = task?.loop?.evidence;
	if (!evidence) return "No closure evidence recorded yet.";
	const parts = [evidence.summary || evidence.verdict].filter(Boolean);
	if (evidence.checks_run && evidence.checks_run.length > 0)
		parts.push(`${evidence.checks_run.length} check(s)`);
	if (evidence.issues && evidence.issues.length > 0)
		parts.push(`${evidence.issues.length} issue(s)`);
	return parts.join(" · ") || "Evidence recorded.";
}

/**
 * Check if a roadmap status is closed (done or cancelled).
 */
export function isClosedRoadmapStatus(status: RoadmapStatus): boolean {
	return status === "done" || status === "cancelled";
}

/**
 * Check if a roadmap status is part of the active work loop.
 */
export function isActiveLoopRoadmapStatus(status: RoadmapStatus): boolean {
	return ["in_progress", "blocked"].includes(status);
}

/**
 * Resolve a roadmap task record from a roadmap file using ID candidates.
 */
export function resolveRoadmapTask(
	roadmap: RoadmapFile,
	requestedId: string,
): RoadmapTaskRecord | null {
	for (const candidate of taskIdCandidates(requestedId)) {
		const task = roadmap.tasks[candidate];
		if (task) return task;
	}
	return null;
}

/**
 * Read a roadmap task from a project.
 */
export async function readRoadmapTask(
	project: WikiProject,
	taskId: string,
): Promise<RoadmapTaskRecord | null> {
	const roadmap = await readRoadmapFile(
		resolve(project.root, project.roadmapPath),
	);
	return resolveRoadmapTask(roadmap, taskId);
}

/**
 * Get the ISO date for today (YYYY-MM-DD).
 */
export function todayIso(): string {
	return nowIso().split("T")[0];
}

/**
 * Normalize a roadmap task goal.
 */
export function normalizeRoadmapTaskGoal(
	goal: any,
	_summary: string,
): RoadmapTaskGoal {
	const g = (goal ?? {}) as Partial<RoadmapTaskGoal>;
	const verification = Array.isArray(g.verification) ? g.verification : [];
	return {
		outcome: typeof g.outcome === "string" ? g.outcome : "",
		acceptance: Array.isArray(g.acceptance) ? g.acceptance : [],
		non_goals: Array.isArray(g.non_goals) ? g.non_goals : [],
		verification:
			verification.length > 0
				? verification
				: ["Review task outcome and acceptance criteria."],
	};
}

function normalizeTaskChangeType(value: unknown, fallbackKind?: unknown): ChangeType {
	const normalized = String(value || "").trim().toLowerCase();
	if ((CHANGE_TYPE_VALUES as readonly string[]).includes(normalized)) return normalized as ChangeType;
	if (normalized === "code-bugfix" || normalized === "maintenance") return "code";
	if (normalized === "audit" || normalized === "publication") return "system";
	if (normalized === "security") return "product";
	const kind = String(fallbackKind || "").trim().toLowerCase();
	if (/doc|product/.test(kind)) return "product";
	if (/architecture|system|migration|workflow|agent|audit|publish|release|package/.test(kind)) return "system";
	if (/bug|fix|code|test|maintenance|chore/.test(kind)) return "code";
	return "task";
}

/**
 * Normalize a roadmap status string.
 */
export function normalizeRoadmapStatus(status: string | undefined): RoadmapStatus {
	const value = String(status || "todo").trim();
	if (value === "research" || value === "implement" || value === "verify") return "in_progress";
	return (ROADMAP_STATUS_VALUES as readonly string[]).includes(value)
		? value as RoadmapStatus
		: "todo";
}

/**
 * Normalize a roadmap priority string.
 */
export function normalizeRoadmapPriority(priority: string | undefined): RoadmapPriority {
	const value = String(priority || "medium").trim();
	return (ROADMAP_PRIORITY_VALUES as readonly string[]).includes(value)
		? value as RoadmapPriority
		: "medium";
}

export function normalizeSprintStatus(status: string | undefined): RoadmapSprintRecord["status"] {
	const value = String(status || "planned").trim();
	return value === "active" || value === "review" || value === "closed" || value === "cancelled" ? value : "planned";
}

export function normalizeRoadmapSprints(raw: unknown): Record<string, RoadmapSprintRecord> {
	if (!raw || typeof raw !== "object") return {};
	return Object.fromEntries(Object.entries(raw as Record<string, any>).map(([sprintId, sprint]) => {
		const id = String(sprint?.id || sprintId).trim() || sprintId;
		const scope = sprint?.scope && typeof sprint.scope === "object" ? sprint.scope : {};
		return [id, {
			id,
			title: String(sprint?.title || id).trim(),
			status: normalizeSprintStatus(sprint?.status),
			outcome: String(sprint?.outcome || sprint?.summary || "").trim(),
			task_ids: unique(Array.isArray(sprint?.task_ids) ? sprint.task_ids.map(String) : []),
			scope: {
				knowledge: unique(Array.isArray(scope.knowledge) ? scope.knowledge.map(String) : []),
				code: unique(Array.isArray(scope.code) ? scope.code.map(String) : []),
			},
			budget: sprint?.budget && typeof sprint.budget === "object" ? sprint.budget : undefined,
			gates: unique(Array.isArray(sprint?.gates) ? sprint.gates.map(String) : []),
			created: typeof sprint?.created === "string" && sprint.created.trim() ? sprint.created : todayIso(),
			updated: typeof sprint?.updated === "string" && sprint.updated.trim() ? sprint.updated : todayIso(),
		} satisfies RoadmapSprintRecord];
	}));
}

/**
 * Read and normalize a roadmap file.
 */
export async function readRoadmapFile(path: string): Promise<RoadmapFile> {
	const { pathExists, readJson } = await import("./local/filesystem.ts");
	if (!(await pathExists(path))) {
		return { version: 1, updated: nowIso(), order: [], tasks: {} };
	}
	const data = await readJson<RoadmapFile>(path);
	const rawTasks =
		typeof data.tasks === "object" && data.tasks ? data.tasks : {};
	const tasks = Object.fromEntries(
		Object.entries(rawTasks).map(([taskId, task]) => {
			const record = (task ?? {}) as Partial<RoadmapTaskRecord>;
			return [
				taskId,
				{
					id:
						typeof record.id === "string" && record.id.trim()
							? record.id
							: taskId,
					title: typeof record.title === "string" ? record.title : taskId,
					status: normalizeRoadmapStatus(record.status),
					priority: normalizeRoadmapPriority(record.priority),
					kind: typeof record.kind === "string" ? record.kind : "task",
					summary: typeof record.summary === "string" ? record.summary : "",
					spec_paths: unique(
						Array.isArray(record.spec_paths) ? record.spec_paths : [],
					),
					code_paths: unique(
						Array.isArray(record.code_paths) ? record.code_paths : [],
					),
					research_ids: unique(
						Array.isArray(record.research_ids) ? record.research_ids : [],
					),
					labels: unique(Array.isArray(record.labels) ? record.labels : []),
					change_type: normalizeTaskChangeType(record.change_type ?? record.change_class, record.kind),
					goal: normalizeRoadmapTaskGoal(
						record.goal,
						String(record.summary ?? ""),
					),
					delta: {
						desired:
							typeof record.delta?.desired === "string"
								? record.delta.desired
								: "",
						current:
							typeof record.delta?.current === "string"
								? record.delta.current
								: "",
						closure:
							typeof record.delta?.closure === "string"
								? record.delta.closure
								: "",
					},
					created:
						typeof record.created === "string" && record.created.trim()
							? record.created
							: todayIso(),
					updated:
						typeof record.updated === "string" && record.updated.trim()
							? record.updated
							: todayIso(),
				} satisfies RoadmapTaskRecord,
			];
		}),
	);
	return {
		version: data.version ?? 1,
		updated: data.updated ?? nowIso(),
		order: Array.isArray(data.order) ? data.order.filter(Boolean) : [],
		tasks,
		sprints: normalizeRoadmapSprints((data as any).sprints),
	};
}
