import {
	runWikiDecide,
	type RunWikiDecideInput,
	type RunWikiDecideResult,
} from "../../loops/decision/command.ts";
import {
	runProjectServerSelectedWikiImplement,
	type ImplementationEvidenceSubmission,
	type RunWikiImplementInput,
	type RunWikiImplementResult,
} from "../commands/implementation.ts";
import {
	runProjectServerSelectedWikiPlan,
	type RunWikiPlanInput,
	type RunWikiPlanResult,
} from "../commands/planning.ts";
import {
	parseDecisionCandidateProposal,
	type DecisionCandidateProposal,
	type ProjectServerDecisionAuthority,
} from "../../loops/decision/candidate-proposal.ts";
import { TraceAppendConflictError } from "../../changes/trace/storage-errors.ts";
import type { CandidateProducerPort } from "../../runtime/contracts.ts";
import {
	parseImplementationCandidateContent,
	type ImplementationCandidateContent,
} from "../../loops/implementation/candidate-content.ts";
import type { ImplementationWorkerReportInput } from "../../loops/implementation/workers.ts";
import {
	parsePlanningCandidateContent,
	type PlanningCandidateContent,
} from "../../loops/planning/candidate-content.ts";
import type {
	WorkStateAssignment,
	WorkStateChange,
	WorkStateSprint,
	WorkStateWorkItem,
} from "../../work-state/types.ts";
import {
	ProjectServerReactor,
	runtimeReactionsShareInvariant,
	type ProjectServerObservation,
	type ProjectServerReaction,
	type ProjectServerTrigger,
} from "./reactor.ts";

export type ProjectServerSemanticMode = "preview" | "append";

export interface ProjectServerDecisionContext {
	authority: ProjectServerDecisionAuthority;
	occurredAt?: string;
}

export interface ProjectServerPlanningContext {
	actor: string;
	createdAt?: string;
}

export interface ProjectServerImplementationContext {
	createdAt?: string;
}

export interface ProjectServerSemanticContext {
	decision?: ProjectServerDecisionContext;
	planning?: ProjectServerPlanningContext;
	implementation?: ProjectServerImplementationContext;
}

export interface ProjectServerDecisionInvocation {
	loop: "decision";
	observedWorkStateDigest: string;
	change: WorkStateChange;
}

export interface ProjectServerPlanningInvocation {
	loop: "planning";
	observedWorkStateDigest: string;
	changes: WorkStateChange[];
}

export interface ProjectServerImplementationInvocation {
	loop: "implementation";
	observedWorkStateDigest: string;
	sprint: WorkStateSprint;
	workItems: WorkStateWorkItem[];
	assignments: WorkStateAssignment[];
	workerReports: ImplementationWorkerReportInput[];
}

export interface ProjectServerSemanticAdapters {
	decision?: CandidateProducerPort<
		ProjectServerDecisionInvocation,
		DecisionCandidateProposal
	>;
	planning?: CandidateProducerPort<
		ProjectServerPlanningInvocation,
		PlanningCandidateContent
	>;
	implementation?: CandidateProducerPort<
		ProjectServerImplementationInvocation,
		ImplementationCandidateContent
	>;
}

/** Project Server-selected Loop execution capabilities supplied by outer composition. */
export interface ProjectServerLoopExecutionPorts {
	decision?: (
		input: RunWikiDecideInput,
	) => Promise<RunWikiDecideResult>;
	planning?: (
		input: RunWikiPlanInput,
		selectedChangeIds: string[],
	) => Promise<RunWikiPlanResult>;
	implementation?: (
		input: RunWikiImplementInput,
		observation: ProjectServerObservation,
		beforeAppend?: () => void | Promise<void>,
	) => Promise<RunWikiImplementResult>;
}

/** Bind domain-owned Loop commands to Project Server's injected execution contract. */
export function createCodeWikiLoopExecutionPorts(): ProjectServerLoopExecutionPorts {
	return {
		decision: runWikiDecide,
		planning: runProjectServerSelectedWikiPlan,
		implementation: runProjectServerSelectedWikiImplement,
	};
}

export type ProjectServerSemanticOutcome =
	| { loop: "decision"; result: RunWikiDecideResult }
	| { loop: "planning"; result: RunWikiPlanResult }
	| { loop: "implementation"; result: RunWikiImplementResult };

