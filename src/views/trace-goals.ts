import { foldProjectTraceRecords } from "../traces/project.ts";
import { loopOutputEvents } from "../traces/queries.ts";
import { replayTrace } from "../traces/replay.ts";
import type { TraceEvent, TraceRecord } from "../traces/types.ts";
import { blockersFromTrace } from "./blockers.ts";
import {
	loopIterationQualityComplete,
	planningIterationClaimable,
} from "./quality.ts";
import type {
	TraceBoardConflict,
	TraceBoardView,
	TraceGoalResolutionStatus,
	TraceGoalView,
	TraceViewInput,
} from "./types.ts";

const RESOLVED_RESOLUTION_KINDS = new Set([
	"already-implemented",
	"knowledge-only",
	"non-executable",
]);
const DEFERRED_RESOLUTION_KINDS = new Set(["deferred"]);

interface DecisionProjection {
	id: string;
	ref: string;
	title: string;
	sourceRefs: string[];
}

interface WorkProjection {
	id: string;
	ref: string;
	decisionRefs: string[];
	pathScopes: string[];
	implemented: boolean;
}

interface ResolutionProjection {
	decisionRef: string;
	kind: string;
	workUnitIds: string[];
	evidenceRefs: string[];
	owner?: string;
	trigger?: string;
	rationale?: string;
}

export function buildTraceGoalView(input: TraceViewInput): TraceGoalView {
	return traceGoalViewFromRecords(input.records, input.generatedAt);
}

export function buildTraceBoardView(input: TraceViewInput): TraceBoardView {
	const fold = foldProjectTraceRecords(input.records);
	const traces = fold.traceIds.map((traceId) =>
		traceGoalViewFromRecords(
			fold.recordsByTrace[traceId] || [],
			input.generatedAt,
		),
	);
	return {
		generatedAt: input.generatedAt,
		traceIds: fold.traceIds,
		summary: traceBoardSummary(traces),
		traces,
		conflicts: traceBoardConflicts(traces),
	};
}

export function traceGoalReadyForClose(records: TraceRecord[]): boolean {
	return traceGoalViewFromRecords(records).closable;
}

export function traceGoalCloseBlockers(records: TraceRecord[]): string[] {
	const goal = traceGoalViewFromRecords(records);
	if (goal.closable) return [];
	return goal.blockers.length > 0
		? goal.blockers
		: [`Trace ${goal.traceId} goal status is ${goal.status}.`];
}

function traceGoalViewFromRecords(
	records: TraceRecord[],
	generatedAt?: string,
): TraceGoalView {
	const state = replayTrace(records);
	const decisions = decisionRows(records);
	const workUnits = workUnitsFromTrace(records);
	const resolutions = resolutionsFromTrace(records);
	const decisionRefs = decisions.map((decision) => decision.ref);
	const decisionCoverage = decisionCoverageByRef(workUnits, resolutions);
	const unresolvedDecisionRefs = decisionRefs.filter(
		(decisionRef) => !decisionCoverage.has(decisionRef),
	);
	const deferredDecisionRefs = decisionRefs.filter((decisionRef) =>
		resolutionStatuses(resolutions, decisionRef).includes("deferred"),
	);
	const incompleteWorkUnitRefs = workUnits
		.filter((workUnit) => !workUnit.implemented)
		.map((workUnit) => workUnit.ref);
	const pathScopes = unique(
		workUnits.flatMap((workUnit) => workUnit.pathScopes),
	);
	const activeBlockers = blockersFromTrace(records).filter(
		(blocker) => blocker.kind !== "deferred",
	);
	const baseStatus = traceGoalStatus({
		decisionRefs,
		unresolvedDecisionRefs,
		incompleteWorkUnitRefs,
		deferredDecisionRefs,
		activeBlockers: activeBlockers.map((blocker) => blocker.message),
	});
	const status = state.closed
		? baseStatus === "finished" || baseStatus === "deferred"
			? "closed_complete"
			: "closed_incomplete"
		: baseStatus;
	const blockers = unique([
		...activeBlockers.map((blocker) => blocker.message),
		...unresolvedDecisionRefs.map(
			(decisionRef) => `Decision ${decisionRef} needs planning coverage.`,
		),
		...incompleteWorkUnitRefs.map(
			(workUnitRef) =>
				`Work unit ${workUnitRef} needs implementation evidence.`,
		),
	]);
	return {
		generatedAt,
		traceId: state.head.traceId,
		title: state.head.title,
		...(state.head.origin ? { origin: state.head.origin } : {}),
		status,
		closable:
			!state.closed && (baseStatus === "finished" || baseStatus === "deferred"),
		closed: state.closed,
		...(state.close
			? {
					closedAt: state.close.createdAt,
					closeReason: state.close.reason,
				}
			: {}),
		decisionRefs,
		plannedDecisionRefs: unique([...decisionCoverage.keys()]),
		unresolvedDecisionRefs,
		deferredDecisionRefs,
		workUnitRefs: workUnits.map((workUnit) => workUnit.ref),
		incompleteWorkUnitRefs,
		pathScopes,
		blockers,
		lastEventId: state.lastRecordId,
	};
}

