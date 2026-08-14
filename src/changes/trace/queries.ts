import type { TraceEvent, TraceRecord } from "./types.ts";

export function eventsForLoop(
	records: TraceRecord[],
	loop: TraceEvent["loop"],
): TraceEvent[] {
	return records.filter(
		(record): record is TraceEvent =>
			record.type === "trace_event" && record.loop === loop,
	);
}

export function eventsByName(
	records: TraceRecord[],
	eventName: string,
): TraceEvent[] {
	return records.filter(
		(record): record is TraceEvent =>
			record.type === "trace_event" && record.event === eventName,
	);
}

export function loopOutputEvents(
	records: TraceRecord[],
	loop: TraceEvent["loop"],
): TraceEvent[] {
	return eventsForLoop(records, loop).filter(
		(event) => objectRecord(event.data).output !== undefined,
	);
}

export function lastEventForLoop(
	records: TraceRecord[],
	loop: TraceEvent["loop"],
): TraceEvent | undefined {
	return eventsForLoop(records, loop).at(-1);
}

export function traceRefs(records: TraceRecord[]): string[] {
	return unique(
		records.flatMap((record) => {
			if (record.type === "trace_head") return record.origin?.refs || [];
			if (record.type === "trace_event" || record.type === "trace_close") {
				return record.refs;
			}
			return checkpointRefs(record);
		}),
	);
}

export function traceHasEvent(
	records: TraceRecord[],
	eventName: string,
): boolean {
	return eventsByName(records, eventName).length > 0;
}

function checkpointRefs(record: TraceRecord): string[] {
	if (record.type !== "tail_checkpoint") return [];
	return stringList(record.data?.refs);
}

function objectRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => String(item || "").trim()).filter(Boolean)
		: [];
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
