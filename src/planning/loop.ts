import {
	componentsForRefs,
	componentSupportsSourcePath,
	componentSupportsTestPath,
	unknownComponentRefs,
	type SourceMapComponent,
	type SourceMapContract,
} from "../knowledge/source-map.ts";
import {
	loopQualityRunnerSummary,
	type LoopQualityJudgeExecutionOptions,
	type RunLoopQualityGraphResult,
} from "../loops/evaluator.ts";
import {
	loopGraphLayers,
	loopQualityGraphRef,
	loopQualityJudgeSpecForNode,
	loopQualityMethodForMode,
	LOOP_QUALITY_GRAPH_SCHEMA_VERSION,
	type LoopQualityGraph,
	type LoopQualityGraphNode,
} from "../loops/graph.ts";
import { qualityDiagnosticsFromStandards } from "../loops/feedback.ts";
import {
	criteriaFromQualityStandards,
	loopQualityStandardSatisfied,
} from "../loops/quality-standards.ts";
import { invalidTraceRefs } from "../traces/refs.ts";
import type {
	ExitDetails,
	ExitFinding,
	ExitRemediationItem,
	ExitRoute,
	LoopRoutePlan,
} from "../traces/types.ts";
import { planningConflicts } from "./conflicts.ts";
import {
	evaluatePlanningQualityStandards,
	planningIssueRefs,
	runPlanningQualityStandards,
} from "./quality-standards.ts";
import { workItemsForDecisionRef } from "./materialization.ts";
import type { PlanningDecisionResolution, PlanningWorkItem } from "./types.ts";

export type PlanningExitIssueCode =
	| "missing_decision_coverage"
	| "unknown_decision_ref"
	| "invalid_work_item"
	| "missing_technical_requirements"
	| "missing_verification"
	| "missing_worker_profile"
	| "invalid_planning_depth"
	| "invalid_micro_plan_dependency"
	| "invalid_micro_plan_decision_count"
	| "missing_planning_assessment"
	| "planning_assessment_not_worker_ready"
	| "missing_uncertainty_resolution"
	| "unresolved_planning_uncertainty"
	| "missing_right_sizing"
	| "work_unit_not_right_sized"
	| "invalid_resolution"
	| "invalid_resolution_kind"
	| "route_back_resolution"
	| "path_conflict"
	| "duplicate_work_item_id"
	| "invalid_acceptance_criterion"
	| "duplicate_acceptance_criterion_id"
	| "missing_component_ref"
	| "unknown_component_ref"
	| "invalid_component_contract"
	| "path_outside_component_scope"
	| "verification_outside_component_tests"
	| "unknown_dependency"
	| "dependency_cycle"
	| "invalid_traceability_ref"
	| "invalid_trigger"
	| "invalid_trigger_kind"
	| "invalid_trigger_run_mode"
	| "invalid_trigger_concurrency"
	| "semantic_work_unit_not_atomic"
	| "semantic_acceptance_not_testable"
	| "semantic_scope_too_broad";

export interface PlanningExitIssue {
	code: PlanningExitIssueCode;
	decisionRef?: string;
	workItemId?: string;
	ref?: string;
	componentRef?: string;
	route?: ExitRoute;
	message: string;
}

const KNOWN_TRIGGER_KINDS = new Set<string>([
	"schedule",
	"trigger",
	"hook",
	"manual",
]);
const KNOWN_TRIGGER_RUN_MODES = new Set<string>(["new_trace"]);
const KNOWN_TRIGGER_CONCURRENCY = new Set<string>([
	"skip_if_active",
	"queue",
	"replace",
]);

const KNOWN_RESOLUTION_KINDS = new Set<string>([
	"work-unit",
	"deferred",
	"already-implemented",
	"route-back",
	"knowledge-only",
	"non-executable",
]);

export interface PlanningExitInput {
	decisionRefs: string[];
	workItems: PlanningWorkItem[];
	resolutions: PlanningDecisionResolution[];
	componentMap?: SourceMapContract;
	qualityJudge?: LoopQualityJudgeExecutionOptions;
}

export interface PlanningExitResult extends ExitDetails {
	passed: boolean;
	issues: PlanningExitIssue[];
	coveredDecisionRefs: string[];
	workUnitIds: string[];
}

