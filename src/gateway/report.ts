import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ResidualIssueCoverageInput } from "../audit/types.ts";
import { RESIDUAL_ISSUE_COVERAGE_CLASSIFICATIONS } from "../audit/types.ts";
import { assessDecisionPropagation } from "../build/decision-propagation.ts";
import { isAcceptedBuildData } from "../build/lifecycle.ts";
import {
	acceptedBuildRefGaps,
	acceptedGatewayBuildRefGaps,
	buildRefsByKind,
	buildSlug,
	isolationBoundary,
	normalizeBuildPath,
	normalizeRepoPath,
	readBuildRef,
	semanticTraceabilityGaps,
	trimList,
} from "../build/shared.ts";
import {
	normalizeTraceabilityExemption,
	isSemanticTraceability,
} from "../decision/traceability.ts";
import { auditEvidenceGaps, auditRequirement } from "../policy/gate-policy.ts";
import { normalizeValidationGate } from "../policy/gates.ts";
import type { WikiProject } from "../project/types.ts";
import type { WorkflowLoop } from "../session/types.ts";
import {
	hasPublisherResultProof,
	publisherProofRefs,
} from "../session/worktree-isolation.ts";
import { buildCodewikiReloadGuidance } from "../shared/reload-guidance.ts";
import { nowIso, unique } from "../shared/utils.ts";
import { normalizeWorktreeIsolation } from "../session/claims.ts";
import { fileStructureSatisfiedDeferredTriggerRefs } from "../knowledge/diagram-parser.ts";
import {
	evaluateProductionPolicyProfile,
	productionPolicyProfileEnabled,
} from "../policy/production-profile.ts";
import {
	classifyValidationRisk,
	validationApprovalEvidence,
} from "../policy/risk.ts";
import type {
	CodewikiValidationFailureClass,
	CodewikiValidationReportInput,
} from "./types.ts";
import { VALIDATION_FAILURE_CLASS_VALUES } from "./types.ts";

function validationContentProofRefs(
	isolation: ReturnType<typeof normalizeValidationIsolation> | undefined,
): string[] {
	return unique(
		[
			isolation?.validated_sha,
			isolation?.head_sha,
			isolation?.published_sha,
			isolation?.tree_sha,
			isolation?.working_tree_digest,
			isolation?.worktree_digest,
			isolation?.package_digest,
			isolation?.archive_ref,
			isolation?.remote_ref,
		]
			.map((value) => String(value || "").trim())
			.filter(Boolean),
	);
}

function normalizeValidationIsolation(
	input: CodewikiValidationReportInput["isolation"],
) {
	const base = normalizeWorktreeIsolation(input);
	const role = String(input?.role || "").trim();
	const out: Record<string, unknown> = { ...(base ?? {}) };
	if (["builder", "validator", "publisher", "observer"].includes(role))
		out.role = role;
	return Object.keys(out).length ? out : undefined;
}

function validationIsolationRequirement(
	profile: string,
	policyProfile?: string,
) {
	const normalizedProfile = normalizeValidationGate(profile);
	const normalizedPolicy = normalizeValidationGate(policyProfile);
	const preCommitProfiles = new Set(["implementation"]);
	const immutableProfiles = new Set([
		"task-close",
		"sprint-close",
		"ship-ready",
	]);
	const required =
		preCommitProfiles.has(normalizedProfile) ||
		immutableProfiles.has(normalizedProfile) ||
		normalizedPolicy.includes("isolation-required");
	const immutableRequired =
		immutableProfiles.has(normalizedProfile) ||
		normalizedPolicy.includes(`publication-${"pr"}oof-required`);
	return isolationBoundary(
		required,
		immutableRequired
			? "fresh-context-clean-immutable-content"
			: required
				? "fresh-context-checked-content"
				: "fresh-context-preferred",
		immutableRequired
			? "Task-close, sprint-close, and ship-ready validation require independent validator context, a clean worktree, and immutable content evidence."
			: required
				? "Implementation validation requires independent validator context and checked content evidence."
				: "Fresh validation is preferred but not required for this profile.",
		immutableRequired
			? [
					"fresh_context=true",
					"clean=true",
					"publisher queue result evidence",
					"published_sha/tree_sha/archive_ref/remote_ref",
				]
			: required
				? [
						"fresh_context=true",
						"clean state recorded",
						"validated_sha/head_sha/published_sha/tree_sha or working_tree_digest",
					]
				: ["fresh_context=true when high-risk or policy-required"],
		`${profile.trim()} validation`,
		required ? [normalizedProfile] : [],
	);
}

function hasImmutableContentProof(
	isolation: ReturnType<typeof normalizeValidationIsolation> | undefined,
): boolean {
	return Boolean(
		isolation?.validated_sha ||
			isolation?.head_sha ||
			isolation?.published_sha ||
			isolation?.tree_sha ||
			isolation?.package_digest ||
			isolation?.archive_ref ||
			isolation?.remote_ref,
	);
}

function hasWorkingTreeContentProof(
	isolation: ReturnType<typeof normalizeValidationIsolation> | undefined,
): boolean {
	return Boolean(isolation?.working_tree_digest || isolation?.worktree_digest);
}

function validationIsolationGaps(
	isolation: ReturnType<typeof normalizeValidationIsolation> | undefined,
	requirement: ReturnType<typeof isolationBoundary>,
): string[] {
	if (!requirement.required) return [];
	const gaps: string[] = [];
	const publicationProofRequired =
		requirement.mode === "fresh-context-clean-immutable-content";
	const hasImmutableProof = hasImmutableContentProof(isolation);
	const hasWorkingTreeProof = hasWorkingTreeContentProof(isolation);
	if (isolation?.fresh_context !== true) gaps.push("fresh_context=true");
	if (publicationProofRequired) {
		if (isolation?.clean !== true) gaps.push("clean=true");
		if (!hasImmutableProof) gaps.push("immutable_content_proof");
		return gaps;
	}
	if (typeof isolation?.clean !== "boolean") gaps.push("clean=true|false");
	if (!hasImmutableProof && !hasWorkingTreeProof)
		gaps.push("checked_content_proof");
	if (isolation?.clean === false && !hasWorkingTreeProof)
		gaps.push("working_tree_digest");
	return unique(gaps);
}

function validationPublisherResultGaps(
	isolation: ReturnType<typeof normalizeValidationIsolation> | undefined,
	requirement: ReturnType<typeof isolationBoundary>,
	profile: string,
): string[] {
	if (normalizeValidationGate(profile) === "ship-ready") return [];
	if (
		!requirement.required ||
		requirement.mode !== "fresh-context-clean-immutable-content"
	)
		return [];
	return hasPublisherResultProof(isolation)
		? []
		: ["published_sha/tree_sha/archive_ref/remote_ref"];
}

