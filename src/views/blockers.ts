import { loopOutputEvents } from "../traces/queries.ts";
import type { TraceEvent, TraceRecord } from "../traces/types.ts";
import type { BlockerView, BlockersView, TraceViewInput } from "./types.ts";
import { conflictsFromTrace } from "./conflicts.ts";
import { qualityBlockersFromTrace } from "./quality.ts";

const BLOCKING_RESOLUTION_KINDS = new Set(["deferred", "route-back"]);

export function buildBlockersView(blockers: BlockerView[]): BlockersView;
export function buildBlockersView(input: TraceViewInput): BlockersView;
export function buildBlockersView(
	input: TraceViewInput | BlockerView[],
): BlockersView {
	if (Array.isArray(input)) return { blockers: input.map(normalizeBlocker) };
	return {
		generatedAt: input.generatedAt,
		traceId: input.records[0]?.traceId,
		blockers: blockersFromTrace(input.records),
	};
}

export function blockersFromTrace(records: TraceRecord[]): BlockerView[] {
	return [
		...resolutionBlockers(records),
		...iterationBlockers(records),
		...qualityBlockersFromTrace(records),
		...conflictBlockers(records),
	];
}

function resolutionBlockers(records: TraceRecord[]): BlockerView[] {
	return loopOutputEvents(records, "planning").flatMap((event) =>
		objectList(objectRecord(event.data?.output).resolutions).flatMap(
			(resolution) => {
				const kind = text(resolution.kind);
				if (!BLOCKING_RESOLUTION_KINDS.has(kind)) return [];
				return [
					resolutionBlocker({
						event,
						kind,
						changeRef: text(resolution.changeRef) || event.id,
						owner: text(resolution.owner),
						trigger: text(resolution.trigger),
						rationale: text(resolution.rationale),
						refs: stringList(resolution.evidenceRefs),
					}),
				];
			},
		),
	);
}

function resolutionBlocker(input: {
	event: TraceEvent;
	kind: string;
	changeRef: string;
	owner?: string;
	trigger?: string;
	rationale?: string;
	refs?: string[];
}): BlockerView {
	const owner =
		input.owner || text(input.event.data?.owner) || input.changeRef;
	const trigger = input.trigger || text(input.event.data?.trigger);
	const rationale = input.rationale || text(input.event.data?.rationale);
	const refs = unique([
		input.event.id,
		...input.event.refs,
		...(input.refs || []),
	]);
	return {
		id: `${input.event.id}:${input.kind}:${input.changeRef}`,
		ownerRef: owner,
		routeBack: trigger || rationale || input.changeRef,
		kind: input.kind === "route-back" ? "route-back" : "deferred",
		message:
			rationale ||
			trigger ||
			`Planning decision ${input.changeRef} is ${input.kind}.`,
		traceRefs: refs,
		sourceEventId: input.event.id,
	};
}

function iterationBlockers(records: TraceRecord[]): BlockerView[] {
	return records.flatMap((record) => {
		if (record.type !== "trace_event" || !record.loop) {
			return [];
		}
		if (supersededByLaterLoopIteration(record, records)) {
			return [];
		}
		const exit = objectRecord(record.data?.exit);
		const status = text(exit.status);
		if (status === "exit") return [];
		const conditions = objectList(exit.conditions).filter(
			(condition) => text(condition.status) !== "met",
		);
		const message =
			text(exit.nextAction) ||
			text(conditions[0]?.message) ||
			`${record.loop} iteration status: ${status || "continue"}.`;
		const conditionRefs = conditions.flatMap((condition) =>
			stringList(condition.refs),
		);
		return [
			{
				id: record.id,
				ownerRef: record.loop,
				routeBack: text(exit.targetLoop) || message,
				kind: "exit" as const,
				message,
				traceRefs: unique([record.id, ...record.refs, ...conditionRefs]),
				sourceEventId: record.id,
			},
		];
	});
}

function supersededByLaterLoopIteration(
	event: TraceEvent,
	records: TraceRecord[],
): boolean {
	return records.some(
		(record) =>
			record.type === "trace_event" &&
			record.traceId === event.traceId &&
			record.loop === event.loop &&
			record.sequence > event.sequence,
	);
}

function conflictBlockers(records: TraceRecord[]): BlockerView[] {
	return conflictsFromTrace(records).map((conflict) => ({
		id: `conflict:${conflict.leftRef}:${conflict.rightRef}:${conflict.pathScope}`,
		ownerRef: conflict.leftRef,
		routeBack: conflict.rightRef,
		kind: "conflict" as const,
		message: `Path conflict on ${conflict.pathScope} between ${conflict.leftRef} and ${conflict.rightRef}.`,
		traceRefs: conflict.traceRefs,
	}));
}

function normalizeBlocker(blocker: BlockerView): BlockerView {
	return {
		id: blocker.id,
		ownerRef: blocker.ownerRef,
		routeBack: blocker.routeBack,
		kind: blocker.kind,
		message: blocker.message,
		traceRefs: [...(blocker.traceRefs || [])],
		...(blocker.sourceEventId ? { sourceEventId: blocker.sourceEventId } : {}),
	};
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