export const PLANNING_LOOP_GRAPH: LoopQualityGraph<PlanningExitIssueCode> = {
	graphId: "planning.loop",
	graphVersion: "0.3.0.loop.5",
	schemaVersion: LOOP_QUALITY_GRAPH_SCHEMA_VERSION,
	layers: loopGraphLayers([
		"hard_gate",
		"input_contract",
		"trace_fidelity",
		"coverage",
		"scope_control",
		"specificity",
		"evidence_quality",
		"project_fit",
		"repairability",
		"pipeline_carryover",
		"exit_loss",
	]),
	nodes: [
		planningNode({
			id: "decision_coverage_complete",
			layer: "coverage",
			standardType: "trace_fidelity",
			weight: 12,
			cost: 12,
			hardGate: true,
			description:
				"Every accepted decision ref is covered by a work unit or explicit resolution.",
			codes: ["missing_decision_coverage", "unknown_decision_ref"],
		}),
		planningNode({
			id: "worker_units_self_contained",
			layer: "input_contract",
			standardType: "loop_contract",
			weight: 12,
			cost: 12,
			hardGate: true,
			description:
				"Each work item has enough bounded context to be claimed by one implementation worker.",
			codes: ["invalid_work_item", "duplicate_work_item_id"],
		}),
		planningNode({
			id: "technical_requirements_complete",
			layer: "specificity",
			standardType: "user_value",
			weight: 12,
			cost: 12,
			description:
				"Each work item breaks decision intent into concrete technical requirements.",
			codes: ["missing_technical_requirements"],
		}),
		planningNode({
			id: "acceptance_and_verification_testable",
			layer: "evidence_quality",
			standardType: "evidence_quality",
			weight: 14,
			cost: 14,
			hardGate: true,
			description:
				"Each work item has stable acceptance criteria and verification refs or commands.",
			codes: [
				"invalid_acceptance_criterion",
				"duplicate_acceptance_criterion_id",
				"missing_verification",
			],
		}),
		planningNode({
			id: "planning_depth_accounted",
			layer: "pipeline_carryover",
			standardType: "scope_control",
			weight: 8,
			cost: 8,
			hardGate: true,
			description:
				"Each work item declares standard or micro planning depth; micro-plans stay dependency-free and cover one decision.",
			codes: [
				"invalid_planning_depth",
				"invalid_micro_plan_dependency",
				"invalid_micro_plan_decision_count",
			],
		}),
		planningNode({
			id: "worker_assignment_ready",
			layer: "project_fit",
			standardType: "project_fit",
			mode: "agent",
			weight: 12,
			cost: 12,
			description:
				"Each work item declares worker profile and agent judgment that the unit is independent and implementation-ready.",
			codes: [
				"missing_worker_profile",
				"missing_planning_assessment",
				"planning_assessment_not_worker_ready",
			],
		}),
		planningNode({
			id: "work_unit_atomic_judged",
			layer: "scope_control",
			standardType: "scope_control",
			method: "model_judge",
			weight: 12,
			cost: 12,
			description:
				"Independent judge verifies each work unit is atomic enough for one implementation worker and is not a disguised sprint.",
			codes: ["semantic_work_unit_not_atomic"],
		}),
		planningNode({
			id: "acceptance_criteria_testable_judged",
			layer: "evidence_quality",
			standardType: "evidence_quality",
			method: "model_judge",
			weight: 12,
			cost: 12,
			description:
				"Independent judge verifies acceptance criteria and verification commands are concrete enough to prove implementation completion.",
			codes: ["semantic_acceptance_not_testable"],
		}),
		planningNode({
			id: "scope_minimal_judged",
			layer: "scope_control",
			standardType: "scope_control",
			method: "model_judge",
			weight: 10,
			cost: 10,
			description:
				"Independent judge verifies path scopes and dependencies are no broader than needed for the accepted decisions.",
			codes: ["semantic_scope_too_broad"],
		}),
		planningNode({
			id: "uncertainty_resolved",
			layer: "repairability",
			standardType: "repairability",
			mode: "agent",
			weight: 12,
			cost: 12,
			description:
				"No unresolved planning uncertainty remains; decision or user authority is routed instead of leaking into implementation.",
			codes: [
				"missing_uncertainty_resolution",
				"unresolved_planning_uncertainty",
			],
		}),
		planningNode({
			id: "work_unit_right_sized",
			layer: "project_fit",
			standardType: "project_fit",
			mode: "agent",
			weight: 10,
			cost: 10,
			description:
				"Each work unit is neither sprint-sized nor tiny busywork; sprint remains a grouping or claim batch.",
			codes: ["missing_right_sizing", "work_unit_not_right_sized"],
		}),
		planningNode({
			id: "source_ownership_aligned",
			layer: "scope_control",
			standardType: "scope_control",
			weight: 12,
			cost: 12,
			hardGate: true,
			description:
				"Component refs, path scopes, and verification refs align with source ownership contracts.",
			codes: [
				"missing_component_ref",
				"unknown_component_ref",
				"invalid_component_contract",
				"path_outside_component_scope",
				"verification_outside_component_tests",
			],
		}),
		planningNode({
			id: "dependency_order_clear",
			layer: "scope_control",
			standardType: "scope_control",
			weight: 14,
			cost: 14,
			hardGate: true,
			description:
				"Dependencies are known, acyclic, and order overlapping work before implementation.",
			codes: ["unknown_dependency", "dependency_cycle", "path_conflict"],
		}),
		planningNode({
			id: "triggers_valid",
			layer: "repairability",
			standardType: "repairability",
			weight: 8,
			cost: 8,
			hardGate: true,
			description:
				"Recurring, triggered, or hook-based work has a complete planned trigger before runtime can start runs from it.",
			codes: [
				"invalid_trigger",
				"invalid_trigger_kind",
				"invalid_trigger_run_mode",
				"invalid_trigger_concurrency",
			],
		}),
		planningNode({
			id: "resolutions_accounted",
			layer: "repairability",
			standardType: "repairability",
			weight: 10,
			cost: 10,
			hardGate: true,
			description:
				"Planning resolutions use a known kind, carry required evidence, and route-back resolutions return to decision authority before implementation.",
			codes: [
				"invalid_resolution",
				"invalid_resolution_kind",
				"route_back_resolution",
			],
		}),
		planningNode({
			id: "traceability_refs_canonical",
			layer: "trace_fidelity",
			standardType: "trace_fidelity",
			weight: 8,
			cost: 8,
			hardGate: true,
			description:
				"Planning refs are canonical trace, KB, Git, digest, source, or test refs.",
			codes: ["invalid_traceability_ref"],
		}),
	],
};

