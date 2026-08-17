import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";

import type { TraceEvent, TraceRecord } from "../../changes/trace/types.ts";
import type {
	ProductPublicationAdapter,
	ProductPublicationOperation,
	ProductPublicationPlan,
} from "./product-publication-contract.ts";
import type { ProductPublicationManifestIdentity } from "./product-publication-manifest.ts";

const PRODUCT_PUBLICATION_SCHEMA_VERSION = 1 as const;
const PRODUCT_PUBLICATION_EVENT = "runtime.product.published";

export interface ProductPublicationProofInput {
	repoRoot: string;
	plan: ProductPublicationPlan;
	pushEvent: TraceEvent;
	adapter: ProductPublicationAdapter;
	createdAt: string;
}

export interface ProductPublicationReceipt {
	jobId: string;
	traceId: string;
	workItemId: string;
	pushEventId: string;
	targetId: string;
	channel: string;
	destinationRef: string;
	artifactId: string;
	artifactDigest: string;
	previousRevision: string | null;
	previousArtifactDigest: string | null;
	revision: string;
	operationId: string;
	eventId: string;
}

export interface PublicationIdentity extends ProductPublicationManifestIdentity {
	repoRoot: string;
	traceId: string;
	workItemId: string;
	pushJobId: string;
	commit: string;
	tree: string;
	contentProof: string;
	targetKind: ProductPublicationPlan["target"]["kind"];
	artifactId: string;
	artifactPath: string;
	artifactSizeBytes: number;
	artifactMediaType: string;
	artifactVersion: string;
	expectedRevision: string | null;
	expectedArtifactDigest: string | null;
	authorityActor: string;
	authorityRef: string;
}

export function productPublicationPushEventMatches(
	event: TraceEvent,
	identity: PublicationIdentity,
): boolean {
	return (
		event.event === "runtime.project_branch.pushed" &&
		event.traceId === identity.traceId &&
		text(event.data?.runtimeJobId) === identity.pushJobId &&
		text(event.data?.workItemId) === identity.workItemId &&
		text(event.data?.commit) === identity.commit &&
		text(event.data?.tree) === identity.tree &&
		text(event.data?.contentProof) === identity.contentProof
	);
}

export function productPublicationEventMatches(
	event: TraceEvent,
	identity: PublicationIdentity,
): boolean {
	const authority = objectValue(event.data?.authority);
	const artifact = objectValue(event.data?.artifact);
	const target = objectValue(event.data?.target);
	return (
		event.parentId === identity.pushEventId &&
		text(event.data?.runtimeJobId) === identity.jobId &&
		text(event.data?.workItemId) === identity.workItemId &&
		text(event.data?.pushEventId) === identity.pushEventId &&
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
		safePublicationRef(event.data.operationId) &&
		typeof event.data?.revision === "string" &&
		safePublicationRef(event.data.revision)
	);
}

export function createProductPublicationEvent(options: {
	input: ProductPublicationProofInput;
	identity: PublicationIdentity;
	pushEvent: TraceEvent;
	records: TraceRecord[];
	operation: ProductPublicationOperation;
}): TraceEvent {
	const { input, identity, pushEvent, records, operation } = options;
	const sequence = nextSequence(records, identity.traceId);
	return {
		type: "trace_event",
		id: `${identity.traceId}:runtime:product-publication:${sequence}:${identity.jobId.slice(-16)}`,
		parentId: pushEvent.id,
		traceId: identity.traceId,
		sequence,
		event: PRODUCT_PUBLICATION_EVENT,
		refs: unique([
			pushEvent.id,
			identity.contentProof,
			identity.artifactDigest,
			identity.authorityRef,
			`publication-target:${identity.targetId}`,
			`publication-operation:${operation.operationId}`,
		]),
		createdAt: input.createdAt,
		data: {
			schemaVersion: PRODUCT_PUBLICATION_SCHEMA_VERSION,
			runtimeJobId: identity.jobId,
			traceId: identity.traceId,
			workItemId: identity.workItemId,
			pushEventId: identity.pushEventId,
			pushProjectServerJobId: identity.pushJobId,
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
				sizeBytes: identity.artifactSizeBytes,
				mediaType: identity.artifactMediaType,
				version: identity.artifactVersion,
			},
			previousDestination: {
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
			publishedAt: input.createdAt,
		},
	};
}

