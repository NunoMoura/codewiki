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

export interface WorkerObservationInput {
	traceId: string;
	workUnitId: string;
	workerId: string;
	attemptId: string;
	phase: WorkerActivityPhase;
	observedAt: string;
	leaseExpiresAt?: string;
	progress?: WorkerObservationProgress;
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
]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_SERIALIZED_BYTES = 2_048;
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

function progress(value: unknown): WorkerObservationProgress {
	const input = object(value, "Worker observation progress");
	const keys = Object.keys(input);
	if (keys.some((key) => key !== "current" && key !== "total")) {
		throw new Error("Worker observation progress contains unsupported fields.");
	}
	const current = boundedInteger(input.current, "progress.current");
	const total = boundedInteger(input.total, "progress.total");
	if (total < 1 || current > total)
		throw new Error("Worker observation progress must satisfy 0 <= current <= total.");
	return { current, total };
}

function boundedInteger(value: unknown, field: string): number {
	if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 1_000_000)
		throw new Error(`Worker observation ${field} must be an integer from 0 to 1000000.`);
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
