import type { WikiProject } from "../project/types.ts";
import type { CodewikiBuildToolInput } from "../build/types.ts";
import type { CodewikiRoadmapToolInput } from "../roadmap/types.ts";
import type { TaskMutationPorts } from "../roadmap/task.ts";
import type { CodewikiArtifactStatusToolContext } from "../session/artifact-status-tool.ts";
import type {
	CodewikiArtifactStatusToolInput,
	CodewikiSessionToolInput,
} from "../session/types.ts";
import type { CodewikiAgencyToolPorts } from "../agency/tool.ts";
import { executeCodewikiAudit, formatAuditReport } from "../audit/tool.ts";
import { executeCodewikiBuildTool } from "../build/tool.ts";
import {
	executeCodewikiDecisionTool,
	executeCodewikiDecisionTableTool,
} from "../change/tool.ts";
import { executeCodewikiValidationTool } from "../gateway/tool.ts";
import { executeCodewikiRoadmapTool } from "../roadmap/tool.ts";
import { executeCodewikiAgencyTool } from "../agency/tool.ts";
import { executeCodewikiGcTool } from "../gc/tool.ts";
import { executeCodewikiArtifactStatusTool } from "../session/artifact-status-tool.ts";
import { executeCodewikiSessionTool } from "../session/tool.ts";

export interface CodewikiWorkflowOperation {
	primitive: string;
	action?: string;
	summary: string;
	result: unknown;
}

export interface CodewikiWorkflowResult {
	summary: string;
	tool:
		| "wiki_decide"
		| "wiki_plan"
		| "wiki_implement"
		| "wiki_gate"
		| "wiki_runtime";
	action: string;
	operations: CodewikiWorkflowOperation[];
	artifact_refs: string[];
	compatibility_tools: string[];
	result?: unknown;
}

export interface CodewikiPlanToolPorts {
	roadmap: TaskMutationPorts;
}

export interface CodewikiImplementToolPorts {
	roadmap: TaskMutationPorts;
}

export interface CodewikiRuntimeToolPorts {
	session: unknown;
	artifactStatus: CodewikiArtifactStatusToolContext;
	agency: CodewikiAgencyToolPorts;
}

type JsonRecord = Record<string, any>;

const BUILD_KEYS = [
	"summary",
	"slug",
	"source",
	"schema_version",
	"consumes",
	"produces",
	"change_type",
	"change_class",
	"upstream_build_refs",
	"accepted_build_refs",
	"traceability",
	"cycle",
	"policy",
	"requirements",
	"evidence_mapping",
	"audit_refs",
	"audit_reports",
	"agent_assessment",
	"lifecycle",
	"refresh",
	"decision_mode",
	"row_to_kb_mappings",
	"propagation",
	"diagram_refs",
	"downstream_planning_questions",
	"decision_table",
	"approved_decision_rows",
	"decisions",
	"assumptions",
	"open_questions",
	"non_goals",
	"knowledge_changes",
	"roadmap_changes",
	"source_decision_build",
	"task_ids",
	"task_changes",
	"decision_row_resolutions",
	"downstream_question_resolutions",
	"tdd_plan",
	"candidate_test_files",
	"candidate_code_paths",
	"source_planning_build",
	"task_id",
	"test_files",
	"code_files",
	"checks_run",
	"acceptance_mapping",
	"test_design_evidence",
	"code_change_evidence",
	"tester_notes",
	"builder_notes",
	"validation_refs",
	"risks",
	"closure_brief",
	"publication",
] as const;

const DECISION_TABLE_ACTIONS = new Set([
	"propose",
	"revise",
	"accept",
	"reject",
	"defer",
	"alternative",
	"archive",
	"list",
]);
const ROADMAP_ACTIONS = new Set([
	"create",
	"update",
	"close",
	"cancel",
	"clear-archive",
	"checkpoint",
	"sprint",
]);
const SESSION_ACTIONS = new Set(["focus", "note", "clear"]);
const ARTIFACT_STATUS_ACTIONS = new Set([
	"mark",
	"wait",
	"release",
	"cancel",
	"heartbeat",
	"list",
]);
const GC_ACTIONS = new Set(["dry-run", "purge"]);
const AGENCY_ACTIONS = new Set(["observe", "maintain", "work", "agency"]);

