import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createRuntimeClaimReleaseEvent } from "./claims.ts";
import {
	CodewikiTraceError,
	TraceAppendConflictError,
} from "../error-handling/trace-errors.ts";
import {
	appendRuntimeTraceRecords,
	type AppendTraceBatchResult,
} from "./trace-writer.ts";
import { traceFilePath } from "../traces/schema.ts";
import type { TraceEvent, TraceRecord } from "../traces/types.ts";

export interface RuntimeLeaseExpirationOptions {
	generatedAt: string;
	nextSequenceByTrace: Record<string, number>;
	releaseIdPrefix?: string;
}

export interface RuntimeLeaseExpirationBatch {
	events: TraceEvent[];
	nextSequenceByTrace: Record<string, number>;
}

export interface RuntimeLeaseExpirationAppendOptions {
	repoRoot: string;
	expectedBytesByTrace: Record<string, number>;
}

export interface RuntimeLeaseExpirationAppendResult {
	events: TraceEvent[];
	results: AppendTraceBatchResult[];
	nextBytesByTrace: Record<string, number>;
}

interface RuntimeLeaseClaim {
	traceId: string;
	id: string;
	createdAt: string;
	parentId: string | null;
	claimId: string;
	workerId?: string;
	workUnitId: string;
	planningRefs: string[];
	pathScopes: string[];
	expiresAt: string;
	refs: string[];
}

interface RuntimeLeaseRelease {
	traceId: string;
	createdAt: string;
	claimId?: string;
	workUnitId?: string;
	refs: string[];
}

export function planRuntimeLeaseExpirations(
	records: TraceRecord[],
	options: RuntimeLeaseExpirationOptions,
): RuntimeLeaseExpirationBatch {
	const nextSequenceByTrace = { ...options.nextSequenceByTrace };
	const releases = records.filter(isRuntimeReleaseEvent).map(runtimeRelease);
	const events = records
		.filter(isRuntimeClaimEvent)
		.map(runtimeLeaseClaim)
		.filter((claim): claim is RuntimeLeaseClaim => claim !== undefined)
		.filter((claim) => leaseExpired(claim, options.generatedAt))
		.filter((claim) => !leaseReleased(claim, releases))
		.map((claim) =>
			leaseExpirationEvent({ claim, options, nextSequenceByTrace }),
		);
	return { events, nextSequenceByTrace };
}

export async function appendRuntimeLeaseExpirations(
	batch: RuntimeLeaseExpirationBatch,
	options: RuntimeLeaseExpirationAppendOptions,
): Promise<RuntimeLeaseExpirationAppendResult> {
	const groups = eventsByTrace(batch.events);
	await Promise.all(
		groups.map((group) => assertExpectedTraceBytes(group, options)),
	);
	const results: AppendTraceBatchResult[] = [];
	for (const group of groups) {
		results.push(
			await appendRuntimeTraceRecords(
				options.repoRoot,
				group.events,
				expectedBytesForTrace(group.traceId, options),
			),
		);
	}
	return {
		events: [...batch.events],
		results,
		nextBytesByTrace: Object.fromEntries(
			results.map((result) => [result.records[0].traceId, result.nextBytes]),
		),
	};
}

function leaseExpirationEvent(input: {
	claim: RuntimeLeaseClaim;
	options: RuntimeLeaseExpirationOptions;
	nextSequenceByTrace: Record<string, number>;
}): TraceEvent {
	const sequence = nextTraceSequence(
		input.nextSequenceByTrace,
		input.claim.traceId,
	);
	return createRuntimeClaimReleaseEvent({
		traceId: input.claim.traceId,
		id: leaseExpirationId(input.claim, sequence, input.options),
		parentId: input.claim.id,
		sequence,
		createdAt: input.options.generatedAt,
		event: "runtime.work_unit.claim.expired",
		claimId: input.claim.claimId,
		...(input.claim.workerId ? { workerId: input.claim.workerId } : {}),
		workUnitId: input.claim.workUnitId,
		planningRefs: input.claim.planningRefs,
		pathScopes: input.claim.pathScopes,
		reason: "lease_expired",
		refs: [input.claim.id],
		data: {
			expiresAt: input.claim.expiresAt,
			claimCreatedAt: input.claim.createdAt,
		},
	});
}

