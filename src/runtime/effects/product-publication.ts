import type { TraceEvent, TraceRecord } from "../../traces/types.ts";
import { verifyProductPublicationArtifact } from "./product-publication-artifact.ts";
import type {
	ProductPublicationAdapter,
	ProductPublicationAdapterInput,
	ProductPublicationDestinationObservation,
	ProductPublicationOperation,
	ProductPublicationPlan,
} from "./product-publication-contract.ts";
import {
	readProductPublicationManifest,
	removeProductPublicationManifest,
	writeProductPublicationManifest,
} from "./product-publication-manifest.ts";
import {
	createProductPublicationEvent,
	createProductPublicationIdentity,
	isSha256Ref,
	productPublicationEventMatches,
	productPublicationPushEventMatches,
	productPublicationReceipt,
	safePublicationRef,
	type ProductPublicationReceipt,
	type PublicationIdentity,
} from "./product-publication-proof.ts";
export type { ProductPublicationReceipt } from "./product-publication-proof.ts";
import type {
	ProjectCoordinator,
	ProjectCoordinatorJob,
} from "../coordinator/project.ts";
import type { RuntimeReactor } from "../coordinator/reactor.ts";
import { appendRuntimeTraceRecord } from "../persistence/trace.ts";

const PRODUCT_PUBLICATION_EVENT = "runtime.product.published";

export interface ProductPublicationInput {
	repoRoot: string;
	coordinator: ProjectCoordinator;
	reactor: RuntimeReactor;
	plan: ProductPublicationPlan;
	pushEvent: TraceEvent;
	adapter: ProductPublicationAdapter;
	createdAt: string;
	beforeAppend?: () => void | Promise<void>;
}

interface CanonicalPublicationObservation {
	records: TraceRecord[];
	expectedBytes: number;
	pushEvent: TraceEvent;
	publicationEvent?: TraceEvent;
}

export function scheduleProductPublication(
	input: ProductPublicationInput,
): Promise<ProductPublicationReceipt> {
	return input.coordinator.schedule(productPublicationJob(input));
}

export function productPublicationJob(
	input: Omit<ProductPublicationInput, "coordinator">,
): ProjectCoordinatorJob<ProductPublicationReceipt> {
	const jobInput = immutablePublicationInput(input);
	const identity = createProductPublicationIdentity(jobInput);
	return {
		idempotencyKey: identity.jobId,
		lane: {
			kind: "effect",
			targetRef: `publication:${identity.targetId}:${identity.channel}`,
		},
		conflictRefs: [
			`trace:${identity.traceId}`,
			`work-item:${identity.workItemId}`,
			`publication:${identity.targetId}:${identity.channel}`,
			`publication-destination:${identity.destinationRef}`,
		],
		effect: "write",
		async recover() {
			const observation = await observeCanonicalPublication(jobInput, identity);
			if (!observation.publicationEvent) return undefined;
			await removeProductPublicationManifest(jobInput.repoRoot, identity);
			return {
				status: "completed",
				result: productPublicationReceipt(identity, observation.publicationEvent),
			};
		},
		async run(signal) {
			signal.throwIfAborted();
			let canonical = await observeCanonicalPublication(jobInput, identity);
			if (canonical.publicationEvent) {
				await removeProductPublicationManifest(jobInput.repoRoot, identity);
				return productPublicationReceipt(identity, canonical.publicationEvent);
			}
			let adapterInput = await verifiedAdapterInput(jobInput, identity, signal);
			await jobInput.beforeAppend?.();
			canonical = await observeCanonicalPublication(jobInput, identity);
			if (canonical.publicationEvent) {
				return productPublicationReceipt(identity, canonical.publicationEvent);
			}
			adapterInput = await verifiedAdapterInput(jobInput, identity, signal);
			const before = await inspectDestination(jobInput.adapter, adapterInput, signal);
			const manifest = await readProductPublicationManifest(
				jobInput.repoRoot,
				identity,
			);
			let operation: ProductPublicationOperation;
			if (before.artifactDigest === identity.artifactDigest) {
				operation = recoveredOperation(identity, before, manifest);
			} else {
				assertExpectedDestination(identity, before);
				if (manifest?.phase === "published") {
					throw new Error(
						"Product publication destination moved after a completed publication attempt.",
					);
				}
				if (!manifest) {
					await writeProductPublicationManifest(
						jobInput.repoRoot,
						identity,
						"prepared",
					);
				}
				operation = await publishArtifact(jobInput.adapter, adapterInput, signal);
				assertOperation(identity, operation);
				await writeProductPublicationManifest(
					jobInput.repoRoot,
					identity,
					"published",
					operation,
				);
			}
			signal.throwIfAborted();
			await jobInput.beforeAppend?.();
			canonical = await observeCanonicalPublication(jobInput, identity);
			if (canonical.publicationEvent) {
				return productPublicationReceipt(identity, canonical.publicationEvent);
			}
			adapterInput = await verifiedAdapterInput(jobInput, identity, signal);
			const after = await inspectDestination(jobInput.adapter, adapterInput, signal);
			assertPublishedDestination(identity, operation, after);
			const settledManifest = await readProductPublicationManifest(
				jobInput.repoRoot,
				identity,
			);
			if (
				settledManifest?.phase !== "published" ||
				settledManifest.operationId !== operation.operationId ||
				settledManifest.revision !== operation.revision
			) {
				throw new Error("Product publication recovery evidence is incomplete.");
			}
			await jobInput.beforeAppend?.();
			const event = createProductPublicationEvent({
				input: jobInput,
				identity,
				pushEvent: canonical.pushEvent,
				records: canonical.records,
				operation,
			});
			await appendRuntimeTraceRecord(
				jobInput.repoRoot,
				event,
				canonical.expectedBytes,
			);
			jobInput.reactor.invalidate(identity.traceId);
			await removeProductPublicationManifest(jobInput.repoRoot, identity);
			return productPublicationReceipt(identity, event);
		},
	};
}

