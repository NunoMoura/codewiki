import { basename } from "node:path";
import {
	buildProjectWikiState,
	type WikiStateSnapshot,
} from "./state.ts";
import {
	knowledgeTopicRefsFromRecords,
	projectKnowledgeAlignment,
	readKnowledgeTopicDigests,
	type KnowledgeAlignmentProjection,
} from "../../knowledge/topic-alignment.ts";
import { readProjectTraceFiles } from "../../project/state-file.ts";
import {
	normalizeUiPreviewTargetBinding,
	uiPreviewTargetBindingValidationIssues,
	type UiPreviewTargetBinding,
} from "../../preview/binding.ts";
import type { PreviewRuntimeStatus } from "../../preview/coordinator.ts";
import {
	readDevLog,
	type DevLogEntry,
} from "../persistence/dev-log.ts";
import {
	type WorkerObservation,
	workerObservationFreshness,
} from "../workers/observation.ts";
import { DECISION_CHANGE_QUALITY_STANDARDS } from "../../loops/decision/change-quality.ts";
import { implementationQualityStandards } from "../../loops/implementation/quality-standards.ts";
import { PLANNING_PORTFOLIO_QUALITY_STANDARDS } from "../../loops/planning/portfolio-quality.ts";
import type { TraceEvent, TraceLoop, TraceRecord } from "../../changes/trace/types.ts";
import { qualityIterationsFromTrace } from "../../work-state/quality.ts";
import {
	loadProjectServerChangesState,
	type ProjectServerChangesState,
} from "./changes.ts";
import {
	loadProjectServerConfigurationState,
	type ProjectServerConfigurationState,
} from "./configuration.ts";
import {
	projectServerDevLog,
	type ProjectServerDevLogProjection,
} from "./dev-log.ts";
import type {
	QualityIterationSummary,
	QualityStandardSummary,
	TraceGoalStatus,
	WorkQueueItem,
} from "../../work-state/projection-types.ts";
import type {TraceQueueCard} from "./projection-types.ts";

export type CodewikiPipelineStage =
	| "change"
	| "decision"
	| "planning"
	| "implementation"
	| "committed";
export type CodewikiSprintTracePhase = CodewikiPipelineStage;
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
	label: "Change" | "Decision" | "Planning" | "Implementation" | "Committed";
	state: CodewikiSprintTracePhaseState;
	progress: number;
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
	execution?: WorkerObservation["execution"];
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

export interface CodewikiSprintKnowledgeTopic {
	ref: string;
	category: "product" | "system";
	label: string;
}

export interface CodewikiSprintPlan {
	accountableGoal: string;
	knowledgeTopics: CodewikiSprintKnowledgeTopic[];
	uiPreviewTargets: UiPreviewTargetBinding[];
	noKnowledgeImpactReason?: string;
	dependencies: string[];
	rollbackBoundary: string;
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
	committed: boolean;
	commitRef?: string;
	stage: CodewikiPipelineStage;
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
	changeRefs: string[];
	planningRefs: string[];
	workUnitRefs: string[];
	changeIds: string[];
	sprintIds: string[];
	sprintPlan?: CodewikiSprintPlan;
	previews?: PreviewRuntimeStatus[];
	knowledgeAlignment: KnowledgeAlignmentProjection;
	pathScopes: string[];
	blockers: string[];
	workers: CodewikiSprintTraceWorker[];
	workerAttempts: CodewikiWorkerAttempt[];
	implementationReview: CodewikiImplementationReview;
	items: CodewikiSprintTraceItem[];
	activities: CodewikiSprintTraceActivity[];
	devLog: ProjectServerDevLogProjection;
	touchedFiles: CodewikiSprintTraceTouchedFiles;
}

export interface CodewikiAppState {
	projectRoot: string;
	projectName: string;
	generatedAt?: string;
	summary: {
		pipeline: number;
		backlog: number;
		decision: number;
		planning: number;
		implementation: number;
		committed: number;
		blocked: number;
	};
	next: WikiStateSnapshot["next"];
	sprintsQueue: CodewikiSprintTrace[];
	changes?: ProjectServerChangesState;
	configuration?: ProjectServerConfigurationState;
	previews?: PreviewRuntimeStatus[];
}

