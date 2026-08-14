import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isTraceId, traceFilePath } from "../../changes/trace/schema.ts";
import {
	createTriggerRunTraceHead,
	formatTraceLine,
} from "../../changes/trace/writer.ts";
import type { TraceHead } from "../../changes/trace/types.ts";
import type {TriggerView, TriggersView} from "../queries/projection-types.ts";
import type {
	QueuedRuntimeHeartbeat,
	RuntimeHeartbeatIntent,
} from "./types.ts";

export type RuntimeTriggerRunSkipReason =
	| "no_trigger_target"
	| "no_matching_trigger"
	| "source_mismatch"
	| "not_enabled"
	| "blocked"
	| "disabled"
	| "unsupported_run_mode"
	| "active_skip_if_active"
	| "replace_requires_host_policy"
	| "missing_run_key"
	| "duplicate_run"
	| "duplicate_plan"
	| "invalid_trace_id";

export interface RuntimeTriggerRunStart {
	traceId: string;
	title: string;
	triggerId: string;
	triggerTraceId: string;
	planningRef: string;
	runKey: string;
	heartbeatKey: string;
	heartbeatIntent: RuntimeHeartbeatIntent;
	refs: string[];
	head: TraceHead;
}

export interface RuntimeTriggerRunSkip {
	heartbeatKey: string;
	heartbeatIntent: RuntimeHeartbeatIntent;
	reason: RuntimeTriggerRunSkipReason;
	message: string;
	refs: string[];
	triggerId?: string;
	traceId?: string;
}

export interface RuntimeTriggerRunPlan {
	heartbeatCount: number;
	starts: RuntimeTriggerRunStart[];
	skipped: RuntimeTriggerRunSkip[];
	traceHeads: TraceHead[];
}

export interface RuntimeTriggerRunPlanInput {
	triggers: TriggersView;
	heartbeats: QueuedRuntimeHeartbeat[];
	createdAt?: string;
	traceIdFactory?: RuntimeTriggerTraceIdFactory;
	runKeyFactory?: RuntimeTriggerRunKeyFactory;
}

export type RuntimeTriggerTraceIdFactory = (input: {
	trigger: TriggerView;
	heartbeat: QueuedRuntimeHeartbeat;
	runKey: string;
	index: number;
}) => string;

export type RuntimeTriggerRunKeyFactory = (input: {
	trigger: TriggerView;
	heartbeat: QueuedRuntimeHeartbeat;
	index: number;
}) => string;

export function planRuntimeTriggerRuns(
	input: RuntimeTriggerRunPlanInput,
): RuntimeTriggerRunPlan {
	const starts: RuntimeTriggerRunStart[] = [];
	const skipped: RuntimeTriggerRunSkip[] = [];
	const plannedKeys = new Set<string>();
	for (const heartbeat of input.heartbeats) {
		const triggers = matchingTriggers(input.triggers, heartbeat);
		if (triggers.length === 0) {
			skipped.push(skipWithoutTrigger(heartbeat));
			continue;
		}
		for (const trigger of triggers) {
			const eligible = triggerEligibility(trigger, heartbeat);
			if (eligible) {
				skipped.push(skipTrigger(heartbeat, trigger, eligible));
				continue;
			}
			const runKey = heartbeatRunKey(input, trigger, heartbeat, starts.length);
			if (!runKey) {
				skipped.push(skipTrigger(heartbeat, trigger, "missing_run_key"));
				continue;
			}
			if (hasRun(trigger, runKey)) {
				skipped.push(skipTrigger(heartbeat, trigger, "duplicate_run"));
				continue;
			}
			const planKey = triggerRunKey(trigger, runKey);
			if (plannedKeys.has(planKey)) {
				skipped.push(skipTrigger(heartbeat, trigger, "duplicate_plan"));
				continue;
			}
			const traceId = runTraceId(
				input,
				trigger,
				heartbeat,
				runKey,
				starts.length,
			);
			if (!isTraceId(traceId)) {
				skipped.push(skipTrigger(heartbeat, trigger, "invalid_trace_id"));
				continue;
			}
			const start = runStart({
				trigger,
				heartbeat,
				traceId,
				runKey,
				createdAt: input.createdAt,
			});
			starts.push(start);
			plannedKeys.add(planKey);
		}
	}
	return {
		heartbeatCount: input.heartbeats.length,
		starts,
		skipped,
		traceHeads: starts.map((start) => start.head),
	};
}

