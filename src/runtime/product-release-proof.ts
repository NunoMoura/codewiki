import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";

import type { TraceEvent, TraceRecord } from "../traces/types.ts";
import type {
	ProductReleaseAdapter,
	ProductReleaseOperation,
	ProductReleasePlan,
} from "./product-release-contract.ts";
import type { ProductReleaseManifestIdentity } from "./product-release-manifest.ts";

const PRODUCT_RELEASE_SCHEMA_VERSION = 1 as const;
const PRODUCT_RELEASE_EVENT = "runtime.product.released";

export interface ProductReleaseProofInput {
	repoRoot: string;
	plan: ProductReleasePlan;
	publicationEvent: TraceEvent;
	adapter: ProductReleaseAdapter;
	createdAt: string;
}

export interface ProductReleaseReceipt {
	jobId: string;
	traceId: string;
	workItemId: string;
	publicationEventId: string;
	targetId: string;
	channel: string;
	destinationRef: string;
	artifactId: string;
	artifactDigest: string;
	artifactVersion: string;
	previousRevision: string | null;
	previousArtifactDigest: string | null;
	revision: string;
	operationId: string;
	eventId: string;
}

export interface ReleaseIdentity extends ProductReleaseManifestIdentity {
	repoRoot: string;
	traceId: string;
	workItemId: string;
	publicationJobId: string;
	publicationTargetId: string;
	publicationTargetKind: string;
	publicationChannel: string;
	publicationDestinationRef: string;
	publicationRevision: string;
	publicationOperationId: string;
	publicationAdapterId: string;
	publicationAuthorityActor: string;
	publicationAuthorityRef: string;
	commit: string;
	tree: string;
	contentProof: string;
	targetKind: ProductReleasePlan["target"]["kind"];
	artifactId: string;
	artifactVersion: string;
	expectedRevision: string | null;
	expectedArtifactDigest: string | null;
	authorityActor: string;
	authorityRef: string;
}

export function productReleasePublicationEventMatches(
	event: TraceEvent,
	identity: ReleaseIdentity,
): boolean {
	const artifact = objectValue(event.data?.artifact);
	const target = objectValue(event.data?.target);
	const authority = objectValue(event.data?.authority);
	return (
		event.event === "runtime.product.published" &&
		event.traceId === identity.traceId &&
		text(event.data?.runtimeJobId) === identity.publicationJobId &&
		text(event.data?.workItemId) === identity.workItemId &&
		text(target?.targetId) === identity.publicationTargetId &&
		text(target?.kind) === identity.publicationTargetKind &&
		text(target?.channel) === identity.publicationChannel &&
		text(target?.destinationRef) === identity.publicationDestinationRef &&
		text(artifact?.artifactId) === identity.artifactId &&
		text(artifact?.digest) === identity.artifactDigest &&
		text(artifact?.version) === identity.artifactVersion &&
		text(event.data?.revision) === identity.publicationRevision &&
		text(event.data?.operationId) === identity.publicationOperationId &&
		text(event.data?.adapterId) === identity.publicationAdapterId &&
		text(authority?.kind) === "user" &&
		text(authority?.actor) === identity.publicationAuthorityActor &&
		text(authority?.ref) === identity.publicationAuthorityRef &&
		text(event.data?.commit) === identity.commit &&
		text(event.data?.tree) === identity.tree &&
		text(event.data?.contentProof) === identity.contentProof
	);
}

