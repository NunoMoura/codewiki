import {
	qualifiedCheckId,
	type CheckExecutionFact,
	type CheckExecutionIdentity,
	type CheckInputSelection,
	type CheckInputSelector,
	type CheckInvocation,
	type CheckResult,
	type CheckSubject,
	type GateReport,
	type GateStopReason,
} from "./contracts.ts";
import {
	InMemoryCheckResultCache,
	checkResultCacheKey,
	type CheckResultCache,
} from "./cache.ts";
import {
	admitCheckOutput,
	assembleCheckInvocation,
	createCheckInputSelection,
	subjectInputSelection,
	type CreateCheckInputSelectionInput,
} from "./protocol.ts";
import {
	assertValidCheckResult,
	createCheckResult,
	createGateReport,
} from "./results.ts";
import {
	assertCheckPackSnapshot,
	packagedChecks,
	type CheckPackSnapshot,
	type PackagedCheck,
} from "./packs/contracts.ts";
import {canonicalJsonDigest} from "../utils/canonical-json.ts";

export interface CheckExecutorContext {
	readonly check: PackagedCheck;
	readonly invocation: CheckInvocation;
	readonly implementation: PackagedCheck["implementation"];
	readonly signal: AbortSignal;
}

export interface CheckExecutor {
	readonly identity: CheckExecutionIdentity;
	supports(check: PackagedCheck): boolean;
	execute(context: CheckExecutorContext): unknown | Promise<unknown>;
}

export interface CheckInputResolverContext {
	readonly subject: CheckSubject;
	readonly check: PackagedCheck;
	readonly selector: CheckInputSelector;
	readonly signal: AbortSignal;
}

export interface CheckInputResolver {
	resolve(
		context: CheckInputResolverContext,
	):
		| CheckInputSelection
		| CreateCheckInputSelectionInput
		| Promise<CheckInputSelection | CreateCheckInputSelectionInput>;
}

export interface GateRunnerLimits {
	readonly maximumCodeConcurrency: number;
	readonly maximumModelConcurrency: number;
}

export interface CreateGateRunnerInput {
	readonly executors?: readonly CheckExecutor[];
	readonly inputResolver?: CheckInputResolver;
	readonly cache?: CheckResultCache;
	readonly limits?: Partial<GateRunnerLimits>;
}

export interface RunGateInput {
	readonly subject: CheckSubject;
	readonly snapshot: CheckPackSnapshot;
	readonly signal?: AbortSignal;
}

export interface GateRunner {
	run(input: RunGateInput): Promise<GateReport>;
}

interface PreparedCheck {
	readonly check: PackagedCheck;
	readonly executor: CheckExecutor;
	readonly invocation: CheckInvocation;
	readonly cacheKey: ReturnType<typeof checkResultCacheKey>;
}

interface BatchOutcome {
	readonly results: readonly CheckResult[];
	readonly facts: readonly CheckExecutionFact[];
	readonly stoppedReason?: GateStopReason;
	readonly failed: boolean;
}

interface ExecutedCheck {
	readonly result?: CheckResult;
	readonly fact: CheckExecutionFact;
	readonly stoppedReason?: GateStopReason;
}

const DEFAULT_LIMITS: GateRunnerLimits = Object.freeze({
	maximumCodeConcurrency: 4,
	maximumModelConcurrency: 2,
});

export function createGateRunner(input: CreateGateRunnerInput = {}): GateRunner {
	const executors = [...(input.executors ?? [])];
	const cache = input.cache ?? new InMemoryCheckResultCache();
	const resolver = input.inputResolver ?? unavailableInputResolver();
	const limits = normalizedLimits(input.limits);
	return Object.freeze({
		run: (runInput: RunGateInput) =>
			runGate({
				input: runInput,
				executors,
				cache,
				resolver,
				limits,
			}),
	});
}

