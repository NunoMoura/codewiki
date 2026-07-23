import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";

const DEFAULT_MAX_CONCURRENT_JOBS = 4;
const DEFAULT_MAX_COMPLETED_JOBS = 1_024;

export type ProjectCoordinatorClientKind =
	| "pi"
	| "dashboard"
	| "cli"
	| "test"
	| "other";

export type ProjectCoordinatorExecutionPolicy =
	| "supervised"
	| "unattended"
	| "paused";

export type ProjectCoordinatorLane =
	| { kind: "decision"; changeId: string; revision: number }
	| { kind: "planning" }
	| { kind: "assignment"; workItemId: string }
	| { kind: "implementation_review"; assignmentId: string }
	| { kind: "integration"; targetRef: string; baseRef: string }
	| { kind: "effect"; targetRef: string };

export interface ProjectCoordinatorClientInput {
	clientId: string;
	kind: ProjectCoordinatorClientKind;
	supervision?: "observer" | "approved";
}

export interface ProjectCoordinatorClientConnection {
	clientId: string;
	disconnect(): void;
}

export interface ProjectCoordinatorRecovery<T> {
	status: "completed";
	result: T;
}

export interface ProjectCoordinatorJob<T> {
	idempotencyKey: string;
	lane: ProjectCoordinatorLane;
	conflictRefs?: string[];
	effect?: "read" | "write";
	recover?: () =>
		| ProjectCoordinatorRecovery<T>
		| undefined
		| Promise<ProjectCoordinatorRecovery<T> | undefined>;
	run(signal: AbortSignal): T | Promise<T>;
}

export type ProjectCoordinatorEventState =
	| "client_connected"
	| "client_disconnected"
	| "execution_policy_changed"
	| "job_recovering"
	| "job_queued"
	| "job_started"
	| "job_recovered"
	| "job_completed"
	| "job_failed";

export interface ProjectCoordinatorEvent {
	generationId: string;
	state: ProjectCoordinatorEventState;
	observedAt: string;
	clientId?: string;
	clientKind?: ProjectCoordinatorClientKind;
	idempotencyKey?: string;
	lane?: ProjectCoordinatorLane["kind"];
	message?: string;
}

export type ProjectCoordinatorJobHoldReason =
	| "supervision_required"
	| "execution_paused"
	| "capacity"
	| "conflict";

export interface ProjectCoordinatorJobSnapshot {
	idempotencyKey: string;
	lane: ProjectCoordinatorLane;
	state: "recovering" | "queued" | "active";
	heldReason?: ProjectCoordinatorJobHoldReason;
	blockingJobKeys: string[];
}

export interface ProjectCoordinatorSnapshot {
	projectRoot: string;
	generationId: string;
	executionPolicy: ProjectCoordinatorExecutionPolicy;
	executionPermitted: boolean;
	clientCount: number;
	supervisorCount: number;
	recoveringJobCount: number;
	queuedJobCount: number;
	activeJobCount: number;
	completedJobCount: number;
	jobs: ProjectCoordinatorJobSnapshot[];
}

export interface ProjectCoordinatorOptions {
	generationId?: string;
	executionPolicy?: ProjectCoordinatorExecutionPolicy;
	maxConcurrentJobs?: number;
	maxCompletedJobs?: number;
	now?: () => string;
	onEvent?: (event: ProjectCoordinatorEvent) => void;
}

interface ConnectedClient {
	kind: ProjectCoordinatorClientKind;
	supervision: "observer" | "approved";
	connection: symbol;
}

interface CompletedJob {
	fingerprint: string;
	result: unknown;
}

interface PendingJob<T = unknown> {
	sequence: number;
	fingerprint: string;
	state: "recovering" | "queued" | "active";
	job: ProjectCoordinatorJob<T>;
	lockRefs: string[];
	controller: AbortController;
	resolve(value: T | PromiseLike<T>): void;
	reject(reason?: unknown): void;
	promise: Promise<T>;
	settled: boolean;
}

/**
 * Transport-neutral scheduling kernel for one elected project coordinator.
 * Service discovery, authentication, and cross-process election remain host
 * responsibilities; this class owns client supervision and compatible-job
 * admission inside one elected generation.
 */
export class ProjectCoordinator {
	readonly projectRoot: string;
	readonly generationId: string;

