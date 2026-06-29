import type { TraceEvent, TraceRecord } from "../traces/types.ts";

export interface DirectImplementationDecisionProjection {
	id: string;
	ref: string;
	title: string;
	traceId: string;
	sourceEventId: string;
	decisionRefs: string[];
	componentRefs: string[];
	pathScopes: string[];
	verification: string[];
	acceptance: string[];
	acceptanceCriteria: Array<{ id: string; text: string }>;
	implementationMode?: string;
	routeRationale: string;
}

export function directImplementationDecisionsFromRecords(
	records: Array<TraceRecord | TraceEvent>,
): DirectImplementationDecisionProjection[] {
	return records.flatMap((record) => {
		if (!isTraceEvent(record) || record.loop !== "decision") return [];
		if (!isExitedIteration(record)) return [];
		const output = objectRecord(record.data?.output);
		const rows = objectList(output.approvedRows);
		return rows.flatMap((row) => directDecisionProjection(record, row));
	});
}

export function directImplementationDecisionRefs(
	records: Array<TraceRecord | TraceEvent>,
): string[] {
	return directImplementationDecisionsFromRecords(records).map(
		(row) => row.ref,
	);
}

function directDecisionProjection(
	event: TraceEvent,
	row: Record<string, unknown>,
): DirectImplementationDecisionProjection[] {
	const routeTarget = text(row.routeTarget).toLowerCase().replace(/_/g, "-");
	if (routeTarget !== "implementation") return [];
	const id = text(row.id);
	if (!id) return [];
	const scope = objectRecord(row.directImplementationScope);
	const ref = `trace:${event.id}#row:${id}`;
	const pathScopes = unique([
		...stringList(scope.pathScopes),
		...stringList(row.targetRefs),
	]);
	const acceptanceCriteria = normalizedAcceptanceCriteria(row, scope);
	return [
		{
			id,
			ref,
			title: text(row.summary) || id,
			traceId: event.traceId,
			sourceEventId: event.id,
			decisionRefs: [ref],
			componentRefs: unique(stringList(scope.componentRefs)),
			pathScopes,
			verification: unique(stringList(scope.verification)),
			acceptance: unique([
				...stringList(scope.acceptance),
				...acceptanceCriteria.map((criterion) => criterion.text),
				text(row.successSignal),
				text(row.expectedBehavior),
				text(row.desiredOutcome),
				text(row.desiredState),
			]),
			acceptanceCriteria,
			implementationMode: text(row.implementationMode) || undefined,
			routeRationale: text(row.routeRationale),
		},
	];
}

function normalizedAcceptanceCriteria(
	row: Record<string, unknown>,
	scope: Record<string, unknown>,
): Array<{ id: string; text: string }> {
	const criteria = objectList(scope.acceptanceCriteria)
		.map((criterion, index) => ({
			id: text(criterion.id) || `AC-DIRECT-${index + 1}`,
			text: text(criterion.text),
		}))
		.filter((criterion) => criterion.text);
	if (criteria.length) return criteria;
	const fallbackText =
		text(row.successSignal) ||
		text(row.expectedBehavior) ||
		text(row.desiredOutcome) ||
		text(row.desiredState);
	return fallbackText ? [{ id: `AC-${text(row.id)}`, text: fallbackText }] : [];
}

function isTraceEvent(record: TraceRecord | TraceEvent): record is TraceEvent {
	return record.type === "trace_event";
}

function isExitedIteration(event: TraceEvent): boolean {
	return objectRecord(event.data?.exit).status === "exit";
}

function objectRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function objectList(value: unknown): Array<Record<string, unknown>> {
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
	return Array.from(new Set(values.filter(Boolean)));
}