export function createProductPublicationIdentity(
	input: ProductPublicationProofInput,
): PublicationIdentity {
	assertPublicationInput(input);
	const data = input.pushEvent.data || {};
	const base = {
		repoRoot: realpathSync(input.repoRoot),
		traceId: input.pushEvent.traceId,
		workItemId: requiredText(data.workItemId),
		pushEventId: input.pushEvent.id,
		pushJobId: requiredText(data.runtimeJobId),
		commit: requiredText(data.commit),
		tree: requiredText(data.tree),
		contentProof: requiredText(data.contentProof),
		targetId: input.plan.target.targetId,
		targetKind: input.plan.target.kind,
		channel: input.plan.target.channel,
		destinationRef: input.plan.target.destinationRef,
		artifactId: input.plan.artifact.artifactId,
		artifactPath: input.plan.artifact.path,
		artifactDigest: input.plan.artifact.digest,
		artifactSizeBytes: input.plan.artifact.sizeBytes,
		artifactMediaType: input.plan.artifact.mediaType,
		artifactVersion: input.plan.artifact.version,
		expectedRevision: input.plan.authority.expectedRevision,
		expectedArtifactDigest: input.plan.authority.expectedArtifactDigest,
		authorityActor: input.plan.authority.actor,
		authorityRef: input.plan.authority.ref,
		adapterId: input.adapter.id,
	};
	const digest = createHash("sha256").update(stableJson(base)).digest("hex");
	return { ...base, jobId: `product-publication:${digest}` };
}

function assertPublicationInput(input: ProductPublicationProofInput): void {
	const { plan } = input;
	const pushData = input.pushEvent.data || {};
	if (
		input.pushEvent.type !== "trace_event" ||
		input.pushEvent.event !== "runtime.project_branch.pushed" ||
		!safeId(input.pushEvent.id) ||
		!safeId(input.pushEvent.traceId) ||
		!safeId(requiredText(pushData.runtimeJobId)) ||
		!safeId(requiredText(pushData.workItemId)) ||
		!gitObjectId(requiredText(pushData.commit)) ||
		!gitObjectId(requiredText(pushData.tree)) ||
		!safePublicationRef(requiredText(pushData.contentProof))
	) {
		throw new Error("Product publication push proof is invalid.");
	}
	if (
		plan.pushEventId !== input.pushEvent.id ||
		plan.authority.kind !== "user" ||
		plan.authority.pushEventId !== input.pushEvent.id ||
		plan.authority.targetId !== plan.target.targetId ||
		plan.authority.targetChannel !== plan.target.channel ||
		plan.authority.destinationRef !== plan.target.destinationRef ||
		plan.authority.artifactId !== plan.artifact.artifactId ||
		plan.authority.artifactDigest !== plan.artifact.digest ||
		plan.authority.artifactVersion !== plan.artifact.version ||
		plan.authority.adapterId !== input.adapter.id ||
		!safeId(plan.authority.actor) ||
		!safePublicationRef(plan.authority.ref)
	) {
		throw new Error("Product publication requires exact user authority.");
	}
	if (
		(plan.authority.expectedRevision === null) !==
		(plan.authority.expectedArtifactDigest === null) ||
		(plan.authority.expectedRevision !== null &&
			!safePublicationRef(plan.authority.expectedRevision)) ||
		(plan.authority.expectedArtifactDigest !== null &&
			!isSha256Ref(plan.authority.expectedArtifactDigest))
	) {
		throw new Error("Product publication expected destination is invalid.");
	}
	if (
		!safeId(plan.target.targetId) ||
		!(["package-registry", "artifact-store", "static-site"] as string[]).includes(
			plan.target.kind,
		) ||
		!safeId(plan.target.channel) ||
		!safePublicationRef(plan.target.destinationRef)
	) {
		throw new Error("Product publication target is invalid.");
	}
	if (
		plan.artifact.sourceCommit !== pushData.commit ||
		plan.artifact.sourceTree !== pushData.tree
	) {
		throw new Error("Product publication artifact source differs from push proof.");
	}
	if (
		!safeId(input.adapter.id) ||
		input.adapter.idempotency !== "provider-key"
	) {
		throw new Error("Product publication adapter identity is invalid.");
	}
	if (
		!input.createdAt ||
		new Date(input.createdAt).toISOString() !== input.createdAt
	) {
		throw new Error("Product publication observation time is invalid.");
	}
}

export function productPublicationReceipt(
	identity: PublicationIdentity,
	event: TraceEvent,
): ProductPublicationReceipt {
	const previous = objectValue(event.data?.previousDestination);
	const revision = requiredText(event.data?.revision);
	const operationId = requiredText(event.data?.operationId);
	if (
		previous?.revision !== identity.expectedRevision ||
		previous?.artifactDigest !== identity.expectedArtifactDigest ||
		!productPublicationEventMatches(event, identity)
	) {
		throw new Error("Canonical product publication proof is invalid.");
	}
	return {
		jobId: identity.jobId,
		traceId: identity.traceId,
		workItemId: identity.workItemId,
		pushEventId: identity.pushEventId,
		targetId: identity.targetId,
		channel: identity.channel,
		destinationRef: identity.destinationRef,
		artifactId: identity.artifactId,
		artifactDigest: identity.artifactDigest,
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

export function safePublicationRef(value: string): boolean {
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
		throw new Error("Product publication proof field is missing.");
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