	private executionPolicy: ProjectCoordinatorExecutionPolicy;
	private readonly maxConcurrentJobs: number;
	private readonly maxCompletedJobs: number;
	private readonly now: () => string;
	private readonly onEvent?: (event: ProjectCoordinatorEvent) => void;
	private readonly clients = new Map<string, ConnectedClient>();
	private readonly jobs = new Map<string, PendingJob>();
	private readonly completed = new Map<string, CompletedJob>();
	private readonly activeLocks = new Map<string, string>();
	private nextSequence = 1;
	private closed = false;

	constructor(repoRoot: string, options: ProjectCoordinatorOptions = {}) {
		this.projectRoot = realpathSync(repoRoot);
		this.generationId =
			boundedText(options.generationId, "generationId") ||
			`coordinator:${randomUUID()}`;
		this.executionPolicy = normalizeExecutionPolicy(
			options.executionPolicy || "supervised",
		);
		this.maxConcurrentJobs = boundedInteger(
			options.maxConcurrentJobs,
			DEFAULT_MAX_CONCURRENT_JOBS,
			1,
			64,
			"maxConcurrentJobs",
		);
		this.maxCompletedJobs = boundedInteger(
			options.maxCompletedJobs,
			DEFAULT_MAX_COMPLETED_JOBS,
			1,
			10_000,
			"maxCompletedJobs",
		);
		this.now = options.now || (() => new Date().toISOString());
		this.onEvent = options.onEvent;
	}

	connectClient(
		input: ProjectCoordinatorClientInput,
	): ProjectCoordinatorClientConnection {
		this.assertOpen();
		const clientId = requiredText(input.clientId, "clientId");
		const kind = normalizeClientKind(input.kind);
		const supervision = normalizeSupervision(
			input.supervision || "observer",
		);
		if (this.clients.has(clientId)) {
			throw new Error(`Project coordinator client ${clientId} is already connected.`);
		}
		const connection = Symbol(clientId);
		this.clients.set(clientId, { kind, supervision, connection });
		this.emit({
			state: "client_connected",
			clientId,
			clientKind: kind,
		});
		this.pump();
		let connected = true;
		return {
			clientId,
			disconnect: () => {
				if (!connected) return;
				connected = false;
				const current = this.clients.get(clientId);
				if (!current || current.connection !== connection) return;
				this.clients.delete(clientId);
				this.emit({
					state: "client_disconnected",
					clientId,
					clientKind: kind,
				});
			},
		};
	}

	setExecutionPolicy(policy: ProjectCoordinatorExecutionPolicy): void {
		this.assertOpen();
		const normalized = normalizeExecutionPolicy(policy);
		if (this.executionPolicy === normalized) return;
		this.executionPolicy = normalized;
		this.emit({ state: "execution_policy_changed", message: normalized });
		this.pump();
	}

	schedule<T>(job: ProjectCoordinatorJob<T>): Promise<T> {
		this.assertOpen();
		const normalized = normalizeJob(job);
		const fingerprint = jobFingerprint(normalized);
		const completed = this.completed.get(normalized.idempotencyKey);
		if (completed) {
			assertSameJob(normalized.idempotencyKey, completed.fingerprint, fingerprint);
			return Promise.resolve(completed.result as T);
		}
		const existing = this.jobs.get(normalized.idempotencyKey);
		if (existing) {
			assertSameJob(normalized.idempotencyKey, existing.fingerprint, fingerprint);
			return existing.promise as Promise<T>;
		}

		let resolve!: (value: T | PromiseLike<T>) => void;
		let reject!: (reason?: unknown) => void;
		const promise = new Promise<T>((resolvePromise, rejectPromise) => {
			resolve = resolvePromise;
			reject = rejectPromise;
		});
		const entry: PendingJob<T> = {
			sequence: this.nextSequence++,
			fingerprint,
			state: normalized.recover ? "recovering" : "queued",
			job: normalized,
			lockRefs: jobLockRefs(normalized),
			controller: new AbortController(),
			resolve,
			reject,
			promise,
			settled: false,
		};
		this.jobs.set(normalized.idempotencyKey, entry as PendingJob);
		if (normalized.recover) {
			this.emitJob("job_recovering", entry);
			void this.recover(entry);
		} else {
			this.emitJob("job_queued", entry);
			this.pump();
		}
		return promise;
	}

