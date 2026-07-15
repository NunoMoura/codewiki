export const WORKER_ACTIVITY_PHASES = [
	"inspecting",
	"writing_failing_test",
	"implementing",
	"running_checks",
	"fixing_failed_check",
	"preparing_evidence",
	"waiting",
	"blocked",
	"completed",
	"failed",
] as const;

export type WorkerActivityPhase = (typeof WORKER_ACTIVITY_PHASES)[number];
export type WorkerObservationFreshness = "live" | "stale" | "expired";

export interface WorkerObservationProgress {
	current: number;
	total: number;
}

export interface WorkerObservationExecution {
	policyDigest: string;
	routeId: string;
	provider: string;
	model: string;
	thinking: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
	quality: "standard" | "high" | "critical";
	allowedTools: string[];
	timeoutMs: number;
	budget: {
		maxTokens?: number;
		maxCostUsd?: number;
		maxLatencyMs?: number;
	};
	usage?: {
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
		costUsd: number;
		latencyMs: number;
	};
}

export interface WorkerObservationInput {
	traceId: string;
	workUnitId: string;
	workerId: string;
	attemptId: string;
	phase: WorkerActivityPhase;
	observedAt: string;
	leaseExpiresAt?: string;
	progress?: WorkerObservationProgress;
	execution?: WorkerObservationExecution;
}

export interface WorkerObservation extends WorkerObservationInput {
	schemaVersion: "codewiki.worker-observation.v1";
}

const INPUT_KEYS = new Set([
	"traceId",
	"workUnitId",
	"workerId",
	"attemptId",
	"phase",
	"observedAt",
	"leaseExpiresAt",
	"progress",
	"execution",
]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_SERIALIZED_BYTES = 4_096;
const LIVE_WINDOW_MS = 30_000;

export function createWorkerObservation(value: unknown): WorkerObservation {
	const input = object(value, "Worker observation");
	for (const key of Object.keys(input)) {
		if (!INPUT_KEYS.has(key))
			throw new Error(`Worker observation field ${key} is not allowed.`);
	}
	const observation: WorkerObservation = {
		schemaVersion: "codewiki.worker-observation.v1",
		traceId: identifier(input.traceId, "traceId"),
		workUnitId: identifier(input.workUnitId, "workUnitId"),
		workerId: identifier(input.workerId, "workerId"),
		attemptId: identifier(input.attemptId, "attemptId"),
		phase: phase(input.phase),
		observedAt: timestamp(input.observedAt, "observedAt"),
		...(input.leaseExpiresAt === undefined
			? {}
			: { leaseExpiresAt: timestamp(input.leaseExpiresAt, "leaseExpiresAt") }),
		...(input.progress === undefined
			? {}
			: { progress: progress(input.progress) }),
		...(input.execution === undefined
			? {}
			: { execution: execution(input.execution) }),
	};
	if (
		observation.leaseExpiresAt &&
		Date.parse(observation.leaseExpiresAt) <= Date.parse(observation.observedAt)
	) {
		throw new Error("Worker observation lease must expire after observedAt.");
	}
	if (Buffer.byteLength(JSON.stringify(observation)) > MAX_SERIALIZED_BYTES) {
		throw new Error("Worker observation exceeds 2048 bytes.");
	}
	return observation;
}

export function workerObservationFreshness(
	observation: WorkerObservation,
	now = new Date(),
): WorkerObservationFreshness {
	const nowMs = now.getTime();
	if (
		observation.leaseExpiresAt &&
		nowMs > Date.parse(observation.leaseExpiresAt)
	)
		return "expired";
	const ageMs = nowMs - Date.parse(observation.observedAt);
	return ageMs >= 0 && ageMs <= LIVE_WINDOW_MS ? "live" : "stale";
}

function execution(value: unknown): WorkerObservationExecution {
	const input = object(value, "Worker observation execution");
	const allowed = new Set([
		"policyDigest",
		"routeId",
		"provider",
		"model",
		"thinking",
		"quality",
		"allowedTools",
		"timeoutMs",
		"budget",
		"usage",
	]);
	for (const key of Object.keys(input)) {
		if (!allowed.has(key))
			throw new Error(`Worker execution field ${key} is not allowed.`);
	}
	const digest = String(input.policyDigest || "");
	if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
		throw new Error("Worker execution policyDigest is invalid.");
	}
	const tools = stringList(input.allowedTools, "allowedTools");
	const budgetValue = object(input.budget, "Worker execution budget");
	assertKnownKeys(
		budgetValue,
		new Set(["maxTokens", "maxCostUsd", "maxLatencyMs"]),
		"budget",
	);
	const usageValue =
		input.usage === undefined
			? undefined
			: object(input.usage, "Worker execution usage");
	if (usageValue) {
		assertKnownKeys(
			usageValue,
			new Set([
				"inputTokens",
				"outputTokens",
				"totalTokens",
				"costUsd",
				"latencyMs",
			]),
			"usage",
		);
	}
	const usage = usageValue
		? {
				inputTokens: nonNegative(usageValue.inputTokens, "inputTokens"),
				outputTokens: nonNegative(usageValue.outputTokens, "outputTokens"),
				totalTokens: nonNegative(usageValue.totalTokens, "totalTokens"),
				costUsd: nonNegative(usageValue.costUsd, "costUsd"),
				latencyMs: nonNegative(usageValue.latencyMs, "latencyMs"),
			}
		: undefined;
	if (usage && usage.totalTokens !== usage.inputTokens + usage.outputTokens) {
		throw new Error("Worker execution usage token totals do not match.");
	}
	return {
		policyDigest: digest,
		routeId: identifier(input.routeId, "routeId"),
		provider: identifier(input.provider, "provider"),
		model: modelIdentifier(input.model),
		thinking: enumValue(
			input.thinking,
			["off", "minimal", "low", "medium", "high", "xhigh", "max"],
			"thinking",
		),
		quality: enumValue(
			input.quality,
			["standard", "high", "critical"],
			"quality",
		),
		allowedTools: tools,
		timeoutMs: positiveInteger(input.timeoutMs, "timeoutMs"),
		budget: {
			...optionalNumber(budgetValue.maxTokens, "maxTokens"),
			...optionalNumber(budgetValue.maxCostUsd, "maxCostUsd"),
			...optionalNumber(budgetValue.maxLatencyMs, "maxLatencyMs"),
		},
		...(usage ? { usage } : {}),
	};
}

