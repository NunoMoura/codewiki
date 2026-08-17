import { createHash } from "node:crypto";
import { join } from "node:path";
import { changeTraceId } from "../../changes/trace/change-record.ts";
import { stableJson } from "../../changes/digest.ts";
import type { ImplementationWorkerReportInput } from "../../loops/implementation/workers.ts";
import { readTraceFile } from "../../changes/trace/reader.ts";
import { traceFilePath } from "../../changes/trace/schema.ts";
import type { TraceEvent } from "../../changes/trace/types.ts";
import type {
	ProjectCoordinator,
	ProjectCoordinatorJob,
	ProjectCoordinatorLane,
} from "./project.ts";
import type {
	ProjectServerReactor,
	ProjectServerReaction,
	ProjectServerTrigger,
} from "./reactor.ts";
import { runtimeSemanticJobId } from "./job-id.ts";
import {
	runProjectServerSelectedSemanticReaction,
	type ProjectServerLoopExecutionPorts,
	type ProjectServerSemanticAdapters,
	type ProjectServerSemanticContext,
	type ProjectServerSemanticMode,
	type ProjectServerSemanticOutcome,
	type RunProjectServerSelectedSemanticReactionResult,
} from "./executor.ts";

export interface ProjectServerReactionJobEvidence {
	traceId: string;
	eventId: string;
	sequence: number;
}

export interface ProjectServerReactionJobReceipt {
	schemaVersion: 1;
	jobId: string;
	loop: "decision" | "planning" | "implementation";
	status: "completed" | "previewed" | "routed" | "stale";
	evidence: ProjectServerReactionJobEvidence[];
}

export interface ProjectServerReactionJobInput {
	repoRoot: string;
	coordinator: ProjectCoordinator;
	reactor: ProjectServerReactor;
	reaction: ProjectServerReaction;
	adapters: ProjectServerSemanticAdapters;
	executionPorts: ProjectServerLoopExecutionPorts;
	context?: ProjectServerSemanticContext;
	mode?: ProjectServerSemanticMode;
	maxCasRetries?: number;
	implementationWorkerReports?: ImplementationWorkerReportInput[];
	beforeAppend?: () => void | Promise<void>;
	onExecution?: (result: RunProjectServerSelectedSemanticReactionResult) => void;
}

export interface ScheduleProjectServerReactionsInput {
	repoRoot: string;
	coordinator: ProjectCoordinator;
	reactor: ProjectServerReactor;
	trigger: ProjectServerTrigger;
	adapters: ProjectServerSemanticAdapters;
	executionPorts: ProjectServerLoopExecutionPorts;
	context?: ProjectServerSemanticContext;
	mode?: ProjectServerSemanticMode;
	maxReactions?: number;
	maxPlanningChanges?: number;
	maxCasRetries?: number;
	blockedImplementationWorkItemIds?: string[];
	implementationWorkerReports?: ImplementationWorkerReportInput[];
	beforeAppend?: () => void | Promise<void>;
}

export async function scheduleProjectServerReactionJob(
	input: ProjectServerReactionJobInput,
): Promise<ProjectServerReactionJobReceipt> {
	return input.coordinator.schedule(runtimeReactionJob(input));
}

export async function scheduleProjectServerReactions(
	input: ScheduleProjectServerReactionsInput,
): Promise<ProjectServerReactionJobReceipt[]> {
	const observation = await input.reactor.observeMany(input.trigger, {
		maxReactions: input.maxReactions,
		maxPlanningChanges: input.maxPlanningChanges,
	});
	const blocked = new Set(input.blockedImplementationWorkItemIds || []);
	const reactions = observation.reactions.filter(
		(reaction) =>
			!blockedImplementationReaction({
				reaction,
				blockedWorkItemIds: blocked,
			}),
	);
	return Promise.all(
		reactions.map((reaction) =>
			scheduleProjectServerReactionJob({
				repoRoot: input.repoRoot,
				coordinator: input.coordinator,
				reactor: input.reactor,
				reaction,
				adapters: input.adapters,
				executionPorts: input.executionPorts,
				context: input.context,
				mode: input.mode,
				implementationWorkerReports: workerReportsForReaction({
					reaction,
					workerReports: input.implementationWorkerReports || [],
				}),
				maxCasRetries: input.maxCasRetries,
				beforeAppend: input.beforeAppend,
			}),
		),
	);
}