interface CodewikiAppStateQueryContext {
	workerObservations?: WorkerObservation[];
	devLogByTrace?: ReadonlyMap<string, DevLogEntry[]>;
	changes?: ProjectServerChangesState;
	configuration?: ProjectServerConfigurationState;
	previews?: PreviewRuntimeStatus[];
	knowledgeTopicDigests?: ReadonlyMap<string, string>;
}

export async function loadProjectServerAppState(
	repoRoot: string,
): Promise<CodewikiAppState> {
	const traceFiles = await readProjectTraceFiles(repoRoot);
	const snapshot = await buildProjectWikiState({ repoRoot, traceFiles });
	const [devLogEntries, knowledgeTopicDigests, changes, configuration] =
		await Promise.all([
			Promise.all(
				snapshot.traceBoard.traces
					.filter((trace) => !trace.closed)
					.map(
						async (trace) =>
							[trace.traceId, await readDevLog(repoRoot, trace.traceId)] as const,
					),
			),
			readKnowledgeTopicDigests(
				repoRoot,
				knowledgeTopicRefsFromRecords(traceFiles.records),
			),
			loadProjectServerChangesState(repoRoot),
			loadProjectServerConfigurationState(repoRoot),
		]);
	return buildCodewikiAppState(snapshot, repoRoot, traceFiles.records, {
		devLogByTrace: new Map(devLogEntries),
		knowledgeTopicDigests,
		changes,
		configuration,
	});
}

export function buildCodewikiAppState(
	snapshot: WikiStateSnapshot,
	projectRoot: string,
	records: TraceRecord[] = [],
	context: CodewikiAppStateQueryContext = {},
): CodewikiAppState {
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
	const linkedChangeIds = new Set(
		sprintsQueue.flatMap((trace) => trace.changeIds),
	);
	const backlogCards =
		context.changes?.records.filter((card) =>
			["pending", "deferred"].includes(card.identity.status),
		) || [];
	const backlog = backlogCards.length;
	const unlinkedBacklog = backlogCards.filter(
		(card) => !linkedChangeIds.has(card.identity.changeId),
	).length;
	const acceptedWithoutTrace =
		context.changes?.records.filter(
			(card) =>
				card.identity.status === "accepted" &&
				!linkedChangeIds.has(card.identity.changeId),
		).length ?? 0;
	return {
		projectRoot,
		projectName: projectNameFromRoot(projectRoot),
		generatedAt: snapshot.generatedAt,
		summary: {
			pipeline: unlinkedBacklog + acceptedWithoutTrace + sprintsQueue.length,
			backlog,
			decision:
				acceptedWithoutTrace +
				sprintsQueue.filter((trace) => trace.stage === "decision").length,
			planning: sprintsQueue.filter((trace) => trace.stage === "planning")
				.length,
			implementation: sprintsQueue.filter(
				(trace) => trace.stage === "implementation",
			).length,
			committed: sprintsQueue.filter((trace) => trace.committed).length,
			blocked: sprintsQueue.filter((trace) => trace.blockerCount > 0).length,
		},
		next: snapshot.next,
		sprintsQueue,
		...(context.changes ? { changes: context.changes } : {}),
		...(context.configuration ? { configuration: context.configuration } : {}),
		...(context.previews ? { previews: context.previews } : {}),
	};
}

