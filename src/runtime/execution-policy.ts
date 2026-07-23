import { createHash } from "node:crypto";
import type {
	WikiConfig,
	WikiConfigAgencyLevel,
	WikiModelQuality,
	WikiModelRouteConfig,
} from "../project/config.ts";

export type ExecutionRisk = "low" | "medium" | "high" | "critical";
export type ExecutionTarget =
	| "planning"
	| "implementation"
	| "close"
	| "worker";
export type ExecutionAttemptOutcome =
	| "completed"
	| "blocked"
	| "failed"
	| "cancelled";

export interface ExecutionPolicyAttempt {
	routeId: string;
	outcome: ExecutionAttemptOutcome;
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
	latencyMs: number;
}

export interface ExecutionPolicyContext {
	target: ExecutionTarget;
	changeType?: string;
	workerProfile?: string;
	risk: ExecutionRisk;
	pathScopes: string[];
	requiredTools: string[];
	estimatedInputTokens: number;
	estimatedOutputTokens: number;
	priorUsage?: {
		totalTokens: number;
		costUsd: number;
		latencyMs: number;
	};
	previousAttempts?: ExecutionPolicyAttempt[];
}

export interface ExecutionAutonomyCapabilities {
	readState: boolean;
	previewLoops: boolean;
	editSource: boolean;
	runChecks: boolean;
	startWorkers: boolean;
	appendApprovedIterations: boolean;
	acceptChanges: false;
	destructiveActions: false;
	publicActions: false;
	promoteSource: false;
	publishPackage: false;
	advanceController: false;
	continueWithoutSupervision: false;
}

export interface ExecutionRouteRejection {
	routeId: string;
	reasons: string[];
}

export interface WorkerExecutionUsage {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	costUsd: number;
	latencyMs: number;
}

export interface WorkerExecutionPolicySnapshot {
	digest: string;
	qualityFloor: WikiModelQuality;
	route: {
		routeId: string;
		provider: string;
		model: string;
		thinking: WikiModelRouteConfig["thinking"];
		quality: WikiModelQuality;
		timeoutMs: number;
		allowedTools: string[];
		pricingSnapshot: WikiModelRouteConfig["pricing"];
	};
	budget: ResolvedExecutionPolicy["budget"];
	escalation: ResolvedExecutionPolicy["escalation"];
}

export interface WorkerExecutionVerification {
	policyDigest: string;
	routeId: string;
	usage: WorkerExecutionUsage;
}

export interface ResolvedExecutionPolicy {
	status: "selected" | "blocked";
	digest: string;
	qualityFloor: WikiModelQuality;
	selected?: {
		routeId: string;
		provider: string;
		model: string;
		thinking: WikiModelRouteConfig["thinking"];
		timeoutMs: number;
		estimatedCostUsd: number;
		quality: WikiModelQuality;
		latency: WikiModelRouteConfig["latency"];
		pricingSnapshot: WikiModelRouteConfig["pricing"];
		allowedTools: string[];
	};
	eligibleRouteIds: string[];
	rejected: ExecutionRouteRejection[];
	capabilities: ExecutionAutonomyCapabilities;
	budget: {
		maxTokens?: number;
		maxCostUsd?: number;
		maxLatencyMs?: number;
		spentTokens: number;
		spentCostUsd: number;
		spentLatencyMs: number;
	};
	escalation: {
		attempt: number;
		maxEscalations: number;
		previousRouteId?: string;
	};
	rationale: string;
}

export function workerExecutionPolicySnapshot(
	policy: ResolvedExecutionPolicy,
): WorkerExecutionPolicySnapshot {
	if (policy.status !== "selected" || !policy.selected) {
		throw new Error(`Worker execution policy blocked: ${policy.rationale}`);
	}
	return {
		digest: policy.digest,
		qualityFloor: policy.qualityFloor,
		route: {
			routeId: policy.selected.routeId,
			provider: policy.selected.provider,
			model: policy.selected.model,
			thinking: policy.selected.thinking,
			quality: policy.selected.quality,
			timeoutMs: policy.selected.timeoutMs,
			allowedTools: [...policy.selected.allowedTools],
			pricingSnapshot: { ...policy.selected.pricingSnapshot },
		},
		budget: { ...policy.budget },
		escalation: { ...policy.escalation },
	};
}

