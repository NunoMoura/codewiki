import type {EvidenceSubject} from "../../evidence/contracts.ts";
import {toCanonicalJsonValue} from "../../utils/canonical-json.ts";
import type {DecisionCandidate} from "./candidate.ts";

export function decisionEvidenceSubject(input: {
	readonly candidate: DecisionCandidate;
	readonly changeRef: string;
}): EvidenceSubject {
	if (!input.candidate.observedBase.canonicalRefs.includes(input.changeRef)) {
		throw new Error("Decision Evidence changeRef is not bound by Candidate.");
	}
	return toCanonicalJsonValue({
		changeRefs: [input.changeRef],
		changeRevisionDigests: [input.candidate.content.revision.revisionId],
		candidateDigest: input.candidate.digest,
		acceptanceRequirementIds:
			input.candidate.content.revision.acceptanceRequirements.map(
				(requirement) => requirement.id,
			),
	}) as unknown as EvidenceSubject;
}
