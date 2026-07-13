import { basename } from "node:path";
import type { WikiStateSnapshot } from "../api/state.ts";
import type { DevLogEntry } from "../runtime/dev-log.ts";
import {
	type WorkerObservation,
	workerObservationFreshness,
} from "../runtime/worker-observation.ts";
import { decisionQualityStandards } from "../decision/quality-standards.ts";
import { implementationQualityStandards } from "../implementation/quality-standards.ts";
import { planningQualityStandards } from "../planning/quality-standards.ts";
import type { TraceEvent, TraceLoop, TraceRecord } from "../traces/types.ts";
import { qualityIterationsFromTrace } from "../views/quality.ts";
import { buildActivityFeed, type ActivityFeedItem } from "./activity-feed.ts";
import {
	projectDevLog,
	type DashboardDevLogProjection,
} from "./dev-log-projection.ts";
import type {
	QualityIterationSummary,
	QualityStandardSummary,
	TraceGoalStatus,
	TraceQueueCard,
	WorkQueueItem,
} from "../views/types.ts";

export type CodewikiSprintTracePhase =
	| "decision"
	| "planning"
	| "implementation"
	| "archive";
export type CodewikiSprintTracePhaseState =
	| "done"
	| "active"
	| "blocked"
	| "todo";
export type CodewikiSprintTraceQualityStatus =
	| "pending"
	| "verifying"
	| "passed"
	| "failed"
	| "skipped";

export interface CodewikiSprintTraceSegment {
	phase: CodewikiSprintTracePhase;
	label: "D" | "P" | "I" | "A";
	state: CodewikiSprintTracePhaseState;
}

export interface CodewikiSprintTraceQualityCheck {
	index: number;
	loop: TraceLoop;
	id: string;
	label: string;
	description: string;
	standardType?: string;
	layer?: string;
	gate?: string;
	score?: number;
	scoreThreshold?: number;
	status: CodewikiSprintTraceQualityStatus;
	message?: string;
	refs: string[];
}

export interface CodewikiSprintTraceQualitySummary {
	total: number;
	passed: number;
	failed: number;
	pending: number;
	verifying: number;
	skipped: number;
}

export interface CodewikiSprintTraceWorker {
	workUnitId: string;
	traceId: string;
	status: "active" | "selected" | "held";
	title: string;
	pathScopes: string[];
	reason?: string;
}

export interface CodewikiWorkerAttempt {
	attemptId: string;
	workUnitId: string;
	workerId: string;
	title: string;
	status: "running" | "stale" | "blocked" | "failed" | "completed" | "released";
	phase?: WorkerObservation["phase"];
	freshness?: "live" | "stale" | "expired";
	observedAt?: string;
	leaseExpiresAt?: string;
	progress?: WorkerObservation["progress"];
	pathScopes: string[];
	planningRefs: string[];
}

export interface CodewikiImplementationReview {
	status: "waiting" | "collecting" | "blocked" | "validating" | "passed";
	resultsCollected: number;
	totalTasks: number;
	conflictCount: number;
	acceptanceStatus: "waiting" | "partial" | "ready";
}

export interface CodewikiSprintTraceItem {
	id: string;
	kind: string;
	status: string;
	title: string;
	pathScopes: string[];
	blockers: string[];
}

export interface CodewikiSprintTraceActivity {
	kind: TraceLoop | "trace" | "archive";
	label: string;
	detail: string;
	createdAt?: string;
}

export type CodewikiSprintTraceLoopState =
	| "active"
	| "locked"
	| "blocked"
	| "skipped"
	| "pending";

export interface CodewikiSprintTraceFeedItem {
	id: string;
	createdAt?: string;
	label: string;
	summary: string;
	details: string[];
	feedback: string[];
}

export interface CodewikiSprintTraceLoopReport {
	summary: string;
	bullets: string[];
	checks: string[];
	metrics: string[];
}

export interface CodewikiSprintTraceLoopSection {
	loop: TraceLoop;
	state: CodewikiSprintTraceLoopState;
	statusLabel: string;
	iterationCount: number;
	profileLabel: string;
	summary: string;
	feed: CodewikiSprintTraceFeedItem[];
	qualityChecks: CodewikiSprintTraceQualityCheck[];
	qualitySummary: CodewikiSprintTraceQualitySummary;
	report: CodewikiSprintTraceLoopReport;
}

export interface CodewikiSprintTraceTouchedFiles {
	kbProduct: string[];
	kbSystem: string[];
	codeEdits: string[];
	tests: string[];
	other: string[];
}

export interface CodewikiSprintTrace {
	traceId: string;
	title: string;
	status: TraceGoalStatus;
	closed: boolean;
	loop: TraceLoop | "archive" | "archived" | "blocked" | "waiting";
	progress: number;
	segments: CodewikiSprintTraceSegment[];
	qualityChecks: CodewikiSprintTraceQualityCheck[];
	qualitySummary: CodewikiSprintTraceQualitySummary;
	primaryQualityChecks: CodewikiSprintTraceQualityCheck[];
	primaryQualitySummary: CodewikiSprintTraceQualitySummary;
	qualityCaption: string;
	loopSections: CodewikiSprintTraceLoopSection[];
	currentAction: string;
	workerCount: number;
	activeWorkCount: number;
	blockerCount: number;
	decisionRefs: string[];
	planningRefs: string[];
	workUnitRefs: string[];
	pathScopes: string[];
	blockers: string[];
	workers: CodewikiSprintTraceWorker[];
	workerAttempts: CodewikiWorkerAttempt[];
	implementationReview: CodewikiImplementationReview;
	items: CodewikiSprintTraceItem[];
	activities: CodewikiSprintTraceActivity[];
	activityFeed: ActivityFeedItem[];
	devLog: DashboardDevLogProjection;
	touchedFiles: CodewikiSprintTraceTouchedFiles;
}

