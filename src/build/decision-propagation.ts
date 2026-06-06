import { normalizeDecisionStateDeltaRows } from "../decision/state-delta.ts";
import { unique } from "../shared/utils.ts";

export type DecisionPropagationResolutionKind =
	| "knowledge-only"
	| "non-executable"
	| "not-applicable"
	| "rejected"
	| "blocked"
	| "roadmap-task"
	| "sprint"
	| "deferred"
	| "covered-by-row-resolutions";

export interface DecisionPropagationResolutionInput {
	row_id?: string;
	question_id?: string;
	question?: string;
	resolution?: string;
	task_ids?: string[];
	sprint_ids?: string[];
	knowledge_refs?: string[];
	source_refs?: string[];
	owner?: string;
	trigger?: string;
	trigger_state?: string;
	rationale?: string;
	evidence?: string;
}

export interface NormalizedDecisionPropagationResolution {
	row_id?: string;
	question_id?: string;
	question?: string;
	resolution: DecisionPropagationResolutionKind | "unknown";
	task_ids: string[];
	sprint_ids: string[];
	knowledge_refs: string[];
	source_refs: string[];
	owner?: string;
	trigger?: string;
	trigger_state?: string;
	rationale?: string;
	evidence?: string;
	inferred?: boolean;
}

export interface DecisionPropagationRow {
	id: string;
	text: string;
	affected_layers: string[];
}

export interface DecisionPropagationQuestion {
	id: string;
	question: string;
}

export interface DecisionPropagationAssessmentOptions {
	knownTaskIds?: string[];
	knownSprintIds?: string[];
	satisfiedDeferredTriggers?: string[];
}

export interface DecisionPropagationAssessmentEntry {
	kind: "row" | "question";
	id: string;
	text: string;
	decision_build?: string;
	planning_builds: string[];
	resolution: string;
	status: "resolved" | "unresolved";
	classification: string;
	executable: boolean;
	gaps: string[];
	task_ids: string[];
	sprint_ids: string[];
	knowledge_refs: string[];
	source_refs: string[];
	owner?: string;
	trigger?: string;
	trigger_state?: string;
	rationale?: string;
	evidence?: string;
	inferred?: boolean;
}

export interface DecisionPropagationAssessment {
	decision_build?: string;
	planning_builds: string[];
	rows: DecisionPropagationAssessmentEntry[];
	questions: DecisionPropagationAssessmentEntry[];
	residuals: DecisionPropagationAssessmentEntry[];
	gaps: string[];
}

function list(value: unknown): any[] {
	return Array.isArray(value) ? value : [];
}

