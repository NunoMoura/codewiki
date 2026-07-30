import type { EvidenceRecord } from "../evidence/contracts.ts";
import {
	assertValidEvidenceObligationResolution,
	type EvidenceObligationResolution,
} from "../evidence/obligation-resolution.ts";
import type { EvidenceObligation } from "../evidence/obligations.ts";
import type { SemanticLoop } from "../semantic-loop.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";
import type { CheckCatalog } from "./catalog.ts";
import {
	assertValidResolvedExitPolicy,
	type CheckBinding,
	type CheckDefinition,
	type CheckExecutionIdentity,
	type CheckMeasurement,
	type CheckResult,
	type ExitReport,
	type ResolvedExitPolicy,
} from "./contracts.ts";
import type { LoopCandidate } from "./identity.ts";
import { createCheckResult, createExitReport } from "./results.ts";
import {
	createLoopExitResultCache,
	type LoopExitResultCache,
} from "./cache.ts";

const LOOP_EXIT_RUNNER_VERSION = "1.0.0" as const;

export type CheckObservationDisposition =
	| "satisfied"
	| "unsatisfied"
	| "indeterminate";

export interface CheckExecutorObservation {
	readonly disposition: CheckObservationDisposition;
	readonly measurement?: CheckMeasurement;
	readonly findings?: readonly string[];
	readonly issueClass?: string;
	readonly feedback?: string;
}

export interface LoopCheckExecutorContext {
	readonly candidate: LoopCandidate;
	readonly policy: ResolvedExitPolicy;
	readonly binding: CheckBinding;
	readonly check: CheckDefinition;
	readonly evidenceResolutions: readonly EvidenceObligationResolution[];
	readonly evidenceRecords: readonly EvidenceRecord[];
	readonly dependencyResults: readonly CheckResult[];
	readonly signal: AbortSignal;
}

export interface LoopCheckExecutor {
	readonly loop: SemanticLoop;
	readonly checkId: string;
	readonly checkVersion: string;
	readonly execution: CheckExecutionIdentity;
	readonly execute: (
		context: LoopCheckExecutorContext,
	) => CheckExecutorObservation | Promise<CheckExecutorObservation>;
}

export interface LoopExitRunnerLimits {
	readonly codeConcurrency?: number;
	readonly modelConcurrency?: number;
}

export interface CreateLoopExitRunnerInput {
	readonly catalog: CheckCatalog;
	readonly executors: readonly LoopCheckExecutor[];
	readonly cache?: LoopExitResultCache;
	readonly limits?: LoopExitRunnerLimits;
}

interface RunLoopExitInput {
	readonly candidate: LoopCandidate;
	readonly policy: ResolvedExitPolicy;
	readonly evidenceResolutionsByCheck?: Readonly<
		Record<string, readonly EvidenceObligationResolution[]>
	>;
	readonly evidenceRecords?: readonly EvidenceRecord[];
	readonly precomputedResults?: readonly CheckResult[];
	readonly signal?: AbortSignal;
	readonly onResult?: (
		result: CheckResult,
		source: "executed" | "cache" | "precomputed",
	) => void | Promise<void>;
}

type LoopExitNextAction =
	| {readonly kind: "ready_for_runtime_route"}
	| {
			readonly kind: "repair_candidate";
			readonly failedCheckIds: readonly string[];
			readonly repairTargets: readonly string[];
	  }
	| {
			readonly kind: "retry_or_wait";
			readonly indeterminateCheckIds: readonly string[];
	  };

interface LoopExitRun {
	readonly report: ExitReport;
	readonly nextAction: LoopExitNextAction;
	readonly cacheHitCheckIds: readonly string[];
}

interface LoopExitRunner {
	readonly run: (input: RunLoopExitInput) => Promise<LoopExitRun>;
	readonly cache: LoopExitResultCache;
}

interface ExecutionBoundaryFailure {
	readonly kind:
		| "cancelled"
		| "timeout"
		| "evidence_unavailable"
		| "operational_failure";
	readonly finding: string;
}

interface ExecuteBindingInput {
	readonly candidate: LoopCandidate;
	readonly policy: ResolvedExitPolicy;
	readonly binding: CheckBinding;
	readonly check: CheckDefinition;
	readonly resolutions: readonly EvidenceObligationResolution[];
	readonly evidenceRecords: readonly EvidenceRecord[];
	readonly dependencyResults: readonly CheckResult[];
	readonly executor: LoopCheckExecutor | undefined;
	readonly signal: AbortSignal | undefined;
	readonly semaphore: Semaphore;
}