function buildSprintTrace(
	snapshot: WikiStateSnapshot,
	card: TraceQueueCard,
	records: TraceRecord[],
	context: CodewikiAppStateQueryContext,
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
	const committed = isCommittedAppTrace(card, records);
	const stage = sprintTraceStage(card, items, committed);
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
	const sprintPlan = projectSprintPlan(records);
	const previews = context.previews?.filter((status) =>
		status.traceIds.includes(card.traceId),
	);
	const knowledgeAlignment = projectKnowledgeAlignment({
		records,
		topicRefs: sprintPlan?.knowledgeTopics.map((topic) => topic.ref) || [],
		noKnowledgeImpactReason: sprintPlan?.noKnowledgeImpactReason,
		currentDigests: context.knowledgeTopicDigests,
	});
	const projection: CodewikiSprintTrace = {
		traceId: card.traceId,
		title: card.title || card.traceId,
		status: card.status,
		closed: card.closed,
		committed,
		...(sprintTraceCommitRef(records)
			? { commitRef: sprintTraceCommitRef(records) }
			: {}),
		stage,
		loop,
		progress: sprintTraceProgress(card, items, blockers, committed),
		segments: sprintTraceSegments(
			card,
			items,
			blockers,
			committed,
			loopSections,
		),
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
		changeRefs: [...card.changeRefs],
		planningRefs: unique(items.flatMap((item) => item.planningRefs)),
		workUnitRefs: workUnitRefs(card, items),
		changeIds: sprintTraceChangeIds(records),
		...(sprintPlan ? { sprintPlan } : {}),
		...(previews?.length ? { previews } : {}),
		knowledgeAlignment,
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
		devLog: projectServerDevLog(context.devLogByTrace?.get(card.traceId)),
		touchedFiles: sprintTraceTouchedFiles(records, items, workers, card),
		sprintIds: [],
	};
	return applyWorkStateChangeJourney(projection, snapshot);
}

function applyWorkStateChangeJourney(
	projection: CodewikiSprintTrace,
	snapshot: WikiStateSnapshot,
): CodewikiSprintTrace {
	const change = snapshot.workState.changes.find(
		(candidate) => candidate.traceId === projection.traceId,
	);
	if (!change) return projection;
	const segments = changeJourneySegments(change, projection.committed);
	const blockers = [...change.blockers];
	const stage = changeJourneyStage(change, projection.committed);
	return {
		...projection,
		status: changeJourneyStatus(change, projection.committed),
		stage,
		loop: changeJourneyLoop(change, projection.committed),
		progress: roundToOne(
			(segments.reduce((total, item) => total + item.progress, 0) /
				segments.length) *
				100,
		),
		segments,
		currentAction: changeJourneyAction(change, projection.committed),
		blockerCount: blockers.length,
		blockers,
		changeIds: [change.id],
		sprintIds: [...change.sprintIds],
		workUnitRefs: [...change.workItemIds],
		activeWorkCount: snapshot.workState.workItems.filter(
			(item) => change.workItemIds.includes(item.id) && !item.implemented,
		).length,
	};
}

function changeJourneySegments(
	change: WikiStateSnapshot["workState"]["changes"][number],
	committed: boolean,
): CodewikiSprintTraceSegment[] {
	const changePhase = changeJourneyChangePhase(change);
	const decisionPhase = changeJourneyDecisionPhase(change);
	const planningPhase = changeJourneyPlanningPhase(change);
	const implementationPhase = changeJourneyImplementationPhase(change);
	const committedPhase = changeJourneyCommittedPhase(change, committed);
	return [
		segment("change", "Change", changePhase.state, changePhase.progress),
		segment(
			"decision",
			"Decision",
			decisionPhase.state,
			decisionPhase.progress,
		),
		segment(
			"planning",
			"Planning",
			planningPhase.state,
			planningPhase.progress,
		),
		segment(
			"implementation",
			"Implementation",
			implementationPhase.state,
			implementationPhase.progress,
		),
		segment(
			"committed",
			"Committed",
			committedPhase.state,
			committedPhase.progress,
		),
	];
}

function changeJourneyChangePhase(
	change: WikiStateSnapshot["workState"]["changes"][number],
): Pick<CodewikiSprintTraceSegment, "state" | "progress"> {
	if (change.record.change.validation.state === "valid") {
		return { state: "done", progress: 1 };
	}
	if (change.blockers.length > 0) return { state: "blocked", progress: 0.5 };
	return { state: "active", progress: 0.5 };
}

function changeJourneyDecisionPhase(
	change: WikiStateSnapshot["workState"]["changes"][number],
): Pick<CodewikiSprintTraceSegment, "state" | "progress"> {
	if (change.approval.status === "approved") {
		return { state: "done", progress: 1 };
	}
	if (change.record.change.validation.state === "valid") {
		return { state: "active", progress: 0.5 };
	}
	return { state: "todo", progress: 0 };
}

