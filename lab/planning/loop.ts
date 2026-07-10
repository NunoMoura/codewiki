import {
	collectPlanningExitIssues,
	evaluatePlanningExit,
} from "../../src/planning/loop.ts";
import type {
	PlanningExitInput,
	PlanningExitIssue,
	PlanningExitIssueCode,
	PlanningExitResult,
} from "../../src/planning/loop.ts";
import type { LabCandidateStandards, LabStandard } from "../runner/types.ts";

export interface PlanningLabInput {
	decisions: unknown[];
	plan: PlanningExitInput;
}

export const planningLoopStandards: LabStandard<PlanningLabInput>[] = [
	{
		id: "planning.production_exit_contract",
		mode: "deterministic",
		weight: 20,
		cost: 20,
		method: "deterministic",
		standardType: "loop_contract",
		layer: "hard_gate",
		repairTarget: "planning",
		description:
			"Production planning exit contract must still pass before the lab candidate can exit.",
		evaluate(input) {
			const exit = evaluatePlanningExit(input.plan);
			return productionExitResult("planning.production_exit_contract", exit);
		},
	},
	planningIssueCodeStandard({
		id: "planning.decision_coverage_traceability",
		weight: 10,
		cost: 10,
		standardType: "trace_fidelity",
		description:
			"Planning must cover every accepted decision with valid traceability refs.",
		codes: [
			"missing_decision_coverage",
			"unknown_decision_ref",
			"invalid_traceability_ref",
		],
	}),
	planningIssueCodeStandard({
		id: "planning.work_unit_structure",
		weight: 8,
		cost: 8,
		standardType: "loop_contract",
		description:
			"Planning work units must include executable structure, requirements, verification, and worker profile.",
		codes: [
			"invalid_work_item",
			"missing_technical_requirements",
			"missing_verification",
			"missing_worker_profile",
			"invalid_planning_depth",
			"invalid_micro_plan_dependency",
			"invalid_micro_plan_decision_count",
		],
	}),
	planningIssueCodeStandard({
		id: "planning.readiness_and_uncertainty",
		weight: 8,
		cost: 8,
		standardType: "robustness",
		description:
			"Planning must resolve uncertainty and prove each work unit is right-sized and implementation-ready.",
		codes: [
			"missing_planning_assessment",
			"planning_assessment_not_worker_ready",
			"missing_uncertainty_resolution",
			"unresolved_planning_uncertainty",
			"missing_right_sizing",
			"work_unit_not_right_sized",
		],
	}),
	planningIssueCodeStandard({
		id: "planning.acceptance_criteria_integrity",
		weight: 8,
		cost: 8,
		standardType: "evidence_quality",
		description:
			"Planning acceptance criteria must be valid, unique, and usable by implementation evidence.",
		codes: [
			"invalid_acceptance_criterion",
			"duplicate_acceptance_criterion_id",
		],
	}),
	planningIssueCodeStandard({
		id: "planning.component_scope_alignment",
		weight: 10,
		cost: 10,
		standardType: "scope_control",
		description:
			"Planning path scopes and verification commands must stay inside declared source-map component contracts.",
		codes: [
			"missing_component_ref",
			"unknown_component_ref",
			"invalid_component_contract",
			"path_outside_component_scope",
			"verification_outside_component_tests",
		],
	}),
	planningIssueCodeStandard({
		id: "planning.dependency_and_conflict_integrity",
		weight: 10,
		cost: 10,
		standardType: "scope_control",
		description:
			"Planning work units must avoid duplicate IDs, unknown dependencies, dependency cycles, and unordered path conflicts.",
		codes: [
			"duplicate_work_item_id",
			"unknown_dependency",
			"dependency_cycle",
			"path_conflict",
		],
	}),
	planningIssueCodeStandard({
		id: "planning.resolution_and_trigger_integrity",
		weight: 8,
		cost: 8,
		standardType: "loop_contract",
		description:
			"Planning resolutions and triggers must use valid route-back, recurrence, and run-mode contracts.",
		codes: [
			"invalid_resolution",
			"invalid_resolution_kind",
			"route_back_resolution",
			"invalid_trigger",
			"invalid_trigger_kind",
			"invalid_trigger_run_mode",
			"invalid_trigger_concurrency",
		],
	}),
	planningSpecificityStandard({
		id: "planning.outcome_requirement_specificity",
		weight: 6,
		cost: 6,
		standardType: "user_value",
		description:
			"Work-unit title, outcome, and technical requirements must describe concrete implementation work.",
		fields(item) {
			return [
				{ label: "title", value: item.title, kind: "text" },
				{ label: "outcome", value: item.outcome, kind: "text" },
				...item.technicalRequirements.map((value, index) => ({
					label: `technicalRequirements[${index}]`,
					value,
					kind: "text" as const,
				})),
			];
		},
	}),
	planningSpecificityStandard({
		id: "planning.acceptance_verification_specificity",
		weight: 8,
		cost: 8,
		standardType: "evidence_quality",
		description:
			"Acceptance criteria and verification commands must be concrete enough for implementation proof.",
		fields(item) {
			return [
				...item.acceptanceCriteria.map((criterion, index) => ({
					label: `acceptanceCriteria[${index}]`,
					value: criterion.text,
					kind: "text" as const,
				})),
				...item.acceptance.map((value, index) => ({
					label: `acceptance[${index}]`,
					value,
					kind: "text" as const,
				})),
				...item.verification.map((value, index) => ({
					label: `verification[${index}]`,
					value,
					kind: "verification" as const,
				})),
			];
		},
	}),
	planningSpecificityStandard({
		id: "planning.assessment_specificity",
		weight: 6,
		cost: 6,
		standardType: "project_fit",
		description:
			"Planning assessment must justify right-sizing, independence, readiness, uncertainty, and worker profile.",
		fields(item) {
			return [
				{ label: "workerProfile", value: item.workerProfile, kind: "profile" },
				{
					label: "planningAssessment.rightSizing",
					value: item.planningAssessment.rightSizing,
					kind: "text" as const,
				},
				{
					label: "planningAssessment.independence",
					value: item.planningAssessment.independence,
					kind: "text" as const,
				},
				{
					label: "planningAssessment.implementationReadiness",
					value: item.planningAssessment.implementationReadiness,
					kind: "text" as const,
				},
				{
					label: "planningAssessment.uncertaintyResolution",
					value: item.planningAssessment.uncertaintyResolution,
					kind: "text" as const,
				},
				{
					label: "planningAssessment.rationale",
					value: item.planningAssessment.rationale,
					kind: "text" as const,
				},
			];
		},
	}),
	{
		id: "planning.path_scope_overlap",
		mode: "deterministic",
		weight: 10,
		cost: 10,
		method: "deterministic",
		standardType: "scope_control",
		layer: "scope_control",
		repairTarget: "planning",
		description:
			"Independent planning work units must not overlap exact, hierarchical, or glob path scopes unless a dependency orders the work.",
		evaluate(input) {
			const failures = pathScopeOverlapFailures(input.plan.workItems);
			return {
				id: "planning.path_scope_overlap",
				mode: "deterministic" as const,
				weight: 10,
				cost: 10,
				passed: failures.length === 0,
				route: "fail" as const,
				description:
					"Independent planning work units must not overlap exact, hierarchical, or glob path scopes unless a dependency orders the work.",
				method: "deterministic" as const,
				standardType: "scope_control" as const,
				layer: "scope_control" as const,
				repairTarget: "planning" as const,
				score: failures.length === 0 ? 0 : 1,
				evidence: failures.map((message) => ({
					kind: "planning-path-overlap",
					ref: "planning.path_scope_overlap",
					summary: message,
				})),
				...(failures.length > 0 ? { message: failures.join(" ") } : {}),
			};
		},
	},
];