interface Semaphore {
	readonly run: <T>(task: () => Promise<T>) => Promise<T>;
}

export function createLoopExitRunner(
	input: CreateLoopExitRunnerInput,
): LoopExitRunner {
	assertRunnerInput(input);
	const executors = executorRegistry(input.catalog, input.executors);
	const cache = input.cache ?? createLoopExitResultCache();
	const code = createSemaphore(input.limits?.codeConcurrency ?? 4);
	const model = createSemaphore(input.limits?.modelConcurrency ?? 2);
	return Object.freeze({
		cache,
		run: (runInput: RunLoopExitInput) =>
			runLoopExit({
				input: runInput,
				catalog: input.catalog,
				executors,
				cache,
				semaphores: {code, model},
			}),
	});
}

interface RunLoopExitContext {
	readonly input: RunLoopExitInput;
	readonly catalog: CheckCatalog;
	readonly executors: ReadonlyMap<string, LoopCheckExecutor>;
	readonly cache: LoopExitResultCache;
	readonly semaphores: Readonly<Record<"code" | "model", Semaphore>>;
}

interface CheckSchedulerContext extends RunLoopExitContext {
	readonly evidenceRecords: ReadonlyMap<string, EvidenceRecord>;
	readonly precomputedResults: ReadonlyMap<string, CheckResult>;
	readonly cacheHits: Set<string>;
}

async function runLoopExit(options: RunLoopExitContext): Promise<LoopExitRun> {
	assertRunInput(options.input, options.catalog);
	const cacheHits = new Set<string>();
	const execute = createCheckScheduler({
		...options,
		evidenceRecords: normalizedEvidenceRecords(options.input.evidenceRecords ?? []),
		precomputedResults: normalizedPrecomputedResults(
			options.input.precomputedResults ?? [],
			options.input.policy,
		),
		cacheHits,
	});
	const results = await Promise.all(options.input.policy.bindings.map(execute));
	const report = createExitReport({policy: options.input.policy, checkResults: results});
	return immutable({
		report,
		nextAction: nextAction(report, options.input.policy),
		cacheHitCheckIds: [...cacheHits].sort(compareText),
	});
}

function createCheckScheduler(
	context: CheckSchedulerContext,
): (binding: CheckBinding) => Promise<CheckResult> {
	const promises = new Map<string, Promise<CheckResult>>();
	const bindingById = new Map(
		context.input.policy.bindings.map((binding) => [binding.checkId, binding]),
	);
	return function execute(binding: CheckBinding): Promise<CheckResult> {
		const existing = promises.get(binding.checkId);
		if (existing) return existing;
		const promise = Promise.all(
			binding.dependsOn.map((checkId) =>
				execute(requiredBinding(bindingById, checkId)),
			),
		).then((dependencyResults) =>
			executeScheduledCheck(context, binding, dependencyResults),
		);
		promises.set(binding.checkId, promise);
		return promise;
	};
}

async function executeScheduledCheck(
	context: CheckSchedulerContext,
	binding: CheckBinding,
	dependencyResults: readonly CheckResult[],
): Promise<CheckResult> {
	const precomputed = context.precomputedResults.get(binding.checkId);
	if (precomputed) {
		await context.input.onResult?.(precomputed, "precomputed");
		return precomputed;
	}
	const check = requiredCatalogRegistration(
		context.catalog,
		binding.checkId,
		context.input.policy.loop,
	).check;
	const resolutions = evidenceResolutions(
		check,
		context.input.evidenceResolutionsByCheck?.[binding.checkId],
		context.evidenceRecords,
	);
	const executor = context.executors.get(
		executorKey(context.input.policy.loop, binding.checkId, binding.checkVersion),
	);
	const execution = executor?.execution ?? check.execution;
	const cacheKey = checkResultCacheKey({
		candidateDigest: context.input.candidate.digest,
		policyDigest: context.input.policy.policyDigest,
		binding,
		resolutions,
		dependencyResults,
		execution,
	});
	const cached = context.cache.get(cacheKey);
	if (cached) {
		context.cacheHits.add(binding.checkId);
		await context.input.onResult?.(cached, "cache");
		return cached;
	}
	const result = await executeBinding({
		candidate: context.input.candidate,
		policy: context.input.policy,
		binding,
		check,
		resolutions,
		evidenceRecords: evidenceForResolutions(resolutions, context.evidenceRecords),
		dependencyResults,
		executor,
		signal: context.input.signal,
		semaphore: context.semaphores[check.execution.kind],
	});
	if (result.status !== "indeterminate") context.cache.set(cacheKey, result);
	await context.input.onResult?.(result, "executed");
	return result;
}

