import type { PlanningTrigger } from "../planning/types.ts";
import { foldProjectTraceRecords } from "../traces/project.ts";
import { loopOutputEvents } from "../traces/queries.ts";
import { replayTrace } from "../traces/replay.ts";
import type { TraceEvent, TraceRecord } from "../traces/types.ts";
import {
	loopIterationQualityComplete,
	loopQualityReadiness,
} from "./quality.ts";
import { buildTraceGoalView } from "./trace-goals.ts";
import type {
	TriggerDueView,
	TriggerRunView,
	TriggerStatus,
	TriggerView,
	TriggersView,
	TraceViewInput,
} from "./types.ts";

interface TriggerProjection {
	traceId: string;
	traceTitle?: string;
	workUnitId: string;
	planningRef: string;
	decisionRefs: string[];
	pathScopes: string[];
	trigger: PlanningTrigger;
	qualityBlockers: string[];
	sourceEventId: string;
}

interface TriggerEnablement {
	refs: string[];
	enabledAt?: string;
}

export function buildTriggersView(input: TraceViewInput): TriggersView {
	const fold = foldProjectTraceRecords(input.records);
	const projections = Object.values(fold.recordsByTrace).flatMap((records) =>
		triggerProjections(records),
	);
	const runs = Object.values(fold.recordsByTrace).flatMap((records) =>
		triggerRuns(records),
	);
	const enablementByPlanningRef = enablementByPlanningRefFrom(input.records);
	const triggers = projections.map((projection) => {
		const enablement = enablementByPlanningRef.get(projection.planningRef) || {
			refs: [],
		};
		const triggerRuns = runs.filter((run) =>
			runMatchesProjection(run, projection),
		);
		return triggerView(projection, enablement, triggerRuns, input.generatedAt);
	});
	return {
		generatedAt: input.generatedAt,
		traceIds: fold.traceIds,
		summary: triggerSummary(triggers),
		triggers: triggers.sort(compareTriggers),
	};
}

function triggerProjections(records: TraceRecord[]): TriggerProjection[] {
	const state = replayTrace(records);
	return loopOutputEvents(records, "planning").flatMap((event) => {
		const readiness = loopQualityReadiness(event);
		return objectList(objectRecord(event.data?.output).workItems).flatMap(
			(item) => {
				const trigger = triggerSpec(item.trigger);
				if (!trigger) return [];
				const workUnitId = text(item.id) || event.id;
				return [
					{
						traceId: event.traceId,
						traceTitle: state.head.title,
						workUnitId,
						planningRef: iterationSubref(event, "work", workUnitId),
						decisionRefs: stringList(item.decisionRefs),
						pathScopes: stringList(item.pathScopes),
						trigger,
						qualityBlockers: readiness.ready ? [] : readiness.blockers,
						sourceEventId: event.id,
					},
				];
			},
		);
	});
}

function triggerRuns(records: TraceRecord[]): TriggerRunView[] {
	const state = replayTrace(records);
	const origin = state.head.origin;
	if (origin?.kind !== "trigger_run") return [];
	const goal = buildTraceGoalView({ records });
	return [
		{
			traceId: state.head.traceId,
			title: state.head.title,
			status: goal.status,
			closed: state.closed,
			...(state.close ? { closedAt: state.close.createdAt } : {}),
			triggerTraceId: origin.triggerTraceId || origin.parentTraceId || "",
			triggerId: origin.triggerId || "",
			planningRef: origin.planningRef || "",
			runKey: origin.runKey || "",
			refs: unique(origin.refs),
		},
	];
}

function enablementByPlanningRefFrom(
	records: TraceRecord[],
): Map<string, TriggerEnablement> {
	const enablement = new Map<string, TriggerEnablement>();
	for (const event of loopOutputEvents(records, "implementation").filter(
		loopIterationQualityComplete,
	)) {
		for (const change of objectList(objectRecord(event.data?.output).changes)) {
			const changeRef = iterationSubref(event, "change", text(change.id));
			for (const planningRef of stringList(change.planningRefs)) {
				const previous = enablement.get(planningRef) || { refs: [] };
				enablement.set(planningRef, {
					refs: unique([...previous.refs, changeRef, ...event.refs]),
					enabledAt: earlierIso(previous.enabledAt, event.createdAt),
				});
			}
		}
	}
	return enablement;
}

function triggerView(
	projection: TriggerProjection,
	enablement: TriggerEnablement,
	runs: TriggerRunView[],
	generatedAt?: string,
): TriggerView {
	const due = triggerDue(projection, enablement, runs, generatedAt);
	const status = triggerStatus({
		trigger: projection.trigger,
		qualityBlockers: projection.qualityBlockers,
		enabledBy: enablement.refs,
		runs,
		due,
	});
	return {
		id: projection.trigger.id,
		status,
		traceId: projection.traceId,
		...(projection.traceTitle ? { traceTitle: projection.traceTitle } : {}),
		workUnitId: projection.workUnitId,
		planningRef: projection.planningRef,
		decisionRefs: [...projection.decisionRefs],
		pathScopes: [...projection.pathScopes],
		trigger: projection.trigger,
		enabledBy: enablement.refs,
		...(enablement.enabledAt ? { enabledAt: enablement.enabledAt } : {}),
		...(due ? { due } : {}),
		runs,
		qualityBlockers: [...projection.qualityBlockers],
		refs: unique([
			projection.traceId,
			projection.planningRef,
			...projection.decisionRefs,
			...projection.pathScopes,
			...projection.trigger.refs,
			...enablement.refs,
			...runs.flatMap((run) => run.refs),
		]),
		sourceEventId: projection.sourceEventId,
	};
}