function workerReportsForReaction(input: {
	readonly reaction: ProjectServerReaction;
	readonly workerReports: ImplementationWorkerReportInput[];
}): ImplementationWorkerReportInput[] {
	const selection = input.reaction.selection;
	if (selection?.loop !== "implementation") return [];
	const selected = new Set(selection.workItemIds);
	return input.workerReports
		.filter((result) => selected.has(result.workUnitId))
		.sort(compareWorkerReports);
}

function compareWorkerReports(
	...values: [ImplementationWorkerReportInput, ImplementationWorkerReportInput]
): number {
	const [left, right] = values;
	return `${left.workUnitId}:${left.workerId}`.localeCompare(
		`${right.workUnitId}:${right.workerId}`,
	);
}

function workerReportContextDigest(
	workerReports: ImplementationWorkerReportInput[],
): string | undefined {
	if (workerReports.length === 0) return undefined;
	return createHash("sha256").update(stableJson(workerReports)).digest("hex");
}

function blockedImplementationReaction(input: {
	readonly reaction: ProjectServerReaction;
	readonly blockedWorkItemIds: Set<string>;
}): boolean {
	const selection = input.reaction.selection;
	return Boolean(
		selection?.loop === "implementation" &&
			selection.workItemIds.some((workItemId) =>
				input.blockedWorkItemIds.has(workItemId),
			),
	);
}

export function runtimeReactionJob(
	input: Omit<ProjectServerReactionJobInput, "coordinator">,
): ProjectCoordinatorJob<ProjectServerReactionJobReceipt> {
	const selection = input.reaction.selection;
	if (input.reaction.status !== "ready" || !selection) {
		throw new Error(
			"Project Server coordinator cannot schedule a quiescent reaction.",
		);
	}
	if (selection.loop === "decision") {
		throw new Error(
			"Project Server Decision jobs require authenticated exact-revision selection.",
		);
	}
	const mode = input.mode || "append";
	const jobId = runtimeSemanticJobId(
		input.reaction,
		mode,
		workerReportContextDigest(input.implementationWorkerReports || []),
	);
	const job: ProjectCoordinatorJob<ProjectServerReactionJobReceipt> = {
		idempotencyKey: jobId,
		lane: reactionLane(input.reaction),
		conflictRefs: reactionConflictRefs(input.reaction),
		effect: mode === "append" ? "write" : "read",
		async run(signal) {
			const result = await runProjectServerSelectedSemanticReaction({
				repoRoot: input.repoRoot,
				reaction: input.reaction,
				runtimeJobId: jobId,
				adapters: input.adapters,
				executionPorts: input.executionPorts,
				context: input.context,
				mode,
				maxCasRetries: input.maxCasRetries,
				reactor: input.reactor,
				signal,
				implementationWorkerReports: input.implementationWorkerReports,
				beforeAppend: input.beforeAppend,
			});
			try {
				input.onExecution?.(result);
			} catch {
				// Execution observers cannot change semantic scheduling or durable writes.
			}
			const evidence = result.outcome
				? semanticOutcomeEvidence(result.outcome)
				: [];
			return receipt(jobId, selection.loop, result.status, evidence);
		},
	};
	if (mode === "append") {
		job.recover = async () => {
			const events = await persistedProjectServerJobEvents({
				repoRoot: input.repoRoot,
				reaction: input.reaction,
				jobId,
			});
			const evidence = events.map(eventEvidence).sort(compareEvidence);
			return evidence.length > 0
				? {
						status: "completed",
						result: receipt(
							jobId,
							selection.loop,
							persistedJobStatus(selection.loop, events),
							evidence,
						),
					}
				: undefined;
		};
	}
	return job;
}

export async function persistedProjectServerJobEvidence(input: {
	readonly repoRoot: string;
	readonly reaction: ProjectServerReaction;
	readonly jobId: string;
}): Promise<ProjectServerReactionJobEvidence[]> {
	const events = await persistedProjectServerJobEvents(input);
	return events.map(eventEvidence).sort(compareEvidence);
}