async function executeBinding(input: ExecuteBindingInput): Promise<CheckResult> {
	const unavailable = unavailableFinding(input);
	if (unavailable) return indeterminateResult(input, unavailable);
	const executor = input.executor as LoopCheckExecutor;
	const outcome = await input.semaphore.run(() =>
		executeWithBoundary(executor, input, input.check.timeoutMs),
	);
	if ("kind" in outcome) return indeterminateResult(input, outcome);
	try {
		const observation = normalizedObservation(outcome, input.check);
		return createCheckResult({
			loop: input.policy.loop,
			policy: input.policy,
			check: input.check,
			disposition: observation.disposition,
			...(observation.measurement ? {measurement: observation.measurement} : {}),
			evidenceResolutions: [...input.resolutions],
			findings: [...(observation.findings ?? [])],
			...(observation.issueClass ? {issueClass: observation.issueClass} : {}),
			...(observation.feedback ? {feedback: observation.feedback} : {}),
			execution: executor.execution,
		});
	} catch {
		return indeterminateResult(input, {
			kind: "operational_failure",
			finding: `Check executor ${input.check.id} returned invalid output; details were redacted.`,
		});
	}
}

function unavailableFinding(
	input: ExecuteBindingInput,
): ExecutionBoundaryFailure | null {
	if (input.signal?.aborted) {
		return {kind: "cancelled", finding: `Check ${input.check.id} was cancelled.`};
	}
	const blocked = input.resolutions.filter((resolution) => resolution.status !== "ready");
	if (blocked.length > 0) {
		return {
			kind: "evidence_unavailable",
			finding: `Check ${input.check.id} evidence input is ${blocked
				.map((resolution) => `${resolution.obligationId}:${resolution.status}`)
				.join(", ")}.`,
		};
	}
	if (!input.executor) {
		return {
			kind: "operational_failure",
			finding: `Check ${input.check.id} executor is unavailable.`,
		};
	}
	return null;
}

async function executeWithBoundary(
	executor: LoopCheckExecutor,
	input: ExecuteBindingInput,
	timeoutMs: number,
): Promise<CheckExecutorObservation | ExecutionBoundaryFailure> {
	const controller = new AbortController();
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let removeAbortListener = (): void => undefined;
	const boundary = new Promise<ExecutionBoundaryFailure>((resolve) => {
		const cancel = (): void => {
			controller.abort(input.signal?.reason);
			resolve({kind: "cancelled", finding: `Check ${input.check.id} was cancelled.`});
		};
		if (input.signal) {
			input.signal.addEventListener("abort", cancel, {once: true});
			removeAbortListener = () => input.signal?.removeEventListener("abort", cancel);
		}
		timeout = setTimeout(() => {
			controller.abort(new Error("check_timeout"));
			resolve({
				kind: "timeout",
				finding: `Check ${input.check.id} exceeded ${timeoutMs} ms.`,
			});
		}, timeoutMs);
	});
	try {
		const execution = Promise.resolve()
			.then(() =>
				executor.execute({
					candidate: input.candidate,
					policy: input.policy,
					binding: input.binding,
					check: input.check,
					evidenceResolutions: input.resolutions,
					evidenceRecords: input.evidenceRecords,
					dependencyResults: input.dependencyResults,
					signal: controller.signal,
				}),
			)
			.catch(
				(_error): ExecutionBoundaryFailure => ({
					kind: "operational_failure",
					finding: `Check ${input.check.id} execution failed; executor output was redacted.`,
				}),
			);
		return await Promise.race([execution, boundary]);
	} finally {
		if (timeout) clearTimeout(timeout);
		removeAbortListener();
	}
}