	snapshot(): ProjectCoordinatorSnapshot {
		let recoveringJobCount = 0;
		let queuedJobCount = 0;
		let activeJobCount = 0;
		for (const entry of this.jobs.values()) {
			if (entry.state === "recovering") recoveringJobCount += 1;
			else if (entry.state === "queued") queuedJobCount += 1;
			else activeJobCount += 1;
		}
		return {
			projectRoot: this.projectRoot,
			generationId: this.generationId,
			executionPolicy: this.executionPolicy,
			executionPermitted: this.executionPermitted(),
			clientCount: this.clients.size,
			supervisorCount: this.supervisorCount(),
			recoveringJobCount,
			queuedJobCount,
			activeJobCount,
			completedJobCount: this.completed.size,
			jobs: [...this.jobs.values()]
				.sort((left, right) => left.sequence - right.sequence)
				.map((entry) => this.jobSnapshot(entry)),
		};
	}

	close(): void {
		if (this.closed) return;
		const active = [...this.jobs.values()].filter(
			(entry) => entry.state === "active",
		);
		if (active.length > 0) {
			throw new Error(
				`Project coordinator ${this.generationId} cannot close with ${active.length} active job(s).`,
			);
		}
		this.closed = true;
		for (const entry of this.jobs.values()) {
			entry.settled = true;
			entry.controller.abort();
			entry.reject(
				new Error(`Project coordinator ${this.generationId} closed before job start.`),
			);
		}
		this.jobs.clear();
		this.clients.clear();
		this.activeLocks.clear();
	}

	private async recover<T>(entry: PendingJob<T>): Promise<void> {
		try {
			const recovered = await entry.job.recover?.();
			if (entry.settled || this.closed) return;
			if (recovered !== undefined) {
				const normalized = normalizeRecovery(
					recovered,
					entry.job.idempotencyKey,
				);
				this.finish(entry, normalized.result, "job_recovered");
				return;
			}
			entry.state = "queued";
			this.emitJob("job_queued", entry);
			this.pump();
		} catch (error) {
			this.fail(entry, error);
		}
	}

	private pump(): void {
		if (this.closed || !this.executionPermitted()) return;
		let activeCount = this.activeLocksJobCount();
		if (activeCount >= this.maxConcurrentJobs) return;
		const queued = [...this.jobs.values()]
			.filter((entry) => entry.state === "queued")
			.sort((left, right) => left.sequence - right.sequence);
		for (const entry of queued) {
			if (activeCount >= this.maxConcurrentJobs) break;
			if (entry.lockRefs.some((ref) => this.activeLocks.has(ref))) continue;
			entry.state = "active";
			for (const ref of entry.lockRefs) {
				this.activeLocks.set(ref, entry.job.idempotencyKey);
			}
			activeCount += 1;
			this.emitJob("job_started", entry);
			void this.execute(entry);
		}
	}

	private async execute<T>(entry: PendingJob<T>): Promise<void> {
		try {
			const result = await entry.job.run(entry.controller.signal);
			this.finish(entry, result, "job_completed");
		} catch (error) {
			this.fail(entry, error);
		}
	}

	private finish<T>(
		entry: PendingJob<T>,
		result: T,
		state: "job_recovered" | "job_completed",
	): void {
		if (entry.settled) return;
		entry.settled = true;
		this.release(entry);
		this.remember(entry.job.idempotencyKey, entry.fingerprint, result);
		entry.resolve(result);
		this.emitJob(state, entry);
		this.pump();
	}

	private fail(entry: PendingJob, error: unknown): void {
		if (entry.settled) return;
		entry.settled = true;
		this.release(entry);
		entry.reject(error);
		this.emitJob("job_failed", entry, errorMessage(error));
		this.pump();
	}

	private release(entry: PendingJob): void {
		this.jobs.delete(entry.job.idempotencyKey);
		for (const ref of entry.lockRefs) {
			if (this.activeLocks.get(ref) === entry.job.idempotencyKey) {
				this.activeLocks.delete(ref);
			}
		}
	}

	private remember(
		idempotencyKey: string,
		fingerprint: string,
		result: unknown,
	): void {
		this.completed.set(idempotencyKey, { fingerprint, result });
		while (this.completed.size > this.maxCompletedJobs) {
			const oldest = this.completed.keys().next().value as string | undefined;
			if (!oldest) break;
			this.completed.delete(oldest);
		}
	}

	private executionPermitted(): boolean {
		if (this.executionPolicy === "paused") return false;
		if (this.executionPolicy === "unattended") return true;
		return this.supervisorCount() > 0;
	}

