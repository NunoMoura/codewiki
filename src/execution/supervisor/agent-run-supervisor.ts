import {randomBytes} from "node:crypto";

import {
	createAgentRunCancellationRequest,
	createAgentRunHandle,
	type AgentRunnerHandshake,
	type AgentRunCancellationRequest,
	type AgentRunEvent,
	type AgentRunHandle,
	type AgentRunQuiescence,
	type AgentRunSpecification,
} from "../ports.ts";
import {canonicalJson} from "../../utils/canonical-json.ts";
import {
	admitAgentRunnerHandshakeResponse,
	createAgentRunnerAcceptedEvent,
	createAgentRunnerProcessChallenge,
	openAgentRunnerEnvelope,
	sealAgentRunnerEnvelope,
	type AgentRunnerAuthenticatedEnvelope,
	type AgentRunnerProcessChallenge,
} from "./process-protocol.ts";

export interface AgentRunnerProcessConnection {
	receive(signal: AbortSignal): Promise<unknown>;
	send(envelope: AgentRunnerAuthenticatedEnvelope): Promise<void>;
	requestClose(): Promise<void>;
	terminate(): Promise<void>;
	whenExited(): Promise<void>;
}

export interface AgentRunnerProcessLauncher {
	launch(input: {
		readonly challenge: AgentRunnerProcessChallenge;
		/** Inject through a private inherited channel, never argv, environment, or logs. */
		readonly bootstrapKey: Uint8Array;
		readonly signal: AbortSignal;
	}): Promise<AgentRunnerProcessConnection>;
}

export interface AgentRunSupervisor {
	start(specification: AgentRunSpecification): Promise<AgentRunHandle>;
	cancel(request: AgentRunCancellationRequest): Promise<void>;
	readEvents(
		handle: AgentRunHandle,
		afterSequence?: number,
	): readonly AgentRunEvent[];
	waitForQuiescence(handle: AgentRunHandle): Promise<AgentRunQuiescence>;
	shutdown(): Promise<void>;
}

export interface AgentRunSupervisorOptions {
	readonly launcher: AgentRunnerProcessLauncher;
	readonly now?: () => string;
	readonly random?: (size: number) => Uint8Array;
	readonly handshakeTimeoutMs?: number;
	readonly cancellationGraceMs?: number;
	readonly processExitTimeoutMs?: number;
}

export function createAgentRunSupervisor(
	options: AgentRunSupervisorOptions,
): AgentRunSupervisor {
	const state = createAgentRunSupervisorState(options);
	return Object.freeze({
		start: (specification: AgentRunSpecification) =>
			startSupervisedRun(state, specification),
		cancel: (request: AgentRunCancellationRequest) =>
			cancelSupervisedRun(state, request),
		readEvents: (handle: AgentRunHandle, afterSequence?: number) =>
			readSupervisedEvents(state, handle, afterSequence),
		waitForQuiescence: (handle: AgentRunHandle) =>
			waitForSupervisedQuiescence(state, handle),
		shutdown: () => shutdownAgentRunSupervisor(state),
	});
}

interface ActiveRun {
	readonly specification: AgentRunSpecification;
	readonly handle: AgentRunHandle;
	readonly challenge: AgentRunnerProcessChallenge;
	readonly bootstrapKey: Uint8Array;
	readonly connection: AgentRunnerProcessConnection;
	readonly events: AgentRunEvent[];
	readonly completion: Deferred<AgentRunQuiescence>;
	readonly receiveAbort: AbortController;
	txSequence: number;
	rxSequence: number;
	terminal: boolean;
	cancellationSent: boolean;
	deadlineTimer: ReturnType<typeof setTimeout> | null;
	cancellationTimer: ReturnType<typeof setTimeout> | null;
}

interface Deferred<T> {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
	readonly reject: (reason: Error) => void;
}

interface AgentRunSupervisorState {
	readonly launcher: AgentRunnerProcessLauncher;
	readonly now: () => string;
	readonly random: (size: number) => Uint8Array;
	readonly handshakeTimeoutMs: number;
	readonly cancellationGraceMs: number;
	readonly processExitTimeoutMs: number;
	readonly runs: Map<string, ActiveRun>;
	shuttingDown: boolean;
}

