import { createHash } from "node:crypto";
import { join } from "node:path";
import {
	appendTraceRecords,
	type AppendTraceBatchResult,
} from "../../changes/trace/append.ts";
import { createLoopIterationEvent } from "../../changes/trace/events.ts";
import { readTraceFileSnapshot } from "../../changes/trace/reader.ts";
import {
	assertProjectServerSemanticJobId,
	traceFilePath,
} from "../../changes/trace/schema.ts";
import type {
	LoopQualityStandardResult,
	TraceEvent,
} from "../../changes/trace/types.ts";
import { changeContentDigest } from "../../changes/digest.ts";
import { changeTraceId } from "../../changes/trace/change-record.ts";
import {
	evaluateGraphDeltaPlanning,
} from "../../loops/planning/graph-delta-quality.ts";
import type {
	PlanningAcceptanceCoverage,
	PlanningDependencyEdge,
	PlanningUiPreviewTarget,
	PlanningWorkUnitCandidate,
} from "../../loops/planning/candidate-content.ts";
import { selectProjectServerReaction } from "../coordinator/reactor.ts";
import { buildProjectWorkState } from "../../work-state/project.ts";
import type { WorkState } from "../../work-state/types.ts";

export type WikiPlanMode = "preview" | "append";

export interface RunWikiPlanInput {
	expectedWorkStateDigest: string;
	expectedChangeId: string;
	changeId: string;
	changeRevisionId: string;
	observedWorkGraphDigest: string;
	workUnits: PlanningWorkUnitCandidate[];
	dependencyEdges: PlanningDependencyEdge[];
	acceptanceCoverage: PlanningAcceptanceCoverage[];
	uiPreviewTargets: PlanningUiPreviewTarget[];
	integrationRequirements: string[];
	actor: string;
	rationale: string;
	createdAt?: string;
	mode?: WikiPlanMode;
	repoRoot?: string;
	expectedBytes?: number;
	runtimeJobId?: string;
}

export interface WorkGraphDeltaReport {
	schemaVersion: 1;
	workGraphDeltaId: string;
	digest: string;
	observedWorkStateDigest: string;
	observedWorkGraphDigest: string;
	change: {
		changeId: string;
		traceId: string;
		changeRevision: number;
		changeRevisionId: string;
	};
	workUnits: PlanningWorkUnitCandidate[];
	dependencyEdges: PlanningDependencyEdge[];
	acceptanceCoverage: PlanningAcceptanceCoverage[];
	uiPreviewTargets: PlanningUiPreviewTarget[];
	integrationRequirements: string[];
	qualityRef: string;
	qualityStandards: LoopQualityStandardResult[];
	exit: { status: "continue" | "exit" };
}

export interface RunWikiPlanResult {
	mode: WikiPlanMode;
	report: WorkGraphDeltaReport;
	events: Record<string, TraceEvent>;
	append?: Record<string, AppendTraceBatchResult>;
}

const INPUT_KEYS = [
	"expectedWorkStateDigest",
	"expectedChangeId",
	"changeId",
	"changeRevisionId",
	"observedWorkGraphDigest",
	"workUnits",
	"dependencyEdges",
	"acceptanceCoverage",
	"uiPreviewTargets",
	"integrationRequirements",
	"actor",
	"rationale",
	"createdAt",
	"mode",
	"repoRoot",
	"expectedBytes",
	"runtimeJobId",
] as const;

export async function runWikiPlan(
	input: RunWikiPlanInput,
): Promise<RunWikiPlanResult> {
	return runWikiPlanForSelectedChange(input);
}

/** Project Server-only entry: selection was already derived from triggering WorkState. */
export async function runProjectServerSelectedWikiPlan(
	input: RunWikiPlanInput,
	selectedChangeId: string,
): Promise<RunWikiPlanResult> {
	return runWikiPlanForSelectedChange(input, selectedChangeId);
}

