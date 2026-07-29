import type { ChangeDisposition } from "./change-quality.ts";
import {
	assertCandidateContentKeys,
	candidateContentRecord,
	requiredCandidateText,
} from "../loop-exit/admission.ts";

export interface DecisionCandidateContent {
	disposition: ChangeDisposition;
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
const DISPOSITIONS: ChangeDisposition[] = [
	"approve",
	"reject",
	"defer",
	"withdraw",
];

export function parseDecisionCandidateContent(
	value: unknown,
): DecisionCandidateContent {
	const candidate = candidateContentRecord(value, "decision");
	assertCandidateContentKeys(
		"decision",
		candidate,
		CANDIDATE_FIELDS,
		RUNTIME_FIELDS,
	);
	if (!DISPOSITIONS.includes(candidate.disposition as ChangeDisposition)) {
		throw new Error("Runtime decision candidate disposition is invalid.");
	}
	requiredCandidateText(candidate.rationale, "decision", "rationale");
	return candidate as unknown as DecisionCandidateContent;
}