export type RuntimeTriggerRunStartBlockReason =
	| "trace_already_exists"
	| "invalid_trace_head"
	| "append_failed";

export interface AppendPlannedTriggerRunsInput {
	repoRoot: string;
	plan: RuntimeTriggerRunPlan;
}

export interface RuntimeTriggerRunStarted {
	status: "started";
	start: RuntimeTriggerRunStart;
	path: string;
	previousBytes: 0;
	nextBytes: number;
	line: string;
	head: TraceHead;
}

export interface RuntimeTriggerRunStartBlocked {
	status: "blocked";
	start: RuntimeTriggerRunStart;
	reason: RuntimeTriggerRunStartBlockReason;
	message: string;
	path?: string;
	refs: string[];
}

export interface AppendPlannedTriggerRunsResult {
	started: RuntimeTriggerRunStarted[];
	blocked: RuntimeTriggerRunStartBlocked[];
	skipped: RuntimeTriggerRunSkip[];
}

export async function appendPlannedTriggerRuns(
	input: AppendPlannedTriggerRunsInput,
): Promise<AppendPlannedTriggerRunsResult> {
	const started: RuntimeTriggerRunStarted[] = [];
	const blocked: RuntimeTriggerRunStartBlocked[] = [];
	for (const start of input.plan.starts) {
		const result = await appendPlannedTriggerRun(input.repoRoot, start);
		if (result.status === "started") started.push(result);
		else blocked.push(result);
	}
	return {
		started,
		blocked,
		skipped: [...input.plan.skipped],
	};
}

async function appendPlannedTriggerRun(
	repoRoot: string,
	start: RuntimeTriggerRunStart,
): Promise<RuntimeTriggerRunStarted | RuntimeTriggerRunStartBlocked> {
	let path: string | undefined;
	try {
		path = resolve(repoRoot, traceFilePath(start.traceId));
		assertRunStartHead(start);
		const line = formatTraceLine(start.head);
		await mkdir(dirname(path), { recursive: true });
		const file = await open(path, "wx");
		try {
			await file.writeFile(line, "utf8");
		} finally {
			await file.close();
		}
		return {
			status: "started",
			start,
			path,
			previousBytes: 0,
			nextBytes: Buffer.byteLength(line, "utf8"),
			line,
			head: start.head,
		};
	} catch (error) {
		const reason = blockReason(error);
		return {
			status: "blocked",
			start,
			reason,
			message: blockMessage(reason, error),
			...(path ? { path } : {}),
			refs: unique(start.refs),
		};
	}
}

function assertRunStartHead(start: RuntimeTriggerRunStart): void {
	const origin = start.head.origin;
	const valid =
		start.head.type === "trace_head" &&
		start.head.traceId === start.traceId &&
		origin?.kind === "trigger_run" &&
		origin.triggerTraceId === start.triggerTraceId &&
		origin.triggerId === start.triggerId &&
		origin.planningRef === start.planningRef &&
		origin.runKey === start.runKey;
	if (!valid) {
		throw new InvalidTriggerRunHeadError();
	}
}

class InvalidTriggerRunHeadError extends Error {
	constructor() {
		super("Trigger run start must contain a matching trigger_run trace head.");
		this.name = "InvalidTriggerRunHeadError";
	}
}

