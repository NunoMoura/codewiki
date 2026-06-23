import { evaluatePlanningExit } from "../../src/planning/exit.ts";
import type {
	PlanningExitInput,
	PlanningExitResult,
} from "../../src/planning/exit.ts";
import type { LabCandidateStandards, LabStandard } from "../runner/types.ts";

export interface PlanningLabInput {
	decisions: unknown[];
	plan: PlanningExitInput;
}

export const planningExitStandards: LabStandard<PlanningLabInput>[] = [
	{
		id: "production_planning_exit_parity",
		mode: "deterministic",
		weight: 100,
		description:
			"Seed candidate mirrors the current production planning exit until experiments add better weighted standards.",
		evaluate(input) {
			const exit = evaluatePlanningExit(input.plan);
			return productionExitResult("production_planning_exit_parity", exit);
		},
	},
	{
		id: "planning_work_unit_specificity",
		mode: "deterministic",
		weight: 40,
		description:
			"Implementation-ready planning work units must use specific outcome, requirement, acceptance, verification, profile, and assessment text.",
		evaluate(input) {
			const failures = input.plan.workItems.flatMap(
				planningSpecificityFailures,
			);
			return {
				id: "planning_work_unit_specificity",
				mode: "deterministic" as const,
				weight: 40,
				passed: failures.length === 0,
				route: "fail" as const,
				description:
					"Implementation-ready planning work units must use specific outcome, requirement, acceptance, verification, profile, and assessment text.",
				...(failures.length > 0
					? { message: failures.join(" ") }
					: {}),
			};
		},
	},
];

export const planningExitCandidate = {
	loop: "planning",
	metric: "PEC",
	standards: planningExitStandards,
} satisfies LabCandidateStandards<PlanningLabInput>;

function planningSpecificityFailures(
	item: PlanningExitInput["workItems"][number],
): string[] {
	const fields = [
		{ label: "title", value: item.title, kind: "text" },
		{ label: "outcome", value: item.outcome, kind: "text" },
		...item.technicalRequirements.map((value, index) => ({
			label: `technicalRequirements[${index}]`,
			value,
			kind: "text",
		})),
		...item.acceptanceCriteria.map((criterion, index) => ({
			label: `acceptanceCriteria[${index}]`,
			value: criterion.text,
			kind: "text",
		})),
		...item.acceptance.map((value, index) => ({
			label: `acceptance[${index}]`,
			value,
			kind: "text",
		})),
		...item.verification.map((value, index) => ({
			label: `verification[${index}]`,
			value,
			kind: "verification",
		})),
		{ label: "workerProfile", value: item.workerProfile, kind: "profile" },
		{
			label: "planningAssessment.rightSizing",
			value: item.planningAssessment.rightSizing,
			kind: "text",
		},
		{
			label: "planningAssessment.independence",
			value: item.planningAssessment.independence,
			kind: "text",
		},
		{
			label: "planningAssessment.implementationReadiness",
			value: item.planningAssessment.implementationReadiness,
			kind: "text",
		},
		{
			label: "planningAssessment.uncertaintyResolution",
			value: item.planningAssessment.uncertaintyResolution,
			kind: "text",
		},
		{
			label: "planningAssessment.rationale",
			value: item.planningAssessment.rationale,
			kind: "text",
		},
	];
	const weakFields = fields
		.filter((field) => isWeakPlanningField(field.value, field.kind))
		.map((field) => field.label);
	return weakFields.length === 0
		? []
		: [
				`Planning work item ${item.id} has vague fields: ${weakFields.join(", ")}.`,
			];
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

function productionExitResult(id: string, exit: PlanningExitResult) {
	return {
		id,
		mode: "deterministic" as const,
		weight: 100,
		passed: exit.verdict === "pass",
		route: exit.verdict,
		description: "Production planning exit parity.",
		...(exit.issues.length > 0
			? { message: exit.issues.map((issue) => issue.message).join(" ") }
			: {}),
	};
}
