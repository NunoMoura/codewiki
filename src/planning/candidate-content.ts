import {
	assertCandidateContentKeys,
	candidateContentRecord,
	requiredCandidateText,
} from "../loop-exit/admission.ts";
import type {
	PortfolioWorkItemInput,
	SprintPlanInput,
} from "./portfolio-quality.ts";

export interface PlanningCandidateContent {
	sprints: SprintPlanInput[];
	workItems: PortfolioWorkItemInput[];
	rationale: string;
}

const CANDIDATE_FIELDS = ["sprints", "workItems", "rationale"] as const;
const RUNTIME_FIELDS = [
	"actor",
	"createdAt",
	"repoRoot",
	"expectedWorkStateDigest",
	"expectedChangeIds",
	"expectedBytesByChangeId",
	"runtimeJobId",
	"mode",
] as const;

export function parsePlanningCandidateContent(
	value: unknown,
): PlanningCandidateContent {
	const candidate = candidateContentRecord(value, "planning");
	assertCandidateContentKeys(
		"planning",
		candidate,
		CANDIDATE_FIELDS,
		RUNTIME_FIELDS,
	);
	if (!Array.isArray(candidate.sprints)) {
		throw new Error("Runtime planning candidate sprints must be an array.");
	}
	if (!Array.isArray(candidate.workItems)) {
		throw new Error("Runtime planning candidate workItems must be an array.");
	}
	requiredCandidateText(candidate.rationale, "planning", "rationale");
	return candidate as unknown as PlanningCandidateContent;
}