function blockReason(error: unknown): RuntimeTriggerRunStartBlockReason {
	if (error instanceof InvalidTriggerRunHeadError) return "invalid_trace_head";
	if (isNodeError(error) && error.code === "EEXIST")
		return "trace_already_exists";
	return "append_failed";
}

function blockMessage(
	reason: RuntimeTriggerRunStartBlockReason,
	error: unknown,
): string {
	if (reason === "trace_already_exists") {
		return "Run trace already exists; start was not appended.";
	}
	if (reason === "invalid_trace_head") {
		return "Run start does not contain a valid matching trace_head.";
	}
	return error instanceof Error
		? error.message
		: "Run trace could not be appended.";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}

function matchingTriggers(
	view: TriggersView,
	heartbeat: QueuedRuntimeHeartbeat,
): TriggerView[] {
	if (!heartbeat.triggerId && !heartbeat.traceId) return [];
	return view.triggers.filter((trigger) => {
		if (heartbeat.triggerId && trigger.id !== heartbeat.triggerId) return false;
		if (heartbeat.traceId && trigger.traceId !== heartbeat.traceId)
			return false;
		return true;
	});
}

function triggerEligibility(
	trigger: TriggerView,
	heartbeat: QueuedRuntimeHeartbeat,
): RuntimeTriggerRunSkipReason | undefined {
	if (!heartbeatMatchesTriggerKind(heartbeat, trigger))
		return "source_mismatch";
	if (trigger.status === "blocked") return "blocked";
	if (trigger.status === "disabled") return "disabled";
	if (trigger.trigger.runMode !== "new_trace") return "unsupported_run_mode";
	if (!trigger.enabledBy.length || trigger.status === "planned")
		return "not_enabled";
	if (hasActiveRun(trigger)) {
		if (trigger.trigger.concurrency === "skip_if_active")
			return "active_skip_if_active";
		if (trigger.trigger.concurrency === "replace")
			return "replace_requires_host_policy";
	}
	return undefined;
}

function heartbeatMatchesTriggerKind(
	heartbeat: QueuedRuntimeHeartbeat,
	trigger: TriggerView,
): boolean {
	if (
		["manual", "immediate", "retry"].includes(heartbeat.intent) ||
		["manual", "retry"].includes(heartbeat.source)
	)
		return true;
	if (trigger.trigger.kind === "schedule") {
		return heartbeat.source === "schedule" || heartbeat.intent === "scheduled";
	}
	if (trigger.trigger.kind === "trigger") {
		return (
			["hook", "webhook", "worker", "other"].includes(heartbeat.source) ||
			heartbeat.intent === "event"
		);
	}
	if (trigger.trigger.kind === "hook") {
		return (
			["hook", "webhook"].includes(heartbeat.source) ||
			heartbeat.intent === "event"
		);
	}
	if (trigger.trigger.kind === "manual") {
		return heartbeat.source === "session-open";
	}
	return false;
}

function hasActiveRun(trigger: TriggerView): boolean {
	return trigger.runs.some((run) => !run.closed);
}

function hasRun(trigger: TriggerView, runKey: string): boolean {
	return trigger.runs.some((run) => run.runKey === runKey);
}

function heartbeatRunKey(
	input: RuntimeTriggerRunPlanInput,
	trigger: TriggerView,
	heartbeat: QueuedRuntimeHeartbeat,
	index: number,
): string {
	return (
		text(heartbeat.data?.runKey) ||
		text(input.runKeyFactory?.({ trigger, heartbeat, index }))
	);
}

function runTraceId(
	input: RuntimeTriggerRunPlanInput,
	trigger: TriggerView,
	heartbeat: QueuedRuntimeHeartbeat,
	runKey: string,
	index: number,
): string {
	return (
		text(heartbeat.data?.traceId) ||
		text(input.traceIdFactory?.({ trigger, heartbeat, runKey, index })) ||
		defaultTraceId(trigger, runKey)
	);
}

