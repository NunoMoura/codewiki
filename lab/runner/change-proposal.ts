import type { ChangeFeedbackInput } from "../../src/changes/intake.ts";
import type { LabLoop } from "./types.ts";

export interface LabChangeFeedbackInput {
	candidateId: string;
	loop: LabLoop;
	summary: string;
	currentState: string;
	desiredState: string;
	rationale: string;
	targetRefs: string[];
	evidenceRefs: string[];
}

export function createLabChangeFeedback(
	input: LabChangeFeedbackInput,
): ChangeFeedbackInput {
	return {
		source: "lab",
		sourceId: input.candidateId,
		summary: input.summary,
		question: `Should reviewed lab finding ${input.candidateId} change production behavior?`,
		currentState: input.currentState,
		desiredState: input.desiredState,
		rationale: input.rationale,
		nonGoals: [
			"Do not merge, publish, advance controllers, or grant unattended authority.",
		],
		kind: "improve",
		type: "behavior_change",
		scope: "system",
		affectedLayers: ["lab", input.loop],
		targetRefs: input.targetRefs,
		sourceRefs: input.evidenceRefs,
		proofRefs: input.evidenceRefs,
		userImpact: "Reviewed quality behavior may become more reliable.",
		maintainerImpact: "Maintainers receive bounded candidate evidence for review.",
		risk: "medium",
		failureModes: ["Candidate evidence may not generalize beyond measured cases."],
		successSignal: "Independent confirmation proves the reviewed behavior improvement.",
		regressionPlan: "Run train, validation, confirmation, and sealed quality gates.",
		effort: "medium",
		workScale: "small",
	};
}
