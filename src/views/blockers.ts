import { eventsByName } from "../traces/queries.ts";
import type { TraceEvent, TraceRecord } from "../traces/types.ts";
import type { BlockerView, BlockersView, TraceViewInput } from "./types.ts";
import { conflictsFromTrace } from "./conflicts.ts";

const BLOCKING_RESOLUTION_KINDS = new Set(["deferred", "route-back"]);

export function buildBlockersView(blockers: BlockerView[]): BlockersView;
export function buildBlockersView(input: TraceViewInput): BlockersView;
export function buildBlockersView(input: TraceViewInput | BlockerView[]): BlockersView {
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
		...gateBlockers(records),
		...conflictBlockers(records),
	];
}

function resolutionBlockers(records: TraceRecord[]): BlockerView[] {
	return eventsByName(records, "planning.decision.resolved").flatMap((event) => {
		const kind = text(event.data?.kind);
		if (!BLOCKING_RESOLUTION_KINDS.has(kind)) return [];
		const decisionRef = text(event.data?.decisionRef) || event.refs[0] || event.id;
		const owner = text(event.data?.owner) || decisionRef;
		const trigger = text(event.data?.trigger);
		const rationale = text(event.data?.rationale);
		return [{
			id: event.id,
			ownerRef: owner,
			routeBack: trigger || rationale || decisionRef,
			kind: kind === "route-back" ? "route-back" : "deferred",
			message: rationale || trigger || `Planning decision ${decisionRef} is ${kind}.`,
			traceRefs: unique([event.id, ...event.refs]),
			sourceEventId: event.id,
		}];
	});
}

function gateBlockers(records: TraceRecord[]): BlockerView[] {
	return records.flatMap((record) => {
		if (record.type !== "trace_event" || !isGateBlockEvent(record)) return [];
		const message = text(record.data?.message) || text(record.data?.summary) || record.event;
		return [{
			id: record.id,
			ownerRef: text(record.data?.owner) || record.loop,
			routeBack: text(record.data?.routeBack) || message,
			kind: "gate" as const,
			message,
			traceRefs: unique([record.id, ...record.refs]),
			sourceEventId: record.id,
		}];
	});
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

function isGateBlockEvent(event: TraceEvent): boolean {
	return event.event.endsWith(".gate.blocked") || event.event.endsWith(".gate.failed");
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

function text(value: unknown): string {
	return String(value || "").trim();
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