function changeJourneyPlanningPhase(
	change: WikiStateSnapshot["workState"]["changes"][number],
): Pick<CodewikiSprintTraceSegment, "state" | "progress"> {
	if (change.planningStatus === "planned") {
		return { state: "done", progress: 1 };
	}
	if (change.planningStatus === "incomplete_commit") {
		return { state: "blocked", progress: 0 };
	}
	if (change.approval.status === "approved") {
		return { state: "active", progress: 0 };
	}
	return { state: "todo", progress: 0 };
}

function changeJourneyImplementationPhase(
	change: WikiStateSnapshot["workState"]["changes"][number],
): Pick<CodewikiSprintTraceSegment, "state" | "progress"> {
	if (change.realizationStatus === "realized") {
		return { state: "done", progress: 1 };
	}
	if (change.planningStatus !== "planned")
		return { state: "todo", progress: 0 };
	if (change.blockers.length > 0) return { state: "blocked", progress: 0 };
	return { state: "active", progress: 0 };
}

function changeJourneyCommittedPhase(
	change: WikiStateSnapshot["workState"]["changes"][number],
	committed: boolean,
): Pick<CodewikiSprintTraceSegment, "state" | "progress"> {
	if (committed) return { state: "done", progress: 1 };
	if (change.realizationStatus === "realized") {
		return { state: "active", progress: 0 };
	}
	return { state: "todo", progress: 0 };
}

function changeJourneyLoop(
	change: WikiStateSnapshot["workState"]["changes"][number],
	committed: boolean,
): CodewikiSprintTrace["loop"] {
	if (change.currentLoop) return change.currentLoop;
	if (committed) return "archived";
	return "waiting";
}

function changeJourneyAction(
	change: WikiStateSnapshot["workState"]["changes"][number],
	committed: boolean,
): string {
	if (change.nextAction) return change.nextAction;
	if (committed) return "Change journey committed and retained.";
	return "Change journey has no eligible action.";
}

function changeJourneyStage(
	change: WikiStateSnapshot["workState"]["changes"][number],
	committed: boolean,
): CodewikiPipelineStage {
	if (committed) return "committed";
	if (change.approval.status !== "approved") {
		if (change.record.change.validation.state === "valid") return "decision";
		return "change";
	}
	if (change.planningStatus !== "planned") return "planning";
	return "implementation";
}

