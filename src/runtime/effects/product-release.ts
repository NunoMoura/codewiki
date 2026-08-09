import type { TraceEvent, TraceRecord } from "../../traces/types.ts";
import type {
	ProductReleaseAdapter,
	ProductReleaseAdapterInput,
	ProductReleaseChannelObservation,
	ProductReleaseOperation,
	ProductReleasePlan,
	PublishedArtifactObservation,
} from "./product-release-contract.ts";
import {
	readProductReleaseManifest,
	removeProductReleaseManifest,
	writeProductReleaseManifest,
} from "./product-release-manifest.ts";
import {
	createProductReleaseEvent,
	createProductReleaseIdentity,
	isSha256Ref,
	productReleaseEventMatches,
	productReleasePublicationEventMatches,
	productReleaseReceipt,
	safeProductReleaseRef,
	type ProductReleaseReceipt,
	type ReleaseIdentity,
} from "./product-release-proof.ts";
export type { ProductReleaseReceipt } from "./product-release-proof.ts";
import type {
	ProjectCoordinator,
	ProjectCoordinatorJob,
} from "../coordinator/project.ts";
import type { RuntimeReactor } from "../coordinator/reactor.ts";
import { appendRuntimeTraceRecord } from "../trace-writer.ts";

const PRODUCT_RELEASE_EVENT = "runtime.product.released";

export interface ProductReleaseInput {
	repoRoot: string;
	coordinator: ProjectCoordinator;
	reactor: RuntimeReactor;
	plan: ProductReleasePlan;
	publicationEvent: TraceEvent;
	adapter: ProductReleaseAdapter;
	createdAt: string;
	beforeAppend?: () => void | Promise<void>;
}

interface CanonicalReleaseObservation {
	records: TraceRecord[];
	expectedBytes: number;
	publicationEvent: TraceEvent;
	releaseEvent?: TraceEvent;
}

export function scheduleProductRelease(
	input: ProductReleaseInput,
): Promise<ProductReleaseReceipt> {
	return input.coordinator.schedule(productReleaseJob(input));
}

export function productReleaseJob(
	input: Omit<ProductReleaseInput, "coordinator">,
): ProjectCoordinatorJob<ProductReleaseReceipt> {
	const jobInput = immutableReleaseInput(input);
	const identity = createProductReleaseIdentity(jobInput);
	return {
		idempotencyKey: identity.jobId,
		lane: {
			kind: "effect",
			targetRef: `release:${identity.targetId}:${identity.channel}`,
		},
		conflictRefs: [
			`trace:${identity.traceId}`,
			`work-item:${identity.workItemId}`,
			`publication:${identity.publicationTargetId}:${identity.publicationChannel}`,
			`release:${identity.targetId}:${identity.channel}`,
			`release-destination:${identity.destinationRef}`,
		],
		effect: "write",
		async recover() {
			const observation = await observeCanonicalRelease(jobInput, identity);
			if (!observation.releaseEvent) return undefined;
			await removeProductReleaseManifest(jobInput.repoRoot, identity);
			return {
				status: "completed",
				result: productReleaseReceipt(identity, observation.releaseEvent),
			};
		},
		async run(signal) {
			signal.throwIfAborted();
			let canonical = await observeCanonicalRelease(jobInput, identity);
			if (canonical.releaseEvent) {
				await removeProductReleaseManifest(jobInput.repoRoot, identity);
				return productReleaseReceipt(identity, canonical.releaseEvent);
			}
			const adapterInput = releaseAdapterInput(jobInput, identity);
			await jobInput.beforeAppend?.();
			canonical = await observeCanonicalRelease(jobInput, identity);
			if (canonical.releaseEvent) {
				return productReleaseReceipt(identity, canonical.releaseEvent);
			}
			await assertPublishedArtifact(jobInput.adapter, adapterInput, identity, signal);
			const before = await inspectReleaseChannel(
				jobInput.adapter,
				adapterInput,
				signal,
			);
			const manifest = await readProductReleaseManifest(
				jobInput.repoRoot,
				identity,
			);
			let operation: ProductReleaseOperation;
			if (before.artifactDigest === identity.artifactDigest) {
				operation = recoveredReleaseOperation(identity, before, manifest);
			} else {
				assertExpectedChannel(identity, before);
				if (manifest?.phase === "released") {
					throw new Error(
						"Product release channel moved after a completed release attempt.",
					);
				}
				if (!manifest) {
					await writeProductReleaseManifest(
						jobInput.repoRoot,
						identity,
						"prepared",
					);
				}
				operation = await releaseProduct(jobInput.adapter, adapterInput, signal);
				assertReleaseOperation(identity, operation);
				await writeProductReleaseManifest(
					jobInput.repoRoot,
					identity,
					"released",
					operation,
				);
			}
			signal.throwIfAborted();
			await jobInput.beforeAppend?.();
			canonical = await observeCanonicalRelease(jobInput, identity);
			if (canonical.releaseEvent) {
				return productReleaseReceipt(identity, canonical.releaseEvent);
			}
			await assertPublishedArtifact(jobInput.adapter, adapterInput, identity, signal);
			const after = await inspectReleaseChannel(
				jobInput.adapter,
				adapterInput,
				signal,
			);
			assertReleasedChannel(identity, operation, after);
			const settledManifest = await readProductReleaseManifest(
				jobInput.repoRoot,
				identity,
			);
			if (
				settledManifest?.phase !== "released" ||
				settledManifest.operationId !== operation.operationId ||
				settledManifest.revision !== operation.revision
			) {
				throw new Error("Product release recovery evidence is incomplete.");
			}
			await jobInput.beforeAppend?.();
			const event = createProductReleaseEvent({
				input: jobInput,
				identity,
				publicationEvent: canonical.publicationEvent,
				records: canonical.records,
				operation,
			});
			await appendRuntimeTraceRecord(
				jobInput.repoRoot,
				event,
				canonical.expectedBytes,
			);
			jobInput.reactor.invalidate(identity.traceId);
			await removeProductReleaseManifest(jobInput.repoRoot, identity);
			return productReleaseReceipt(identity, event);
		},
	};
}

