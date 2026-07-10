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
		const changes = objectList(output.approvedChanges);
		return changes.flatMap((change) => directDecisionProjection(record, change));
	});
}

export function directImplementationDecisionRefs(
	records: Array<TraceRecord | TraceEvent>,
): string[] {
	return directImplementationDecisionsFromRecords(records).map(
		(change) => change.ref,
	);
}

function directDecisionProjection(
	event: TraceEvent,
	change: Record<string, unknown>,
): DirectImplementationDecisionProjection[] {
	const routeTarget = text(change.routeTarget).toLowerCase().replace(/_/g, "-");
	if (routeTarget !== "implementation") return [];
	const id = text(change.id);
	if (!id) return [];
	const scope = objectRecord(change.directImplementationScope);
	const ref = `trace:${event.id}#change:${id}`;
	const pathScopes = unique([
		...stringList(scope.pathScopes),
		...stringList(change.targetRefs),
	]);
	const acceptanceCriteria = normalizedAcceptanceCriteria(change, scope);
	return [
		{
			id,
			ref,
			title: text(change.summary) || id,
			traceId: event.traceId,
			sourceEventId: event.id,
			decisionRefs: [ref],
			componentRefs: unique(stringList(scope.componentRefs)),
			pathScopes,
			verification: unique(stringList(scope.verification)),
			acceptance: unique([
				...stringList(scope.acceptance),
				...acceptanceCriteria.map((criterion) => criterion.text),
				text(change.successSignal),
				text(change.expectedBehavior),
				text(change.desiredOutcome),
				text(change.desiredState),
			]),
			acceptanceCriteria,
			implementationMode: text(change.implementationMode) || undefined,
			routeRationale: text(change.routeRationale),
		},
	];
}

function normalizedAcceptanceCriteria(
	change: Record<string, unknown>,
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
		text(change.successSignal) ||
		text(change.expectedBehavior) ||
		text(change.desiredOutcome) ||
		text(change.desiredState);
	return fallbackText ? [{ id: `AC-${text(change.id)}`, text: fallbackText }] : [];
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