export interface RunProjectServerSemanticExecutorInput {
	repoRoot: string;
	trigger: ProjectServerTrigger;
	adapters: ProjectServerSemanticAdapters;
	executionPorts: ProjectServerLoopExecutionPorts;
	context?: ProjectServerSemanticContext;
	mode?: ProjectServerSemanticMode;
	maxIterations?: number;
	maxCasRetries?: number;
	maxWallClockMs?: number;
	reactor?: ProjectServerReactor;
}

export interface RunProjectServerSemanticExecutorResult {
	status: "quiescent" | "previewed" | "routed" | "budget_exhausted";
	mode: ProjectServerSemanticMode;
	iterations: number;
	casRetries: number;
	outcomes: ProjectServerSemanticOutcome[];
	reaction: ProjectServerReaction;
}

export interface RunProjectServerSelectedSemanticReactionInput {
	repoRoot: string;
	reaction: ProjectServerReaction;
	runtimeJobId: string;
	adapters: ProjectServerSemanticAdapters;
	executionPorts: ProjectServerLoopExecutionPorts;
	context?: ProjectServerSemanticContext;
	mode?: ProjectServerSemanticMode;
	maxCasRetries?: number;
	reactor?: ProjectServerReactor;
	signal?: AbortSignal;
	implementationWorkerReports?: ImplementationWorkerReportInput[];
	beforeAppend?: () => void | Promise<void>;
}

export interface RunProjectServerSelectedSemanticReactionResult {
	status: "completed" | "previewed" | "routed" | "stale";
	mode: ProjectServerSemanticMode;
	casRetries: number;
	outcome?: ProjectServerSemanticOutcome;
	reaction: ProjectServerReaction;
}

/** Execute one coordinator-selected invariant without drifting into another lane. */
export async function runProjectServerSelectedSemanticReaction(
	input: RunProjectServerSelectedSemanticReactionInput,
): Promise<RunProjectServerSelectedSemanticReactionResult> {
	if (input.reaction.status !== "ready" || !input.reaction.selection) {
		throw new Error("Project Server selected semantic reaction must be ready.");
	}
	if (input.reaction.selection.loop === "decision") {
		throw new Error(
			"Project Server Decision execution requires authenticated exact-revision selection.",
		);
	}
	const mode = input.mode || "append";
	const maxCasRetries = boundedInteger(
		input.maxCasRetries,
		2,
		0,
		8,
		"maxCasRetries",
	);
	const reactor = input.reactor || new ProjectServerReactor(input.repoRoot);
	let casRetries = 0;
	let observation = await observeSelectedReaction({
		reactor,
		expected: input.reaction,
	});
	while (observation) {
		input.signal?.throwIfAborted();
		try {
			const outcome = await executeSelectedSemanticWork({
				repoRoot: input.repoRoot,
				mode,
				observation,
				adapters: input.adapters,
				executionPorts: input.executionPorts,
				context: input.context,
				runtimeJobId: input.runtimeJobId,
				beforeAppend: input.beforeAppend,
				implementationWorkerReports: input.implementationWorkerReports,
			});
			if (mode === "preview") {
				return {
					status: "previewed",
					mode,
					casRetries,
					outcome,
					reaction: observation.reaction,
				};
			}
			return {
				status: outcomeRoutesBack(outcome) ? "routed" : "completed",
				mode,
				casRetries,
				outcome,
				reaction: observation.reaction,
			};
		} catch (error) {
			if (!isCasConflict(error) || casRetries >= maxCasRetries) throw error;
			casRetries += 1;
			reactor.invalidate();
			observation = await observeSelectedReaction({
				reactor,
				expected: input.reaction,
			});
		}
	}
	return {
		status: "stale",
		mode,
		casRetries,
		reaction: input.reaction,
	};
}

/**
 * Invoke only runtime-selected semantic work. Adapters propose semantic facts;
 * runtime injects canonical entity identity, freshness guards, and append CAS.
 */
