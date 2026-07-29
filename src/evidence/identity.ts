import { EVIDENCE_KINDS } from "./contracts.ts";
import type { EvidenceId, EvidenceKind } from "./contracts.ts";
import { assertSha256Digest } from "../utils/canonical-json.ts";
import type { Sha256Digest } from "../utils/canonical-json.ts";

export function createEvidenceId<TKind extends EvidenceKind>(
	kind: TKind,
	digest: Sha256Digest,
): EvidenceId<TKind> {
	assertEvidenceKind(kind);
	assertSha256Digest(digest, "Evidence digest");
	return `evidence:${kind}:${digest.slice("sha256:".length)}`;
}

export function evidenceDigestFromId(
	value: unknown,
	expectedKind?: EvidenceKind,
): Sha256Digest {
	if (typeof value !== "string") {
		throw new Error("Evidence id must be content-addressed text.");
	}
	const match = /^evidence:([a-z_]+):([0-9a-f]{64})$/.exec(value);
	if (!match) {
		throw new Error("Evidence id must be content-addressed text.");
	}
	const kind = assertEvidenceKind(match[1]);
	const expected =
		expectedKind === undefined ? undefined : assertEvidenceKind(expectedKind);
	if (expected !== undefined && kind !== expected) {
		throw new Error(
			`Evidence id kind ${kind} does not match record kind ${expected}.`,
		);
	}
	return `sha256:${match[2]}`;
}

function assertEvidenceKind(value: unknown): EvidenceKind {
	if (
		typeof value !== "string" ||
		!EVIDENCE_KINDS.includes(value as EvidenceKind)
	) {
		throw new Error(`Evidence kind ${String(value)} is invalid.`);
	}
	return value as EvidenceKind;
}
