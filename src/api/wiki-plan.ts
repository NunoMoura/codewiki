import { createHash } from "node:crypto";
import { truncate } from "node:fs/promises";
import { join } from "node:path";
import {
	appendTraceRecords,
	type AppendTraceBatchResult,
} from "../traces/append.ts";
import { createLoopIterationEvent } from "../traces/events.ts";
import { readTraceFileSnapshot } from "../traces/reader.ts";
import { traceFilePath } from "../traces/schema.ts";
import type {
	LoopQualityStandardResult,
	TraceEvent,
	TraceRecord,
} from "../traces/types.ts";
import { changeContentDigest } from "../changes/digest.ts";
import { changeTraceId } from "../changes/change-trace.ts";
import {
	evaluatePortfolioPlanning,
	type PortfolioWorkItemInput,
	type SprintPlanInput,
} from "../planning/portfolio-quality.ts";
import { selectRuntimeReaction } from "../runtime/reactor.ts";
import { buildProjectWorkState } from "../work-state/project.ts";
import type { WorkState } from "../work-state/types.ts";

export type WikiPlanMode = "preview" | "append";

export interface RunWikiPlanInput {
	expectedWorkStateDigest: string;
	expectedChangeIds: string[];
	sprints: SprintPlanInput[];
	workItems: PortfolioWorkItemInput[];
	actor: string;
	rationale: string;
	createdAt?: string;
	mode?: WikiPlanMode;
	repoRoot?: string;
	expectedBytesByChangeId?: Record<string, number>;
}

export interface PlanningEpochReport {
	schemaVersion: 1;
	planningEpochId: string;
	digest: string;
	observedWorkStateDigest: string;
	participantChanges: Array<{
		changeId: string;
		traceId: string;
		changeRevision: number;
		changeDigest: string;
	}>;
	sprints: SprintPlanInput[];
	workItems: PortfolioWorkItemInput[];
	qualityRef: string;
	qualityStandards: LoopQualityStandardResult[];
	exit: { status: "continue" | "exit" };
}

export interface RunWikiPlanResult {
	mode: WikiPlanMode;
	report: PlanningEpochReport;
	events: Record<string, TraceEvent>;
	append?: Record<string, AppendTraceBatchResult>;
}

interface LoadedParticipantTrace {
	changeId: string;
	traceId: string;
	path: string;
	bytes: number;
	records: TraceRecord[];
}

const INPUT_KEYS = [
	"expectedWorkStateDigest",
	"expectedChangeIds",
	"sprints",
	"workItems",
	"actor",
	"rationale",
	"createdAt",
	"mode",
	"repoRoot",
	"expectedBytesByChangeId",
] as const;

export async function runWikiPlan(
	input: RunWikiPlanInput,
): Promise<RunWikiPlanResult> {
	return await runWikiPlanForSelectedChanges(input);
}

/** Runtime-only entry: selection was already derived from the triggering WorkState. */
export async function runRuntimeSelectedWikiPlan(
	input: RunWikiPlanInput,
	selectedChangeIds: string[],
): Promise<RunWikiPlanResult> {
	return await runWikiPlanForSelectedChanges(input, selectedChangeIds);
}