export interface CodewikiDashboardState {
	projectRoot: string;
	projectName: string;
	generatedAt?: string;
	summary: {
		traces: number;
		active: number;
		blocked: number;
		archived: number;
	};
	next: WikiStateSnapshot["next"];
	sprintsQueue: CodewikiSprintTrace[];
}

export interface CodewikiDashboardProjectionContext {
	workerObservations?: WorkerObservation[];
	devLogByTrace?: ReadonlyMap<string, DevLogEntry[]>;
}

export function buildCodewikiDashboardState(
	snapshot: WikiStateSnapshot,
	projectRoot: string,
	records: TraceRecord[] = [],
	context: CodewikiDashboardProjectionContext = {},
): CodewikiDashboardState {
	const cardsByTrace = new Map(
		snapshot.traceQueue.cards.map((trace) => [trace.traceId, trace]),
	);
	const recordsByTrace = traceRecordsByTraceId(records);
	const sprintsQueue = snapshot.traceBoard.traces.map((trace) => {
		const card = cardsByTrace.get(trace.traceId) || traceQueueFallback(trace);
		return buildSprintTrace(
			snapshot,
			card,
			recordsByTrace.get(card.traceId) || [],
			context,
		);
	});
	return {
		projectRoot,
		projectName: projectNameFromRoot(projectRoot),
		generatedAt: snapshot.generatedAt,
		summary: {
			traces: sprintsQueue.length,
			active: sprintsQueue.filter((trace) => isActiveDashboardTrace(trace))
				.length,
			blocked: sprintsQueue.filter((trace) => trace.blockerCount > 0).length,
			archived: sprintsQueue.filter((trace) => trace.closed).length,
		},
		next: snapshot.next,
		sprintsQueue,
	};
}

function buildSprintTrace(
	snapshot: WikiStateSnapshot,
	card: TraceQueueCard,
	records: TraceRecord[],
	context: CodewikiDashboardProjectionContext,
): CodewikiSprintTrace {
	const items = snapshot.workQueue.items.filter(
		(item) => item.traceId === card.traceId,
	);
	const blockers = unique([
		...card.blockers,
		...items.flatMap((item) => [...item.blockers, ...item.qualityBlockers]),
		...snapshot.runtimeBoard.blockers
			.filter((blocker) => blocker.traceId === card.traceId)
			.map((blocker) => blocker.message),
	]);
	const workers = sprintTraceWorkers(snapshot, card.traceId);
	const loop = sprintTraceLoop(card, items, blockers);
	const workerAttempts = buildCodewikiWorkerAttempts(
		records,
		items,
		context.workerObservations?.filter(
			(observation) => observation.traceId === card.traceId,
		) ?? [],
	);
	const loopSections = sprintTraceLoopSections(card, records, loop, blockers);
	const qualityChecks = sprintTraceQualityChecks(card, records, loop, blockers);
	const qualitySummary = sprintTraceQualitySummary(qualityChecks);
	const primaryQualityChecks = primaryQualityChecksForTrace(
		loopSections,
		loop,
		qualityChecks,
	);
	const primaryQualitySummary = sprintTraceQualitySummary(primaryQualityChecks);
	return {
		traceId: card.traceId,
		title: card.title || card.traceId,
		status: card.status,
		closed: card.closed,
		loop,
		progress: sprintTraceProgress(card, items, blockers),
		segments: sprintTraceSegments(card, items, blockers),
		qualityChecks,
		qualitySummary,
		primaryQualityChecks,
		primaryQualitySummary,
		qualityCaption: sprintTraceQualityCaption(
			card,
			loop,
			primaryQualityChecks,
			primaryQualitySummary,
		),
		loopSections,
		currentAction: sprintTraceAction(snapshot, card, loop, blockers),
		workerCount: workers.length,
		activeWorkCount: items.filter((item) => item.status !== "done").length,
		blockerCount: blockers.length,
		decisionRefs: [...card.decisionRefs],
		planningRefs: unique(items.flatMap((item) => item.planningRefs)),
		workUnitRefs: workUnitRefs(card, items),
		pathScopes: unique([
			...card.pathScopes,
			...items.flatMap((item) => item.pathScopes),
			...workers.flatMap((worker) => worker.pathScopes),
		]),
		blockers,
		workers,
		workerAttempts,
		implementationReview: buildCodewikiImplementationReview(
			workerAttempts,
			items,
			blockers,
			card.closed,
		),
		items: items.map(sprintTraceItem),
		activities: sprintTraceActivities(records),
		activityFeed: buildActivityFeed(
			records,
			new Map(items.map((item) => [item.id, item.title])),
		),
		devLog: projectDevLog(context.devLogByTrace?.get(card.traceId)),
		touchedFiles: sprintTraceTouchedFiles(records, items, workers, card),
	};
}

function sprintTraceWorkers(
	snapshot: WikiStateSnapshot,
	traceId: string,
): CodewikiSprintTraceWorker[] {
	return [
		...snapshot.runtimeBoard.activeClaims.map((claim) => ({
			workUnitId: claim.workUnitId,
			traceId: claim.traceId,
			status: "active" as const,
			title: claim.title,
			pathScopes: [...claim.pathScopes],
		})),
		...snapshot.runtimeBoard.selectedClaims.map((claim) => ({
			workUnitId: claim.workUnitId,
			traceId: claim.traceId,
			status: "selected" as const,
			title: claim.title,
			pathScopes: [...claim.pathScopes],
		})),
		...snapshot.runtimeBoard.heldClaims.map((claim) => ({
			workUnitId: claim.workUnitId,
			traceId: claim.traceId,
			status: "held" as const,
			title: claim.title,
			pathScopes: [...claim.pathScopes],
			reason: claim.reason,
		})),
	].filter((worker) => worker.traceId === traceId);
}

