import {
	assertCandidateContentKeys,
	candidateContentRecord,
	requiredCandidateText,
} from "../verification/admission.ts";

export type DecisionDisposition = "approve" | "reject" | "defer" | "withdraw";

export interface DecisionCandidateProposal {
	disposition: DecisionDisposition;
	rationale: string;
}

const CANDIDATE_FIELDS = ["disposition", "rationale"] as const;
const RUNTIME_FIELDS = [
	"authority",
	"occurredAt",
	"repoRoot",
	"changeId",
	"expectedRevision",
	"expectedChangeDigest",
	"expectedWorkStateDigest",
	"expectedBytes",
	"runtimeJobId",
	"mode",
] as const;
const DISPOSITIONS: DecisionDisposition[] = [
	"approve",
	"reject",
	"defer",
	"withdraw",
];

export function parseDecisionCandidateProposal(
	value: unknown,
): DecisionCandidateProposal {
	const candidate = candidateContentRecord(value, "decision");
	assertCandidateContentKeys(
		"decision",
		candidate,
		CANDIDATE_FIELDS,
		RUNTIME_FIELDS,
	);
	if (!DISPOSITIONS.includes(candidate.disposition as DecisionDisposition)) {
		throw new Error("Runtime decision candidate disposition is invalid.");
	}
	requiredCandidateText(candidate.rationale, "decision", "rationale");
	return candidate as unknown as DecisionCandidateProposal;
}