function indeterminateResult(
	input: ExecuteBindingInput,
	failure: ExecutionBoundaryFailure,
): CheckResult {
	const issueClass = issueClassForFailure(failure.kind);
	return createCheckResult({
		loop: input.policy.loop,
		policy: input.policy,
		check: input.check,
		disposition: "indeterminate",
		evidenceResolutions: [...input.resolutions],
		findings: [failure.finding],
		issueClass,
		feedback: "Retry when exact evidence and execution capacity are available.",
		execution: input.executor?.execution ?? input.check.execution,
	});
}

function issueClassForFailure(
	kind: ExecutionBoundaryFailure["kind"],
): string {
	switch (kind) {
		case "timeout":
			return "runtime_timeout";
		case "cancelled":
			return "runtime_cancellation";
		case "evidence_unavailable":
			return "evidence_input";
		case "operational_failure":
			return "runtime_unavailable";
		default:
			throw new Error(`Unknown execution boundary failure ${String(kind)}.`);
	}
}

function normalizedObservation(
	value: CheckExecutorObservation,
	check: CheckDefinition,
): CheckExecutorObservation {
	assertObservationShape(value);
	const measurement = observationMeasurement(value, check);
	const findings = normalizedTextList(value.findings ?? []);
	if (value.disposition !== "satisfied" && findings.length === 0) {
		findings.push(`Check ${check.id} did not establish its requirement.`);
	}
	return {
		disposition: value.disposition,
		...(measurement ? {measurement} : {}),
		findings,
		...(value.issueClass ? {issueClass: requiredText(value.issueClass, "issueClass")} : {}),
		...(value.feedback ? {feedback: requiredText(value.feedback, "feedback")} : {}),
	};
}

function assertObservationShape(value: CheckExecutorObservation): void {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("executor observation must be an object");
	}
	assertExactKeys(
		value,
		["disposition", "measurement", "findings", "issueClass", "feedback"],
		"Check executor observation",
	);
	if (
		value.disposition !== "satisfied" &&
		value.disposition !== "unsatisfied" &&
		value.disposition !== "indeterminate"
	) {
		throw new Error("executor disposition is invalid");
	}
}

function observationMeasurement(
	value: CheckExecutorObservation,
	check: CheckDefinition,
): CheckMeasurement | undefined {
	if (value.measurement) return value.measurement;
	if (value.disposition === "indeterminate" || check.measurement.shape !== "boolean") {
		return undefined;
	}
	return {shape: "boolean", value: value.disposition === "satisfied"};
}

function evidenceResolutions(
	check: CheckDefinition,
	provided: readonly EvidenceObligationResolution[] | undefined,
	evidenceRecords: ReadonlyMap<string, EvidenceRecord>,
): EvidenceObligationResolution[] {
	const byId = new Map((provided ?? []).map((resolution) => [resolution.obligationId, resolution]));
	if (byId.size !== (provided ?? []).length) {
		throw new Error(`Check ${check.id} evidence resolutions contain duplicate obligations.`);
	}
	for (const obligationId of byId.keys()) {
		if (!check.evidenceObligations.some((obligation) => obligation.id === obligationId)) {
			throw new Error(`Check ${check.id} received foreign obligation ${obligationId}.`);
		}
	}
	return check.evidenceObligations.map((obligation) => {
		const resolution = byId.get(obligation.id) ?? missingResolution(obligation);
		assertValidEvidenceObligationResolution(resolution, obligation);
		for (const evidenceId of resolution.inputEvidenceIds) {
			if (!evidenceRecords.has(evidenceId)) {
				throw new Error(
					`Check ${check.id} resolution references unavailable Evidence ${evidenceId}.`,
				);
			}
		}
		return resolution;
	});
}

function missingResolution(
	obligation: EvidenceObligation,
): EvidenceObligationResolution {
	const withoutDigest = {
		obligationId: obligation.id,
		obligationVersion: obligation.version,
		obligationDigest: canonicalJsonDigest(obligation),
		status: "missing" as const,
		inputEvidenceIds: [],
		eligibleEvidenceIds: [],
		supportingEvidenceIds: [],
		contradictoryEvidenceIds: [],
		neutralEvidenceIds: [],
		excludedEvidence: [],
		duplicateEvidenceIds: [],
		missingCount: obligation.minimumCount,
	};
	return immutable({
		...withoutDigest,
		resolutionDigest: canonicalJsonDigest(withoutDigest),
	});
}

