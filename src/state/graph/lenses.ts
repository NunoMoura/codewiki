import type { RoadmapTaskRecord } from "../../roadmap/types.ts";
import { unique } from "../../shared/utils.ts";
import type { CodewikiStateLensId, GraphEdge, GraphNode } from "../types.ts";
import {
	buildTaskIds,
	canonicalSourceRefsForBuild,
	normalizeCodewikiRef,
	type BuildArtifactRefSource,
} from "./artifact-refs.ts";

type GraphLensFamilyId =
	| "decision"
	| "knowledge"
	| "work"
	| "execution"
	| "proof";

const DEFAULT_GRAPH_LENS_FAMILIES: Array<{
	id: GraphLensFamilyId;
	label: string;
	summary: string;
}> = [
	{
		id: "decision",
		label: "Decision",
		summary:
			"Approved intent, requirement rows, risk state, and semantic direction.",
	},
	{
		id: "knowledge",
		label: "Knowledge",
		summary:
			"Product/system docs, diagram refs, and source-backed knowledge context.",
	},
	{
		id: "work",
		label: "Work",
		summary: "Planning, roadmap, sprint, task, and coordination state.",
	},
	{
		id: "execution",
		label: "Execution",
		summary:
			"Code, tests, checks, implementation builds, and dirty working-set evidence.",
	},
	{
		id: "proof",
		label: "Proof",
		summary:
			"Validation, audit evidence, commits, publication, archive, and content proof.",
	},
];

interface ReadModelRecord {
	[key: string]: unknown;
}

interface FileStructurePathEntry {
	path: string;
}

interface CompactFileStructureDrift {
	version: number;
	source: string;
	map_path: string;
	available: boolean;
	categories: string[];
	counts: Record<string, number>;
	intended_paths: unknown[];
	current_paths: unknown[];
	target_paths: unknown[];
	approved_delta_edges: unknown[];
	approved_migration_deltas: FileStructurePathEntry[];
	actionable_entries: unknown[];
	parse_issues: unknown[];
}

interface GraphGcView {
	classes?: {
		hot?: {
			build_paths?: string[];
			validation_paths?: string[];
		};
	};
}

interface BuildArtifact extends BuildArtifactRefSource {
	kind: string;
	status?: string;
}

interface ValidationArtifact {
	path: string;
	taskId?: string;
	verdict?: string;
	data?: unknown;
}

interface GraphRuntimeLensState {
	active_claim_count: number;
	warning_count?: number;
	conflict_count?: number;
	pending_waiter_count?: number;
	ready_waiter_count?: number;
	artifact_statuses?: unknown[];
	claims?: unknown[];
	waiters?: unknown[];
	conflicts?: unknown[];
}

interface GraphLensBadge {
	id: string;
	label: string;
	count: number;
	refs?: string[];
	ref_count?: number;
}