function planningNode(
	node: Omit<
		LoopQualityGraphNode<PlanningExitIssueCode>,
		"method" | "repairTarget"
	> & {
		method?: LoopQualityGraphNode<PlanningExitIssueCode>["method"];
		repairTarget?: LoopQualityGraphNode<PlanningExitIssueCode>["repairTarget"];
	},
): LoopQualityGraphNode<PlanningExitIssueCode> {
	const resolved: LoopQualityGraphNode<PlanningExitIssueCode> = {
		method: node.method || loopQualityMethodForMode(node.mode),
		gate: node.hardGate || node.layer === "hard_gate" ? "hard" : "soft",
		timeoutMs: 50,
		repairTarget: "planning",
		...node,
	};
	return {
		...resolved,
		judge: resolved.judge || loopQualityJudgeSpecForNode(resolved),
	};
}

export function evaluatePlanningExit(
	input: PlanningExitInput,
): PlanningExitResult {
	const issues = collectPlanningExitIssues(input);
	const qualityStandards = evaluatePlanningExitGraph(issues);
	return planningExitResultFromQuality({
		input,
		issues,
		qualityStandards,
	});
}

export async function evaluatePlanningExitWithRunner(
	input: PlanningExitInput,
): Promise<PlanningExitResult> {
	const issues = collectPlanningExitIssues(input);
	const quality = await runPlanningQualityStandards(
		PLANNING_LOOP_GRAPH,
		issues,
		{
			...(input.qualityJudge || {}),
			judgeInput: input.qualityJudge?.judgeInput || planningJudgeInput(input),
		},
	);
	return planningExitResultFromQuality({
		input,
		issues,
		qualityStandards: quality.standards,
		qualityRunner: quality,
	});
}

function planningJudgeInput(input: PlanningExitInput): Record<string, unknown> {
	return {
		loop: "planning",
		decisionRefs: input.decisionRefs,
		workItems: input.workItems.map((item) => ({
			id: item.id,
			title: item.title,
			decisionRefs: item.decisionRefs,
			outcome: item.outcome,
			technicalRequirements: item.technicalRequirements,
			acceptance: item.acceptance,
			acceptanceCriteria: item.acceptanceCriteria,
			componentRefs: item.componentRefs,
			pathScopes: item.pathScopes,
			planningDepth: item.planningDepth,
			verification: item.verification,
			workerProfile: item.workerProfile,
			planningAssessment: item.planningAssessment,
			dependsOn: item.dependsOn,
			trigger: item.trigger,
		})),
		resolutions: input.resolutions,
		componentMap: input.componentMap,
	};
}

function planningExitResultFromQuality(input: {
	input: PlanningExitInput;
	issues: PlanningExitIssue[];
	qualityStandards: PlanningExitResult["qualityStandards"];
	qualityRunner?: RunLoopQualityGraphResult;
}): PlanningExitResult {
	const remediation = input.issues.map(issueRemediation);
	const diagnostics = qualityDiagnosticsFromStandards(
		input.qualityStandards || [],
		remediation,
	);
	const verdict = planningVerdictFromQuality(
		input.issues,
		input.qualityStandards || [],
	);
	const workUnitIds = input.input.workItems.map((item) => item.id);
	return {
		passed: verdict === "pass",
		verdict,
		issues: input.issues,
		criteria: criteriaFromQualityStandards(input.qualityStandards || []),
		qualityStandards: input.qualityStandards,
		qualityGraph: loopQualityGraphRef(PLANNING_LOOP_GRAPH),
		...(input.qualityRunner
			? { qualityRunner: loopQualityRunnerSummary(input.qualityRunner.runner) }
			: {}),
		findings: input.issues.map(issueFinding),
		remediation,
		diagnostics,
		route: planningRoute(verdict, input.issues, workUnitIds),
		routePlan: planningRoutePlan(verdict, input.issues, workUnitIds),
		coveredDecisionRefs: coveredDecisionRefs(input.input),
		workUnitIds,
	};
}

export function evaluatePlanningExitGraph(issues: PlanningExitIssue[]) {
	return evaluatePlanningQualityStandards(PLANNING_LOOP_GRAPH, issues);
}

export function collectPlanningExitIssues(
	input: PlanningExitInput,
): PlanningExitIssue[] {
	return [
		...coverageIssues(input),
		...unknownDecisionRefIssues(input),
		...duplicateWorkItemIssues(input.workItems),
		...workItemIssues(input.workItems),
		...technicalRequirementIssues(input.workItems),
		...verificationIssues(input.workItems),
		...workerProfileIssues(input.workItems),
		...planningDepthIssues(input.workItems),
		...planningAssessmentIssues(input.workItems),
		...planningUncertaintyIssues(input.workItems),
		...rightSizingIssues(input.workItems),
		...acceptanceCriterionIssues(input.workItems),
		...componentAlignmentIssues(input),
		...dependencyIssues(input.workItems),
		...triggerIssues(input.workItems),
		...traceabilityRefIssues(input),
		...resolutionKindIssues(input.resolutions),
		...resolutionIssues(input.resolutions),
		...routeBackResolutionIssues(input.resolutions),
		...conflictIssues(input.workItems),
	];
}