function normalizedPrecomputedResults(
	values: readonly CheckResult[],
	policy: ResolvedExitPolicy,
): ReadonlyMap<string, CheckResult> {
	const active = new Map(policy.bindings.map((binding) => [binding.checkId, binding]));
	const results = new Map<string, CheckResult>();
	for (const result of values) {
		const binding = active.get(result.checkId);
		if (!binding) {
			throw new Error(`Loop exit received precomputed inactive Check ${result.checkId}.`);
		}
		if (results.has(result.checkId)) {
			throw new Error(`Loop exit precomputed Check ${result.checkId} is duplicated.`);
		}
		if (
			result.candidateDigest !== policy.candidateDigest ||
			result.policyDigest !== policy.policyDigest ||
			result.checkVersion !== binding.checkVersion ||
			result.checkDigest !== binding.checkDigest
		) {
			throw new Error(`Loop exit precomputed Check ${result.checkId} is stale.`);
		}
		assertSha256Digest(result.resultDigest, "Precomputed Check Result digest");
		results.set(result.checkId, result);
	}
	return results;
}

function normalizedEvidenceRecords(
	values: readonly EvidenceRecord[],
): ReadonlyMap<string, EvidenceRecord> {
	const records = new Map<string, EvidenceRecord>();
	for (const record of values) {
		if (records.has(record.evidenceId)) {
			throw new Error(`Loop exit Evidence ${record.evidenceId} is duplicated.`);
		}
		records.set(record.evidenceId, record);
	}
	return records;
}

function evidenceForResolutions(
	resolutions: readonly EvidenceObligationResolution[],
	records: ReadonlyMap<string, EvidenceRecord>,
): EvidenceRecord[] {
	const ids = new Set(resolutions.flatMap((resolution) => resolution.inputEvidenceIds));
	return [...ids]
		.sort(compareText)
		.map((id) => records.get(id) as EvidenceRecord);
}

function checkResultCacheKey(input: {
	readonly candidateDigest: Sha256Digest;
	readonly policyDigest: string;
	readonly binding: CheckBinding;
	readonly resolutions: readonly EvidenceObligationResolution[];
	readonly dependencyResults: readonly CheckResult[];
	readonly execution: CheckExecutionIdentity;
}): Sha256Digest {
	return canonicalJsonDigest({
		runnerVersion: LOOP_EXIT_RUNNER_VERSION,
		candidateDigest: input.candidateDigest,
		policyDigest: input.policyDigest,
		checkDigest: input.binding.checkDigest,
		binding: input.binding,
		evidenceResolutionDigests: input.resolutions.map(
			(resolution) => resolution.resolutionDigest,
		),
		dependencyResultDigests: input.dependencyResults.map(
			(result) => result.resultDigest,
		),
		execution: input.execution,
	});
}

function executorRegistry(
	catalog: CheckCatalog,
	executors: readonly LoopCheckExecutor[],
): ReadonlyMap<string, LoopCheckExecutor> {
	const registry = new Map<string, LoopCheckExecutor>();
	for (const executor of executors) {
		const registration = requiredCatalogRegistration(
			catalog,
			executor.checkId,
			executor.loop,
		);
		if (registration.check.version !== executor.checkVersion) {
			throw new Error(
				`Check executor ${executor.checkId} version does not match Catalog.`,
			);
		}
		if (
			executor.execution.id !== registration.check.execution.id ||
			executor.execution.version !== registration.check.execution.version ||
			executor.execution.kind !== registration.check.execution.kind
		) {
			throw new Error(`Check executor ${executor.checkId} identity does not match Catalog.`);
		}
		const key = executorKey(executor.loop, executor.checkId, executor.checkVersion);
		if (registry.has(key)) {
			throw new Error(`Check executor ${executor.checkId} is duplicated for ${executor.loop}.`);
		}
		registry.set(key, Object.freeze({...executor}));
	}
	return registry;
}

function assertRunnerInput(input: CreateLoopExitRunnerInput): void {
	if (!input?.catalog || !Array.isArray(input.executors)) {
		throw new Error("Loop exit runner requires Catalog and executors.");
	}
	for (const [field, value] of [
		["codeConcurrency", input.limits?.codeConcurrency ?? 4],
		["modelConcurrency", input.limits?.modelConcurrency ?? 2],
	] as const) {
		if (!Number.isSafeInteger(value) || value < 1 || value > 64) {
			throw new Error(`Loop exit runner ${field} must be an integer from 1 to 64.`);
		}
	}
}

