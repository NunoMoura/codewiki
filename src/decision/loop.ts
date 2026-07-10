import {
	loopQualityRunnerSummary,
	type LoopQualityJudgeExecutionOptions,
	type RunLoopQualityGraphResult,
} from "../loops/evaluator.ts";
import { qualityDiagnosticsFromStandards } from "../loops/feedback.ts";
import {
	criteriaFromQualityStandards,
	loopQualityStandardSatisfied,
} from "../loops/quality-standards.ts";
import {
	loopGraphLayers,
	loopQualityGraphRef,
	loopQualityJudgeSpecForNode,
	loopQualityMethodForMode,
	LOOP_QUALITY_GRAPH_SCHEMA_VERSION,
	type LoopQualityGraph,
	type LoopQualityGraphNode,
} from "../loops/graph.ts";
import { invalidTraceRefs } from "../traces/refs.ts";
import {
	decisionTypeDefinitionById,
	normalizeDecisionTypeId,
	riskExceeds,
} from "./type-definitions.ts";
import type {
	ExitDetails,
	ExitFinding,
	ExitRemediationItem,
	LoopRoutePlan,
} from "../traces/types.ts";
import {
	decisionIssueRefs,
	evaluateDecisionQualityStandards,
	isBlockingDecisionIssue,
	runDecisionQualityStandards,
} from "./quality-standards.ts";
import { approvedProposalChanges } from "./proposal.ts";
import {
	DECISION_IMPLEMENTATION_MODE_VALUES,
	DECISION_KIND_VALUES,
	DECISION_PLANNING_DEPTH_VALUES,
	DECISION_ROUTE_TARGET_VALUES,
	DECISION_WORK_SCALE_VALUES,
	type ActiveTraceGoal,
	type CurrentStatePacket,
	type ProposedChange,
	type SprintProposal,
	type KnowledgeDelta,
} from "./types.ts";

export type DecisionExitIssueCode =
	| "no_proposed_changes"
	| "no_approved_changes"
	| "missing_current_state"
	| "missing_desired_state"
	| "missing_rationale"
	| "missing_decision_kind"
	| "invalid_decision_kind"
	| "missing_decision_type"
	| "unknown_decision_type"
	| "decision_type_kind_mismatch"
	| "pipeline_profile_route_conflict"
	| "pipeline_profile_planning_depth_conflict"
	| "pipeline_profile_direct_route_disallowed"
	| "pipeline_profile_direct_scale_disallowed"
	| "pipeline_profile_direct_risk_disallowed"
	| "missing_debug_target"
	| "missing_debug_hypothesis"
	| "missing_debug_invariant"
	| "missing_debug_probe"
	| "missing_debug_expected_safe_behavior"
	| "missing_debug_stop_condition"
	| "missing_fix_reproduction"
	| "missing_fix_expected_behavior"
	| "missing_fix_regression_plan"
	| "missing_harden_boundary"
	| "missing_harden_failure_modes"
	| "missing_harden_negative_test_plan"
	| "missing_harden_compatibility_impact"
	| "missing_improve_current_pain"
	| "missing_improve_desired_outcome"
	| "missing_improve_success_signal"
	| "missing_improve_non_goals"
	| "missing_migrate_source_behavior"
	| "missing_migrate_target_behavior"
	| "missing_migrate_preserved_invariants"
	| "missing_migrate_equivalence_proof"
	| "missing_migrate_rollback_plan"
	| "missing_user_impact"
	| "missing_maintainer_impact"
	| "missing_effort"
	| "invalid_effort"
	| "missing_work_scale"
	| "invalid_work_scale"
	| "missing_planning_depth"
	| "invalid_planning_depth"
	| "invalid_micro_plan_scale"
	| "invalid_micro_plan_risk"
	| "invalid_route_target"
	| "missing_route_rationale"
	| "missing_direct_implementation_mode"
	| "invalid_direct_implementation_mode"
	| "invalid_direct_implementation_scale"
	| "invalid_direct_implementation_risk"
	| "missing_direct_implementation_scope"
	| "missing_direct_implementation_validation"
	| "missing_recommendation"
	| "invalid_recommendation"
	| "recommendation_not_approve"
	| "missing_recommendation_rationale"
	| "missing_agent_assessment"
	| "agent_assessment_not_aligned"
	| "semantic_decision_insufficient"
	| "semantic_cost_tradeoff_implausible"
	| "semantic_risk_tier_implausible"
	| "missing_high_risk_approval"
	| "invalid_approval_ref"
	| "missing_risk"
	| "invalid_risk"
	| "missing_current_state_packet"
	| "invalid_current_state_ref"
	| "missing_traceability_ref"
	| "missing_high_risk_scope"
	| "missing_high_risk_alternative"
	| "missing_high_risk_evidence"
	| "duplicate_change_id"
	| "invalid_traceability_ref"
	| "missing_knowledge_delta"
	| "invalid_knowledge_ref"
	| "incomplete_knowledge_digest"
	| "active_trace_conflict";

export interface DecisionExitIssue {
	code: DecisionExitIssueCode;
	changeId?: string;
	ref?: string;
	message: string;
}

export interface DecisionExitOptions {
	knowledgeDelta?: KnowledgeDelta;
	currentStatePacket?: CurrentStatePacket;
	activeTraceGoals?: ActiveTraceGoal[];
	qualityJudge?: LoopQualityJudgeExecutionOptions;
}

export interface DecisionExitResult extends ExitDetails {
	passed: boolean;
	issues: DecisionExitIssue[];
	approvedChangeIds: string[];
}

export interface DecisionExitIssueCollection {
	issues: DecisionExitIssue[];
	approvedChanges: ProposedChange[];
}