function triggerStatus(input: {
	trigger: PlanningTrigger;
	qualityBlockers: string[];
	enabledBy: string[];
	runs: TriggerRunView[];
	due?: TriggerDueView;
}): TriggerStatus {
	if (input.qualityBlockers.length > 0) return "blocked";
	if (
		input.runs.some((run) =>
			["blocked", "closed_incomplete"].includes(run.status),
		)
	) {
		return "blocked";
	}
	if (input.runs.some((run) => !run.closed)) return "active";
	if (input.enabledBy.length === 0) return "planned";
	if (input.due?.status === "due") return "due";
	if (
		input.trigger.kind !== "schedule" &&
		input.runs.some((run) => run.status === "closed_complete")
	) {
		return "completed";
	}
	return "enabled";
}

function triggerDue(
	projection: TriggerProjection,
	enablement: TriggerEnablement,
	runs: TriggerRunView[],
	generatedAt?: string,
): TriggerDueView | undefined {
	if (projection.trigger.kind !== "schedule") return undefined;
	if (enablement.refs.length === 0) {
		return { status: "not_due", reason: "not_enabled" };
	}
	if (!generatedAt) {
		return { status: "not_due", reason: "missing_generated_at" };
	}
	const dueAt = latestCronSlot(projection.trigger.trigger, generatedAt);
	if (!dueAt.ok) {
		return { status: "invalid", reason: dueAt.reason };
	}
	if (enablement.enabledAt && dueAt.iso < enablement.enabledAt) {
		return {
			status: "not_due",
			reason: "before_enabled",
			scheduledAt: dueAt.iso,
		};
	}
	const runKey = renderRunKeyTemplate(
		projection.trigger.runKeyTemplate,
		projection.trigger.id,
		dueAt.date,
	);
	if (!runKey) {
		return {
			status: "invalid",
			reason: "invalid_run_key_template",
			scheduledAt: dueAt.iso,
		};
	}
	const traceId = defaultRunTraceId(projection.trigger.id, runKey);
	if (runs.some((run) => run.runKey === runKey)) {
		return {
			status: "not_due",
			reason: "run_exists",
			scheduledAt: dueAt.iso,
			runKey,
			traceId,
		};
	}
	return {
		status: "due",
		reason: "scheduled_run_missing",
		scheduledAt: dueAt.iso,
		runKey,
		traceId,
	};
}

function runMatchesProjection(
	run: TriggerRunView,
	projection: TriggerProjection,
): boolean {
	return (
		run.triggerId === projection.trigger.id &&
		(!run.triggerTraceId || run.triggerTraceId === projection.traceId) &&
		(!run.planningRef || run.planningRef === projection.planningRef)
	);
}

function triggerSummary(
	triggers: TriggerView[],
): Record<TriggerStatus, number> {
	return {
		planned: countStatus(triggers, "planned"),
		enabled: countStatus(triggers, "enabled"),
		due: countStatus(triggers, "due"),
		active: countStatus(triggers, "active"),
		completed: countStatus(triggers, "completed"),
		blocked: countStatus(triggers, "blocked"),
		disabled: countStatus(triggers, "disabled"),
	};
}

function countStatus(triggers: TriggerView[], status: TriggerStatus): number {
	return triggers.filter((trigger) => trigger.status === status).length;
}

function compareTriggers(left: TriggerView, right: TriggerView): number {
	return (
		left.traceId.localeCompare(right.traceId) || left.id.localeCompare(right.id)
	);
}

function triggerSpec(value: unknown): PlanningTrigger | undefined {
	const record = objectRecord(value);
	const id = text(record.id);
	const kind = text(record.kind);
	const runMode = text(record.runMode);
	const concurrency = text(record.concurrency);
	const runKeyTemplate = text(record.runKeyTemplate);
	const owner = text(record.owner);
	const trigger = text(record.trigger);
	const refs = stringList(record.refs);
	if (
		![id, kind, runMode, concurrency, runKeyTemplate, owner, trigger].some(
			Boolean,
		) &&
		refs.length === 0
	) {
		return undefined;
	}
	return {
		id,
		kind,
		runMode,
		concurrency,
		runKeyTemplate,
		owner,
		trigger,
		refs,
	};
}

function iterationSubref(event: TraceEvent, kind: string, id: string): string {
	return `trace:${event.id}#${kind}:${id || event.id}`;
}

function objectRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function objectList(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is Record<string, unknown> =>
					typeof item === "object" && item !== null,
			)
		: [];
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => text(item)).filter(Boolean)
		: [];
}