	private supervisorCount(): number {
		let count = 0;
		for (const client of this.clients.values()) {
			if (client.supervision === "approved") count += 1;
		}
		return count;
	}

	private jobSnapshot(entry: PendingJob): ProjectCoordinatorJobSnapshot {
		const blockingJobKeys =
			entry.state === "queued"
				? uniqueSorted(
						entry.lockRefs.flatMap((ref) => {
							const owner = this.activeLocks.get(ref);
							return owner ? [owner] : [];
						}),
					)
				: [];
		let heldReason: ProjectCoordinatorJobHoldReason | undefined;
		if (entry.state === "queued") {
			if (this.executionPolicy === "paused") heldReason = "execution_paused";
			else if (
				this.executionPolicy === "supervised" &&
				this.supervisorCount() === 0
			) {
				heldReason = "supervision_required";
			} else if (blockingJobKeys.length > 0) heldReason = "conflict";
			else if (this.activeLocksJobCount() >= this.maxConcurrentJobs) {
				heldReason = "capacity";
			}
		}
		return {
			idempotencyKey: entry.job.idempotencyKey,
			lane: entry.job.lane,
			state: entry.state,
			...(heldReason ? { heldReason } : {}),
			blockingJobKeys,
		};
	}

	private activeLocksJobCount(): number {
		let count = 0;
		for (const entry of this.jobs.values()) {
			if (entry.state === "active") count += 1;
		}
		return count;
	}

	private emitJob(
		state: Extract<ProjectCoordinatorEventState, `job_${string}`>,
		entry: PendingJob,
		message?: string,
	): void {
		this.emit({
			state,
			idempotencyKey: entry.job.idempotencyKey,
			lane: entry.job.lane.kind,
			...(message ? { message } : {}),
		});
	}

	private emit(
		event: Omit<ProjectCoordinatorEvent, "generationId" | "observedAt">,
	): void {
		try {
			this.onEvent?.({
				generationId: this.generationId,
				observedAt: this.now(),
				...event,
			});
		} catch {
			// Observability cannot become scheduling authority.
		}
	}

	private assertOpen(): void {
		if (this.closed) {
			throw new Error(`Project coordinator ${this.generationId} is closed.`);
		}
	}
}

function normalizeJob<T>(
	job: ProjectCoordinatorJob<T>,
): ProjectCoordinatorJob<T> {
	const idempotencyKey = requiredText(job.idempotencyKey, "idempotencyKey");
	const lane = normalizeLane(job.lane);
	if (typeof job.run !== "function") {
		throw new Error(`Project coordinator job ${idempotencyKey} requires run().`);
	}
	if (job.recover !== undefined && typeof job.recover !== "function") {
		throw new Error(
			`Project coordinator job ${idempotencyKey} recover must be a function.`,
		);
	}
	if (job.conflictRefs !== undefined && !Array.isArray(job.conflictRefs)) {
		throw new Error(
			`Project coordinator job ${idempotencyKey} conflictRefs must be an array.`,
		);
	}
	const conflictRefs = uniqueSorted(
		(job.conflictRefs || []).map((ref) => requiredText(ref, "conflictRef")),
	);
	const effect = normalizeEffect(job.effect || "read");
	if (effect === "write" && !job.recover) {
		throw new Error(
			`Project coordinator write job ${idempotencyKey} requires durable recovery.`,
		);
	}
	return { ...job, idempotencyKey, lane, conflictRefs, effect };
}

function normalizeRecovery<T>(
	value: ProjectCoordinatorRecovery<T>,
	idempotencyKey: string,
): ProjectCoordinatorRecovery<T> {
	if (
		!value ||
		typeof value !== "object" ||
		value.status !== "completed" ||
		!("result" in value)
	) {
		throw new Error(
			`Project coordinator recovery for ${idempotencyKey} must return completed result evidence.`,
		);
	}
	return value;
}