function coverageIssues(input: PlanningExitInput): PlanningExitIssue[] {
	return input.decisionRefs.flatMap((decisionRef) => {
		const workItems = workItemsForDecisionRef(input.workItems, decisionRef);
		const resolutions = input.resolutions.filter(
			(resolution) => resolution.decisionRef === decisionRef,
		);
		if (workItems.length || resolutions.length) return [];
		return [
			{
				code: "missing_decision_coverage" as const,
				decisionRef,
				message: `Planning does not cover decision ${decisionRef}.`,
			},
		];
	});
}

function unknownDecisionRefIssues(
	input: PlanningExitInput,
): PlanningExitIssue[] {
	const known = new Set(input.decisionRefs);
	return [
		...input.workItems.flatMap((item) => item.decisionRefs),
		...input.resolutions.map((item) => item.decisionRef),
	]
		.filter((decisionRef) => !known.has(decisionRef))
		.map((decisionRef) => ({
			code: "unknown_decision_ref" as const,
			decisionRef,
			message: `Planning references unknown decision ${decisionRef}.`,
		}));
}

function workItemIssues(items: PlanningWorkItem[]): PlanningExitIssue[] {
	return items.flatMap((item) => {
		const missing = [
			item.id ? "" : "id",
			item.decisionRefs.length ? "" : "decisionRefs",
			item.outcome ? "" : "outcome",
			item.acceptanceCriteria.length ? "" : "acceptanceCriteria",
			item.pathScopes.length ? "" : "pathScopes",
		].filter(Boolean);
		if (missing.length === 0) return [];
		return [
			{
				code: "invalid_work_item" as const,
				workItemId: item.id,
				message: `Planning work item ${item.id || "<missing>"} is missing ${missing.join(", ")}.`,
			},
		];
	});
}

function technicalRequirementIssues(
	items: PlanningWorkItem[],
): PlanningExitIssue[] {
	return items.flatMap((item) => {
		if (item.technicalRequirements.length > 0) return [];
		return [
			{
				code: "missing_technical_requirements" as const,
				workItemId: item.id,
				message: `Planning work item ${item.id} needs technical requirements for implementation handoff.`,
			},
		];
	});
}

function verificationIssues(items: PlanningWorkItem[]): PlanningExitIssue[] {
	return items.flatMap((item) => {
		if (item.verification.length > 0) return [];
		return [
			{
				code: "missing_verification" as const,
				workItemId: item.id,
				message: `Planning work item ${item.id} needs verification refs or commands.`,
			},
		];
	});
}

function workerProfileIssues(items: PlanningWorkItem[]): PlanningExitIssue[] {
	return items.flatMap((item) => {
		if (item.workerProfile) return [];
		return [
			{
				code: "missing_worker_profile" as const,
				workItemId: item.id,
				message: `Planning work item ${item.id} needs a worker profile for assignment.`,
			},
		];
	});
}

function planningDepthIssues(items: PlanningWorkItem[]): PlanningExitIssue[] {
	return items.flatMap((item): PlanningExitIssue[] => {
		const issues: PlanningExitIssue[] = [];
		if (!["micro", "standard"].includes(item.planningDepth)) {
			issues.push({
				code: "invalid_planning_depth",
				workItemId: item.id,
				message: `Planning work item ${item.id} has invalid planningDepth ${item.planningDepth}.`,
			});
		}
		if (item.planningDepth === "micro") {
			if (item.dependsOn.length > 0) {
				issues.push({
					code: "invalid_micro_plan_dependency",
					workItemId: item.id,
					message: `Micro-plan work item ${item.id} must not depend on other work items.`,
				});
			}
			if (item.decisionRefs.length !== 1) {
				issues.push({
					code: "invalid_micro_plan_decision_count",
					workItemId: item.id,
					message: `Micro-plan work item ${item.id} must cover exactly one decision ref.`,
				});
			}
		}
		return issues;
	});
}

function planningAssessmentIssues(
	items: PlanningWorkItem[],
): PlanningExitIssue[] {
	return items.flatMap((item): PlanningExitIssue[] => {
		const assessment = item.planningAssessment;
		const missingStance = !assessment.stance;
		const missingIndependence = !assessment.independence;
		const missingImplementationReadiness = !assessment.implementationReadiness;
		const missingRationale = !assessment.rationale;
		if (
			missingStance ||
			missingIndependence ||
			missingImplementationReadiness ||
			missingRationale
		) {
			return [
				{
					code: "missing_planning_assessment" as const,
					workItemId: item.id,
					message: `Planning work item ${item.id} needs agent assessment for independence and implementation readiness.`,
				},
			];
		}
		if (assessment.stance !== "worker_ready") {
			return [
				{
					code: "planning_assessment_not_worker_ready" as const,
					workItemId: item.id,
					message: `Planning work item ${item.id} is not assessed as worker-ready.`,
				},
			];
		}
		return [];
	});
}

