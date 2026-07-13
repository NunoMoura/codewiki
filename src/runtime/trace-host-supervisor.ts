import type { RuntimeHostLifecyclePlan } from "./lifecycle.ts";
import {
	dispatchTraceHosts,
	type DispatchTraceHostsResult,
	type TraceHostSessionFactory,
	type TraceHostSessionInput,
	type TraceHostResult,
	type TraceHostSessionStart,
	type TraceHostTarget,
} from "./trace-host-runner.ts";

export type TraceHostSessionState =
	| "running"
	| "stopping"
	| "stopped"
	| "failed";
export type TraceHostStopReason =
	| "supervision_lost"
	| "budget_exhausted"
	| "monitoring_failed"
	| "shutdown"
	| "cancelled";

export interface TraceHostSupervisorOptions {
	maxTraceHosts?: number;
	maxSeconds?: number;
	now?: () => number;
}

export interface TraceHostSupervisorReconcileInput {
	supervisionAttached: boolean;
}

export interface RunSupervisedTraceHostDispatchInput {
	repoRoot: string;
	plan: RuntimeHostLifecyclePlan;
	supervision: {
		attached: boolean;
		supervisorId: string;
	};
	supervisor: TraceHostSupervisor;
	startSession: TraceHostSessionFactory;
}

export interface RunSupervisedTraceHostDispatchResult {
	dispatch: DispatchTraceHostsResult;
	sessions: TraceHostSessionSnapshot[];
}

export interface TraceHostSessionSnapshot {
	traceId: string;
	target: TraceHostTarget;
	sessionRef: string;
	supervisorId: string;
	startedAt: string;
	state: TraceHostSessionState;
	pid?: number;
	stopReason?: TraceHostStopReason;
	message?: string;
	result?: TraceHostResult;
}

interface ManagedTraceHostSession {
	start: TraceHostSessionStart;
	supervisorId: string;
	startedAtMs: number;
	state: TraceHostSessionState;
	stopReason?: TraceHostStopReason;
	message?: string;
	result?: TraceHostResult;
}

export async function runSupervisedTraceHostDispatch(
	input: RunSupervisedTraceHostDispatchInput,
): Promise<RunSupervisedTraceHostDispatchResult> {
	await input.supervisor.reconcile({
		supervisionAttached: input.supervision.attached,
	});
	const dispatch = await dispatchTraceHosts({
		repoRoot: input.repoRoot,
		plan: input.plan,
		supervision: input.supervision,
		startSession: (sessionInput) =>
			input.supervisor.start(sessionInput, input.startSession),
	});
	return { dispatch, sessions: input.supervisor.snapshot() };
}

export class TraceHostSupervisor {
	readonly #maxTraceHosts: number;
	readonly #maxSeconds?: number;
	readonly #now: () => number;
	readonly #sessions = new Map<string, ManagedTraceHostSession>();

	constructor(options: TraceHostSupervisorOptions = {}) {
		this.#maxTraceHosts = positiveInteger(options.maxTraceHosts, 1);
		this.#maxSeconds = optionalPositiveInteger(options.maxSeconds);
		this.#now = options.now || Date.now;
	}

	activeTraceIds(): string[] {
		return [...this.#sessions.values()]
			.filter((session) => activeState(session.state))
			.map((session) => session.start.traceId)
			.sort((left, right) => left.localeCompare(right));
	}

	async start(
		input: TraceHostSessionInput,
		factory: TraceHostSessionFactory,
	): Promise<TraceHostSessionStart> {
		const existing = this.#sessions.get(input.traceId);
		if (existing && activeState(existing.state)) return existing.start;
		if (this.activeTraceIds().length >= this.#maxTraceHosts) {
			throw new Error(
				`Trace host capacity is full (${this.#maxTraceHosts}/${this.#maxTraceHosts}).`,
			);
		}
		const start = await factory(input);
		assertSessionIdentity(input, start);
		const startedAtMs = this.#now();
		this.#sessions.set(input.traceId, {
			start,
			supervisorId: input.supervisorId,
			startedAtMs,
			state: "running",
		});
		return start;
	}

	async reconcile(
		input: TraceHostSupervisorReconcileInput,
	): Promise<TraceHostSessionSnapshot[]> {
		for (const session of this.#sessions.values()) {
			if (!activeState(session.state)) continue;
			const running = await inspectSession(session);
			if (running === false) {
				session.result = await collectSessionResult(session);
				session.state = "stopped";
				continue;
			}
			if (running === undefined) {
				await stopSession(session, "monitoring_failed");
				continue;
			}
			if (session.state === "failed") {
				await stopSession(session, session.stopReason || "monitoring_failed");
				continue;
			}
			if (!input.supervisionAttached) {
				await stopSession(session, "supervision_lost");
				continue;
			}
			if (this.#budgetExhausted(session)) {
				await stopSession(session, "budget_exhausted");
			}
		}
		return this.snapshot();
	}

	async cancel(
		traceId: string,
		expectedSessionRef?: string,
	): Promise<TraceHostSessionSnapshot> {
		const session = this.#sessions.get(traceId);
		if (!session || !activeState(session.state)) {
			throw new Error(`Trace host ${traceId} is not active.`);
		}
		if (
			expectedSessionRef !== undefined &&
			session.start.sessionRef !== expectedSessionRef
		) {
			throw new Error(`Trace host ${traceId} session changed; refresh state.`);
		}
		await stopSession(session, "cancelled");
		if (session.state === "failed") {
			throw new Error(session.message || `Trace host ${traceId} failed to stop.`);
		}
		return sessionSnapshot(session);
	}

	async stopAll(
		reason: Extract<TraceHostStopReason, "shutdown" | "cancelled"> = "shutdown",
	): Promise<TraceHostSessionSnapshot[]> {
		for (const session of this.#sessions.values()) {
			if (activeState(session.state)) await stopSession(session, reason);
		}
		return this.snapshot();
	}

	snapshot(): TraceHostSessionSnapshot[] {
		return [...this.#sessions.values()]
			.map(sessionSnapshot)
			.sort((left, right) => left.traceId.localeCompare(right.traceId));
	}

	#budgetExhausted(session: ManagedTraceHostSession): boolean {
		return (
			this.#maxSeconds !== undefined &&
			this.#now() - session.startedAtMs >= this.#maxSeconds * 1_000
		);
	}
}

