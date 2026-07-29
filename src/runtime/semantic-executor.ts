import {
	runWikiDecide,
	type RunWikiDecideInput,
	type RunWikiDecideResult,
} from "../api/wiki-decide.ts";
import {
	runRuntimeSelectedWikiImplement,
	type ImplementationEvidenceSubmission,
	type RunWikiImplementResult,
} from "../api/wiki-implement.ts";
import {
	runRuntimeSelectedWikiPlan,
	type RunWikiPlanInput,
	type RunWikiPlanResult,
} from "../api/wiki-plan.ts";
import {
	parseDecisionCandidateContent,
	type DecisionCandidateContent,
} from "../decision/candidate-content.ts";
import type { ChangeDecisionAuthority } from "../decision/change-quality.ts";
import { TraceAppendConflictError } from "../error-handling/trace-errors.ts";
import {
	parseImplementationCandidateContent,
	type ImplementationCandidateContent,
} from "../implementation/candidate-content.ts";
import type { ImplementationWorkerReportInput } from "../implementation/workers.ts";
import {
	parsePlanningCandidateContent,
	type PlanningCandidateContent,
} from "../planning/candidate-content.ts";
import type {
	WorkStateAssignment,
	WorkStateChange,
	WorkStateSprint,
	WorkStateWorkItem,
} from "../work-state/types.ts";
import {
	RuntimeReactor,
	runtimeReactionsShareInvariant,
	type RuntimeObservation,
	type RuntimeReaction,
	type RuntimeTrigger,
} from "./reactor.ts";

export type RuntimeSemanticMode = "preview" | "append";

export interface RuntimeDecisionContext {
	authority: ChangeDecisionAuthority;
	occurredAt?: string;
}

export interface RuntimePlanningContext {
	actor: string;
	createdAt?: string;
}

export interface RuntimeImplementationContext {
	createdAt?: string;
}

export interface RuntimeSemanticContext {
	decision?: RuntimeDecisionContext;
	planning?: RuntimePlanningContext;
	implementation?: RuntimeImplementationContext;
}

export interface RuntimeDecisionInvocation {
	loop: "decision";
	observedWorkStateDigest: string;
	change: WorkStateChange;
}

export interface RuntimePlanningInvocation {
	loop: "planning";
	observedWorkStateDigest: string;
	changes: WorkStateChange[];
}

export interface RuntimeImplementationInvocation {
	loop: "implementation";
	observedWorkStateDigest: string;
	sprint: WorkStateSprint;
	workItems: WorkStateWorkItem[];
	assignments: WorkStateAssignment[];
	workerReports: ImplementationWorkerReportInput[];
}

export interface RuntimeSemanticAdapters {
	decision?: (
		input: RuntimeDecisionInvocation,
	) => DecisionCandidateContent | Promise<DecisionCandidateContent>;
	planning?: (
		input: RuntimePlanningInvocation,
	) => PlanningCandidateContent | Promise<PlanningCandidateContent>;
	implementation?: (
		input: RuntimeImplementationInvocation,
	) => ImplementationCandidateContent | Promise<ImplementationCandidateContent>;
}

export type RuntimeSemanticOutcome =
	| { loop: "decision"; result: RunWikiDecideResult }
	| { loop: "planning"; result: RunWikiPlanResult }
	| { loop: "implementation"; result: RunWikiImplementResult };

export interface RunRuntimeSemanticExecutorInput {
	repoRoot: string;
	trigger: RuntimeTrigger;
	adapters: RuntimeSemanticAdapters;
	context?: RuntimeSemanticContext;
	mode?: RuntimeSemanticMode;
	maxIterations?: number;
	maxCasRetries?: number;
	maxWallClockMs?: number;
	reactor?: RuntimeReactor;
}

export interface RunRuntimeSemanticExecutorResult {
	status: "quiescent" | "previewed" | "routed" | "budget_exhausted";
	mode: RuntimeSemanticMode;
	iterations: number;
	casRetries: number;
	outcomes: RuntimeSemanticOutcome[];
	reaction: RuntimeReaction;
}