export const DECISION_LOOP_GRAPH: LoopQualityGraph<DecisionExitIssueCode> = {
	graphId: "decision.loop",
	graphVersion: "0.3.0.loop.6",
	schemaVersion: LOOP_QUALITY_GRAPH_SCHEMA_VERSION,
	layers: loopGraphLayers([
		"hard_gate",
		"input_contract",
		"trace_fidelity",
		"specificity",
		"risk_authority",
		"project_fit",
		"repairability",
		"pipeline_carryover",
		"exit_loss",
	]),
	nodes: [
		decisionNode({
			id: "sprint_proposal_ready",
			layer: "input_contract",
			standardType: "loop_contract",
			weight: 8,
			cost: 8,
			hardGate: true,
			description:
				"Decision loop output has at least one Decision and stable Decision ids.",
			codes: [
				"no_proposed_changes",
				"no_approved_changes",
				"duplicate_change_id",
			],
		}),
		decisionNode({
			id: "intention_understood",
			layer: "specificity",
			standardType: "user_value",
			weight: 14,
			cost: 14,
			hardGate: true,
			description:
				"Decisions provide current state, desired state, and rationale fields for the user intention.",
			codes: [
				"missing_current_state",
				"missing_desired_state",
				"missing_rationale",
			],
		}),
		decisionNode({
			id: "user_value_clear",
			layer: "specificity",
			standardType: "user_value",
			weight: 10,
			cost: 10,
			description:
				"Decisions explain how the intention benefits users or improves user outcomes.",
			codes: ["missing_user_impact"],
		}),
		decisionNode({
			id: "cost_understood",
			layer: "project_fit",
			standardType: "maintainability",
			weight: 7,
			cost: 7,
			description:
				"Decisions expose maintainer impact and a bounded effort estimate for later semantic cost review.",
			codes: ["missing_maintainer_impact", "missing_effort", "invalid_effort"],
		}),
		decisionNode({
			id: "work_routing_classified",
			layer: "pipeline_carryover",
			standardType: "scope_control",
			weight: 10,
			cost: 10,
			hardGate: true,
			description:
				"Decisions classify work scale and choose micro or standard planning before planning handoff.",
			codes: [
				"missing_work_scale",
				"invalid_work_scale",
				"missing_planning_depth",
				"invalid_planning_depth",
				"invalid_micro_plan_scale",
				"invalid_micro_plan_risk",
			],
		}),
		decisionNode({
			id: "loop_route_safe",
			layer: "pipeline_carryover",
			standardType: "pipeline_carryover",
			weight: 10,
			cost: 10,
			hardGate: true,
			description:
				"Decisions choose an explicit next loop; direct implementation is limited to low-risk scoped work with validation.",
			codes: [
				"invalid_route_target",
				"missing_route_rationale",
				"missing_direct_implementation_mode",
				"invalid_direct_implementation_mode",
				"invalid_direct_implementation_scale",
				"invalid_direct_implementation_risk",
				"missing_direct_implementation_scope",
				"missing_direct_implementation_validation",
			],
		}),
		decisionNode({
			id: "recommendation_justified",
			layer: "project_fit",
			standardType: "project_fit",
			weight: 9,
			cost: 9,
			description:
				"The agent gives a clear approve/reject/defer/ask-user recommendation and explains why Decisions should proceed.",
			codes: [
				"missing_recommendation",
				"invalid_recommendation",
				"recommendation_not_approve",
				"missing_recommendation_rationale",
			],
		}),
		decisionNode({
			id: "intention_validated",
			layer: "project_fit",
			standardType: "project_fit",
			mode: "agent",
			weight: 12,
			cost: 12,
			description:
				"The agent records its judgment that the user's intention is aligned with real user value and project interests.",
			codes: ["missing_agent_assessment", "agent_assessment_not_aligned"],
		}),
		decisionNode({
			id: "decision_semantically_sufficient",
			layer: "specificity",
			standardType: "user_value",
			method: "model_judge",
			weight: 12,
			cost: 12,
			description:
				"Independent judge verifies the decision intent is specific, coherent, and sufficient for planning rather than fluent but vague.",
			codes: ["semantic_decision_insufficient"],
		}),
		decisionNode({
			id: "cost_tradeoff_plausible",
			layer: "project_fit",
			standardType: "maintainability",
			method: "model_judge",
			weight: 10,
			cost: 10,
			description:
				"Independent judge verifies effort, maintainer impact, work scale, and desired outcome form a plausible cost tradeoff.",
			codes: ["semantic_cost_tradeoff_implausible"],
		}),
		decisionNode({
			id: "risk_tier_plausible",
			layer: "risk_authority",
			standardType: "risk_authority",
			method: "model_judge",
			weight: 10,
			cost: 10,
			description:
				"Independent judge verifies declared risk tier and route are plausible for the affected scope and authority needs.",
			codes: ["semantic_risk_tier_implausible"],
		}),
		decisionNode({
			id: "approval_safety",
			layer: "hard_gate",
			standardType: "risk_authority",
			repairTarget: "user",
			weight: 18,
			cost: 18,
			hardGate: true,
			description:
				"High-risk Decisions have explicit user approval authority and a canonical approval ref.",
			codes: ["missing_high_risk_approval", "invalid_approval_ref"],
		}),
		decisionNode({
			id: "current_state_grounded",
			layer: "trace_fidelity",
			standardType: "trace_fidelity",
			weight: 12,
			cost: 12,
			hardGate: true,
			description:
				"Current state is grounded in canonical source, KB, trace, Git, digest, or test refs.",
			codes: ["missing_current_state_packet", "invalid_current_state_ref"],
		}),
		decisionNode({
			id: "evidence_sufficient",
			layer: "trace_fidelity",
			standardType: "evidence_quality",
			weight: 12,
			cost: 12,
			hardGate: true,
			description:
				"Decision evidence is sufficient for planning to trust the intention, including stronger proof for high-risk Decisions.",
			codes: [
				"missing_traceability_ref",
				"missing_high_risk_evidence",
				"invalid_traceability_ref",
			],
		}),
		decisionNode({
			id: "risks_and_alternatives_considered",
			layer: "risk_authority",
			standardType: "risk_authority",
			weight: 10,
			cost: 10,
			hardGate: true,
			description:
				"Decisions declare a valid risk tier; high-risk intentions identify affected layers and alternatives before implementation work is planned.",
			codes: [
				"missing_risk",
				"invalid_risk",
				"missing_high_risk_scope",
				"missing_high_risk_alternative",
			],
		}),
		decisionNode({
			id: "active_trace_conflicts_resolved",
			layer: "hard_gate",
			standardType: "scope_control",
			weight: 16,
			cost: 16,
			hardGate: true,
			description:
				"Decisions do not conflict with active trace goals unless the conflict is resolved.",
			codes: ["active_trace_conflict"],
		}),
		decisionNode({
			id: "knowledge_impact_accounted",
			layer: "trace_fidelity",
			standardType: "trace_fidelity",
			weight: 8,
			cost: 8,
			description:
				"Knowledge impact is recorded as updated refs or explicit no-impact rationale.",
			codes: [
				"missing_knowledge_delta",
				"invalid_knowledge_ref",
				"incomplete_knowledge_digest",
			],
		}),
		decisionNode({
			id: "decision_kind_classified",
			layer: "input_contract",
			standardType: "loop_contract",
			weight: 8,
			cost: 8,
			hardGate: true,
			description:
				"Decisions classify the decision kind so kind-specific quality can apply inside the decision loop.",
			codes: [
				"missing_decision_kind",
				"invalid_decision_kind",
				"missing_decision_type",
				"unknown_decision_type",
				"decision_type_kind_mismatch",
				"pipeline_profile_route_conflict",
				"pipeline_profile_planning_depth_conflict",
				"pipeline_profile_direct_route_disallowed",
				"pipeline_profile_direct_scale_disallowed",
				"pipeline_profile_direct_risk_disallowed",
			],
		}),
		decisionNode({
			id: "debug_decision_focused",
			layer: "specificity",
			standardType: "loop_contract",
			weight: 14,
			cost: 14,
			description:
				"Debug decisions name target, hypothesis, invariant, probe, expected safe behavior, and stop condition.",
			codes: [
				"missing_debug_target",
				"missing_debug_hypothesis",
				"missing_debug_invariant",
				"missing_debug_probe",
				"missing_debug_expected_safe_behavior",
				"missing_debug_stop_condition",
			],
		}),
		decisionNode({
			id: "fix_decision_reproducible",
			layer: "specificity",
			standardType: "loop_contract",
			weight: 14,
			cost: 14,
			description:
				"Fix decisions identify reproduction, expected behavior, and regression coverage.",
			codes: [
				"missing_fix_reproduction",
				"missing_fix_expected_behavior",
				"missing_fix_regression_plan",
			],
		}),
		decisionNode({
			id: "harden_decision_boundary",
			layer: "risk_authority",
			standardType: "risk_authority",
			weight: 14,
			cost: 14,
			description:
				"Hardening decisions define the safety boundary, failure modes, negative tests, and compatibility impact.",
			codes: [
				"missing_harden_boundary",
				"missing_harden_failure_modes",
				"missing_harden_negative_test_plan",
				"missing_harden_compatibility_impact",
			],
		}),
		decisionNode({
			id: "improve_decision_outcome",
			layer: "specificity",
			standardType: "user_value",
			weight: 14,
			cost: 14,
			description:
				"Improvement decisions describe current pain, desired outcome, success signal, and non-goals.",
			codes: [
				"missing_improve_current_pain",
				"missing_improve_desired_outcome",
				"missing_improve_success_signal",
				"missing_improve_non_goals",
			],
		}),
		decisionNode({
			id: "migrate_decision_equivalent",
			layer: "repairability",
			standardType: "reversibility",
			weight: 14,
			cost: 14,
			description:
				"Migration decisions describe source/target behavior, preserved invariants, equivalence proof, and rollback strategy.",
			codes: [
				"missing_migrate_source_behavior",
				"missing_migrate_target_behavior",
				"missing_migrate_preserved_invariants",
				"missing_migrate_equivalence_proof",
				"missing_migrate_rollback_plan",
			],
		}),
	],
};