async function runWikiPlanForSelectedChanges(
	input: RunWikiPlanInput,
	runtimeSelectedChangeIds?: string[],
): Promise<RunWikiPlanResult> {
	assertInput(input);
	const repoRoot = requiredText(input.repoRoot, "repoRoot");
	const mode = input.mode || "preview";
	const createdAt = timestamp(input.createdAt);
	const workState = await buildProjectWorkState({ repoRoot });
	if (workState.snapshotDigest !== input.expectedWorkStateDigest) {
		throw new Error(
			`Planning WorkState changed: expected ${input.expectedWorkStateDigest}, actual ${workState.snapshotDigest}.`,
		);
	}
	const selectedChangeIds = runtimeSelectedChangeIds
		? [...runtimeSelectedChangeIds].sort(compareText)
		: selectedPlanningChangeIds(workState);
	if (
		!sameStrings(
			selectedChangeIds,
			[...input.expectedChangeIds].sort(compareText),
		)
	) {
		throw new Error(
			`Planning horizon changed: expected ${input.expectedChangeIds.join(", ")}, actual ${selectedChangeIds.join(", ")}.`,
		);
	}
	assertApprovedChanges(workState, selectedChangeIds);
	const sprints = normalizedSprints(input.sprints);
	const workItems = normalizedWorkItems(input.workItems);
	const quality = evaluatePortfolioPlanning({
		changeIds: selectedChangeIds,
		sprints,
		workItems,
		workState,
	});
	const unsigned = {
		schemaVersion: 1 as const,
		observedWorkStateDigest: workState.snapshotDigest,
		participantChanges: selectedChangeIds.map((changeId) => {
			const change = requiredWorkStateChange(workState, changeId);
			return {
				changeId,
				traceId: change.traceId,
				changeRevision: change.record.change.revision,
				changeDigest: changeContentDigest(change.record.change),
			};
		}),
		sprints,
		workItems,
		qualityRef: quality.qualityRef,
		qualityStandards: quality.standards,
		exit: {
			status: quality.passed ? ("exit" as const) : ("continue" as const),
		},
	};
	const digest = planningDigest(unsigned);
	const planningEpochId = `PE-${digest.slice("sha256:".length, "sha256:".length + 20)}`;
	const report: PlanningEpochReport = {
		...unsigned,
		planningEpochId,
		digest,
	};
	const traces = await loadParticipantTraces(repoRoot, selectedChangeIds);
	if (mode === "append") assertExpectedBytes(input, traces);
	const events = Object.fromEntries(
		traces.map((trace) => [
			trace.changeId,
			planningEvent(trace, report, input.actor, input.rationale, createdAt),
		]),
	);
	if (!quality.passed) {
		if (mode === "append") {
			throw new Error(
				`Planning quality did not exit: ${quality.standards
					.filter((standard) => standard.status !== "met")
					.map((standard) => standard.id)
					.join(", ")}.`,
			);
		}
		return { mode, report, events };
	}
	if (mode === "preview") return { mode, report, events };
	const append = await appendPlanningEvents(repoRoot, traces, events);
	return { mode, report, events, append };
}

function planningEvent(
	trace: LoadedParticipantTrace,
	report: PlanningEpochReport,
	actor: string,
	rationale: string,
	createdAt: string,
): TraceEvent {
	const events = trace.records.filter(
		(record): record is TraceEvent => record.type === "trace_event",
	);
	const parent = trace.records.at(-1);
	const output = {
		planningEpochId: report.planningEpochId,
		digest: report.digest,
		observedWorkStateDigest: report.observedWorkStateDigest,
		participantChanges: report.participantChanges,
		sprints: report.sprints,
		workItems: report.workItems.map((item) => ({
			...item,
			acceptanceCriteria: item.acceptanceCriteria.map((text, index) => ({
				id: `AC-${item.id}-${index + 1}`,
				text,
			})),
		})),
		actor,
		rationale,
		qualityRef: report.qualityRef,
		qualityStandards: report.qualityStandards,
	};
	return createLoopIterationEvent({
		traceId: trace.traceId,
		loop: "planning",
		id: `evt-${report.planningEpochId}-${trace.changeId}`,
		parentId: parent?.type === "trace_head" ? null : parent?.id || null,
		sequence: Math.max(0, ...events.map((event) => event.sequence)) + 1,
		refs: [
			report.digest,
			report.qualityRef,
			...report.participantChanges.map(
				(change) => `change:${change.changeId}@${change.changeRevision}`,
			),
			...report.sprints.map((sprint) => `sprint:${sprint.id}`),
			...report.workItems.map((item) => `work:${item.id}`),
		],
		createdAt,
		iteration: events.filter((event) => event.loop === "planning").length + 1,
		trigger: "runtime.planning_horizon",
		output,
		exit: {
			status: "exit",
			conditions: report.qualityStandards.map((standard) => ({
				id: standard.id,
				status: "met",
				...(standard.refs ? { refs: standard.refs } : {}),
			})),
			targetLoop: "implementation",
			nextAction: "Claim ready Work Items under Sprint integration policy.",
		},
		progress: {
			changedRefs: [
				...report.sprints.map((sprint) => `sprint:${sprint.id}`),
				...report.workItems.map((item) => `work:${item.id}`),
			],
		},
		data: { observedWorkStateDigest: report.observedWorkStateDigest },
	});
}