function createAgentRunSupervisorState(
	options: AgentRunSupervisorOptions,
): AgentRunSupervisorState {
	if (!options || typeof options.launcher?.launch !== "function") {
		throw new Error("Agent Run Supervisor requires a Runner process launcher.");
	}
	return {
		launcher: options.launcher,
		now: options.now ?? (() => new Date().toISOString()),
		random: options.random ?? ((size) => randomBytes(size)),
		handshakeTimeoutMs: boundedDuration(
			options.handshakeTimeoutMs ?? 10_000,
			"Agent Run Supervisor handshakeTimeoutMs",
			60_000,
		),
		cancellationGraceMs: boundedDuration(
			options.cancellationGraceMs ?? 5_000,
			"Agent Run Supervisor cancellationGraceMs",
			60_000,
		),
		processExitTimeoutMs: boundedDuration(
			options.processExitTimeoutMs ?? 5_000,
			"Agent Run Supervisor processExitTimeoutMs",
			60_000,
		),
		runs: new Map(),
		shuttingDown: false,
	};
}

async function startSupervisedRun(
	state: AgentRunSupervisorState,
	specification: AgentRunSpecification,
): Promise<AgentRunHandle> {
	if (state.shuttingDown) throw new Error("Agent Run Supervisor is shutting down.");
	const runKey = keyFor(specification.runId, specification.specDigest);
	if (state.runs.has(runKey)) throw new Error("Agent Run is already supervised.");
	const active = await admitAgentRun({
		specification,
		launcher: state.launcher,
		now: state.now,
		random: state.random,
		handshakeTimeoutMs: state.handshakeTimeoutMs,
	});
	state.runs.set(runKey, active);
	active.deadlineTimer = scheduleAfter(
		Math.max(1, Date.parse(specification.deadlineAt) - Date.parse(state.now())),
		() => {
			void cancelForDeadline(active, state.now, state.cancellationGraceMs);
		},
	);
	void pumpAgentRun(active, state.processExitTimeoutMs);
	return active.handle;
}

async function cancelSupervisedRun(
	state: AgentRunSupervisorState,
	request: AgentRunCancellationRequest,
): Promise<void> {
	const active = activeFor(state, request.runId, request.specDigest);
	await sendCancellation(active, request, state.cancellationGraceMs);
}

function readSupervisedEvents(
	state: AgentRunSupervisorState,
	handle: AgentRunHandle,
	afterSequence = -1,
): readonly AgentRunEvent[] {
	if (!Number.isSafeInteger(afterSequence) || afterSequence < -1) {
		throw new Error("Agent Run event cursor is invalid.");
	}
	const active = runForHandle(state, handle);
	return Object.freeze(
		active.events.filter((event) => event.sequence > afterSequence),
	);
}

function waitForSupervisedQuiescence(
	state: AgentRunSupervisorState,
	handle: AgentRunHandle,
): Promise<AgentRunQuiescence> {
	return runForHandle(state, handle).completion.promise;
}

async function shutdownAgentRunSupervisor(state: AgentRunSupervisorState): Promise<void> {
	state.shuttingDown = true;
	const activeRuns = [...state.runs.values()].filter((run) => !run.terminal);
	await Promise.all(
		activeRuns.map((active) => shutdownAgentRun(active, state)),
	);
}

async function shutdownAgentRun(
	active: ActiveRun,
	state: AgentRunSupervisorState,
): Promise<void> {
	if (!active.cancellationSent) {
		const request = createAgentRunCancellationRequest(active.handle, {
			expectedEventSequence: lastEventSequence(active),
			reason: "runtime-shutdown",
			requestedAt: state.now(),
		});
		try {
			await sendCancellation(active, request, state.cancellationGraceMs);
		} catch (error) {
			await stopAgentRun(
				active,
				asError(error, "Agent Runner shutdown cancellation failed."),
			);
		}
	}
	await ignoreFailure(active.completion.promise);
}

function activeFor(
	state: AgentRunSupervisorState,
	runId: string,
	specDigest: string,
): ActiveRun {
	const active = state.runs.get(keyFor(runId, specDigest));
	if (!active) throw new Error("Agent Run is not supervised.");
	return active;
}