function immutableReleaseInput(
	input: Omit<ProductReleaseInput, "coordinator">,
): Omit<ProductReleaseInput, "coordinator"> {
	return {
		...input,
		plan: {
			publicationEventId: input.plan.publicationEventId,
			target: { ...input.plan.target },
			authority: { ...input.plan.authority },
		},
		publicationEvent: {
			...input.publicationEvent,
			refs: [...input.publicationEvent.refs],
			data: input.publicationEvent.data
				? structuredClone(input.publicationEvent.data)
				: undefined,
		},
	};
}

function releaseAdapterInput(
	input: Omit<ProductReleaseInput, "coordinator">,
	identity: ReleaseIdentity,
): ProductReleaseAdapterInput {
	return {
		repoRoot: identity.repoRoot,
		jobId: identity.jobId,
		traceId: identity.traceId,
		workItemId: identity.workItemId,
		publicationEventId: identity.publicationEventId,
		publicationTargetId: identity.publicationTargetId,
		publicationRevision: identity.publicationRevision,
		publicationOperationId: identity.publicationOperationId,
		publicationAdapterId: identity.publicationAdapterId,
		artifactId: identity.artifactId,
		artifactDigest: identity.artifactDigest,
		artifactVersion: identity.artifactVersion,
		target: { ...input.plan.target },
		expectedChannel: {
			revision: identity.expectedRevision,
			artifactDigest: identity.expectedArtifactDigest,
			operationId: null,
		},
	};
}

async function assertPublishedArtifact(
	adapter: ProductReleaseAdapter,
	input: ProductReleaseAdapterInput,
	identity: ReleaseIdentity,
	signal: AbortSignal,
): Promise<void> {
	let observation: PublishedArtifactObservation;
	try {
		observation = await adapter.inspectPublishedArtifact(input, signal);
	} catch {
		throw new Error("Published artifact inspection failed before release.");
	}
	if (
		!observation ||
		typeof observation !== "object" ||
		observation.revision !== identity.publicationRevision ||
		observation.artifactDigest !== identity.artifactDigest ||
		observation.operationId !== identity.publicationOperationId
	) {
		throw new Error("Published artifact differs from canonical publication proof.");
	}
}

async function inspectReleaseChannel(
	adapter: ProductReleaseAdapter,
	input: ProductReleaseAdapterInput,
	signal: AbortSignal,
): Promise<ProductReleaseChannelObservation> {
	let observation: ProductReleaseChannelObservation;
	try {
		observation = await adapter.inspectReleaseChannel(input, signal);
	} catch {
		throw new Error("Product release channel inspection failed.");
	}
	assertChannelObservation(observation);
	return observation;
}

