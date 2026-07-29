import type { ImplementationEvidenceSubmission } from "../api/wiki-implement.ts";
import {
	assertCandidateContentKeys,
	candidateContentRecord,
} from "../loop-exit/admission.ts";
import type { ImplementationArchiveDisposition } from "./types.ts";

export interface ImplementationCandidateContent {
	evidence?: ImplementationEvidenceSubmission[];
	archiveDisposition?: ImplementationArchiveDisposition;
}

const CANDIDATE_FIELDS = ["evidence", "archiveDisposition"] as const;
const RUNTIME_FIELDS = [
	"reviewEvidenceReports",
	"requireArchiveDisposition",
	"evidencePolicy",
	"includeCachedReviewEvidence",
	"autoReviewEvidence",
	"reviewTimeoutMs",
	"requireTddEvidence",
	"createdAt",
	"snapshotRoots",
	"snapshotExclude",
	"proofPaths",
	"changedPaths",
	"evidencePaths",
	"aggregateContentProof",
	"repoRoot",
	"expectedWorkStateDigest",
	"workerReports",
	"runtimeJobId",
	"traceId",
	"planningEvents",
	"changes",
	"changeInputs",
	"workerClaims",
	"claimEvents",
	"componentMap",
	"parentId",
	"expectedBytes",
	"nextSequence",
	"expectedTraceId",
	"mode",
] as const;

export function parseImplementationCandidateContent(
	value: unknown,
): ImplementationCandidateContent {
	const candidate = candidateContentRecord(value, "implementation");
	assertCandidateContentKeys(
		"implementation",
		candidate,
		CANDIDATE_FIELDS,
		RUNTIME_FIELDS,
	);
	if (candidate.evidence !== undefined && !Array.isArray(candidate.evidence)) {
		throw new Error("Runtime implementation candidate evidence must be an array.");
	}
	return candidate as unknown as ImplementationCandidateContent;
}