export function verifyWorkerExecutionUsage(
	policy: WorkerExecutionPolicySnapshot,
	usage: WorkerExecutionUsage | undefined,
): WorkerExecutionVerification {
	if (!usage) throw new Error("Worker usage telemetry is missing.");
	for (const [field, value] of Object.entries(usage)) {
		if (!Number.isFinite(value) || value < 0) {
			throw new Error(`Worker usage ${field} is invalid.`);
		}
	}
	if (usage.totalTokens !== usage.inputTokens + usage.outputTokens) {
		throw new Error(
			"Worker usage totalTokens does not match input and output.",
		);
	}
	if (
		policy.budget.maxTokens !== undefined &&
		policy.budget.spentTokens + usage.totalTokens > policy.budget.maxTokens
	) {
		throw new Error("Worker token budget exceeded.");
	}
	if (
		policy.budget.maxCostUsd !== undefined &&
		policy.budget.spentCostUsd + usage.costUsd > policy.budget.maxCostUsd
	) {
		throw new Error("Worker monetary budget exceeded.");
	}
	if (
		policy.budget.maxLatencyMs !== undefined &&
		policy.budget.spentLatencyMs + usage.latencyMs > policy.budget.maxLatencyMs
	) {
		throw new Error("Worker latency budget exceeded.");
	}
	return {
		policyDigest: policy.digest,
		routeId: policy.route.routeId,
		usage: { ...usage },
	};
}

interface CandidateEvaluation {
	route: WikiModelRouteConfig;
	estimatedCostUsd: number;
	reasons: string[];
}

export function resolveExecutionPolicy(
	config: WikiConfig,
	context: ExecutionPolicyContext,
): ResolvedExecutionPolicy {
	const normalized = normalizeContext(context);
	const attempts = normalized.previousAttempts || [];
	const qualityFloor = effectiveQualityFloor(
		config.runtime.modelRouting.qualityFloor,
		normalized,
	);
	const budget = budgetState(config, attempts, normalized.priorUsage);
	const attempt = attempts.length;
	const previous = attempts.at(-1);
	const previousRoute = previous
		? config.runtime.modelRouting.routes.find(
				(route) => route.id === previous.routeId,
			)
		: undefined;
	const evaluations = config.runtime.modelRouting.routes.map((route) =>
		evaluateCandidate(
			route,
			config,
			normalized,
			qualityFloor,
			budget,
			attempts,
		),
	);
	if (previous) {
		for (const evaluation of evaluations) {
			if (
				evaluation.reasons.length === 0 &&
				!escalationEligible(evaluation.route, previous, previousRoute)
			) {
				evaluation.reasons.push(
					previousRoute
						? `escalation must exceed ${previousRoute.quality} quality.`
						: `previous route ${previous.routeId} is not in policy.`,
				);
			}
		}
	}
	const eligible = evaluations
		.filter((evaluation) => evaluation.reasons.length === 0)
		.sort(compareCandidates);
	const escalationAllowed =
		attempt === 0 ||
		(previous?.outcome === "failed" &&
			attempt <= config.runtime.modelRouting.maxEscalations);
	const selected = escalationAllowed ? eligible[0] : undefined;
	const policy = {
		status: selected ? ("selected" as const) : ("blocked" as const),
		qualityFloor,
		...(selected ? { selected: selectedRoute(selected) } : {}),
		eligibleRouteIds: eligible.map((evaluation) => evaluation.route.id),
		rejected: evaluations
			.filter((evaluation) => evaluation.reasons.length > 0)
			.map((evaluation) => ({
				routeId: evaluation.route.id,
				reasons: evaluation.reasons,
			})),
		capabilities: autonomyCapabilities(
			config.runtime.agency,
			config.runtime.automation,
		),
		budget,
		escalation: {
			attempt,
			maxEscalations: config.runtime.modelRouting.maxEscalations,
			...(previous ? { previousRouteId: previous.routeId } : {}),
		},
		rationale: policyRationale(
			selected,
			qualityFloor,
			attempt,
			escalationAllowed,
		),
	};
	return { ...policy, digest: executionPolicyDigest(policy) };
}