async function releaseProduct(
	adapter: ProductReleaseAdapter,
	input: ProductReleaseAdapterInput,
	signal: AbortSignal,
): Promise<ProductReleaseOperation> {
	try {
		return await adapter.release(input, signal);
	} catch {
		throw new Error("Product release adapter failed.");
	}
}

function recoveredReleaseOperation(
	identity: ReleaseIdentity,
	observation: ProductReleaseChannelObservation,
	manifest: Awaited<ReturnType<typeof readProductReleaseManifest>>,
): ProductReleaseOperation {
	if (
		manifest?.phase !== "released" ||
		!observation.operationId ||
		typeof manifest.revision !== "string" ||
		!safeProductReleaseRef(manifest.revision) ||
		manifest.operationId !== observation.operationId ||
		manifest.revision !== observation.revision
	) {
		throw new Error(
			"Product release channel already matches artifact without exact release recovery evidence.",
		);
	}
	const operation = {
		operationId: manifest.operationId,
		revision: manifest.revision,
		artifactDigest: identity.artifactDigest,
	};
	assertReleaseOperation(identity, operation);
	return operation;
}

function assertExpectedChannel(
	identity: ReleaseIdentity,
	observation: ProductReleaseChannelObservation,
): void {
	if (
		observation.revision !== identity.expectedRevision ||
		observation.artifactDigest !== identity.expectedArtifactDigest
	) {
		throw new Error("Product release channel moved after authority was issued.");
	}
}

function assertReleasedChannel(
	identity: ReleaseIdentity,
	operation: ProductReleaseOperation,
	observation: ProductReleaseChannelObservation,
): void {
	if (
		observation.revision !== operation.revision ||
		observation.artifactDigest !== identity.artifactDigest ||
		observation.operationId !== operation.operationId
	) {
		throw new Error("Product release channel does not match operation proof.");
	}
}

function assertChannelObservation(
	observation: ProductReleaseChannelObservation,
): void {
	if (!observation || typeof observation !== "object") {
		throw new Error("Product release channel observation is invalid.");
	}
	const absent =
		observation.revision === null &&
		observation.artifactDigest === null &&
		observation.operationId === null;
	const present =
		typeof observation.revision === "string" &&
		safeProductReleaseRef(observation.revision) &&
		isSha256Ref(observation.artifactDigest) &&
		(observation.operationId === null ||
			(typeof observation.operationId === "string" &&
				safeProductReleaseRef(observation.operationId)));
	if (!absent && !present) {
		throw new Error("Product release channel observation is invalid.");
	}
}

function assertReleaseOperation(
	identity: ReleaseIdentity,
	operation: ProductReleaseOperation,
): void {
	if (
		!operation ||
		typeof operation !== "object" ||
		!safeProductReleaseRef(operation.operationId) ||
		!safeProductReleaseRef(operation.revision) ||
		operation.artifactDigest !== identity.artifactDigest
	) {
		throw new Error("Product release adapter operation is invalid.");
	}
}

async function observeCanonicalRelease(
	input: Omit<ProductReleaseInput, "coordinator">,
	identity: ReleaseIdentity,
): Promise<CanonicalReleaseObservation> {
	const observation = await input.reactor.observe({
		kind: "project_truth_changed",
		occurredAt: input.createdAt,
		refs: [identity.traceId],
	});
	const publicationEvent = observation.records.find(
		(record): record is TraceEvent =>
			record.type === "trace_event" && record.id === identity.publicationEventId,
	);
	if (
		!publicationEvent ||
		!productReleasePublicationEventMatches(publicationEvent, identity)
	) {
		throw new Error("Product release requires exact canonical publication proof.");
	}
	const candidates = observation.records.filter(
		(record): record is TraceEvent =>
			record.type === "trace_event" &&
			record.event === PRODUCT_RELEASE_EVENT &&
			text(record.data?.publicationEventId) === identity.publicationEventId &&
			text(record.data?.targetId) === identity.targetId &&
			text(record.data?.channel) === identity.channel,
	);
	const releaseEvent = candidates.find(
		(event) => text(event.data?.runtimeJobId) === identity.jobId,
	);
	if (candidates.length > 0 && !releaseEvent) {
		throw new Error("Product release target already has different canonical proof.");
	}
	if (releaseEvent && !productReleaseEventMatches(releaseEvent, identity)) {
		throw new Error("Canonical product release proof is invalid.");
	}
	return {
		records: observation.records,
		expectedBytes: observation.expectedBytesByTrace[identity.traceId] || 0,
		publicationEvent,
		releaseEvent,
	};
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}