export async function runProjectServerSemanticExecutor(
	input: RunProjectServerSemanticExecutorInput,
): Promise<RunProjectServerSemanticExecutorResult> {
	const mode = input.mode || "append";
	const maxIterations = boundedInteger(
		input.maxIterations,
		8,
		1,
		64,
		"maxIterations",
	);
	const maxCasRetries = boundedInteger(
		input.maxCasRetries,
		2,
		0,
		8,
		"maxCasRetries",
	);
	const maxWallClockMs = boundedInteger(
		input.maxWallClockMs,
		30_000,
		1,
		600_000,
		"maxWallClockMs",
	);
	const reactor = input.reactor || new ProjectServerReactor(input.repoRoot);
	const startedAt = Date.now();
	const outcomes: ProjectServerSemanticOutcome[] = [];
	let trigger = input.trigger;
	let iterations = 0;
	let casRetries = 0;
	let observation = await reactor.observe(trigger);

	while (observation.reaction.status === "ready") {
		if (
			iterations >= maxIterations ||
			Date.now() - startedAt >= maxWallClockMs
		) {
			return executionResult(
				"budget_exhausted",
				mode,
				iterations,
				casRetries,
				outcomes,
				observation.reaction,
			);
		}
		try {
			const outcome = await executeSelectedSemanticWork({
				repoRoot: input.repoRoot,
				mode,
				observation,
				adapters: input.adapters,
				executionPorts: input.executionPorts,
				context: input.context,
			});
			outcomes.push(outcome);
			iterations += 1;
			if (mode === "preview") {
				return executionResult(
					"previewed",
					mode,
					iterations,
					casRetries,
					outcomes,
					observation.reaction,
				);
			}
			if (outcomeRoutesBack(outcome)) {
				return executionResult(
					"routed",
					mode,
					iterations,
					casRetries,
					outcomes,
					observation.reaction,
				);
			}
			invalidateOutcomeTraces(reactor, outcome);
			trigger = {
				kind: "project_truth_changed",
				refs: outcomeTraceRefs(outcome),
			};
			observation = await reactor.observe(trigger);
		} catch (error) {
			if (!isCasConflict(error) || casRetries >= maxCasRetries) throw error;
			casRetries += 1;
			reactor.invalidate();
			observation = await reactor.observe(trigger);
		}
	}

	return executionResult(
		"quiescent",
		mode,
		iterations,
		casRetries,
		outcomes,
		observation.reaction,
	);
}

async function observeSelectedReaction(input: {
	readonly reactor: ProjectServerReactor;
	readonly expected: ProjectServerReaction;
}): Promise<ProjectServerObservation | undefined> {
	const observation = await input.reactor.observeMany(input.expected.trigger, {
		maxReactions: 32,
	});
	const reaction = observation.reactions.find((candidate) =>
		runtimeReactionsShareInvariant(input.expected, candidate),
	);
	return reaction ? {...observation, reaction} : undefined;
}