function isRecord(value: unknown): value is ReadModelRecord {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordOrEmpty(value: unknown): ReadModelRecord {
	if (isRecord(value)) return value;
	return {};
}

function buildStatus(build: BuildArtifact): string {
	const data = recordOrEmpty(build.data);
	const lifecycle = recordOrEmpty(data.lifecycle);
	return String(build.status || data.status || lifecycle.state || "unknown");
}

function isOpenTaskStatus(status: string): boolean {
	return ["todo", "in_progress", "blocked"].includes(status);
}

function graphLensFamilyForNode(node: GraphNode): GraphLensFamilyId | null {
	const kind = String(node?.kind || "").trim();
	const layer = String(node?.layer || "").trim();
	const id = String(node?.id || "").trim();
	const path = String(node?.path || "").trim();
	if (
		kind === "decision_build" ||
		kind === "research_collection" ||
		kind === "research_entry" ||
		layer === "intent"
	)
		return "decision";
	if (
		kind === "doc" ||
		kind === "system_diagram" ||
		kind === "system_diagram_ref" ||
		kind === "missing_system_diagram_ref" ||
		layer === "knowledge"
	)
		return "knowledge";
	if (
		kind === "roadmap_task" ||
		kind === "roadmap_sprint" ||
		kind === "planning_build" ||
		kind === "change_claim" ||
		kind === "change_claim_waiter" ||
		kind === "change_claim_wake" ||
		kind === "change_claim_scope" ||
		layer === "roadmap"
	)
		return "work";
	if (
		kind === "code_path" ||
		kind === "test_file" ||
		kind === "implementation_build" ||
		layer === "code" ||
		id.startsWith("code:") ||
		id.startsWith("test:") ||
		path.startsWith("src/") ||
		path.startsWith("tests/")
	)
		return "execution";
	if (
		kind === "validation_report" ||
		kind === "content_proof" ||
		kind === "audit_evidence" ||
		kind === "canonical_source_ref" ||
		kind === "git_archive_ref" ||
		kind === "lint_issue" ||
		layer === "validation" ||
		layer === "content_proof" ||
		layer === "audit" ||
		layer === "archive"
	)
		return "proof";
	if (kind.endsWith("_build")) return "execution";
	return null;
}

function graphLensFamilyForReconciliation(
	item: ReadModelRecord,
): GraphLensFamilyId {
	const loop = String(item?.next_loop || "").trim();
	const layers = [item?.from_layer, item?.to_layer].map((value) =>
		String(value || "").trim(),
	);
	if (
		loop === "decision" ||
		layers.some((layer) => ["intent", "decision"].includes(layer))
	)
		return "decision";
	if (layers.includes("knowledge")) return "knowledge";
	if (loop === "planning" || layers.includes("roadmap")) return "work";
	if (
		loop === "implementation" ||
		layers.some((layer) => ["code", "build"].includes(layer))
	)
		return "execution";
	return "proof";
}

function graphLensBadge(
	id: string,
	label: string,
	count: number,
	refs: string[] = [],
): GraphLensBadge {
	const badge: GraphLensBadge = { id, label, count };
	if (refs.length > 0) {
		badge.refs = refs.slice(0, 6);
		badge.ref_count = refs.length;
	}
	return badge;
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function omittedCount(total: number, visible: number): number {
	return Math.max(0, total - visible);
}

function compactTaskForLens(task: RoadmapTaskRecord): ReadModelRecord {
	const taskId = String(task.id || "").trim();
	const goal = recordOrEmpty(task.goal);
	return {
		id: taskId,
		title: String(task.title || taskId).trim(),
		status: String(task.status || "todo").trim(),
		priority: String(task.priority || "").trim(),
		kind: String(task.kind || "").trim(),
		summary: String(task.summary || "").trim(),
		spec_paths: stringList(task.spec_paths),
		code_paths: stringList(task.code_paths),
		acceptance_count: stringList(goal.acceptance).length,
		non_goal_count: stringList(goal.non_goals).length,
		verification_count: stringList(goal.verification).length,
		context_ref: taskId
			? `.codewiki/roadmap/tasks/${taskId}/context.json`
			: undefined,
	};
}

function compactSprintForLens(sprint: ReadModelRecord): ReadModelRecord {
	return {
		id: String(sprint.id || "").trim(),
		title: String(sprint.title || sprint.id || "").trim(),
		status: String(sprint.status || "").trim(),
		outcome: String(sprint.outcome || "").trim(),
		task_ids: stringList(sprint.task_ids),
		open_task_ids: stringList(sprint.open_task_ids),
		gates: stringList(sprint.gates),
		scope: recordOrEmpty(sprint.scope),
	};
}

function compactValidationForLens(validation: ValidationArtifact): ReadModelRecord {
	const data = recordOrEmpty(validation.data);
	return {
		path: normalizeCodewikiRef(validation.path),
		task_id: validation.taskId || data.task_id || data.taskId || null,
		profile: String(data.profile || data.gate || "").trim() || undefined,
		verdict: validation.verdict || data.verdict || "unknown",
		source: data.source || null,
	};
}

function graphLensFreshness(sourceRefs: string[]): ReadModelRecord {
	return {
		status: "fresh",
		basis: "generated_index_source_refs",
		source_ref_count: sourceRefs.length,
		stale_when:
			"canonical source refs change without rebuilding generated graph/state",
	};
}

function graphLensExpansionHints(
	id: CodewikiStateLensId,
	sourceRefs: string[],
	extra: ReadModelRecord[] = [],
): ReadModelRecord[] {
	return [
		{
			kind: "lens",
		lens: id,
		summary: `Call wiki_state with lens=${id} and a focus/ref filter for details.`,
		},
		{
			kind: "source_refs",
		summary: "Read canonical source refs before semantic edits.",
		refs: sourceRefs.slice(0, 8),
		omitted_ref_count: omittedCount(sourceRefs.length, 8),
		},
		...extra,
	];
}

function focusedGraphLens(
	id: CodewikiStateLensId,
	input: {
		summary: string;
		sourceRefs: string[];
		omittedCounts: ReadModelRecord;
		nextAction: ReadModelRecord;
		blockers?: ReadModelRecord[];
		data: ReadModelRecord;
		expansionHints?: ReadModelRecord[];
	},
): ReadModelRecord {
	const sourceRefs = unique(input.sourceRefs.map(normalizeCodewikiRef)).filter(
		Boolean,
	);
	const visibleSourceRefs = sourceRefs.slice(0, 32);
	return {
		version: 1,
		id,
		source: `generated:graph-${id}-lens`,
		summary: input.summary,
		source_refs: visibleSourceRefs,
		omitted_counts: {
			...input.omittedCounts,
			source_refs: omittedCount(sourceRefs.length, visibleSourceRefs.length),
		},
		next_action: input.nextAction,
		next_safe_action: input.nextAction,
		blockers: input.blockers || [],
		freshness: graphLensFreshness(sourceRefs),
		expansion_hints: graphLensExpansionHints(
			id,
			sourceRefs,
			input.expansionHints || [],
		),
		data: input.data,
		invariant: "generated_state_not_canonical_truth",
	};
}

function isBuildOrValidationNode(node: GraphNode): boolean {
	const kind = String(node?.kind || "").trim();
	return kind.endsWith("_build") || kind === "validation_report";
}

function extractNextActionSourceId(
	items: ReadModelRecord[],
	action: ReadModelRecord | null | undefined,
): string {
	const actionItemId = String(action?.item_id || "").trim();
	if (!actionItemId) return "";
	const item = items.find(
		(candidate) => String(candidate?.id || "").trim() === actionItemId,
	);
	return String(item?.source_id || "").trim();
}

export function applyDefaultLensCompaction(
	nodes: GraphNode[],
	nextActionSourceId: string,
): void {
	nodes.forEach((node) => {
		const family = graphLensFamilyForNode(node);
		if (family) node.lens_family = family;
		if (!isBuildOrValidationNode(node)) return;
		if (String(node.id || "") === nextActionSourceId) {
			node.default_next_action = true;
			return;
		}
		node.default_hidden = true;
		node.default_collapsed = true;
		node.default_collapse_reason = "badge_in_default_lens";
	});
}

export function buildGraphLensViews(input: {
	nodes: GraphNode[];
	edges: GraphEdge[];
	reconciliationItems: ReadModelRecord[];
	reconciliationAction: ReadModelRecord | null | undefined;
	roadmapEntries: RoadmapTaskRecord[];
	activeSprintIds: string[];
	sprints: ReadModelRecord[];
	builds: BuildArtifact[];
	validations: ValidationArtifact[];
	dirtyPaths: string[];
	docPaths: string[];
	specPaths: string[];
	diagramRefCount: number;
	diagramParseIssueCount: number;
	traceabilityRows: ReadModelRecord[];
	semanticChangeRows: ReadModelRecord[];
	semanticExecutionClosure: ReadModelRecord;
	validationAttestations: ReadModelRecord[];
	validationIsolationRows: ReadModelRecord[];
	canonicalSourceRefs: string[];
	auditEvidenceRefs: string[];
	contentProofRefs: string[];
	fileStructureDrift: CompactFileStructureDrift;
	claimState: GraphRuntimeLensState;
	gc: GraphGcView;
}) {
	const nextActionSourceId = extractNextActionSourceId(
		input.reconciliationItems,
		input.reconciliationAction,
	);
	const familyRefs: Record<GraphLensFamilyId, string[]> = {
		decision: [],
		knowledge: [],
		work: [],
		execution: [],
		proof: [],
	};
	const familyDrift: Record<
		GraphLensFamilyId,
		{ drift: number; blocked: number }
	> = {
		decision: { drift: 0, blocked: 0 },
		knowledge: { drift: 0, blocked: 0 },
		work: { drift: 0, blocked: 0 },
		execution: { drift: 0, blocked: 0 },
		proof: { drift: 0, blocked: 0 },
	};
	input.nodes.forEach((node) => {
		const family = graphLensFamilyForNode(node);
		if (!family) return;
		const hiddenByDefault =
			node.default_hidden === true ||
			node.compacted === true ||
			(isBuildOrValidationNode(node) &&
				String(node.id || "") !== nextActionSourceId);
		if (!hiddenByDefault) familyRefs[family].push(String(node.id || ""));
		const state = String(node.alignment_state || node.state || "").trim();
		if (state === "blocked") familyDrift[family].blocked += 1;
		else if (state && state !== "aligned") familyDrift[family].drift += 1;
	});
	input.reconciliationItems.forEach((item) => {
		const state = String(item?.state || "").trim();
		if (state === "aligned") return;
		const family = graphLensFamilyForReconciliation(item);
		if (state === "blocked") familyDrift[family].blocked += 1;
		else familyDrift[family].drift += 1;
	});
	const buildPaths = input.builds
		.map((build) => normalizeCodewikiRef(build.path))
		.filter(Boolean);
	const validationPaths = input.validations
		.map((validation) => normalizeCodewikiRef(validation.path))
		.filter(Boolean);
	const buildCounts = {
		total: input.builds.length,
		decision: input.builds.filter((build) => build.kind === "decision_build")
			.length,
		planning: input.builds.filter((build) => build.kind === "planning_build")
			.length,
		implementation: input.builds.filter(
			(build) => build.kind === "implementation_build",
		).length,
		hot: input.gc?.classes?.hot?.build_paths?.length || 0,
		collapsed: buildPaths.filter(
			(path) => `build:${path}` !== nextActionSourceId,
		).length,
	};
	const validationCounts = {
		total: input.validations.length,
		pass: input.validations.filter(
			(validation) => String(validation.verdict || "") === "pass",
		).length,
		fail_or_block: input.validations.filter((validation) =>
			["fail", "block"].includes(String(validation.verdict || "")),
		).length,
		hot: input.gc?.classes?.hot?.validation_paths?.length || 0,
		collapsed: validationPaths.filter(
			(path) => `validation:${path}` !== nextActionSourceId,
		).length,
	};
	const openTasks = input.roadmapEntries.filter((task) =>
		isOpenTaskStatus(String(task.status || "todo")),
	);
	const activeTasks = input.roadmapEntries.filter(
		(task) => String(task.status || "") === "in_progress",
	);
	const blockedTasks = input.roadmapEntries.filter(
		(task) => String(task.status || "") === "blocked",
	);
	const doneTasks = input.roadmapEntries.filter(
		(task) => String(task.status || "") === "done",
	);
	const semanticGaps = input.semanticChangeRows.filter(
		(row) => Array.isArray(row.gaps) && row.gaps.length > 0,
	);
	const traceabilityGaps = input.traceabilityRows.filter(
		(row) => Array.isArray(row.gaps) && row.gaps.length > 0,
	);
	const semanticClosureSummary = recordOrEmpty(
		input.semanticExecutionClosure.summary,
	);
	const semanticClosureGapCount = Number(
		semanticClosureSummary.gap_count || 0,
	);
	const semanticClosureRiskCount = Number(
		semanticClosureSummary.remaining_risk_count || 0,
	);
	const fileStructureAuditSummary = {
		version: input.fileStructureDrift.version,
		source: input.fileStructureDrift.source,
		map_path: input.fileStructureDrift.map_path,
		available: input.fileStructureDrift.available,
		categories: input.fileStructureDrift.categories,
		counts: input.fileStructureDrift.counts,
		path_rule_counts: {
			intended: input.fileStructureDrift.intended_paths.length,
			current: input.fileStructureDrift.current_paths.length,
			target: input.fileStructureDrift.target_paths.length,
		},
		approved_delta_edges: input.fileStructureDrift.approved_delta_edges,
		approved_migration_delta_paths:
			input.fileStructureDrift.approved_migration_deltas.map(
				(entry: FileStructurePathEntry) => entry.path,
			),
		actionable_entries: input.fileStructureDrift.actionable_entries,
		parse_issues: input.fileStructureDrift.parse_issues,
	};
	const badgesByFamily: Record<GraphLensFamilyId, GraphLensBadge[]> = {
		decision: [
			graphLensBadge(
				"decision_builds",
				"decision builds",
				buildCounts.decision,
			),
			graphLensBadge("semantic_gaps", "semantic gaps", semanticGaps.length),
			graphLensBadge(
				"semantic_closure_gaps",
				"closure gaps",
				semanticClosureGapCount,
			),
		],
		knowledge: [
			graphLensBadge("docs", "docs", input.docPaths.length),
			graphLensBadge("specs", "specs", input.specPaths.length),
			graphLensBadge("diagram_refs", "diagram refs", input.diagramRefCount),
			graphLensBadge(
				"diagram_parse_issues",
				"diagram parse issues",
				input.diagramParseIssueCount,
			),
			graphLensBadge(
				"file_structure_approved_deltas",
				"approved structure deltas",
				input.fileStructureDrift.counts.approved_migration_delta,
				input.fileStructureDrift.approved_migration_deltas.map(
					(entry: FileStructurePathEntry) => entry.path,
				),
			),
			graphLensBadge(
				"file_structure_actionable_drift",
				"structure drift",
				input.fileStructureDrift.actionable_entries.length,
			),
		],
		work: [
			graphLensBadge(
				"open_tasks",
				"open tasks",
				openTasks.length,
				openTasks.map((task) => task.id),
			),
			graphLensBadge("done_tasks", "done tasks", doneTasks.length),
			graphLensBadge(
				"active_sprints",
				"active sprints",
				input.activeSprintIds.length,
				input.activeSprintIds,
			),
			graphLensBadge(
				"active_claims",
				"active claims",
				input.claimState.active_claim_count,
			),
		],
		execution: [
			graphLensBadge(
				"code_paths",
				"code paths",
				input.nodes.filter((node) => node.kind === "code_path").length,
			),
			graphLensBadge(
				"test_files",
				"test files",
				input.nodes.filter((node) => node.kind === "test_file").length,
			),
			graphLensBadge(
				"implementation_builds",
				"implementation builds",
				buildCounts.implementation,
			),
			graphLensBadge(
				"dirty_paths",
				"dirty paths",
				input.dirtyPaths.length,
				input.dirtyPaths,
			),
		],
		proof: [
			graphLensBadge(
				"validation_reports",
				"validation reports",
				validationCounts.total,
			),
			graphLensBadge(
				"fail_or_block_validation",
				"fail/block validation",
				validationCounts.fail_or_block,
			),
			graphLensBadge(
				"audit_refs",
				"audit refs",
				input.auditEvidenceRefs.length,
			),
			graphLensBadge(
				"content_proofs",
				"content proofs",
				input.contentProofRefs.length,
			),
			graphLensBadge(
				"traceability_gaps",
				"trace gaps",
				traceabilityGaps.length,
			),
			graphLensBadge(
				"semantic_closure_risks",
				"closure risks",
				semanticClosureRiskCount,
			),
		],
	};
	const families = DEFAULT_GRAPH_LENS_FAMILIES.map((family) => {
		const drift = familyDrift[family.id];
		let state = "aligned";
		if (drift.blocked > 0) state = "blocked";
		else if (drift.drift > 0) state = "drift";
		const refs = unique(familyRefs[family.id]).slice(0, 10);
		return {
			id: family.id,
			label: family.label,
			summary: family.summary,
			state,
			item_count: familyRefs[family.id].length,
			badges: badgesByFamily[family.id],
			hot_refs: refs,
			collapsed: true,
		};
	});
	const defaultLens = {
		version: 1,
		source: "generated:graph-default-lens",
		model: "decision-knowledge-work-execution-proof",
		families,
		badges: {
			builds: buildCounts,
			validations: validationCounts,
		},
		next_action: {
			item_id: input.reconciliationAction?.item_id || null,
			source_id: nextActionSourceId || null,
			loop: input.reconciliationAction?.loop || "observe",
			reason: input.reconciliationAction?.reason || "",
		},
		expands_to: {
			trace: "views.lenses.trace",
			audit: "views.lenses.audit",
			archive: "views.archive",
		},
		invariant: "generated_state_not_canonical_truth",
	};
	const selectedTask = openTasks[0] || null;
	const graphNextAction = {
		kind: input.reconciliationAction?.loop || (selectedTask ? "task" : "observe"),
		task_id: selectedTask?.id || null,
		item_id: input.reconciliationAction?.item_id || null,
		source_id: nextActionSourceId || null,
		reason:
			input.reconciliationAction?.reason ||
			(selectedTask
				? `Next open task is ${selectedTask.id}.`
				: "No open roadmap task requires action."),
	};
	const graphSourceRefs = unique([
		".codewiki/index_graph.json",
		".codewiki/roadmap/queue.json",
		".codewiki/session/queue.json",
		...input.canonicalSourceRefs,
		...buildPaths,
		...validationPaths,
	]);
	const taskSourceRefs = unique([
		".codewiki/roadmap/queue.json",
		...openTasks.flatMap((task) => [
			`.codewiki/roadmap/tasks/${task.id}/context.json`,
			...stringList(task.spec_paths),
			...stringList(task.code_paths),
		]),
	]);
	const sprintSourceRefs = unique([
		".codewiki/roadmap/queue.json",
		...input.sprints.flatMap((sprint) => stringList(sprint.task_ids)),
	]).map((ref) =>
		ref.startsWith("TASK-")
			? `.codewiki/roadmap/tasks/${ref}/context.json`
			: ref,
	);
	const validationSourceRefs = unique([
		...validationPaths,
		...input.auditEvidenceRefs,
		...input.contentProofRefs,
	]);
	const runtimeSourceRefs = unique([
		".codewiki/session/queue.json",
		".codewiki/runtime/diff-tables.json",
		".codewiki/index_graph.json",
	]);
	const commonBlockers: ReadModelRecord[] = [
		...blockedTasks.slice(0, 8).map((task) => ({
			kind: "blocked_task",
			ref: task.id,
			summary: task.summary || task.title || task.id,
		})),
		...(semanticGaps.length > 0
			? [
				{
					kind: "semantic_change_gap",
					count: semanticGaps.length,
					summary:
						"Accepted semantic rows still need durable downstream evidence.",
				},
			]
			: []),
		...(semanticClosureRiskCount > 0
			? [
				{
					kind: "semantic_execution_closure_gap",
					count: semanticClosureRiskCount,
					summary: "Semantic execution closure still has gaps.",
				},
			]
			: []),
		...(traceabilityGaps.length > 0
			? [
				{
					kind: "traceability_gap",
					count: traceabilityGaps.length,
					summary: "Requirement traceability has unresolved gaps.",
				},
			]
			: []),
		...(Number(input.claimState.conflict_count || 0) > 0
			? [
				{
					kind: "runtime_coordination_conflict",
					count: Number(input.claimState.conflict_count || 0),
					summary: "Artifact-status conflicts must clear before automation.",
				},
			]
			: []),
	];
	const taskPreview = openTasks.slice(0, 8).map(compactTaskForLens);
	const sprintPreview = input.sprints.slice(0, 8).map(compactSprintForLens);
	const validationPreview = input.validations
		.slice(-8)
		.reverse()
		.map(compactValidationForLens);
	const runtimeArtifacts = (input.claimState.artifact_statuses || []).slice(
		0,
		12,
	);
	const statusLens = focusedGraphLens("status", {
		summary:
			"Compact project health, focus, blockers, next action, and latest proof signal.",
		sourceRefs: graphSourceRefs,
		omittedCounts: {
			nodes: input.nodes.length,
			edges: input.edges.length,
			open_tasks: omittedCount(openTasks.length, taskPreview.length),
			validations: omittedCount(input.validations.length, validationPreview.length),
		},
		nextAction: graphNextAction,
		blockers: commonBlockers,
		data: {
			open_task_count: openTasks.length,
			active_task_ids: activeTasks.map((task) => task.id),
			blocked_task_ids: blockedTasks.map((task) => task.id),
			active_sprint_ids: input.activeSprintIds,
			latest_validation: validationPreview[0] || null,
			families,
		},
	});
	const resumeLens = focusedGraphLens("resume", {
		summary: "Stable continuation refs and context-boundary metadata.",
		sourceRefs: unique([
			...taskSourceRefs,
			...graphSourceRefs.slice(0, 8),
		]),
		omittedCounts: { open_tasks: omittedCount(openTasks.length, 1) },
		nextAction: graphNextAction,
		blockers: commonBlockers,
		data: {
			selected_task: selectedTask ? compactTaskForLens(selectedTask) : null,
			context_refs: selectedTask
				? [`.codewiki/roadmap/tasks/${selectedTask.id}/context.json`]
				: [],
			context_boundary:
				input.reconciliationAction?.context_boundary ||
				"Read source refs directly before semantic edits.",
		},
	});
	const taskLens = focusedGraphLens("task", {
		summary: "Executable task boundaries, candidate files, and blockers.",
		sourceRefs: taskSourceRefs,
		omittedCounts: { open_tasks: omittedCount(openTasks.length, taskPreview.length) },
		nextAction: graphNextAction,
		blockers: commonBlockers,
		data: { tasks: taskPreview },
	});
	const sprintLens = focusedGraphLens("sprint", {
		summary: "Sprint membership, gates, task scope, and blockers.",
		sourceRefs: sprintSourceRefs,
		omittedCounts: { sprints: omittedCount(input.sprints.length, sprintPreview.length) },
		nextAction: graphNextAction,
		blockers: commonBlockers,
		data: {
			active_sprint_ids: input.activeSprintIds,
			sprints: sprintPreview,
		},
	});
	const validationLens = focusedGraphLens("validation", {
		summary:
			"Validation reports, isolation signals, audit refs, and content proof refs.",
		sourceRefs: validationSourceRefs,
		omittedCounts: {
			validation_reports: omittedCount(
				input.validations.length,
				validationPreview.length,
			),
			reconciliation_items: input.reconciliationItems.length,
		},
		nextAction: graphNextAction,
		blockers: commonBlockers,
		data: {
			validation_reports: validationPreview,
			validation_isolation: input.validationIsolationRows.slice(0, 12),
			audit_evidence_refs: input.auditEvidenceRefs.slice(0, 12),
			content_proof_refs: input.contentProofRefs.slice(0, 12),
			traceability_gaps: traceabilityGaps.slice(0, 12),
		},
	});
	const runtimeLens = focusedGraphLens("runtime", {
		summary:
			"Artifact leases, waits, wake readiness, conflicts, and runtime coordination.",
		sourceRefs: runtimeSourceRefs,
		omittedCounts: {
			artifact_statuses: omittedCount(
				(input.claimState.artifact_statuses || []).length,
				runtimeArtifacts.length,
			),
		},
		nextAction: graphNextAction,
		blockers: commonBlockers.filter(
			(blocker) =>
				String(blocker.kind || "") === "runtime_coordination_conflict",
		),
		data: {
			active_claim_count: input.claimState.active_claim_count,
			warning_count: Number(input.claimState.warning_count || 0),
			conflict_count: Number(input.claimState.conflict_count || 0),
			waiting_count: Number(input.claimState.pending_waiter_count || 0),
			ready_waiter_count: Number(input.claimState.ready_waiter_count || 0),
			artifact_statuses: runtimeArtifacts,
		},
	});
	const automationReady =
		commonBlockers.length === 0 &&
		String(graphNextAction.kind || "observe") !== "decision";
	const automationLens = focusedGraphLens("automation-readiness", {
		summary:
			"Scheduling readiness, stop reasons, retry blockers, and promotion hints.",
		sourceRefs: unique([...taskSourceRefs, ...runtimeSourceRefs, ...validationSourceRefs]),
		omittedCounts: { ready_tasks: omittedCount(openTasks.length, 8) },
		nextAction: graphNextAction,
		blockers: commonBlockers,
		data: {
			ready: automationReady,
			ready_task_ids: automationReady
				? openTasks.slice(0, 8).map((task) => task.id)
				: [],
			blocked_task_ids: blockedTasks.map((task) => task.id),
			stop_reasons: commonBlockers.map((blocker) => blocker.kind),
			active_sprint_ids: input.activeSprintIds,
		},
	});
	const systemLens = focusedGraphLens("system", {
		summary: "System specs, diagram refs, and expansion refs for navigation.",
		sourceRefs: unique([
			".codewiki/kb/system/",
			...input.docPaths.filter((path) => path.includes("/system/")),
		]),
		omittedCounts: {
			system_docs: omittedCount(
				input.docPaths.filter((path) => path.includes("/system/")).length,
				12,
			),
		},
		nextAction: graphNextAction,
		data: {
			doc_paths: input.docPaths
				.filter((path) => path.includes("/system/"))
				.slice(0, 12),
			diagram_ref_count: input.diagramRefCount,
			diagram_parse_issue_count: input.diagramParseIssueCount,
		},
	});
	const productLens = focusedGraphLens("product", {
		summary: "Product docs and expansion refs for navigation.",
		sourceRefs: unique([
			".codewiki/kb/product/",
			...input.docPaths.filter((path) => path.includes("/product/")),
		]),
		omittedCounts: {
			product_docs: omittedCount(
				input.docPaths.filter((path) => path.includes("/product/")).length,
				12,
			),
		},
		nextAction: graphNextAction,
		data: {
			doc_paths: input.docPaths
				.filter((path) => path.includes("/product/"))
				.slice(0, 12),
		},
	});
	return {
		default: defaultLens,
		status: statusLens,
		resume: resumeLens,
		task: taskLens,
		sprint: sprintLens,
		validation: validationLens,
		runtime: runtimeLens,
		"automation-readiness": automationLens,
		system: systemLens,
		product: productLens,
		trace: {
			version: 1,
			id: "trace",
			source: "generated:graph-trace-lens",
			exact_refs: true,
			source_refs: graphSourceRefs.slice(0, 32),
			omitted_counts: {
				nodes: input.nodes.length,
				edges: input.edges.length,
				source_refs: omittedCount(graphSourceRefs.length, 32),
			},
			next_action: graphNextAction,
			next_safe_action: graphNextAction,
			blockers: commonBlockers,
			freshness: graphLensFreshness(graphSourceRefs),
			expansion_hints: graphLensExpansionHints("trace", graphSourceRefs),
			requirement_rows: input.traceabilityRows,
			semantic_execution_closure: input.semanticExecutionClosure,
			semantic_change_rows: input.semanticChangeRows,
			semantic_change_gaps: semanticGaps,
			canonical_source_refs: input.canonicalSourceRefs,
			build_refs: input.builds.map((build) => ({
				path: normalizeCodewikiRef(build.path),
				kind: build.kind,
				status: build.status || buildStatus(build),
				task_ids: buildTaskIds(build),
				source_refs: canonicalSourceRefsForBuild(build),
			})),
		},
		audit: {
			version: 1,
			id: "audit",
			source: "generated:graph-audit-lens",
			exact_refs: true,
			source_refs: validationSourceRefs.slice(0, 32),
			omitted_counts: {
				source_refs: omittedCount(validationSourceRefs.length, 32),
				validation_reports: omittedCount(
					input.validationAttestations.length,
					input.validationAttestations.length,
				),
			},
			next_action: graphNextAction,
			next_safe_action: graphNextAction,
			blockers: commonBlockers,
			freshness: graphLensFreshness(validationSourceRefs),
			expansion_hints: graphLensExpansionHints("validation", validationSourceRefs),
			validation_reports: input.validationAttestations,
			validation_isolation: input.validationIsolationRows,
			audit_evidence_refs: input.auditEvidenceRefs,
			content_proof_refs: input.contentProofRefs,
			reconciliation_items: input.reconciliationItems,
			traceability_gaps: traceabilityGaps,
			semantic_change_gaps: semanticGaps,
			semantic_execution_closure: input.semanticExecutionClosure,
			file_structure_drift: fileStructureAuditSummary,
		},
	};
}