function runForHandle(
	state: AgentRunSupervisorState,
	handle: AgentRunHandle,
): ActiveRun {
	const active = activeFor(state, handle.runId, handle.specDigest);
	if (canonicalJson(active.handle) !== canonicalJson(handle)) {
		throw new Error("Agent Run handle does not match the supervised run.");
	}
	return active;
}

async function pumpAgentRun(
	active: ActiveRun,
	processExitTimeoutMs: number,
): Promise<void> {
	try {
		while (!active.terminal) {
			const value = await active.connection.receive(active.receiveAbort.signal);
			const envelope = openAgentRunnerEnvelope({
				challenge: active.challenge,
				expectedDirection: "runner-to-supervisor",
				expectedSequence: active.rxSequence,
				value,
				handle: active.handle,
				bootstrapKey: active.bootstrapKey,
			});
			active.rxSequence += 1;
			if (envelope.message.kind === "event") {
				appendAgentRunEvent(active, envelope.message.event);
				continue;
			}
			if (envelope.message.kind !== "quiescence") {
				throw new Error("Agent Runner emitted an unsupported message.");
			}
			if (
				envelope.message.quiescence.finalEventSequence !==
				lastEventSequence(active)
			) {
				throw new Error("Agent Runner quiescence does not cover the final event.");
			}
			await withTimeout({
				operation: closeAndWait(active.connection),
				timeoutMs: processExitTimeoutMs,
				message: "Agent Runner process did not exit after quiescence.",
			});
			completeAgentRun(active, envelope.message.quiescence);
		}
	} catch (error) {
		if (!active.terminal) {
			await stopAgentRun(
				active,
				asError(error, "Agent Runner process stopped."),
			);
		}
	}
}

function appendAgentRunEvent(active: ActiveRun, event: AgentRunEvent): void {
	if (event.sequence !== active.events.length) {
		throw new Error("Agent Runner event sequence is stale or out of order.");
	}
	active.events.push(event);
}

async function sendCancellation(
	active: ActiveRun,
	request: AgentRunCancellationRequest,
	cancellationGraceMs: number,
): Promise<void> {
	if (active.terminal) throw new Error("Agent Run is already terminal.");
	if (active.cancellationSent) {
		throw new Error("Agent Run cancellation was already requested.");
	}
	if (request.expectedEventSequence !== lastEventSequence(active)) {
		throw new Error("Agent Run cancellation event sequence conflict.");
	}
	const envelope = sealAgentRunnerEnvelope({
		challenge: active.challenge,
		direction: "supervisor-to-runner",
		sequence: active.txSequence,
		message: {kind: "cancel", request},
		handle: active.handle,
		bootstrapKey: active.bootstrapKey,
	});
	await active.connection.send(envelope);
	active.txSequence += 1;
	active.cancellationSent = true;
	active.cancellationTimer = scheduleAfter(cancellationGraceMs, () => {
		void stopAgentRun(
			active,
			new Error("Agent Runner did not quiesce after cancellation."),
		);
	});
}

async function cancelForDeadline(
	active: ActiveRun,
	now: () => string,
	cancellationGraceMs: number,
): Promise<void> {
	if (active.terminal || active.cancellationSent) return;
	try {
		const request = createAgentRunCancellationRequest(active.handle, {
			expectedEventSequence: lastEventSequence(active),
			reason: "deadline",
			requestedAt: now(),
		});
		await sendCancellation(active, request, cancellationGraceMs);
	} catch (error) {
		await stopAgentRun(
			active,
			asError(error, "Agent Runner deadline cancellation failed."),
		);
	}
}

function completeAgentRun(
	active: ActiveRun,
	quiescence: AgentRunQuiescence,
): void {
	if (active.terminal) return;
	active.terminal = true;
	clearRunTimers(active);
	active.receiveAbort.abort();
	active.bootstrapKey.fill(0);
	active.completion.resolve(quiescence);
}

async function stopAgentRun(active: ActiveRun, error: Error): Promise<void> {
	if (active.terminal) return;
	active.terminal = true;
	clearRunTimers(active);
	active.receiveAbort.abort();
	await ignoreFailure(active.connection.terminate());
	active.bootstrapKey.fill(0);
	active.completion.reject(error);
}