function runStart(input: {
	trigger: TriggerView;
	heartbeat: QueuedRuntimeHeartbeat;
	traceId: string;
	runKey: string;
	createdAt?: string;
}): RuntimeTriggerRunStart {
	const title = runTitle(input.trigger, input.runKey);
	const sourceRef = text(input.heartbeat.data?.sourceRef);
	const refs = unique([
		input.trigger.traceId,
		input.trigger.id,
		input.trigger.planningRef,
		input.runKey,
		...input.trigger.refs,
		...input.heartbeat.refs,
	]);
	const head = createTriggerRunTraceHead({
		traceId: input.traceId,
		title,
		triggerTraceId: input.trigger.traceId,
		triggerId: input.trigger.id,
		planningRef: input.trigger.planningRef,
		runKey: input.runKey,
		...(input.createdAt ? { createdAt: input.createdAt } : {}),
		...(sourceRef ? { sourceRef } : {}),
		refs,
	});
	return {
		traceId: input.traceId,
		title,
		triggerId: input.trigger.id,
		triggerTraceId: input.trigger.traceId,
		planningRef: input.trigger.planningRef,
		runKey: input.runKey,
		heartbeatKey: input.heartbeat.key,
		heartbeatIntent: input.heartbeat.intent,
		refs,
		head,
	};
}

function skipWithoutTrigger(
	heartbeat: QueuedRuntimeHeartbeat,
): RuntimeTriggerRunSkip {
	const reason =
		heartbeat.triggerId || heartbeat.traceId
			? "no_matching_trigger"
			: "no_trigger_target";
	return {
		heartbeatKey: heartbeat.key,
		heartbeatIntent: heartbeat.intent,
		reason,
		message: skipMessage(reason),
		refs: [...heartbeat.refs],
		...(heartbeat.triggerId ? { triggerId: heartbeat.triggerId } : {}),
		...(heartbeat.traceId ? { traceId: heartbeat.traceId } : {}),
	};
}

function skipTrigger(
	heartbeat: QueuedRuntimeHeartbeat,
	trigger: TriggerView,
	reason: RuntimeTriggerRunSkipReason,
): RuntimeTriggerRunSkip {
	return {
		heartbeatKey: heartbeat.key,
		heartbeatIntent: heartbeat.intent,
		reason,
		message: skipMessage(reason),
		triggerId: trigger.id,
		traceId: trigger.traceId,
		refs: unique([
			trigger.traceId,
			trigger.id,
			trigger.planningRef,
			...heartbeat.refs,
		]),
	};
}

function skipMessage(reason: RuntimeTriggerRunSkipReason): string {
	return {
		no_trigger_target: "Heartbeat does not target an trigger or trigger trace.",
		no_matching_trigger: "Heartbeat target has no matching trigger.",
		source_mismatch: "Heartbeat source does not match trigger kind.",
		not_enabled: "Trigger is not implementation-enabled.",
		blocked: "Trigger is blocked.",
		disabled: "Trigger is disabled.",
		unsupported_run_mode: "Trigger run mode is not supported by coordinator.",
		active_skip_if_active:
			"Trigger already has an active run and concurrency skips active work.",
		replace_requires_host_policy:
			"Trigger replacement requires host policy before starting a new run.",
		missing_run_key: "Heartbeat does not provide a run key.",
		duplicate_run: "Run key already exists for this trigger.",
		duplicate_plan: "Run start already exists in this coordinator plan.",
		invalid_trace_id: "Run trace id is invalid.",
	}[reason];
}

function triggerRunKey(trigger: TriggerView, runKey: string): string {
	return [trigger.traceId, trigger.id, trigger.planningRef, runKey].join("\0");
}

function runTitle(trigger: TriggerView, runKey: string): string {
	return `Trigger ${trigger.id}: ${runKey}`;
}

function defaultTraceId(trigger: TriggerView, runKey: string): string {
	const slug = `${trigger.id}-${runKey}`
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 96);
	return `TRACE-${slug || "trigger-run"}`;
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