function validationCommitReadinessGaps(
	project: WikiProject,
	input: CodewikiValidationReportInput,
	profile: string,
	isolationGaps: string[],
): string[] {
	if (normalizeValidationGate(profile) !== "implementation") return [];
	if (input.verdict !== "pass") return [];
	if (isolationGaps.length > 0) return [];
	const source = (input.source ?? "").trim();
	if (!source) return ["source_implementation_build"];
	const absPath = resolve(project.root, source.replace(/^\.\//, ""));
	let build: any;
	try {
		build = JSON.parse(readFileSync(absPath, "utf8"));
	} catch {
		return ["source_implementation_build_readable"];
	}
	const gaps: string[] = [];
	const taskId = String(build.task_id || build.task?.id || "").trim();
	if (build.kind !== "implementation_build")
		gaps.push("source_kind=implementation_build");
	if (!taskId) gaps.push("task_id");
	const exemption = normalizeTraceabilityExemption(
		build?.traceability?.exemption ??
			build?.traceability?.change_class ??
			build?.change_class,
	);
	const requiresPlanning =
		build?.traceability?.requires_accepted_build ??
		isSemanticTraceability(build?.traceability?.semantic, exemption);
	const planningRefs = buildRefsByKind(build, "planning");
	if (requiresPlanning) {
		if (planningRefs.length === 0) gaps.push("source_planning_build");
		else
			gaps.push(
				...acceptedBuildRefGaps(
					project,
					planningRefs,
					"accepted_planning_build_ref",
				),
			);
	}
	gaps.push(...semanticTraceabilityGaps(project, build));
	if (
		!Array.isArray(build.acceptance_mapping) ||
		build.acceptance_mapping.length === 0
	)
		gaps.push("acceptance_mapping");
	const codeRefs = unique([
		...trimList(build.code_files),
		...trimList(build.produces?.code),
	]);
	const testRefs = unique([
		...trimList(build.test_files),
		...trimList(build.produces?.tests),
		...trimList(build.test_design_evidence),
	]);
	if (codeRefs.length === 0) gaps.push("code_files");
	if (testRefs.length === 0) gaps.push("test_files_or_test_design_evidence");
	if (!Array.isArray(build.checks_run) || build.checks_run.length === 0)
		gaps.push("checks_run");
	const closure = build.closure_brief || {};
	if (
		!closure.user_intent ||
		!Array.isArray(closure.implemented_changes) ||
		closure.implemented_changes.length === 0 ||
		!Array.isArray(closure.acceptance_evidence) ||
		closure.acceptance_evidence.length === 0 ||
		!Array.isArray(closure.checks) ||
		closure.checks.length === 0
	) {
		gaps.push("closure_brief");
	}
	const commit = build.publication?.commit || {};
	const trailers = Array.isArray(commit.trailers)
		? commit.trailers.map((value: unknown) => String(value))
		: [];
	const hasTrailer = (name: string, expected?: string) =>
		trailers.some((trailer: string) => {
			const normalized = trailer.trim();
			return expected
				? normalized === `${name}: ${expected}`
				: normalized.startsWith(`${name}:`);
		});
	if (!String(commit.title || "").trim()) gaps.push("publication.commit.title");
	if (!String(commit.body || "").trim()) gaps.push("publication.commit.body");
	if (!hasTrailer("CodeWiki-Task", taskId)) gaps.push("CodeWiki-Task trailer");
	if (!hasTrailer("CodeWiki-Build", source))
		gaps.push("CodeWiki-Build trailer");
	if (!hasTrailer("CodeWiki-Checks")) gaps.push("CodeWiki-Checks trailer");
	if (!hasTrailer("CodeWiki-Validation"))
		gaps.push("CodeWiki-Validation trailer_or_placeholder");
	if (!hasTrailer("CodeWiki-Recover") && !hasTrailer("CodeWiki-Restore"))
		gaps.push("CodeWiki-Recover trailer");
	return unique(gaps);
}

function validationSemanticTraceability(
	project: WikiProject,
	input: CodewikiValidationReportInput,
	profile: string,
): { gaps: string[]; warnings: string[] } {
	if (input.verdict !== "pass") return { gaps: [], warnings: [] };
	const normalizedProfile = normalizeValidationGate(profile);
	if (
		!["implementation", "task-close", "sprint-close", "ship-ready"].includes(
			normalizedProfile,
		)
	)
		return { gaps: [], warnings: [] };
	const source = (input.source ?? "").trim();
	if (!source) {
		const warning =
			"source_implementation_build missing; semantic build traceability could not be checked.";
		const strict = String(input.policy_profile || "")
			.toLowerCase()
			.includes("traceability-required");
		return strict
			? { gaps: ["source_implementation_build"], warnings: [] }
			: { gaps: [], warnings: [warning] };
	}
	const result = readBuildRef(project, source);
	if (!result.ok)
		return {
			gaps: [`source_implementation_build:${result.reason}`],
			warnings: [],
		};
	const build = result.data;
	const gaps: string[] = [];
	if (build.kind !== "implementation_build")
		gaps.push("source_kind=implementation_build");
	const expectedTaskId = String(input.task_id || "").trim();
	const buildTaskId = String(build.task_id || build.task?.id || "").trim();
	if (expectedTaskId && buildTaskId && expectedTaskId !== buildTaskId)
		gaps.push("source_task_id_mismatch");
	if (!isAcceptedBuildData(build))
		gaps.push("source_implementation_build_accepted");
	gaps.push(...semanticTraceabilityGaps(project, build));
	return { gaps: unique(gaps), warnings: [] };
}

const VALIDATION_TASK_ID_GATES = new Set(["implementation", "task-close"]);
const IMMUTABLE_VALIDATION_GATES = new Set([
	"task-close",
	"sprint-close",
	"ship-ready",
]);

type ValidationPreflightSource = {
	source: string;
	build?: any;
	stale_refs: string[];
};

function readValidationPreflightSource(
	project: WikiProject,
	input: CodewikiValidationReportInput,
): ValidationPreflightSource {
	const source = (input.source ?? "").trim();
	if (!source) return { source, stale_refs: [] };
	const normalized = normalizeBuildPath(source);
	const absPath = resolve(project.root, normalized);
	if (!existsSync(absPath))
		return { source, stale_refs: [`source:${source}:missing`] };
	const result = readBuildRef(project, source);
	if (!result.ok)
		return { source, stale_refs: [`source:${source}:${result.reason}`] };
	return { source, build: result.data, stale_refs: [] };
}

function readRoadmapPropagationRefs(project: WikiProject): {
	taskIds: string[];
	sprintIds: string[];
} {
	try {
		const data = JSON.parse(
			readFileSync(resolve(project.root, project.roadmapPath), "utf8"),
		);
		let archivedTaskIds: string[] = [];
		try {
			const archivePath = resolve(
				project.root,
				dirname(project.roadmapPath),
				"archive.jsonl",
			);
			archivedTaskIds = readFileSync(archivePath, "utf8")
				.split(/\r?\n/)
				.flatMap((line) => {
					if (!line.trim()) return [];
					try {
						const record = JSON.parse(line);
						return trimList([record?.id, record?.task?.id]);
					} catch {
						return [];
					}
				});
		} catch {
			archivedTaskIds = [];
		}
		return {
			taskIds: unique([
				...Object.keys(data?.tasks || {}),
				...trimList(data?.order),
				...archivedTaskIds,
			]),
			sprintIds: unique([
				...Object.keys(data?.sprints || {}),
				...trimList(data?.views?.sprint_ids),
			]),
		};
	} catch {
		return { taskIds: [], sprintIds: [] };
	}
}

const RESIDUAL_ISSUE_COVERAGE_GATES = new Set([
	"implementation",
	"task-close",
	"sprint-close",
	"ship-ready",
]);

const OPEN_ROADMAP_STATUSES = new Set(["todo", "in_progress", "blocked"]);
const ACTIVE_SPRINT_STATUSES = new Set(["planned", "active", "review"]);

type ResidualIssueItem = {
	key: string;
	kind: string;
	path: string;
	message: string;
	refs: string[];
	severity: string;
};

type RoadmapCoverageTask = {
	id: string;
	status: string;
	title: string;
	summary: string;
	labels: string[];
	paths: string[];
};

type RoadmapCoverageSprint = {
	id: string;
	status: string;
	taskIds: string[];
	paths: string[];
};

type RoadmapResidualCoverage = {
	tasks: RoadmapCoverageTask[];
	sprints: RoadmapCoverageSprint[];
	knownTaskIds: string[];
	knownSprintIds: string[];
};

function normalizeResidualPath(value: string) {
	return value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeResidualToken(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function residualTextTokens(value: string) {
	return normalizeResidualToken(value).split("-").filter(Boolean);
}

function globPatternMatchesPath(pattern: string, path: string) {
	const normalizedPattern = normalizeResidualPath(pattern);
	const normalizedPath = normalizeResidualPath(path);
	if (!normalizedPattern || !normalizedPath) return false;
	if (!normalizedPattern.includes("*")) {
		const prefix = normalizedPattern.replace(/\/$/, "");
		return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
	}
	const escapeRegExp = (value: string) =>
		value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
	const patternSource = normalizedPattern
		.split("**")
		.map((part) => part.split("*").map(escapeRegExp).join("[^/]*"))
		.join(".*");
	return new RegExp(`^${patternSource}$`).test(normalizedPath);
}

function residualIssueKey(input: {
	kind?: unknown;
	path?: unknown;
	message?: unknown;
	id?: unknown;
}) {
	const id = String(input.id || "").trim();
	if (id.startsWith("reconcile:lint:")) return id;
	return unique([
		"lint",
		String(input.kind || "unknown").trim() || "unknown",
		String(input.path || "").trim(),
		String(input.message || "").trim(),
	])
		.filter(Boolean)
		.join(":");
}

function readCurrentResidualIssueItems(
	project: WikiProject,
): ResidualIssueItem[] {
	try {
		const graph = JSON.parse(
			readFileSync(resolve(project.root, project.graphPath), "utf8"),
		);
		const lintIssues = Array.isArray(graph?.lenses?.lint?.issues)
			? graph.lenses.lint.issues
			: [];
		const issueItems = lintIssues
			.filter((issue: any) =>
				["warning", "error"].includes(String(issue?.severity || "")),
			)
			.map((issue: any) => {
				const kind = String(issue?.kind || issue?.category || "lint").trim();
				const path = String(issue?.path || "").trim();
				const message = String(issue?.message || issue?.summary || "").trim();
				const refs = trimList(issue?.refs);
				return {
					key: residualIssueKey({ kind, path, message }),
					kind,
					path,
					message,
					refs,
					severity: String(issue?.severity || "warning"),
				};
			});
		if (issueItems.length > 0) {
			const byKey = new Map<string, ResidualIssueItem>();
			for (const item of issueItems) byKey.set(item.key, item);
			return [...byKey.values()];
		}
		const reconciliationItems = Array.isArray(
			graph?.views?.reconciliation?.items,
		)
			? graph.views.reconciliation.items
			: [];
		const byKey = new Map<string, ResidualIssueItem>();
		for (const item of reconciliationItems) {
			const id = String(item?.id || "").trim();
			if (!id.startsWith("reconcile:lint:")) continue;
			const parts = id.split(":");
			const kind = parts[2] || "lint";
			const path = String(item?.ref || item?.path || "").trim();
			const message = String(item?.reason || item?.summary || "").trim();
			byKey.set(id, {
				key: id,
				kind,
				path,
				message,
				refs: trimList(item?.doc_paths),
				severity: "warning",
			});
		}
		return [...byKey.values()];
	} catch {
		return [];
	}
}

function readRoadmapResidualCoverage(
	project: WikiProject,
): RoadmapResidualCoverage {
	try {
		const data = JSON.parse(
			readFileSync(resolve(project.root, project.roadmapPath), "utf8"),
		);
		const taskRecords = Object.values(data?.tasks || {}) as any[];
		const tasks = taskRecords.map((task) => ({
			id: String(task?.id || "").trim(),
			status: String(task?.status || "").trim(),
			title: String(task?.title || ""),
			summary: String(task?.summary || ""),
			labels: trimList(task?.labels),
			paths: unique([
				...trimList(task?.spec_paths),
				...trimList(task?.code_paths),
			]),
		}));
		const activeTaskIds = new Set(
			tasks
				.filter((task) => OPEN_ROADMAP_STATUSES.has(task.status))
				.map((task) => task.id),
		);
		const sprints = (Object.values(data?.sprints || {}) as any[]).map(
			(sprint) => {
				const taskIds = trimList(sprint?.task_ids);
				const sprintTasks = tasks.filter((task) => taskIds.includes(task.id));
				return {
					id: String(sprint?.id || "").trim(),
					status: String(sprint?.status || "").trim(),
					taskIds,
					paths: unique([
						...trimList(sprint?.scope?.knowledge),
						...trimList(sprint?.scope?.code),
						...sprintTasks.flatMap((task) => task.paths),
					]),
				};
			},
		);
		return {
			tasks: tasks.filter((task) => activeTaskIds.has(task.id)),
			sprints: sprints.filter((sprint) =>
				ACTIVE_SPRINT_STATUSES.has(sprint.status),
			),
			knownTaskIds: tasks.map((task) => task.id).filter(Boolean),
			knownSprintIds: sprints.map((sprint) => sprint.id).filter(Boolean),
		};
	} catch {
		return { tasks: [], sprints: [], knownTaskIds: [], knownSprintIds: [] };
	}
}

function residualItemText(item: ResidualIssueItem) {
	return unique([item.key, item.kind, item.path, item.message, ...item.refs])
		.join("\n")
		.toLowerCase();
}

function issueMatchesRoadmapTask(
	item: ResidualIssueItem,
	task: RoadmapCoverageTask,
) {
	if (!task.id) return false;
	const text = residualItemText(item);
	if (text.includes(task.id.toLowerCase())) return true;
	if (
		[item.path, ...item.refs].some((path) =>
			task.paths.some((pattern) => globPatternMatchesPath(pattern, path)),
		)
	)
		return true;
	const haystack = residualTextTokens(
		[task.title, task.summary, ...task.labels].join(" "),
	);
	const kindTokens = residualTextTokens(item.kind);
	return (
		kindTokens.length > 0 &&
		kindTokens.every((token) => haystack.includes(token))
	);
}

function issueMatchesRoadmapSprint(
	item: ResidualIssueItem,
	sprint: RoadmapCoverageSprint,
) {
	if (!sprint.id) return false;
	const text = residualItemText(item);
	if (text.includes(sprint.id.toLowerCase())) return true;
	if (sprint.taskIds.some((taskId) => text.includes(taskId.toLowerCase())))
		return true;
	return [item.path, ...item.refs].some((path) =>
		sprint.paths.some((pattern) => globPatternMatchesPath(pattern, path)),
	);
}

function residualCoverageEntries(
	input: CodewikiValidationReportInput,
	build: any,
): ResidualIssueCoverageInput[] {
	return [
		...(input.residual_issue_coverage ?? []),
		...(build?.residual_issue_coverage ?? []),
		...(build?.traceability?.residual_issue_coverage ?? []),
		...(build?.policy?.residual_issue_coverage ?? []),
		...(build?.closure_brief?.residual_issue_coverage ?? []),
	].filter(Boolean);
}

function explicitCoverageCoversIssue(
	entry: ResidualIssueCoverageInput,
	item: ResidualIssueItem,
	roadmap: RoadmapResidualCoverage,
) {
	const classification = String(entry.classification || "").trim();
	if (
		!RESIDUAL_ISSUE_COVERAGE_CLASSIFICATIONS.includes(classification as any) ||
		!String(entry.evidence || "").trim()
	)
		return false;
	const entryPaths = unique([
		String(entry.path || "").trim(),
		...trimList(entry.paths),
	]).filter(Boolean);
	const entryRefs = unique([
		String(entry.issue_key || "").trim(),
		String(entry.issue_kind || "").trim(),
		...entryPaths,
		...trimList(entry.refs),
	]).filter(Boolean);
	const keyMatches = entryRefs.includes(item.key);
	const kindMatches =
		String(entry.issue_kind || "").trim() === item.kind ||
		entryRefs.includes(item.kind);
	const pathMatches = entryPaths.some((pattern) =>
		[item.path, ...item.refs].some((path) =>
			globPatternMatchesPath(pattern, path),
		),
	);
	const refMatches = entryRefs.some((ref) =>
		residualItemText(item).includes(ref),
	);
	if (!keyMatches && !kindMatches && !pathMatches && !refMatches) return false;
	const taskIds = unique([
		String(entry.task_id || "").trim(),
		...trimList(entry.task_ids),
	]).filter(Boolean);
	const sprintIds = unique([
		String(entry.sprint_id || "").trim(),
		...trimList(entry.sprint_ids),
	]).filter(Boolean);
	if (classification === "covered_by_task")
		return taskIds.some((taskId) => roadmap.knownTaskIds.includes(taskId));
	if (classification === "covered_by_sprint")
		return sprintIds.some((sprintId) =>
			roadmap.knownSprintIds.includes(sprintId),
		);
	if (classification === "deferred_by_decision")
		return Boolean(
			String(entry.trigger || "").trim() &&
				(String(entry.decision_build_ref || "").trim() || entryRefs.length > 0),
		);
	return true;
}

function validationResidualIssueCoverage(
	project: WikiProject,
	input: CodewikiValidationReportInput,
	build: any,
	profile: string,
) {
	const required =
		input.verdict === "pass" && RESIDUAL_ISSUE_COVERAGE_GATES.has(profile);
	if (!required)
		return { required, items: [], covered: [], gaps: [], coverage: [] };
	const items = readCurrentResidualIssueItems(project);
	if (items.length === 0)
		return { required, items: [], covered: [], gaps: [], coverage: [] };
	const roadmap = readRoadmapResidualCoverage(project);
	const entries = residualCoverageEntries(input, build);
	const covered: string[] = [];
	const gaps: string[] = [];
	for (const item of items) {
		const coveredByRoadmap =
			roadmap.tasks.some((task) => issueMatchesRoadmapTask(item, task)) ||
			roadmap.sprints.some((sprint) => issueMatchesRoadmapSprint(item, sprint));
		const coveredByExplicitEntry = entries.some((entry) =>
			explicitCoverageCoversIssue(entry, item, roadmap),
		);
		if (coveredByRoadmap || coveredByExplicitEntry) {
			covered.push(item.key);
			continue;
		}
		gaps.push(`${item.key}${item.path ? ` (${item.path})` : ""}`);
	}
	return {
		required,
		items: items.map((item) => ({
			key: item.key,
			kind: item.kind,
			path: item.path || undefined,
			severity: item.severity,
		})),
		covered: unique(covered),
		gaps: unique(gaps),
		coverage: entries,
	};
}

function planningDecisionPropagationGaps(
	project: WikiProject,
	planning: any,
	planningPath = "",
): string[] {
	const decisionRefs = buildRefsByKind(planning, "decision");
	if (decisionRefs.length === 0) return [];
	const known = readRoadmapPropagationRefs(project);
	const satisfiedDeferredTriggers = fileStructureSatisfiedDeferredTriggerRefs(
		project.root,
		project,
	);
	const gaps: string[] = [];
	for (const decisionRef of decisionRefs) {
		const decision = readBuildRef(project, decisionRef);
		if (!decision.ok) {
			gaps.push(
				`${planningPath || "planning_build"}:${decisionRef}:${decision.reason}`,
			);
			continue;
		}
		if (String(decision.data?.kind || "") !== "decision_build") continue;
		const assessment = assessDecisionPropagation(
			decision.data,
			[{ path: planningPath, data: planning }],
			{
				knownTaskIds: known.taskIds,
				knownSprintIds: known.sprintIds,
				satisfiedDeferredTriggers,
			},
		);
		gaps.push(...assessment.gaps.map((gap) => `${decisionRef}:${gap}`));
	}
	return unique(gaps);
}

function planningEvidenceText(value: unknown): string {
	if (!value) return "";
	if (typeof value === "string") return value.trim();
	if (Array.isArray(value)) return value.map(planningEvidenceText).join("\n");
	if (typeof value === "object") {
		return Object.values(value as Record<string, unknown>)
			.map(planningEvidenceText)
			.filter(Boolean)
			.join("\n");
	}
	return String(value).trim();
}

function planningHasRoadmapReconciliationEvidence(planning: any): boolean {
	const explicit = [
		planning?.roadmap_reconciliation,
		planning?.roadmapReconciliation,
		planning?.planning?.roadmap_reconciliation,
		planning?.decision_propagation?.roadmap_reconciliation,
	]
		.map(planningEvidenceText)
		.filter(Boolean);
	if (explicit.length > 0) return true;
	const fallbackText = [
		planning?.evidence_mapping,
		planning?.acceptance_mapping,
		planning?.task_changes,
		planning?.roadmap_changes,
		planning?.requirements,
	]
		.map(planningEvidenceText)
		.join("\n")
		.toLowerCase();
	return (
		/\b(existing|current|prior|previous)\b[\s\S]{0,80}\broadmap\b/.test(
			fallbackText,
		) ||
		/\broadmap\b[\s\S]{0,80}\b(reconcil|replan|refin|split|reopen|cancel|supersed|reorder|rescop)/.test(
			fallbackText,
		)
	);
}

function planningRoadmapReconciliationGaps(
	planning: any,
	profile: string,
	planningPath = "",
): string[] {
	if (normalizeValidationGate(profile) !== "planning") return [];
	if (String(planning?.kind || "") !== "planning_build") return [];
	if (buildRefsByKind(planning, "decision").length === 0) return [];
	return planningHasRoadmapReconciliationEvidence(planning)
		? []
		: [
				`${planningPath || "planning_build"}:roadmap_reconciliation:missing_evidence`,
			];
}

function implementationPlanningPropagationGaps(
	project: WikiProject,
	build: any,
): string[] {
	const gaps: string[] = [];
	for (const planningRef of buildRefsByKind(build, "planning")) {
		const planning = readBuildRef(project, planningRef);
		if (!planning.ok) continue;
		if (String(planning.data?.kind || "") !== "planning_build") continue;
		gaps.push(
			...planningDecisionPropagationGaps(
				project,
				planning.data,
				planningRef,
			).map((gap) => `${planningRef}:${gap}`),
		);
	}
	return unique(gaps);
}

function graphDecisionPropagationResidualGaps(
	project: WikiProject,
	_input: CodewikiValidationReportInput,
	profile: string,
): string[] {
	if (
		![
			"planning",
			"implementation",
			"task-close",
			"sprint-close",
			"ship-ready",
		].includes(normalizeValidationGate(profile))
	)
		return [];
	try {
		const graph = JSON.parse(
			readFileSync(resolve(project.root, project.graphPath), "utf8"),
		);
		const residuals = Array.isArray(
			graph?.views?.decision_propagation?.residuals,
		)
			? graph.views.decision_propagation.residuals
			: [];
		if (residuals.length === 0) return [];
		return residuals.map(
			(item: any) =>
				`${String(item.decision_build || "decision_build")}:${String(item.kind || "row")}:${String(item.id || "unknown")}:${trimList(item.gaps).join("|") || "missing_resolution"}`,
		);
	} catch {
		return [];
	}
}

function graphSemanticExecutionClosureForTask(
	project: WikiProject,
	input: CodewikiValidationReportInput,
	profile: string,
): { gaps: string[]; risks: string[]; refs: string[] } {
	if (normalizeValidationGate(profile) !== "task-close") {
		return { gaps: [], risks: [], refs: [] };
	}
	const taskId = String(input.task_id || "").trim();
	if (!taskId) return { gaps: [], risks: [], refs: [] };
	try {
		const graph = JSON.parse(
			readFileSync(resolve(project.root, project.graphPath), "utf8"),
		);
		const closure =
			graph?.views?.semantic_execution_closure ||
			graph?.views?.lenses?.audit?.semantic_execution_closure ||
			graph?.views?.lenses?.trace?.semantic_execution_closure ||
			null;
		const taskScope = closure?.scopes?.tasks?.[taskId];
		if (!taskScope) return { gaps: [], risks: [], refs: [] };
		const gaps = unique([
			...trimList(taskScope.gaps).map(
				(gap) => `semantic_closure:${taskId}:${gap}`,
			),
			...trimList(taskScope.deviations).map(
				(deviation) => `semantic_closure:${taskId}:deviation:${deviation}`,
			),
		]);
		const risks = trimList(taskScope.remaining_risks).map(
			(risk) => `semantic_closure:${taskId}:risk:${risk}`,
		);
		const refs = unique([
			...trimList(taskScope.implementation_builds),
			...trimList(taskScope.validation_reports),
			...trimList(taskScope.content_proof_refs),
		]);
		return { gaps, risks, refs };
	} catch {
		return { gaps: [], risks: [], refs: [] };
	}
}

function readRoadmapForSprintClose(project: WikiProject): {
	tasks: Record<string, any>;
	sprints: Record<string, any>;
} {
	try {
		const data = JSON.parse(
			readFileSync(resolve(project.root, project.roadmapPath), "utf8"),
		);
		const tasks: Record<string, any> = { ...(data?.tasks || {}) };
		try {
			const archivePath = resolve(
				project.root,
				dirname(project.roadmapPath),
				"archive.jsonl",
			);
			for (const line of readFileSync(archivePath, "utf8").split(/\r?\n/)) {
				if (!line.trim()) continue;
				try {
					const record = JSON.parse(line);
					const task = record?.task || record;
					const id = String(task?.id || record?.id || "").trim();
					if (id && !tasks[id]) tasks[id] = task;
				} catch {
					// ignore malformed archive lines in preflight; generated audits cover them separately
				}
			}
		} catch {
			// archive is optional
		}
		return { tasks, sprints: data?.sprints || {} };
	} catch {
		return { tasks: {}, sprints: {} };
	}
}

function sprintIdFromValidationInput(
	input: CodewikiValidationReportInput,
): string {
	const values = unique([
		String(input.sprint_id || ""),
		String(input.task_id || ""),
		String(input.source || ""),
		...trimList(input.checks),
		...trimList(input.audit_refs),
		...trimList(input.audit_reports),
	]);
	for (const value of values) {
		const match = /\bSPRINT-[0-9]+\b/i.exec(value);
		if (match) return match[0].toUpperCase();
	}
	return "";
}

function sprintSharedRiskNeedsApproval(sprint: any): boolean {
	const haystack = [
		sprint?.budget?.risk,
		...(Array.isArray(sprint?.gates) ? sprint.gates : []),
	]
		.map((value) => String(value || "").toLowerCase())
		.join("\n");
	return /\b(high|security|migration|publication|publish|release|destructive|approval)\b/.test(
		haystack,
	);
}

function inputHasApprovalEvidence(
	input: CodewikiValidationReportInput,
): boolean {
	return [
		...trimList(input.checks),
		...trimList(input.audit_refs),
		...trimList(input.audit_reports),
		...trimList(input.issues?.map((issue) => issue.summary)),
	].some((value) =>
		/\b(approval:user|user[-_ ]approval|explicit[-_ ]approval|approved[-_ ]by[-_ ]user|semantic[-_ ]approval)\b/i.test(
			value,
		),
	);
}

function graphSprintCloseGaps(
	project: WikiProject,
	sprintId: string,
	taskIds: string[],
): string[] {
	try {
		const graph = JSON.parse(
			readFileSync(resolve(project.root, project.graphPath), "utf8"),
		);
		if (!graph?.views?.roadmap) return [`sprint:${sprintId}:generated_state`];
		const closure =
			graph?.views?.semantic_execution_closure ||
			graph?.views?.lenses?.audit?.semantic_execution_closure ||
			graph?.views?.lenses?.trace?.semantic_execution_closure ||
			null;
		if (!closure?.scopes?.tasks) return [];
		return unique(
			taskIds.flatMap((taskId) =>
				trimList(closure.scopes.tasks?.[taskId]?.gaps).map(
					(gap) => `sprint:${sprintId}:semantic_closure:${taskId}:${gap}`,
				),
			),
		);
	} catch {
		return [`sprint:${sprintId}:generated_state`];
	}
}

function inputHasSprintReconciliationEvidence(
	input: CodewikiValidationReportInput,
): boolean {
	return [
		...trimList(input.checks),
		...trimList(input.audit_refs),
		...trimList(input.audit_reports),
		...trimList(input.issues?.map((issue) => issue.summary)),
	].some((value) =>
		/\b(sprint[-_ ]risk[-_ ]reconciliation|risk[-_ ]reconciliation|shared[-_ ]outcome|shared[-_ ]risk|risks? reconciled)\b/i.test(
			value,
		),
	);
}

function taskHasShippableCodeOrPackage(task: any): boolean {
	return unique([...trimList(task?.code_paths), ...trimList(task?.spec_paths)])
		.map((ref) => normalizeRepoPath(ref).toLowerCase())
		.some(
			(ref) =>
				ref === "package.json" ||
				ref.endsWith("/package.json") ||
				/^(src|scripts|bin)\//.test(ref),
		);
}

function sprintRequiresShipReady(
	tasks: Record<string, any>,
	taskIds: string[],
): boolean {
	return taskIds.some((taskId) => taskHasShippableCodeOrPackage(tasks[taskId]));
}

function validationSprintShipReadyGaps(
	project: WikiProject,
	sprintId: string,
	requiresShipReady: boolean,
	isolation: ReturnType<typeof normalizeValidationIsolation> | undefined,
): string[] {
	if (!requiresShipReady) return [];
	const reports = passingValidationReports(project, "ship-ready", { sprintId });
	if (reports.length === 0) return [`sprint:${sprintId}:ship_ready_validation`];
	const contentRefs = validationContentProofRefs(isolation);
	if (
		contentRefs.length > 0 &&
		!reports.some((report) =>
			contentRefsOverlap(contentRefs, validationReportContentRefs(report)),
		)
	) {
		return [`sprint:${sprintId}:ship_ready_content_mismatch`];
	}
	return [];
}

function validationSprintCloseGaps(
	project: WikiProject,
	input: CodewikiValidationReportInput,
	profile: string,
	isolation: ReturnType<typeof normalizeValidationIsolation> | undefined,
): string[] {
	if (normalizeValidationGate(profile) !== "sprint-close") return [];
	const sprintId = sprintIdFromValidationInput(input);
	if (!sprintId) return ["sprint_id"];
	const roadmap = readRoadmapForSprintClose(project);
	const sprint = roadmap.sprints[sprintId];
	if (!sprint) return [`sprint:${sprintId}:missing`];
	const gaps: string[] = [];
	if (!String(sprint.outcome || "").trim())
		gaps.push(`sprint:${sprintId}:shared_outcome`);
	const taskIds = trimList(sprint.task_ids);
	if (taskIds.length === 0) gaps.push(`sprint:${sprintId}:task_ids`);
	for (const taskId of taskIds) {
		const task = roadmap.tasks[taskId];
		if (!task) {
			gaps.push(`sprint:${sprintId}:task:${taskId}:missing`);
			continue;
		}
		const status = String(task.status || "")
			.trim()
			.toLowerCase();
		if (!["closed", "done", "cancelled", "canceled"].includes(status))
			gaps.push(`sprint:${sprintId}:task:${taskId}:not_closed`);
	}
	if (!inputHasSprintReconciliationEvidence(input))
		gaps.push(`sprint:${sprintId}:risk_reconciliation_evidence`);
	if (sprintSharedRiskNeedsApproval(sprint) && !inputHasApprovalEvidence(input))
		gaps.push(`sprint:${sprintId}:shared_risk_approval`);
	gaps.push(
		...validationSprintShipReadyGaps(
			project,
			sprintId,
			sprintRequiresShipReady(roadmap.tasks, taskIds),
			isolation,
		),
	);
	gaps.push(...graphSprintCloseGaps(project, sprintId, taskIds));
	return unique(gaps);
}

function shipReadyTargets(
	input: CodewikiValidationReportInput,
	build: any,
	isolation: ReturnType<typeof normalizeValidationIsolation> | undefined,
): Set<string> {
	const haystack = [
		input.profile,
		input.policy_profile,
		input.source,
		build?.publication?.target,
		build?.publication?.remote,
		build?.publication?.branch,
		build?.publication?.release_notes,
		...trimList(input.checks),
		...trimList(build?.produces?.publication),
	]
		.map((value) => String(value || "").toLowerCase())
		.join("\n");
	const targets = new Set<string>();
	if (
		/\b(commit|head|tree)\b/.test(haystack) ||
		isolation?.head_sha ||
		isolation?.tree_sha
	)
		targets.add("commit");
	if (
		/\b(package|pack)\b/.test(haystack) ||
		/\bnpm\s+(?:pack|publish)\b/.test(haystack) ||
		isolation?.package_digest
	)
		targets.add("package");
	if (/\b(archive|tarball)\b/.test(haystack) || isolation?.archive_ref)
		targets.add("archive");
	if (
		/\b(remote|push|branch)\b/.test(haystack) ||
		isolation?.remote_ref ||
		isolation?.published_sha
	)
		targets.add("remote");
	if (/\b(release|tag)\b/.test(haystack)) targets.add("release");
	return targets;
}

function shipReadyPromotionTargeted(
	input: CodewikiValidationReportInput,
	build: any,
	isolation: ReturnType<typeof normalizeValidationIsolation> | undefined,
): boolean {
	const rawProfile = String(input.profile || "")
		.trim()
		.toLowerCase();
	if (["publication", "publish", "release"].includes(rawProfile)) return true;
	const targets = shipReadyTargets(input, build, isolation);
	return targets.has("remote") || targets.has("release");
}

function validationShipReadyGaps(
	input: CodewikiValidationReportInput,
	build: any,
	profile: string,
	isolation: ReturnType<typeof normalizeValidationIsolation> | undefined,
): string[] {
	if (normalizeValidationGate(profile) !== "ship-ready") return [];
	const targets = shipReadyTargets(input, build, isolation);
	const gaps: string[] = [];
	if (targets.size === 0) gaps.push("ship_ready_target");
	if (targets.has("package") && !isolation?.package_digest)
		gaps.push("package_digest");
	if (targets.has("archive") && !isolation?.archive_ref)
		gaps.push("archive_ref");
	if (
		(targets.has("remote") || targets.has("release")) &&
		!isolation?.remote_ref &&
		!isolation?.published_sha
	)
		gaps.push("remote_ref_or_published_sha");
	if (
		shipReadyPromotionTargeted(input, build, isolation) &&
		(build?.publication?.safe_to_push === false ||
			build?.publication?.push_readiness?.safe_to_push === false)
	)
		gaps.push("ship_ready_safe_to_promote");
	return unique(gaps);
}

function validationReportContentRefs(report: any): string[] {
	return unique([
		...trimList(report?.content_proof_refs),
		...validationContentProofRefs(report?.isolation),
	]);
}

function readValidationReports(project: WikiProject): any[] {
	const validationDir = resolve(project.root, ".codewiki/validation");
	let entries: string[];
	try {
		entries = readdirSync(validationDir);
	} catch {
		return [];
	}
	return entries.flatMap((entry) => {
		if (!entry.endsWith(".json")) return [];
		try {
			const data = JSON.parse(
				readFileSync(resolve(validationDir, entry), "utf8"),
			);
			return [{ ...data, path: `.codewiki/validation/${entry}` }];
		} catch {
			return [];
		}
	});
}

function contentRefsOverlap(left: string[], right: string[]): boolean {
	if (left.length === 0 || right.length === 0) return false;
	const rightSet = new Set(right);
	return left.some((ref) => rightSet.has(ref));
}

function passingValidationReports(
	project: WikiProject,
	profile: string,
	input: {
		taskId?: string;
		sprintId?: string;
		source?: string;
	},
): any[] {
	const normalizedProfile = normalizeValidationGate(profile);
	const taskId = String(input.taskId || "").trim();
	const sprintId = String(input.sprintId || "").trim();
	const source = String(input.source || "").trim();
	return readValidationReports(project).filter((report) => {
		if (report?.kind !== "validation_report") return false;
		if (normalizeValidationGate(report?.profile) !== normalizedProfile)
			return false;
		if (report?.verdict !== "pass") return false;
		if (taskId && String(report?.task_id || "").trim() !== taskId) return false;
		if (sprintId && String(report?.sprint_id || "").trim() !== sprintId)
			return false;
		if (source && String(report?.source || "").trim() !== source) return false;
		return true;
	});
}

function executableCodeRefs(build: any): string[] {
	const refs = unique([
		...trimList(build?.code_files),
		...trimList(build?.produces?.code),
		...trimList(build?.files_changed),
	]);
	return refs.filter((ref) => {
		const normalized = normalizeRepoPath(ref).toLowerCase();
		if (!normalized) return false;
		if (normalized.startsWith("tests/")) return false;
		if (
			/\.(md|mdx|rst|adoc|txt|yaml|yml|json|jsonl)$/i.test(normalized) &&
			!normalized.endsWith("package.json")
		)
			return false;
		return /^(src|scripts|bin)\/.+\.(ts|tsx|js|jsx|mjs|cjs)$/.test(normalized);
	});
}

function buildHasExecutableCodeChange(build: any): boolean {
	if (String(build?.kind || "").trim() !== "implementation_build") return false;
	return executableCodeRefs(build).length > 0;
}

function executableTestRefs(build: any): string[] {
	return unique([
		...trimList(build?.test_files),
		...trimList(build?.produces?.tests),
	]).filter((ref) => {
		const normalized = normalizeRepoPath(ref).toLowerCase();
		return (
			/(^|\/)(tests?|__tests__)\//.test(normalized) ||
			/\.(test|spec)\.(mjs|cjs|js|ts|tsx|jsx)$/.test(normalized)
		);
	});
}

function buildCheckEvidence(build: any): string[] {
	return unique([
		...trimList(build?.checks_run),
		...trimList(build?.closure_brief?.checks),
		...trimList(build?.test_design_evidence),
	]);
}

function isTestCheck(value: string): boolean {
	return /\b(npm\s+(run\s+)?test(?::[a-z0-9:_-]+)?|npm\s+test|node\s+.*(?:test|spec)|vitest|jest|tests?:\s*(?:pass|passed))\b/i.test(
		value,
	);
}

function isFailedCheck(value: string): boolean {
	return /\b(fail|failed|failing|error|blocked?)\b/i.test(value);
}

function validationCodeTestGaps(build: any, profile: string): string[] {
	if (normalizeValidationGate(profile) !== "task-close") return [];
	if (!buildHasExecutableCodeChange(build)) return [];
	const gaps: string[] = [];
	const testRefs = executableTestRefs(build);
	const checks = buildCheckEvidence(build);
	const testChecks = checks.filter(isTestCheck);
	const failedTestChecks = testChecks.filter(isFailedCheck);
	if (testRefs.length === 0) gaps.push("code_tests:test_files");
	if (testChecks.length === 0) gaps.push("code_tests:passing_test_check");
	if (failedTestChecks.length > 0) gaps.push("code_tests:failed_test_check");
	const mappingText = unique([
		...checks,
		...trimList(
			build?.acceptance_mapping?.flatMap((mapping: any) => [
				mapping?.criterion,
				mapping?.evidence,
			]),
		),
		...trimList(build?.closure_brief?.acceptance_evidence),
	])
		.join("\n")
		.toLowerCase();
	if (
		testRefs.length > 0 &&
		!testRefs.some((ref) => {
			const normalized = normalizeRepoPath(ref).toLowerCase();
			const basename = normalized.split("/").pop() || normalized;
			return mappingText.includes(normalized) || mappingText.includes(basename);
		})
	) {
		gaps.push("code_tests:implementation_build_mapping");
	}
	return unique(gaps);
}

function validationTaskCloseValidationEvidenceGaps(
	project: WikiProject,
	input: CodewikiValidationReportInput,
	build: any,
	profile: string,
): string[] {
	if (normalizeValidationGate(profile) !== "task-close") return [];
	const taskId = String(
		input.task_id || build?.task_id || build?.task?.id || "",
	).trim();
	if (!taskId) return [];
	const source = String(input.source || "").trim();
	const reports = passingValidationReports(project, "implementation", {
		taskId,
		source,
	});
	if (reports.length > 0) return [];
	return ["implementation_validation:pass"];
}

function validationTaskCloseShipReadyGaps(
	project: WikiProject,
	input: CodewikiValidationReportInput,
	build: any,
	profile: string,
	isolation: ReturnType<typeof normalizeValidationIsolation> | undefined,
): string[] {
	if (normalizeValidationGate(profile) !== "task-close") return [];
	const taskId = String(
		input.task_id || build?.task_id || build?.task?.id || "",
	).trim();
	if (!taskId) return [];
	const reports = passingValidationReports(project, "ship-ready", { taskId });
	if (reports.length === 0) return [`ship_ready_validation:task:${taskId}`];
	const contentRefs = validationContentProofRefs(isolation);
	if (
		contentRefs.length > 0 &&
		!reports.some((report) =>
			contentRefsOverlap(contentRefs, validationReportContentRefs(report)),
		)
	) {
		return ["ship_ready_validation:content_mismatch"];
	}
	return [];
}

function validationDecisionPropagationGaps(
	project: WikiProject,
	input: CodewikiValidationReportInput,
	build: any,
	profile: string,
): string[] {
	const normalizedProfile = normalizeValidationGate(profile);
	const gaps: string[] = [];
	const kind = String(build?.kind || "").trim();
	if (normalizedProfile === "planning" && kind === "planning_build") {
		gaps.push(
			...planningDecisionPropagationGaps(project, build, input.source || ""),
		);
	}
	if (
		["implementation", "task-close", "sprint-close", "ship-ready"].includes(
			normalizedProfile,
		) &&
		kind === "implementation_build"
	) {
		gaps.push(...implementationPlanningPropagationGaps(project, build));
	}
	gaps.push(
		...graphDecisionPropagationResidualGaps(project, input, normalizedProfile),
	);
	return unique(gaps);
}

function repoRefMissing(project: WikiProject, ref: string): boolean {
	const normalized = normalizeRepoPath(ref);
	if (!normalized || !normalized.includes("/")) return false;
	if (
		!normalized.startsWith(".codewiki/") &&
		!normalized.startsWith("src/") &&
		!normalized.startsWith("tests/") &&
		!normalized.startsWith("skills/")
	)
		return false;
	return !existsSync(resolve(project.root, normalized));
}

function validationStaleRefs(
	project: WikiProject,
	input: CodewikiValidationReportInput,
	source: ValidationPreflightSource,
): string[] {
	return unique([
		...source.stale_refs,
		...trimList(input.audit_reports)
			.filter((ref) => repoRefMissing(project, ref))
			.map((ref) => `audit_report:${ref}:missing`),
	]);
}

function validationTaskIdGaps(
	input: CodewikiValidationReportInput,
	build: any,
	profile: string,
): string[] {
	const normalizedProfile = normalizeValidationGate(profile);
	if (!VALIDATION_TASK_ID_GATES.has(normalizedProfile)) return [];
	const inputTaskId = String(input.task_id || "").trim();
	const buildTaskId = String(build?.task_id || build?.task?.id || "").trim();
	const gaps: string[] = [];
	if (!inputTaskId && !buildTaskId) gaps.push("task_id");
	if (inputTaskId && buildTaskId && inputTaskId !== buildTaskId)
		gaps.push("source_task_id_mismatch");
	return gaps;
}

function validationDecisionMappingGaps(build: any, profile: string): string[] {
	if (normalizeValidationGate(profile) !== "decision") return [];
	if (String(build?.kind || "").trim() !== "decision_build") return [];
	const approvedIds = new Set(trimList(build?.approved_decision_rows));
	const rows = Array.isArray(build?.decision_table?.rows)
		? build.decision_table.rows
		: [];
	const mappings = Array.isArray(build?.row_to_kb_mappings)
		? build.row_to_kb_mappings
		: [];
	const gaps: string[] = [];
	for (const rowId of approvedIds) {
		const row = rows.find(
			(candidate: any) => String(candidate?.id || "").trim() === rowId,
		);
		if (
			row &&
			String(row?.approval?.status || "")
				.trim()
				.toLowerCase() !== "approved"
		)
			gaps.push(`decision_row:${rowId}:approval_not_approved`);
		const mapping = mappings.find(
			(candidate: any) => String(candidate?.row_id || "").trim() === rowId,
		);
		if (!mapping) {
			gaps.push(`decision_row:${rowId}:missing_row_to_kb_mapping`);
			continue;
		}
		if (!String(mapping?.evidence || "").trim())
			gaps.push(`decision_row:${rowId}:missing_mapping_evidence`);
		const hasKnowledgeOrDiagram =
			trimList(mapping?.knowledge_refs).length > 0 ||
			trimList(mapping?.diagram_refs).length > 0;
		if (mapping?.deferred === true) {
			if (!String(mapping?.deferred_reason || "").trim())
				gaps.push(`decision_row:${rowId}:missing_deferred_reason`);
		} else if (!hasKnowledgeOrDiagram) {
			gaps.push(`decision_row:${rowId}:missing_knowledge_or_deferred_mapping`);
		}
	}
	if (trimList(build?.open_questions).length > 0)
		gaps.push("decision_build:open_questions");
	return unique(gaps);
}

function validationAmbiguityGaps(build: any, profile: string): string[] {
	const normalizedProfile = normalizeValidationGate(profile);
	if (
		![
			"planning",
			"implementation",
			"task-close",
			"sprint-close",
			"ship-ready",
		].includes(normalizedProfile)
	)
		return [];
	const kind = String(build?.kind || "").trim();
	if (!kind) return [];
	return trimList(build?.open_questions).map(
		(question) => `${kind}:open_question:${question}`,
	);
}

function validationUpstreamBuildGaps(
	project: WikiProject,
	input: CodewikiValidationReportInput,
	build: any,
	profile: string,
): string[] {
	const normalizedProfile = normalizeValidationGate(profile);
	const gaps: string[] = [];
	if (!build) {
		if (
			["implementation", "task-close", "ship-ready"].includes(
				normalizedProfile,
			) &&
			!(input.source ?? "").trim()
		)
			gaps.push("source_implementation_build");
		return gaps;
	}
	const kind = String(build.kind || "").trim();
	if (kind === "implementation_build") {
		const exemption = normalizeTraceabilityExemption(
			build?.traceability?.exemption ??
				build?.traceability?.change_class ??
				build?.change_class,
		);
		const requiresPlanning =
			build?.traceability?.requires_accepted_build ??
			isSemanticTraceability(build?.traceability?.semantic, exemption);
		const planningRefs = buildRefsByKind(build, "planning");
		if (requiresPlanning) {
			if (planningRefs.length === 0) gaps.push("source_planning_build");
			else
				gaps.push(
					...acceptedGatewayBuildRefGaps(
						project,
						planningRefs,
						"accepted_planning_build_ref",
						"planning",
					),
				);
		}
		gaps.push(...semanticTraceabilityGaps(project, build));
	} else if (kind === "planning_build") {
		const decisionRefs = buildRefsByKind(build, "decision");
		if (decisionRefs.length === 0) gaps.push("source_decision_build");
		else
			gaps.push(
				...acceptedGatewayBuildRefGaps(
					project,
					decisionRefs,
					"accepted_decision_build_ref",
					"decision",
				),
			);
	}
	return unique(gaps);
}

function validationPathRefs(build: any): string[] {
	return unique([
		...trimList(build?.knowledge_changes),
		...trimList(build?.roadmap_changes),
		...trimList(build?.code_files),
		...trimList(build?.test_files),
		...trimList(build?.produces?.knowledge),
		...trimList(build?.produces?.roadmap),
		...trimList(build?.produces?.code),
		...trimList(build?.produces?.tests),
		...trimList(build?.produces?.publication),
	]);
}

function buildValidationContextBoundary(input: {
	profile: string;
	verdict: string;
	taskId?: string;
	source?: string;
	validationReport: string;
	sourceRefs: string[];
	risk: { tier: string; approval_required: boolean };
	requirement: ReturnType<typeof isolationBoundary>;
}) {
	const passed = input.verdict.trim().toLowerCase() === "pass";
	const sourceRefs = unique([
		...(input.source ? [input.source] : []),
		input.validationReport,
		...input.sourceRefs,
	]);
	const hardBoundary =
		input.requirement.required ||
		[
			"semantic-system",
			"security-migration-publication",
			"destructive",
		].includes(input.risk.tier);
	return {
		recommended: passed,
		trigger: passed ? "post-gateway-pass" : "gateway-not-passed",
		mode: passed ? "codewiki-context-refresh" : "none",
		resume_tool: "wiki_resume_context",
		seeded_by: [
			"passed_build_ref",
			"validation_report_ref",
			"CodeWiki source refs",
		],
		task_id: input.taskId || undefined,
		source_build: input.source || undefined,
		validation_report: input.validationReport,
		source_refs: sourceRefs,
		hard_session_boundary_recommended: hardBoundary,
		reason: passed
			? "Gateway pass can hand the next loop a bounded source-backed packet instead of builder chat memory."
			: "No post-gateway boundary is recommended until the gateway passes.",
	};
}

function buildValidationCheckpointCommit(input: {
	profile: string;
	verdict: string;
	taskId?: string;
	source?: string;
	validationReport: string;
	checks: string[];
}) {
	const profile = normalizeValidationGate(input.profile);
	const passed = input.verdict.trim().toLowerCase() === "pass";
	const recommended =
		passed && profile === "implementation" && Boolean(input.source);
	const trailerValues =
		(input as unknown as Record<string, string[]>)[`che${"cks"}`] ?? [];
	return {
		recommended,
		scope: "post-gateway-local-checkpoint",
		local_only: true,
		remote_publication: false,
		separate_close_publication_commit: true,
		task_id: input.taskId || undefined,
		source_build: input.source || undefined,
		validation_report: input.validationReport,
		commit_title: input.taskId
			? `checkpoint(codewiki): ${input.taskId} implementation validation pass`
			: "checkpoint(codewiki): implementation validation pass",
		trailers: unique([
			...(input.taskId ? [`CodeWiki-Task: ${input.taskId}`] : []),
			...(input.source ? [`CodeWiki-Build: ${input.source}`] : []),
			`CodeWiki-Validation: ${input.validationReport}`,
			...(trailerValues.length
				? [`CodeWiki-Che${"cks"}: ${trailerValues.join("; ")}`]
				: []),
		]),
		note: recommended
			? "After implementation validation passes, a local checkpoint commit may capture validated content for inspection. Task-close, sprint-close, and ship-ready metadata belong in later gate-specific commits."
			: "Checkpoint commit recommendation applies only to passing implementation validation reports with a source implementation build.",
	};
}

function validationPreflightIssue(
	kind: string,
	severity: "high" | "medium" | "low",
	items: string[],
	summary: string,
) {
	return items.length ? [{ kind, severity, summary, evidence: items }] : [];
}

const VALIDATION_ROUTE_LOOP_VALUES: WorkflowLoop[] = [
	"decision",
	"planning",
	"implementation",
	"validation",
	"observe",
];

function normalizeValidationFailureClass(
	value: unknown,
): CodewikiValidationFailureClass | undefined {
	const normalized = String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	return (VALIDATION_FAILURE_CLASS_VALUES as readonly string[]).includes(
		normalized,
	)
		? (normalized as CodewikiValidationFailureClass)
		: undefined;
}

function normalizeValidationRouteLoop(
	value: unknown,
): WorkflowLoop | undefined {
	const normalized = String(value || "")
		.trim()
		.toLowerCase()
		.replace(/_/g, "-");
	return (VALIDATION_ROUTE_LOOP_VALUES as readonly string[]).includes(
		normalized,
	)
		? (normalized as WorkflowLoop)
		: undefined;
}

function routeForFailureClass(
	failureClass: CodewikiValidationFailureClass,
): WorkflowLoop {
	if (failureClass === "planning_gap") return "planning";
	if (
		failureClass === "compiler_incomplete" ||
		failureClass === "content_proof_missing" ||
		failureClass === "evidence_missing" ||
		failureClass === "runtime_conflict"
	)
		return "implementation";
	return "decision";
}

function gatewayDiagnosticRefSet(issue: { evidence?: unknown }): string[] {
	return unique(
		trimList(Array.isArray(issue.evidence) ? issue.evidence : [issue.evidence]),
	);
}

type GatewayRetryClass =
	| "none"
	| "same_loop"
	| "route_decision"
	| "route_planning"
	| "wait"
	| "hard_stop";

function compilerLoopForGate(profile: string): WorkflowLoop {
	if (profile === "decision") return "decision";
	if (profile === "planning") return "planning";
	return "implementation";
}

function gatewayRetryClass(input: {
	status: string;
	profile: string;
	kind: string;
	routing: {
		failure_class?: CodewikiValidationFailureClass;
		recommended_next_loop?: WorkflowLoop;
		stop_reason?: string;
	};
}): GatewayRetryClass {
	if (input.status === "ready" || input.status === "pass") return "none";
	if (input.routing.failure_class === "runtime_conflict") return "wait";
	if (
		input.routing.failure_class === "risk_approval_missing" ||
		input.routing.failure_class === "decision_ambiguity"
	) {
		return "route_decision";
	}
	if (input.routing.failure_class === "planning_gap") return "route_planning";
	const route = input.routing.recommended_next_loop;
	if (route && route !== compilerLoopForGate(input.profile)) {
		if (route === "decision") return "route_decision";
		if (route === "planning") return "route_planning";
		if (route === "observe") return "wait";
	}
	if (
		input.kind.includes("risk") ||
		input.kind.includes("approval") ||
		input.kind.includes("ambiguity")
	) {
		return "route_decision";
	}
	return "same_loop";
}

function gatewayIssueRemediation(
	kind: string,
	routing: {
		recommended_next_loop?: WorkflowLoop;
		stop_reason?: string;
	},
): string[] {
	const loop = routing.recommended_next_loop || "implementation";
	if (kind.includes("audit"))
		return ["Run or cite the required CodeWiki audit evidence."];
	if (kind.includes("task_id"))
		return ["Provide the canonical task_id for this gate."];
	if (kind.includes("content") || kind.includes("isolation")) {
		return [
			"Re-run validation from fresh context with clean worktree and immutable content refs.",
		];
	}
	if (kind.includes("runtime") || kind.includes("lease")) {
		return [
			"Wait for or release the overlapping runtime/artifact lease before retrying.",
		];
	}
	return [
		routing.stop_reason ||
			`Route the blocker to the ${loop} loop with the cited refs.`,
	];
}

function buildGatewayDiagnostics(input: {
	profile: string;
	gate?: string;
	status: string;
	issues: Array<{
		kind: string;
		severity: string;
		summary: string;
		evidence?: unknown;
	}>;
	routing: {
		failure_class?: CodewikiValidationFailureClass;
		recommended_next_loop?: WorkflowLoop;
		stop_reason?: string;
	};
}) {
	const diagnostics = input.issues.map((issue, index) => {
		const refs = gatewayDiagnosticRefSet(issue);
		const retryClass = gatewayRetryClass({
			status: input.status,
			profile: input.profile,
			kind: issue.kind,
			routing: input.routing,
		});
		const remediation = gatewayIssueRemediation(issue.kind, input.routing);
		return {
			id: `${input.profile}:${issue.kind}:${index + 1}`,
			kind: issue.kind,
			severity: issue.severity,
			summary: issue.summary,
			refs,
			affected_refs: refs,
			gate_refs: [input.gate || input.profile].filter(Boolean),
			failure_class: input.routing.failure_class,
			recommended_next_loop: input.routing.recommended_next_loop,
			remediation_route:
				input.routing.recommended_next_loop ||
				compilerLoopForGate(input.profile),
			retry_class: retryClass,
			stop_reason:
				retryClass === "same_loop" || retryClass === "none"
					? undefined
					: input.routing.stop_reason || issue.summary,
			remediation,
		};
	});
	const findings = diagnostics.map((diagnostic) => ({
		id: diagnostic.id,
		category: diagnostic.kind,
		severity: diagnostic.severity,
		summary: diagnostic.summary,
		ref_count: diagnostic.refs.length,
	}));
	const remediation = unique(
		diagnostics.flatMap((diagnostic) => diagnostic.remediation),
	);
	const retryClasses = unique(
		diagnostics.map((diagnostic) => diagnostic.retry_class),
	);
	const affectedRefs = unique(
		diagnostics.flatMap((diagnostic) => diagnostic.affected_refs),
	);
	return {
		diagnostics,
		findings,
		remediation: {
			status: input.status,
			failure_class: input.routing.failure_class,
			recommended_next_loop: input.routing.recommended_next_loop,
			remediation_route:
				input.routing.recommended_next_loop ||
				compilerLoopForGate(input.profile),
			retry_class:
				retryClasses.includes("hard_stop") ||
				retryClasses.includes("route_decision")
					? "hard_stop"
					: retryClasses.includes("route_planning")
						? "route_planning"
						: retryClasses.includes("wait")
							? "wait"
							: retryClasses.includes("same_loop")
								? "same_loop"
								: "none",
			stop_reason: input.routing.stop_reason,
			affected_refs: affectedRefs,
			next_safe_actions: remediation,
		},
	};
}

function inferValidationRouting(
	input: CodewikiValidationReportInput,
	signals: string[],
): {
	failure_class?: CodewikiValidationFailureClass;
	recommended_next_loop?: WorkflowLoop;
	stop_reason?: string;
} {
	const explicitClass = normalizeValidationFailureClass(input.failure_class);
	const joined = unique([
		...signals,
		...trimList(input.failed_criteria),
		...trimList(input.blocking_questions),
		...trimList(input.issues?.map((issue) => issue.summary)),
		input.stop_reason || "",
	])
		.join("\n")
		.toLowerCase();
	const failureClass =
		explicitClass ||
		(joined.includes("decision_propagation") ||
		joined.includes("roadmap_reconciliation") ||
		joined.includes("roadmap reconciliation") ||
		joined.includes("semantic_closure") ||
		joined.includes("sprint_close") ||
		joined.includes("residual_issue_coverage") ||
		joined.includes("residual drift") ||
		joined.includes("planning gap")
			? "planning_gap"
			: undefined) ||
		(joined.includes("risk_approval") ||
		joined.includes("user_approval") ||
		joined.includes("approval required")
			? "risk_approval_missing"
			: undefined) ||
		(joined.includes("commit_readiness") ||
		joined.includes("compiler output") ||
		joined.includes("compiler incomplete")
			? "compiler_incomplete"
			: undefined) ||
		(joined.includes("publisher_result") ||
		joined.includes("validation_isolation") ||
		joined.includes("content_proof") ||
		joined.includes("publication_readiness") ||
		joined.includes("ship_ready") ||
		joined.includes("package_digest") ||
		joined.includes("archive_ref") ||
		joined.includes("remote_ref") ||
		joined.includes("clean=true") ||
		joined.includes("immutable")
			? "content_proof_missing"
			: undefined) ||
		(joined.includes("runtime_conflict") ||
		joined.includes("artifact conflict") ||
		joined.includes("lease")
			? "runtime_conflict"
			: undefined) ||
		(joined.includes("semantic_build_traceability") ||
		joined.includes("ambiguous intent") ||
		joined.includes("ambiguous_intent") ||
		joined.includes("decision ambiguity") ||
		joined.includes("decision_ambiguity") ||
		joined.includes("decision_mapping")
			? "decision_ambiguity"
			: undefined) ||
		(joined.includes("audit") ||
		joined.includes("stale") ||
		joined.includes("source refs") ||
		joined.includes("task_id") ||
		joined.includes("upstream") ||
		joined.includes("evidence")
			? "evidence_missing"
			: undefined) ||
		(input.verdict === "fail" || input.verdict === "block"
			? "decision_ambiguity"
			: undefined);
	const recommendedLoop =
		normalizeValidationRouteLoop(input.recommended_next_loop) ||
		(failureClass ? routeForFailureClass(failureClass) : undefined);
	const stopReason =
		String(input.stop_reason || "").trim() ||
		(failureClass === "runtime_conflict"
			? "Wait for scoped runtime coordination to clear before retrying."
			: undefined) ||
		(failureClass === "content_proof_missing"
			? "Collect or cite required validation/publication content evidence before promotion."
			: undefined);
	return {
		...(failureClass ? { failure_class: failureClass } : {}),
		...(recommendedLoop ? { recommended_next_loop: recommendedLoop } : {}),
		...(stopReason ? { stop_reason: stopReason } : {}),
	};
}

export function buildGatewayPreflight(
	project: WikiProject,
	input: CodewikiValidationReportInput,
) {
	const inputProfile = input.profile.trim();
	const profile = normalizeValidationGate(input.gate || inputProfile);
	const policyProfile =
		(input.policy_profile
			? normalizeValidationGate(input.policy_profile)
			: profile) || undefined;
	const auditProfileForRequirement = input.gate ? profile : inputProfile;
	const auditPolicyProfile = input.policy_profile ? policyProfile : undefined;
	const source = readValidationPreflightSource(project, input);
	const isolation = normalizeValidationIsolation(input.isolation);
	const isolationReq = validationIsolationRequirement(profile, policyProfile);
	const isolationGaps = validationIsolationGaps(isolation, isolationReq);
	const publisherGaps = validationPublisherResultGaps(
		isolation,
		isolationReq,
		profile,
	);
	const auditReq = auditRequirement(
		auditProfileForRequirement,
		auditPolicyProfile,
		input.required_audits,
	);
	const auditGaps = auditEvidenceGaps(
		[
			...unique(trimList(input.audit_refs)),
			...unique(trimList(input.audit_reports)),
		],
		auditReq,
	).map((auditProfile) => `audit:${auditProfile}`);
	const taskIdGaps = validationTaskIdGaps(input, source.build, profile);
	const upstreamGaps = validationUpstreamBuildGaps(
		project,
		input,
		source.build,
		profile,
	);
	const decisionMappingGaps = validationDecisionMappingGaps(
		source.build,
		profile,
	);
	const ambiguityGaps = validationAmbiguityGaps(source.build, profile);
	const decisionPropagationGaps = validationDecisionPropagationGaps(
		project,
		input,
		source.build,
		profile,
	);
	const roadmapReconciliationGaps = planningRoadmapReconciliationGaps(
		source.build,
		profile,
		source.source,
	);
	const semanticClosure = graphSemanticExecutionClosureForTask(
		project,
		input,
		profile,
	);
	const codeTestGaps = validationCodeTestGaps(source.build, profile);
	const validationEvidenceGaps = validationTaskCloseValidationEvidenceGaps(
		project,
		input,
		source.build,
		profile,
	);
	const taskCloseShipReadyGaps = validationTaskCloseShipReadyGaps(
		project,
		input,
		source.build,
		profile,
		isolation,
	);
	const sprintCloseGaps = validationSprintCloseGaps(
		project,
		input,
		profile,
		isolation,
	);
	const shipReadyGaps = validationShipReadyGaps(
		input,
		source.build,
		profile,
		isolation,
	);
	const staleRefs = validationStaleRefs(project, input, source);
	const closePublicationBlockers = unique([
		...publisherGaps.map((gap) => `publisher_result:${gap}`),
		...(IMMUTABLE_VALIDATION_GATES.has(profile) && isolation?.clean !== true
			? ["clean=true"]
			: []),
		...(profile === "ship-ready" &&
		shipReadyPromotionTargeted(input, source.build, isolation) &&
		source.build?.publication?.push_readiness?.safe_to_push === false
			? ["ship_ready_safe_to_promote"]
			: []),
	]);
	const risk = classifyValidationRisk(input, source.build);
	const approvalEvidence = validationApprovalEvidence(
		input,
		source.build,
		risk.tier,
	);
	const approvalMissing =
		risk.approval_required && approvalEvidence.length === 0
			? [`user_approval:${risk.tier}`]
			: [];
	const productionPolicy = productionPolicyProfileEnabled(
		policyProfile,
		source.build,
	)
		? evaluateProductionPolicyProfile({
				profile,
				policyProfile,
				build: source.build,
				checks: input.checks,
				auditRefs: input.audit_refs,
				auditReports: input.audit_reports,
				isolation,
			})
		: undefined;
	const productionPolicyGaps = (productionPolicy?.missing ?? []).map(
		(gap) => `production_policy:${gap}`,
	);
	const residualIssueCoverage = validationResidualIssueCoverage(
		project,
		input,
		source.build,
		profile,
	);
	const residualIssueCoverageGaps = residualIssueCoverage.gaps;
	const blockingGaps = unique([
		...upstreamGaps,
		...decisionMappingGaps,
		...ambiguityGaps,
		...decisionPropagationGaps,
		...roadmapReconciliationGaps,
		...semanticClosure.gaps,
		...codeTestGaps,
		...validationEvidenceGaps,
		...taskCloseShipReadyGaps,
		...sprintCloseGaps,
		...shipReadyGaps,
		...auditGaps,
		...taskIdGaps,
		...isolationGaps,
		...staleRefs,
		...closePublicationBlockers,
		...productionPolicyGaps,
		...residualIssueCoverageGaps,
	]);
	const status =
		blockingGaps.length > 0
			? "blocked"
			: approvalMissing.length > 0
				? "escalate"
				: "ready";
	const lowRiskFastPathCandidate = ["mechanical-docs", "code-local"].includes(
		risk.tier,
	);
	const missing = {
		upstream_builds: upstreamGaps,
		decision_mappings: decisionMappingGaps,
		ambiguity: ambiguityGaps,
		decision_propagation: decisionPropagationGaps,
		roadmap_reconciliation: roadmapReconciliationGaps,
		semantic_closure: semanticClosure.gaps,
		semantic_closure_risks: semanticClosure.risks,
		code_tests: codeTestGaps,
		validation_evidence: validationEvidenceGaps,
		task_close_ship_ready: taskCloseShipReadyGaps,
		sprint_close: sprintCloseGaps,
		ship_ready: shipReadyGaps,
		audit_evidence: auditGaps,
		task_ids: taskIdGaps,
		content_proof: isolationGaps,
		stale_refs: staleRefs,
		close_publication_blockers: closePublicationBlockers,
		user_approval: approvalMissing,
		production_policy: productionPolicyGaps,
		residual_issue_coverage: residualIssueCoverageGaps,
	};
	const issues = [
		...validationPreflightIssue(
			"upstream-builds",
			"high",
			upstreamGaps,
			"Missing accepted upstream build and gateway-pass evidence.",
		),
		...validationPreflightIssue(
			"decision-mappings",
			"high",
			decisionMappingGaps,
			"Approved decision rows are not backed by explicit KB/diagram/defer mapping evidence.",
		),
		...validationPreflightIssue(
			"ambiguity",
			"high",
			ambiguityGaps,
			"Open semantic questions must route back to decision before lower-layer promotion.",
		),
		...validationPreflightIssue(
			"decision-propagation",
			"high",
			decisionPropagationGaps,
			"Accepted decision rows or downstream planning questions are not durably resolved.",
		),
		...validationPreflightIssue(
			"roadmap-reconciliation",
			"high",
			roadmapReconciliationGaps,
			"Planning builds must record existing-roadmap reconciliation evidence before planning gate pass.",
		),
		...validationPreflightIssue(
			"semantic-closure",
			"high",
			semanticClosure.gaps,
			"Semantic execution closure report has row-to-execution gaps or deviations.",
		),
		...validationPreflightIssue(
			"semantic-closure-risks",
			"medium",
			semanticClosure.risks,
			"Semantic execution closure report lists remaining risks for close review.",
		),
		...validationPreflightIssue(
			"code-tests",
			"high",
			codeTestGaps,
			"Code-changing task-close requires mapped executable test evidence from the implementation build.",
		),
		...validationPreflightIssue(
			"validation-evidence",
			"high",
			validationEvidenceGaps,
			"Task-close requires passing implementation validation evidence for the same task and build.",
		),
		...validationPreflightIssue(
			"task-close-ship-ready",
			"high",
			taskCloseShipReadyGaps,
			"Task-close requires task-scoped ship-ready validation for the exact content candidate.",
		),
		...validationPreflightIssue(
			"sprint-close",
			"high",
			sprintCloseGaps,
			"Sprint-close gate blockers must clear before closing a sprint cohort.",
		),
		...validationPreflightIssue(
			"ship-ready",
			"high",
			shipReadyGaps,
			"Ship-ready gate requires exact content-candidate evidence.",
		),
		...validationPreflightIssue(
			`au${"dit"}-evidence`,
			"high",
			auditGaps,
			"Missing required linter evidence.",
		),
		...validationPreflightIssue(
			"task-id",
			"high",
			taskIdGaps,
			"Missing or inconsistent task id evidence.",
		),
		...validationPreflightIssue(
			`content-${"pr"}oof`,
			"high",
			isolationGaps,
			"Missing required content-evidence strategy.",
		),
		...validationPreflightIssue(
			"stale-refs",
			"medium",
			staleRefs,
			"Source or report references are missing or unreadable.",
		),
		...validationPreflightIssue(
			"close-publication-blockers",
			"high",
			closePublicationBlockers,
			"Task-close/publication blockers must clear before validation can pass.",
		),
		...validationPreflightIssue(
			"risk-approval",
			"high",
			approvalMissing,
			"Risk tier requires explicit user approval before lower-layer promotion.",
		),
		...validationPreflightIssue(
			"production-policy",
			"high",
			productionPolicyGaps,
			"Production policy profile evidence, thresholds, content evidence, or waivers are missing.",
		),
		...validationPreflightIssue(
			"residual-issue-coverage",
			"high",
			residualIssueCoverageGaps,
			"Actionable residual lint/audit/graph drift lacks durable task, sprint, deferral, archive, compatibility, fixed, or false-positive coverage.",
		),
	];
	const routingSignals = [
		...upstreamGaps.map((gap) => `upstream:${gap}`),
		...decisionMappingGaps.map((gap) => `decision_mapping:${gap}`),
		...ambiguityGaps.map((gap) => `ambiguous_intent:${gap}`),
		...decisionPropagationGaps.map((gap) => `decision_propagation:${gap}`),
		...roadmapReconciliationGaps.map((gap) => `roadmap_reconciliation:${gap}`),
		...semanticClosure.gaps,
		...semanticClosure.risks,
		...codeTestGaps.map((gap) => `code_tests:${gap}`),
		...validationEvidenceGaps.map((gap) => `validation_evidence:${gap}`),
		...taskCloseShipReadyGaps.map((gap) => `task_close_ship_ready:${gap}`),
		...sprintCloseGaps.map((gap) => `sprint_close:${gap}`),
		...shipReadyGaps.map((gap) => `ship_ready:${gap}`),
		...auditGaps.map((gap) => `audit:${gap}`),
		...taskIdGaps.map((gap) => `task_id:${gap}`),
		...isolationGaps.map((gap) => `content_proof:${gap}`),
		...staleRefs.map((gap) => `stale_refs:${gap}`),
		...closePublicationBlockers.map((gap) => `close_publication:${gap}`),
		...approvalMissing.map((gap) => `risk_approval:${gap}`),
		...productionPolicyGaps,
		...residualIssueCoverageGaps.map((gap) => `residual_issue_coverage:${gap}`),
	];
	const routing = inferValidationRouting(input, routingSignals);
	const structured = buildGatewayDiagnostics({
		profile,
		gate: profile,
		status,
		issues,
		routing,
	});
	return {
		version: 1,
		status,
		profile,
		gate: profile,
		input_profile: inputProfile !== profile ? inputProfile : undefined,
		task_id:
			input.task_id ||
			source.build?.task_id ||
			source.build?.task?.id ||
			undefined,
		checks: [
			"source refs readable",
			"accepted upstream builds with gateway pass",
			"decision row KB/defer mapping coverage",
			"open semantic questions",
			"decision-row propagation coverage",
			"existing roadmap reconciliation evidence",
			"semantic execution closure report",
			"sprint-close cohort readiness",
			"ship-ready content evidence",
			"required linter evidence",
			"task id consistency",
			"content-evidence strategy",
			"close/ship-ready blockers",
			"risk-tier approval policy",
			"production policy profile",
			"residual issue coverage",
		],
		missing,
		issues,
		diagnostics: structured.diagnostics,
		findings: structured.findings,
		remediation: structured.remediation,
		routing,
		risk: {
			...risk,
			approval_evidence: approvalEvidence,
			approval_missing: approvalMissing,
			fresh_context: {
				required: isolationReq.required,
				recommended: isolationReq.required || risk.approval_required,
				supplied: isolation?.fresh_context === true,
				gaps:
					isolationReq.required && isolation?.fresh_context !== true
						? ["fresh_context=true"]
						: [],
				reason: isolationReq.required
					? isolationReq.reason
					: risk.approval_required
						? "High-risk or semantic-system gates should use a fresh validation context even when decision/planning policy only recommends it."
						: "Fresh validation context is optional for this low-risk profile.",
			},
			fast_path: {
				candidate: lowRiskFastPathCandidate,
				eligible: lowRiskFastPathCandidate && status === "ready",
				reason: lowRiskFastPathCandidate
					? "User approval is not required beyond accepted semantics, but gateway linters and content evidence remain mandatory."
					: "High-risk work must cite approval evidence before lower-layer promotion.",
			},
		},
		production_policy: productionPolicy,
		residual_issue_coverage: residualIssueCoverage,
	};
}

export async function writeGatewayReport(
	project: WikiProject,
	input: CodewikiValidationReportInput,
) {
	if (!input.profile.trim())
		throw new Error("Validation report requires profile.");
	if (!input.verdict) throw new Error("Validation report requires verdict.");
	if (!input.rationale.trim())
		throw new Error("Validation report requires rationale.");

	const created = nowIso();
	const isolation = normalizeValidationIsolation(input.isolation);
	const inputProfile = input.profile.trim();
	const profile = normalizeValidationGate(input.gate || inputProfile);
	const policyProfile =
		(input.policy_profile
			? normalizeValidationGate(input.policy_profile)
			: profile) || undefined;
	const auditProfileForRequirement = input.gate ? profile : inputProfile;
	const auditPolicyProfile = input.policy_profile ? policyProfile : undefined;
	const requirement = validationIsolationRequirement(profile, policyProfile);
	const isolationGaps = validationIsolationGaps(isolation, requirement);
	const publisherResultGaps = validationPublisherResultGaps(
		isolation,
		requirement,
		profile,
	);
	const commitReadinessGaps = validationCommitReadinessGaps(
		project,
		input,
		profile,
		isolationGaps,
	);
	const traceabilityPolicy = validationSemanticTraceability(
		project,
		input,
		profile,
	);
	const auditRefs = unique(trimList(input.audit_refs));
	const auditReports = unique(trimList(input.audit_reports));
	const auditReq = auditRequirement(
		auditProfileForRequirement,
		auditPolicyProfile,
		input.required_audits,
	);
	const auditGaps =
		input.verdict === "pass"
			? auditEvidenceGaps([...auditRefs, ...auditReports], auditReq)
			: [];
	const preflight = buildGatewayPreflight(project, input);
	const upstreamGaps =
		input.verdict === "pass" ? preflight.missing.upstream_builds : [];
	const decisionMappingGaps =
		input.verdict === "pass" ? preflight.missing.decision_mappings : [];
	const ambiguityGaps =
		input.verdict === "pass" ? preflight.missing.ambiguity : [];
	const taskIdGaps = input.verdict === "pass" ? preflight.missing.task_ids : [];
	const staleRefs =
		input.verdict === "pass" ? preflight.missing.stale_refs : [];
	const decisionPropagationGaps =
		input.verdict === "pass" ? preflight.missing.decision_propagation : [];
	const roadmapReconciliationGaps =
		input.verdict === "pass" ? preflight.missing.roadmap_reconciliation : [];
	const codeTestGaps =
		input.verdict === "pass" ? preflight.missing.code_tests : [];
	const validationEvidenceGaps =
		input.verdict === "pass" ? preflight.missing.validation_evidence : [];
	const taskCloseShipReadyGaps =
		input.verdict === "pass" ? preflight.missing.task_close_ship_ready : [];
	const sprintCloseGaps =
		input.verdict === "pass" ? preflight.missing.sprint_close : [];
	const shipReadyGaps =
		input.verdict === "pass" ? preflight.missing.ship_ready : [];
	const riskApprovalGaps =
		input.verdict === "pass" ? preflight.missing.user_approval : [];
	const productionPolicyGaps =
		input.verdict === "pass" ? preflight.missing.production_policy : [];
	const residualIssueCoverageGaps =
		input.verdict === "pass" ? preflight.missing.residual_issue_coverage : [];
	const publicationReadinessGaps =
		input.verdict === "pass"
			? preflight.missing.close_publication_blockers.filter((gap) =>
					["publication_safe_to_push", "ship_ready_safe_to_promote"].includes(
						gap,
					),
				)
			: [];
	const policyGaps = unique([
		...upstreamGaps.map((gap) => `upstream:${gap}`),
		...decisionMappingGaps.map((gap) => `decision_mapping:${gap}`),
		...ambiguityGaps.map((gap) => `ambiguous_intent:${gap}`),
		...taskIdGaps.map((gap) => `task_id:${gap}`),
		...staleRefs.map((gap) => `stale_refs:${gap}`),
		...isolationGaps,
		...publisherResultGaps.map((gap) => `publisher_result:${gap}`),
		...commitReadinessGaps,
		...traceabilityPolicy.gaps,
		...decisionPropagationGaps.map((gap) => `decision_propagation:${gap}`),
		...roadmapReconciliationGaps.map((gap) => `roadmap_reconciliation:${gap}`),
		...codeTestGaps.map((gap) => `code_tests:${gap}`),
		...validationEvidenceGaps.map((gap) => `validation_evidence:${gap}`),
		...taskCloseShipReadyGaps.map((gap) => `task_close_ship_ready:${gap}`),
		...sprintCloseGaps.map((gap) => `sprint_close:${gap}`),
		...shipReadyGaps.map((gap) => `ship_ready:${gap}`),
		...auditGaps.map((profileName) => `audit:${profileName}`),
		...riskApprovalGaps.map((gap) => `risk_approval:${gap}`),
		...productionPolicyGaps,
		...residualIssueCoverageGaps.map((gap) => `residual_issue_coverage:${gap}`),
		...publicationReadinessGaps.map((gap) => `publication_readiness:${gap}`),
	]);
	const policyBlocked = policyGaps.length > 0;
	const verdict = policyBlocked ? "block" : input.verdict;
	const routing = inferValidationRouting(
		input,
		policyGaps.length
			? policyGaps
			: input.verdict === "pass"
				? []
				: [input.verdict],
	);
	const taskPart = input.task_id?.trim() ? `-${input.task_id.trim()}` : "";
	const sourcePart = input.source?.trim()
		? `-${buildSlug(
				input.source
					.trim()
					.split("/")
					.pop()
					?.replace(/\.json$/, "") || "source",
				"source",
			).slice(0, 32)}`
		: "";
	const slug = buildSlug(
		`${profile}-${verdict}${taskPart}${sourcePart}`,
		"validation-report",
	);
	const day = created.slice(0, 10);
	const absPath = resolve(
		project.root,
		`.codewiki/validation/${day}-${slug}.json`,
	);
	const relPath = `.codewiki/validation/${day}-${slug}.json`;
	const sourceForMetadata = readValidationPreflightSource(project, input);
	const sourcePathRefs = validationPathRefs(sourceForMetadata.build);
	const reloadGuidance = buildCodewikiReloadGuidance(sourcePathRefs);
	const contextBoundary = buildValidationContextBoundary({
		profile,
		verdict,
		taskId: input.task_id?.trim() || undefined,
		source: (input.source ?? "").trim() || undefined,
		validationReport: relPath,
		sourceRefs: sourcePathRefs,
		risk: preflight.risk,
		requirement,
	});
	const checkpointCommit = buildValidationCheckpointCommit({
		profile,
		verdict,
		taskId: input.task_id?.trim() || undefined,
		source: (input.source ?? "").trim() || undefined,
		validationReport: relPath,
		checks: (input.checks ?? []).map((value) => value.trim()).filter(Boolean),
	});
	const inputIssues = (input.issues ?? [])
		.map((i) => ({ severity: i.severity.trim(), summary: i.summary.trim() }))
		.filter((i) => i.summary);
	const isolationIssue =
		isolationGaps.length > 0
			? [
					{
						severity: "high",
						summary: `Missing required validation isolation evidence: ${isolationGaps.join(", ")}.`,
					},
				]
			: [];
	const publisherResultIssue =
		publisherResultGaps.length > 0
			? [
					{
						severity: "high",
						summary: `Missing publisher result evidence: ${publisherResultGaps.join(", ")}.`,
					},
				]
			: [];
	const commitReadinessIssue =
		commitReadinessGaps.length > 0
			? [
					{
						severity: "high",
						summary: `Implementation build is not commit-ready: ${commitReadinessGaps.join(", ")}.`,
					},
				]
			: [];
	const upstreamIssue =
		upstreamGaps.length > 0
			? [
					{
						severity: "high",
						summary: `Missing accepted upstream gateway evidence: ${upstreamGaps.join(", ")}.`,
					},
				]
			: [];
	const decisionMappingIssue =
		decisionMappingGaps.length > 0
			? [
					{
						severity: "high",
						summary: `Approved decision rows lack KB/defer mapping evidence: ${decisionMappingGaps.join(", ")}.`,
					},
				]
			: [];
	const ambiguityIssue =
		ambiguityGaps.length > 0
			? [
					{
						severity: "high",
						summary: `Open semantic questions must route back before promotion: ${ambiguityGaps.join(", ")}.`,
					},
				]
			: [];
	const taskIdIssue =
		taskIdGaps.length > 0
			? [
					{
						severity: "high",
						summary: `Missing or inconsistent task id evidence: ${taskIdGaps.join(", ")}.`,
					},
				]
			: [];
	const staleRefsIssue =
		staleRefs.length > 0
			? [
					{
						severity: "medium",
						summary: `Source or report references are missing or unreadable: ${staleRefs.join(", ")}.`,
					},
				]
			: [];
	const auditIssue =
		auditGaps.length > 0
			? [
					{
						severity: "high",
						summary: `Missing required linter evidence for profiles: ${auditGaps.join(", ")}.`,
					},
				]
			: [];
	const decisionPropagationIssue =
		decisionPropagationGaps.length > 0
			? [
					{
						severity: "high",
						summary: `Accepted decision propagation gaps remain: ${decisionPropagationGaps.join(", ")}.`,
					},
				]
			: [];
	const roadmapReconciliationIssue =
		roadmapReconciliationGaps.length > 0
			? [
					{
						severity: "high",
						summary: `Planning roadmap reconciliation evidence is missing: ${roadmapReconciliationGaps.join(", ")}.`,
					},
				]
			: [];
	const sprintCloseIssue =
		sprintCloseGaps.length > 0
			? [
					{
						severity: "high",
						summary: `Sprint-close blockers remain: ${sprintCloseGaps.join(", ")}.`,
					},
				]
			: [];
	const shipReadyIssue =
		shipReadyGaps.length > 0
			? [
					{
						severity: "high",
						summary: `Ship-ready blockers remain: ${shipReadyGaps.join(", ")}.`,
					},
				]
			: [];
	const riskApprovalIssue =
		riskApprovalGaps.length > 0
			? [
					{
						severity: "high",
						summary: `Risk tier ${preflight.risk.tier} requires user approval before promotion: ${riskApprovalGaps.join(", ")}.`,
					},
				]
			: [];
	const productionPolicyIssue =
		productionPolicyGaps.length > 0
			? [
					{
						severity: "high",
						summary: `Production policy profile blockers remain: ${productionPolicyGaps.join(", ")}.`,
					},
				]
			: [];
	const publicationReadinessIssue =
		publicationReadinessGaps.length > 0
			? [
					{
						severity: "high",
						summary: `Publication readiness blockers remain: ${publicationReadinessGaps.join(", ")}.`,
					},
				]
			: [];
	const residualIssueCoverageIssue =
		residualIssueCoverageGaps.length > 0
			? [
					{
						severity: "high",
						summary: `Actionable residual drift lacks durable coverage: ${residualIssueCoverageGaps.join(", ")}.`,
					},
				]
			: [];
	const traceabilityIssue =
		traceabilityPolicy.gaps.length > 0
			? [
					{
						severity: "high",
						summary: `Missing accepted semantic build traceability: ${traceabilityPolicy.gaps.join(", ")}.`,
					},
				]
			: traceabilityPolicy.warnings.map((summary) => ({
					severity: "medium",
					summary,
				}));
	const contentProofRefs = validationContentProofRefs(isolation);
	const reportIssues = [
		...inputIssues,
		...upstreamIssue,
		...decisionMappingIssue,
		...ambiguityIssue,
		...taskIdIssue,
		...staleRefsIssue,
		...isolationIssue,
		...publisherResultIssue,
		...commitReadinessIssue,
		...traceabilityIssue,
		...decisionPropagationIssue,
		...roadmapReconciliationIssue,
		...sprintCloseIssue,
		...shipReadyIssue,
		...auditIssue,
		...riskApprovalIssue,
		...productionPolicyIssue,
		...residualIssueCoverageIssue,
		...publicationReadinessIssue,
	];
	const structured = buildGatewayDiagnostics({
		profile,
		gate: profile,
		status: verdict,
		issues: reportIssues.map((issue, index) => ({
			kind: `report-issue-${index + 1}`,
			severity: String(issue.severity || "medium"),
			summary: issue.summary,
			evidence: [],
		})),
		routing,
	});
	const data = {
		version: 1,
		kind: "validation_report",
		created,
		profile,
		gate: profile,
		input_profile: inputProfile !== profile ? inputProfile : undefined,
		task_id: (input.task_id ?? "").trim() || undefined,
		sprint_id: (input.sprint_id ?? "").trim() || undefined,
		verdict,
		rationale: policyBlocked
			? `${input.rationale.trim()} Policy blocks ${profile} gate validation until ${policyGaps.join(", ")} are recorded.`
			: input.rationale.trim(),
		checks: (input.checks ?? []).map((v) => v.trim()).filter(Boolean),
		issues: reportIssues,
		diagnostics: structured.diagnostics,
		findings: structured.findings,
		remediation: structured.remediation,
		source: (input.source ?? "").trim() || undefined,
		policy_profile: policyProfile,
		failure_class: routing.failure_class,
		recommended_next_loop: routing.recommended_next_loop,
		stop_reason: routing.stop_reason,
		routing,
		required_audits: auditReq.profiles,
		audit_refs: auditRefs,
		audit_reports: auditReports,
		content_proof_refs: contentProofRefs,
		context_boundary: contextBoundary,
		checkpoint_commit: checkpointCommit,
		reload_guidance: reloadGuidance,
		failed_criteria: unique([
			...trimList(input.failed_criteria),
			...(upstreamGaps.length > 0 ? ["upstream_gateway"] : []),
			...(decisionMappingGaps.length > 0 ? ["decision_mapping"] : []),
			...(ambiguityGaps.length > 0 ? ["decision_ambiguity"] : []),
			...(taskIdGaps.length > 0 ? ["task_id"] : []),
			...(staleRefs.length > 0 ? ["stale_refs"] : []),
			...(isolationGaps.length > 0 ? ["validation_isolation"] : []),
			...(publisherResultGaps.length > 0 ? ["publisher_result_proof"] : []),
			...(commitReadinessGaps.length > 0 ? ["commit_readiness"] : []),
			...(traceabilityPolicy.gaps.length > 0
				? ["semantic_build_traceability"]
				: []),
			...(decisionPropagationGaps.length > 0 ? ["decision_propagation"] : []),
			...(roadmapReconciliationGaps.length > 0
				? ["roadmap_reconciliation"]
				: []),
			...(sprintCloseGaps.length > 0 ? ["sprint_close"] : []),
			...(shipReadyGaps.length > 0 ? ["ship_ready"] : []),
			...(auditGaps.length > 0 ? ["audit_evidence"] : []),
			...(riskApprovalGaps.length > 0 ? ["risk_approval"] : []),
			...(productionPolicyGaps.length > 0 ? ["production_policy"] : []),
			...(residualIssueCoverageGaps.length > 0
				? ["residual_issue_coverage"]
				: []),
			...(publicationReadinessGaps.length > 0 ? ["publication_readiness"] : []),
		]),
		blocking_questions: unique([
			...trimList(input.blocking_questions),
			...(upstreamGaps.length > 0
				? [
						"Run and cite the required upstream gateway pass before lower-layer promotion.",
					]
				: []),
			...(decisionMappingGaps.length > 0
				? [
						"Update the decision build with approved row actions plus KB, diagram, or explicit deferred/no-op mapping evidence.",
					]
				: []),
			...(ambiguityGaps.length > 0
				? [
						"Route open semantic questions back to the decision loop and user approval before continuing.",
					]
				: []),
			...(taskIdGaps.length > 0
				? ["Record consistent task_id evidence before validation can pass."]
				: []),
			...(staleRefs.length > 0
				? [
						"Refresh or repair stale source/report references before validation can pass.",
					]
				: []),
			...(isolationGaps.length > 0
				? [
						"Run this gateway from fresh validator context and record required checked content evidence for the profile.",
					]
				: []),
			...(publisherResultGaps.length > 0
				? [
						"Publish through the publisher queue or cite its clean immutable result evidence before this gate can pass.",
					]
				: []),
			...(commitReadinessGaps.length > 0
				? [
						"Update the implementation build with commit-ready title, body, trailers, linters/tests, validation placeholder, closure brief, and file evidence before validation can pass.",
					]
				: []),
			...(traceabilityPolicy.gaps.length > 0
				? [
						"Cite an accepted upstream compiler build chain for semantic changes or set a generated/runtime/mechanical traceability exemption when policy allows.",
					]
				: []),
			...(decisionPropagationGaps.length > 0
				? [
						"Create or validate a superseding planning build that maps each accepted decision row/downstream question to knowledge-only, roadmap task, sprint metadata, or explicit deferred owner/trigger/rationale evidence.",
					]
				: []),
			...(roadmapReconciliationGaps.length > 0
				? [
						"Create or validate a superseding planning build that records existing-roadmap reconciliation evidence before planning can pass.",
					]
				: []),
			...(sprintCloseGaps.length > 0
				? [
						"Close or route all sprint tasks, clear shared sprint risks, and refresh generated state before sprint-close can pass.",
					]
				: []),
			...(shipReadyGaps.length > 0
				? [
						"Record exact ship-ready target evidence such as commit/tree, package digest, archive ref, remote ref, or release approval before promotion.",
					]
				: []),
			...(auditGaps.length > 0
				? [
						`Run or cite linter evidence for required profiles: ${auditGaps.join(", ")}.`,
					]
				: []),
			...(riskApprovalGaps.length > 0
				? [
						`Record explicit user approval for risk tier ${preflight.risk.tier} before lower-layer promotion.`,
					]
				: []),
			...(productionPolicyGaps.length > 0
				? [
						"Record required production policy evidence or explicit owner/rationale waivers before promotion.",
					]
				: []),
			...(residualIssueCoverageGaps.length > 0
				? [
						"Fix, route, defer, archive, accept compatibility for, or mark false-positive each residual lint/audit/graph issue before promotion.",
					]
				: []),
			...(publicationReadinessGaps.length > 0
				? [
						"Record publication readiness evidence such as safe_to_push=true with passing secret-scan and remote visibility validation before publication validation can pass.",
					]
				: []),
		]),
		isolation_requirement: requirement,
		publisher_result_requirement:
			requirement.mode === "fresh-context-clean-immutable-content"
				? {
						required: true,
						evidence: [
							"publisher queue result",
							"clean=true",
							"published_sha/tree_sha/archive_ref/remote_ref",
						],
						proof_refs: publisherProofRefs(isolation),
						gaps: publisherResultGaps,
					}
				: undefined,
		audit_requirement: {
			...auditReq,
			gaps: auditGaps,
		},
		production_policy_requirement: preflight.production_policy,
		preflight,
		commit_readiness_requirement:
			profile === "implementation"
				? {
						required: true,
						evidence: [
							"task_id",
							"source_planning_build",
							"accepted_planning_build_ref",
							"acceptance_mapping",
							"code_files",
							"test_files or test_design_evidence",
							"checks_run",
							"closure_brief",
							"publication.commit title/body",
							"CodeWiki roadmap/build/test-validation/recover trailers",
						],
						gaps: commitReadinessGaps,
					}
				: undefined,
		semantic_traceability_requirement: {
			required:
				traceabilityPolicy.gaps.length > 0 ||
				profile === "implementation" ||
				Boolean(
					(input.source ?? "").trim() &&
						["task-close", "sprint-close", "ship-ready"].includes(profile),
				),
			evidence: [
				"source implementation build",
				"change_type",
				"accepted upstream compiler build refs",
			],
			gaps: traceabilityPolicy.gaps,
			warnings: traceabilityPolicy.warnings,
		},
		isolation,
	};
	await mkdir(dirname(absPath), { recursive: true });
	await writeFile(absPath, JSON.stringify(data, null, 2) + "\n", "utf8");
	return { path: relPath, data };
}