function planningUncertaintyIssues(
	items: PlanningWorkItem[],
): PlanningExitIssue[] {
	return items.flatMap((item): PlanningExitIssue[] => {
		const assessment = item.planningAssessment;
		const issues: PlanningExitIssue[] = [];
		if (!assessment.uncertaintyResolution) {
			issues.push({
				code: "missing_uncertainty_resolution",
				workItemId: item.id,
				message: `Planning work item ${item.id} must state that uncertainty is resolved or name where it is routed.`,
			});
		}
		if (assessment.uncertainties.length > 0) {
			issues.push({
				code: "unresolved_planning_uncertainty",
				workItemId: item.id,
				route: uncertaintyRoute(assessment.uncertaintyOwner),
				message: `Planning work item ${item.id} has unresolved uncertainty: ${assessment.uncertainties.join("; ")}.`,
			});
		}
		return issues;
	});
}

function rightSizingIssues(items: PlanningWorkItem[]): PlanningExitIssue[] {
	return items.flatMap((item): PlanningExitIssue[] => {
		const assessment = item.planningAssessment;
		if (!assessment.workUnitSize || !assessment.rightSizing) {
			return [
				{
					code: "missing_right_sizing" as const,
					workItemId: item.id,
					message: `Planning work item ${item.id} needs right-sizing assessment so sprint-sized or tiny busywork is not assigned as a worker unit.`,
				},
			];
		}
		if (assessment.workUnitSize !== "right_sized") {
			return [
				{
					code: "work_unit_not_right_sized" as const,
					workItemId: item.id,
					message: `Planning work item ${item.id} is assessed as ${assessment.workUnitSize}, not right_sized.`,
				},
			];
		}
		return [];
	});
}

function acceptanceCriterionIssues(
	items: PlanningWorkItem[],
): PlanningExitIssue[] {
	return items.flatMap((item) => [
		...invalidAcceptanceCriterionIssues(item),
		...duplicateAcceptanceCriterionIssues(item),
	]);
}

function invalidAcceptanceCriterionIssues(
	item: PlanningWorkItem,
): PlanningExitIssue[] {
	return item.acceptanceCriteria.flatMap((criterion) => {
		if (criterion.id && criterion.text) return [];
		return [
			{
				code: "invalid_acceptance_criterion" as const,
				workItemId: item.id,
				message: `Planning work item ${item.id} has acceptance criterion missing id or text.`,
			},
		];
	});
}

function duplicateAcceptanceCriterionIssues(
	item: PlanningWorkItem,
): PlanningExitIssue[] {
	const counts = new Map<string, number>();
	for (const criterion of item.acceptanceCriteria) {
		counts.set(criterion.id, (counts.get(criterion.id) || 0) + 1);
	}
	return [...counts.entries()]
		.filter(([id, count]) => id && count > 1)
		.map(([id]) => ({
			code: "duplicate_acceptance_criterion_id" as const,
			workItemId: item.id,
			message: `Planning work item ${item.id} acceptance criterion id ${id} appears more than once.`,
		}));
}

function componentAlignmentIssues(
	input: PlanningExitInput,
): PlanningExitIssue[] {
	if (!input.componentMap) return [];
	return [
		...missingComponentRefIssues(input.workItems),
		...unknownComponentRefIssues(input),
		...invalidComponentContractIssues(input),
		...componentPathScopeIssues(input),
		...componentVerificationIssues(input),
	];
}

function missingComponentRefIssues(
	items: PlanningWorkItem[],
): PlanningExitIssue[] {
	return items.flatMap((item) => {
		if (item.componentRefs.length > 0) return [];
		return [
			{
				code: "missing_component_ref" as const,
				workItemId: item.id,
				message: `Planning work item ${item.id} needs componentRefs for source-map alignment.`,
			},
		];
	});
}

function unknownComponentRefIssues(
	input: PlanningExitInput,
): PlanningExitIssue[] {
	if (!input.componentMap) return [];
	return input.workItems.flatMap((item) =>
		unknownComponentRefs(input.componentMap!, item.componentRefs).map(
			(componentRef) => ({
				code: "unknown_component_ref" as const,
				workItemId: item.id,
				componentRef,
				message: `Planning work item ${item.id} references unknown component ${componentRef}.`,
			}),
		),
	);
}

function invalidComponentContractIssues(
	input: PlanningExitInput,
): PlanningExitIssue[] {
	if (!input.componentMap) return [];
	const componentRefs = uniqueStrings(
		input.workItems.flatMap((item) => item.componentRefs),
	);
	return componentsForRefs(input.componentMap, componentRefs).flatMap(
		(component) => {
			const missing = componentContractMissingFields(component);
			if (missing.length === 0) return [];
			return [
				{
					code: "invalid_component_contract" as const,
					componentRef: component.id,
					message: `Source-map component ${component.id} is missing ${missing.join(", ")}.`,
				},
			];
		},
	);
}

function componentPathScopeIssues(
	input: PlanningExitInput,
): PlanningExitIssue[] {
	if (!input.componentMap) return [];
	return input.workItems.flatMap((item) => {
		const components = componentsForRefs(
			input.componentMap!,
			item.componentRefs,
		);
		if (components.length === 0) return [];
		return item.pathScopes.flatMap((pathScope) => {
			if (
				components.some((component) =>
					componentSupportsSourcePath(component, pathScope),
				)
			) {
				return [];
			}
			return [
				{
					code: "path_outside_component_scope" as const,
					workItemId: item.id,
					ref: pathScope,
					message: `Planning work item ${item.id} path scope ${pathScope} is outside declared components ${item.componentRefs.join(", ")}.`,
				},
			];
		});
	});
}

