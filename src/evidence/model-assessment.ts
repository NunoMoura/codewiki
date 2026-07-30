import type {EvidenceMeasurement} from "./contracts.ts";
import type {Sha256Digest} from "../utils/canonical-json.ts";

export function modelConclusionEvidenceMeasurement(
	conclusion: "supported" | "unsupported" | "uncertain",
	vocabularyDigest: Sha256Digest,
): EvidenceMeasurement {
	if (conclusion === "supported") return {kind: "boolean", value: true};
	if (conclusion === "unsupported") return {kind: "boolean", value: false};
	return {
		kind: "label",
		value: "uncertain",
		vocabularyDigest,
	};
}