function decisionNode(
	node: Omit<
		LoopQualityGraphNode<DecisionExitIssueCode>,
		"method" | "repairTarget"
	> & {
		method?: LoopQualityGraphNode<DecisionExitIssueCode>["method"];
		repairTarget?: LoopQualityGraphNode<DecisionExitIssueCode>["repairTarget"];
	},
): LoopQualityGraphNode<DecisionExitIssueCode> {
	const resolved: LoopQualityGraphNode<DecisionExitIssueCode> = {
		method: node.method || loopQualityMethodForMode(node.mode),
		gate: node.hardGate || node.layer === "hard_gate" ? "hard" : "soft",
		timeoutMs: 50,
		repairTarget: "decision",
		...node,
	};
	return {
		...resolved,
		judge: resolved.judge || loopQualityJudgeSpecForNode(resolved),
	};
}

export function collectDecisionExitIssues(
	proposal: SprintProposal,
	options: DecisionExitOptions = {},
): DecisionExitIssueCollection {
	const issues: DecisionExitIssue[] = [];
	if (proposal.changes.length === 0) {
		issues.push({
			code: "no_proposed_changes",
			message: "Decision exit requires at least one change.",
		});
	}
	const approvedChanges = approvedProposalChanges(proposal);
	issues.push(...proposalTraceabilityRefIssues(proposal));
	if (proposal.changes.length > 0 && approvedChanges.length === 0) {
		issues.push({
			code: "no_approved_changes",
			message: "Decision exit requires at least one Decision.",
		});
	}
	issues.push(...duplicateRowIssues(proposal.changes));
	issues.push(
		...currentStatePacketIssues({
			approvedChanges,
			packet:
				options.currentStatePacket ||
				currentStatePacketFromRows(proposal, approvedChanges),
			validateRefs: Boolean(options.currentStatePacket),
		}),
	);
	for (const change of approvedChanges) {
		issues.push(
			...approvedRowIssues(change),
			...workRoutingIssues(change),
			...directRouteIssues(change),
			...decisionTypePolicyIssues(change),
			...decisionKindQualityIssues(change),
			...recommendationQualityIssues(change),
			...agentAssessmentQualityIssues(change),
			...riskQualityIssues(change),
			...highRiskQualityIssues(change),
			...traceabilityRefIssues(change),
		);
	}
	issues.push(...knowledgeDeltaIssues(approvedChanges, options.knowledgeDelta));
	issues.push(
		...activeTraceConflictIssues(
			approvedChanges,
			options.activeTraceGoals || [],
		),
	);
	return { issues, approvedChanges };
}

export function evaluateDecisionExit(
	proposal: SprintProposal,
	options: DecisionExitOptions = {},
): DecisionExitResult {
	const { issues, approvedChanges } = collectDecisionExitIssues(
		proposal,
		options,
	);
	const qualityStandards = evaluateDecisionExitGraph(issues, approvedChanges);
	return decisionExitResultFromQuality({
		issues,
		approvedChanges,
		qualityStandards,
	});
}

export async function evaluateDecisionExitWithRunner(
	proposal: SprintProposal,
	options: DecisionExitOptions = {},
): Promise<DecisionExitResult> {
	const { issues, approvedChanges } = collectDecisionExitIssues(
		proposal,
		options,
	);
	const quality = await runDecisionQualityStandards({
		graph: DECISION_LOOP_GRAPH,
		issues,
		approvedChanges,
		...(options.qualityJudge || {}),
		judgeInput:
			options.qualityJudge?.judgeInput ||
			decisionJudgeInput(proposal, options, approvedChanges),
	});
	return decisionExitResultFromQuality({
		issues,
		approvedChanges,
		qualityStandards: quality.standards,
		qualityRunner: quality,
	});
}

function decisionJudgeInput(
	proposal: SprintProposal,
	options: DecisionExitOptions,
	approvedChanges: ProposedChange[],
): Record<string, unknown> {
	return {
		loop: "decision",
		proposal: {
			id: proposal.id,
			summary: proposal.summary,
			sourceRefs: proposal.sourceRefs,
		},
		approvedChanges: approvedChanges.map((change) => ({
			id: change.id,
			decisionKind: change.decisionKind,
			decisionType: change.decisionType,
			currentState: change.currentState,
			desiredState: change.desiredState,
			rationale: change.rationale,
			userImpact: change.userImpact,
			maintainerImpact: change.maintainerImpact,
			effort: change.effort,
			workScale: change.workScale,
			planningDepth: change.planningDepth,
			routeTarget: change.routeTarget,
			routeKind: change.routeKind,
			routeRationale: change.routeRationale,
			risk: change.risk,
			affectedLayers: change.affectedLayers,
			recommendation: change.recommendation,
			recommendationRationale: change.recommendationRationale,
			agentAssessment: change.agentAssessment,
			targetRefs: change.targetRefs,
			sourceRefs: change.sourceRefs,
			proofRefs: change.proofRefs,
			currentPain: change.currentPain,
			desiredOutcome: change.desiredOutcome,
			successSignal: change.successSignal,
			nonGoals: change.nonGoals,
			hypothesis: change.hypothesis,
			invariant: change.invariant,
			probe: change.probe,
			expectedSafeBehavior: change.expectedSafeBehavior,
			stopCondition: change.stopCondition,
			reproduction: change.reproduction,
			expectedBehavior: change.expectedBehavior,
			regressionPlan: change.regressionPlan,
			safetyBoundary: change.safetyBoundary,
			failureModes: change.failureModes,
			negativeTestPlan: change.negativeTestPlan,
			compatibilityImpact: change.compatibilityImpact,
			sourceBehavior: change.sourceBehavior,
			targetBehavior: change.targetBehavior,
			preservedInvariants: change.preservedInvariants,
			equivalenceProof: change.equivalenceProof,
			rollbackPlan: change.rollbackPlan,
		})),
		currentStatePacket:
			options.currentStatePacket ||
			currentStatePacketFromRows(proposal, approvedChanges),
		knowledgeDelta: options.knowledgeDelta,
		activeTraceGoals: options.activeTraceGoals,
	};
}