async function runGate(context: {
	readonly input: RunGateInput;
	readonly executors: readonly CheckExecutor[];
	readonly cache: CheckResultCache;
	readonly resolver: CheckInputResolver;
	readonly limits: GateRunnerLimits;
}): Promise<GateReport> {
	assertCheckPackSnapshot(context.input.snapshot, context.input.subject.stage);
	if (context.input.subject.digest !== canonicalJsonDigest({
		stage: context.input.subject.stage,
		id: context.input.subject.id,
		schemaVersion: context.input.subject.schemaVersion,
		content: context.input.subject.content,
	}) && !context.input.subject.id.startsWith("candidate:")) {
		throw new Error("Gate subject digest does not match its content.");
	}
	const checks = packagedChecks(context.input.snapshot);
	if (checks.length === 0) {
		return createGateReport({
			snapshot: context.input.snapshot,
			subjectDigest: context.input.subject.digest,
			results: [],
			executions: [],
		});
	}
	if (context.input.signal?.aborted) {
		return stoppedBeforeExecution(
			context.input,
			checks[0],
			stopReason("cancelled", "Gate was cancelled before Check execution."),
		);
	}
	const prepared: PreparedCheck[] = [];
	const cachedResults: CheckResult[] = [];
	const facts: CheckExecutionFact[] = [];
	const cacheHitCheckIds: string[] = [];
	for (const check of checks) {
		let executor: CheckExecutor | undefined;
		try {
			executor = matchingExecutor(context.executors, check);
		} catch (error) {
			return stoppedBeforeExecution(
				context.input,
				check,
				stopReason(
					"execution_failed",
					`Check executor admission failed: ${errorMessage(error)}`,
					check,
				),
				facts,
				cachedResults,
				cacheHitCheckIds,
			);
		}
		if (!executor) {
			return stoppedBeforeExecution(
				context.input,
				check,
				stopReason(
					"executor_unavailable",
					`No admitted ${check.definition.implementation.kind} executor supports ${qualifiedCheckId(check.packId, check.checkId)}.`,
					check,
				),
				facts,
				cachedResults,
				cacheHitCheckIds,
			);
		}
		let selections: CheckInputSelection[];
		let invocation: CheckInvocation;
		try {
			selections = await resolveSelections({
				subject: context.input.subject,
				check,
				resolver: context.resolver,
				signal: context.input.signal,
			});
			const invalidSelection = selections.find(
				(selection) =>
					selection.selector.required &&
					(selection.status !== "ready" || selection.truncated || selection.stale),
			);
			if (invalidSelection) {
				const code = invalidSelection.stale ? "stale_subject" : "missing_inputs";
				return stoppedBeforeExecution(
					context.input,
					check,
					stopReason(
						code,
						`Required ${invalidSelection.selector.source} inputs are not complete for ${qualifiedCheckId(check.packId, check.checkId)}.`,
						check,
					),
					facts,
					cachedResults,
					cacheHitCheckIds,
					executor.identity,
				);
			}
			invocation = assembleCheckInvocation({
				subject: context.input.subject,
				snapshot: context.input.snapshot,
				check,
				inputs: selections,
			});
		} catch (error) {
			return stoppedBeforeExecution(
				context.input,
				check,
				stopReason(
					"missing_inputs",
					`Check input collection failed: ${errorMessage(error)}`,
					check,
				),
				facts,
				cachedResults,
				cacheHitCheckIds,
				executor.identity,
			);
		}
		const cacheKey = checkResultCacheKey({
			invocation,
			execution: executor.identity,
		});
		let cached: CheckResult | undefined;
		try {
			cached = await context.cache.get(cacheKey);
			if (cached) {
				assertValidCheckResult(cached, context.input.snapshot);
				if (
					cached.invocationDigest !== invocation.invocationDigest ||
					cached.checkDigest !== check.checkDigest ||
					cached.packSnapshotDigest !== context.input.snapshot.checkPackDigest ||
					canonicalJsonDigest(cached.execution) !==
						canonicalJsonDigest(executor.identity)
				) {
					throw new Error("cached Result identity is stale");
				}
			}
		} catch (error) {
			return stoppedBeforeExecution(
				context.input,
				check,
				stopReason(
					"execution_failed",
					`Check Result cache failed: ${errorMessage(error)}`,
					check,
				),
				facts,
				cachedResults,
				cacheHitCheckIds,
				executor.identity,
			);
		}
		if (cached) {
			cachedResults.push(cached);
			cacheHitCheckIds.push(qualifiedCheckId(check.packId, check.checkId));
			facts.push({
				packId: check.packId,
				checkId: check.checkId,
				source: "cache",
				status: "completed",
				attempts: 0,
				execution: executor.identity,
				resultDigest: cached.resultDigest,
			});
		} else {
			prepared.push({check, executor, invocation, cacheKey});
		}
	}
	if (cachedResults.some((result) => result.status === "failed")) {
		return createGateReport({
			snapshot: context.input.snapshot,
			subjectDigest: context.input.subject.digest,
			results: cachedResults,
			executions: facts,
			cacheHitCheckIds,
		});
	}
	const codeChecks = prepared.filter(
		(entry) => entry.check.definition.implementation.kind === "code",
	);
	const code = await executeBatch({
		checks: codeChecks,
		maximumConcurrency: context.limits.maximumCodeConcurrency,
		snapshot: context.input.snapshot,
		cache: context.cache,
		parentSignal: context.input.signal,
	});
	const afterCodeResults = [...cachedResults, ...code.results];
	const afterCodeFacts = [...facts, ...code.facts];
	if (code.stoppedReason || code.failed) {
		return createGateReport({
			snapshot: context.input.snapshot,
			subjectDigest: context.input.subject.digest,
			results: afterCodeResults,
			executions: afterCodeFacts,
			cacheHitCheckIds,
			...(code.stoppedReason ? {stoppedReason: code.stoppedReason} : {}),
		});
	}
	const modelChecks = prepared.filter(
		(entry) => entry.check.definition.implementation.kind === "model",
	);
	const model = await executeBatch({
		checks: modelChecks,
		maximumConcurrency: context.limits.maximumModelConcurrency,
		snapshot: context.input.snapshot,
		cache: context.cache,
		parentSignal: context.input.signal,
	});
	return createGateReport({
		snapshot: context.input.snapshot,
		subjectDigest: context.input.subject.digest,
		results: [...afterCodeResults, ...model.results],
		executions: [...afterCodeFacts, ...model.facts],
		cacheHitCheckIds,
		...(model.stoppedReason ? {stoppedReason: model.stoppedReason} : {}),
	});
}

