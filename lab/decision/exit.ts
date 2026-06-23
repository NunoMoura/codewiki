import { evaluateDecisionExit } from "../../src/decision/exit.ts";
import type {
	DecisionExitOptions,
	DecisionExitResult,
} from "../../src/decision/exit.ts";
import type { DecisionTable } from "../../src/decision/types.ts";
import type { LabCandidateStandards, LabStandard } from "../runner/types.ts";

export interface DecisionLabInput {
	prompt: string;
	decisionTable: DecisionTable;
	options?: DecisionExitOptions;
}

export const decisionExitStandards: LabStandard<DecisionLabInput>[] = [
	{
		id: "production_decision_exit_parity",
		mode: "deterministic",
		weight: 100,
		description:
			"Seed candidate mirrors the current production decision exit until experiments add better weighted standards.",
		evaluate(input) {
			const exit = evaluateDecisionExit(
				input.decisionTable,
				input.options || {},
			);
			return productionExitResult("production_decision_exit_parity", exit);
		},
	},
	{
		id: "decision_row_specificity",
		mode: "deterministic",
		weight: 40,
		description:
			"Approved decision rows must use specific impact, rationale, and assessment text instead of generic placeholder words.",
		evaluate(input) {
			const failures = input.decisionTable.rows.flatMap(
				decisionSpecificityFailures,
			);
			return {
				id: "decision_row_specificity",
				mode: "deterministic" as const,
				weight: 40,
				passed: failures.length === 0,
				route: "fail" as const,
				description:
					"Approved decision rows must use specific impact, rationale, and assessment text instead of generic placeholder words.",
				...(failures.length > 0
					? { message: failures.join(" ") }
					: {}),
			};
		},
	},
];

export const decisionExitCandidate = {
	loop: "decision",
	metric: "DEC",
	standards: decisionExitStandards,
} satisfies LabCandidateStandards<DecisionLabInput>;

function decisionSpecificityFailures(
	row: DecisionTable["rows"][number],
): string[] {
	if (row.approval !== "approved") return [];
	const fields = [
		{ label: "currentState", value: row.currentState },
		{ label: "desiredState", value: row.desiredState },
		{ label: "rationale", value: row.rationale },
		{ label: "userImpact", value: row.userImpact },
		{ label: "maintainerImpact", value: row.maintainerImpact },
		{
			label: "recommendationRationale",
			value: row.recommendationRationale,
		},
		{
			label: "agentAssessment.userAlignment",
			value: row.agentAssessment.userAlignment,
		},
		{
			label: "agentAssessment.projectBenefit",
			value: row.agentAssessment.projectBenefit,
		},
		{
			label: "agentAssessment.rationale",
			value: row.agentAssessment.rationale,
		},
	];
	const weakFields = fields
		.filter((field) => isWeakDecisionText(field.value))
		.map((field) => field.label);
	return weakFields.length === 0
		? []
		: [
				`Decision row ${row.id} has vague fields: ${weakFields.join(", ")}.`,
			];
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

function productionExitResult(id: string, exit: DecisionExitResult) {
	return {
		id,
		mode: "deterministic" as const,
		weight: 100,
		passed: exit.verdict === "pass",
		route: exit.verdict,
		description: "Production decision exit parity.",
		...(exit.issues.length > 0
			? { message: exit.issues.map((issue) => issue.message).join(" ") }
			: {}),
	};
}