function immutablePublicationInput(
	input: Omit<ProductPublicationInput, "coordinator">,
): Omit<ProductPublicationInput, "coordinator"> {
	return {
		...input,
		plan: {
			pushEventId: input.plan.pushEventId,
			target: { ...input.plan.target },
			artifact: { ...input.plan.artifact },
			authority: { ...input.plan.authority },
		},
		pushEvent: {
			...input.pushEvent,
			refs: [...input.pushEvent.refs],
			data: input.pushEvent.data
				? structuredClone(input.pushEvent.data)
				: undefined,
		},
	};
}

async function verifiedAdapterInput(
	input: Omit<ProductPublicationInput, "coordinator">,
	identity: PublicationIdentity,
	signal: AbortSignal,
): Promise<ProductPublicationAdapterInput> {
	const artifact = { ...input.plan.artifact };
	const artifactPath = await verifyProductPublicationArtifact(
		identity.repoRoot,
		artifact,
		signal,
	);
	return {
		repoRoot: identity.repoRoot,
		jobId: identity.jobId,
		traceId: identity.traceId,
		workItemId: identity.workItemId,
		pushEventId: identity.pushEventId,
		target: { ...input.plan.target },
		artifact,
		artifactPath,
		expectedDestination: {
			revision: identity.expectedRevision,
			artifactDigest: identity.expectedArtifactDigest,
			operationId: null,
		},
	};
}

async function inspectDestination(
	adapter: ProductPublicationAdapter,
	input: ProductPublicationAdapterInput,
	signal: AbortSignal,
): Promise<ProductPublicationDestinationObservation> {
	let observation: ProductPublicationDestinationObservation;
	try {
		observation = await adapter.inspect(input, signal);
	} catch {
		throw new Error("Product publication destination inspection failed.");
	}
	assertDestinationObservation(observation);
	return observation;
}

async function publishArtifact(
	adapter: ProductPublicationAdapter,
	input: ProductPublicationAdapterInput,
	signal: AbortSignal,
): Promise<ProductPublicationOperation> {
	try {
		return await adapter.publish(input, signal);
	} catch {
		throw new Error("Product publication adapter failed.");
	}
}