function changeJourneyStatus(
	change: WikiStateSnapshot["workState"]["changes"][number],
	committed: boolean,
): TraceGoalStatus {
	if (committed) return "closed_complete";
	if (change.blockers.length > 0) return "blocked";
	if (["deferred", "rejected", "withdrawn"].includes(change.approval.status)) {
		return "deferred";
	}
	if (change.approval.status !== "approved") return "needs_decision";
	if (change.planningStatus !== "planned") return "needs_planning";
	if (change.realizationStatus !== "realized") return "needs_implementation";
	return "finished";
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
		attempts.set(
			attemptId,
			workerAttemptFromClaim(
				attemptId,
				workUnitId,
				workerId,
				data,
				itemById.get(workUnitId),
			),
		);
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
	attempt.execution = observation.execution;
	if (attempt.status === "running" && freshness !== "live")
		attempt.status = "stale";
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
	const decision = objectRecord(output.decision);
	const changeRecord = objectRecord(output.changeRecord);
	const change = objectRecord(changeRecord?.change);
	return decision?.disposition === "approve" && change ? [change] : [];
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
	return path.startsWith("src/");
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
			label: "Committed and retained",
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
	if (record.event === "change_approved") return "Decision recorded";
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
		const decision = objectRecord(output.decision);
		return decision?.disposition === "approve"
			? "Change approved"
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

export function isCommittedAppTrace(
	card: Pick<TraceQueueCard, "closed" | "status">,
	records: TraceRecord[],
): boolean {
	return (
		card.closed &&
		card.status === "closed_complete" &&
		Boolean(sprintTraceCommitRef(records))
	);
}

function sprintTraceCommitRef(records: TraceRecord[]): string | undefined {
	const close = records.find((record) => record.type === "trace_close");
	return close?.type === "trace_close" && close.gitRestoreRef.trim()
		? close.gitRestoreRef.trim()
		: undefined;
}

function sprintTraceStage(
	card: TraceQueueCard,
	items: WorkQueueItem[],
	committed: boolean,
): Exclude<CodewikiPipelineStage, "change"> {
	if (committed) return "committed";
	if (
		card.nextLoop === "implementation" ||
		card.nextLoop === "archive" ||
		items.some((item) =>
			["waiting", "ready", "claimed", "done"].includes(item.status),
		)
	) {
		return "implementation";
	}
	if (card.nextLoop === "planning" || planningDone(card)) return "planning";
	return "decision";
}

export function projectSprintPlan(
	records: TraceRecord[],
): CodewikiSprintPlan | undefined {
	const events = semanticTraceEvents(records);
	const knowledgeTopics = events
		.filter((event) => event.loop === "decision")
		.flatMap((event) => {
			const output = objectRecord(event.data?.output);
			const changeRecord = objectRecord(output?.changeRecord);
			const change = objectRecord(changeRecord?.change);
			const knowledge = objectRecord(change?.knowledge);
			return stringValues(knowledge?.topicRefs);
		});
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event?.loop !== "planning") continue;
		const output = objectRecord(event.data?.output);
		const sprint = objectList(output?.sprints)[0];
		if (!sprint) continue;
		const uiPreviewTargets = objectList(sprint.uiPreviewTargets)
			.map((target) =>
				normalizeUiPreviewTargetBinding({
					targetId: stringValue(target.targetId),
					targetDigest: stringValue(target.targetDigest),
					profileId: stringValue(target.profileId),
					profileDigest: stringValue(target.profileDigest),
					workItemIds: stringValues(target.workItemIds),
					contributingChangeIds: stringValues(target.contributingChangeIds),
					required: target.required !== false,
					activation: stringValue(target.activation),
					autoOpen: stringValue(target.autoOpen),
				}),
			)
			.filter(
				(target) => uiPreviewTargetBindingValidationIssues(target).length === 0,
			);
		return {
			accountableGoal: stringValue(sprint.goal),
			knowledgeTopics: unique(knowledgeTopics).flatMap(
				projectSprintKnowledgeTopic,
			),
			uiPreviewTargets,
			dependencies: unique(stringValues(sprint.dependsOn)),
			rollbackBoundary: stringValue(sprint.rollbackBoundary),
		};
	}
	return undefined;
}

function projectSprintKnowledgeTopic(
	ref: string,
): CodewikiSprintKnowledgeTopic[] {
	const match = /^(?:\.codewiki\/kb\/|kb:)(product|system)\/(.+)\.md$/.exec(
		ref,
	);
	if (!match) return [];
	const category = match[1] as CodewikiSprintKnowledgeTopic["category"];
	const label = (match[2] || "")
		.split("/")
		.map((part) => titleCase(part.replace(/[-_]/g, " ")))
		.join(" / ");
	return [{ ref, category, label }];
}

