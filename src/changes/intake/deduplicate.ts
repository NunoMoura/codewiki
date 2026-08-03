import type {
	AuthorityBinding,
	CanonicalChangeOperation,
} from "../../change-trace/contracts.ts";
import {operationPayload} from "../../change-trace/identity.ts";
import type {
	ChangeWorkState,
	ProjectWorkState,
} from "../../change-trace/state.ts";
import {
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import type {ChangeIntakeMaterial} from "./contracts.ts";

export interface ChangeIntakeFingerprints {
	readonly materialDigest: Sha256Digest;
	readonly requestDigest: Sha256Digest;
	readonly sourceIdentityDigest: Sha256Digest;
	readonly semanticDigest: Sha256Digest;
	readonly materialRef: string;
	readonly requestRef: string;
	readonly sourceIdentityRef: string;
	readonly semanticRef: string;
}

export interface AcceptedChangeIntakeReference {
	readonly change: ChangeWorkState;
	readonly operation: CanonicalChangeOperation<
		"change.proposed" | "change.feedback_recorded"
	>;
}

export function createChangeIntakeFingerprints(
	material: ChangeIntakeMaterial,
	authorityBinding: AuthorityBinding,
): ChangeIntakeFingerprints {
	const materialDigest = canonicalJsonDigest(material);
	const requestDigest = canonicalJsonDigest({material, authorityBinding});
	const sourceIdentityDigest = canonicalJsonDigest({
		materialType: material.materialType,
		binding: material.binding,
		principalRef: authorityBinding.principalRef,
	});
	const semanticDigest = canonicalJsonDigest({
		summary: material.content.summary,
		observedBehavior: material.content.observedBehavior,
		desiredBehavior: material.content.desiredBehavior ?? null,
		affectedRefs: material.content.affectedRefs,
	});
	return Object.freeze({
		materialDigest,
		requestDigest,
		sourceIdentityDigest,
		semanticDigest,
		materialRef: fingerprintRef("material", materialDigest),
		requestRef: fingerprintRef("request", requestDigest),
		sourceIdentityRef: fingerprintRef("source", sourceIdentityDigest),
		semanticRef: fingerprintRef("semantic", semanticDigest),
	});
}

export function changeIntakeProvenanceRefs(
	material: ChangeIntakeMaterial,
	fingerprints: ChangeIntakeFingerprints,
): readonly string[] {
	return Object.freeze(
		[
			...material.content.sourceRefs,
			...material.content.affectedRefs,
			fingerprints.materialRef,
			fingerprints.requestRef,
			fingerprints.sourceIdentityRef,
			fingerprints.semanticRef,
		].filter(unique).sort(compareText),
	);
}

export function findAcceptedChangeIntakeRequest(
	state: ProjectWorkState,
	requestRef: string,
): AcceptedChangeIntakeReference | undefined {
	return findByRef(state, requestRef, false);
}

export function findOpenChangeIntakeSource(
	state: ProjectWorkState,
	sourceIdentityRef: string,
): AcceptedChangeIntakeReference | undefined {
	return findByRef(state, sourceIdentityRef, true);
}

export function findOpenChangeIntakeSemanticMatch(
	state: ProjectWorkState,
	semanticRef: string,
): AcceptedChangeIntakeReference | undefined {
	return findByRef(state, semanticRef, true);
}

function findByRef(
	state: ProjectWorkState,
	ref: string,
	openOnly: boolean,
): AcceptedChangeIntakeReference | undefined {
	for (const change of [...state.changes].sort((left, right) =>
		compareText(left.changeId, right.changeId),
	)) {
		if (openOnly && (change.trace.status !== "open" || change.withdrawn)) continue;
		for (const operation of change.operations) {
			if (!isIntakeOperation(operation) || !operationRefs(operation).includes(ref)) {
				continue;
			}
			return Object.freeze({change, operation});
		}
	}
	return undefined;
}

function isIntakeOperation(
	operation: CanonicalChangeOperation,
): operation is CanonicalChangeOperation<
	"change.proposed" | "change.feedback_recorded"
> {
	return (
		operation.body.kind === "change.proposed" ||
		operation.body.kind === "change.feedback_recorded"
	);
}

function operationRefs(
	operation: CanonicalChangeOperation<
		"change.proposed" | "change.feedback_recorded"
	>,
): readonly string[] {
	if (operation.body.kind === "change.proposed") {
		const payload = operationPayload(operation, "change.proposed");
		return [
			...payload.provenance.refs,
			...payload.revision.content.evidence.sourceRefs,
		];
	}
	return operationPayload(operation, "change.feedback_recorded").provenanceRefs;
}

function fingerprintRef(
	kind: "material" | "request" | "semantic" | "source",
	digest: Sha256Digest,
): string {
	return `trace:intake:${kind}:${digest.slice("sha256:".length)}`;
}

function unique(value: string, index: number, values: readonly string[]): boolean {
	return values.indexOf(value) === index;
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
