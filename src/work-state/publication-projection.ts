import type { TraceEvent } from "../changes/trace/types.ts";
import type {
	WorkStatePublicationProof,
	WorkStateWorkUnit,
} from "./types.ts";

export function projectProductPublications(
	events: TraceEvent[],
	workUnitMap: Map<string, WorkStateWorkUnit>,
): void {
	for (const event of events.filter(
		(candidate) => candidate.event === "runtime.product.published",
	)) {
		const proof = publicationProof(event);
		const item = proof ? workUnitMap.get(proof.workUnitId) : undefined;
		if (!proof || !item) continue;
		const { workUnitId: _, ...projected } = proof;
		item.publicationProofs = [
			...(item.publicationProofs || []).filter(
				(candidate) => candidate.eventId !== event.id,
			),
			projected,
		].sort((left, right) => left.eventId.localeCompare(right.eventId));
	}
}

function publicationProof(
	event: TraceEvent,
): (WorkStatePublicationProof & { workUnitId: string }) | undefined {
	const target = objectValue(event.data?.target);
	const artifact = objectValue(event.data?.artifact);
	const previous = objectValue(event.data?.previousDestination);
	const authority = objectValue(event.data?.authority);
	const targetKind = publicationTargetKind(target?.kind);
	const proof = {
		workUnitId: text(event.data?.workUnitId),
		jobId: text(event.data?.runtimeJobId),
		pushEventId: text(event.data?.pushEventId),
		targetId: text(target?.targetId),
		targetKind,
		channel: text(target?.channel),
		destinationRef: text(target?.destinationRef),
		artifactId: text(artifact?.artifactId),
		artifactDigest: text(artifact?.digest),
		artifactVersion: text(artifact?.version),
		previousRevision: nullableText(previous?.revision),
		previousArtifactDigest: nullableText(previous?.artifactDigest),
		revision: text(event.data?.revision),
		operationId: text(event.data?.operationId),
		adapterId: text(event.data?.adapterId),
		authorityKind: text(authority?.kind),
		authorityActor: text(authority?.actor),
		authorityRef: text(authority?.ref),
	};
	if (
		!proof.workUnitId ||
		!proof.jobId ||
		!proof.pushEventId ||
		!proof.targetId ||
		!proof.targetKind ||
		!proof.channel ||
		!proof.destinationRef ||
		!proof.artifactId ||
		!proof.artifactDigest ||
		!proof.artifactVersion ||
		proof.previousRevision === undefined ||
		proof.previousArtifactDigest === undefined ||
		!proof.revision ||
		!proof.operationId ||
		!proof.adapterId ||
		proof.authorityKind !== "user" ||
		!proof.authorityActor ||
		!proof.authorityRef
	) {
		return undefined;
	}
	return {
		eventId: event.id,
		jobId: proof.jobId,
		pushEventId: proof.pushEventId,
		targetId: proof.targetId,
		targetKind: proof.targetKind,
		channel: proof.channel,
		destinationRef: proof.destinationRef,
		artifactId: proof.artifactId,
		artifactDigest: proof.artifactDigest,
		artifactVersion: proof.artifactVersion,
		previousRevision: proof.previousRevision,
		previousArtifactDigest: proof.previousArtifactDigest,
		revision: proof.revision,
		operationId: proof.operationId,
		adapterId: proof.adapterId,
		authorityActor: proof.authorityActor,
		authorityRef: proof.authorityRef,
		publishedAt: event.createdAt,
		workUnitId: proof.workUnitId,
	};
}

function publicationTargetKind(
	value: unknown,
): WorkStatePublicationProof["targetKind"] | undefined {
	return value === "package-registry" ||
		value === "artifact-store" ||
		value === "static-site"
		? value
		: undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function nullableText(value: unknown): string | null | undefined {
	if (value === null) return null;
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}