function isRecord(value: unknown): value is JsonRecord {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function omitRepoPath<T extends JsonRecord>(value: T): Omit<T, "repoPath"> {
	const { repoPath: _repoPath, ...rest } = value;
	return rest;
}

function pickKnown(input: JsonRecord, keys: readonly string[]): JsonRecord {
	const out: JsonRecord = {};
	for (const key of keys) {
		if (input[key] !== undefined) out[key] = input[key];
	}
	return out;
}

function nestedInput(input: JsonRecord, keys: string[]): JsonRecord | null {
	for (const key of keys) {
		if (isRecord(input[key])) return omitRepoPath(input[key]);
	}
	return null;
}

function hasAnyKey(input: JsonRecord, keys: readonly string[]): boolean {
	return keys.some((key) => input[key] !== undefined);
}

function materializeBuildInput(
	input: JsonRecord,
	nestedKeys: string[],
	kind: CodewikiBuildToolInput["kind"],
	defaultSummary: string,
): CodewikiBuildToolInput | null {
	const nested = nestedInput(input, nestedKeys) ?? {};
	const picked = pickKnown(input, BUILD_KEYS);
	const merged = { ...picked, ...nested };
	delete merged.kind;
	if (!Object.keys(merged).length) return null;
	return {
		...merged,
		kind,
		summary: String(merged.summary || input.summary || defaultSummary),
	} as CodewikiBuildToolInput;
}

function materializeDecisionTableInput(
	input: JsonRecord,
	action: string,
): JsonRecord | null {
	const nested = nestedInput(input, ["decision_table", "decision_rows"]);
	const base =
		nested ??
		pickKnown(input, [
			"table_id",
			"row_id",
			"row_ids",
			"row_actions",
			"summary",
			"source",
			"scope",
			"rows",
			"alternative",
		]);
	if (!Object.keys(base).length) return null;
	return {
		...base,
		action: action === "rows" ? "accept" : action,
	};
}

function materializeRoadmapInput(
	input: JsonRecord,
): CodewikiRoadmapToolInput | null {
	const nested = nestedInput(input, ["roadmap", "roadmap_update"]);
	const picked = pickKnown(input, [
		"action",
		"refresh",
		"taskId",
		"tasks",
		"sprint",
		"patch",
		"evidence",
		"summary",
	]);
	const merged = { ...picked, ...nested };
	if (merged.action === "plan" || merged.action === "roadmap")
		delete merged.action;
	if (!merged.action) {
		if (merged.sprint) merged.action = "sprint";
		else if (merged.tasks) merged.action = "create";
		else if (merged.taskId && (merged.patch || merged.evidence))
			merged.action = "update";
	}
	return merged.action ? (merged as CodewikiRoadmapToolInput) : null;
}

function materializeImplementationRoadmapInput(
	input: JsonRecord,
): CodewikiRoadmapToolInput | null {
	const evidence = input.roadmap_evidence ?? input.evidence;
	if (!isRecord(evidence)) return null;
	const taskId = input.taskId || input.task_id || input.task_id;
	if (!taskId && !input.roadmap) return null;
	return {
		action: "update",
		taskId: String(taskId),
		evidence,
		refresh: input.refresh,
	} as CodewikiRoadmapToolInput;
}

function materializeGatewayInput(input: JsonRecord): JsonRecord | null {
	const nested = nestedInput(input, ["gateway", "validation", "gate"]);
	const picked = pickKnown(input, [
		"profile",
		"gate",
		"sprint_id",
		"task_id",
		"verdict",
		"rationale",
		"checks",
		"issues",
		"source",
		"policy_profile",
		"required_audits",
		"audit_refs",
		"audit_reports",
		"failed_criteria",
		"blocking_questions",
		"failure_class",
		"recommended_next_loop",
		"stop_reason",
		"isolation",
		"preflight_only",
		"refresh",
	]);
	const merged = { ...picked, ...nested };
	if (!merged.checks && Array.isArray(input.checks_run))
		merged.checks = input.checks_run;
	if (String(input.action || "") === "preflight") merged.preflight_only = true;
	return Object.keys(merged).length ? merged : null;
}

function operation(
	primitive: string,
	action: string | undefined,
	result: any,
): CodewikiWorkflowOperation {
	return {
		primitive,
		action,
		summary: String(result?.summary || result?.result?.summary || "ok"),
		result,
	};
}

function collectArtifactRefs(
	operations: CodewikiWorkflowOperation[],
): string[] {
	const refs = new Set<string>();
	for (const op of operations) {
		const values = [
			op.result,
			(op.result as any)?.result,
			(op.result as any)?.result?.data,
		];
		for (const value of values) {
			if (isRecord(value) && typeof value.path === "string")
				refs.add(value.path);
		}
	}
	return [...refs].sort();
}

function workflowResult(
	tool: CodewikiWorkflowResult["tool"],
	action: string,
	operations: CodewikiWorkflowOperation[],
	compatibilityTools: string[],
): CodewikiWorkflowResult {
	if (!operations.length) {
		throw new Error(
			`${tool} requires at least one runnable workflow operation.`,
		);
	}
	return {
		tool,
		action,
		operations,
		artifact_refs: collectArtifactRefs(operations),
		compatibility_tools: compatibilityTools,
		result: operations.at(-1)?.result,
		summary: `${tool}: ${operations.map((item) => item.summary).join("; ")}`,
	};
}

export async function executeCodewikiDecideTool(
	project: WikiProject,
	input: JsonRecord,
): Promise<CodewikiWorkflowResult> {
	const action = String(
		input.action ||
			(input.row_actions
				? "rows"
				: input.rows
					? "propose"
					: input.decision_build || input.build
						? "build"
						: "decide"),
	);
	const operations: CodewikiWorkflowOperation[] = [];
	const decisionTableAction =
		action === "decide" && input.row_actions
			? "rows"
			: action === "decide" && input.rows
				? "propose"
				: DECISION_TABLE_ACTIONS.has(action) || action === "rows"
					? action
					: null;
	if (decisionTableAction) {
		const decisionTableInput = materializeDecisionTableInput(
			input,
			decisionTableAction,
		);
		if (decisionTableInput) {
			const result =
				decisionTableAction === "rows"
					? await executeCodewikiDecisionTool(project, {
							action: "rows",
							table_id: String(decisionTableInput.table_id || ""),
							row_actions: decisionTableInput.row_actions || [],
							summary: decisionTableInput.summary,
							source: decisionTableInput.source,
						} as any)
					: await executeCodewikiDecisionTableTool(
							project,
							decisionTableInput as any,
						);
			operations.push(
				operation("wiki_decision_table", decisionTableAction, result),
			);
		}
	}
	const buildInput = materializeBuildInput(
		input,
		["decision_build", "build"],
		"decision",
		"CodeWiki decision workflow build",
	);
	if (
		buildInput &&
		(action === "build" ||
			action === "decide" ||
			input.decision_build ||
			input.build)
	) {
		const result = await executeCodewikiBuildTool(project, buildInput);
		operations.push(operation("wiki_build", "decision", result));
	}
	return workflowResult("wiki_decide", action, operations, [
		"wiki_decision_table",
		"wiki_build(kind=decision)",
	]);
}

export async function executeCodewikiPlanTool(
	project: WikiProject,
	input: JsonRecord,
	ports: CodewikiPlanToolPorts,
): Promise<CodewikiWorkflowResult> {
	const action = String(
		input.action || (input.planning_build || input.build ? "build" : "plan"),
	);
	const operations: CodewikiWorkflowOperation[] = [];
	const roadmapInput = materializeRoadmapInput(input);
	if (
		roadmapInput &&
		(ROADMAP_ACTIONS.has(String(roadmapInput.action)) ||
			action === "plan" ||
			action === "roadmap")
	) {
		const result = await executeCodewikiRoadmapTool(
			project,
			roadmapInput,
			ports.roadmap,
		);
		operations.push(
			operation("wiki_roadmap", String(roadmapInput.action), result),
		);
	}
	const buildInput = materializeBuildInput(
		input,
		["planning_build", "build"],
		"planning",
		"CodeWiki planning workflow build",
	);
	if (
		buildInput &&
		(action === "build" ||
			action === "plan" ||
			input.planning_build ||
			input.build)
	) {
		const result = await executeCodewikiBuildTool(project, buildInput);
		operations.push(operation("wiki_build", "planning", result));
	}
	return workflowResult("wiki_plan", action, operations, [
		"wiki_roadmap",
		"wiki_build(kind=planning)",
	]);
}

export async function executeCodewikiImplementTool(
	project: WikiProject,
	input: JsonRecord,
	ports: CodewikiImplementToolPorts,
): Promise<CodewikiWorkflowResult> {
	const action = String(
		input.action ||
			(input.implementation_build || input.build ? "build" : "implement"),
	);
	const operations: CodewikiWorkflowOperation[] = [];
	const roadmapInput = materializeImplementationRoadmapInput(input);
	if (roadmapInput) {
		const result = await executeCodewikiRoadmapTool(
			project,
			roadmapInput,
			ports.roadmap,
		);
		operations.push(operation("wiki_roadmap", "update:evidence", result));
	}
	const buildInput = materializeBuildInput(
		input,
		["implementation_build", "build"],
		"implementation",
		"CodeWiki implementation workflow build",
	);
	if (buildInput) {
		if (!buildInput.task_id && (input.taskId || input.task_id)) {
			buildInput.task_id = String(input.taskId || input.task_id);
		}
		const result = await executeCodewikiBuildTool(project, buildInput);
		operations.push(operation("wiki_build", "implementation", result));
	}
	return workflowResult("wiki_implement", action, operations, [
		"wiki_roadmap(action=update evidence)",
		"wiki_build(kind=implementation)",
	]);
}

export async function executeCodewikiGateTool(
	project: WikiProject,
	input: JsonRecord,
): Promise<CodewikiWorkflowResult> {
	const action = String(input.action || (input.audit ? "audit" : "gate"));
	const operations: CodewikiWorkflowOperation[] = [];
	const auditInput = nestedInput(input, ["audit"]);
	if (
		auditInput ||
		action === "audit" ||
		hasAnyKey(input, ["profiles", "paths", "layers", "changed", "full"])
	) {
		const report = await executeCodewikiAudit(
			project,
			(auditInput ?? input) as any,
		);
		operations.push(
			operation("wiki_audit", "audit", {
				summary: formatAuditReport(report),
				report,
			}),
		);
	}
	const gatewayInput = materializeGatewayInput(input);
	if (
		gatewayInput &&
		(action !== "audit" ||
			input.gateway ||
			input.validation ||
			input.gate ||
			input.profile)
	) {
		const result = await executeCodewikiValidationTool(
			project,
			gatewayInput as any,
		);
		operations.push(
			operation(
				"wiki_gateway",
				gatewayInput.preflight_only ? "preflight" : "validate",
				result,
			),
		);
	}
	return workflowResult("wiki_gate", action, operations, [
		"wiki_audit",
		"wiki_gateway",
	]);
}

export async function executeCodewikiRuntimeTool(
	project: WikiProject,
	input: JsonRecord,
	ports: CodewikiRuntimeToolPorts,
): Promise<CodewikiWorkflowResult> {
	const action = String(input.action || "runtime");
	const operations: CodewikiWorkflowOperation[] = [];
	const sessionInput = nestedInput(input, ["session"]);
	if (sessionInput || SESSION_ACTIONS.has(action)) {
		const result = await executeCodewikiSessionTool(
			project,
			(sessionInput ?? input) as CodewikiSessionToolInput,
			ports.session,
		);
		operations.push(operation("wiki_session", result.action, result));
	}
	const artifactInput = nestedInput(input, [
		"artifact_status",
		"lease",
		"claim",
	]);
	if (artifactInput || ARTIFACT_STATUS_ACTIONS.has(action)) {
		const result = await executeCodewikiArtifactStatusTool(
			project,
			(artifactInput ?? input) as CodewikiArtifactStatusToolInput,
			ports.artifactStatus,
		);
		operations.push(
			operation(
				"wiki_artifact_status",
				String((artifactInput ?? input).action || action),
				result,
			),
		);
	}
	const agencyInput = nestedInput(input, ["agency", "schedule"]);
	if (agencyInput || AGENCY_ACTIONS.has(action) || input.mode) {
		const result = await executeCodewikiAgencyTool(
			project,
			(agencyInput ?? input) as any,
			ports.agency,
		);
		operations.push(
			operation("wiki_agency", String(result.mode || "agency"), result),
		);
	}
	const gcInput = nestedInput(input, ["gc", "archive"]);
	if (gcInput || GC_ACTIONS.has(action)) {
		const result = await executeCodewikiGcTool(
			project,
			(gcInput ?? input) as any,
		);
		operations.push(
			operation("wiki_gc", String((gcInput ?? input).action || action), result),
		);
	}
	return workflowResult("wiki_runtime", action, operations, [
		"wiki_session",
		"wiki_artifact_status",
		"wiki_agency",
		"wiki_gc",
	]);
}