async function resolveSelections(input: {
	readonly subject: CheckSubject;
	readonly check: PackagedCheck;
	readonly resolver: CheckInputResolver;
	readonly signal?: AbortSignal;
}): Promise<CheckInputSelection[]> {
	const selections: CheckInputSelection[] = [];
	for (const selector of input.check.definition.inputs) {
		if (selector.source === "subject") {
			selections.push(subjectInputSelection(input.subject, selector));
			continue;
		}
		const value = await input.resolver.resolve({
			subject: input.subject,
			check: input.check,
			selector,
			signal: input.signal ?? new AbortController().signal,
		});
		selections.push(
			"selectionDigest" in value ? value : createCheckInputSelection(value),
		);
	}
	return selections;
}

async function executeBatch(input: {
	readonly checks: readonly PreparedCheck[];
	readonly maximumConcurrency: number;
	readonly snapshot: CheckPackSnapshot;
	readonly cache: CheckResultCache;
	readonly parentSignal?: AbortSignal;
}): Promise<BatchOutcome> {
	if (input.checks.length === 0) return {results: [], facts: [], failed: false};
	const results: CheckResult[] = [];
	const facts: CheckExecutionFact[] = [];
	for (let offset = 0; offset < input.checks.length; offset += input.maximumConcurrency) {
		const batch = input.checks.slice(offset, offset + input.maximumConcurrency);
		const controllers = batch.map(() => new AbortController());
		let terminalIndex = batch.length;
		const outcomes = await Promise.all(
			batch.map(async (prepared, index) => {
				const executed = await executePreparedCheck({
					prepared,
					snapshot: input.snapshot,
					cache: input.cache,
					controller: controllers[index],
					parentSignal: input.parentSignal,
				});
				if (
					(executed.stoppedReason || executed.result?.status === "failed") &&
					index < terminalIndex
				) {
					terminalIndex = index;
					for (let later = index + 1; later < controllers.length; later += 1) {
						controllers[later].abort();
					}
				}
				return executed;
			}),
		);
		const included = outcomes.slice(
			0,
			terminalIndex < batch.length ? terminalIndex + 1 : outcomes.length,
		);
		for (const executed of included) {
			facts.push(executed.fact);
			if (executed.result) results.push(executed.result);
		}
		if (terminalIndex < batch.length) {
			const terminal = outcomes[terminalIndex];
			return {
				results: results.sort(compareResults),
				facts: facts.sort(compareFacts),
				failed: terminal.result?.status === "failed",
				...(terminal.stoppedReason
					? {stoppedReason: terminal.stoppedReason}
					: {}),
			};
		}
	}
	return {
		results: results.sort(compareResults),
		facts: facts.sort(compareFacts),
		failed: false,
	};
}