async function executeSelectedSemanticWork(input: {
	readonly repoRoot: string;
	readonly mode: ProjectServerSemanticMode;
	readonly observation: ProjectServerObservation;
	readonly adapters: ProjectServerSemanticAdapters;
	readonly executionPorts: ProjectServerLoopExecutionPorts;
	readonly context?: ProjectServerSemanticContext;
	readonly runtimeJobId?: string;
	readonly beforeAppend?: () => void | Promise<void>;
	readonly implementationWorkerReports?: ImplementationWorkerReportInput[];
}): Promise<ProjectServerSemanticOutcome> {
	const {
		repoRoot,
		mode,
		observation,
		adapters,
		executionPorts,
		context,
		runtimeJobId,
		beforeAppend,
	} = input;
	const implementationWorkerReports = input.implementationWorkerReports || [];
	const selection = observation.reaction.selection;
	if (!selection) throw new Error("Project Server ready reaction has no selection.");
	if (selection.loop === "decision") {
		if (!executionPorts.decision) throw missingExecutionPort("decision");
		if (!adapters.decision) throw missingAdapter("decision");
		const change = requiredChange(observation, selection.change.changeId);
		const candidate = parseDecisionCandidateProposal(
			await adapters.decision({
				loop: "decision",
				observedWorkStateDigest: observation.workState.snapshotDigest,
				change,
			}),
		);
		const coreInput: RunWikiDecideInput = {
			...candidate,
			...requiredDecisionContext(context),
			repoRoot,
			changeId: selection.change.changeId,
			expectedRevision: selection.change.changeRevision,
			expectedChangeDigest: selection.change.changeDigest,
			expectedWorkStateDigest: observation.workState.snapshotDigest,
			runtimeJobId,
			mode: "preview",
		};
		const preview = await executionPorts.decision(coreInput);
		if (mode === "preview" || preview.report.exit.status !== "exit") {
			return { loop: "decision", result: preview };
		}
		await beforeAppend?.();
		return {
			loop: "decision",
			result: await executionPorts.decision({
				...coreInput,
				mode: "append",
				expectedBytes: requiredTraceBytes(
					observation,
					selection.change.traceId,
				),
			}),
		};
	}
	if (selection.loop === "planning") {
		if (!executionPorts.planning) throw missingExecutionPort("planning");
		if (!adapters.planning) throw missingAdapter("planning");
		const changes = selection.planningHorizon.map((entry) =>
			requiredChange(observation, entry.changeId),
		);
		const candidate = parsePlanningCandidateContent(
			await adapters.planning({
				loop: "planning",
				observedWorkStateDigest: observation.workState.snapshotDigest,
				changes,
			}),
		);
		const expectedChangeIds = selection.planningHorizon.map(
			(entry) => entry.changeId,
		);
		const coreInput: RunWikiPlanInput = {
			...runtimePlanningContent(candidate),
			...requiredPlanningContext(context),
			repoRoot,
			expectedWorkStateDigest: observation.workState.snapshotDigest,
			expectedChangeIds,
			runtimeJobId,
			mode: "preview",
		};
		const preview = await executionPorts.planning(
			coreInput,
			expectedChangeIds,
		);
		if (mode === "preview" || preview.report.exit.status !== "exit") {
			return { loop: "planning", result: preview };
		}
		await beforeAppend?.();
		return {
			loop: "planning",
			result: await executionPorts.planning(
				{
					...coreInput,
					mode: "append",
					expectedBytesByChangeId: Object.fromEntries(
						selection.planningHorizon.map((entry) => [
							entry.changeId,
							requiredTraceBytes(observation, entry.traceId),
						]),
					),
				},
				expectedChangeIds,
			),
		};
	}
	if (!executionPorts.implementation) {
		throw missingExecutionPort("implementation");
	}
	if (!adapters.implementation) throw missingAdapter("implementation");
	const sprint = observation.workState.sprints.find(
		(candidate) => candidate.id === selection.sprintId,
	);
	if (!sprint)
		throw new Error(`Project Server Sprint ${selection.sprintId} was not found.`);
	const selectedIds = new Set(selection.workItemIds);
	const workItems = observation.workState.workItems.filter((item) =>
		selectedIds.has(item.id),
	);
	const assignments = observation.workState.assignments.filter((assignment) =>
		selectedIds.has(assignment.workItemId),
	);
	const selectedWorkerReports = runtimeSelectedWorkerReports(
		selection.workItemIds,
		assignments,
		implementationWorkerReports,
	);
	const candidate = parseImplementationCandidateContent(
		await adapters.implementation({
			loop: "implementation",
			observedWorkStateDigest: observation.workState.snapshotDigest,
			sprint,
			workItems,
			assignments,
			workerReports: selectedWorkerReports,
		}),
	);
	const { evidence, ...candidateContent } = candidate;
	return {
		loop: "implementation",
		result: await executionPorts.implementation(
			{
				...candidateContent,
				...(evidence
					? { evidence: runtimeImplementationEvidence(evidence) }
					: {}),
				...context?.implementation,
				repoRoot,
				expectedWorkStateDigest: observation.workState.snapshotDigest,
				workerReports: selectedWorkerReports,
				runtimeJobId,
				mode,
			},
			observation,
			beforeAppend,
		),
	};
}

function runtimePlanningContent(candidate: PlanningCandidateContent) {
	return {
		...candidate,
		workItems: candidate.workItems.map(
			({ acceptanceRequirements, ...workItem }) => ({
				...workItem,
				acceptanceCriteria: acceptanceRequirements,
			}),
		),
	};
}

function runtimeImplementationEvidence(
	evidence: NonNullable<ImplementationCandidateContent["evidence"]>,
): ImplementationEvidenceSubmission[] {
	return evidence.map(
		({ commands, commandResults, acceptanceEvidenceItems, ...entry }) => ({
			...entry,
			...(commands ? { checks: commands } : {}),
			...(commandResults
				? {
						checkResults: commandResults.map(
							({ acceptanceRequirementId, ...result }) => ({
								...result,
								...(acceptanceRequirementId
									? { criterionId: acceptanceRequirementId }
									: {}),
							}),
						),
					}
				: {}),
			...(acceptanceEvidenceItems
				? {
						acceptanceEvidenceItems: acceptanceEvidenceItems.map(
							({ acceptanceRequirementId, ...item }) => ({
								...item,
								...(acceptanceRequirementId
									? { criterionId: acceptanceRequirementId }
									: {}),
							}),
						),
					}
				: {}),
		}),
	);
}