async function persistedProjectServerJobEvents(input: {
	readonly repoRoot: string;
	readonly reaction: ProjectServerReaction;
	readonly jobId: string;
}): Promise<TraceEvent[]> {
	const events: TraceEvent[] = [];
	for (const traceId of reactionTraceIds(input.reaction)) {
		const records = await readTraceFile(
			join(input.repoRoot, traceFilePath(traceId)),
		).catch((error: unknown) => {
			if (isNotFound(error)) return [];
			throw error;
		});
		for (const record of records) {
			if (
				record.type === "trace_event" &&
				objectRecord(record.data).runtimeJobId === input.jobId
			) {
				events.push(record);
			}
		}
	}
	return events.sort(compareTraceEvents);
}

function compareTraceEvents(...values: [TraceEvent, TraceEvent]): number {
	const [left, right] = values;
	return (
		left.traceId.localeCompare(right.traceId) ||
		left.sequence - right.sequence ||
		left.id.localeCompare(right.id)
	);
}

function persistedJobStatus(
	loop: ProjectServerReactionJobReceipt["loop"],
	events: TraceEvent[],
): ProjectServerReactionJobReceipt["status"] {
	if (loop !== "implementation") return "completed";
	return events.some((event) => {
		const exit = objectRecord(objectRecord(event.data).exit);
		return (
			exit.status !== "exit" ||
			["decision", "planning", "user"].includes(String(exit.targetLoop || ""))
		);
	})
		? "routed"
		: "completed";
}

function reactionLane(reaction: ProjectServerReaction): ProjectCoordinatorLane {
	const selection = reaction.selection;
	if (!selection) throw new Error("Project Server reaction selection is required.");
	if (selection.loop === "decision") {
		throw new Error(
			"Project Server Decision lane requires authenticated exact-revision selection.",
		);
	}
	if (selection.loop === "planning") return { kind: "planning" };
	return { kind: "implementation", sprintId: selection.sprintId };
}

function reactionConflictRefs(reaction: ProjectServerReaction): string[] {
	const selection = reaction.selection;
	if (!selection) return [];
	if (selection.loop === "decision") {
		return [`change:${selection.change.changeId}`];
	}
	if (selection.loop === "planning") {
		return selection.planningHorizon.map(
			(change) => `change:${change.changeId}`,
		);
	}
	return [
		...selection.changeIds.map((changeId) => `change:${changeId}`),
		...selection.workItemIds.map((workItemId) => `work-item:${workItemId}`),
	];
}

function reactionTraceIds(reaction: ProjectServerReaction): string[] {
	const selection = reaction.selection;
	if (!selection) return [];
	if (selection.loop === "decision") return [selection.change.traceId];
	if (selection.loop === "planning") {
		return selection.planningHorizon.map((change) => change.traceId);
	}
	return selection.changeIds.map(changeTraceId);
}

function semanticOutcomeEvidence(
	outcome: ProjectServerSemanticOutcome,
): ProjectServerReactionJobEvidence[] {
	if (outcome.loop === "decision") {
		return outcome.result.append && outcome.result.event
			? [eventEvidence(outcome.result.event)]
			: [];
	}
	if (outcome.loop === "planning") {
		return outcome.result.append
			? Object.values(outcome.result.events)
					.map(eventEvidence)
					.sort(compareEvidence)
			: [];
	}
	return outcome.result.append
		? [eventEvidence(outcome.result.iterationEvent)]
		: [];
}

function eventEvidence(event: TraceEvent): ProjectServerReactionJobEvidence {
	return {
		traceId: event.traceId,
		eventId: event.id,
		sequence: event.sequence,
	};
}

function receipt(
	jobId: string,
	loop: ProjectServerReactionJobReceipt["loop"],
	status: ProjectServerReactionJobReceipt["status"],
	evidence: ProjectServerReactionJobEvidence[],
): ProjectServerReactionJobReceipt {
	return { schemaVersion: 1, jobId, loop, status, evidence };
}

function objectRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function isNotFound(error: unknown): boolean {
	return (
		error !== null &&
		typeof error === "object" &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}

function compareEvidence(
	left: ProjectServerReactionJobEvidence,
	right: ProjectServerReactionJobEvidence,
): number {
	return (
		left.traceId.localeCompare(right.traceId) ||
		left.sequence - right.sequence ||
		left.eventId.localeCompare(right.eventId)
	);
}