async function executePreparedCheck(input: {
	readonly prepared: PreparedCheck;
	readonly snapshot: CheckPackSnapshot;
	readonly cache: CheckResultCache;
	readonly controller: AbortController;
	readonly parentSignal?: AbortSignal;
}): Promise<ExecutedCheck> {
	const {check, executor, invocation, cacheKey} = input.prepared;
	const identity = executor.identity;
	let attempts = 0;
	let lastStop: GateStopReason | undefined;
	while (attempts < check.definition.limits.maximumAttempts) {
		attempts += 1;
		if (input.parentSignal?.aborted) {
			lastStop = stopReason("cancelled", "Gate was cancelled during Check execution.", check);
			break;
		}
		const attemptController = new AbortController();
		const cancelAttempt = (): void => attemptController.abort();
		input.controller.signal.addEventListener("abort", cancelAttempt, {once: true});
		if (input.controller.signal.aborted) attemptController.abort();
		try {
			const raw = await executeWithBoundary({
				executor,
				check,
				invocation,
				controller: attemptController,
				parentSignal: input.parentSignal,
				timeoutMs: check.definition.limits.timeoutMs,
			});
			const output = admitCheckOutput({
				invocation,
				value: raw,
				maximumOutputBytes: check.definition.limits.maximumOutputBytes,
			});
			const result = createCheckResult({
				snapshot: input.snapshot,
				check,
				invocation,
				output,
				execution: identity,
			});
			await input.cache.set(cacheKey, result);
			return {
				result,
				fact: {
					packId: check.packId,
					checkId: check.checkId,
					source: "executed",
					status: "completed",
					attempts,
					execution: identity,
					resultDigest: result.resultDigest,
				},
			};
		} catch (error) {
			if (input.controller.signal.aborted && !input.parentSignal?.aborted) {
				return {
					fact: {
						packId: check.packId,
						checkId: check.checkId,
						source: "executed",
						status: "cancelled",
						attempts,
						execution: identity,
					},
				};
			}
			lastStop = boundaryStopReason(error, check);
		} finally {
			input.controller.signal.removeEventListener("abort", cancelAttempt);
		}
	}
	const reason =
		lastStop ?? stopReason("execution_failed", "Check execution stopped.", check);
	return {
		stoppedReason: reason,
		fact: {
			packId: check.packId,
			checkId: check.checkId,
			source: "executed",
			status: "stopped",
			attempts,
			execution: identity,
			stopReason: reason,
		},
	};
}

async function executeWithBoundary(input: {
	readonly executor: CheckExecutor;
	readonly check: PackagedCheck;
	readonly invocation: CheckInvocation;
	readonly controller: AbortController;
	readonly parentSignal?: AbortSignal;
	readonly timeoutMs: number;
}): Promise<unknown> {
	let timedOut = false;
	const onParentAbort = (): void => input.controller.abort();
	input.parentSignal?.addEventListener("abort", onParentAbort, {once: true});
	const timeout = setTimeout(() => {
		timedOut = true;
		input.controller.abort();
	}, input.timeoutMs);
	try {
		return await Promise.race([
			Promise.resolve(
				input.executor.execute({
					check: input.check,
					invocation: input.invocation,
					implementation: input.check.implementation,
					signal: input.controller.signal,
				}),
			),
			new Promise<never>((_, reject) => {
				input.controller.signal.addEventListener(
					"abort",
					() =>
						reject(
							new CheckBoundaryError(
								timedOut ? "timeout" : "cancelled",
								timedOut ? "Check execution timed out." : "Check execution was cancelled.",
							),
						),
					{once: true},
				);
			}),
		]);
	} finally {
		clearTimeout(timeout);
		input.parentSignal?.removeEventListener("abort", onParentAbort);
	}
}