function progress(value: unknown): WorkerObservationProgress {
	const input = object(value, "Worker observation progress");
	const keys = Object.keys(input);
	if (keys.some((key) => key !== "current" && key !== "total")) {
		throw new Error("Worker observation progress contains unsupported fields.");
	}
	const current = boundedInteger(input.current, "progress.current");
	const total = boundedInteger(input.total, "progress.total");
	if (total < 1 || current > total)
		throw new Error(
			"Worker observation progress must satisfy 0 <= current <= total.",
		);
	return { current, total };
}

function assertKnownKeys(
	value: Record<string, unknown>,
	allowed: Set<string>,
	label: string,
): void {
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) {
			throw new Error(`Worker execution ${label} field ${key} is not allowed.`);
		}
	}
}

function modelIdentifier(value: unknown): string {
	if (
		typeof value !== "string" ||
		!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)
	) {
		throw new Error("Worker execution model is invalid.");
	}
	return value;
}

function stringList(value: unknown, field: string): string[] {
	if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
		throw new Error(`Worker execution ${field} is invalid.`);
	}
	return [...new Set(value.map((item) => identifier(item, field)))].sort((left, right) =>
		left.localeCompare(right),
	);
}

function enumValue<T extends string>(
	value: unknown,
	values: readonly T[],
	field: string,
): T {
	if (typeof value !== "string" || !values.includes(value as T)) {
		throw new Error(`Worker execution ${field} is invalid.`);
	}
	return value as T;
}

function positiveInteger(value: unknown, field: string): number {
	if (!Number.isInteger(value) || Number(value) <= 0) {
		throw new Error(`Worker execution ${field} is invalid.`);
	}
	return Number(value);
}

function nonNegative(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new Error(`Worker execution ${field} is invalid.`);
	}
	return value;
}

function optionalNumber(value: unknown, field: string): Record<string, number> {
	return value === undefined ? {} : { [field]: nonNegative(value, field) };
}

function boundedInteger(value: unknown, field: string): number {
	if (
		!Number.isInteger(value) ||
		(value as number) < 0 ||
		(value as number) > 1_000_000
	)
		throw new Error(
			`Worker observation ${field} must be an integer from 0 to 1000000.`,
		);
	return value as number;
}

function identifier(value: unknown, field: string): string {
	if (typeof value !== "string" || !ID_PATTERN.test(value))
		throw new Error(`Worker observation ${field} is invalid.`);
	return value;
}

function phase(value: unknown): WorkerActivityPhase {
	if (!WORKER_ACTIVITY_PHASES.includes(value as WorkerActivityPhase))
		throw new Error("Worker observation phase is not allowed.");
	return value as WorkerActivityPhase;
}

function timestamp(value: unknown, field: string): string {
	if (
		typeof value !== "string" ||
		!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
		Number.isNaN(Date.parse(value))
	)
		throw new Error(`Worker observation ${field} must be an ISO timestamp.`);
	return value;
}

function object(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error(`${label} must be an object.`);
	return value as Record<string, unknown>;
}