function decisionExitResultFromQuality(input: {
	issues: DecisionExitIssue[];
	approvedChanges: ProposedChange[];
	qualityStandards: DecisionExitResult["qualityStandards"];
	qualityRunner?: RunLoopQualityGraphResult;
}): DecisionExitResult {
	const remediation = input.issues.map(issueRemediation);
	const diagnostics = qualityDiagnosticsFromStandards(
		input.qualityStandards || [],
		remediation,
	);
	const verdict = decisionVerdictFromQuality(
		input.issues,
		input.qualityStandards || [],
	);
	return {
		passed: verdict === "pass",
		verdict,
		issues: input.issues,
		criteria: criteriaFromQualityStandards(input.qualityStandards || []),
		qualityStandards: input.qualityStandards,
		qualityGraph: loopQualityGraphRef(DECISION_LOOP_GRAPH),
		...(input.qualityRunner
			? { qualityRunner: loopQualityRunnerSummary(input.qualityRunner.runner) }
			: {}),
		findings: input.issues.map(issueFinding),
		remediation,
		diagnostics,
		route: decisionExitRoute(verdict, input.approvedChanges),
		routePlan: decisionRoutePlan(verdict, input.approvedChanges, input.issues),
		approvedChangeIds: input.approvedChanges.map((change) => change.id),
	};
}