function recoveredOperation(
	identity: PublicationIdentity,
	observation: ProductPublicationDestinationObservation,
	manifest: Awaited<ReturnType<typeof readProductPublicationManifest>>,
): ProductPublicationOperation {
	if (
		manifest?.phase !== "published" ||
		!observation.operationId ||
		typeof manifest.revision !== "string" ||
		!safePublicationRef(manifest.revision) ||
		manifest.operationId !== observation.operationId ||
		manifest.revision !== observation.revision
	) {
		throw new Error(
			"Product publication destination already matches artifact without exact publication recovery evidence.",
		);
	}
	const operation = {
		operationId: manifest.operationId,
		revision: manifest.revision,
		artifactDigest: identity.artifactDigest,
	};
	assertOperation(identity, operation);
	return operation;
}

function assertExpectedDestination(
	identity: PublicationIdentity,
	observation: ProductPublicationDestinationObservation,
): void {
	if (
		observation.revision !== identity.expectedRevision ||
		observation.artifactDigest !== identity.expectedArtifactDigest
	) {
		throw new Error(
			"Product publication destination moved after authority was issued.",
		);
	}
}

function assertPublishedDestination(
	identity: PublicationIdentity,
	operation: ProductPublicationOperation,
	observation: ProductPublicationDestinationObservation,
): void {
	if (
		observation.revision !== operation.revision ||
		observation.artifactDigest !== identity.artifactDigest ||
		observation.operationId !== operation.operationId
	) {
		throw new Error(
			"Product publication destination does not match operation proof.",
		);
	}
}

function assertDestinationObservation(
	observation: ProductPublicationDestinationObservation,
): void {
	if (!observation || typeof observation !== "object") {
		throw new Error("Product publication destination observation is invalid.");
	}
	const absent =
		observation.revision === null &&
		observation.artifactDigest === null &&
		observation.operationId === null;
	const present =
		typeof observation.revision === "string" &&
		safePublicationRef(observation.revision) &&
		isSha256Ref(observation.artifactDigest) &&
		(observation.operationId === null ||
			(typeof observation.operationId === "string" &&
				safePublicationRef(observation.operationId)));
	if (!absent && !present) {
		throw new Error("Product publication destination observation is invalid.");
	}
}

function assertOperation(
	identity: PublicationIdentity,
	operation: ProductPublicationOperation,
): void {
	if (
		!operation ||
		typeof operation !== "object" ||
		!safePublicationRef(operation.operationId) ||
		!safePublicationRef(operation.revision) ||
		operation.artifactDigest !== identity.artifactDigest
	) {
		throw new Error("Product publication adapter operation is invalid.");
	}
}

async function observeCanonicalPublication(
	input: Omit<ProductPublicationInput, "coordinator">,
	identity: PublicationIdentity,
): Promise<CanonicalPublicationObservation> {
	const observation = await input.reactor.observe({
		kind: "project_truth_changed",
		occurredAt: input.createdAt,
		refs: [identity.traceId],
	});
	const pushEvent = observation.records.find(
		(record): record is TraceEvent =>
			record.type === "trace_event" && record.id === identity.pushEventId,
	);
	if (!pushEvent || !productPublicationPushEventMatches(pushEvent, identity)) {
		throw new Error("Product publication requires exact canonical push proof.");
	}
	const candidates = observation.records.filter(
		(record): record is TraceEvent =>
			record.type === "trace_event" &&
			record.event === PRODUCT_PUBLICATION_EVENT &&
			text(record.data?.pushEventId) === identity.pushEventId &&
			text(record.data?.targetId) === identity.targetId &&
			text(record.data?.channel) === identity.channel,
	);
	const publicationEvent = candidates.find(
		(event) => text(event.data?.runtimeJobId) === identity.jobId,
	);
	if (candidates.length > 0 && !publicationEvent) {
		throw new Error(
			"Product publication target already has different canonical proof.",
		);
	}
	if (publicationEvent && !productPublicationEventMatches(publicationEvent, identity)) {
		throw new Error("Canonical product publication proof is invalid.");
	}
	return {
		records: observation.records,
		expectedBytes: observation.expectedBytesByTrace[identity.traceId] || 0,
		pushEvent,
		publicationEvent,
	};
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}
