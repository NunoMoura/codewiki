import {
	collectDecisionExitIssues,
	evaluateDecisionExit,
} from "../../src/decision/loop.ts";
import type {
	DecisionExitIssue,
	DecisionExitIssueCode,
	DecisionExitOptions,
	DecisionExitResult,
} from "../../src/decision/loop.ts";
import type { SprintProposal } from "../../src/decision/types.ts";
import { labQualityPackForCandidate } from "../runner/quality-pack.ts";
import type { LabCandidateStandards, LabStandard } from "../runner/types.ts";

export interface DecisionLabInput {
	prompt: string;
	sprintProposal: SprintProposal;
	options?: DecisionExitOptions;
}

export const decisionLoopStandards: LabStandard<DecisionLabInput>[] = [
	{
		id: "decision.production_exit_contract",
		mode: "deterministic",
		weight: 20,
		cost: 20,
		method: "deterministic",
		standardType: "loop_contract",
		layer: "hard_gate",
		repairTarget: "decision",
		description:
			"Production decision exit contract must still pass before the lab candidate can exit.",
		evaluate(input) {
			const exit = evaluateDecisionExit(
				input.sprintProposal,
				input.options || {},
			);
			return productionExitResult("decision.production_exit_contract", exit);
		},
	},
	decisionIssueCodeStandard({
		id: "decision.required_decision_content",
		weight: 8,
		cost: 8,
		standardType: "loop_contract",
		description:
			"Proposed changes must include required current state, desired state, rationale, recommendation, and kind fields.",
		codes: [
			"no_proposed_changes",
			"no_approved_changes",
			"missing_current_state",
			"missing_desired_state",
			"missing_rationale",
			"missing_decision_kind",
			"invalid_decision_kind",
			"missing_recommendation",
			"invalid_recommendation",
			"recommendation_not_approve",
			"missing_recommendation_rationale",
		],
	}),
	decisionIssueCodeStandard({
		id: "decision.kind_specific_contract",
		weight: 8,
		cost: 8,
		standardType: "loop_contract",
		description:
			"Decision-kind contracts must include the debug, fix, harden, improve, or migration details needed by planning.",
		codes: [
			"missing_debug_target",
			"missing_debug_hypothesis",
			"missing_debug_invariant",
			"missing_debug_probe",
			"missing_debug_expected_safe_behavior",
			"missing_debug_stop_condition",
			"missing_fix_reproduction",
			"missing_fix_expected_behavior",
			"missing_fix_regression_plan",
			"missing_harden_boundary",
			"missing_harden_failure_modes",
			"missing_harden_negative_test_plan",
			"missing_harden_compatibility_impact",
			"missing_improve_current_pain",
			"missing_improve_desired_outcome",
			"missing_improve_success_signal",
			"missing_improve_non_goals",
			"missing_migrate_source_behavior",
			"missing_migrate_target_behavior",
			"missing_migrate_preserved_invariants",
			"missing_migrate_equivalence_proof",
			"missing_migrate_rollback_plan",
		],
	}),
	decisionIssueCodeStandard({
		id: "decision.traceability_and_knowledge_refs",
		weight: 10,
		cost: 10,
		standardType: "trace_fidelity",
		description:
			"Decision exit must preserve valid traceability, source, approval, and knowledge references.",
		codes: [
			"missing_current_state_packet",
			"invalid_current_state_ref",
			"missing_traceability_ref",
			"invalid_traceability_ref",
			"missing_knowledge_delta",
			"invalid_knowledge_ref",
			"incomplete_knowledge_digest",
			"invalid_approval_ref",
		],
	}),
	decisionIssueCodeStandard({
		id: "decision.risk_and_authority_boundary",
		weight: 12,
		cost: 12,
		standardType: "scope_control",
		route: "block",
		description:
			"Decision exit must not let high-risk or conflicted work proceed without authority and bounded risk evidence.",
		codes: [
			"missing_risk",
			"invalid_risk",
			"missing_high_risk_approval",
			"missing_high_risk_scope",
			"missing_high_risk_alternative",
			"missing_high_risk_evidence",
			"active_trace_conflict",
		],
	}),
	decisionIssueCodeStandard({
		id: "decision.work_routing_contract",
		weight: 8,
		cost: 8,
		standardType: "scope_control",
		description:
			"Decision exit must choose effort, work scale, and planning depth that planning can execute.",
		codes: [
			"missing_effort",
			"invalid_effort",
			"missing_work_scale",
			"invalid_work_scale",
			"missing_planning_depth",
			"invalid_planning_depth",
			"invalid_micro_plan_scale",
			"invalid_micro_plan_risk",
		],
	}),
	decisionSpecificityStandard({
		id: "decision.current_desired_rationale_specificity",
		weight: 6,
		cost: 6,
		standardType: "user_value",
		description:
			"Approved decisions must explain concrete current state, desired state, and rationale instead of vague placeholders.",
		fields(change) {
			return [
				{ label: "currentState", value: change.currentState },
				{ label: "desiredState", value: change.desiredState },
				{ label: "rationale", value: change.rationale },
			];
		},
	}),
	decisionSpecificityStandard({
		id: "decision.impact_specificity",
		weight: 6,
		cost: 6,
		standardType: "user_value",
		description:
			"Approved decisions must state concrete user and maintainer impact.",
		fields(change) {
			return [
				{ label: "userImpact", value: change.userImpact },
				{ label: "maintainerImpact", value: change.maintainerImpact },
			];
		},
	}),
	decisionSpecificityStandard({
		id: "decision.agent_assessment_specificity",
		weight: 6,
		cost: 6,
		standardType: "project_fit",
		description:
			"Approved decisions must include concrete agent assessment for user alignment and project benefit.",
		fields(change) {
			return [
				{
					label: "recommendationRationale",
					value: change.recommendationRationale,
				},
				{
					label: "agentAssessment.userAlignment",
					value: change.agentAssessment.userAlignment,
				},
				{
					label: "agentAssessment.projectBenefit",
					value: change.agentAssessment.projectBenefit,
				},
				{
					label: "agentAssessment.rationale",
					value: change.agentAssessment.rationale,
				},
			];
		},
	}),
];