function runtimeLeaseClaim(event: TraceEvent): RuntimeLeaseClaim | undefined {
	const expiresAt = text(event.data?.expiresAt);
	const workUnitId = text(event.data?.workUnitId);
	if (!expiresAt || !workUnitId) return undefined;
	return {
		traceId: event.traceId,
		id: event.id,
		createdAt: event.createdAt,
		parentId: event.parentId,
		claimId: text(event.data?.claimId) || event.id,
		...(text(event.data?.workerId)
			? { workerId: text(event.data?.workerId) }
			: {}),
		workUnitId,
		planningRefs: stringList(event.data?.planningRefs),
		pathScopes: stringList(event.data?.pathScopes),
		expiresAt,
		refs: unique([...event.refs, event.id]),
	};
}

function runtimeRelease(event: TraceEvent): RuntimeLeaseRelease {
	return {
		traceId: event.traceId,
		createdAt: event.createdAt,
		...(text(event.data?.claimId)
			? { claimId: text(event.data?.claimId) }
			: {}),
		...(text(event.data?.workUnitId)
			? { workUnitId: text(event.data?.workUnitId) }
			: {}),
		refs: unique([...event.refs, event.id]),
	};
}

function leaseExpired(claim: RuntimeLeaseClaim, generatedAt: string): boolean {
	const expires = Date.parse(claim.expiresAt);
	const now = Date.parse(generatedAt);
	return Number.isFinite(expires) && Number.isFinite(now) && expires <= now;
}

function leaseReleased(
	claim: RuntimeLeaseClaim,
	releases: RuntimeLeaseRelease[],
): boolean {
	return releases.some(
		(release) =>
			release.traceId === claim.traceId &&
			Date.parse(release.createdAt) >= Date.parse(claim.createdAt) &&
			((release.claimId && release.claimId === claim.claimId) ||
				(release.workUnitId && release.workUnitId === claim.workUnitId) ||
				release.refs.includes(claim.id)),
	);
}

function isRuntimeClaimEvent(record: TraceRecord): record is TraceEvent {
	return (
		record.type === "trace_event" &&
		record.event === "runtime.work_unit.claimed"
	);
}

function isRuntimeReleaseEvent(record: TraceRecord): record is TraceEvent {
	return (
		record.type === "trace_event" &&
		[
			"runtime.work_unit.claim.released",
			"runtime.work_unit.claim.expired",
			"runtime.work_unit.claim.cancelled",
		].includes(record.event)
	);
}

function leaseExpirationId(
	claim: RuntimeLeaseClaim,
	sequence: number,
	options: RuntimeLeaseExpirationOptions,
): string {
	return `${options.releaseIdPrefix || `${claim.traceId}:runtime:lease-expired`}:${claim.workUnitId}:${sequence}`;
}

interface RuntimeLeaseTraceGroup {
	traceId: string;
	events: TraceEvent[];
}

function eventsByTrace(events: TraceEvent[]): RuntimeLeaseTraceGroup[] {
	const groups = new Map<string, TraceEvent[]>();
	for (const event of events) {
		groups.set(event.traceId, [...(groups.get(event.traceId) || []), event]);
	}
	return [...groups.entries()].map(([traceId, groupEvents]) => ({
		traceId,
		events: groupEvents,
	}));
}

async function assertExpectedTraceBytes(
	group: RuntimeLeaseTraceGroup,
	options: RuntimeLeaseExpirationAppendOptions,
): Promise<void> {
	const expectedBytes = expectedBytesForTrace(group.traceId, options);
	const path = resolve(options.repoRoot, traceFilePath(group.traceId));
	const actualBytes = await traceBytes(path);
	if (actualBytes !== expectedBytes) {
		throw new TraceAppendConflictError(path, expectedBytes, actualBytes);
	}
}

function expectedBytesForTrace(
	traceId: string,
	options: RuntimeLeaseExpirationAppendOptions,
): number {
	const expected = options.expectedBytesByTrace[traceId];
	if (!Number.isInteger(expected) || expected < 0) {
		throw new CodewikiTraceError({
			code: "append_conflict",
			message: `Missing expected trace bytes for ${traceId}.`,
			traceId,
			data: { expected },
		});
	}
	return expected;
}

async function traceBytes(path: string): Promise<number> {
	try {
		return (await stat(path)).size;
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return 0;
		throw error;
	}
}

function nextTraceSequence(
	nextSequenceByTrace: Record<string, number>,
	traceId: string,
): number {
	const sequence = nextSequenceByTrace[traceId];
	if (!Number.isInteger(sequence) || sequence < 1) {
		throw new Error(`Missing next trace sequence for ${traceId}.`);
	}
	nextSequenceByTrace[traceId] = sequence + 1;
	return sequence;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => text(item)).filter(Boolean)
		: [];
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => text(value)).filter(Boolean)),
	);
}