class CheckBoundaryError extends Error {
	readonly code: "timeout" | "cancelled";

	constructor(code: "timeout" | "cancelled", message: string) {
		super(message);
		this.name = "CheckBoundaryError";
		this.code = code;
	}
}

function boundaryStopReason(error: unknown, check: PackagedCheck): GateStopReason {
	if (error instanceof CheckBoundaryError) {
		return stopReason(error.code, error.message, check);
	}
	const message = error instanceof Error ? error.message : String(error);
	if (message.startsWith("Check Output") || message.includes("measurement")) {
		return stopReason("invalid_output", `Invalid Check Output: ${message}`, check);
	}
	return stopReason("execution_failed", `Check execution failed: ${message}`, check);
}

function stoppedBeforeExecution(
	input: RunGateInput,
	check: PackagedCheck,
	reason: GateStopReason,
	previousFacts: readonly CheckExecutionFact[] = [],
	results: readonly CheckResult[] = [],
	cacheHitCheckIds: readonly string[] = [],
	execution?: CheckExecutionIdentity,
): GateReport {
	return createGateReport({
		snapshot: input.snapshot,
		subjectDigest: input.subject.digest,
		results,
		executions: [
			...previousFacts,
			{
				packId: check.packId,
				checkId: check.checkId,
				source: "executed",
				status: "stopped",
				attempts: 0,
				...(execution ? {execution} : {}),
				stopReason: reason,
			},
		],
		cacheHitCheckIds,
		stoppedReason: reason,
	});
}

function matchingExecutor(
	executors: readonly CheckExecutor[],
	check: PackagedCheck,
): CheckExecutor | undefined {
	const matches = executors.filter((executor) => {
		const implementation = check.definition.implementation;
		return (
			executor.identity.kind === implementation.kind &&
			executor.identity.profile === implementation.profile &&
			(implementation.kind !== "model" ||
				executor.identity.route === implementation.route) &&
			executor.supports(check)
		);
	});
	if (matches.length > 1) {
		throw new Error(
			`Multiple admitted executors support ${qualifiedCheckId(check.packId, check.checkId)}.`,
		);
	}
	return matches[0];
}

function unavailableInputResolver(): CheckInputResolver {
	return Object.freeze({
		resolve: (context: CheckInputResolverContext) =>
			createCheckInputSelection({
				selector: context.selector,
				status: "unavailable",
			}),
	});
}

function normalizedLimits(
	input: Partial<GateRunnerLimits> | undefined,
): GateRunnerLimits {
	const limits = {...DEFAULT_LIMITS, ...(input ?? {})};
	for (const [name, value] of Object.entries(limits)) {
		if (!Number.isSafeInteger(value) || value < 1 || value > 32) {
			throw new Error(`Gate runner ${name} must be an integer from 1 to 32.`);
		}
	}
	return Object.freeze(limits);
}

function stopReason(
	code: GateStopReason["code"],
	message: string,
	check?: PackagedCheck,
): GateStopReason {
	return Object.freeze({
		code,
		message,
		...(check ? {packId: check.packId, checkId: check.checkId} : {}),
	});
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function compareResults(left: CheckResult, right: CheckResult): number {
	return qualifiedCheckId(left.packId, left.checkId).localeCompare(
		qualifiedCheckId(right.packId, right.checkId),
	);
}

function compareFacts(left: CheckExecutionFact, right: CheckExecutionFact): number {
	return qualifiedCheckId(left.packId, left.checkId).localeCompare(
		qualifiedCheckId(right.packId, right.checkId),
	);
}