function earlierIso(
	left: string | undefined,
	right: string | undefined,
): string | undefined {
	if (!left) return right;
	if (!right) return left;
	return right < left ? right : left;
}

function latestCronSlot(
	trigger: string,
	generatedAt: string,
): { ok: true; date: Date; iso: string } | { ok: false; reason: string } {
	const cron = parseCron(trigger);
	if (!cron.ok) return cron;
	const now = new Date(generatedAt);
	if (Number.isNaN(now.getTime())) {
		return { ok: false, reason: "invalid_generated_at" };
	}
	const candidate = new Date(now);
	candidate.setUTCSeconds(0, 0);
	for (let checked = 0; checked <= 60 * 24 * 370; checked += 1) {
		if (cronMatches(candidate, cron)) {
			return {
				ok: true,
				date: candidate,
				iso: minuteIso(candidate),
			};
		}
		candidate.setUTCMinutes(candidate.getUTCMinutes() - 1);
	}
	return { ok: false, reason: "no_due_slot_within_370_days" };
}

function parseCron(trigger: string):
	| {
			ok: true;
			minutes: Set<number> | undefined;
			hours: Set<number> | undefined;
			days: Set<number> | undefined;
			months: Set<number> | undefined;
			weekdays: Set<number> | undefined;
	  }
	| { ok: false; reason: string } {
	if (!trigger.startsWith("cron:")) {
		return { ok: false, reason: "unsupported_schedule" };
	}
	const parts = trigger.slice("cron:".length).trim().split(/\s+/);
	if (parts.length !== 5) return { ok: false, reason: "invalid_cron" };
	const [minute, hour, day, month, weekday] = parts;
	const minutes = parseCronField(minute, 0, 59, "minute");
	const hours = parseCronField(hour, 0, 23, "hour");
	const days = parseCronField(day, 1, 31, "day");
	const months = parseCronField(month, 1, 12, "month");
	const weekdays = parseCronField(weekday, 0, 7, "weekday");
	if (!minutes.ok) return { ok: false, reason: minutes.reason };
	if (!hours.ok) return { ok: false, reason: hours.reason };
	if (!days.ok) return { ok: false, reason: days.reason };
	if (!months.ok) return { ok: false, reason: months.reason };
	if (!weekdays.ok) return { ok: false, reason: weekdays.reason };
	return {
		ok: true,
		minutes: minutes.values,
		hours: hours.values,
		days: days.values,
		months: months.values,
		weekdays: normalizeWeekdays(weekdays.values),
	};
}

function parseCronField(
	field: string,
	min: number,
	max: number,
	name: string,
):
	| { ok: true; values: Set<number> | undefined }
	| { ok: false; reason: string } {
	if (field === "*") return { ok: true, values: undefined };
	const values = new Set<number>();
	for (const part of field.split(",")) {
		const value = Number(part);
		if (!Number.isInteger(value) || value < min || value > max) {
			return { ok: false, reason: `invalid_cron_${name}` };
		}
		values.add(value);
	}
	return { ok: true, values };
}

function normalizeWeekdays(
	values: Set<number> | undefined,
): Set<number> | undefined {
	if (!values) return undefined;
	return new Set([...values].map((value) => (value === 7 ? 0 : value)));
}

function cronMatches(
	date: Date,
	cron: Extract<ReturnType<typeof parseCron>, { ok: true }>,
): boolean {
	return (
		fieldMatches(cron.minutes, date.getUTCMinutes()) &&
		fieldMatches(cron.hours, date.getUTCHours()) &&
		fieldMatches(cron.days, date.getUTCDate()) &&
		fieldMatches(cron.months, date.getUTCMonth() + 1) &&
		fieldMatches(cron.weekdays, date.getUTCDay())
	);
}

function fieldMatches(values: Set<number> | undefined, value: number): boolean {
	return !values || values.has(value);
}

function renderRunKeyTemplate(
	template: string,
	triggerId: string,
	date: Date,
): string {
	return template
		.replace(/\$\{triggerId\}/g, triggerId)
		.replace(/\$\{date\}/g, dateIso(date))
		.replace(/\$\{week\}/g, isoWeekKey(date))
		.replace(/\$\{hour\}/g, hourIso(date))
		.replace(/\$\{datetime\}/g, minuteIso(date))
		.trim();
}

function defaultRunTraceId(triggerId: string, runKey: string): string {
	const slug = `${triggerId}-${runKey}`
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 96);
	return `TRACE-${slug || "trigger-run"}`;
}

function minuteIso(date: Date): string {
	return date.toISOString().slice(0, 16) + "Z";
}

function hourIso(date: Date): string {
	return date.toISOString().slice(0, 13) + "Z";
}

function dateIso(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function isoWeekKey(date: Date): string {
	const working = new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
	const day = working.getUTCDay() || 7;
	working.setUTCDate(working.getUTCDate() + 4 - day);
	const yearStart = new Date(Date.UTC(working.getUTCFullYear(), 0, 1));
	const week = Math.ceil(
		((working.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
	);
	return `${working.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