export function buildCodewikiWorkerAttempts(
	records: TraceRecord[],
	items: WorkQueueItem[],
	observations: WorkerObservation[],
): CodewikiWorkerAttempt[] {
	const itemById = new Map(items.map((item) => [item.id, item]));
	const attempts = new Map<string, CodewikiWorkerAttempt>();
	for (const record of records) {
		applyWorkerAttemptRecord(record, itemById, attempts);
	}
	for (const observation of observations) {
		applyWorkerObservation(observation, attempts);
	}
	return [...attempts.values()];
}

function applyWorkerAttemptRecord(
	record: TraceRecord,
	itemById: Map<string, WorkQueueItem>,
	attempts: Map<string, CodewikiWorkerAttempt>,
): void {
	if (record.type !== "trace_event") return;
	const data = objectRecord(record.data);
	if (record.event === "runtime.work_unit.claimed") {
		const attemptId = stringValue(data.claimId) || record.id;
		const workUnitId = stringValue(data.workUnitId);
		const workerId = stringValue(data.workerId);
		if (!workUnitId || !workerId) return;
		attempts.set(attemptId, workerAttemptFromClaim(
			attemptId,
			workUnitId,
			workerId,
			data,
			itemById.get(workUnitId),
		));
		return;
	}
	if (record.event !== "runtime.work_unit.claim.released") return;
	const attempt = attempts.get(stringValue(data.claimId));
	if (!attempt) return;
	attempt.status = releasedAttemptStatus(stringValue(data.status));
}

function workerAttemptFromClaim(
	attemptId: string,
	workUnitId: string,
	workerId: string,
	data: Record<string, unknown>,
	item: WorkQueueItem | undefined,
): CodewikiWorkerAttempt {
	return {
		attemptId,
		workUnitId,
		workerId,
		title: item?.title || workUnitId,
		status: "running",
		pathScopes: stringValues(data.pathScopes),
		planningRefs: stringValues(data.planningRefs),
	};
}

function releasedAttemptStatus(
	status: string | undefined,
): CodewikiWorkerAttempt["status"] {
	return status === "completed" || status === "blocked" || status === "failed"
		? status
		: "released";
}

function applyWorkerObservation(
	observation: WorkerObservation,
	attempts: Map<string, CodewikiWorkerAttempt>,
): void {
	const attempt = attempts.get(observation.attemptId);
	if (!attempt || observationIsOlder(attempt, observation)) return;
	const freshness = workerObservationFreshness(observation);
	attempt.phase = observation.phase;
	attempt.freshness = freshness;
	attempt.observedAt = observation.observedAt;
	attempt.leaseExpiresAt = observation.leaseExpiresAt;
	attempt.progress = observation.progress;
	if (attempt.status === "running" && freshness !== "live") attempt.status = "stale";
}

function observationIsOlder(
	attempt: CodewikiWorkerAttempt,
	observation: WorkerObservation,
): boolean {
	return Boolean(
		attempt.observedAt &&
		Date.parse(attempt.observedAt) >= Date.parse(observation.observedAt),
	);
}

export function buildCodewikiImplementationReview(
	attempts: CodewikiWorkerAttempt[],
	items: WorkQueueItem[],
	blockers: string[],
	closed: boolean,
): CodewikiImplementationReview {
	const completedAttempts = new Set(
		attempts
			.filter((attempt) => attempt.status === "completed")
			.map((attempt) => attempt.workUnitId),
	);
	const resultsCollected = Math.min(
		items.length,
		new Set([
			...items.filter((item) => item.status === "done").map((item) => item.id),
			...completedAttempts,
		]).size,
	);
	const conflictCount = blockers.filter((blocker) =>
		/\b(?:conflict|overlap)\b/i.test(blocker),
	).length;
	const status: CodewikiImplementationReview["status"] = closed
		? "passed"
		: blockers.length
			? "blocked"
			: items.length === 0
				? "waiting"
				: resultsCollected < items.length
					? "collecting"
					: "validating";
	return {
		status,
		resultsCollected,
		totalTasks: items.length,
		conflictCount,
		acceptanceStatus:
			resultsCollected === 0
				? "waiting"
				: resultsCollected < items.length
					? "partial"
					: "ready",
	};
}