export function productReleaseEventMatches(
	event: TraceEvent,
	identity: ReleaseIdentity,
): boolean {
	const authority = objectValue(event.data?.authority);
	const artifact = objectValue(event.data?.artifact);
	const target = objectValue(event.data?.target);
	return (
		event.parentId === identity.publicationEventId &&
		text(event.data?.runtimeJobId) === identity.jobId &&
		text(event.data?.workItemId) === identity.workItemId &&
		text(event.data?.publicationEventId) === identity.publicationEventId &&
		text(target?.targetId) === identity.targetId &&
		text(target?.kind) === identity.targetKind &&
		text(target?.channel) === identity.channel &&
		text(target?.destinationRef) === identity.destinationRef &&
		text(artifact?.artifactId) === identity.artifactId &&
		text(artifact?.digest) === identity.artifactDigest &&
		text(artifact?.version) === identity.artifactVersion &&
		text(event.data?.adapterId) === identity.adapterId &&
		text(authority?.kind) === "user" &&
		text(authority?.actor) === identity.authorityActor &&
		text(authority?.ref) === identity.authorityRef &&
		typeof event.data?.operationId === "string" &&
		safeProductReleaseRef(event.data.operationId) &&
		typeof event.data?.revision === "string" &&
		safeProductReleaseRef(event.data.revision)
	);
}

export function createProductReleaseEvent(options: {
	input: ProductReleaseProofInput;
	identity: ReleaseIdentity;
	publicationEvent: TraceEvent;
	records: TraceRecord[];
	operation: ProductReleaseOperation;
}): TraceEvent {
	const { input, identity, publicationEvent, records, operation } = options;
	const sequence = nextSequence(records, identity.traceId);
	return {
		type: "trace_event",
		id: `${identity.traceId}:runtime:product-release:${sequence}:${identity.jobId.slice(-16)}`,
		parentId: publicationEvent.id,
		traceId: identity.traceId,
		sequence,
		event: PRODUCT_RELEASE_EVENT,
		refs: unique([
			publicationEvent.id,
			identity.contentProof,
			identity.artifactDigest,
			identity.authorityRef,
			`release-target:${identity.targetId}`,
			`release-operation:${operation.operationId}`,
		]),
		createdAt: input.createdAt,
		data: {
			schemaVersion: PRODUCT_RELEASE_SCHEMA_VERSION,
			runtimeJobId: identity.jobId,
			traceId: identity.traceId,
			workItemId: identity.workItemId,
			publicationEventId: identity.publicationEventId,
			publicationRuntimeJobId: identity.publicationJobId,
			publicationRevision: identity.publicationRevision,
			commit: identity.commit,
			tree: identity.tree,
			contentProof: identity.contentProof,
			targetId: identity.targetId,
			channel: identity.channel,
			target: {
				targetId: identity.targetId,
				kind: identity.targetKind,
				channel: identity.channel,
				destinationRef: identity.destinationRef,
			},
			artifact: {
				artifactId: identity.artifactId,
				digest: identity.artifactDigest,
				version: identity.artifactVersion,
			},
			previousChannel: {
				revision: identity.expectedRevision,
				artifactDigest: identity.expectedArtifactDigest,
			},
			adapterId: identity.adapterId,
			operationId: operation.operationId,
			revision: operation.revision,
			authority: {
				kind: "user",
				actor: identity.authorityActor,
				ref: identity.authorityRef,
			},
			releasedAt: input.createdAt,
		},
	};
}