function normalizeLane(lane: ProjectCoordinatorLane): ProjectCoordinatorLane {
	if (!lane || typeof lane !== "object") {
		throw new Error("Project coordinator lane is required.");
	}
	switch (lane.kind) {
		case "decision":
			return {
				kind: lane.kind,
				changeId: requiredText(lane.changeId, "changeId"),
				revision: requiredInteger(lane.revision, 1, 1_000_000, "revision"),
			};
		case "planning":
			return lane;
		case "assignment":
			return {
				kind: lane.kind,
				workItemId: requiredText(lane.workItemId, "workItemId"),
			};
		case "implementation_review":
			return {
				kind: lane.kind,
				assignmentId: requiredText(lane.assignmentId, "assignmentId"),
			};
		case "integration":
			return {
				kind: lane.kind,
				targetRef: requiredText(lane.targetRef, "targetRef"),
				baseRef: requiredText(lane.baseRef, "baseRef"),
			};
		case "effect":
			return {
				kind: lane.kind,
				targetRef: requiredText(lane.targetRef, "targetRef"),
			};
		default:
			throw new Error(
				`Unsupported project coordinator lane: ${String((lane as { kind?: unknown }).kind)}.`,
			);
	}
}

function jobFingerprint(job: ProjectCoordinatorJob<unknown>): string {
	return JSON.stringify({
		lane: job.lane,
		conflictRefs: job.conflictRefs || [],
		effect: job.effect || "read",
	});
}

function assertSameJob(
	idempotencyKey: string,
	existingFingerprint: string,
	candidateFingerprint: string,
): void {
	if (existingFingerprint === candidateFingerprint) return;
	throw new Error(
		`Project coordinator idempotency key ${idempotencyKey} was reused for a different job.`,
	);
}

function jobLockRefs(job: ProjectCoordinatorJob<unknown>): string[] {
	return uniqueSorted([
		...laneLockRefs(job.lane),
		...(job.conflictRefs || []).map((ref) => `conflict:${ref}`),
	]);
}

function laneLockRefs(lane: ProjectCoordinatorLane): string[] {
	switch (lane.kind) {
		case "decision":
			return [
				`decision-change:${lane.changeId}`,
				`decision:${lane.changeId}:${lane.revision}`,
			];
		case "planning":
			return ["planning"];
		case "assignment":
			return [`assignment:${lane.workItemId}`];
		case "implementation_review":
			return [`implementation_review:${lane.assignmentId}`];
		case "integration":
			return [
				`integration:${lane.targetRef}:${lane.baseRef}`,
				`target-writer:${lane.targetRef}`,
			];
		case "effect":
			return [`effect:${lane.targetRef}`, `target-writer:${lane.targetRef}`];
	}
}

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values)].sort(compareText);
}

function requiredText(value: string, field: string): string {
	const normalized = boundedText(value, field);
	if (!normalized) throw new Error(`${field} is required.`);
	return normalized;
}

function boundedText(value: string | undefined, field: string): string {
	const normalized = typeof value === "string" ? value.trim() : "";
	if (normalized.length > 512) {
		throw new Error(`${field} exceeds 512 characters.`);
	}
	return normalized;
}

function normalizeExecutionPolicy(
	value: ProjectCoordinatorExecutionPolicy,
): ProjectCoordinatorExecutionPolicy {
	if (value === "supervised" || value === "unattended" || value === "paused") {
		return value;
	}
	throw new Error(`Unsupported project coordinator execution policy: ${String(value)}.`);
}

function normalizeClientKind(
	value: ProjectCoordinatorClientKind,
): ProjectCoordinatorClientKind {
	if (
		value === "pi" ||
		value === "dashboard" ||
		value === "cli" ||
		value === "test" ||
		value === "other"
	) {
		return value;
	}
	throw new Error(`Unsupported project coordinator client kind: ${String(value)}.`);
}

function normalizeSupervision(
	value: "observer" | "approved",
): "observer" | "approved" {
	if (value === "observer" || value === "approved") return value;
	throw new Error(`Unsupported project coordinator supervision: ${String(value)}.`);
}

function normalizeEffect(value: "read" | "write"): "read" | "write" {
	if (value === "read" || value === "write") return value;
	throw new Error(`Unsupported project coordinator effect: ${String(value)}.`);
}

function requiredInteger(
	value: number | undefined,
	minimum: number,
	maximum: number,
	field: string,
): number {
	if (value === undefined) throw new Error(`${field} is required.`);
	return boundedInteger(value, minimum, minimum, maximum, field);
}

function boundedInteger(
	value: number | undefined,
	fallback: number,
	minimum: number,
	maximum: number,
	field: string,
): number {
	const normalized = value ?? fallback;
	if (
		!Number.isInteger(normalized) ||
		normalized < minimum ||
		normalized > maximum
	) {
		throw new Error(`${field} must be an integer from ${minimum} to ${maximum}.`);
	}
	return normalized;
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