function componentVerificationIssues(
	input: PlanningExitInput,
): PlanningExitIssue[] {
	if (!input.componentMap) return [];
	return input.workItems.flatMap((item) => {
		const components = componentsForRefs(
			input.componentMap!,
			item.componentRefs,
		);
		if (components.length === 0) return [];
		return item.verification
			.filter((verificationRef) => verificationRef.startsWith("tests/"))
			.flatMap((verificationRef) => {
				if (
					components.some((component) =>
						componentSupportsTestPath(component, verificationRef),
					)
				) {
					return [];
				}
				return [
					{
						code: "verification_outside_component_tests" as const,
						workItemId: item.id,
						ref: verificationRef,
						message: `Planning work item ${item.id} verification ${verificationRef} is outside declared component test paths.`,
					},
				];
			});
	});
}

function componentContractMissingFields(
	component: SourceMapComponent,
): string[] {
	return [
		component.doc ? "" : "doc",
		component.sourcePatterns.length ? "" : "source",
		component.testPatterns.length || component.testRationale ? "" : "tests",
	].filter(Boolean);
}

function duplicateWorkItemIssues(
	items: PlanningWorkItem[],
): PlanningExitIssue[] {
	const counts = new Map<string, number>();
	for (const item of items) counts.set(item.id, (counts.get(item.id) || 0) + 1);
	return [...counts.entries()]
		.filter(([id, count]) => id && count > 1)
		.map(([id]) => ({
			code: "duplicate_work_item_id" as const,
			workItemId: id,
			message: `Planning work item id ${id} appears more than once.`,
		}));
}

function dependencyIssues(items: PlanningWorkItem[]): PlanningExitIssue[] {
	return [...unknownDependencyIssues(items), ...dependencyCycleIssues(items)];
}

function unknownDependencyIssues(
	items: PlanningWorkItem[],
): PlanningExitIssue[] {
	const ids = new Set(items.map((item) => item.id));
	return items.flatMap((item) =>
		item.dependsOn
			.filter((dependency) => !ids.has(dependency))
			.map((dependency) => ({
				code: "unknown_dependency" as const,
				workItemId: item.id,
				message: `Planning work item ${item.id} depends on unknown work item ${dependency}.`,
			})),
	);
}

function dependencyCycleIssues(items: PlanningWorkItem[]): PlanningExitIssue[] {
	const byId = new Map(items.map((item) => [item.id, item]));
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const cycleIds = new Set<string>();
	for (const item of items)
		visitDependency(item.id, byId, visiting, visited, cycleIds);
	return [...cycleIds].map((id) => ({
		code: "dependency_cycle" as const,
		workItemId: id,
		message: `Planning work item ${id} participates in a dependency cycle.`,
	}));
}

function visitDependency(
	id: string,
	byId: Map<string, PlanningWorkItem>,
	visiting: Set<string>,
	visited: Set<string>,
	cycleIds: Set<string>,
): void {
	if (!id || visited.has(id)) return;
	if (visiting.has(id)) {
		cycleIds.add(id);
		return;
	}
	const item = byId.get(id);
	if (!item) return;
	visiting.add(id);
	for (const dependency of item.dependsOn)
		visitDependency(dependency, byId, visiting, visited, cycleIds);
	visiting.delete(id);
	visited.add(id);
}

function triggerIssues(items: PlanningWorkItem[]): PlanningExitIssue[] {
	return items.flatMap((item): PlanningExitIssue[] => {
		const trigger = item.trigger;
		if (!trigger) return [];
		const issues: PlanningExitIssue[] = [];
		const missing = [
			trigger.id ? "" : "id",
			trigger.runKeyTemplate ? "" : "runKeyTemplate",
			trigger.owner ? "" : "owner",
			trigger.trigger ? "" : "trigger",
			trigger.refs.length ? "" : "refs",
		].filter(Boolean);
		if (missing.length > 0) {
			issues.push({
				code: "invalid_trigger",
				workItemId: item.id,
				message: `Planning trigger for ${item.id} is missing ${missing.join(", ")}.`,
			});
		}
		if (!KNOWN_TRIGGER_KINDS.has(trigger.kind)) {
			issues.push({
				code: "invalid_trigger_kind",
				workItemId: item.id,
				message: `Planning trigger for ${item.id} has invalid kind ${trigger.kind}.`,
			});
		}
		if (!KNOWN_TRIGGER_RUN_MODES.has(trigger.runMode)) {
			issues.push({
				code: "invalid_trigger_run_mode",
				workItemId: item.id,
				message: `Planning trigger for ${item.id} has invalid runMode ${trigger.runMode}.`,
			});
		}
		if (!KNOWN_TRIGGER_CONCURRENCY.has(trigger.concurrency)) {
			issues.push({
				code: "invalid_trigger_concurrency",
				workItemId: item.id,
				message: `Planning trigger for ${item.id} has invalid concurrency ${trigger.concurrency}.`,
			});
		}
		return issues;
	});
}

function traceabilityRefIssues(input: PlanningExitInput): PlanningExitIssue[] {
	return invalidTraceRefs([
		...input.decisionRefs,
		...input.workItems.flatMap((item) => [
			...item.decisionRefs,
			...item.pathScopes,
			...(item.trigger?.refs || []),
		]),
		...input.resolutions.flatMap((resolution) => [
			resolution.decisionRef,
			...resolution.evidenceRefs,
		]),
	]).map((ref) => ({
		code: "invalid_traceability_ref" as const,
		ref,
		message: `Planning has non-canonical ref ${ref}.`,
	}));
}