async function runWikiPlanForSelectedChange(
	input: RunWikiPlanInput,
	runtimeSelectedChangeId?: string,
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
	const selectedChangeId = runtimeSelectedChangeId || selectedPlanningChangeId(workState);
	if (selectedChangeId !== input.expectedChangeId || input.changeId !== selectedChangeId) {
		throw new Error(
			`Planning Change changed: expected ${input.expectedChangeId}, actual ${selectedChangeId}.`,
		);
	}
	if (input.observedWorkGraphDigest !== workState.workGraphDigest) {
		throw new Error("Planning Candidate observed stale Work Graph truth.");
	}
	const change = requiredApprovedChange(workState, selectedChangeId);
	const revisionId = changeContentDigest(change.record.change);
	if (input.changeRevisionId !== revisionId) {
		throw new Error("Planning Candidate Change revision is stale.");
	}
	const quality = evaluateGraphDeltaPlanning({
		changeId: selectedChangeId,
		workUnits: input.workUnits,
		dependencyEdges: input.dependencyEdges,
		acceptanceCoverage: input.acceptanceCoverage,
		integrationRequirements: input.integrationRequirements,
		workState,
	});
	const unsigned = {
		schemaVersion: 1 as const,
		observedWorkStateDigest: workState.snapshotDigest,
		observedWorkGraphDigest: workState.workGraphDigest,
		change: {
			changeId: selectedChangeId,
			traceId: change.traceId,
			changeRevision: change.record.change.revision,
			changeRevisionId: revisionId,
		},
		workUnits: normalizedWorkUnits(input.workUnits),
		dependencyEdges: normalizedDependencyEdges(input.dependencyEdges),
		acceptanceCoverage: normalizedAcceptanceCoverage(input.acceptanceCoverage),
		uiPreviewTargets: [...input.uiPreviewTargets].sort((left, right) =>
			compareText(left.targetId, right.targetId),
		),
		integrationRequirements: stringArray(
			input.integrationRequirements,
			"integrationRequirements",
		),
		qualityRef: quality.qualityRef,
		qualityStandards: quality.standards,
		exit: { status: quality.passed ? ("exit" as const) : ("continue" as const) },
	};
	const digest = planningDigest(unsigned);
	const workGraphDeltaId = `WGD-${digest.slice("sha256:".length, "sha256:".length + 20)}`;
	const report: WorkGraphDeltaReport = { ...unsigned, workGraphDeltaId, digest };
	const trace = await loadChangeTrace(repoRoot, selectedChangeId);
	if (mode === "append" && input.expectedBytes !== trace.bytes) {
		throw new Error(
			`Planning trace bytes changed for ${selectedChangeId}: expected ${String(input.expectedBytes)}, actual ${trace.bytes}.`,
		);
	}
	const event = planningEvent(trace, {
		report,
		actor: input.actor,
		rationale: input.rationale,
		createdAt,
		runtimeJobId: input.runtimeJobId,
	});
	const events = { [selectedChangeId]: event };
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
	const appended = await appendTraceRecords(repoRoot, [event], trace.bytes);
	return { mode, report, events, append: { [selectedChangeId]: appended } };
}

