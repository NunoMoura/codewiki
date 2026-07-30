import { createHash } from "node:crypto";
import type { Sha256Digest } from "../utils/canonical-json.ts";
import type { Change } from "./types.ts";

export function changeContentDigest(change: Change): Sha256Digest {
	return `sha256:${createHash("sha256")
		.update(stableJson(changeContent(change)))
		.digest("hex")}`;
}

function changeContent(change: Change): Record<string, unknown> {
	return {
		schemaVersion: change.schemaVersion,
		id: change.id,
		revision: change.revision,
		intent: change.intent,
		classification: change.classification,
		impact: change.impact,
		evidence: change.evidence,
		safety: change.safety,
		estimates: change.estimates,
		provenance: {
			origin: change.provenance.origin,
			createdBy: change.provenance.createdBy,
			createdAt: change.provenance.createdAt,
			discoveredWhile: change.provenance.discoveredWhile,
		},
	};
}

export function stableJson(value: unknown): string {
	return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortValue);
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([, entry]) => entry !== undefined)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => [key, sortValue(entry)]),
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
