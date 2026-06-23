import { evaluateImplementationExit } from "../../src/implementation/exit.ts";
import type {
	ImplementationExitInput,
	ImplementationExitResult,
} from "../../src/implementation/types.ts";
import type { LabCandidateStandards, LabStandard } from "../runner/types.ts";

export interface ImplementationLabInput {
	plan: unknown;
	implementation: ImplementationExitInput;
}

export const implementationExitStandards: LabStandard<ImplementationLabInput>[] =
	[
		{
			id: "production_implementation_exit_parity",
			mode: "deterministic",
			weight: 100,
			description:
				"Seed candidate mirrors the current production implementation exit until experiments add better weighted standards.",
			evaluate(input) {
				const exit = evaluateImplementationExit(input.implementation);
				return productionExitResult(
					"production_implementation_exit_parity",
					exit,
				);
			},
		},
		{
			id: "implementation_evidence_specificity",
			mode: "deterministic",
			weight: 50,
			description:
				"Production-ready implementation evidence must use specific check, acceptance, and assessment text instead of shallow assertions.",
			evaluate(input) {
				const failures = input.implementation.changes.flatMap(
					implementationSpecificityFailures,
				);
				return {
					id: "implementation_evidence_specificity",
					mode: "deterministic" as const,
					weight: 50,
					passed: failures.length === 0,
					route: "fail" as const,
					description:
						"Production-ready implementation evidence must use specific check, acceptance, and assessment text instead of shallow assertions.",
					...(failures.length > 0
						? { message: failures.join(" ") }
						: {}),
				};
			},
		},
	];

export const implementationExitCandidate = {
	loop: "implementation",
	metric: "IEC",
	standards: implementationExitStandards,
} satisfies LabCandidateStandards<ImplementationLabInput>;

function implementationSpecificityFailures(
	change: ImplementationExitInput["changes"][number],
): string[] {
	const fields = [
		...change.checkResults.map((result, index) => ({
			label: `checkResults[${index}].summary`,
			value: result.summary || "",
			kind: "summary",
		})),
		...change.acceptanceEvidence.map((value, index) => ({
			label: `acceptanceEvidence[${index}]`,
			value,
			kind: "summary",
		})),
		...change.acceptanceEvidenceItems.map((item, index) => ({
			label: `acceptanceEvidenceItems[${index}].summary`,
			value: item.summary,
			kind: "summary",
		})),
		{
			label: "implementationAssessment.maintainability",
			value: change.implementationAssessment.maintainability,
			kind: "assessment",
		},
		{
			label: "implementationAssessment.simplicity",
			value: change.implementationAssessment.simplicity,
			kind: "assessment",
		},
		{
			label: "implementationAssessment.projectStyle",
			value: change.implementationAssessment.projectStyle,
			kind: "assessment",
		},
		{
			label: "implementationAssessment.errorHandling",
			value: change.implementationAssessment.errorHandling,
			kind: "assessment",
		},
		{
			label: "implementationAssessment.uncertaintyResolution",
			value: change.implementationAssessment.uncertaintyResolution,
			kind: "assessment",
		},
		{
			label: "implementationAssessment.rationale",
			value: change.implementationAssessment.rationale,
			kind: "assessment",
		},
	];
	const weakFields = fields
		.filter((field) => isWeakImplementationText(field.value, field.kind))
		.map((field) => field.label);
	return weakFields.length === 0
		? []
		: [
				`Implementation change ${change.id} has shallow evidence fields: ${weakFields.join(", ")}.`,
			];
}

function isWeakImplementationText(value: string, kind: string): boolean {
	const normalized = value.trim().toLowerCase();
	if (GENERIC_IMPLEMENTATION_TEXT.has(normalized)) return true;
	const words = meaningfulWords(normalized);
	const minimumWords = kind === "summary" ? 5 : 4;
	return words.length < minimumWords || new Set(words).size < 3;
}

function meaningfulWords(value: string): string[] {
	return value
		.split(/[^a-z0-9-]+/)
		.filter((word) => word.length > 2)
		.filter((word) => !GENERIC_IMPLEMENTATION_WORDS.has(word));
}

const GENERIC_IMPLEMENTATION_TEXT = new Set([
	"done",
	"good",
	"ok",
	"passes",
	"ready",
	"tested",
	"works",
]);

const GENERIC_IMPLEMENTATION_WORDS = new Set([
	"and",
	"for",
	"the",
	"this",
	"that",
	"with",
]);

function productionExitResult(id: string, exit: ImplementationExitResult) {
	return {
		id,
		mode: "deterministic" as const,
		weight: 100,
		passed: exit.verdict === "pass",
		route: exit.verdict,
		description: "Production implementation exit parity.",
		...(exit.issues.length > 0
			? { message: exit.issues.map((issue) => issue.message).join(" ") }
			: {}),
	};
}