export const planningLoopCandidate = {
	loop: "planning",
	metric: "PEC",
	graphId: "planning.loop.lab",
	graphVersion: "0.3.0.lab.2",
	schemaVersion: 3,
	layers: [
		"hard_gate",
		"input_contract",
		"trace_fidelity",
		"coverage",
		"scope_control",
		"specificity",
		"project_fit",
		"repairability",
		"pipeline_carryover",
		"exit_loss",
	],
	standards: planningLoopStandards,
} satisfies LabCandidateStandards<PlanningLabInput>;

function planningIssueCodeStandard({
	id,
	weight,
	cost,
	standardType,
	description,
	codes,
}: {
	id: string;
	weight: number;
	cost: number;
	standardType: LabStandard<PlanningLabInput>["standardType"];
	description: string;
	codes: PlanningExitIssueCode[];
}): LabStandard<PlanningLabInput> {
	const codeSet = new Set(codes);
	return {
		id,
		mode: "deterministic",
		weight,
		cost,
		method: "deterministic",
		standardType,
		layer: "input_contract",
		repairTarget: "planning",
		description,
		evaluate(input) {
			const failures = collectPlanningExitIssues(input.plan).filter((issue) =>
				codeSet.has(issue.code),
			);
			return {
				id,
				mode: "deterministic" as const,
				weight,
				cost,
				passed: failures.length === 0,
				route: "fail" as const,
				description,
				method: "deterministic" as const,
				standardType,
				layer: "input_contract" as const,
				repairTarget: "planning" as const,
				score: failures.length === 0 ? 0 : 1,
				evidence: issueEvidence(failures),
				...(failures.length > 0 ? { message: issueMessage(failures) } : {}),
			};
		},
	};
}