function stringValues(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function sprintTraceItem(item: WorkQueueItem): CodewikiSprintTraceItem {
	return {
		id: item.id,
		kind: item.kind,
		status: item.status,
		title: item.title,
		pathScopes: [...item.pathScopes],
		blockers: unique([...item.blockers, ...item.qualityBlockers]),
	};
}

function sprintTraceLoopSections(
	card: TraceQueueCard,
	records: TraceRecord[],
	currentLoop: CodewikiSprintTrace["loop"],
	blockers: string[],
): CodewikiSprintTraceLoopSection[] {
	const iterations = qualityIterationsFromTrace(records);
	const events = semanticTraceEvents(records);
	return TRACE_QUALITY_LOOPS.map((loop) => {
		const loopEvents = events.filter((event) => event.loop === loop);
		const loopIterations = iterations.filter(
			(iteration) => iteration.loop === loop,
		);
		const state = loopSectionState({
			card,
			loop,
			currentLoop,
			blockers,
			loopEvents,
			loopIterations,
			events,
		});
		const latestIteration = loopIterations.at(-1);
		const standards = loopSectionStandards(loop, latestIteration, state);
		const qualityChecks = standards.map((standard, index) => ({
			...qualityCheckFromStandard({
				standard,
				loop,
				iterationExists: Boolean(latestIteration),
				closed: state === "locked" || card.closed,
			}),
			index: index + 1,
		}));
		const markedChecks = markLoopSectionCurrentCheck(
			qualityChecks,
			state,
			blockers,
		);
		const qualitySummary = sprintTraceQualitySummary(markedChecks);
		const iterationCount = Math.max(loopIterations.length, loopEvents.length);
		return {
			loop,
			state,
			statusLabel: loopSectionStatusLabel(state),
			iterationCount,
			profileLabel: loopSectionProfileLabel(loop, markedChecks),
			summary: loopSectionSummary(loop, state, latestIteration, qualitySummary),
			feed: loopEvents.map(traceEventFeedItem),
			qualityChecks: markedChecks,
			qualitySummary,
			report: loopSectionReport(
				loop,
				state,
				loopEvents.at(-1),
				latestIteration,
				iterationCount,
				qualitySummary,
			),
		};
	});
}

function primaryQualityChecksForTrace(
	sections: CodewikiSprintTraceLoopSection[],
	loop: CodewikiSprintTrace["loop"],
	fallback: CodewikiSprintTraceQualityCheck[],
): CodewikiSprintTraceQualityCheck[] {
	const current = TRACE_QUALITY_LOOPS.includes(loop as TraceLoop)
		? sections.find((section) => section.loop === loop)
		: undefined;
	const blocked = sections.find((section) => section.state === "blocked");
	const active = sections.find((section) => section.state === "active");
	const latestLocked = [...sections]
		.reverse()
		.find((section) => section.state === "locked");
	const section = blocked || active || current || latestLocked;
	return section?.qualityChecks.length ? section.qualityChecks : fallback;
}

function semanticTraceEvents(records: TraceRecord[]): TraceEvent[] {
	return records
		.filter(
			(record): record is TraceEvent =>
				record.type === "trace_event" && Boolean(record.loop),
		)
		.sort((left, right) => left.sequence - right.sequence);
}

function loopSectionState(input: {
	card: TraceQueueCard;
	loop: TraceLoop;
	currentLoop: CodewikiSprintTrace["loop"];
	blockers: string[];
	loopEvents: TraceEvent[];
	loopIterations: QualityIterationSummary[];
	events: TraceEvent[];
}): CodewikiSprintTraceLoopState {
	if (input.loop === "planning" && planningWasSkipped(input)) return "skipped";
	const latest = input.loopIterations.at(-1);
	if (latest && !latest.ready) return "blocked";
	if (latest?.ready) return "locked";
	if (input.card.closed) return "skipped";
	if (input.currentLoop === input.loop) {
		return input.blockers.length > 0 ? "blocked" : "active";
	}
	return "pending";
}

function planningWasSkipped(input: {
	card: TraceQueueCard;
	loopEvents: TraceEvent[];
	events: TraceEvent[];
}): boolean {
	if (input.loopEvents.length > 0 || input.card.workUnitRefs.length > 0) {
		return false;
	}
	return input.events.some((event) => event.loop === "implementation");
}

function loopSectionStandards(
	loop: TraceLoop,
	latestIteration: QualityIterationSummary | undefined,
	state: CodewikiSprintTraceLoopState,
): QualityStandardSummary[] {
	if (state === "skipped") return [];
	return latestIteration?.standards || REQUIRED_QUALITY_STANDARDS[loop];
}

function markLoopSectionCurrentCheck(
	checks: CodewikiSprintTraceQualityCheck[],
	state: CodewikiSprintTraceLoopState,
	blockers: string[],
): CodewikiSprintTraceQualityCheck[] {
	if (state !== "active" && state !== "blocked") return checks;
	if (checks.some((check) => check.status === "failed")) return checks;
	const target =
		checks.find((check) => check.status === "pending") || checks.at(-1);
	if (!target) return checks;
	return checks.map((check) => {
		if (check !== target) return check;
		return {
			...check,
			status: state === "blocked" ? "failed" : "verifying",
			...(blockers[0] ? { message: blockers[0] } : {}),
		};
	});
}

function loopSectionStatusLabel(state: CodewikiSprintTraceLoopState): string {
	if (state === "locked") return "locked";
	if (state === "blocked") return "blocked";
	if (state === "active") return "running";
	if (state === "skipped") return "skipped";
	return "waiting";
}

function loopSectionProfileLabel(
	loop: TraceLoop,
	checks: CodewikiSprintTraceQualityCheck[],
): string {
	return `${loop} quality profile · ${checks.length} ${plural(checks.length, "standard")}`;
}

function loopSectionSummary(
	loop: TraceLoop,
	state: CodewikiSprintTraceLoopState,
	latestIteration: QualityIterationSummary | undefined,
	summary: CodewikiSprintTraceQualitySummary,
): string {
	if (state === "skipped")
		return `${titleCase(loop)} skipped by pipeline profile.`;
	if (state === "pending")
		return `${titleCase(loop)} waiting for prior loop output.`;
	if (state === "active") {
		return `${titleCase(loop)} running · ${summary.passed}/${summary.total} checks passed.`;
	}
	if (state === "blocked") {
		return `${titleCase(loop)} blocked · ${summary.failed} quality issue(s).`;
	}
	return `${titleCase(loop)} locked · iteration ${latestIteration ? iterationNumber(latestIteration.eventId) : "?"} exited with ${summary.passed}/${summary.total} checks passed.`;
}

function traceEventFeedItem(event: TraceEvent): CodewikiSprintTraceFeedItem {
	const details = traceEventDetails(event);
	return {
		id: event.id,
		createdAt: event.createdAt,
		label: traceEventLabel(event),
		summary: traceEventDetail(event),
		details,
		feedback: traceEventFeedback(event),
	};
}

function traceEventDetails(event: TraceEvent): string[] {
	const output = objectRecord(objectRecord(event.data).output);
	if (event.loop === "decision") {
		return approvedChangeObjects(output)
			.map(decisionChangeSummary)
			.filter(Boolean);
	}
	if (event.loop === "planning") {
		return objectList(output.workItems)
			.map(planningWorkSummary)
			.filter(Boolean);
	}
	if (event.loop === "implementation") {
		return [
			...objectList(output.changes).map(implementationChangeSummary),
			...objectList(output.checkResults).map(checkResultSummary),
		].filter(Boolean);
	}
	return [];
}

function traceEventFeedback(event: TraceEvent): string[] {
	const exit = objectRecord(objectRecord(event.data).exit);
	const diagnostics = objectList(exit.diagnostics).map((diagnostic) =>
		stringValue(diagnostic.message || diagnostic.repair),
	);
	const conditions = objectList(exit.conditions)
		.filter((condition) => stringValue(condition.status) !== "met")
		.map(
			(condition) =>
				stringValue(condition.message) ||
				`${stringValue(condition.id)} is ${stringValue(condition.status)}`,
		);
	return unique([...diagnostics, ...conditions]);
}

function loopSectionReport(
	_loop: TraceLoop,
	state: CodewikiSprintTraceLoopState,
	event: TraceEvent | undefined,
	iteration: QualityIterationSummary | undefined,
	iterationCount: number,
	qualitySummary: CodewikiSprintTraceQualitySummary,
): CodewikiSprintTraceLoopReport {
	if (state === "skipped") {
		return {
			summary: "",
			bullets: [],
			checks: [],
			metrics: loopReportMetrics(undefined, undefined, 0, qualitySummary),
		};
	}
	return {
		summary: "",
		bullets: [],
		checks: [],
		metrics: loopReportMetrics(
			event,
			iteration,
			iterationCount,
			qualitySummary,
		),
	};
}

function loopReportMetrics(
	event: TraceEvent | undefined,
	iteration: QualityIterationSummary | undefined,
	iterationCount: number,
	qualitySummary: CodewikiSprintTraceQualitySummary,
): string[] {
	const data = objectRecord(event?.data);
	const exit = objectRecord(data.exit);
	const runner = objectRecord(exit.qualityRunner);
	const nodes = objectList(runner.nodes);
	const tokenCount = tokenUsageTotal(data);
	const latency = numberValue(runner.latencyMs);
	const qualityCost = nodes.length
		? nodes.reduce((total, node) => total + (numberValue(node.cost) || 0), 0)
		: undefined;
	return [
		`iterations: ${iterationCount}`,
		`quality checks: ${qualityChecksMetric(iteration, qualitySummary, nodes)}`,
		`quality cost: ${qualityCost == null ? "not recorded" : qualityCost}`,
		`latency: ${latency == null ? "not recorded" : `${latency}ms`}`,
		`tokens: ${tokenCount == null ? "not recorded" : tokenCount}`,
	];
}

function qualityChecksMetric(
	iteration: QualityIterationSummary | undefined,
	summary: CodewikiSprintTraceQualitySummary,
	nodes: Record<string, unknown>[],
): string {
	const total = iteration?.standards.length || nodes.length || summary.total;
	if (total === 0) return "0";
	const suffixes = [
		summary.failed ? `${summary.failed} failed` : "",
		summary.verifying ? `${summary.verifying} verifying` : "",
		summary.pending ? `${summary.pending} pending` : "",
	]
		.filter(Boolean)
		.join(" · ");
	return suffixes
		? `${summary.passed}/${total} passed · ${suffixes}`
		: `${summary.passed}/${total} passed`;
}

function tokenUsageTotal(value: unknown): number | undefined {
	const direct = tokenUsageDirect(value);
	if (direct != null) return direct;
	if (Array.isArray(value)) {
		return sumNumbers(value.map(tokenUsageTotal));
	}
	if (value && typeof value === "object") {
		return sumNumbers(Object.values(value).map(tokenUsageTotal));
	}
	return undefined;
}

function tokenUsageDirect(value: unknown): number | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value))
		return undefined;
	const record = value as Record<string, unknown>;
	return firstNumber([
		record.totalTokens,
		record.total_tokens,
		record.tokens,
		record.tokenCount,
		record.token_count,
	]);
}

