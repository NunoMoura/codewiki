import type { PlanningTrigger } from "../planning/types.ts";
import { foldProjectTraceRecords } from "../traces/project.ts";
import { loopOutputEvents } from "../traces/queries.ts";
import type { TraceEvent, TraceRecord } from "../traces/types.ts";
import { blockersFromTrace } from "./blockers.ts";
import { loopQualityReadiness, planningIterationClaimable } from "./quality.ts";
import type {
	BlockerView,
	TraceViewInput,
	WorkQueueItem,
	WorkQueueItemStatus,
	WorkQueueView,
} from "./types.ts";

export function buildWorkQueueView(input: TraceViewInput): WorkQueueView {
	const fold = foldProjectTraceRecords(input.records);
	const openTraces = Object.entries(fold.recordsByTrace).filter(
		([, records]) => !traceIsClosed(records),
	);
	const openRecords = openTraces.flatMap(([, records]) => records);
	const blockers = blockersFromTrace(openRecords).filter(
		(blocker) => blocker.kind !== "conflict",
	);
	const decisions = decisionQueueItems(openRecords, blockers);
	const workUnits = workUnitQueueItems(
		openRecords,
		blockers,
		input.generatedAt,
	);
	const items = [...decisions, ...workUnits].sort(compareQueueItems);
	return {
		generatedAt: input.generatedAt,
		traceIds: openTraces.map(([traceId]) => traceId),
		summary: workQueueSummary(items),
		items,
	};
}

interface DecisionProjection {
	id: string;
	traceId: string;
	title: string;
	traceRefs: string[];
	sourceEventId: string;
}

interface WorkUnitProjection {
	id: string;
	traceId: string;
	title: string;
	traceRefs: string[];
	decisionRefs: string[];
	planningRefs: string[];
	componentRefs: string[];
	pathScopes: string[];
	dependsOn: string[];
	trigger?: PlanningTrigger;
	qualityStandards: WorkQueueItem["qualityStandards"];
	qualityBlockers: string[];
	sourceEventId: string;
}

function decisionQueueItems(
	records: TraceRecord[],
	blockers: BlockerView[],
): WorkQueueItem[] {
	const planningCoverage = plannedDecisionRefs(records);
	return approvedDecisionRows(records).flatMap((decision) => {
		const itemBlockers = blockersForRefs(blockers, decision.traceRefs);
		if (
			planningCoverage.has(decision.sourceEventId) &&
			itemBlockers.length === 0
		) {
			return [];
		}
		return [
			{
				id: decision.id,
				kind: "decision" as const,
				status: itemBlockers.length > 0 ? "blocked" : "backlog",
				traceId: decision.traceId,
				title: decision.title,
				traceRefs: decision.traceRefs,
				decisionRefs: [decision.sourceEventId],
				planningRefs: [],
				componentRefs: [],
				pathScopes: [],
				dependsOn: [],
				blockers: itemBlockers.map((blocker) => blocker.message),
				qualityStandards: [],
				qualityBlockers: [],
				sourceEventId: decision.sourceEventId,
			},
		];
	});
}

function workUnitQueueItems(
	records: TraceRecord[],
	blockers: BlockerView[],
	generatedAt?: string,
): WorkQueueItem[] {
	const implementationRefs = implementationRefsByPlanningRef(records);
	const doneWorkUnitIds = new Set<string>();
	const workUnits = planningWorkUnits(records);
	for (const item of workUnits) {
		if (hasImplementedPlanningRef(item, implementationRefs)) {
			doneWorkUnitIds.add(item.id);
		}
	}
	const runtimeClaims = runtimeClaimsByRef(records, generatedAt);
	return workUnits.map((item) => {
		const itemBlockers = blockersForRefs(blockers, item.traceRefs);
		const claim = firstClaimForRefs(runtimeClaims, item.traceRefs);
		const implemented = item.planningRefs.some((ref) =>
			implementationRefs.has(ref),
		);
		const status = workUnitStatus({
			item,
			itemBlockers,
			claim,
			implemented,
			doneWorkUnitIds,
		});
		return {
			id: item.id,
			kind: "work-unit" as const,
			status,
			traceId: item.traceId,
			title: item.title,
			traceRefs: item.traceRefs,
			decisionRefs: item.decisionRefs,
			planningRefs: item.planningRefs,
			componentRefs: item.componentRefs,
			pathScopes: item.pathScopes,
			dependsOn: item.dependsOn,
			...(item.trigger ? { trigger: item.trigger } : {}),
			blockers: unique(itemBlockers.map((blocker) => blocker.message)),
			qualityStandards: item.qualityStandards,
			qualityBlockers: item.qualityBlockers,
			...(claim ? { claimedBy: claim.claimedBy } : {}),
			...(claim?.expiresAt ? { claimExpiresAt: claim.expiresAt } : {}),
			sourceEventId: item.sourceEventId,
		};
	});
}