function stringList(value: unknown): string[] {
	return list(value)
		.map((item) => String(item || "").trim())
		.filter(Boolean);
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function normalizeResolution(
	value: unknown,
): NormalizedDecisionPropagationResolution["resolution"] {
	const normalized = text(value).toLowerCase().replace(/_/g, "-");
	if (
		[
			"knowledge",
			"knowledge-only",
			"kb-only",
			"doc-only",
			"docs-only",
			"no-code",
		].includes(normalized)
	)
		return "knowledge-only";
	if (
		[
			"non-executable",
			"nonexecutable",
			"no-op",
			"noop",
			"not-executable",
		].includes(normalized)
	)
		return "non-executable";
	if (
		["not-applicable", "not-applicable-resolution", "n/a", "na"].includes(
			normalized,
		)
	)
		return "not-applicable";
	if (["reject", "rejected"].includes(normalized)) return "rejected";
	if (
		["block", "blocked", "explicit-blocking", "blocking"].includes(normalized)
	)
		return "blocked";
	if (["roadmap", "roadmap-task", "task", "tasks"].includes(normalized))
		return "roadmap-task";
	if (["sprint", "cohort", "sprint-cohort"].includes(normalized))
		return "sprint";
	if (["defer", "deferred", "explicit-deferred"].includes(normalized))
		return "deferred";
	if (normalized === "covered-by-row-resolutions")
		return "covered-by-row-resolutions";
	return "unknown";
}

function normalizeId(value: unknown): string {
	return text(value).replace(/\s+/g, " ");
}

function extractTaskIds(values: unknown[]): string[] {
	return unique(
		values.flatMap((value) => String(value || "").match(/TASK-\d+/g) || []),
	);
}

function extractSprintIds(values: unknown[]): string[] {
	return unique(
		values.flatMap((value) => String(value || "").match(/SPRINT-\d+/g) || []),
	);
}

function extractKnowledgeRefs(values: unknown[]): string[] {
	return unique(
		values.flatMap(
			(value) => String(value || "").match(/\.codewiki\/kb\/[\w./-]+/g) || [],
		),
	);
}

function normalizeResolutionEntry(
	raw: any,
): NormalizedDecisionPropagationResolution {
	return {
		row_id: normalizeId(raw?.row_id),
		question_id: normalizeId(raw?.question_id),
		question: normalizeId(raw?.question),
		resolution: normalizeResolution(raw?.resolution ?? raw?.kind ?? raw?.state),
		task_ids: unique([
			...stringList(raw?.task_ids),
			...extractTaskIds([
				raw?.task_id,
				raw?.evidence,
				...(raw?.source_refs ?? []),
			]),
		]),
		sprint_ids: unique([
			...stringList(raw?.sprint_ids),
			...extractSprintIds([
				raw?.sprint_id,
				raw?.evidence,
				...(raw?.source_refs ?? []),
			]),
		]),
		knowledge_refs: unique([
			...stringList(raw?.knowledge_refs),
			...extractKnowledgeRefs([...(raw?.source_refs ?? [])]),
		]),
		source_refs: stringList(raw?.source_refs),
		owner: text(raw?.owner) || undefined,
		trigger: text(raw?.trigger) || undefined,
		trigger_state:
			text(
				raw?.trigger_state ??
					raw?.triggerState ??
					raw?.defer_status ??
					raw?.deferStatus,
			) || undefined,
		rationale: text(raw?.rationale) || undefined,
		evidence: text(raw?.evidence) || undefined,
		inferred: raw?.inferred === true,
	};
}

export function normalizeDecisionRowResolutions(
	planning: any,
): NormalizedDecisionPropagationResolution[] {
	return [
		...list(planning?.decision_row_resolutions),
		...list(planning?.decision_propagation?.row_resolutions),
	]
		.map(normalizeResolutionEntry)
		.filter((entry) => entry.row_id);
}

export function normalizeDecisionQuestionResolutions(
	planning: any,
): NormalizedDecisionPropagationResolution[] {
	return [
		...list(planning?.downstream_question_resolutions),
		...list(planning?.decision_propagation?.question_resolutions),
	]
		.map(normalizeResolutionEntry)
		.filter((entry) => entry.question_id || entry.question);
}

export function acceptedDecisionRows(decision: any): DecisionPropagationRow[] {
	const normalizedRows = normalizeDecisionStateDeltaRows(decision);
	if (normalizedRows.length > 0) {
		return normalizedRows.map((row) => ({
			id: row.id,
			text: text(
				row.change_delta ||
					row.expected_final_state ||
					row.desired_state ||
					row.rationale ||
					row.id,
			),
			affected_layers: row.affected_layers,
		}));
	}
	const sourceRows = list(decision?.approved_rows);
	return unique(
		sourceRows.map((row, index) => text(row?.id) || `ROW-${index + 1}`),
	).map((id) => {
		const row =
			sourceRows.find(
				(candidate) =>
					(text(candidate?.id) ||
						`ROW-${sourceRows.indexOf(candidate) + 1}`) === id,
			) || {};
		return {
			id,
			text: text(
				row?.proposed_change ||
					row?.state_delta?.desired ||
					row?.text ||
					row?.summary ||
					row?.rationale ||
					id,
			),
			affected_layers: [
				...stringList(row?.impact?.product),
				...stringList(row?.impact?.system),
				...stringList(row?.impact?.source),
				...stringList(row?.impact?.tests),
				...stringList(row?.impact?.docs),
			],
		};
	});
}

export function downstreamPlanningQuestions(
	decision: any,
): DecisionPropagationQuestion[] {
	return unique([
		...stringList(decision?.downstream_planning_questions),
		...stringList(decision?.propagation?.downstream_planning_questions),
	]).map((question, index) => ({ id: `Q${index + 1}`, question }));
}

function planningPath(planning: any): string {
	return text(
		planning?.path ||
			planning?.data?.path ||
			planning?.data?.source ||
			planning?.source,
	);
}

function planningData(planning: any): any {
	return planning?.data || planning || {};
}

function relatedPlanningStrings(rowId: string, planning: any): string[] {
	const data = planningData(planning);
	const buckets = [
		...list(data?.requirements).flatMap((item) => [
			item?.id,
			item?.text,
			...(item?.source_refs ?? []),
		]),
		...list(data?.evidence_mapping).flatMap((item) => [
			item?.criterion,
			item?.evidence,
			...(item?.requirement_ids ?? []),
			...(item?.source_refs ?? []),
		]),
		...list(data?.acceptance_mapping).flatMap((item) => [
			item?.criterion,
			item?.evidence,
			...(item?.requirement_ids ?? []),
			...(item?.source_refs ?? []),
		]),
		...stringList(data?.task_changes),
		...stringList(data?.roadmap_changes),
	];
	return buckets
		.map((item) => String(item || "").trim())
		.filter((item) => item.includes(rowId));
}

function inferRowResolution(
	row: DecisionPropagationRow,
	planningBuilds: any[],
): NormalizedDecisionPropagationResolution | null {
	const related = planningBuilds.flatMap((planning) =>
		relatedPlanningStrings(row.id, planning),
	);
	if (!related.length) return null;
	const taskIds = extractTaskIds(related);
	const sprintIds = extractSprintIds(related);
	const knowledgeRefs = extractKnowledgeRefs(related);
	const lower = related.join("\n").toLowerCase();
	const inferred: NormalizedDecisionPropagationResolution = {
		row_id: row.id,
		resolution: taskIds.length
			? "roadmap-task"
			: sprintIds.length
				? "sprint"
				: lower.includes("knowledge-only") || knowledgeRefs.length
					? "knowledge-only"
					: lower.includes("defer")
						? "deferred"
						: "unknown",
		task_ids: taskIds,
		sprint_ids: sprintIds,
		knowledge_refs: knowledgeRefs,
		source_refs: related,
		evidence: related[0],
		owner: lower.includes("owner") ? "inferred" : undefined,
		trigger: lower.includes("trigger") ? "inferred" : undefined,
		rationale: lower.includes("rationale") ? "inferred" : undefined,
		inferred: true,
	};
	return inferred;
}

function questionStillOpen(
	question: DecisionPropagationQuestion,
	planningBuilds: any[],
): boolean {
	const q = question.question.toLowerCase();
	return planningBuilds.some((planning) =>
		stringList(planningData(planning)?.open_questions).some((candidate) => {
			const c = candidate.toLowerCase();
			return c === q || c.includes(q) || q.includes(c);
		}),
	);
}

function triggerStateSatisfied(value: string | undefined): boolean {
	const normalized = text(value).toLowerCase();
	return Boolean(
		normalized &&
			normalized.includes("satisfied") &&
			!normalized.includes("not_satisfied") &&
			!normalized.includes("not satisfied") &&
			!normalized.includes("unsatisfied"),
	);
}

function deferredTriggerSatisfied(
	entry: NormalizedDecisionPropagationResolution,
	satisfiedDeferredTriggers: string[],
): boolean {
	if (triggerStateSatisfied(entry.trigger_state)) return true;
	if (satisfiedDeferredTriggers.length === 0) return false;
	const haystack = [
		entry.row_id,
		entry.question_id,
		entry.question,
		entry.trigger,
		entry.trigger_state,
		entry.evidence,
		...entry.source_refs,
	]
		.map((value) => text(value).toLowerCase())
		.filter(Boolean)
		.join("\n");
	return satisfiedDeferredTriggers.some((trigger) => {
		const normalized = text(trigger).toLowerCase();
		return normalized && haystack.includes(normalized);
	});
}

const EXECUTABLE_LAYERS = new Set([
	"adapter",
	"adapters",
	"api",
	"build",
	"cli",
	"code",
	"graph",
	"implementation",
	"package",
	"publication",
	"roadmap",
	"runtime",
	"scheduler",
	"session",
	"source",
	"state",
	"tests",
	"test",
	"tools",
	"ui",
	"validation",
	"worker",
]);

const NON_EXECUTABLE_RESOLUTIONS = new Set([
	"knowledge-only",
	"non-executable",
	"not-applicable",
	"rejected",
	"blocked",
	"covered-by-row-resolutions",
]);

function rowLooksExecutable(row: DecisionPropagationRow): boolean {
	if (
		row.affected_layers.some((layer) =>
			EXECUTABLE_LAYERS.has(layer.toLowerCase()),
		)
	)
		return true;
	const lower = row.text.toLowerCase();
	if (
		/\b(knowledge-only|docs-only|doc-only|no-code|non-executable|not applicable|not-applicable)\b/.test(
			lower,
		)
	)
		return false;
	return /\b(code|test|runtime|daemon|worker|schedule|scheduler|roadmap|task|sprint|implementation|validation|gateway|graph|state|api|adapter|tool|package|publish|release)\b/.test(
		lower,
	);
}

function rowIsExecutable(
	row: DecisionPropagationRow,
	resolution: NormalizedDecisionPropagationResolution | null,
): boolean {
	if (
		resolution?.resolution === "roadmap-task" ||
		resolution?.resolution === "sprint"
	)
		return true;
	if (resolution && NON_EXECUTABLE_RESOLUTIONS.has(resolution.resolution))
		return false;
	return rowLooksExecutable(row);
}

function validateResolution(
	entry: NormalizedDecisionPropagationResolution,
	executable: boolean,
	knownTaskIds: Set<string>,
	knownSprintIds: Set<string>,
	satisfiedDeferredTriggers: string[],
): string[] {
	const gaps: string[] = [];
	if (entry.resolution === "unknown") gaps.push("unknown_resolution");
	if (entry.resolution !== "covered-by-row-resolutions" && !entry.evidence)
		gaps.push("missing_evidence");
	if (
		entry.resolution === "knowledge-only" &&
		entry.knowledge_refs.length === 0 &&
		entry.source_refs.length === 0
	)
		gaps.push("missing_knowledge_refs");
	if (
		["non-executable", "not-applicable", "rejected", "blocked"].includes(
			entry.resolution,
		) &&
		entry.knowledge_refs.length === 0 &&
		entry.source_refs.length === 0
	)
		gaps.push("missing_disposition_refs");
	if (entry.resolution === "roadmap-task") {
		if (entry.task_ids.length === 0) gaps.push("missing_task_ids");
		if (
			knownTaskIds.size > 0 &&
			entry.task_ids.length > 0 &&
			!entry.task_ids.some((taskId) => knownTaskIds.has(taskId))
		) {
			gaps.push(`unknown_task:${entry.task_ids.join(",")}`);
		}
	}
	if (entry.resolution === "sprint") {
		if (entry.sprint_ids.length === 0) gaps.push("missing_sprint_ids");
		if (
			knownSprintIds.size > 0 &&
			entry.sprint_ids.length > 0 &&
			!entry.sprint_ids.some((sprintId) => knownSprintIds.has(sprintId))
		) {
			gaps.push(`unknown_sprint:${entry.sprint_ids.join(",")}`);
		}
	}
	if (entry.resolution === "deferred") {
		const triggerSatisfied = deferredTriggerSatisfied(
			entry,
			satisfiedDeferredTriggers,
		);
		if (executable) {
			gaps.push("executable_requires_task_or_sprint");
			if (triggerSatisfied) gaps.push("trigger_satisfied");
		} else {
			if (!entry.owner) gaps.push("missing_owner");
			if (!entry.trigger) gaps.push("missing_trigger");
			if (!entry.rationale) gaps.push("missing_rationale");
			if (triggerSatisfied) gaps.push("trigger_satisfied");
		}
	}
	return gaps;
}

function classifyResolution(
	kind: "row" | "question",
	resolution: NormalizedDecisionPropagationResolution | null,
	gaps: string[],
	executable: boolean,
): string {
	if (gaps.length > 0)
		return executable ||
			gaps.some(
				(gap) =>
					gap.includes("missing_resolution") ||
					gap.includes("executable_requires_task_or_sprint"),
			)
			? "unplanned-gap"
			: "planning-gap";
	if (!resolution) return executable ? "unplanned-gap" : "unknown";
	if (resolution.resolution === "roadmap-task") return "executable-task-mapped";
	if (resolution.resolution === "sprint") return "executable-sprint-mapped";
	if (resolution.resolution === "knowledge-only") return "knowledge-only";
	if (resolution.resolution === "non-executable") return "non-executable";
	if (resolution.resolution === "not-applicable") return "not-applicable";
	if (resolution.resolution === "rejected") return "rejected";
	if (resolution.resolution === "blocked") return "blocked";
	if (resolution.resolution === "deferred")
		return kind === "row" ? "deferred-non-executable" : "deferred-question";
	if (resolution.resolution === "covered-by-row-resolutions")
		return "covered-by-row-resolutions";
	return executable ? "unplanned-gap" : "unknown";
}

function buildEntry(
	kind: "row" | "question",
	row: DecisionPropagationRow,
	resolution: NormalizedDecisionPropagationResolution | null,
	planningBuilds: any[],
	knownTaskIds: Set<string>,
	knownSprintIds: Set<string>,
	satisfiedDeferredTriggers: string[],
	prefix: string,
): DecisionPropagationAssessmentEntry {
	const executable = kind === "row" ? rowIsExecutable(row, resolution) : false;
	const gaps = resolution
		? validateResolution(
				resolution,
				executable,
				knownTaskIds,
				knownSprintIds,
				satisfiedDeferredTriggers,
			).map((gap) => `${prefix}:${row.id}:${gap}`)
		: [`${prefix}:${row.id}:missing_resolution`];
	return {
		kind,
		id: row.id,
		text: row.text,
		planning_builds: unique(planningBuilds.map(planningPath).filter(Boolean)),
		resolution: resolution?.resolution || "missing",
		status: gaps.length ? "unresolved" : "resolved",
		classification: classifyResolution(kind, resolution, gaps, executable),
		executable,
		gaps,
		task_ids: resolution?.task_ids || [],
		sprint_ids: resolution?.sprint_ids || [],
		knowledge_refs: resolution?.knowledge_refs || [],
		source_refs: resolution?.source_refs || [],
		owner: resolution?.owner,
		trigger: resolution?.trigger,
		trigger_state: resolution?.trigger_state,
		rationale: resolution?.rationale,
		evidence: resolution?.evidence,
		inferred: resolution?.inferred,
	};
}

export function assessDecisionPropagation(
	decision: any,
	planningBuilds: any[],
	options: DecisionPropagationAssessmentOptions = {},
): DecisionPropagationAssessment {
	const knownTaskIds = new Set(options.knownTaskIds || []);
	const knownSprintIds = new Set(options.knownSprintIds || []);
	const satisfiedDeferredTriggers = stringList(
		options.satisfiedDeferredTriggers,
	);
	const rows = acceptedDecisionRows(decision);
	const questions = downstreamPlanningQuestions(decision);
	const rowResolutions = planningBuilds.flatMap((planning) =>
		normalizeDecisionRowResolutions(planningData(planning)),
	);
	const questionResolutions = planningBuilds.flatMap((planning) =>
		normalizeDecisionQuestionResolutions(planningData(planning)),
	);
	const rowEntries = rows.map((row) => {
		const resolution =
			rowResolutions.find((entry) => entry.row_id === row.id) ||
			inferRowResolution(row, planningBuilds);
		return buildEntry(
			"row",
			row,
			resolution,
			planningBuilds,
			knownTaskIds,
			knownSprintIds,
			satisfiedDeferredTriggers,
			"row",
		);
	});
	const allRowsResolved = rowEntries.every((entry) => entry.gaps.length === 0);
	const questionEntries = questions.map((question) => {
		const resolution =
			questionResolutions.find(
				(entry) =>
					entry.question_id === question.id ||
					entry.question === question.question,
			) ||
			(allRowsResolved && !questionStillOpen(question, planningBuilds)
				? {
						question_id: question.id,
						question: question.question,
						resolution: "covered-by-row-resolutions" as const,
						task_ids: unique(rowEntries.flatMap((entry) => entry.task_ids)),
						sprint_ids: unique(rowEntries.flatMap((entry) => entry.sprint_ids)),
						knowledge_refs: unique(
							rowEntries.flatMap((entry) => entry.knowledge_refs),
						),
						source_refs: unique(
							rowEntries.flatMap((entry) => entry.source_refs),
						),
						evidence:
							"All accepted decision rows have propagation resolutions and the question is not still open in planning.",
						inferred: true,
					}
				: null);
		return buildEntry(
			"question",
			{ id: question.id, text: question.question, affected_layers: [] },
			resolution,
			planningBuilds,
			knownTaskIds,
			knownSprintIds,
			satisfiedDeferredTriggers,
			"question",
		);
	});
	const residuals = [...rowEntries, ...questionEntries].filter(
		(entry) => entry.gaps.length > 0,
	);
	return {
		planning_builds: unique(planningBuilds.map(planningPath).filter(Boolean)),
		rows: rowEntries,
		questions: questionEntries,
		residuals,
		gaps: unique(residuals.flatMap((entry) => entry.gaps)),
	};
}