function sumNumbers(values: (number | undefined)[]): number | undefined {
	let total = 0;
	for (const value of values) total += value || 0;
	return total > 0 ? total : undefined;
}

function firstNumber(values: unknown[]): number | undefined {
	for (const value of values) {
		const number = numberValue(value);
		if (number != null) return number;
	}
	return undefined;
}

function numberValue(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function approvedChangeObjects(
	output: Record<string, unknown>,
): Record<string, unknown>[] {
	return [
		...objectList(output.approvedChanges),
		...objectList(output.approvedRows),
	];
}

function decisionChangeSummary(change: Record<string, unknown>): string {
	const title =
		stringValue(change.question) ||
		stringValue(change.desiredState) ||
		stringValue(change.id);
	const type = stringValue(change.policyProfileId || change.kind);
	const route = stringValue(change.routeTarget || change.nextLoop);
	return [title, type ? `type: ${type}` : "", route ? `route: ${route}` : ""]
		.filter(Boolean)
		.join(" · ");
}

function planningWorkSummary(work: Record<string, unknown>): string {
	const title = stringValue(work.title || work.id);
	const outcome = stringValue(work.outcome);
	return outcome ? `${title} — ${outcome}` : title;
}

function implementationChangeSummary(change: Record<string, unknown>): string {
	const id = stringValue(change.id);
	const summary = stringValue(
		change.summary || change.title || change.rationale,
	);
	return [id, summary].filter(Boolean).join(" — ");
}

function checkResultSummary(check: Record<string, unknown>): string {
	const command = stringValue(check.command);
	const status = stringValue(check.status);
	const summary = stringValue(check.summary);
	return [status ? status.toUpperCase() : "CHECK", command, summary]
		.filter(Boolean)
		.join(" · ");
}

function iterationNumber(eventId: string): string {
	return eventId.match(/iteration:(\d+)/)?.[1] || "?";
}

function sprintTraceTouchedFiles(
	records: TraceRecord[],
	items: WorkQueueItem[],
	workers: CodewikiSprintTraceWorker[],
	card: TraceQueueCard,
): CodewikiSprintTraceTouchedFiles {
	const paths = unique([
		...traceRecordPaths(records),
		...items.flatMap((item) => item.pathScopes),
		...workers.flatMap((worker) => worker.pathScopes),
		...card.pathScopes,
	]);
	return {
		kbProduct: paths.filter((path) => path.startsWith(".codewiki/kb/product/")),
		kbSystem: paths.filter((path) => path.startsWith(".codewiki/kb/system/")),
		codeEdits: paths.filter(isCodeEditPath),
		tests: paths.filter((path) => path.startsWith("tests/")),
		other: paths.filter(isOtherTouchedPath),
	};
}

function traceRecordPaths(records: TraceRecord[]): string[] {
	return unique(records.flatMap((record) => pathsFromUnknown(record)));
}

function pathsFromUnknown(value: unknown): string[] {
	if (typeof value === "string")
		return looksLikeProjectPath(value) ? [value] : [];
	if (Array.isArray(value)) return value.flatMap(pathsFromUnknown);
	if (value && typeof value === "object") {
		return Object.values(value as Record<string, unknown>).flatMap(
			pathsFromUnknown,
		);
	}
	return [];
}

function looksLikeProjectPath(value: string): boolean {
	return (
		/^(src|tests|lab|\.codewiki\/kb)\//.test(value) ||
		["README.md", "package.json", "tsconfig.json"].includes(value)
	);
}

function isCodeEditPath(path: string): boolean {
	return path.startsWith("src/") || path.startsWith("lab/");
}

function isOtherTouchedPath(path: string): boolean {
	return (
		!path.startsWith(".codewiki/kb/product/") &&
		!path.startsWith(".codewiki/kb/system/") &&
		!path.startsWith("tests/") &&
		!isCodeEditPath(path)
	);
}

function sprintTraceActivities(
	records: TraceRecord[],
): CodewikiSprintTraceActivity[] {
	const activities = records
		.map(sprintTraceActivity)
		.filter((activity): activity is CodewikiSprintTraceActivity =>
			Boolean(activity),
		);
	return activities.slice(Math.max(0, activities.length - 8)).reverse();
}

function sprintTraceActivity(
	record: TraceRecord,
): CodewikiSprintTraceActivity | undefined {
	if (record.type === "trace_head") {
		return {
			kind: "trace",
			label: "Trace opened",
			detail: record.title,
			createdAt: record.createdAt,
		};
	}
	if (record.type === "trace_close") {
		return {
			kind: "archive",
			label: "Trace archived",
			detail: record.reason,
			createdAt: record.createdAt,
		};
	}
	if (record.type !== "trace_event") return undefined;
	return traceEventActivity(record);
}

function traceEventActivity(record: TraceEvent): CodewikiSprintTraceActivity {
	const loop = record.loop || "trace";
	return {
		kind: loop,
		label: traceEventLabel(record),
		detail: traceEventDetail(record),
		createdAt: record.createdAt,
	};
}

function traceEventLabel(record: TraceEvent): string {
	if (record.event === "changes_approved") return "Decision recorded";
	if (record.event === "user_input_required")
		return "Decision needs your input";
	if (record.event === "decision_blocked") return "Decision blocked";
	if (record.event === "work_units_created") return "Plan created";
	if (record.event === "decisions_resolved") return "Planning resolved";
	if (record.event === "planning_blocked") return "Planning blocked";
	if (record.event === "evidence_accepted")
		return "Implementation evidence accepted";
	if (record.event === "evidence_rejected")
		return "Implementation needs more evidence";
	if (record.event === "implementation_blocked")
		return "Implementation blocked";
	if (record.event === "route_back_requested") return "Sent back for review";
	return titleCase(record.event);
}

function traceEventDetail(record: TraceEvent): string {
	const data = objectRecord(record.data);
	const output = objectRecord(data.output);
	if (record.loop === "decision") {
		const approved =
			objectList(output.approvedChanges).length ||
			objectList(output.approvedRows).length;
		return approved > 0
			? `${approved} ${plural(approved, "proposed change")} approved`
			: traceEventFallback(data, record.event);
	}
	if (record.loop === "planning") {
		const workItems = objectList(output.workItems).length;
		const resolutions = objectList(output.resolutions).length;
		const parts = [];
		if (workItems > 0) {
			parts.push(`${workItems} ${plural(workItems, "work item")} created`);
		}
		if (resolutions > 0) {
			parts.push(`${resolutions} ${plural(resolutions, "decision")} resolved`);
		}
		return parts.join(" · ") || traceEventFallback(data, record.event);
	}
	if (record.loop === "implementation") {
		const changes = objectList(output.changes).length;
		const reports = objectList(output.reviewEvidenceReports).length;
		const parts = [];
		if (changes > 0) {
			parts.push(
				`${changes} ${plural(changes, "implementation change")} accepted`,
			);
		}
		if (reports > 0) {
			parts.push(`${reports} ${plural(reports, "review report")} attached`);
		}
		return parts.join(" · ") || traceEventFallback(data, record.event);
	}
	return traceEventFallback(data, record.event);
}

function traceEventFallback(
	data: Record<string, unknown>,
	eventName: string,
): string {
	const exit = objectRecord(data.exit);
	const nextAction = stringValue(exit.nextAction);
	if (nextAction) return nextAction;
	const routePlan = objectRecord(exit.routePlan);
	const rationale = stringValue(routePlan.rationale);
	if (rationale) return rationale;
	return titleCase(eventName);
}

function objectRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function objectList(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function plural(count: number, singular: string): string {
	return count === 1 ? singular : `${singular}s`;
}

function titleCase(value: string): string {
	return value
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function sprintTraceLoop(
	card: TraceQueueCard,
	items: WorkQueueItem[],
	blockers: string[],
): CodewikiSprintTrace["loop"] {
	if (card.closed) return "archived";
	if (blockers.length > 0 || card.status === "blocked") return "blocked";
	if (items.some((item) => item.status === "claimed")) return "implementation";
	if (card.nextLoop) return card.nextLoop;
	if (items.some((item) => item.status === "ready")) return "implementation";
	if (items.some((item) => item.status === "waiting")) return "waiting";
	return "decision";
}

function sprintTraceAction(
	snapshot: WikiStateSnapshot,
	card: TraceQueueCard,
	loop: CodewikiSprintTrace["loop"],
	blockers: string[],
): string {
	if (snapshot.next.traceId === card.traceId) return snapshot.next.reason;
	if (blockers.length > 0) return `Resolve ${blockers.length} blocker(s).`;
	if (loop === "decision") return "Review or approve the next decision.";
	if (loop === "planning") return "Plan approved decisions into work units.";
	if (loop === "implementation") return "Run or review implementation work.";
	if (loop === "archive") return "Archive the completed trace.";
	if (loop === "archived") return "Trace archived.";
	return "Waiting for dependencies.";
}

function sprintTraceProgress(
	card: TraceQueueCard,
	items: WorkQueueItem[],
	blockers: string[],
): number {
	if (card.closed) return 100;
	const decision = decisionDone(card)
		? 1
		: card.decisionRefs.length > 0
			? 0.6
			: 0;
	const planning = planningDone(card)
		? 1
		: card.nextLoop === "planning"
			? 0.4
			: 0;
	const implementation = implementationProgress(card, items);
	const archive = card.nextLoop === "archive" ? 0.5 : 0;
	const raw =
		5 + decision * 25 + planning * 25 + implementation * 35 + archive * 10;
	const clamped = Math.max(5, Math.min(95, raw));
	return roundToOne(blockers.length > 0 ? Math.min(clamped, 90) : clamped);
}

function sprintTraceSegments(
	card: TraceQueueCard,
	items: WorkQueueItem[],
	blockers: string[],
): CodewikiSprintTraceSegment[] {
	return [
		segment(
			"decision",
			"D",
			phaseState(card, blockers, "decision", { complete: decisionDone(card) }),
		),
		segment(
			"planning",
			"P",
			phaseState(card, blockers, "planning", { complete: planningDone(card) }),
		),
		segment(
			"implementation",
			"I",
			phaseState(card, blockers, "implementation", {
				complete: implementationDone(card, items),
			}),
		),
		segment(
			"archive",
			"A",
			card.closed ? "done" : card.nextLoop === "archive" ? "active" : "todo",
		),
	];
}

function phaseState(
	card: TraceQueueCard,
	blockers: string[],
	phase: TraceLoop,
	state: { complete: boolean },
): CodewikiSprintTracePhaseState {
	if (state.complete) return "done";
	if (blockers.length > 0 && card.nextLoop === phase) return "blocked";
	if (card.nextLoop === phase) return "active";
	return "todo";
}

function segment(
	phase: CodewikiSprintTracePhase,
	label: CodewikiSprintTraceSegment["label"],
	state: CodewikiSprintTracePhaseState,
): CodewikiSprintTraceSegment {
	return { phase, label, state };
}

function decisionDone(card: TraceQueueCard): boolean {
	return (
		card.decisionRefs.length > 0 && card.unresolvedDecisionRefs.length === 0
	);
}

function planningDone(card: TraceQueueCard): boolean {
	return (
		card.workUnitRefs.length > 0 ||
		card.nextLoop === "implementation" ||
		card.nextLoop === "archive" ||
		card.closed
	);
}

function implementationDone(
	card: TraceQueueCard,
	items: WorkQueueItem[],
): boolean {
	if (card.closed || card.nextLoop === "archive") return true;
	if (items.length === 0) return false;
	return items.every((item) => item.status === "done");
}

function implementationProgress(
	card: TraceQueueCard,
	items: WorkQueueItem[],
): number {
	if (implementationDone(card, items)) return 1;
	if (items.length === 0) return 0;
	const done = items.filter((item) => item.status === "done").length;
	const active = items.filter((item) => item.status === "claimed").length;
	return Math.min(1, (done + active * 0.5) / items.length);
}

const TRACE_QUALITY_LOOPS: TraceLoop[] = [
	"decision",
	"planning",
	"implementation",
];

const REQUIRED_QUALITY_STANDARDS: Record<TraceLoop, QualityStandardSummary[]> =
	{
		decision: decisionQualityStandards([], []).map(requiredQualityStandard),
		planning: planningQualityStandards([]).map(requiredQualityStandard),
		implementation: implementationQualityStandards([]).map(
			requiredQualityStandard,
		),
	};

function sprintTraceQualityChecks(
	card: TraceQueueCard,
	records: TraceRecord[],
	loop: CodewikiSprintTrace["loop"],
	blockers: string[],
): CodewikiSprintTraceQualityCheck[] {
	const latestIterations = latestQualityIterationByLoop(records);
	const checks = TRACE_QUALITY_LOOPS.flatMap((qualityLoop) => {
		const iteration = latestIterations.get(qualityLoop);
		const standards =
			iteration?.standards || REQUIRED_QUALITY_STANDARDS[qualityLoop];
		return standards.map((standard) =>
			qualityCheckFromStandard({
				standard,
				loop: qualityLoop,
				iterationExists: Boolean(iteration),
				closed: card.closed,
			}),
		);
	});
	return markCurrentQualityCheck(checks, loop, blockers, card.closed).map(
		(check, index) => ({ ...check, index: index + 1 }),
	);
}

function qualityCheckFromStandard(input: {
	standard: QualityStandardSummary;
	loop: TraceLoop;
	iterationExists: boolean;
	closed: boolean;
}): CodewikiSprintTraceQualityCheck {
	const status = qualityCheckStatus(
		input.standard,
		input.iterationExists,
		input.closed,
	);
	return {
		index: 0,
		loop: input.loop,
		id: input.standard.id,
		label: qualityStandardLabel(input.standard.id),
		description: input.standard.description,
		standardType:
			input.standard.standardType || input.standard.layer || "other",
		layer: input.standard.layer || "other",
		...(input.standard.gate ? { gate: input.standard.gate } : {}),
		...(input.standard.score !== undefined
			? { score: input.standard.score }
			: {}),
		...(input.standard.scoreThreshold !== undefined
			? { scoreThreshold: input.standard.scoreThreshold }
			: {}),
		status,
		...(input.standard.message ? { message: input.standard.message } : {}),
		refs: [...input.standard.refs, ...(input.standard.evidenceRefs || [])],
	};
}

function qualityCheckStatus(
	standard: QualityStandardSummary,
	iterationExists: boolean,
	closed: boolean,
): CodewikiSprintTraceQualityStatus {
	if (!iterationExists) return closed ? "skipped" : "pending";
	if (standard.status === "met") return "passed";
	if (standard.status === "not_applicable" || standard.status === "escalated") {
		return "skipped";
	}
	return "failed";
}

function markCurrentQualityCheck(
	checks: CodewikiSprintTraceQualityCheck[],
	loop: CodewikiSprintTrace["loop"],
	blockers: string[],
	closed: boolean,
): CodewikiSprintTraceQualityCheck[] {
	if (closed) return checks;
	if (checks.some((check) => check.status === "failed")) return checks;
	const currentLoop = TRACE_QUALITY_LOOPS.includes(loop as TraceLoop)
		? (loop as TraceLoop)
		: undefined;
	const pending = checks.find(
		(check) => check.loop === currentLoop && check.status === "pending",
	);
	const fallback = checks.find((check) => check.status === "pending");
	const target =
		pending || fallback || (blockers.length > 0 ? checks.at(-1) : undefined);
	if (!target) return checks;
	const targetStatus = blockers.length > 0 ? "failed" : "verifying";
	return checks.map((check) => {
		if (check !== target) return check;
		return {
			...check,
			status: targetStatus,
			...(blockers[0] ? { message: blockers[0] } : {}),
		};
	});
}

function sprintTraceQualitySummary(
	checks: CodewikiSprintTraceQualityCheck[],
): CodewikiSprintTraceQualitySummary {
	return {
		total: checks.length,
		passed: checks.filter((check) => check.status === "passed").length,
		failed: checks.filter((check) => check.status === "failed").length,
		pending: checks.filter((check) => check.status === "pending").length,
		verifying: checks.filter((check) => check.status === "verifying").length,
		skipped: checks.filter((check) => check.status === "skipped").length,
	};
}

function sprintTraceQualityCaption(
	card: TraceQueueCard,
	loop: CodewikiSprintTrace["loop"],
	checks: CodewikiSprintTraceQualityCheck[],
	summary: CodewikiSprintTraceQualitySummary,
): string {
	const failed = checks.find((check) => check.status === "failed");
	if (failed) return qualityCaption("Blocked on", failed);
	const verifying = checks.find((check) => check.status === "verifying");
	if (verifying) return qualityCaption("Checking", verifying);
	if (card.closed) {
		return `${summary.passed}/${summary.total} quality checks recorded · trace archived`;
	}
	if (loop === "blocked") {
		return `${summary.passed}/${summary.total} quality checks recorded · needs attention`;
	}
	return `${summary.passed}/${summary.total} quality checks recorded · ready for ${loop}`;
}

function qualityCaption(
	prefix: string,
	check: CodewikiSprintTraceQualityCheck,
): string {
	return `${prefix} ${check.loop} quality · ${friendlyQualityLabel(check.label)}`;
}

function friendlyQualityLabel(label: string): string {
	return label.charAt(0).toUpperCase() + label.slice(1);
}

function latestQualityIterationByLoop(
	records: TraceRecord[],
): Map<TraceLoop, QualityIterationSummary> {
	const latest = new Map<TraceLoop, QualityIterationSummary>();
	for (const iteration of qualityIterationsFromTrace(records)) {
		latest.set(iteration.loop, iteration);
	}
	return latest;
}

function requiredQualityStandard(
	standard: ReturnType<typeof decisionQualityStandards>[number],
): QualityStandardSummary {
	return {
		id: standard.id,
		status: "missing",
		mode: standard.mode,
		...(standard.weight ? { weight: standard.weight } : {}),
		description: standard.description,
		refs: [...(standard.refs || [])],
		...(standard.evidenceRefs?.length
			? { evidenceRefs: [...standard.evidenceRefs] }
			: {}),
	};
}

function qualityStandardLabel(id: string): string {
	return id.replace(/_/g, " ");
}

function workUnitRefs(card: TraceQueueCard, items: WorkQueueItem[]): string[] {
	return unique([
		...card.workUnitRefs,
		...items.filter((item) => item.kind === "work-unit").map((item) => item.id),
	]);
}

export function isActiveDashboardTrace(
	trace: Pick<CodewikiSprintTrace, "closed" | "loop">,
): boolean {
	return !trace.closed && trace.loop !== "waiting";
}

function projectNameFromRoot(projectRoot: string): string {
	return basename(projectRoot) || "CodeWiki";
}

function traceRecordsByTraceId(
	records: TraceRecord[],
): Map<string, TraceRecord[]> {
	const byTrace = new Map<string, TraceRecord[]>();
	for (const record of records) {
		const traceRecords = byTrace.get(record.traceId) || [];
		traceRecords.push(record);
		byTrace.set(record.traceId, traceRecords);
	}
	return byTrace;
}

function roundToOne(value: number): number {
	return Math.round(value);
}

function traceQueueFallback(
	trace: WikiStateSnapshot["traceBoard"]["traces"][number],
): TraceQueueCard {
	return {
		traceId: trace.traceId,
		title: trace.title || trace.traceId,
		status: trace.status,
		closed: trace.closed,
		decisionRefs: [...trace.decisionRefs],
		rowCount: trace.decisionRefs.length,
		plannedDecisionRefs: [...trace.plannedDecisionRefs],
		unresolvedDecisionRefs: [...trace.unresolvedDecisionRefs],
		workUnitRefs: [...trace.workUnitRefs],
		pathScopes: [...trace.pathScopes],
		blockers: [...trace.blockers],
		items: [],
	};
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