function decisionVerdictFromQuality(
	issues: DecisionExitIssue[],
	standards: DecisionExitResult["qualityStandards"],
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

export function decisionExitRoute(
	verdict: "pass" | "fail" | "block",
	approvedChanges: ProposedChange[],
): "decision" | "planning" | "implementation" | "user" {
	if (verdict === "block") return "user";
	if (verdict !== "pass") return "decision";
	return approvedChanges.length > 0 &&
		approvedChanges.every((change) => change.routeTarget === "implementation")
		? "implementation"
		: "planning";
}

function decisionRoutePlan(
	verdict: "pass" | "fail" | "block",
	approvedChanges: ProposedChange[],
	issues: DecisionExitIssue[],
): LoopRoutePlan {
	if (verdict === "block") {
		return {
			target: "decision",
			kind: "authority_validation",
			rationale:
				"Decision exit needs user authority before another semantic loop can proceed.",
			refs: decisionRouteRefs(issues, approvedChanges),
		};
	}
	if (verdict !== "pass") {
		return {
			target: "decision",
			kind: "continue",
			rationale:
				"Decision exit did not meet quality standards; continue the decision loop.",
			refs: decisionRouteRefs(issues, approvedChanges),
		};
	}
	const directImplementation =
		approvedChanges.length > 0 &&
		approvedChanges.every((change) => change.routeTarget === "implementation");
	if (directImplementation) {
		return {
			target: "implementation",
			kind: "direct_implementation",
			rationale: approvedChanges
				.map((change) => change.routeRationale)
				.filter(Boolean)
				.join(" "),
			implementationMode: implementationModeForRows(approvedChanges),
			refs: approvedChanges.map((change) => `decision-change:${change.id}`),
		};
	}
	return {
		target: "planning",
		kind: "advance",
		rationale:
			"Approved proposed changes require planning before implementation.",
		refs: approvedChanges.map((change) => `decision-change:${change.id}`),
	};
}

function decisionRouteRefs(
	issues: DecisionExitIssue[],
	approvedChanges: ProposedChange[],
): string[] {
	return issues.length
		? issues.flatMap(decisionIssueRefs)
		: approvedChanges.map((change) => `decision-change:${change.id}`);
}

function implementationModeForRows(
	changes: ProposedChange[],
): string | undefined {
	const modes = new Set(
		changes.map((change) => change.implementationMode).filter(Boolean),
	);
	if (modes.size === 1) return [...modes][0];
	return modes.size > 1 ? "targeted_checks" : undefined;
}

export function evaluateDecisionExitGraph(
	issues: DecisionExitIssue[],
	approvedChanges: ProposedChange[],
) {
	return evaluateDecisionQualityStandards({
		graph: DECISION_LOOP_GRAPH,
		issues,
		approvedChanges,
	});
}

function approvedRowIssues(change: ProposedChange): DecisionExitIssue[] {
	const issues: DecisionExitIssue[] = [];
	if (!change.currentState) {
		issues.push({
			code: "missing_current_state",
			changeId: change.id,
			message: `Proposed change ${change.id} is missing current state.`,
		});
	}
	if (!change.desiredState) {
		issues.push({
			code: "missing_desired_state",
			changeId: change.id,
			message: `Proposed change ${change.id} is missing desired state.`,
		});
	}
	if (!change.rationale) {
		issues.push({
			code: "missing_rationale",
			changeId: change.id,
			message: `Proposed change ${change.id} is missing rationale.`,
		});
	}
	if (!change.userImpact) {
		issues.push({
			code: "missing_user_impact",
			changeId: change.id,
			message: `Proposed change ${change.id} must explain user impact.`,
		});
	}
	if (!change.maintainerImpact) {
		issues.push({
			code: "missing_maintainer_impact",
			changeId: change.id,
			message: `Proposed change ${change.id} must explain maintainer impact.`,
		});
	}
	if (!change.effort) {
		issues.push({
			code: "missing_effort",
			changeId: change.id,
			message: `Proposed change ${change.id} must estimate effort.`,
		});
	} else if (!isAllowed(change.effort, ["low", "medium", "high"])) {
		issues.push({
			code: "invalid_effort",
			changeId: change.id,
			message: `Proposed change ${change.id} has invalid effort ${change.effort}.`,
		});
	}
	if (change.sourceRefs.length === 0 && !change.noKbImpactReason) {
		issues.push({
			code: "missing_traceability_ref",
			changeId: change.id,
			message: `Proposed change ${change.id} needs source refs or no-KB-impact rationale.`,
		});
	}
	return issues;
}

function workRoutingIssues(change: ProposedChange): DecisionExitIssue[] {
	const issues: DecisionExitIssue[] = [];
	if (!change.workScale) {
		issues.push({
			code: "missing_work_scale",
			changeId: change.id,
			message: `Proposed change ${change.id} must classify workScale.`,
		});
	} else if (!isAllowed(change.workScale, [...DECISION_WORK_SCALE_VALUES])) {
		issues.push({
			code: "invalid_work_scale",
			changeId: change.id,
			message: `Proposed change ${change.id} has invalid workScale ${change.workScale}.`,
		});
	}
	if (!change.planningDepth) {
		issues.push({
			code: "missing_planning_depth",
			changeId: change.id,
			message: `Proposed change ${change.id} must classify planningDepth.`,
		});
	} else if (
		!isAllowed(change.planningDepth, [...DECISION_PLANNING_DEPTH_VALUES])
	) {
		issues.push({
			code: "invalid_planning_depth",
			changeId: change.id,
			message: `Proposed change ${change.id} has invalid planningDepth ${change.planningDepth}.`,
		});
	}
	if (change.planningDepth === "micro") {
		if (!["tiny", "small"].includes(change.workScale)) {
			issues.push({
				code: "invalid_micro_plan_scale",
				changeId: change.id,
				message: `Proposed change ${change.id} can use micro planning only for tiny or small work.`,
			});
		}
		if (change.risk !== "low") {
			issues.push({
				code: "invalid_micro_plan_risk",
				changeId: change.id,
				message: `Proposed change ${change.id} can use micro planning only for low-risk work.`,
			});
		}
	}
	return issues;
}

function directRouteIssues(change: ProposedChange): DecisionExitIssue[] {
	const issues: DecisionExitIssue[] = [];
	if (!isAllowed(change.routeTarget, [...DECISION_ROUTE_TARGET_VALUES])) {
		issues.push({
			code: "invalid_route_target",
			changeId: change.id,
			message: `Proposed change ${change.id} has invalid routeTarget ${change.routeTarget}.`,
		});
	}
	if (change.routeTarget !== "implementation") return issues;
	if (!change.routeRationale) {
		issues.push({
			code: "missing_route_rationale",
			changeId: change.id,
			message: `Proposed change ${change.id} needs rationale for direct implementation routing.`,
		});
	}
	if (!change.implementationMode) {
		issues.push({
			code: "missing_direct_implementation_mode",
			changeId: change.id,
			message: `Proposed change ${change.id} needs implementationMode for direct implementation.`,
		});
	} else if (
		!isAllowed(change.implementationMode, [
			...DECISION_IMPLEMENTATION_MODE_VALUES,
		])
	) {
		issues.push({
			code: "invalid_direct_implementation_mode",
			changeId: change.id,
			message: `Proposed change ${change.id} has invalid implementationMode ${change.implementationMode}.`,
		});
	}
	if (!["tiny", "small"].includes(change.workScale)) {
		issues.push({
			code: "invalid_direct_implementation_scale",
			changeId: change.id,
			message: `Proposed change ${change.id} can route directly to implementation only for tiny or small work.`,
		});
	}
	if (change.risk !== "low") {
		issues.push({
			code: "invalid_direct_implementation_risk",
			changeId: change.id,
			message: `Proposed change ${change.id} can route directly to implementation only for low-risk work.`,
		});
	}
	if (change.directImplementationScope.pathScopes.length === 0) {
		issues.push({
			code: "missing_direct_implementation_scope",
			changeId: change.id,
			message: `Proposed change ${change.id} needs direct implementation pathScopes.`,
		});
	}
	if (change.directImplementationScope.verification.length === 0) {
		issues.push({
			code: "missing_direct_implementation_validation",
			changeId: change.id,
			message: `Proposed change ${change.id} needs direct implementation verification commands or refs.`,
		});
	}
	return issues;
}

function decisionTypePolicyIssues(change: ProposedChange): DecisionExitIssue[] {
	const issues: DecisionExitIssue[] = [];
	const decisionType = normalizeDecisionTypeId(
		change.decisionType || change.decisionKind,
	);
	if (!decisionType) {
		return [
			{
				code: "missing_decision_type",
				changeId: change.id,
				message: `Proposed change ${change.id} must resolve to a decision type.`,
			},
		];
	}
	const definition = decisionTypeDefinitionById(decisionType);
	if (!definition) {
		return [
			{
				code: "unknown_decision_type",
				changeId: change.id,
				message: `Proposed change ${change.id} uses unknown decision type ${decisionType}.`,
			},
		];
	}
	if (
		definition.decisionKind !== "direct_implementation" &&
		definition.decisionKind !== change.decisionKind
	) {
		issues.push({
			code: "decision_type_kind_mismatch",
			changeId: change.id,
			message: `Proposed change ${change.id} type ${definition.id} expects decisionKind ${definition.decisionKind}.`,
		});
	}
	const profile = definition.pipelineProfile;
	if (!isAllowed(change.routeTarget, profile.allowedRouteTargets)) {
		issues.push({
			code: "pipeline_profile_route_conflict",
			changeId: change.id,
			message: `Proposed change ${change.id} routeTarget ${change.routeTarget} is not allowed by pipeline profile ${profile.id}.`,
		});
	}
	if (
		change.planningDepth &&
		!isAllowed(change.planningDepth, profile.allowedPlanningDepth)
	) {
		issues.push({
			code: "pipeline_profile_planning_depth_conflict",
			changeId: change.id,
			message: `Proposed change ${change.id} planningDepth ${change.planningDepth} is not allowed by pipeline profile ${profile.id}.`,
		});
	}
	if (change.routeTarget === "implementation") {
		if (!profile.directImplementationAllowed) {
			issues.push({
				code: "pipeline_profile_direct_route_disallowed",
				changeId: change.id,
				message: `Proposed change ${change.id} cannot route directly to implementation under pipeline profile ${profile.id}.`,
			});
		}
		if (
			!isAllowed(change.workScale, profile.allowedDirectImplementationScales)
		) {
			issues.push({
				code: "pipeline_profile_direct_scale_disallowed",
				changeId: change.id,
				message: `Proposed change ${change.id} workScale ${change.workScale} cannot use direct implementation under pipeline profile ${profile.id}.`,
			});
		}
		if (riskExceeds(change.risk, profile.maxDirectImplementationRisk)) {
			issues.push({
				code: "pipeline_profile_direct_risk_disallowed",
				changeId: change.id,
				message: `Proposed change ${change.id} risk ${change.risk} exceeds direct implementation risk ${profile.maxDirectImplementationRisk} for pipeline profile ${profile.id}.`,
			});
		}
	}
	return issues;
}

function decisionKindQualityIssues(
	change: ProposedChange,
): DecisionExitIssue[] {
	const issues: DecisionExitIssue[] = [];
	if (!change.decisionKind) {
		issues.push({
			code: "missing_decision_kind",
			changeId: change.id,
			message: `Proposed change ${change.id} must declare decisionKind.`,
		});
		return issues;
	}
	if (!isAllowed(change.decisionKind, [...DECISION_KIND_VALUES])) {
		issues.push({
			code: "invalid_decision_kind",
			changeId: change.id,
			message: `Proposed change ${change.id} has invalid decisionKind ${change.decisionKind}.`,
		});
		return issues;
	}
	if (change.decisionKind === "debug") {
		if (change.targetRefs.length === 0) {
			issues.push(
				kindIssue(change, "missing_debug_target", "name target refs"),
			);
		}
		if (!change.hypothesis) {
			issues.push(
				kindIssue(change, "missing_debug_hypothesis", "state a hypothesis"),
			);
		}
		if (!change.invariant) {
			issues.push(
				kindIssue(
					change,
					"missing_debug_invariant",
					"state an invariant or failure boundary",
				),
			);
		}
		if (!change.probe) {
			issues.push(
				kindIssue(
					change,
					"missing_debug_probe",
					"define a probe or reproduction plan",
				),
			);
		}
		if (!change.expectedSafeBehavior) {
			issues.push(
				kindIssue(
					change,
					"missing_debug_expected_safe_behavior",
					"state expected safe behavior",
				),
			);
		}
		if (!change.stopCondition) {
			issues.push(
				kindIssue(
					change,
					"missing_debug_stop_condition",
					"state a stop condition",
				),
			);
		}
	}
	if (change.decisionKind === "fix") {
		if (!change.reproduction) {
			issues.push(
				kindIssue(
					change,
					"missing_fix_reproduction",
					"describe the reproduction",
				),
			);
		}
		if (!change.expectedBehavior) {
			issues.push(
				kindIssue(
					change,
					"missing_fix_expected_behavior",
					"state expected behavior",
				),
			);
		}
		if (!change.regressionPlan) {
			issues.push(
				kindIssue(
					change,
					"missing_fix_regression_plan",
					"define a regression test plan",
				),
			);
		}
	}
	if (change.decisionKind === "harden") {
		if (!change.safetyBoundary) {
			issues.push(
				kindIssue(
					change,
					"missing_harden_boundary",
					"name the safety boundary",
				),
			);
		}
		if (change.failureModes.length === 0) {
			issues.push(
				kindIssue(
					change,
					"missing_harden_failure_modes",
					"list failure or abuse modes",
				),
			);
		}
		if (!change.negativeTestPlan) {
			issues.push(
				kindIssue(
					change,
					"missing_harden_negative_test_plan",
					"define negative test coverage",
				),
			);
		}
		if (!change.compatibilityImpact) {
			issues.push(
				kindIssue(
					change,
					"missing_harden_compatibility_impact",
					"state compatibility impact",
				),
			);
		}
	}
	if (change.decisionKind === "improve") {
		if (!change.currentPain) {
			issues.push(
				kindIssue(
					change,
					"missing_improve_current_pain",
					"describe current pain",
				),
			);
		}
		if (!change.desiredOutcome) {
			issues.push(
				kindIssue(
					change,
					"missing_improve_desired_outcome",
					"state desired outcome",
				),
			);
		}
		if (!change.successSignal) {
			issues.push(
				kindIssue(
					change,
					"missing_improve_success_signal",
					"define success signal",
				),
			);
		}
		if (change.nonGoals.length === 0) {
			issues.push(
				kindIssue(change, "missing_improve_non_goals", "list non-goals"),
			);
		}
	}
	if (change.decisionKind === "migrate") {
		if (!change.sourceBehavior) {
			issues.push(
				kindIssue(
					change,
					"missing_migrate_source_behavior",
					"describe source behavior",
				),
			);
		}
		if (!change.targetBehavior) {
			issues.push(
				kindIssue(
					change,
					"missing_migrate_target_behavior",
					"describe target behavior",
				),
			);
		}
		if (change.preservedInvariants.length === 0) {
			issues.push(
				kindIssue(
					change,
					"missing_migrate_preserved_invariants",
					"list preserved invariants",
				),
			);
		}
		if (!change.equivalenceProof) {
			issues.push(
				kindIssue(
					change,
					"missing_migrate_equivalence_proof",
					"define equivalence proof",
				),
			);
		}
		if (!change.rollbackPlan) {
			issues.push(
				kindIssue(
					change,
					"missing_migrate_rollback_plan",
					"state rollback or containment plan",
				),
			);
		}
	}
	return issues;
}

function kindIssue(
	change: ProposedChange,
	code: DecisionExitIssueCode,
	requirement: string,
): DecisionExitIssue {
	return {
		code,
		changeId: change.id,
		message: `${change.decisionKind} proposed change ${change.id} must ${requirement}.`,
	};
}

function issueFinding(issue: DecisionExitIssue): ExitFinding {
	return {
		id: `decision:${issue.code}:${issue.changeId || "proposal"}`,
		severity: "error",
		criterion: issue.code,
		message: issue.message,
		refs: decisionIssueRefs(issue),
		rationale:
			"Decision evidence must be complete before planning consumes it.",
	};
}

function currentStatePacketIssues(input: {
	approvedChanges: ProposedChange[];
	packet: CurrentStatePacket;
	validateRefs: boolean;
}): DecisionExitIssue[] {
	const { approvedChanges, packet, validateRefs } = input;
	if (approvedChanges.length === 0) return [];
	const issues: DecisionExitIssue[] = [];
	if (packet.refs.length === 0) {
		issues.push({
			code: "missing_current_state_packet",
			message:
				"Decision exit requires current-state refs before planning can compare desired state to actual state.",
		});
	}
	if (validateRefs) {
		issues.push(
			...invalidTraceRefs(packet.refs).map((ref) => ({
				code: "invalid_current_state_ref" as const,
				ref,
				message: `Decision current-state packet has non-canonical ref ${ref}.`,
			})),
		);
	}
	return issues;
}

function currentStatePacketFromRows(
	proposal: SprintProposal,
	approvedChanges: ProposedChange[],
): CurrentStatePacket {
	return {
		summary: approvedChanges.map((change) => change.currentState).join(" "),
		refs: [
			...proposal.sourceRefs,
			...approvedChanges.flatMap((change) => [
				...change.sourceRefs,
				...change.proofRefs,
			]),
		],
	};
}

function duplicateRowIssues(changes: ProposedChange[]): DecisionExitIssue[] {
	const counts = new Map<string, number>();
	for (const change of changes)
		counts.set(change.id, (counts.get(change.id) || 0) + 1);
	return [...counts.entries()]
		.filter(([, count]) => count > 1)
		.map(([changeId]) => ({
			code: "duplicate_change_id" as const,
			changeId,
			message: `Decision change id ${changeId} appears more than once.`,
		}));
}

function proposalTraceabilityRefIssues(
	proposal: SprintProposal,
): DecisionExitIssue[] {
	return invalidTraceRefs(proposal.sourceRefs).map((ref) => ({
		code: "invalid_traceability_ref" as const,
		ref,
		message: `Sprint Proposal ${proposal.id} has non-canonical source ref ${ref}.`,
	}));
}

function traceabilityRefIssues(change: ProposedChange): DecisionExitIssue[] {
	return invalidTraceRefs([...change.sourceRefs, ...change.proofRefs]).map(
		(ref) => ({
			code: "invalid_traceability_ref" as const,
			changeId: change.id,
			ref,
			message: `Proposed change ${change.id} has non-canonical ref ${ref}.`,
		}),
	);
}

function recommendationQualityIssues(
	change: ProposedChange,
): DecisionExitIssue[] {
	const issues: DecisionExitIssue[] = [];
	if (!change.recommendation) {
		issues.push({
			code: "missing_recommendation",
			changeId: change.id,
			message: `Proposed change ${change.id} must include an agent recommendation.`,
		});
	} else if (
		!isAllowed(change.recommendation, [
			"approve",
			"reject",
			"defer",
			"ask_user",
		])
	) {
		issues.push({
			code: "invalid_recommendation",
			changeId: change.id,
			message: `Proposed change ${change.id} has invalid recommendation ${change.recommendation}.`,
		});
	} else if (change.recommendation !== "approve") {
		issues.push({
			code: "recommendation_not_approve",
			changeId: change.id,
			message: `Approved proposed change ${change.id} must be recommended for approval by the agent.`,
		});
	}
	if (!change.recommendationRationale) {
		issues.push({
			code: "missing_recommendation_rationale",
			changeId: change.id,
			message: `Proposed change ${change.id} must justify the agent recommendation.`,
		});
	}
	return issues;
}

function agentAssessmentQualityIssues(
	change: ProposedChange,
): DecisionExitIssue[] {
	const assessment = change.agentAssessment;
	const missingStance = !assessment.stance;
	const missingUserAlignment = !assessment.userAlignment;
	const missingProjectBenefit = !assessment.projectBenefit;
	const missingRationale = !assessment.rationale;
	if (
		missingStance ||
		missingUserAlignment ||
		missingProjectBenefit ||
		missingRationale
	) {
		return [
			{
				code: "missing_agent_assessment",
				changeId: change.id,
				message: `Proposed change ${change.id} needs an agent assessment of user alignment, project benefit, and rationale.`,
			},
		];
	}
	if (assessment.stance !== "aligned") {
		return [
			{
				code: "agent_assessment_not_aligned",
				changeId: change.id,
				message: `Agent assessment for proposed change ${change.id} does not validate the intention as aligned.`,
			},
		];
	}
	return [];
}

function riskQualityIssues(change: ProposedChange): DecisionExitIssue[] {
	if (!change.risk) {
		return [
			{
				code: "missing_risk" as const,
				changeId: change.id,
				message: `Proposed change ${change.id} must declare risk as low, medium, or high.`,
			},
		];
	}
	if (!isAllowed(change.risk, ["low", "medium", "high"])) {
		return [
			{
				code: "invalid_risk" as const,
				changeId: change.id,
				message: `Proposed change ${change.id} has invalid risk ${change.risk}.`,
			},
		];
	}
	return [];
}

function highRiskQualityIssues(change: ProposedChange): DecisionExitIssue[] {
	if (!isHighRisk(change)) return [];
	const issues: DecisionExitIssue[] = [];
	if (change.affectedLayers.length === 0) {
		issues.push({
			code: "missing_high_risk_scope",
			changeId: change.id,
			message: `High-risk proposed change ${change.id} must name affected layers.`,
		});
	}
	if (change.alternatives.length === 0) {
		issues.push({
			code: "missing_high_risk_alternative",
			changeId: change.id,
			message: `High-risk proposed change ${change.id} must record at least one alternative.`,
		});
	}
	if (change.proofRefs.length === 0) {
		issues.push({
			code: "missing_high_risk_evidence",
			changeId: change.id,
			message: `High-risk proposed change ${change.id} needs proof refs for research, prior art, validation, or explicit user guidance.`,
		});
	}
	if (change.approvalAuthority !== "user" || !change.approvalRef) {
		issues.push({
			code: "missing_high_risk_approval",
			changeId: change.id,
			message: `High-risk proposed change ${change.id} requires explicit user approval authority and approval ref.`,
		});
	} else {
		const [invalidApprovalRef] = invalidTraceRefs([change.approvalRef]);
		if (invalidApprovalRef) {
			issues.push({
				code: "invalid_approval_ref",
				changeId: change.id,
				ref: invalidApprovalRef,
				message: `High-risk proposed change ${change.id} has non-canonical approval ref ${invalidApprovalRef}.`,
			});
		}
	}
	return issues;
}

function isHighRisk(change: ProposedChange): boolean {
	return (
		String(change.risk || "")
			.trim()
			.toLowerCase() === "high"
	);
}

function activeTraceConflictIssues(
	approvedChanges: ProposedChange[],
	activeTraceGoals: ActiveTraceGoal[],
): DecisionExitIssue[] {
	if (activeTraceGoals.length === 0) return [];
	return approvedChanges.flatMap((change) => {
		const changeRefs = [...change.sourceRefs, ...change.targetRefs].filter(
			isPathRef,
		);
		if (changeRefs.length === 0) return [];
		return activeTraceGoals.flatMap((goal) => {
			const overlaps = overlappingPathScopes(changeRefs, goal.pathScopes || []);
			if (overlaps.length === 0) return [];
			return overlaps.map((overlap) => ({
				code: "active_trace_conflict" as const,
				changeId: change.id,
				ref: overlap,
				message: `Proposed change ${change.id} overlaps active trace ${goal.traceId} on ${overlap}; merge, supersede, defer, or record a non-conflict rationale before approval.`,
			}));
		});
	});
}

function knowledgeDeltaIssues(
	approvedChanges: ProposedChange[],
	knowledgeDelta?: KnowledgeDelta,
): DecisionExitIssue[] {
	if (approvedChanges.length === 0) return [];
	const changesRequireKnowledge = approvedChanges.some(
		(change) => !change.noKbImpactReason,
	);
	if (!knowledgeDelta) {
		return changesRequireKnowledge
			? [
					{
						code: "missing_knowledge_delta" as const,
						message:
							"Decision exit requires a knowledge delta or no-impact rationale before planning.",
					},
				]
			: [];
	}
	const issues: DecisionExitIssue[] = [];
	if (
		changesRequireKnowledge &&
		knowledgeDelta.updatedRefs.length === 0 &&
		!knowledgeDelta.noImpactReason
	) {
		issues.push({
			code: "missing_knowledge_delta",
			message:
				"Decision knowledge delta needs updated refs or no-impact rationale.",
		});
	}
	issues.push(
		...invalidTraceRefs(knowledgeDelta.updatedRefs).map((ref) => ({
			code: "invalid_knowledge_ref" as const,
			ref,
			message: `Decision knowledge delta has non-canonical updated ref ${ref}.`,
		})),
	);
	if (
		Boolean(knowledgeDelta.beforeDigest) !== Boolean(knowledgeDelta.afterDigest)
	) {
		issues.push({
			code: "incomplete_knowledge_digest",
			message:
				"Decision knowledge delta must include both beforeDigest and afterDigest when either digest is present.",
		});
	}
	return issues;
}

function issueRemediation(issue: DecisionExitIssue): ExitRemediationItem {
	return {
		action: decisionRemediationAction(issue),
		route: isBlockingDecisionIssue(issue) ? "user" : "decision",
		refs: decisionIssueRefs(issue),
		blocking: true,
	};
}

const DECISION_REMEDIATION: Record<DecisionExitIssueCode, string> = {
	no_proposed_changes: "Create at least one proposed change.",
	no_approved_changes:
		"Approve, reject, or defer the Proposed Changes; at least one Decision is required for planning.",
	missing_current_state:
		"Ground the proposed change in current KB/source state.",
	missing_desired_state:
		"State the desired target state for the proposed change.",
	missing_rationale:
		"Add rationale explaining why this decision should be accepted.",
	missing_decision_kind:
		"Classify the proposed change as debug, fix, harden, improve, migrate, docs, or release.",
	invalid_decision_kind:
		"Use decisionKind debug, fix, harden, improve, migrate, docs, or release.",
	missing_decision_type:
		"Use a known decision type or let decisionKind resolve to a built-in decision type.",
	unknown_decision_type:
		"Use a built-in decision type or register a guarded project decision type before planning.",
	decision_type_kind_mismatch:
		"Align decisionType with decisionKind or split the change into the correct type.",
	pipeline_profile_route_conflict:
		"Choose a routeTarget allowed by the selected decision type pipeline profile.",
	pipeline_profile_planning_depth_conflict:
		"Choose a planningDepth allowed by the selected decision type pipeline profile.",
	pipeline_profile_direct_route_disallowed:
		"Route this decision type through Planning instead of direct Implementation.",
	pipeline_profile_direct_scale_disallowed:
		"Use direct Implementation only for the scales allowed by the decision type pipeline profile.",
	pipeline_profile_direct_risk_disallowed:
		"Use Planning or stronger approval when risk exceeds the decision type direct-implementation lane.",
	missing_debug_target:
		"For debug decisions, name the component or path being investigated.",
	missing_debug_hypothesis:
		"For debug decisions, state the hypothesis being tested.",
	missing_debug_invariant:
		"For debug decisions, state the invariant or failure boundary.",
	missing_debug_probe:
		"For debug decisions, define the probe, repro command, or observation plan.",
	missing_debug_expected_safe_behavior:
		"For debug decisions, state the expected safe behavior.",
	missing_debug_stop_condition:
		"For debug decisions, state when debugging should stop.",
	missing_fix_reproduction:
		"For fix decisions, describe the known reproduction or failing scenario.",
	missing_fix_expected_behavior:
		"For fix decisions, state the expected behavior.",
	missing_fix_regression_plan:
		"For fix decisions, define the regression coverage plan.",
	missing_harden_boundary:
		"For hardening decisions, name the safety boundary being protected.",
	missing_harden_failure_modes:
		"For hardening decisions, list relevant failure or abuse modes.",
	missing_harden_negative_test_plan:
		"For hardening decisions, define negative test coverage.",
	missing_harden_compatibility_impact:
		"For hardening decisions, state compatibility impact.",
	missing_improve_current_pain:
		"For improvement decisions, describe current user or maintainer pain.",
	missing_improve_desired_outcome:
		"For improvement decisions, state the desired outcome.",
	missing_improve_success_signal:
		"For improvement decisions, define a success signal.",
	missing_improve_non_goals:
		"For improvement decisions, list non-goals to bound scope.",
	missing_migrate_source_behavior:
		"For migration decisions, describe current/source behavior.",
	missing_migrate_target_behavior:
		"For migration decisions, describe target behavior.",
	missing_migrate_preserved_invariants:
		"For migration decisions, list invariants that must be preserved.",
	missing_migrate_equivalence_proof:
		"For migration decisions, define equivalence proof or checks.",
	missing_migrate_rollback_plan:
		"For migration decisions, state rollback or containment strategy.",
	missing_user_impact:
		"Explain how the intention benefits users or user outcomes.",
	missing_maintainer_impact:
		"Explain maintainer cost, operational impact, or complexity impact.",
	missing_effort: "Add a low, medium, or high effort estimate.",
	invalid_effort: "Use effort low, medium, or high.",
	missing_work_scale:
		"Classify the amount of work as tiny, small, normal, or large.",
	invalid_work_scale: "Use workScale tiny, small, normal, or large.",
	missing_planning_depth: "Classify the planning handoff as micro or standard.",
	invalid_planning_depth: "Use planningDepth micro or standard.",
	invalid_micro_plan_scale:
		"Use micro planning only for tiny or small work; otherwise choose standard planning.",
	invalid_micro_plan_risk:
		"Use micro planning only for low-risk work; otherwise choose standard planning.",
	invalid_route_target:
		"Choose routeTarget planning or implementation for the Decision.",
	missing_route_rationale:
		"Explain why this change is safe to route directly to implementation.",
	missing_direct_implementation_mode:
		"Choose implementationMode tdd or targeted_checks for direct implementation.",
	invalid_direct_implementation_mode:
		"Use implementationMode tdd or targeted_checks for direct implementation.",
	invalid_direct_implementation_scale:
		"Route only tiny or small work directly to implementation; use planning for larger work.",
	invalid_direct_implementation_risk:
		"Route only low-risk work directly to implementation; use planning for higher risk.",
	missing_direct_implementation_scope:
		"Add directImplementationScope.pathScopes so implementation has a bounded source scope.",
	missing_direct_implementation_validation:
		"Add directImplementationScope.verification so implementation has targeted checks.",
	missing_recommendation:
		"Add an agent recommendation: approve, reject, defer, or ask_user.",
	invalid_recommendation:
		"Use recommendation approve, reject, defer, or ask_user.",
	recommendation_not_approve:
		"Keep Decisions only when the agent recommends approval; otherwise route to user with alternatives.",
	missing_recommendation_rationale:
		"Explain why the agent recommendation follows from the evidence.",
	missing_agent_assessment:
		"Add agent assessment for user alignment, project benefit, and rationale.",
	agent_assessment_not_aligned:
		"Route to the user with concerns or alternatives before planning.",
	semantic_decision_insufficient:
		"Clarify the decision intent until an independent judge can verify it is specific and planning-ready.",
	semantic_cost_tradeoff_implausible:
		"Revise effort, maintainer impact, work scale, or desired outcome until the cost tradeoff is plausible.",
	semantic_risk_tier_implausible:
		"Revise risk tier, route, scope, or authority evidence until the risk classification is plausible.",
	missing_high_risk_approval:
		"Capture explicit user approval authority and a canonical approval ref for high-risk Decisions.",
	missing_risk: "Declare decision risk as low, medium, or high.",
	invalid_risk: "Use risk low, medium, or high.",
	invalid_approval_ref:
		"Replace weak approval refs with canonical trace, KB, Git, digest, source, or test refs.",
	missing_current_state_packet:
		"Attach canonical current-state refs: KB, source/test path, trace event, Git ref, or digest.",
	invalid_current_state_ref:
		"Replace weak current-state refs with canonical KB, trace, Git, digest, source, or test refs.",
	missing_traceability_ref:
		"Attach canonical source refs or an explicit no-KB-impact rationale.",
	missing_high_risk_scope:
		"Name affected layers so reviewers can reason about blast radius.",
	missing_high_risk_alternative:
		"Add at least one viable alternative for the high-risk intention.",
	missing_high_risk_evidence:
		"Attach proof refs for research, prior art, validation, or explicit user guidance.",
	duplicate_change_id: "Give every proposed change a stable unique id.",
	invalid_traceability_ref:
		"Replace weak refs with canonical KB, trace, Git, digest, source, or test refs.",
	missing_knowledge_delta:
		"Add a decision knowledge delta with updated refs or explicit no-impact rationale.",
	invalid_knowledge_ref:
		"Replace weak knowledge delta refs with canonical KB, trace, Git, digest, source, or test refs.",
	incomplete_knowledge_digest:
		"Record both beforeDigest and afterDigest, or omit both until write proof exists.",
	active_trace_conflict:
		"Resolve the active trace overlap by merging, superseding, deferring, adding dependency, or recording explicit non-conflict rationale.",
};

function decisionRemediationAction(issue: DecisionExitIssue): string {
	return DECISION_REMEDIATION[issue.code];
}

function blockedIssues(issues: DecisionExitIssue[]): DecisionExitIssue[] {
	return issues.filter(isBlockingDecisionIssue);
}

function overlappingPathScopes(left: string[], right: string[]): string[] {
	const overlaps: string[] = [];
	for (const leftScope of left) {
		for (const rightScope of right) {
			const overlap = overlappingScope(leftScope, rightScope);
			if (overlap) overlaps.push(overlap);
		}
	}
	return unique(overlaps);
}

function overlappingScope(left: string, right: string): string | undefined {
	const leftPath = normalizePathScope(left);
	const rightPath = normalizePathScope(right);
	if (!leftPath || !rightPath) return undefined;
	if (leftPath === rightPath) return leftPath;
	if (rightPath.startsWith(`${leftPath}/`)) return leftPath;
	if (leftPath.startsWith(`${rightPath}/`)) return rightPath;
	return undefined;
}

function normalizePathScope(pathScope: string): string {
	return pathScope.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

function isPathRef(ref: string): boolean {
	const normalized = normalizePathScope(ref);
	return (
		normalized.startsWith("src/") ||
		normalized.startsWith("tests/") ||
		normalized.startsWith(".codewiki/kb/") ||
		normalized.startsWith("kb:")
	);
}

function isAllowed(value: string, allowed: string[]): boolean {
	return allowed.includes(value.trim().toLowerCase());
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