function requiredChange(
	observation: ProjectServerObservation,
	changeId: string,
): WorkStateChange {
	const change = observation.workState.changes.find(
		(candidate) => candidate.id === changeId,
	);
	if (!change) throw new Error(`Project Server Change ${changeId} was not found.`);
	return change;
}

function runtimeSelectedWorkerReports(
	workItemIds: string[],
	assignments: WorkStateAssignment[],
	workerReports: ImplementationWorkerReportInput[],
): ImplementationWorkerReportInput[] {
	if (workerReports.length === 0) return [];
	const selected = new Set(workItemIds);
	const seen = new Set<string>();
	for (const result of workerReports) {
		if (!selected.has(result.workUnitId) || seen.has(result.workUnitId)) {
			throw new Error(
				`Project Server Implementation worker report ${result.workUnitId} is not an exact selected Work Item.`,
			);
		}
		seen.add(result.workUnitId);
		const assignment = assignments.find(
			(candidate) =>
				candidate.status === "claimed" &&
				candidate.workItemId === result.workUnitId &&
				candidate.id === result.claimId &&
				candidate.workerId === result.workerId,
		);
		if (!assignment) {
			throw new Error(
				`Project Server Implementation worker report ${result.workUnitId} does not match its active Assignment.`,
			);
		}
	}
	for (const workItemId of selected) {
		if (!seen.has(workItemId)) {
			throw new Error(
				`Project Server Implementation worker report is missing for ${workItemId}.`,
			);
		}
	}
	return workerReports;
}

function requiredTraceBytes(
	observation: ProjectServerObservation,
	traceId: string,
): number {
	const bytes = observation.expectedBytesByTrace[traceId];
	if (!Number.isInteger(bytes) || bytes < 0) {
		throw new Error(`Project Server has no append handle for ${traceId}.`);
	}
	return bytes;
}

function outcomeRoutesBack(outcome: ProjectServerSemanticOutcome): boolean {
	if (outcome.loop === "decision") {
		return outcome.result.report.exit.status !== "exit";
	}
	if (outcome.loop === "planning") {
		return outcome.result.report.exit.status !== "exit";
	}
	const exit = outcome.result.loopResult.exit;
	return (
		!exit.passed ||
		exit.route === "decision" ||
		exit.route === "planning" ||
		exit.route === "user"
	);
}

function invalidateOutcomeTraces(
	reactor: ProjectServerReactor,
	outcome: ProjectServerSemanticOutcome,
): void {
	for (const traceId of outcomeTraceRefs(outcome)) reactor.invalidate(traceId);
}

function outcomeTraceRefs(outcome: ProjectServerSemanticOutcome): string[] {
	if (outcome.loop === "decision") return [outcome.result.traceId];
	if (outcome.loop === "implementation") return [outcome.result.traceId];
	return outcome.result.report.participantChanges.map((entry) => entry.traceId);
}

function isCasConflict(error: unknown): boolean {
	return (
		error instanceof TraceAppendConflictError ||
		(error instanceof Error &&
			/(?:trace bytes changed|append conflict|WorkState changed)/i.test(
				error.message,
			))
	);
}

function requiredDecisionContext(
	context: ProjectServerSemanticContext | undefined,
): ProjectServerDecisionContext {
	if (!context?.decision) {
		throw new Error("Project Server decision context is required.");
	}
	return context.decision;
}

function requiredPlanningContext(
	context: ProjectServerSemanticContext | undefined,
): ProjectServerPlanningContext {
	if (!context?.planning) {
		throw new Error("Project Server planning context is required.");
	}
	return context.planning;
}

function missingAdapter(loop: string): Error {
	return new Error(
		`Project Server selected ${loop}, but no ${loop} adapter is attached.`,
	);
}

function missingExecutionPort(loop: string): Error {
	return new Error(`Project Server ${loop} execution port is unavailable.`);
}

function boundedInteger(
	value: number | undefined,
	fallback: number,
	minimum: number,
	maximum: number,
	field: string,
): number {
	const resolved = value ?? fallback;
	if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
		throw new Error(
			`Project Server ${field} must be an integer from ${minimum} to ${maximum}.`,
		);
	}
	return resolved;
}

function executionResult(
	status: RunProjectServerSemanticExecutorResult["status"],
	mode: ProjectServerSemanticMode,
	iterations: number,
	casRetries: number,
	outcomes: ProjectServerSemanticOutcome[],
	reaction: ProjectServerReaction,
): RunProjectServerSemanticExecutorResult {
	return { status, mode, iterations, casRetries, outcomes, reaction };
}