const decisionLoopCandidateDeclaration = {
	loop: "decision",
	metric: "DEC",
	graphId: "decision.loop.lab",
	graphVersion: "0.3.0.lab.2",
	schemaVersion: 3,
	layers: [
		"hard_gate",
		"input_contract",
		"trace_fidelity",
		"specificity",
		"risk_authority",
		"project_fit",
		"pipeline_carryover",
		"exit_loss",
	],
	standards: decisionLoopStandards,
} satisfies Omit<LabCandidateStandards<DecisionLabInput>, "qualityPack">;

export const decisionLoopCandidate = {
	...decisionLoopCandidateDeclaration,
	qualityPack: labQualityPackForCandidate(decisionLoopCandidateDeclaration),
} satisfies LabCandidateStandards<DecisionLabInput>;

function decisionIssueCodeStandard({
	id,
	weight,
	cost,
	standardType,
	description,
	codes,
	route = "fail",
}: {
	id: string;
	weight: number;
	cost: number;
	standardType: LabStandard<DecisionLabInput>["standardType"];
	description: string;
	codes: DecisionExitIssueCode[];
	route?: "fail" | "block";
}): LabStandard<DecisionLabInput> {
	const codeSet = new Set(codes);
	return {
		id,
		mode: "deterministic",
		weight,
		cost,
		method: "deterministic",
		standardType,
		layer: "input_contract",
		repairTarget: "decision",
		description,
		evaluate(input) {
			const failures = collectDecisionExitIssues(
				input.sprintProposal,
				input.options || {},
			).issues.filter((issue) => codeSet.has(issue.code));
			return {
				id,
				mode: "deterministic" as const,
				weight,
				cost,
				passed: failures.length === 0,
				route,
				description,
				method: "deterministic" as const,
				standardType,
				layer: "input_contract" as const,
				repairTarget: "decision" as const,
				score: failures.length === 0 ? 0 : 1,
				evidence: issueEvidence(failures),
				...(failures.length > 0 ? { message: issueMessage(failures) } : {}),
			};
		},
	};
}

