import { createHash } from "node:crypto";
import { join } from "node:path";

import { readTraceFile } from "../traces/reader.ts";
import { traceFilePath } from "../traces/schema.ts";
import type { TraceEvent, TraceRecord } from "../traces/types.ts";
import {
	implementationWorkerJobId,
	type ImplementationWorkerAssignment,
	type ImplementationWorkerReport,
} from "./workers/implementation-adapter.ts";
import type {
	ProjectCoordinator,
	ProjectCoordinatorJob,
} from "./coordinator/project.ts";
import type { RuntimeReactor } from "./reactor.ts";
import {
	appendRuntimeWorkUnitClaims,
	createRuntimeWorkerCompletionReleaseEvents,
} from "./claims/work-unit-events.ts";

export interface ImplementationWorkerClaimReleaseInput {
	repoRoot: string;
	coordinator: ProjectCoordinator;
	reactor: RuntimeReactor;
	assignment: ImplementationWorkerAssignment;
	report: ImplementationWorkerReport;
	claimEvent: TraceEvent;
	createdAt: string;
	beforeAppend?: () => void | Promise<void>;
}

export interface ImplementationWorkerClaimReleaseReceipt {
	jobId: string;
	claimId: string;
	workItemId: string;
	eventId: string;
}

export function scheduleImplementationWorkerClaimRelease(
	input: ImplementationWorkerClaimReleaseInput,
): Promise<ImplementationWorkerClaimReleaseReceipt> {
	return input.coordinator.schedule(implementationWorkerClaimReleaseJob(input));
}

export function implementationWorkerClaimReleaseJob(
	input: Omit<ImplementationWorkerClaimReleaseInput, "coordinator">,
): ProjectCoordinatorJob<ImplementationWorkerClaimReleaseReceipt> {
	assertClaimMatchesAssignment(input.claimEvent, input.assignment);
	const jobId = releaseJobId(input.assignment, input.report);
	return {
		idempotencyKey: jobId,
		lane: { kind: "assignment", workItemId: input.assignment.workItemId },
		conflictRefs: [
			`trace:${input.assignment.traceId}`,
			`work-item:${input.assignment.workItemId}`,
			...input.assignment.pathScopes.map((path) => `path:${path}`),
		],
		effect: "write",
		async recover() {
			const recovered = await persistedRelease(
				input.repoRoot,
				input.assignment.traceId,
				jobId,
			);
			return recovered
				? {
						status: "completed",
						result: releaseReceipt(jobId, input.assignment, recovered.id),
					}
				: undefined;
		},
		async run(signal) {
			signal.throwIfAborted();
			input.reactor.invalidate(input.assignment.traceId);
			const observation = await input.reactor.observe({
				kind: "timer_due",
				occurredAt: input.createdAt,
			});
			const active = observation.workState.assignments.find(
				(assignment) =>
					assignment.id === input.assignment.claimId &&
					assignment.status === "claimed",
			);
			const claim = observation.records.find(
				(record): record is TraceEvent =>
					record.type === "trace_event" && record.id === active?.claimEventId,
			);
			if (!claim) {
				throw new Error(
					"Implementation worker release claim is no longer active.",
				);
			}
			assertClaimMatchesAssignment(claim, input.assignment);
			if (
				input.report.status === "completed" &&
				!observation.workState.workItems.find(
					(item) =>
						item.id === input.assignment.workItemId && item.implemented,
				)
			) {
				throw new Error(
					"Implementation worker completed claim cannot release before Implementation acceptance.",
				);
			}
			const batch = releaseBatch(input, observation.records, claim, jobId);
			await input.beforeAppend?.();
			const appended = await appendRuntimeWorkUnitClaims(batch, {
				repoRoot: input.repoRoot,
				expectedBytesByTrace: observation.expectedBytesByTrace,
			});
			input.reactor.invalidate(input.assignment.traceId);
			return releaseReceipt(jobId, input.assignment, appended.events[0].id);
		},
	};
}

function releaseBatch(
	input: Omit<ImplementationWorkerClaimReleaseInput, "coordinator">,
	records: TraceRecord[],
	claim: TraceEvent,
	jobId: string,
) {
	const batch = createRuntimeWorkerCompletionReleaseEvents(
		[
			{
				traceId: input.assignment.traceId,
				workerId: input.assignment.workerId,
				workUnitId: input.assignment.workItemId,
				claimId: input.assignment.claimId,
				planningRefs: [...input.assignment.planningRefs],
				status: input.report.status,
				message: input.report.error,
				refs: [input.report.reportRef],
				sessionId: input.report.sessionId,
				sessionFile: input.report.sessionFile,
			},
		],
		[claim],
		{
			createdAt: input.createdAt,
			nextSequenceByTrace: nextSequenceByTrace(records),
			releaseIdPrefix: `runtime-review-${jobId.slice(-16)}`,
		},
	);
	return {
		...batch,
		events: batch.events.map((event) => ({
			...event,
			data: {
				...(event.data || {}),
				runtimeJobId: jobId,
				workerReportRef: input.report.reportRef,
			},
		})),
	};
}

function releaseJobId(
	assignment: ImplementationWorkerAssignment,
	report: ImplementationWorkerReport,
): string {
	const digest = createHash("sha256")
		.update(
			JSON.stringify({
				repoRoot: assignment.repoRoot,
				assignmentId: assignment.assignmentId,
				claimId: assignment.claimId,
				workItemId: assignment.workItemId,
				workerId: assignment.workerId,
				reportStatus: report.status,
				reportRef: report.reportRef,
			}),
		)
		.digest("hex");
	return `implementation-worker-release:${digest}`;
}

async function persistedRelease(
	repoRoot: string,
	traceId: string,
	jobId: string,
): Promise<TraceEvent | undefined> {
	try {
		const records = await readTraceFile(join(repoRoot, traceFilePath(traceId)));
		return records.find(
			(record): record is TraceEvent =>
				record.type === "trace_event" &&
				record.event === "runtime.work_unit.claim.released" &&
				record.data?.runtimeJobId === jobId,
		);
	} catch (error) {
		if (isNotFound(error)) return undefined;
		throw error;
	}
}

function assertClaimMatchesAssignment(
	claim: TraceEvent,
	assignment: ImplementationWorkerAssignment,
): void {
	if (
		claim.event !== "runtime.work_unit.claimed" ||
		claim.traceId !== assignment.traceId ||
		claim.data?.claimId !== assignment.claimId ||
		claim.data?.workerId !== assignment.workerId ||
		claim.data?.workUnitId !== assignment.workItemId ||
		claim.data?.runtimeJobId !== implementationWorkerJobId(assignment) ||
		typeof claim.data?.runtimeAssignmentDigest !== "string"
	) {
		throw new Error(
			"Implementation worker release does not match active claim.",
		);
	}
}

function releaseReceipt(
	jobId: string,
	assignment: ImplementationWorkerAssignment,
	eventId: string,
): ImplementationWorkerClaimReleaseReceipt {
	return {
		jobId,
		claimId: assignment.claimId,
		workItemId: assignment.workItemId,
		eventId,
	};
}

function nextSequenceByTrace(records: TraceRecord[]): Record<string, number> {
	const next: Record<string, number> = {};
	for (const record of records) {
		if (record.type !== "trace_event") continue;
		next[record.traceId] = Math.max(
			next[record.traceId] || 1,
			record.sequence + 1,
		);
	}
	return next;
}

function isNotFound(error: unknown): boolean {
	return Boolean(
		error &&
			typeof error === "object" &&
			"code" in error &&
			(error as { code?: string }).code === "ENOENT",
	);
}