function planningEvent(
	trace: Awaited<ReturnType<typeof loadChangeTrace>>,
	input: {
		report: WorkGraphDeltaReport;
		actor: string;
		rationale: string;
		createdAt: string;
		runtimeJobId?: string;
	},
): TraceEvent {
	const { report, actor, rationale, createdAt, runtimeJobId } = input;
	const events = trace.records.filter(
		(record): record is TraceEvent => record.type === "trace_event",
	);
	const parent = trace.records.at(-1);
	const dependenciesByUnit = new Map<string, string[]>();
	for (const edge of report.dependencyEdges) {
		dependenciesByUnit.set(edge.fromWorkUnitId, [
			...(dependenciesByUnit.get(edge.fromWorkUnitId) || []),
			edge.toWorkUnitId,
		]);
	}
	const output = {
		workGraphDeltaId: report.workGraphDeltaId,
		digest: report.digest,
		observedWorkStateDigest: report.observedWorkStateDigest,
		observedWorkGraphDigest: report.observedWorkGraphDigest,
		change: report.change,
		workUnits: report.workUnits.map((item) => ({
			...item,
			dependsOn: dependenciesByUnit.get(item.id) || [],
			acceptanceCriteria: item.acceptanceRequirements.map((text, index) => ({
				id: `AC-${item.id}-${index + 1}`,
				text,
			})),
		})),
		dependencyEdges: report.dependencyEdges,
		acceptanceCoverage: report.acceptanceCoverage,
		uiPreviewTargets: report.uiPreviewTargets,
		integrationRequirements: report.integrationRequirements,
		actor,
		rationale,
		qualityRef: report.qualityRef,
		qualityStandards: report.qualityStandards,
	};
	return createLoopIterationEvent({
		traceId: trace.traceId,
		loop: "planning",
		id: `evt-${report.workGraphDeltaId}`,
		parentId: parent?.type === "trace_head" ? null : parent?.id || null,
		sequence: Math.max(0, ...events.map((event) => event.sequence)) + 1,
		refs: [
			report.digest,
			report.qualityRef,
			`change:${report.change.changeId}@${report.change.changeRevision}`,
			...report.workUnits.map((item) => `work:${item.id}`),
		],
		createdAt,
		iteration: events.filter((event) => event.loop === "planning").length + 1,
		trigger: "runtime.change_planning",
		output,
		exit: {
			status: "exit",
			conditions: report.qualityStandards.map((standard) => ({
				id: standard.id,
				status: "met",
				...(standard.refs ? { refs: standard.refs } : {}),
			})),
			targetLoop: "implementation",
			nextAction: "Project Server may schedule ready Work Units.",
		},
		progress: { changedRefs: report.workUnits.map((item) => `work:${item.id}`) },
		data: {
			observedWorkStateDigest: report.observedWorkStateDigest,
			...(runtimeJobId ? { runtimeJobId } : {}),
		},
	});
}

async function loadChangeTrace(repoRoot: string, changeId: string) {
	const traceId = changeTraceId(changeId);
	const path = join(repoRoot, traceFilePath(traceId));
	const snapshot = await readTraceFileSnapshot(path);
	return { changeId, traceId, path, ...snapshot };
}

function requiredApprovedChange(workState: WorkState, changeId: string) {
	const change = workState.changes.find((candidate) => candidate.id === changeId);
	if (!change) throw new Error(`Planning Change ${changeId} was not found.`);
	if (change.approval.status !== "approved") {
		throw new Error(`Planning Change ${changeId} is not approved.`);
	}
	return change;
}

function selectedPlanningChangeId(workState: WorkState): string {
	const reaction = selectProjectServerReaction(workState, { kind: "manual_resume" });
	if (reaction.selection?.loop !== "planning") {
		throw new Error("Project Server did not select Planning for current WorkState.");
	}
	return reaction.selection.change.changeId;
}

function normalizedWorkUnits(
	values: PlanningWorkUnitCandidate[],
): PlanningWorkUnitCandidate[] {
	const items = values.map((value) => ({
		...value,
		id: requiredText(value.id, "workUnits.id"),
		owningChangeId: requiredText(value.owningChangeId, "workUnits.owningChangeId"),
		title: requiredText(value.title, "workUnits.title"),
		outcome: requiredText(value.outcome, "workUnits.outcome"),
		technicalRequirements: stringArray(value.technicalRequirements, "workUnits.technicalRequirements"),
		acceptanceRequirements: stringArray(value.acceptanceRequirements, "workUnits.acceptanceRequirements"),
		componentRefs: stringArray(value.componentRefs, "workUnits.componentRefs"),
		pathScopes: stringArray(value.pathScopes, "workUnits.pathScopes"),
		verification: stringArray(value.verification, "workUnits.verification"),
		resourceRequirements: {
			capabilityIds: stringArray(value.resourceRequirements.capabilityIds, "workUnits.resourceRequirements.capabilityIds"),
			toolIds: stringArray(value.resourceRequirements.toolIds, "workUnits.resourceRequirements.toolIds"),
			skillIds: stringArray(value.resourceRequirements.skillIds, "workUnits.resourceRequirements.skillIds"),
			custodyRequirements: stringArray(value.resourceRequirements.custodyRequirements, "workUnits.resourceRequirements.custodyRequirements"),
			budgetClass: requiredText(value.resourceRequirements.budgetClass, "workUnits.resourceRequirements.budgetClass"),
		},
	}));
	assertUnique(items.map((item) => item.id), "Work Unit ids");
	return items.sort((left, right) => compareText(left.id, right.id));
}

