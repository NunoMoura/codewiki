export type ProductPublicationTargetKind =
	| "package-registry"
	| "artifact-store"
	| "static-site";

export interface ProductPublicationTarget {
	targetId: string;
	kind: ProductPublicationTargetKind;
	channel: string;
	destinationRef: string;
}

export interface ProductPublicationArtifact {
	artifactId: string;
	path: string;
	digest: string;
	sizeBytes: number;
	mediaType: string;
	version: string;
	sourceCommit: string;
	sourceTree: string;
}

export interface ProductPublicationAuthority {
	kind: "user";
	actor: string;
	ref: string;
	pushEventId: string;
	targetId: string;
	targetChannel: string;
	destinationRef: string;
	artifactId: string;
	artifactDigest: string;
	artifactVersion: string;
	adapterId: string;
	expectedRevision: string | null;
	expectedArtifactDigest: string | null;
}

export interface ProductPublicationPlan {
	pushEventId: string;
	target: ProductPublicationTarget;
	artifact: ProductPublicationArtifact;
	authority: ProductPublicationAuthority;
}

export interface ProductPublicationDestinationObservation {
	revision: string | null;
	artifactDigest: string | null;
	operationId: string | null;
}

export interface ProductPublicationAdapterInput {
	repoRoot: string;
	jobId: string;
	traceId: string;
	workUnitId: string;
	pushEventId: string;
	target: ProductPublicationTarget;
	artifact: ProductPublicationArtifact;
	artifactPath: string;
	expectedDestination: ProductPublicationDestinationObservation;
}

export interface ProductPublicationOperation {
	operationId: string;
	revision: string;
	artifactDigest: string;
}

export interface ProductPublicationAdapter {
	id: string;
	idempotency: "provider-key";
	inspect(
		input: ProductPublicationAdapterInput,
		signal: AbortSignal,
	): Promise<ProductPublicationDestinationObservation>;
	publish(
		input: ProductPublicationAdapterInput,
		signal: AbortSignal,
	): Promise<ProductPublicationOperation>;
}