function traceIsClosed(records: TraceRecord[]): boolean {
	return records.some((record) => record.type === "trace_close");
}

function hasImplementedPlanningRef(
	item: WorkUnitProjection,
	implementationRefs: Map<string, string[]>,
): boolean {
	for (const ref of item.planningRefs) {
		if (implementationRefs.has(ref)) return true;
	}
	return false;
}

function workUnitStatus(input: {
	item: WorkUnitProjection;
	itemBlockers: BlockerView[];
	claim?: RuntimeClaim;
	implemented: boolean;
	doneWorkUnitIds: Set<string>;
}): WorkQueueItemStatus {
	if (input.implemented) return "done";
	if (input.itemBlockers.length > 0 || input.item.qualityBlockers.length > 0)
		return "blocked";
	if (input.claim) return "claimed";
	if (
		input.item.dependsOn.some(
			(dependency) => !input.doneWorkUnitIds.has(dependency),
		)
	) {
		return "waiting";
	}
	return "ready";
}

function plannedDecisionRefs(records: TraceRecord[]): Set<string> {
	return new Set(
		loopOutputEvents(records, "planning")
			.filter(planningIterationClaimable)
			.flatMap((event) => [
				...objectList(objectRecord(event.data?.output).workItems).flatMap(
					(item) => stringList(item.decisionRefs),
				),
				...objectList(objectRecord(event.data?.output).resolutions).map(
					(resolution) => text(resolution.decisionRef),
				),
			]),
	);
}

function implementationRefsByPlanningRef(
	records: TraceRecord[],
): Map<string, string[]> {
	const refs = new Map<string, string[]>();
	for (const event of loopOutputEvents(records, "implementation")) {
		for (const change of objectList(objectRecord(event.data?.output).changes)) {
			const changeRef = iterationSubref(event, "change", text(change.id));
			for (const planningRef of stringList(change.planningRefs)) {
				refs.set(
					planningRef,
					unique([...(refs.get(planningRef) || []), changeRef, ...event.refs]),
				);
			}
		}
	}
	return refs;
}

interface RuntimeClaim {
	claimedBy: string;
	claimId: string;
	eventId: string;
	refs: string[];
	expiresAt?: string;
	createdAt: string;
}

interface RuntimeClaimRelease {
	claimId?: string;
	workUnitId?: string;
	parentId: string | null;
	refs: string[];
	createdAt: string;
}

function runtimeClaimsByRef(
	records: TraceRecord[],
	generatedAt?: string,
): RuntimeClaim[] {
	const events = records.filter(
		(record): record is TraceEvent =>
			record.type === "trace_event" && record.event.startsWith("runtime."),
	);
	const releases = events.filter(isRuntimeReleaseEvent).map(runtimeRelease);
	return events
		.filter(isRuntimeClaimEvent)
		.map(runtimeClaim)
		.filter((claim) => !claimExpired(claim, generatedAt))
		.filter((claim) => !claimReleased(claim, releases));
}

function runtimeClaim(event: TraceEvent): RuntimeClaim {
	const claimId = text(event.data?.claimId) || event.id;
	return {
		claimedBy:
			text(event.data?.workerId) ||
			text(event.data?.worker) ||
			claimId ||
			event.id,
		claimId,
		eventId: event.id,
		refs: unique([...event.refs, event.id]),
		...(text(event.data?.expiresAt)
			? { expiresAt: text(event.data?.expiresAt) }
			: {}),
		createdAt: event.createdAt,
	};
}

function runtimeRelease(event: TraceEvent): RuntimeClaimRelease {
	return {
		parentId: event.parentId,
		...(text(event.data?.claimId)
			? { claimId: text(event.data?.claimId) }
			: {}),
		...(text(event.data?.workUnitId)
			? { workUnitId: text(event.data?.workUnitId) }
			: {}),
		refs: unique([...event.refs, event.id]),
		createdAt: event.createdAt,
	};
}

function isRuntimeClaimEvent(event: TraceEvent): boolean {
	return event.event === "runtime.work_unit.claimed";
}

