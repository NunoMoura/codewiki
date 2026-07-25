export type ProductReleaseTargetKind =
	| "package-channel"
	| "artifact-channel"
	| "site-channel";

export interface ProductReleaseTarget {
	targetId: string;
	kind: ProductReleaseTargetKind;
	channel: string;
	destinationRef: string;
}

export interface ProductReleaseAuthority {
	kind: "user";
	actor: string;
	ref: string;
	publicationEventId: string;
	publicationTargetId: string;
	publicationRevision: string;
	publicationOperationId: string;
	publicationAdapterId: string;
	artifactId: string;
	artifactDigest: string;
	artifactVersion: string;
	targetId: string;
	targetChannel: string;
	destinationRef: string;
	adapterId: string;
	expectedChannelRevision: string | null;
	expectedChannelArtifactDigest: string | null;
}

export interface ProductReleasePlan {
	publicationEventId: string;
	target: ProductReleaseTarget;
	authority: ProductReleaseAuthority;
}

export interface PublishedArtifactObservation {
	revision: string;
	artifactDigest: string;
	operationId: string;
}

export interface ProductReleaseChannelObservation {
	revision: string | null;
	artifactDigest: string | null;
	operationId: string | null;
}

export interface ProductReleaseAdapterInput {
	repoRoot: string;
	jobId: string;
	traceId: string;
	workItemId: string;
	publicationEventId: string;
	publicationTargetId: string;
	publicationRevision: string;
	publicationOperationId: string;
	publicationAdapterId: string;
	artifactId: string;
	artifactDigest: string;
	artifactVersion: string;
	target: ProductReleaseTarget;
	expectedChannel: ProductReleaseChannelObservation;
}

export interface ProductReleaseOperation {
	operationId: string;
	revision: string;
	artifactDigest: string;
}

export interface ProductReleaseAdapter {
	id: string;
	idempotency: "provider-key";
	inspectPublishedArtifact(
		input: ProductReleaseAdapterInput,
		signal: AbortSignal,
	): Promise<PublishedArtifactObservation>;
	inspectReleaseChannel(
		input: ProductReleaseAdapterInput,
		signal: AbortSignal,
	): Promise<ProductReleaseChannelObservation>;
	release(
		input: ProductReleaseAdapterInput,
		signal: AbortSignal,
	): Promise<ProductReleaseOperation>;
}