async function loadParticipantTraces(
	repoRoot: string,
	changeIds: string[],
): Promise<LoadedParticipantTrace[]> {
	return Promise.all(
		changeIds.map(async (changeId) => {
			const traceId = changeTraceId(changeId);
			const path = join(repoRoot, traceFilePath(traceId));
			const snapshot = await readTraceFileSnapshot(path);
			return { changeId, traceId, path, ...snapshot };
		}),
	);
}

async function appendPlanningEvents(
	repoRoot: string,
	traces: LoadedParticipantTrace[],
	events: Record<string, TraceEvent>,
): Promise<Record<string, AppendTraceBatchResult>> {
	const appended: LoadedParticipantTrace[] = [];
	const results: Record<string, AppendTraceBatchResult> = {};
	const appendAt = async (index: number): Promise<void> => {
		const trace = traces[index];
		if (!trace) return;
		const event = events[trace.changeId];
		if (!event)
			throw new Error(`Missing Planning event for ${trace.changeId}.`);
		results[trace.changeId] = await appendTraceRecords(
			repoRoot,
			[event],
			trace.bytes,
		);
		appended.push(trace);
		await appendAt(index + 1);
	};
	try {
		await appendAt(0);
		return results;
	} catch (error) {
		await Promise.all(
			appended.map((trace) => truncate(trace.path, trace.bytes)),
		);
		throw error;
	}
}

function assertExpectedBytes(
	input: RunWikiPlanInput,
	traces: LoadedParticipantTrace[],
): void {
	const expected = input.expectedBytesByChangeId;
	if (!expected) {
		throw new Error("wiki_plan append mode requires expectedBytesByChangeId.");
	}
	for (const trace of traces) {
		if (expected[trace.changeId] !== trace.bytes) {
			throw new Error(
				`Planning trace bytes changed for ${trace.changeId}: expected ${String(expected[trace.changeId])}, actual ${trace.bytes}.`,
			);
		}
	}
}

function assertApprovedChanges(
	workState: WorkState,
	changeIds: string[],
): void {
	for (const changeId of changeIds) {
		const change = requiredWorkStateChange(workState, changeId);
		if (change.approval.status !== "approved") {
			throw new Error(`Planning Change ${changeId} is not approved.`);
		}
	}
}

function requiredWorkStateChange(workState: WorkState, changeId: string) {
	const change = workState.changes.find(
		(candidate) => candidate.id === changeId,
	);
	if (!change) throw new Error(`Planning Change ${changeId} was not found.`);
	return change;
}

function normalizedSprints(values: SprintPlanInput[]): SprintPlanInput[] {
	const sprints = values.map((value) => ({
		id: requiredText(value.id, "sprints.id"),
		goal: requiredText(value.goal, "sprints.goal"),
		participatingChangeIds: stringArray(
			value.participatingChangeIds,
			"sprints.participatingChangeIds",
		),
		workItemIds: stringArray(value.workItemIds, "sprints.workItemIds"),
		rollbackBoundary: requiredText(
			value.rollbackBoundary,
			"sprints.rollbackBoundary",
		),
		dependsOn: stringArray(value.dependsOn, "sprints.dependsOn"),
		integrationRefs: stringArray(
			value.integrationRefs,
			"sprints.integrationRefs",
		),
	}));
	assertUnique(
		sprints.map((sprint) => sprint.id),
		"Sprint ids",
	);
	return sprints.sort((left, right) => left.id.localeCompare(right.id));
}