export function createProductReleaseIdentity(
	input: ProductReleaseProofInput,
): ReleaseIdentity {
	assertReleaseInput(input);
	const data = input.publicationEvent.data || {};
	const publicationTarget = objectValue(data.target) as Record<string, unknown>;
	const artifact = objectValue(data.artifact) as Record<string, unknown>;
	const publicationAuthority = objectValue(data.authority) as Record<
		string,
		unknown
	>;
	const base = {
		repoRoot: realpathSync(input.repoRoot),
		traceId: input.publicationEvent.traceId,
		workItemId: requiredText(data.workItemId),
		publicationEventId: input.publicationEvent.id,
		publicationJobId: requiredText(data.runtimeJobId),
		publicationTargetId: requiredText(publicationTarget.targetId),
		publicationTargetKind: requiredText(publicationTarget.kind),
		publicationChannel: requiredText(publicationTarget.channel),
		publicationDestinationRef: requiredText(publicationTarget.destinationRef),
		publicationRevision: requiredText(data.revision),
		publicationOperationId: requiredText(data.operationId),
		publicationAdapterId: requiredText(data.adapterId),
		publicationAuthorityActor: requiredText(publicationAuthority.actor),
		publicationAuthorityRef: requiredText(publicationAuthority.ref),
		commit: requiredText(data.commit),
		tree: requiredText(data.tree),
		contentProof: requiredText(data.contentProof),
		targetId: input.plan.target.targetId,
		targetKind: input.plan.target.kind,
		channel: input.plan.target.channel,
		destinationRef: input.plan.target.destinationRef,
		artifactId: requiredText(artifact.artifactId),
		artifactDigest: requiredText(artifact.digest),
		artifactVersion: requiredText(artifact.version),
		expectedRevision: input.plan.authority.expectedChannelRevision,
		expectedArtifactDigest:
			input.plan.authority.expectedChannelArtifactDigest,
		authorityActor: input.plan.authority.actor,
		authorityRef: input.plan.authority.ref,
		adapterId: input.adapter.id,
	};
	const digest = createHash("sha256").update(stableJson(base)).digest("hex");
	return { ...base, jobId: `product-release:${digest}` };
}

function assertReleaseInput(input: ProductReleaseProofInput): void {
	const source = assertCanonicalPublicationInput(input);
	assertReleaseAuthority(input, source);
	assertExpectedReleaseChannel(input.plan);
	assertReleaseTarget(input.plan);
	if (
		!safeId(input.adapter.id) ||
		input.adapter.idempotency !== "provider-key"
	) {
		throw new Error("Product release adapter identity is invalid.");
	}
	if (
		!input.createdAt ||
		new Date(input.createdAt).toISOString() !== input.createdAt
	) {
		throw new Error("Product release observation time is invalid.");
	}
}

function assertCanonicalPublicationInput(input: ProductReleaseProofInput): {
	data: Record<string, unknown>;
	artifact: Record<string, unknown>;
	target: Record<string, unknown>;
} {
	const data = input.publicationEvent.data || {};
	const artifact = objectValue(data.artifact);
	const target = objectValue(data.target);
	const authority = objectValue(data.authority);
	if (
		input.publicationEvent.type !== "trace_event" ||
		input.publicationEvent.event !== "runtime.product.published" ||
		!safeId(input.publicationEvent.id) ||
		!safeId(input.publicationEvent.traceId) ||
		!safeId(requiredText(data.runtimeJobId)) ||
		!safeId(requiredText(data.workItemId)) ||
		!gitObjectId(requiredText(data.commit)) ||
		!gitObjectId(requiredText(data.tree)) ||
		!safeProductReleaseRef(requiredText(data.contentProof)) ||
		!safeProductReleaseRef(requiredText(data.revision)) ||
		!safeProductReleaseRef(requiredText(data.operationId)) ||
		!safeId(requiredText(data.adapterId)) ||
		!safeId(requiredText(target?.targetId)) ||
		!(
			target?.kind === "package-registry" ||
			target?.kind === "artifact-store" ||
			target?.kind === "static-site"
		) ||
		!safeId(requiredText(target?.channel)) ||
		!safeProductReleaseRef(requiredText(target?.destinationRef)) ||
		authority?.kind !== "user" ||
		!safeId(requiredText(authority?.actor)) ||
		!safeProductReleaseRef(requiredText(authority?.ref)) ||
		!safeId(requiredText(artifact?.artifactId)) ||
		!isSha256Ref(artifact?.digest) ||
		!safeProductReleaseRef(requiredText(artifact?.version))
	) {
		throw new Error("Product release publication proof is invalid.");
	}
	return { data, artifact, target } as {
		data: Record<string, unknown>;
		artifact: Record<string, unknown>;
		target: Record<string, unknown>;
	};
}