async function inspectSession(
	session: ManagedTraceHostSession,
): Promise<boolean | undefined> {
	try {
		return await session.start.controller.isRunning();
	} catch (error) {
		session.message = `Trace host monitoring failed: ${errorMessage(error)}`;
		return undefined;
	}
}

async function stopSession(
	session: ManagedTraceHostSession,
	reason: TraceHostStopReason,
): Promise<void> {
	const retryingFailedStop = session.state === "failed";
	session.state = "stopping";
	session.stopReason = reason;
	try {
		await session.start.controller.stop(reason);
		const observed = await collectSessionResult(session);
		session.result = stoppedSessionResult(reason, observed);
		session.state = "stopped";
		if (retryingFailedStop) session.message = undefined;
	} catch (error) {
		session.state = "failed";
		session.message = `Trace host stop failed: ${errorMessage(error)}`;
	}
}

function sessionSnapshot(
	session: ManagedTraceHostSession,
): TraceHostSessionSnapshot {
	return {
		traceId: session.start.traceId,
		target: session.start.target,
		sessionRef: session.start.sessionRef,
		supervisorId: session.supervisorId,
		startedAt: new Date(session.startedAtMs).toISOString(),
		state: session.state,
		...(session.start.pid ? { pid: session.start.pid } : {}),
		...(session.stopReason ? { stopReason: session.stopReason } : {}),
		...(session.message ? { message: session.message } : {}),
		...(session.result ? { result: session.result } : {}),
	};
}

async function collectSessionResult(
	session: ManagedTraceHostSession,
): Promise<TraceHostResult | undefined> {
	if (!session.start.controller.completion) return session.result;
	try {
		return (
			(await session.start.controller.completion())?.result || session.result
		);
	} catch (error) {
		session.message = `Trace host result collection failed: ${errorMessage(error)}`;
		return {
			version: 1,
			outcome: "failed",
			summary: "Trace host result collection failed.",
			refs: [],
		};
	}
}

function stoppedSessionResult(
	reason: TraceHostStopReason,
	observed: TraceHostResult | undefined,
): TraceHostResult {
	const { approval: _approval, ...metadata } = observed || {
		version: 1 as const,
		refs: [],
		summary: "",
		outcome: "failed" as const,
	};
	return {
		...metadata,
		version: 1,
		outcome: stoppedOutcome(reason),
		summary: stopReasonSummary(reason),
		refs: observed?.refs || [],
	};
}

function stoppedOutcome(
	reason: TraceHostStopReason,
): "cancelled" | "failed" | "blocked" {
	if (reason === "cancelled") return "cancelled";
	if (reason === "monitoring_failed") return "failed";
	return "blocked";
}

function stopReasonSummary(reason: TraceHostStopReason): string {
	switch (reason) {
		case "cancelled":
			return "Trace execution was cancelled by the user.";
		case "supervision_lost":
			return "Trace execution stopped because approved supervision was lost.";
		case "budget_exhausted":
			return "Trace execution stopped after reaching its elapsed-time budget.";
		case "shutdown":
			return "Trace execution stopped because its supervisor shut down.";
		case "monitoring_failed":
			return "Trace execution stopped because process monitoring failed.";
	}
}

function assertSessionIdentity(
	input: TraceHostSessionInput,
	start: TraceHostSessionStart,
): void {
	if (start.traceId !== input.traceId || start.target !== input.target) {
		throw new Error("Trace host factory returned mismatched session identity.");
	}
	if (!start.controller) {
		throw new Error("Trace host factory must return a controllable session.");
	}
}

function activeState(state: TraceHostSessionState): boolean {
	return state === "running" || state === "stopping" || state === "failed";
}

function positiveInteger(value: number | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	if (!Number.isInteger(value) || value < 1) {
		throw new Error("Trace host maxTraceHosts must be a positive integer.");
	}
	return value;
}

function optionalPositiveInteger(value: number | undefined): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isInteger(value) || value < 1) {
		throw new Error("Trace host maxSeconds must be a positive integer.");
	}
	return value;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