function evaluateCandidate(
	route: WikiModelRouteConfig,
	config: WikiConfig,
	context: ExecutionPolicyContext,
	qualityFloor: WikiModelQuality,
	budget: ResolvedExecutionPolicy["budget"],
	attempts: ExecutionPolicyAttempt[],
): CandidateEvaluation {
	const reasons: string[] = [];
	const estimatedCostUsd = estimatedCost(route, context);
	if (qualityRank(route.quality) < qualityRank(qualityFloor)) {
		reasons.push(`quality ${route.quality} is below required ${qualityFloor}.`);
	}
	const missingTools = context.requiredTools.filter(
		(tool) => !route.allowedTools.includes(tool),
	);
	if (missingTools.length > 0) {
		reasons.push(`missing required tools: ${missingTools.join(", ")}.`);
	}
	const estimatedTokens =
		context.estimatedInputTokens + context.estimatedOutputTokens;
	if (
		config.runtime.budgets.maxTokens !== undefined &&
		budget.spentTokens + estimatedTokens > config.runtime.budgets.maxTokens
	) {
		reasons.push("token budget would be exceeded.");
	}
	if (
		config.runtime.budgets.maxCostUsd !== undefined &&
		budget.spentCostUsd + estimatedCostUsd > config.runtime.budgets.maxCostUsd
	) {
		reasons.push("monetary budget would be exceeded.");
	}
	const maxLatencyMs = effectiveLatencyBudget(config);
	if (
		maxLatencyMs !== undefined &&
		budget.spentLatencyMs + route.timeoutMs > maxLatencyMs
	) {
		reasons.push("latency budget would be exceeded.");
	}
	if (attempts.some((entry) => entry.routeId === route.id)) {
		reasons.push("route was already attempted.");
	}
	return { route, estimatedCostUsd, reasons };
}

function escalationEligible(
	route: WikiModelRouteConfig,
	previous: ExecutionPolicyAttempt | undefined,
	previousRoute: WikiModelRouteConfig | undefined,
): boolean {
	if (!previous) return true;
	if (!previousRoute) return false;
	return qualityRank(route.quality) > qualityRank(previousRoute.quality);
}

function compareCandidates(
	left: CandidateEvaluation,
	right: CandidateEvaluation,
): number {
	return (
		left.estimatedCostUsd - right.estimatedCostUsd ||
		latencyRank(left.route.latency) - latencyRank(right.route.latency) ||
		qualityRank(left.route.quality) - qualityRank(right.route.quality) ||
		left.route.id.localeCompare(right.route.id)
	);
}

function selectedRoute(evaluation: CandidateEvaluation) {
	const route = evaluation.route;
	return {
		routeId: route.id,
		provider: route.provider,
		model: route.model,
		thinking: route.thinking,
		timeoutMs: route.timeoutMs,
		estimatedCostUsd: evaluation.estimatedCostUsd,
		quality: route.quality,
		latency: route.latency,
		pricingSnapshot: { ...route.pricing },
		allowedTools: [...route.allowedTools],
	};
}

function estimatedCost(
	route: WikiModelRouteConfig,
	context: ExecutionPolicyContext,
): number {
	return (
		(context.estimatedInputTokens * route.pricing.inputUsdPerMillion +
			context.estimatedOutputTokens * route.pricing.outputUsdPerMillion) /
		1_000_000
	);
}

function budgetState(
	config: WikiConfig,
	attempts: ExecutionPolicyAttempt[],
	priorUsage: ExecutionPolicyContext["priorUsage"],
): ResolvedExecutionPolicy["budget"] {
	return {
		...(config.runtime.budgets.maxTokens !== undefined
			? { maxTokens: config.runtime.budgets.maxTokens }
			: {}),
		...(config.runtime.budgets.maxCostUsd !== undefined
			? { maxCostUsd: config.runtime.budgets.maxCostUsd }
			: {}),
		...(effectiveLatencyBudget(config) !== undefined
			? { maxLatencyMs: effectiveLatencyBudget(config) }
			: {}),
		spentTokens:
			(priorUsage?.totalTokens || 0) +
			attempts.reduce(
				(sum, entry) => sum + entry.inputTokens + entry.outputTokens,
				0,
			),
		spentCostUsd:
			(priorUsage?.costUsd || 0) +
			attempts.reduce((sum, entry) => sum + entry.costUsd, 0),
		spentLatencyMs:
			(priorUsage?.latencyMs || 0) +
			attempts.reduce((sum, entry) => sum + entry.latencyMs, 0),
	};
}