function assertRunInput(input: RunLoopExitInput, catalog: CheckCatalog): void {
	if (!input?.candidate || !input.policy) {
		throw new Error("Loop exit run requires candidate and policy.");
	}
	assertValidResolvedExitPolicy(input.policy);
	assertSha256Digest(input.candidate.digest, "Candidate digest");
	if (
		input.candidate.loop !== input.policy.loop ||
		input.candidate.digest !== input.policy.candidateDigest
	) {
		throw new Error("Loop exit candidate does not match Resolved Exit Policy.");
	}
	if (input.policy.catalogDigest !== catalog.digest) {
		throw new Error("Loop exit policy Catalog digest is stale.");
	}
	const checkIds = new Set(input.policy.bindings.map((binding) => binding.checkId));
	for (const checkId of Object.keys(input.evidenceResolutionsByCheck ?? {})) {
		if (!checkIds.has(checkId)) {
			throw new Error(`Loop exit received resolutions for inactive Check ${checkId}.`);
		}
	}
}

function nextAction(
	report: ExitReport,
	policy: ResolvedExitPolicy,
): LoopExitNextAction {
	if (report.status === "pass") return {kind: "ready_for_runtime_route"};
	const requiredIds = new Set(
		policy.bindings.flatMap((binding) =>
			binding.required ? [binding.checkId] : [],
		),
	);
	if (report.status === "fail") {
		const failed = report.checkResults.filter(
			(result) => requiredIds.has(result.checkId) && result.status === "fail",
		);
		return {
			kind: "repair_candidate",
			failedCheckIds: failed.map((result) => result.checkId).sort(compareText),
			repairTargets: [...new Set(failed.map((result) => result.repairTarget))].sort(
				compareText,
			),
		};
	}
	return {
		kind: "retry_or_wait",
		indeterminateCheckIds: report.checkResults
			.flatMap((result) =>
				requiredIds.has(result.checkId) && result.status === "indeterminate"
					? [result.checkId]
					: [],
			)
			.sort(compareText),
	};
}

function createSemaphore(limit: number): Semaphore {
	let active = 0;
	const waiting: Array<() => void> = [];
	const acquire = async (): Promise<void> => {
		if (active < limit) {
			active += 1;
			return;
		}
		await new Promise<void>((resolve) => waiting.push(resolve));
		active += 1;
	};
	const release = (): void => {
		active -= 1;
		waiting.shift()?.();
	};
	return {
		async run<T>(task: () => Promise<T>): Promise<T> {
			await acquire();
			try {
				return await task();
			} finally {
				release();
			}
		},
	};
}

function requiredCatalogRegistration(
	catalog: CheckCatalog,
	checkId: string,
	loop: SemanticLoop,
): NonNullable<ReturnType<CheckCatalog["get"]>> {
	const registration = catalog.get(checkId, loop);
	if (!registration) {
		throw new Error(`Loop exit Catalog has no ${loop} Check ${checkId}.`);
	}
	return registration;
}

function requiredBinding(
	bindings: ReadonlyMap<string, CheckBinding>,
	checkId: string,
): CheckBinding {
	const binding = bindings.get(checkId);
	if (!binding) throw new Error(`Loop exit dependency ${checkId} is inactive.`);
	return binding;
}

function executorKey(
	loop: SemanticLoop,
	checkId: string,
	checkVersion: string,
): string {
	return `${loop}:${checkId}@${checkVersion}`;
}

function normalizedTextList(values: readonly string[]): string[] {
	if (!Array.isArray(values) || values.length > 64) {
		throw new Error("Check executor findings must contain at most 64 entries.");
	}
	return values.map((value) => requiredText(value, "finding"));
}

function requiredText(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Check executor ${field} must be a non-empty string.`);
	}
	return value.trim();
}

function assertExactKeys(
	value: object,
	allowed: readonly string[],
	label: string,
): void {
	for (const key of Object.keys(value)) {
		if (!allowed.includes(key)) throw new Error(`${label} received unsupported field ${key}.`);
	}
}

function compareText(left: string, right: string): number {
	if (left === right) return 0;
	return left < right ? -1 : 1;
}

function immutable<T>(value: unknown): T {
	const canonical = toCanonicalJsonValue(value);
	return canonical as unknown as T;
}