export interface RunRuntimeSelectedSemanticReactionInput {
	repoRoot: string;
	reaction: RuntimeReaction;
	runtimeJobId: string;
	adapters: RuntimeSemanticAdapters;
	context?: RuntimeSemanticContext;
	mode?: RuntimeSemanticMode;
	maxCasRetries?: number;
	reactor?: RuntimeReactor;
	signal?: AbortSignal;
	implementationWorkerReports?: ImplementationWorkerReportInput[];
	beforeAppend?: () => void | Promise<void>;
}

export interface RunRuntimeSelectedSemanticReactionResult {
	status: "completed" | "previewed" | "routed" | "stale";
	mode: RuntimeSemanticMode;
	casRetries: number;
	outcome?: RuntimeSemanticOutcome;
	reaction: RuntimeReaction;
}

/** Execute one coordinator-selected invariant without drifting into another lane. */
export async function runRuntimeSelectedSemanticReaction(
	input: RunRuntimeSelectedSemanticReactionInput,
): Promise<RunRuntimeSelectedSemanticReactionResult> {
	if (input.reaction.status !== "ready" || !input.reaction.selection) {
		throw new Error("Runtime selected semantic reaction must be ready.");
	}
	const mode = input.mode || "append";
	const maxCasRetries = boundedInteger(
		input.maxCasRetries,
		2,
		0,
		8,
		"maxCasRetries",
	);
	const reactor = input.reactor || new RuntimeReactor(input.repoRoot);
	let casRetries = 0;
	let observation = await observeSelectedReaction(reactor, input.reaction);
	while (observation) {
		input.signal?.throwIfAborted();
		try {
			const outcome = await executeSelectedSemanticWork(
				input.repoRoot,
				mode,
				observation,
				input.adapters,
				input.context,
				input.runtimeJobId,
				input.beforeAppend,
				input.implementationWorkerReports,
			);
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
			observation = await observeSelectedReaction(reactor, input.reaction);
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
export async function runRuntimeSemanticExecutor(
	input: RunRuntimeSemanticExecutorInput,
): Promise<RunRuntimeSemanticExecutorResult> {
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
	const reactor = input.reactor || new RuntimeReactor(input.repoRoot);
	const startedAt = Date.now();
	const outcomes: RuntimeSemanticOutcome[] = [];
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
			const outcome = await executeSelectedSemanticWork(
				input.repoRoot,
				mode,
				observation,
				input.adapters,
				input.context,
			);
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

async function observeSelectedReaction(
	reactor: RuntimeReactor,
	expected: RuntimeReaction,
): Promise<RuntimeObservation | undefined> {
	const observation = await reactor.observeMany(expected.trigger, {
		maxReactions: 32,
	});
	const reaction = observation.reactions.find((candidate) =>
		runtimeReactionsShareInvariant(expected, candidate),
	);
	return reaction ? { ...observation, reaction } : undefined;
}

async function executeSelectedSemanticWork(
	repoRoot: string,
	mode: RuntimeSemanticMode,
	observation: RuntimeObservation,
	adapters: RuntimeSemanticAdapters,
	context?: RuntimeSemanticContext,
	runtimeJobId?: string,
	beforeAppend?: () => void | Promise<void>,
	implementationWorkerReports: ImplementationWorkerReportInput[] = [],
): Promise<RuntimeSemanticOutcome> {
	const selection = observation.reaction.selection;
	if (!selection) throw new Error("Runtime ready reaction has no selection.");
	if (selection.loop === "decision") {
		if (!adapters.decision) throw missingAdapter("decision");
		const change = requiredChange(observation, selection.change.changeId);
		const candidate = parseDecisionCandidateContent(
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
		const preview = await runWikiDecide(coreInput);
		if (mode === "preview" || preview.report.exit.status !== "exit") {
			return { loop: "decision", result: preview };
		}
		await beforeAppend?.();
		return {
			loop: "decision",
			result: await runWikiDecide({
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
			...candidate,
			...requiredPlanningContext(context),
			repoRoot,
			expectedWorkStateDigest: observation.workState.snapshotDigest,
			expectedChangeIds,
			runtimeJobId,
			mode: "preview",
		};
		const preview = await runRuntimeSelectedWikiPlan(
			coreInput,
			expectedChangeIds,
		);
		if (mode === "preview" || preview.report.exit.status !== "exit") {
			return { loop: "planning", result: preview };
		}
		await beforeAppend?.();
		return {
			loop: "planning",
			result: await runRuntimeSelectedWikiPlan(
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
	if (!adapters.implementation) throw missingAdapter("implementation");
	const sprint = observation.workState.sprints.find(
		(candidate) => candidate.id === selection.sprintId,
	);
	if (!sprint)
		throw new Error(`Runtime Sprint ${selection.sprintId} was not found.`);
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
		result: await runRuntimeSelectedWikiImplement(
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

function runtimeImplementationEvidence(
	evidence: NonNullable<ImplementationCandidateContent["evidence"]>,
): ImplementationEvidenceSubmission[] {
	return evidence.map(({ commands, commandResults, ...entry }) => ({
		...entry,
		...(commands ? { checks: commands } : {}),
		...(commandResults ? { checkResults: commandResults } : {}),
	}));
}

function requiredChange(
	observation: RuntimeObservation,
	changeId: string,
): WorkStateChange {
	const change = observation.workState.changes.find(
		(candidate) => candidate.id === changeId,
	);
	if (!change) throw new Error(`Runtime Change ${changeId} was not found.`);
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
				`Runtime Implementation worker report ${result.workUnitId} is not an exact selected Work Item.`,
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
				`Runtime Implementation worker report ${result.workUnitId} does not match its active Assignment.`,
			);
		}
	}
	for (const workItemId of selected) {
		if (!seen.has(workItemId)) {
			throw new Error(
				`Runtime Implementation worker report is missing for ${workItemId}.`,
			);
		}
	}
	return workerReports;
}

function requiredTraceBytes(
	observation: RuntimeObservation,
	traceId: string,
): number {
	const bytes = observation.expectedBytesByTrace[traceId];
	if (!Number.isInteger(bytes) || bytes < 0) {
		throw new Error(`Runtime has no append handle for ${traceId}.`);
	}
	return bytes;
}

function outcomeRoutesBack(outcome: RuntimeSemanticOutcome): boolean {
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
	reactor: RuntimeReactor,
	outcome: RuntimeSemanticOutcome,
): void {
	for (const traceId of outcomeTraceRefs(outcome)) reactor.invalidate(traceId);
}

function outcomeTraceRefs(outcome: RuntimeSemanticOutcome): string[] {
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
	context: RuntimeSemanticContext | undefined,
): RuntimeDecisionContext {
	if (!context?.decision) {
		throw new Error("Runtime decision context is required.");
	}
	return context.decision;
}

function requiredPlanningContext(
	context: RuntimeSemanticContext | undefined,
): RuntimePlanningContext {
	if (!context?.planning) {
		throw new Error("Runtime planning context is required.");
	}
	return context.planning;
}

function missingAdapter(loop: string): Error {
	return new Error(
		`Runtime selected ${loop}, but no ${loop} adapter is attached.`,
	);
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
			`Runtime ${field} must be an integer from ${minimum} to ${maximum}.`,
		);
	}
	return resolved;
}

function executionResult(
	status: RunRuntimeSemanticExecutorResult["status"],
	mode: RuntimeSemanticMode,
	iterations: number,
	casRetries: number,
	outcomes: RuntimeSemanticOutcome[],
	reaction: RuntimeReaction,
): RunRuntimeSemanticExecutorResult {
	return { status, mode, iterations, casRetries, outcomes, reaction };
}
