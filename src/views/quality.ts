import { decisionQualityStandards } from "../decision/quality-standards.ts";
import { implementationQualityStandards } from "../implementation/quality-standards.ts";
import { planningQualityStandards } from "../planning/quality-standards.ts";
import { eventsByName } from "../traces/queries.ts";
import type {
	LoopQualityStandardResult,
	TraceEvent,
	TraceLoop,
	TraceRecord,
} from "../traces/types.ts";
import type {
	BlockerView,
	LoopQualitySummary,
	QualityIterationSummary,
	QualityStandardSummary,
	QualityView,
	TraceViewInput,
} from "./types.ts";

const REQUIRED_QUALITY_STANDARDS: Record<TraceLoop, QualityStandardSummary[]> =
	{
		decision: normalizeStandards(decisionQualityStandards([], [])),
		planning: normalizeStandards(planningQualityStandards([])),
		implementation: normalizeStandards(implementationQualityStandards([])),
	};

export interface LoopQualityReadiness {
	loop: TraceLoop;
	traceId: string;
	eventId: string;
	exitStatus: string;
	ready: boolean;
	standards: QualityStandardSummary[];
	blockers: string[];
	refs: string[];
	sourceEventId: string;
}

export function buildQualityView(input: TraceViewInput): QualityView {
	const iterations = qualityIterationsFromTrace(input.records);
	return {
		generatedAt: input.generatedAt,
		traceId: input.records[0]?.traceId,
		summary: qualitySummary(iterations),
		iterations,
		blockers: unique(iterations.flatMap((iteration) => iteration.blockers)),
	};
}

export function qualityIterationsFromTrace(
	records: TraceRecord[],
): QualityIterationSummary[] {
	return loopIterationEvents(records).map((event) => {
		const readiness = loopQualityReadiness(event);
		return {
			loop: readiness.loop,
			traceId: readiness.traceId,
			eventId: readiness.eventId,
			exitStatus: readiness.exitStatus,
			ready: readiness.ready,
			standards: readiness.standards,
			blockers: readiness.blockers,
			refs: readiness.refs,
			sourceEventId: readiness.sourceEventId,
		};
	});
}

export function loopIterationQualityComplete(event: TraceEvent): boolean {
	return (
		text(objectRecord(event.data?.exit).status) === "exit" &&
		loopQualityReadiness(event).ready
	);
}

export function planningIterationDispatchable(event: TraceEvent): boolean {
	return event.loop === "planning" && loopIterationQualityComplete(event);
}

export function loopQualityReadiness(event: TraceEvent): LoopQualityReadiness {
	const provided = qualityStandardsFromEvent(event);
	const byId = new Map(provided.map((standard) => [standard.id, standard]));
	const required = REQUIRED_QUALITY_STANDARDS[event.loop].map(
		(requiredStandard) => {
			const standard = byId.get(requiredStandard.id);
			if (!standard) {
				return {
					id: requiredStandard.id,
					status: "missing" as const,
					mode: requiredStandard.mode,
					description: requiredStandard.description,
					message: `${event.loop} quality standard ${requiredStandard.id} is missing.`,
					refs: [event.id],
				};
			}
			return standard;
		},
	);
	const requiredIds = new Set(required.map((standard) => standard.id));
	const extras = provided.filter((standard) => !requiredIds.has(standard.id));
	const standards = [...required, ...extras];
	const unmet = standards.filter((standard) => standard.status !== "met");
	return {
		loop: event.loop,
		traceId: event.traceId,
		eventId: event.id,
		exitStatus: text(objectRecord(event.data?.exit).status),
		ready: unmet.length === 0,
		standards,
		blockers: unmet.map((standard) => standardBlockerMessage(event, standard)),
		refs: unique([
			event.id,
			...event.refs,
			...unmet.flatMap((standard) => standard.refs),
		]),
		sourceEventId: event.id,
	};
}

export function qualityBlockersFromTrace(
	records: TraceRecord[],
): BlockerView[] {
	return loopIterationEvents(records).flatMap((event) => {
		const readiness = loopQualityReadiness(event);
		if (readiness.ready) return [];
		return [
			{
				id: `${event.id}:quality`,
				ownerRef: event.loop,
				routeBack: event.loop,
				kind: "exit" as const,
				message: readiness.blockers.join(" "),
				traceRefs: readiness.refs,
				sourceEventId: event.id,
			},
		];
	});
}

function loopIterationEvents(records: TraceRecord[]): TraceEvent[] {
	return [
		...eventsByName(records, "decision.iteration"),
		...eventsByName(records, "planning.iteration"),
		...eventsByName(records, "implementation.iteration"),
	].sort((left, right) => left.sequence - right.sequence);
}

function qualitySummary(
	iterations: QualityIterationSummary[],
): Record<TraceLoop, LoopQualitySummary> {
	return {
		decision: loopQualitySummary(iterations, "decision"),
		planning: loopQualitySummary(iterations, "planning"),
		implementation: loopQualitySummary(iterations, "implementation"),
	};
}

function loopQualitySummary(
	iterations: QualityIterationSummary[],
	loop: TraceLoop,
): LoopQualitySummary {
	const standards = iterations
		.filter((iteration) => iteration.loop === loop)
		.flatMap((iteration) => iteration.standards);
	return {
		total: standards.length,
		met: standards.filter((standard) => standard.status === "met").length,
		unmet: standards.filter((standard) => standard.status === "unmet").length,
		blocked: standards.filter((standard) => standard.status === "blocked")
			.length,
		missing: standards.filter((standard) => standard.status === "missing")
			.length,
	};
}

function qualityStandardsFromEvent(
	event: TraceEvent,
): QualityStandardSummary[] {
	return objectList(objectRecord(event.data?.output).qualityStandards).map(
		(standard) => qualityStandardSummary(standard),
	);
}

function normalizeStandards(
	standards: LoopQualityStandardResult[],
): QualityStandardSummary[] {
	return standards.map((standard) => qualityStandardSummary(standard));
}

function qualityStandardSummary(
	standard: Record<string, unknown> | LoopQualityStandardResult,
): QualityStandardSummary {
	const evidenceRefs = stringList(standard.evidenceRefs);
	return {
		id: text(standard.id),
		status: qualityStatus(standard.status),
		mode: qualityMode(standard.mode),
		description: text(standard.description),
		...(text(standard.message) ? { message: text(standard.message) } : {}),
		refs: stringList(standard.refs),
		...(evidenceRefs.length > 0 ? { evidenceRefs } : {}),
	};
}

function standardBlockerMessage(
	event: TraceEvent,
	standard: QualityStandardSummary,
): string {
	return (
		standard.message ||
		`${event.loop} quality standard ${standard.id} is ${standard.status}.`
	);
}

function qualityStatus(value: unknown): QualityStandardSummary["status"] {
	const status = text(value);
	if (status === "met" || status === "unmet" || status === "blocked") {
		return status;
	}
	return "missing";
}

function qualityMode(value: unknown): QualityStandardSummary["mode"] {
	const mode = text(value);
	if (mode === "deterministic" || mode === "agent" || mode === "user") {
		return mode;
	}
	return "deterministic";
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

function text(value: unknown): string {
	return String(value || "").trim();
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