function normalizedWorkItems(
	values: PortfolioWorkItemInput[],
): PortfolioWorkItemInput[] {
	const items = values.map((value) => ({
		id: requiredText(value.id, "workItems.id"),
		sprintId: requiredText(value.sprintId, "workItems.sprintId"),
		owningChangeId: requiredText(
			value.owningChangeId,
			"workItems.owningChangeId",
		),
		contributingChangeIds: stringArray(
			value.contributingChangeIds,
			"workItems.contributingChangeIds",
		),
		title: requiredText(value.title, "workItems.title"),
		outcome: requiredText(value.outcome, "workItems.outcome"),
		technicalRequirements: stringArray(
			value.technicalRequirements,
			"workItems.technicalRequirements",
		),
		acceptanceCriteria: stringArray(
			value.acceptanceCriteria,
			"workItems.acceptanceCriteria",
		),
		componentRefs: stringArray(value.componentRefs, "workItems.componentRefs"),
		pathScopes: stringArray(value.pathScopes, "workItems.pathScopes"),
		verification: stringArray(value.verification, "workItems.verification"),
		workerProfile: requiredText(value.workerProfile, "workItems.workerProfile"),
		dependsOn: stringArray(value.dependsOn, "workItems.dependsOn"),
	}));
	assertUnique(
		items.map((item) => item.id),
		"Work Item ids",
	);
	return items.sort((left, right) => left.id.localeCompare(right.id));
}

function selectedPlanningChangeIds(workState: WorkState): string[] {
	const reaction = selectRuntimeReaction(workState, { kind: "manual_resume" });
	if (reaction.selection?.loop !== "planning") {
		throw new Error("Runtime did not select Planning for current WorkState.");
	}
	return reaction.selection.planningHorizon
		.map((entry) => entry.changeId)
		.sort(compareText);
}

function assertInput(input: RunWikiPlanInput): void {
	if (!input || typeof input !== "object")
		throw new Error("wiki_plan requires input object.");
	for (const key of Object.keys(input)) {
		if (!(INPUT_KEYS as readonly string[]).includes(key)) {
			throw new Error(`wiki_plan received unsupported input field ${key}.`);
		}
	}
	if (!/^sha256:[a-f0-9]{64}$/.test(input.expectedWorkStateDigest)) {
		throw new Error(
			"wiki_plan expectedWorkStateDigest must be a sha256 digest.",
		);
	}
	stringArray(input.expectedChangeIds, "expectedChangeIds");
	if (!Array.isArray(input.sprints))
		throw new Error("wiki_plan sprints must be an array.");
	if (!Array.isArray(input.workItems))
		throw new Error("wiki_plan workItems must be an array.");
	requiredText(input.actor, "actor");
	requiredText(input.rationale, "rationale");
	if (input.mode && !["preview", "append"].includes(input.mode)) {
		throw new Error("wiki_plan mode is invalid.");
	}
}

function planningDigest(value: unknown): string {
	return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function timestamp(value: string | undefined): string {
	const candidate = value || new Date().toISOString();
	if (Number.isNaN(Date.parse(candidate))) {
		throw new Error("wiki_plan createdAt must be an ISO timestamp.");
	}
	return new Date(candidate).toISOString();
}

function requiredText(value: string | undefined, field: string): string {
	if (!value?.trim()) throw new Error(`wiki_plan ${field} is required.`);
	return value.trim();
}

function stringArray(value: unknown, field: string): string[] {
	if (!Array.isArray(value))
		throw new Error(`wiki_plan ${field} must be an array.`);
	const values = value.map((entry) =>
		requiredText(typeof entry === "string" ? entry : undefined, field),
	);
	return [...new Set(values)].sort(compareText);
}

function assertUnique(values: string[], field: string): void {
	if (new Set(values).size !== values.length) {
		throw new Error(`wiki_plan ${field} must be unique.`);
	}
}

function sameStrings(left: string[], right: string[]): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}