function traceGoalStatus(input: {
	decisionRefs: string[];
	unresolvedDecisionRefs: string[];
	incompleteWorkUnitRefs: string[];
	deferredDecisionRefs: string[];
	activeBlockers: string[];
}): TraceGoalResolutionStatus {
	if (input.activeBlockers.length > 0) return "blocked";
	if (input.decisionRefs.length === 0) return "needs_decision";
	if (input.unresolvedDecisionRefs.length > 0) return "needs_planning";
	if (input.incompleteWorkUnitRefs.length > 0) return "needs_implementation";
	if (input.deferredDecisionRefs.length > 0) return "deferred";
	return "finished";
}

function decisionRows(records: TraceRecord[]): DecisionProjection[] {
	return loopOutputEvents(records, "decision")
		.filter(loopIterationQualityComplete)
		.flatMap((event) =>
			objectList(objectRecord(event.data?.output).approvedRows).map((row) => {
				const id = text(row.id) || event.id;
				return {
					id,
					ref: iterationSubref(event, "row", id),
					title: text(row.desiredState) || text(row.question) || id,
					sourceRefs: unique([
						...stringList(row.currentStateRefs),
						...stringList(row.sourceRefs),
						...stringList(row.targetRefs),
						...event.refs,
					]),
				};
			}),
		);
}

function workUnitsFromTrace(records: TraceRecord[]): WorkProjection[] {
	const implementationRefs = implementedPlanningRefs(records);
	return loopOutputEvents(records, "planning")
		.filter(planningIterationClaimable)
		.flatMap((event) =>
			objectList(objectRecord(event.data?.output).workItems).map((item) => {
				const id = text(item.id) || event.id;
				const ref = iterationSubref(event, "work", id);
				return {
					id,
					ref,
					decisionRefs: stringList(item.decisionRefs),
					pathScopes: stringList(item.pathScopes),
					implemented: implementationRefs.has(ref),
				};
			}),
		);
}

function resolutionsFromTrace(records: TraceRecord[]): ResolutionProjection[] {
	return loopOutputEvents(records, "planning")
		.filter(planningIterationClaimable)
		.flatMap((event) =>
			objectList(objectRecord(event.data?.output).resolutions).map(
				(resolution) => ({
					decisionRef: text(resolution.decisionRef),
					kind: text(resolution.kind),
					workUnitIds: stringList(resolution.workUnitIds),
					evidenceRefs: stringList(resolution.evidenceRefs),
					...(text(resolution.owner) ? { owner: text(resolution.owner) } : {}),
					...(text(resolution.trigger)
						? { trigger: text(resolution.trigger) }
						: {}),
					...(text(resolution.rationale)
						? { rationale: text(resolution.rationale) }
						: {}),
				}),
			),
		);
}