function isRuntimeReleaseEvent(event: TraceEvent): boolean {
	return [
		"runtime.work_unit.claim.released",
		"runtime.work_unit.claim.expired",
		"runtime.work_unit.claim.cancelled",
	].includes(event.event);
}

function claimExpired(claim: RuntimeClaim, generatedAt?: string): boolean {
	if (!claim.expiresAt || !generatedAt) return false;
	return Date.parse(claim.expiresAt) <= Date.parse(generatedAt);
}

function claimReleased(
	claim: RuntimeClaim,
	releases: RuntimeClaimRelease[],
): boolean {
	return releases.some(
		(release) =>
			Date.parse(release.createdAt) >= Date.parse(claim.createdAt) &&
			((release.claimId && release.claimId === claim.claimId) ||
				release.parentId === claim.eventId ||
				release.refs.includes(claim.claimId) ||
				release.refs.includes(claim.eventId)),
	);
}

function firstClaimForRefs(
	claims: RuntimeClaim[],
	refs: string[],
): RuntimeClaim | undefined {
	const refSet = new Set(refs);
	return claims.find((claim) => claim.refs.some((ref) => refSet.has(ref)));
}

function blockersForRefs(
	blockers: BlockerView[],
	refs: string[],
): BlockerView[] {
	const refSet = new Set(refs);
	return blockers.filter((blocker) =>
		blocker.traceRefs.some((ref) => refSet.has(ref)),
	);
}

function approvedDecisionRows(records: TraceRecord[]): DecisionProjection[] {
	return loopOutputEvents(records, "decision").flatMap((event) =>
		objectList(objectRecord(event.data?.output).approvedRows).map((row) => {
			const id = text(row.id) || event.id;
			const sourceEventId = iterationSubref(event, "row", id);
			return {
				id,
				traceId: event.traceId,
				title: text(row.desiredState) || text(row.question) || id,
				traceRefs: unique([sourceEventId, event.id, ...event.refs]),
				sourceEventId,
			};
		}),
	);
}

function planningWorkUnits(records: TraceRecord[]): WorkUnitProjection[] {
	return loopOutputEvents(records, "planning").flatMap((event) => {
		const quality = loopQualityReadiness(event);
		return objectList(objectRecord(event.data?.output).workItems).map(
			(item) => {
				const id = text(item.id) || event.id;
				const sourceEventId = iterationSubref(event, "work", id);
				const decisionRefs = stringList(item.decisionRefs);
				const pathScopes = stringList(item.pathScopes);
				return {
					id,
					traceId: event.traceId,
					title: text(item.title) || id,
					traceRefs: unique([
						sourceEventId,
						event.id,
						id,
						...decisionRefs,
						...pathScopes,
					]),
					decisionRefs,
					planningRefs: [sourceEventId],
					componentRefs: stringList(item.componentRefs),
					pathScopes,
					dependsOn: stringList(item.dependsOn),
					...triggerProperty(item.trigger),
					qualityStandards: quality.standards,
					qualityBlockers: quality.blockers,
					sourceEventId,
				};
			},
		);
	});
}

function triggerProperty(value: unknown): {
	trigger?: PlanningTrigger;
} {
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
		return {};
	}
	return {
		trigger: {
			id,
			kind,
			runMode,
			concurrency,
			runKeyTemplate,
			owner,
			trigger,
			refs,
		},
	};
}

function workQueueSummary(
	items: WorkQueueItem[],
): Record<WorkQueueItemStatus, number> {
	return {
		backlog: countStatus(items, "backlog"),
		waiting: countStatus(items, "waiting"),
		ready: countStatus(items, "ready"),
		claimed: countStatus(items, "claimed"),
		blocked: countStatus(items, "blocked"),
		done: countStatus(items, "done"),
	};
}

function countStatus(
	items: WorkQueueItem[],
	status: WorkQueueItemStatus,
): number {
	return items.filter((item) => item.status === status).length;
}

function compareQueueItems(left: WorkQueueItem, right: WorkQueueItem): number {
	const statusOrder: WorkQueueItemStatus[] = [
		"blocked",
		"claimed",
		"ready",
		"waiting",
		"backlog",
		"done",
	];
	return (
		statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status) ||
		left.traceId.localeCompare(right.traceId) ||
		left.id.localeCompare(right.id)
	);
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

function text(value: unknown): string {
	return String(value || "").trim();
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => text(value)).filter(Boolean)),
	);
}