function assertReleaseAuthority(
	input: ProductReleaseProofInput,
	source: {
		data: Record<string, unknown>;
		artifact: Record<string, unknown>;
		target: Record<string, unknown>;
	},
): void {
	const { plan } = input;
	if (
		plan.publicationEventId !== input.publicationEvent.id ||
		plan.authority.kind !== "user" ||
		plan.authority.publicationEventId !== input.publicationEvent.id ||
		plan.authority.publicationTargetId !== source.target.targetId ||
		plan.authority.publicationRevision !== source.data.revision ||
		plan.authority.publicationOperationId !== source.data.operationId ||
		plan.authority.publicationAdapterId !== source.data.adapterId ||
		plan.authority.artifactId !== source.artifact.artifactId ||
		plan.authority.artifactDigest !== source.artifact.digest ||
		plan.authority.artifactVersion !== source.artifact.version ||
		plan.authority.targetId !== plan.target.targetId ||
		plan.authority.targetChannel !== plan.target.channel ||
		plan.authority.destinationRef !== plan.target.destinationRef ||
		plan.authority.adapterId !== input.adapter.id ||
		!safeId(plan.authority.actor) ||
		!safeProductReleaseRef(plan.authority.ref)
	) {
		throw new Error("Product release requires exact user authority.");
	}
}

function assertExpectedReleaseChannel(plan: ProductReleasePlan): void {
	if (
		(plan.authority.expectedChannelRevision === null) !==
			(plan.authority.expectedChannelArtifactDigest === null) ||
		(plan.authority.expectedChannelRevision !== null &&
			!safeProductReleaseRef(plan.authority.expectedChannelRevision)) ||
		(plan.authority.expectedChannelArtifactDigest !== null &&
			!isSha256Ref(plan.authority.expectedChannelArtifactDigest))
	) {
		throw new Error("Product release expected channel is invalid.");
	}
}

function assertReleaseTarget(plan: ProductReleasePlan): void {
	if (
		!safeId(plan.target.targetId) ||
		!(["package-channel", "artifact-channel", "site-channel"] as string[]).includes(
			plan.target.kind,
		) ||
		!safeId(plan.target.channel) ||
		!safeProductReleaseRef(plan.target.destinationRef)
	) {
		throw new Error("Product release target is invalid.");
	}
}

export function productReleaseReceipt(
	identity: ReleaseIdentity,
	event: TraceEvent,
): ProductReleaseReceipt {
	const previous = objectValue(event.data?.previousChannel);
	const revision = requiredText(event.data?.revision);
	const operationId = requiredText(event.data?.operationId);
	if (
		previous?.revision !== identity.expectedRevision ||
		previous?.artifactDigest !== identity.expectedArtifactDigest ||
		!productReleaseEventMatches(event, identity)
	) {
		throw new Error("Canonical product release proof is invalid.");
	}
	return {
		jobId: identity.jobId,
		traceId: identity.traceId,
		workItemId: identity.workItemId,
		publicationEventId: identity.publicationEventId,
		targetId: identity.targetId,
		channel: identity.channel,
		destinationRef: identity.destinationRef,
		artifactId: identity.artifactId,
		artifactDigest: identity.artifactDigest,
		artifactVersion: identity.artifactVersion,
		previousRevision: identity.expectedRevision,
		previousArtifactDigest: identity.expectedArtifactDigest,
		revision,
		operationId,
		eventId: event.id,
	};
}

function nextSequence(records: TraceRecord[], traceId: string): number {
	return (
		Math.max(
			0,
			...records.flatMap((record) =>
				record.type === "trace_event" && record.traceId === traceId
					? [record.sequence]
					: [],
			),
		) + 1
	);
}

function safeId(value: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,255}$/u.test(value);
}

export function safeProductReleaseRef(value: string): boolean {
	return (
		value.length > 0 &&
		value.length <= 512 &&
		/^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/u.test(value) &&
		!value.includes("://")
	);
}

function gitObjectId(value: string): boolean {
	return /^[a-f0-9]{40,64}$/u.test(value);
}

export function isSha256Ref(value: unknown): value is string {
	return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function requiredText(value: unknown): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error("Product release proof field is missing.");
	}
	return value;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}