function decisionCoverageByRef(
	workUnits: WorkProjection[],
	resolutions: ResolutionProjection[],
): Map<string, string[]> {
	const coverage = new Map<string, string[]>();
	for (const workUnit of workUnits) {
		for (const decisionRef of workUnit.decisionRefs) {
			coverage.set(decisionRef, [
				...(coverage.get(decisionRef) || []),
				workUnit.ref,
			]);
		}
	}
	for (const resolution of resolutions) {
		if (!resolution.decisionRef) continue;
		if (resolution.kind === "route-back") continue;
		if (
			DEFERRED_RESOLUTION_KINDS.has(resolution.kind) ||
			RESOLVED_RESOLUTION_KINDS.has(resolution.kind)
		) {
			coverage.set(resolution.decisionRef, [
				...(coverage.get(resolution.decisionRef) || []),
				resolution.kind,
			]);
		}
	}
	return coverage;
}

function resolutionStatuses(
	resolutions: ResolutionProjection[],
	decisionRef: string,
): string[] {
	return resolutions
		.filter((resolution) => resolution.decisionRef === decisionRef)
		.map((resolution) => resolution.kind);
}

function implementedPlanningRefs(records: TraceRecord[]): Set<string> {
	const refs = new Set<string>();
	for (const event of loopOutputEvents(records, "implementation")) {
		if (!loopIterationQualityComplete(event)) continue;
		for (const change of objectList(objectRecord(event.data?.output).changes)) {
			for (const planningRef of stringList(change.planningRefs)) {
				refs.add(planningRef);
			}
		}
	}
	return refs;
}

function traceBoardSummary(traces: TraceGoalView[]): TraceBoardView["summary"] {
	return {
		needs_decision: countStatus(traces, "needs_decision"),
		needs_planning: countStatus(traces, "needs_planning"),
		needs_implementation: countStatus(traces, "needs_implementation"),
		blocked: countStatus(traces, "blocked"),
		deferred: countStatus(traces, "deferred"),
		finished: countStatus(traces, "finished"),
		closed_complete: countStatus(traces, "closed_complete"),
		closed_incomplete: countStatus(traces, "closed_incomplete"),
	};
}

function traceBoardConflicts(traces: TraceGoalView[]): TraceBoardConflict[] {
	const active = traces.filter(
		(trace) => !trace.closed && trace.status !== "deferred",
	);
	const conflicts: TraceBoardConflict[] = [];
	for (let leftIndex = 0; leftIndex < active.length; leftIndex += 1) {
		for (
			let rightIndex = leftIndex + 1;
			rightIndex < active.length;
			rightIndex += 1
		) {
			const left = active[leftIndex];
			const right = active[rightIndex];
			for (const pathScope of overlappingPathScopes(
				left?.pathScopes || [],
				right?.pathScopes || [],
			)) {
				conflicts.push({
					leftTraceId: left?.traceId || "",
					rightTraceId: right?.traceId || "",
					pathScope,
					message: `Active traces ${left?.traceId} and ${right?.traceId} overlap on ${pathScope}.`,
				});
			}
		}
	}
	return conflicts;
}

function overlappingPathScopes(left: string[], right: string[]): string[] {
	const overlaps: string[] = [];
	for (const leftScope of left) {
		for (const rightScope of right) {
			const overlap = overlappingScope(leftScope, rightScope);
			if (overlap) overlaps.push(overlap);
		}
	}
	return unique(overlaps);
}

function overlappingScope(left: string, right: string): string | undefined {
	const leftPath = normalizePathScope(left);
	const rightPath = normalizePathScope(right);
	if (!leftPath || !rightPath) return undefined;
	if (leftPath === rightPath) return leftPath;
	if (rightPath.startsWith(`${leftPath}/`)) return leftPath;
	if (leftPath.startsWith(`${rightPath}/`)) return rightPath;
	return undefined;
}

function normalizePathScope(pathScope: string): string {
	return pathScope.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

function countStatus(
	traces: TraceGoalView[],
	status: TraceGoalView["status"],
): number {
	return traces.filter((trace) => trace.status === status).length;
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
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