function resolutionKindIssues(
	resolutions: PlanningDecisionResolution[],
): PlanningExitIssue[] {
	return resolutions.flatMap((resolution) => {
		if (KNOWN_RESOLUTION_KINDS.has(resolution.kind)) return [];
		return [
			{
				code: "invalid_resolution_kind" as const,
				decisionRef: resolution.decisionRef,
				message: `Planning resolution for ${resolution.decisionRef} has invalid kind ${resolution.kind}.`,
			},
		];
	});
}

function resolutionIssues(
	resolutions: PlanningDecisionResolution[],
): PlanningExitIssue[] {
	return resolutions.flatMap((resolution) => {
		const missing = requiredResolutionFields(resolution);
		if (missing.length === 0) return [];
		return [
			{
				code: "invalid_resolution" as const,
				decisionRef: resolution.decisionRef,
				message: `Planning resolution for ${resolution.decisionRef} is missing ${missing.join(", ")}.`,
			},
		];
	});
}

function requiredResolutionFields(
	resolution: PlanningDecisionResolution,
): string[] {
	if (!KNOWN_RESOLUTION_KINDS.has(resolution.kind)) return [];
	if (resolution.kind === "work-unit")
		return resolution.workUnitIds.length ? [] : ["workUnitIds"];
	if (["deferred", "route-back"].includes(resolution.kind)) {
		return [
			resolution.owner ? "" : "owner",
			resolution.trigger ? "" : "trigger",
			resolution.rationale ? "" : "rationale",
			resolution.evidenceRefs.length ? "" : "evidenceRefs",
		].filter(Boolean);
	}
	return resolution.evidenceRefs.length ? [] : ["evidenceRefs"];
}

function routeBackResolutionIssues(
	resolutions: PlanningDecisionResolution[],
): PlanningExitIssue[] {
	return resolutions.flatMap((resolution) => {
		if (
			resolution.kind !== "route-back" ||
			requiredResolutionFields(resolution).length > 0
		) {
			return [];
		}
		return [
			{
				code: "route_back_resolution" as const,
				decisionRef: resolution.decisionRef,
				route: "decision" as const,
				message: `Planning resolution for ${resolution.decisionRef} routes authority back to decision before implementation can proceed.`,
			},
		];
	});
}

function conflictIssues(items: PlanningWorkItem[]): PlanningExitIssue[] {
	return planningConflicts(items).map((conflict) => ({
		code: "path_conflict" as const,
		workItemId: conflict.leftId,
		message: `Planning work items ${conflict.leftId} and ${conflict.rightId} overlap on ${conflict.pathScopes.join(", ")}.`,
	}));
}

function coveredDecisionRefs(input: PlanningExitInput): string[] {
	return input.decisionRefs.filter(
		(decisionRef) =>
			workItemsForDecisionRef(input.workItems, decisionRef).length > 0 ||
			input.resolutions.some(
				(resolution) => resolution.decisionRef === decisionRef,
			),
	);
}

function planningVerdictFromQuality(
	issues: PlanningExitIssue[],
	standards: PlanningExitResult["qualityStandards"],
): "pass" | "fail" | "block" {
	if (
		blockedIssues(issues).length > 0 ||
		standards?.some((standard) => standard.status === "blocked")
	) {
		return "block";
	}
	if (
		issues.length === 0 &&
		standards?.every((standard) => loopQualityStandardSatisfied(standard))
	) {
		return "pass";
	}
	return "fail";
}

function planningRoute(
	verdict: PlanningExitVerdict,
	issues: PlanningExitIssue[],
	workUnitIds: string[],
): ExitRoute {
	if (verdict === "pass")
		return workUnitIds.length ? "implementation" : "close";
	const [explicitRoute] = issues
		.map((issue) => issue.route)
		.filter((route): route is ExitRoute => Boolean(route));
	if (explicitRoute) return explicitRoute;
	return "planning";
}

function blockedIssues(issues: PlanningExitIssue[]): PlanningExitIssue[] {
	return issues.filter((issue) => issue.route === "user");
}

function planningRoutePlan(
	verdict: PlanningExitVerdict,
	issues: PlanningExitIssue[],
	workUnitIds: string[],
): LoopRoutePlan {
	const route = planningRoute(verdict, issues, workUnitIds);
	const refs = issues.length ? issues.flatMap(planningIssueRefs) : workUnitIds;
	if (route === "implementation") {
		return {
			target: "implementation",
			kind: "advance",
			rationale: "Planning produced worker-ready implementation work units.",
			refs,
		};
	}
	if (route === "close") {
		return {
			target: "close",
			kind: "advance",
			rationale:
				"Planning resolved the accepted decisions without implementation work.",
			refs,
		};
	}
	if (route === "decision") {
		return {
			target: "decision",
			kind: routeKindForPlanningIssues(issues),
			rationale:
				"Planning found ambiguity or authority needs that must return to decision before implementation.",
			refs,
		};
	}
	if (route === "user") {
		return {
			target: "decision",
			kind: "authority_validation",
			rationale:
				"Planning needs explicit user authority, represented as a decision-loop request.",
			refs,
		};
	}
	return {
		target: "continue",
		kind: "continue",
		rationale: "Planning must continue until work units are worker-ready.",
		refs,
	};
}