function decisionSpecificityStandard({
	id,
	weight,
	cost,
	standardType,
	description,
	fields,
}: {
	id: string;
	weight: number;
	cost: number;
	standardType: LabStandard<DecisionLabInput>["standardType"];
	description: string;
	fields(change: SprintProposal["changes"][number]): SpecificityField[];
}): LabStandard<DecisionLabInput> {
	return {
		id,
		mode: "deterministic",
		weight,
		cost,
		method: "deterministic",
		standardType,
		layer: "specificity",
		repairTarget: "decision",
		description,
		evaluate(input) {
			const failures = decisionSpecificityFailures(
				input.sprintProposal.changes,
				fields,
			);
			return {
				id,
				mode: "deterministic" as const,
				weight,
				cost,
				passed: failures.weakFields === 0,
				route: "fail" as const,
				description,
				method: "deterministic" as const,
				standardType,
				layer: "specificity" as const,
				repairTarget: "decision" as const,
				score:
					failures.totalFields === 0
						? 0
						: failures.weakFields / failures.totalFields,
				evidence: failures.messages.map((message) => ({
					kind: "decision-field",
					ref: id,
					summary: message,
				})),
				...(failures.messages.length > 0
					? { message: failures.messages.join(" ") }
					: {}),
			};
		},
	};
}

interface SpecificityField {
	label: string;
	value: string;
}

function decisionSpecificityFailures(
	changes: SprintProposal["changes"],
	fieldsForRow: (
		change: SprintProposal["changes"][number],
	) => SpecificityField[],
): { messages: string[]; totalFields: number; weakFields: number } {
	let totalFields = 0;
	let weakFields = 0;
	const messages: string[] = [];
	for (const change of changes) {
		if (change.approval !== "approved") continue;
		const fields = fieldsForRow(change);
		totalFields += fields.length;
		const weakLabels = fields
			.filter((field) => isWeakDecisionText(field.value))
			.map((field) => field.label);
		weakFields += weakLabels.length;
		if (weakLabels.length > 0) {
			messages.push(
				`Proposed change ${change.id} has vague fields: ${weakLabels.join(", ")}.`,
			);
		}
	}
	return { messages, totalFields, weakFields };
}

function isWeakDecisionText(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	if (GENERIC_DECISION_TEXT.has(normalized)) return true;
	const words = meaningfulWords(normalized);
	return words.length < 4 || new Set(words).size < 3;
}

function meaningfulWords(value: string): string[] {
	return value
		.split(/[^a-z0-9-]+/)
		.filter((word) => word.length > 2)
		.filter((word) => !GENERIC_DECISION_WORDS.has(word));
}

function productionExitResult(id: string, exit: DecisionExitResult) {
	return {
		id,
		mode: "deterministic" as const,
		weight: 20,
		cost: 20,
		passed: exit.verdict === "pass",
		route: exit.verdict,
		description: "Production decision exit contract.",
		method: "deterministic" as const,
		standardType: "loop_contract" as const,
		layer: "hard_gate" as const,
		repairTarget: "decision" as const,
		score: exit.verdict === "pass" ? 0 : 1,
		evidence: issueEvidence(exit.issues),
		...(exit.issues.length > 0
			? { message: exit.issues.map((issue) => issue.message).join(" ") }
			: {}),
	};
}

function issueEvidence(issues: DecisionExitIssue[]) {
	return issues.map((issue) => ({
		kind: "decision-issue",
		ref: issue.changeId ? `${issue.code}:${issue.changeId}` : issue.code,
		summary: issue.message,
	}));
}

function issueMessage(issues: DecisionExitIssue[]): string {
	return issues.map((issue) => issue.message).join(" ");
}

const GENERIC_DECISION_TEXT = new Set([
	"better",
	"fine",
	"good",
	"needed",
	"ok",
	"small",
]);

const GENERIC_DECISION_WORDS = new Set([
	"and",
	"for",
	"the",
	"this",
	"that",
	"with",
]);