function sprintTraceChangeIds(records: TraceRecord[]): string[] {
	const headIds = records.flatMap((record) =>
		record.type === "trace_head" && record.changeId ? [record.changeId] : [],
	);
	const outputIds = semanticTraceEvents(records)
		.filter((event) => event.loop === "decision")
		.flatMap((event) =>
			approvedChangeObjects(objectRecord(event.data?.output)).map((change) =>
				stringValue(change.changeId || change.id),
			),
		);
	const refIds = records.flatMap(traceRecordRefs).flatMap((ref) => {
		const direct = /^change:(CHG-[A-Za-z0-9._-]+)(?:@\d+)?$/.exec(ref)?.[1];
		return [
			...[...ref.matchAll(/#change:([^#\s]+)/g)].map((match) => match[1] || ""),
			...(direct ? [direct] : []),
		];
	});
	return unique([...headIds, ...outputIds, ...refIds].filter(Boolean));
}

function traceRecordRefs(record: TraceRecord): string[] {
	if (record.type === "trace_head") return record.origin?.refs ?? [];
	if (record.type === "trace_event" || record.type === "trace_close") {
		return record.refs;
	}
	return [];
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
	if (loop === "archive") return "Commit and retain the completed trace.";
	if (loop === "archived") {
		return card.status === "closed_complete"
			? "Committed with Git restore evidence."
			: "Trace closed without a complete outcome.";
	}
	return "Waiting for dependencies.";
}

function sprintTraceProgress(
	card: TraceQueueCard,
	items: WorkQueueItem[],
	blockers: string[],
	committed: boolean,
): number {
	if (committed) return 100;
	const decision = decisionDone(card)
		? 1
		: card.changeRefs.length > 0
			? 0.6
			: 0;
	const planning = planningDone(card)
		? 1
		: card.nextLoop === "planning"
			? 0.4
			: 0;
	const implementation = implementationProgress(card, items);
	const commit = card.nextLoop === "archive" ? 0.5 : 0;
	const raw =
		10 + decision * 20 + planning * 20 + implementation * 40 + commit * 10;
	const clamped = Math.max(5, Math.min(95, raw));
	return roundToOne(blockers.length > 0 ? Math.min(clamped, 90) : clamped);
}

function sprintTraceSegments(
	card: TraceQueueCard,
	items: WorkQueueItem[],
	blockers: string[],
	committed: boolean,
	sections: CodewikiSprintTraceLoopSection[],
): CodewikiSprintTraceSegment[] {
	const decisionState = phaseState(card, blockers, "decision", {
		complete: decisionDone(card),
	});
	const planningState = phaseState(card, blockers, "planning", {
		complete: planningDone(card),
	});
	const implementationState = phaseState(card, blockers, "implementation", {
		complete: implementationDone(card, items),
	});
	const committedState: CodewikiSprintTracePhaseState = committed
		? "done"
		: card.closed
			? "todo"
			: blockers.length > 0 && card.nextLoop === "archive"
				? "blocked"
				: card.nextLoop === "archive"
					? "active"
					: "todo";
	return [
		segment("change", "Change", "done", 1),
		segment(
			"decision",
			"Decision",
			decisionState,
			loopSegmentProgress(sections, "decision", decisionState),
		),
		segment(
			"planning",
			"Planning",
			planningState,
			loopSegmentProgress(sections, "planning", planningState),
		),
		segment(
			"implementation",
			"Implementation",
			implementationState,
			loopSegmentProgress(sections, "implementation", implementationState),
		),
		segment(
			"committed",
			"Committed",
			committedState,
			committedState === "done" ? 1 : 0,
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
	progress: number,
): CodewikiSprintTraceSegment {
	return {
		phase,
		label,
		state,
		progress: Math.round(Math.max(0, Math.min(1, progress)) * 10) / 10,
	};
}

function loopSegmentProgress(
	sections: CodewikiSprintTraceLoopSection[],
	loop: TraceLoop,
	state: CodewikiSprintTracePhaseState,
): number {
	if (state === "done") return 1;
	if (state === "todo") return 0;
	const summary = sections.find(
		(section) => section.loop === loop,
	)?.qualitySummary;
	if (!summary?.total) return 0.15;
	return (summary.passed + summary.skipped) / summary.total;
}

function decisionDone(card: TraceQueueCard): boolean {
	return card.changeRefs.length > 0 && card.unresolvedChangeRefs.length === 0;
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
		decision: DECISION_CHANGE_QUALITY_STANDARDS.map(requiredQualityStandard),
		planning: PLANNING_PORTFOLIO_QUALITY_STANDARDS.map(requiredQualityStandard),
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
		return `${summary.passed}/${summary.total} quality checks recorded · trace ${card.status === "closed_complete" ? "committed" : "closed incomplete"}`;
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

function requiredQualityStandard(standard: {
	id: string;
	mode: QualityStandardSummary["mode"];
	description: string;
	weight?: number;
	refs?: string[];
	evidenceRefs?: string[];
}): QualityStandardSummary {
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

export function isActiveAppTrace(
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
		changeRefs: [...trace.changeRefs],
		rowCount: trace.changeRefs.length,
		plannedChangeRefs: [...trace.plannedChangeRefs],
		unresolvedChangeRefs: [...trace.unresolvedChangeRefs],
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