function routeKindForPlanningIssues(issues: PlanningExitIssue[]): string {
	if (issues.some((issue) => issue.code === "route_back_resolution")) {
		return "scope_change";
	}
	if (issues.some((issue) => issue.route === "decision"))
		return "clarification";
	return "continue";
}

function uncertaintyRoute(owner: string): ExitRoute {
	if (owner === "decision" || owner === "user") return "decision";
	return "planning";
}

type PlanningExitVerdict = "pass" | "fail" | "block";

function issueFinding(issue: PlanningExitIssue): ExitFinding {
	const refs = planningIssueRefs(issue);
	return {
		id: `planning:${issue.code}:${refs[0] || "plan"}`,
		severity: "error",
		criterion: issue.code,
		message: issue.message,
		refs,
		rationale:
			"Planning evidence must cover accepted decisions before implementation consumes it.",
	};
}

function issueRemediation(issue: PlanningExitIssue): ExitRemediationItem {
	const refs = planningIssueRefs(issue);
	return {
		action: planningRemediationAction(issue),
		route: issue.route || "planning",
		refs,
		blocking: true,
	};
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}

const PLANNING_REMEDIATION: Record<PlanningExitIssueCode, string> = {
	missing_decision_coverage:
		"Create a work unit or explicit resolution for the uncovered decision.",
	unknown_decision_ref:
		"Replace the unknown decision ref with a passed decision event ref.",
	invalid_work_item:
		"Complete work item id, decision refs, outcome, acceptance, and path scopes.",
	missing_technical_requirements:
		"Break the work item into concrete technical requirements for implementation.",
	missing_verification:
		"Add verification refs or commands that implementation must run or satisfy.",
	missing_worker_profile:
		"Declare the worker profile needed to claim this unit of work.",
	invalid_planning_depth:
		"Use planningDepth micro or standard on the work item.",
	invalid_micro_plan_dependency:
		"Remove dependencies from the micro-plan or promote it to standard planning.",
	invalid_micro_plan_decision_count:
		"Make the micro-plan cover exactly one decision or promote it to standard planning.",
	missing_planning_assessment:
		"Add agent assessment proving the work item is independent and implementation-ready.",
	planning_assessment_not_worker_ready:
		"Split or clarify the work item until the agent assesses it as worker-ready.",
	missing_uncertainty_resolution:
		"State whether planning uncertainty is resolved locally or routed to decision/user authority.",
	unresolved_planning_uncertainty:
		"Resolve uncertainty in planning, route back to decision, or block for user clarification before implementation.",
	missing_right_sizing:
		"Add agent assessment that the work item is neither sprint-sized nor tiny busywork.",
	work_unit_not_right_sized:
		"Split, merge, or reframe the work item until it is right-sized for one worker.",
	duplicate_work_item_id: "Give every planning work item a stable unique id.",
	invalid_acceptance_criterion:
		"Give every planning acceptance criterion a stable id and testable text.",
	duplicate_acceptance_criterion_id:
		"Give each acceptance criterion within a work item a unique id.",
	missing_component_ref:
		"Attach componentRefs from source-map.yaml to the work item.",
	unknown_component_ref: "Use component ids declared in source-map.yaml.",
	invalid_component_contract:
		"Complete the source-map component entry with doc, source, and tests.",
	path_outside_component_scope:
		"Align path scopes with declared component ownership or choose the correct component.",
	verification_outside_component_tests:
		"Point verification to tests owned by the declared component.",
	unknown_dependency:
		"Replace unknown dependencies with valid work item ids or remove them.",
	dependency_cycle:
		"Break the dependency cycle by reordering or splitting work items.",
	invalid_traceability_ref:
		"Replace weak refs with canonical KB, trace, Git, digest, source, or test refs.",
	invalid_resolution:
		"Complete resolution evidence, owner, trigger, rationale, or work-unit links as required by its kind.",
	invalid_resolution_kind:
		"Use resolution kind work-unit, deferred, already-implemented, route-back, knowledge-only, or non-executable.",
	route_back_resolution:
		"Continue in the decision loop before planning hands work to implementation.",
	path_conflict:
		"Order conflicting work units with a real dependency or split the path scopes.",
	invalid_trigger:
		"Complete trigger id, owner, trigger source, run key template, and canonical refs before implementation consumes recurring, event, or hook work.",
	invalid_trigger_kind: "Use trigger kind schedule, trigger, hook, or manual.",
	invalid_trigger_run_mode:
		"Use runMode new_trace so each due execution has an independent accountable trace.",
	invalid_trigger_concurrency:
		"Use concurrency skip_if_active, queue, or replace.",
	semantic_work_unit_not_atomic:
		"Split or narrow the work unit until an independent judge can verify one worker can complete it atomically.",
	semantic_acceptance_not_testable:
		"Rewrite acceptance criteria and verification until an independent judge can verify they are testable.",
	semantic_scope_too_broad:
		"Narrow path scopes, dependencies, or outcomes until an independent judge can verify minimal scope.",
};

function planningRemediationAction(issue: PlanningExitIssue): string {
	return PLANNING_REMEDIATION[issue.code];
}