interface PendingRunAdmission {
	readonly specification: AgentRunSpecification;
	readonly handle: AgentRunHandle;
	readonly challenge: AgentRunnerProcessChallenge;
	readonly bootstrapKey: Uint8Array;
	readonly acceptedEvent: AgentRunEvent;
	readonly launchAbort: AbortController;
}

async function admitAgentRun(input: {
	readonly specification: AgentRunSpecification;
	readonly launcher: AgentRunnerProcessLauncher;
	readonly now: () => string;
	readonly random: (size: number) => Uint8Array;
	readonly handshakeTimeoutMs: number;
}): Promise<ActiveRun> {
	const pending = prepareRunAdmission(input);
	const connection = await launchAuthenticatedRunner({
		pending,
		launcher: input.launcher,
		now: input.now,
		handshakeTimeoutMs: input.handshakeTimeoutMs,
	});
	const completion = deferred<AgentRunQuiescence>();
	void suppressRejection(completion.promise);
	return {
		specification: pending.specification,
		handle: pending.handle,
		challenge: pending.challenge,
		bootstrapKey: pending.bootstrapKey,
		connection,
		events: [pending.acceptedEvent],
		completion,
		receiveAbort: new AbortController(),
		txSequence: 1,
		rxSequence: 0,
		terminal: false,
		cancellationSent: false,
		deadlineTimer: null,
		cancellationTimer: null,
	};
}

function prepareRunAdmission(input: {
	readonly specification: AgentRunSpecification;
	readonly now: () => string;
	readonly random: (size: number) => Uint8Array;
	readonly handshakeTimeoutMs: number;
}): PendingRunAdmission {
	const acceptedAt = input.now();
	const handle = createAgentRunHandle(input.specification, acceptedAt);
	const challenge = createAgentRunnerProcessChallenge({
		binding: input.specification.runnerBundle,
		specification: input.specification,
		channelId: `channel-${hex(input.random(16), 16)}`,
		challengeNonce: hex(input.random(32), 32),
		issuedAt: acceptedAt,
		expiresAt: challengeExpiry(
			acceptedAt,
			input.specification.deadlineAt,
			input.handshakeTimeoutMs,
		),
	});
	return {
		specification: input.specification,
		handle,
		challenge,
		bootstrapKey: exactRandomBytes(input.random(32), 32),
		acceptedEvent: createAgentRunnerAcceptedEvent(challenge, handle),
		launchAbort: new AbortController(),
	};
}

async function launchAuthenticatedRunner(input: {
	readonly pending: PendingRunAdmission;
	readonly launcher: AgentRunnerProcessLauncher;
	readonly now: () => string;
	readonly handshakeTimeoutMs: number;
}): Promise<AgentRunnerProcessConnection> {
	let connection: AgentRunnerProcessConnection | undefined;
	try {
		connection = await launchRunnerConnection(input);
		const response = await withTimeout({
			operation: connection.receive(input.pending.launchAbort.signal),
			timeoutMs: input.handshakeTimeoutMs,
			controller: input.pending.launchAbort,
			message: "Agent Runner handshake timed out.",
		});
		const handshake = admitAgentRunnerHandshakeResponse({
			challenge: input.pending.challenge,
			binding: input.pending.specification.runnerBundle,
			response,
			bootstrapKey: input.pending.bootstrapKey,
			admittedAt: input.now(),
		});
		assertHandshakeMatchesChallenge(handshake, input.pending.challenge);
		await sendAgentRunStart(connection, input.pending);
		return connection;
	} catch (error) {
		input.pending.launchAbort.abort();
		input.pending.bootstrapKey.fill(0);
		if (connection) await ignoreFailure(connection.terminate());
		throw asError(error, "Agent Runner process admission failed.");
	}
}

async function launchRunnerConnection(input: {
	readonly pending: PendingRunAdmission;
	readonly launcher: AgentRunnerProcessLauncher;
	readonly handshakeTimeoutMs: number;
}): Promise<AgentRunnerProcessConnection> {
	const connection = await withTimeout({
		operation: input.launcher.launch({
			challenge: input.pending.challenge,
			bootstrapKey: input.pending.bootstrapKey,
			signal: input.pending.launchAbort.signal,
		}),
		timeoutMs: input.handshakeTimeoutMs,
		controller: input.pending.launchAbort,
		message: "Agent Runner process launch timed out.",
	});
	assertConnection(connection);
	return connection;
}