function normalizedDependencyEdges(values: PlanningDependencyEdge[]) {
	return values
		.map((edge) => ({ ...edge }))
		.sort((left, right) =>
			compareText(
				`${left.fromWorkUnitId}:${left.toWorkUnitId}:${left.kind}`,
				`${right.fromWorkUnitId}:${right.toWorkUnitId}:${right.kind}`,
			),
		);
}

function normalizedAcceptanceCoverage(values: PlanningAcceptanceCoverage[]) {
	return values
		.map((entry) => ({
			acceptanceRequirement: requiredText(entry.acceptanceRequirement, "acceptanceCoverage.acceptanceRequirement"),
			workUnitIds: stringArray(entry.workUnitIds, "acceptanceCoverage.workUnitIds"),
		}))
		.sort((left, right) => compareText(left.acceptanceRequirement, right.acceptanceRequirement));
}

function assertInput(input: RunWikiPlanInput): void {
	if (!input || typeof input !== "object") throw new Error("wiki_plan requires input object.");
	for (const key of Object.keys(input)) {
		if (!(INPUT_KEYS as readonly string[]).includes(key)) {
			throw new Error(`wiki_plan received unsupported input field ${key}.`);
		}
	}
	for (const [field, value] of [
		["expectedWorkStateDigest", input.expectedWorkStateDigest],
		["changeRevisionId", input.changeRevisionId],
		["observedWorkGraphDigest", input.observedWorkGraphDigest],
	] as const) {
		if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error(`wiki_plan ${field} must be a sha256 digest.`);
	}
	for (const value of [input.workUnits, input.dependencyEdges, input.acceptanceCoverage, input.uiPreviewTargets, input.integrationRequirements]) {
		if (!Array.isArray(value)) throw new Error("wiki_plan graph delta collections must be arrays.");
	}
	requiredText(input.expectedChangeId, "expectedChangeId");
	requiredText(input.changeId, "changeId");
	requiredText(input.actor, "actor");
	requiredText(input.rationale, "rationale");
	assertProjectServerSemanticJobId(input.runtimeJobId, "wiki_plan");
	if (input.mode && !["preview", "append"].includes(input.mode)) throw new Error("wiki_plan mode is invalid.");
}

function planningDigest(value: unknown): string {
	return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function timestamp(value: string | undefined): string {
	const candidate = value || new Date().toISOString();
	if (Number.isNaN(Date.parse(candidate))) throw new Error("wiki_plan createdAt must be an ISO timestamp.");
	return new Date(candidate).toISOString();
}

function requiredText(value: string | undefined, field: string): string {
	if (!value?.trim()) throw new Error(`wiki_plan ${field} is required.`);
	return value.trim();
}

function stringArray(value: unknown, field: string): string[] {
	if (!Array.isArray(value)) throw new Error(`wiki_plan ${field} must be an array.`);
	return [...new Set(value.map((entry) => requiredText(typeof entry === "string" ? entry : undefined, field)))].sort(compareText);
}

function assertUnique(values: string[], field: string): void {
	if (new Set(values).size !== values.length) throw new Error(`wiki_plan ${field} must be unique.`);
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}