function effectiveLatencyBudget(config: WikiConfig): number | undefined {
	const budgets = [
		config.runtime.budgets.maxLatencyMs,
		config.runtime.budgets.maxSeconds === undefined
			? undefined
			: config.runtime.budgets.maxSeconds * 1_000,
	].filter((value): value is number => value !== undefined);
	return budgets.length > 0 ? Math.min(...budgets) : undefined;
}

function effectiveQualityFloor(
	configured: WikiModelQuality,
	context: ExecutionPolicyContext,
): WikiModelQuality {
	let floor = configured;
	if (context.risk === "high") floor = maxQuality(floor, "high");
	if (context.risk === "critical") floor = "critical";
	if (
		context.pathScopes.some((path) =>
			/(^|\/)(auth|security|secrets?|release|controllers?)(\/|$)/i.test(path),
		)
	) {
		floor = maxQuality(floor, "high");
	}
	if (/security|incident|release/i.test(context.changeType || "")) {
		floor = maxQuality(floor, "high");
	}
	if (/security|architecture|integration/i.test(context.workerProfile || "")) {
		floor = maxQuality(floor, "high");
	}
	return floor;
}

function maxQuality(
	left: WikiModelQuality,
	right: WikiModelQuality,
): WikiModelQuality {
	return qualityRank(left) >= qualityRank(right) ? left : right;
}

function qualityRank(value: WikiModelQuality): number {
	return { standard: 0, high: 1, critical: 2 }[value];
}

function latencyRank(value: WikiModelRouteConfig["latency"]): number {
	return { fast: 0, balanced: 1, slow: 2 }[value];
}

function normalizeContext(
	context: ExecutionPolicyContext,
): ExecutionPolicyContext {
	for (const [name, value] of [
		["estimatedInputTokens", context.estimatedInputTokens],
		["estimatedOutputTokens", context.estimatedOutputTokens],
	] as const) {
		if (!Number.isInteger(value) || value < 0) {
			throw new Error(
				`Execution policy ${name} must be a non-negative integer.`,
			);
		}
	}
	if (context.priorUsage) {
		for (const value of Object.values(context.priorUsage)) {
			if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
				throw new Error(
					"Execution policy prior usage must be finite and non-negative.",
				);
			}
		}
	}
	const previousAttempts = (context.previousAttempts || []).map((attempt) => {
		for (const value of [
			attempt.inputTokens,
			attempt.outputTokens,
			attempt.costUsd,
			attempt.latencyMs,
		]) {
			if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
				throw new Error(
					"Execution policy attempt usage must be finite and non-negative.",
				);
			}
		}
		return { ...attempt };
	});
	return {
		...context,
		pathScopes: unique(context.pathScopes),
		requiredTools: unique(context.requiredTools),
		previousAttempts,
	};
}

function autonomyCapabilities(
	agency: WikiConfigAgencyLevel,
	automation: WikiConfig["runtime"]["automation"],
): ExecutionAutonomyCapabilities {
	const active = agency !== "observe";
	const delegated = agency === "delegate" || agency === "auto";
	return {
		readState: true,
		previewLoops: active,
		editSource: delegated,
		runChecks: delegated,
		startWorkers: delegated,
		appendApprovedIterations: delegated && automation !== "manual",
		acceptChanges: false,
		destructiveActions: false,
		publicActions: false,
		promoteSource: false,
		publishPackage: false,
		advanceController: false,
		continueWithoutSupervision: false,
	};
}

function policyRationale(
	selected: CandidateEvaluation | undefined,
	floor: WikiModelQuality,
	attempt: number,
	escalationAllowed: boolean,
): string {
	if (selected) {
		return `Selected ${selected.route.id}: meets ${floor} quality floor at lowest estimated cost, then latency.`;
	}
	if (!escalationAllowed) {
		return `Blocked: escalation attempt ${attempt} is not permitted by policy or prior outcome.`;
	}
	return `Blocked: no untried route satisfies ${floor} quality, tools, and remaining budgets.`;
}

function executionPolicyDigest(value: object): string {
	return `sha256:${createHash("sha256")
		.update(stableStringify(value))
		.digest("hex")}`;
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function unique(values: string[]): string[] {
	return [...new Set(values)].sort();
}