async function sendAgentRunStart(
	connection: AgentRunnerProcessConnection,
	pending: PendingRunAdmission,
): Promise<void> {
	await connection.send(
		sealAgentRunnerEnvelope({
			challenge: pending.challenge,
			direction: "supervisor-to-runner",
			sequence: 0,
			message: {
				kind: "start",
				specification: pending.specification,
				handle: pending.handle,
				acceptedEvent: pending.acceptedEvent,
			},
			bootstrapKey: pending.bootstrapKey,
		}),
	);
}

function assertConnection(
	value: unknown,
): asserts value is AgentRunnerProcessConnection {
	if (!value || typeof value !== "object") {
		throw new Error("Agent Runner process connection is invalid.");
	}
	const connection = value as Partial<AgentRunnerProcessConnection>;
	if (
		typeof connection.receive !== "function" ||
		typeof connection.send !== "function" ||
		typeof connection.requestClose !== "function" ||
		typeof connection.terminate !== "function" ||
		typeof connection.whenExited !== "function"
	) {
		throw new Error("Agent Runner process connection is invalid.");
	}
}

function assertHandshakeMatchesChallenge(
	handshake: AgentRunnerHandshake,
	challenge: AgentRunnerProcessChallenge,
): void {
	if (
		handshake.runnerBundleDigest !== challenge.runnerBundleDigest ||
		handshake.runnerProtocolVersion !== challenge.runnerProtocolVersion
	) {
		throw new Error("Agent Runner handshake does not match its challenge.");
	}
}

function lastEventSequence(active: ActiveRun): number {
	return active.events.at(-1)?.sequence ?? -1;
}

function keyFor(runId: string, specDigest: string): string {
	return `${runId}\0${specDigest}`;
}

function challengeExpiry(
	issuedAt: string,
	deadlineAt: string,
	timeoutMs: number,
): string {
	const expiry = Math.min(Date.parse(deadlineAt), Date.parse(issuedAt) + timeoutMs);
	if (expiry <= Date.parse(issuedAt)) {
		throw new Error("Agent Run deadline leaves no Runner handshake window.");
	}
	return new Date(expiry).toISOString();
}

function exactRandomBytes(value: Uint8Array, size: number): Uint8Array {
	if (!(value instanceof Uint8Array) || value.byteLength !== size) {
		throw new Error(`Agent Run Supervisor random source must return exactly ${size} bytes.`);
	}
	return new Uint8Array(value);
}

function hex(value: Uint8Array, size: number): string {
	return Buffer.from(exactRandomBytes(value, size)).toString("hex");
}

function boundedDuration(value: number, field: string, maximum: number): number {
	if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
		throw new Error(`${field} is invalid.`);
	}
	return value;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return {promise, resolve, reject};
}

function scheduleAfter(
	delayMs: number,
	action: () => void,
): ReturnType<typeof setTimeout> {
	const timer = setTimeout(action, delayMs);
	timer.unref?.();
	return timer;
}

function clearRunTimers(active: ActiveRun): void {
	if (active.deadlineTimer) clearTimeout(active.deadlineTimer);
	if (active.cancellationTimer) clearTimeout(active.cancellationTimer);
	active.deadlineTimer = null;
	active.cancellationTimer = null;
}

async function withTimeout<T>(input: {
	readonly operation: Promise<T>;
	readonly timeoutMs: number;
	readonly controller?: AbortController;
	readonly message: string;
}): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			input.operation,
			new Promise<T>((_resolve, reject) => {
				timer = setTimeout(() => {
					input.controller?.abort();
					reject(new Error(input.message));
				}, input.timeoutMs);
				timer.unref?.();
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

async function closeAndWait(connection: AgentRunnerProcessConnection): Promise<void> {
	await connection.requestClose();
	await connection.whenExited();
}

async function suppressRejection(operation: Promise<unknown>): Promise<void> {
	await ignoreFailure(operation);
}

async function ignoreFailure(operation: Promise<unknown>): Promise<void> {
	try {
		await operation;
	} catch {
		// Cleanup and already-observed terminal failures are intentionally suppressed.
	}
}

function asError(error: unknown, fallback: string): Error {
	return error instanceof Error ? error : new Error(fallback);
}