function planningSpecificityStandard({
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
	standardType: LabStandard<PlanningLabInput>["standardType"];
	description: string;
	fields(item: PlanningExitInput["workItems"][number]): SpecificityField[];
}): LabStandard<PlanningLabInput> {
	return {
		id,
		mode: "deterministic",
		weight,
		cost,
		method: "deterministic",
		standardType,
		layer: "specificity",
		repairTarget: "planning",
		description,
		evaluate(input) {
			const failures = planningSpecificityFailures(
				input.plan.workItems,
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
				repairTarget: "planning" as const,
				score:
					failures.totalFields === 0
						? 0
						: failures.weakFields / failures.totalFields,
				evidence: failures.messages.map((message) => ({
					kind: "planning-field",
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
	kind: "text" | "verification" | "profile";
}

function planningSpecificityFailures(
	items: PlanningExitInput["workItems"],
	fieldsForItem: (
		item: PlanningExitInput["workItems"][number],
	) => SpecificityField[],
): { messages: string[]; totalFields: number; weakFields: number } {
	let totalFields = 0;
	let weakFields = 0;
	const messages: string[] = [];
	for (const item of items) {
		const fields = fieldsForItem(item);
		totalFields += fields.length;
		const weakLabels = fields
			.filter((field) => isWeakPlanningField(field.value, field.kind))
			.map((field) => field.label);
		weakFields += weakLabels.length;
		if (weakLabels.length > 0) {
			messages.push(
				`Planning work item ${item.id} has vague fields: ${weakLabels.join(", ")}.`,
			);
		}
	}
	return { messages, totalFields, weakFields };
}

function pathScopeOverlapFailures(
	items: PlanningExitInput["workItems"],
): string[] {
	const failures: string[] = [];
	for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
		for (
			let rightIndex = leftIndex + 1;
			rightIndex < items.length;
			rightIndex += 1
		) {
			const left = items[leftIndex];
			const right = items[rightIndex];
			const overlaps = overlappingPathScopes(left.pathScopes, right.pathScopes);
			if (overlaps.length === 0 || orderedByDependency(left, right)) continue;
			failures.push(
				`Planning work items ${left.id} and ${right.id} overlap on ${overlaps.join(", ")}.`,
			);
		}
	}
	return failures;
}

function overlappingPathScopes(left: string[], right: string[]): string[] {
	return unique(
		left.flatMap((leftScope) =>
			right
				.map((rightScope) => overlappingPathScope(leftScope, rightScope))
				.filter((scope): scope is string => Boolean(scope)),
		),
	);
}

function overlappingPathScope(
	leftScope: string,
	rightScope: string,
): string | undefined {
	const left = normalizePathScope(leftScope);
	const right = normalizePathScope(rightScope);
	if (!left || !right) return undefined;
	if (left === right) return left;
	const leftRoot = globRoot(left);
	const rightRoot = globRoot(right);
	if (containsPathScope(leftRoot, right)) return left;
	if (containsPathScope(rightRoot, left)) return right;
	return undefined;
}

function globRoot(pathScope: string): string {
	const wildcardIndex = pathScope.search(/[*{[]/);
	if (wildcardIndex === -1) return pathScope;
	return pathScope.slice(0, wildcardIndex).replace(/\/+$|\\+$/g, "");
}

function containsPathScope(parent: string, child: string): boolean {
	return child === parent || child.startsWith(`${parent}/`);
}

function orderedByDependency(
	left: PlanningExitInput["workItems"][number],
	right: PlanningExitInput["workItems"][number],
): boolean {
	return left.dependsOn.includes(right.id) || right.dependsOn.includes(left.id);
}

function normalizePathScope(pathScope: string): string {
	return pathScope
		.trim()
		.replace(/\\/g, "/")
		.replace(/\/+$|\\+$/g, "");
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}

function isWeakPlanningField(value: string, kind: string): boolean {
	const normalized = value.trim().toLowerCase();
	if (kind === "verification" && isSpecificVerification(normalized)) {
		return false;
	}
	if (kind === "profile") return GENERIC_PLANNING_TEXT.has(normalized);
	if (GENERIC_PLANNING_TEXT.has(normalized)) return true;
	const words = meaningfulWords(normalized);
	return words.length < 4 || new Set(words).size < 3;
}

function isSpecificVerification(value: string): boolean {
	return (
		(value.includes("/") || value.includes(".") || value.includes("npm ")) &&
		value.length >= 8
	);
}

function meaningfulWords(value: string): string[] {
	return value
		.split(/[^a-z0-9-]+/)
		.filter((word) => word.length > 2)
		.filter((word) => !GENERIC_PLANNING_WORDS.has(word));
}

function productionExitResult(id: string, exit: PlanningExitResult) {
	return {
		id,
		mode: "deterministic" as const,
		weight: 20,
		cost: 20,
		passed: exit.verdict === "pass",
		route: exit.verdict,
		description: "Production planning exit contract.",
		method: "deterministic" as const,
		standardType: "loop_contract" as const,
		layer: "hard_gate" as const,
		repairTarget: "planning" as const,
		score: exit.verdict === "pass" ? 0 : 1,
		evidence: issueEvidence(exit.issues),
		...(exit.issues.length > 0
			? { message: exit.issues.map((issue) => issue.message).join(" ") }
			: {}),
	};
}

function issueEvidence(issues: PlanningExitIssue[]) {
	return issues.map((issue) => ({
		kind: "planning-issue",
		ref: issue.workItemId ? `${issue.code}:${issue.workItemId}` : issue.code,
		summary: issue.message,
	}));
}

function issueMessage(issues: PlanningExitIssue[]): string {
	return issues.map((issue) => issue.message).join(" ");
}

const GENERIC_PLANNING_TEXT = new Set([
	"do it",
	"done",
	"ok",
	"tests",
	"worker",
	"works",
]);

const GENERIC_PLANNING_WORDS = new Set([
	"and",
	"for",
	"the",
	"this",
	"that",
	"with",
]);
