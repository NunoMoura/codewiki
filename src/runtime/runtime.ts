import {randomBytes} from "node:crypto";

import {
	createRunCancellationRequest,
	createRunHandle,
	type RunProcessHandshake,
	type RunCancellationRequest,
	type RunEvent,
	type RunHandle,
	type RunQuiescence,
	type RunRequest,
} from "./contracts.ts";
import {canonicalJson} from "../utils/canonical-json.ts";
import {
	admitRunProcessHandshakeResponse,
	createRunProcessAcceptedEvent,
	createRunProcessChallenge,
	openRunProcessEnvelope,
	sealRunProcessEnvelope,
	type RunProcessAuthenticatedEnvelope,
	type RunProcessChallenge,
} from "./processes/protocol.ts";

export interface RunProcessConnection {
	receive(signal: AbortSignal): Promise<unknown>;
	send(envelope: RunProcessAuthenticatedEnvelope): Promise<void>;
	requestClose(): Promise<void>;
	terminate(): Promise<void>;
	whenExited(): Promise<void>;
}

export interface RunProcessManager {
	launch(input: {
		readonly challenge: RunProcessChallenge;
		/** Inject through a private inherited channel, never argv, environment, or logs. */
		readonly bootstrapKey: Uint8Array;
		readonly signal: AbortSignal;
	}): Promise<RunProcessConnection>;
}

export interface Runtime {
	start(request: RunRequest): Promise<RunHandle>;
	cancel(request: RunCancellationRequest): Promise<void>;
	readEvents(
		handle: RunHandle,
		afterSequence?: number,
	): readonly RunEvent[];
	waitForQuiescence(handle: RunHandle): Promise<RunQuiescence>;
	shutdown(): Promise<void>;
}

export interface RuntimeOptions {
	readonly processManager: RunProcessManager;
	readonly now?: () => string;
	readonly random?: (size: number) => Uint8Array;
	readonly handshakeTimeoutMs?: number;
	readonly cancellationGraceMs?: number;
	readonly processExitTimeoutMs?: number;
}

export function createRuntime(
	options: RuntimeOptions,
): Runtime {
	const state = createRuntimeState(options);
	return Object.freeze({
		start: (request: RunRequest) =>
			startSupervisedRun(state, request),
		cancel: (request: RunCancellationRequest) =>
			cancelSupervisedRun(state, request),
		readEvents: (handle: RunHandle, afterSequence?: number) =>
			readSupervisedEvents(state, handle, afterSequence),
		waitForQuiescence: (handle: RunHandle) =>
			waitForSupervisedQuiescence(state, handle),
		shutdown: () => shutdownRuntime(state),
	});
}

interface ActiveRun {
	readonly request: RunRequest;
	readonly handle: RunHandle;
	readonly challenge: RunProcessChallenge;
	readonly bootstrapKey: Uint8Array;
	readonly connection: RunProcessConnection;
	readonly events: RunEvent[];
	readonly completion: Deferred<RunQuiescence>;
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

interface RuntimeState {
	readonly processManager: RunProcessManager;
	readonly now: () => string;
	readonly random: (size: number) => Uint8Array;
	readonly handshakeTimeoutMs: number;
	readonly cancellationGraceMs: number;
	readonly processExitTimeoutMs: number;
	readonly runs: Map<string, ActiveRun>;
	shuttingDown: boolean;
}

function createRuntimeState(
	options: RuntimeOptions,
): RuntimeState {
	if (!options || typeof options.processManager?.launch !== "function") {
		throw new Error("Runtime requires a Run Process Manager.");
	}
	return {
		processManager: options.processManager,
		now: options.now ?? (() => new Date().toISOString()),
		random: options.random ?? ((size) => randomBytes(size)),
		handshakeTimeoutMs: boundedDuration(
			options.handshakeTimeoutMs ?? 10_000,
			"Runtime handshakeTimeoutMs",
			60_000,
		),
		cancellationGraceMs: boundedDuration(
			options.cancellationGraceMs ?? 5_000,
			"Runtime cancellationGraceMs",
			60_000,
		),
		processExitTimeoutMs: boundedDuration(
			options.processExitTimeoutMs ?? 5_000,
			"Runtime processExitTimeoutMs",
			60_000,
		),
		runs: new Map(),
		shuttingDown: false,
	};
}

async function startSupervisedRun(
	state: RuntimeState,
	request: RunRequest,
): Promise<RunHandle> {
	if (state.shuttingDown) throw new Error("Runtime is shutting down.");
	const runKey = keyFor(request.runId, request.requestDigest);
	if (state.runs.has(runKey)) throw new Error("Run is already supervised.");
	const active = await admitRun({
		request,
		processManager: state.processManager,
		now: state.now,
		random: state.random,
		handshakeTimeoutMs: state.handshakeTimeoutMs,
	});
	state.runs.set(runKey, active);
	active.deadlineTimer = scheduleAfter(
		Math.max(1, Date.parse(request.deadlineAt) - Date.parse(state.now())),
		() => {
			void cancelForDeadline(active, state.now, state.cancellationGraceMs);
		},
	);
	void pumpRun(active, state.processExitTimeoutMs);
	return active.handle;
}

async function cancelSupervisedRun(
	state: RuntimeState,
	request: RunCancellationRequest,
): Promise<void> {
	const active = activeFor(state, request.runId, request.requestDigest);
	await sendCancellation(active, request, state.cancellationGraceMs);
}

function readSupervisedEvents(
	state: RuntimeState,
	handle: RunHandle,
	afterSequence = -1,
): readonly RunEvent[] {
	if (!Number.isSafeInteger(afterSequence) || afterSequence < -1) {
		throw new Error("Run event cursor is invalid.");
	}
	const active = runForHandle(state, handle);
	return Object.freeze(
		active.events.filter((event) => event.sequence > afterSequence),
	);
}

function waitForSupervisedQuiescence(
	state: RuntimeState,
	handle: RunHandle,
): Promise<RunQuiescence> {
	return runForHandle(state, handle).completion.promise;
}

async function shutdownRuntime(state: RuntimeState): Promise<void> {
	state.shuttingDown = true;
	const activeRuns = [...state.runs.values()].filter((run) => !run.terminal);
	await Promise.all(
		activeRuns.map((active) => shutdownRun(active, state)),
	);
}

async function shutdownRun(
	active: ActiveRun,
	state: RuntimeState,
): Promise<void> {
	if (!active.cancellationSent) {
		const request = createRunCancellationRequest(active.handle, {
			expectedEventSequence: lastEventSequence(active),
			reason: "runtime-shutdown",
			requestedAt: state.now(),
		});
		try {
			await sendCancellation(active, request, state.cancellationGraceMs);
		} catch (error) {
			await stopRun(
				active,
				asError(error, "Run Process shutdown cancellation failed."),
			);
		}
	}
	await ignoreFailure(active.completion.promise);
}

function activeFor(
	state: RuntimeState,
	runId: string,
	requestDigest: string,
): ActiveRun {
	const active = state.runs.get(keyFor(runId, requestDigest));
	if (!active) throw new Error("Run is not supervised.");
	return active;
}

function runForHandle(
	state: RuntimeState,
	handle: RunHandle,
): ActiveRun {
	const active = activeFor(state, handle.runId, handle.requestDigest);
	if (canonicalJson(active.handle) !== canonicalJson(handle)) {
		throw new Error("Run handle does not match the supervised run.");
	}
	return active;
}

async function pumpRun(
	active: ActiveRun,
	processExitTimeoutMs: number,
): Promise<void> {
	try {
		while (!active.terminal) {
			const value = await active.connection.receive(active.receiveAbort.signal);
			const envelope = openRunProcessEnvelope({
				challenge: active.challenge,
				expectedDirection: "run-process-to-runtime",
				expectedSequence: active.rxSequence,
				value,
				handle: active.handle,
				bootstrapKey: active.bootstrapKey,
			});
			active.rxSequence += 1;
			if (envelope.message.kind === "event") {
				appendRunEvent(active, envelope.message.event);
				continue;
			}
			if (envelope.message.kind !== "quiescence") {
				throw new Error("Run Process emitted an unsupported message.");
			}
			if (
				envelope.message.quiescence.finalEventSequence !==
				lastEventSequence(active)
			) {
				throw new Error("Run Process quiescence does not cover the final event.");
			}
			await withTimeout({
				operation: closeAndWait(active.connection),
				timeoutMs: processExitTimeoutMs,
				message: "Run Process did not exit after quiescence.",
			});
			completeRun(active, envelope.message.quiescence);
		}
	} catch (error) {
		if (!active.terminal) {
			await stopRun(
				active,
				asError(error, "Run Process stopped."),
			);
		}
	}
}

function appendRunEvent(active: ActiveRun, event: RunEvent): void {
	if (event.sequence !== active.events.length) {
		throw new Error("Run Process event sequence is stale or out of order.");
	}
	active.events.push(event);
}

async function sendCancellation(
	active: ActiveRun,
	request: RunCancellationRequest,
	cancellationGraceMs: number,
): Promise<void> {
	if (active.terminal) throw new Error("Run is already terminal.");
	if (active.cancellationSent) {
		throw new Error("Run cancellation was already requested.");
	}
	if (request.expectedEventSequence !== lastEventSequence(active)) {
		throw new Error("Run cancellation event sequence conflict.");
	}
	const envelope = sealRunProcessEnvelope({
		challenge: active.challenge,
		direction: "runtime-to-run-process",
		sequence: active.txSequence,
		message: {kind: "cancel", request},
		handle: active.handle,
		bootstrapKey: active.bootstrapKey,
	});
	await active.connection.send(envelope);
	active.txSequence += 1;
	active.cancellationSent = true;
	active.cancellationTimer = scheduleAfter(cancellationGraceMs, () => {
		void stopRun(
			active,
			new Error("Run Process did not quiesce after cancellation."),
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
		const request = createRunCancellationRequest(active.handle, {
			expectedEventSequence: lastEventSequence(active),
			reason: "deadline",
			requestedAt: now(),
		});
		await sendCancellation(active, request, cancellationGraceMs);
	} catch (error) {
		await stopRun(
			active,
			asError(error, "Run deadline cancellation failed."),
		);
	}
}

function completeRun(
	active: ActiveRun,
	quiescence: RunQuiescence,
): void {
	if (active.terminal) return;
	active.terminal = true;
	clearRunTimers(active);
	active.receiveAbort.abort();
	active.bootstrapKey.fill(0);
	active.completion.resolve(quiescence);
}

async function stopRun(active: ActiveRun, error: Error): Promise<void> {
	if (active.terminal) return;
	active.terminal = true;
	clearRunTimers(active);
	active.receiveAbort.abort();
	await ignoreFailure(active.connection.terminate());
	active.bootstrapKey.fill(0);
	active.completion.reject(error);
}

interface PendingRunAdmission {
	readonly request: RunRequest;
	readonly handle: RunHandle;
	readonly challenge: RunProcessChallenge;
	readonly bootstrapKey: Uint8Array;
	readonly acceptedEvent: RunEvent;
	readonly launchAbort: AbortController;
}

async function admitRun(input: {
	readonly request: RunRequest;
	readonly processManager: RunProcessManager;
	readonly now: () => string;
	readonly random: (size: number) => Uint8Array;
	readonly handshakeTimeoutMs: number;
}): Promise<ActiveRun> {
	const pending = prepareRunAdmission(input);
	const connection = await openAuthenticatedRunProcess({
		pending,
		processManager: input.processManager,
		now: input.now,
		handshakeTimeoutMs: input.handshakeTimeoutMs,
	});
	const completion = deferred<RunQuiescence>();
	void suppressRejection(completion.promise);
	return {
		request: pending.request,
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
	readonly request: RunRequest;
	readonly now: () => string;
	readonly random: (size: number) => Uint8Array;
	readonly handshakeTimeoutMs: number;
}): PendingRunAdmission {
	const acceptedAt = input.now();
	const handle = createRunHandle(input.request, acceptedAt);
	const challenge = createRunProcessChallenge({
		binding: input.request.runtimeBuild,
		request: input.request,
		channelId: `channel-${hex(input.random(16), 16)}`,
		challengeNonce: hex(input.random(32), 32),
		issuedAt: acceptedAt,
		expiresAt: challengeExpiry(
			acceptedAt,
			input.request.deadlineAt,
			input.handshakeTimeoutMs,
		),
	});
	return {
		request: input.request,
		handle,
		challenge,
		bootstrapKey: exactRandomBytes(input.random(32), 32),
		acceptedEvent: createRunProcessAcceptedEvent(challenge, handle),
		launchAbort: new AbortController(),
	};
}

async function openAuthenticatedRunProcess(input: {
	readonly pending: PendingRunAdmission;
	readonly processManager: RunProcessManager;
	readonly now: () => string;
	readonly handshakeTimeoutMs: number;
}): Promise<RunProcessConnection> {
	let connection: RunProcessConnection | undefined;
	try {
		connection = await openRunProcessConnection(input);
		const response = await withTimeout({
			operation: connection.receive(input.pending.launchAbort.signal),
			timeoutMs: input.handshakeTimeoutMs,
			controller: input.pending.launchAbort,
			message: "Run Process handshake timed out.",
		});
		const handshake = admitRunProcessHandshakeResponse({
			challenge: input.pending.challenge,
			binding: input.pending.request.runtimeBuild,
			response,
			bootstrapKey: input.pending.bootstrapKey,
			admittedAt: input.now(),
		});
		assertHandshakeMatchesChallenge(handshake, input.pending.challenge);
		await sendRunStart(connection, input.pending);
		return connection;
	} catch (error) {
		input.pending.launchAbort.abort();
		input.pending.bootstrapKey.fill(0);
		if (connection) await ignoreFailure(connection.terminate());
		throw asError(error, "Run Process admission failed.");
	}
}

async function openRunProcessConnection(input: {
	readonly pending: PendingRunAdmission;
	readonly processManager: RunProcessManager;
	readonly handshakeTimeoutMs: number;
}): Promise<RunProcessConnection> {
	const connection = await withTimeout({
		operation: input.processManager.launch({
			challenge: input.pending.challenge,
			bootstrapKey: input.pending.bootstrapKey,
			signal: input.pending.launchAbort.signal,
		}),
		timeoutMs: input.handshakeTimeoutMs,
		controller: input.pending.launchAbort,
		message: "Run Process launch timed out.",
	});
	assertConnection(connection);
	return connection;
}

async function sendRunStart(
	connection: RunProcessConnection,
	pending: PendingRunAdmission,
): Promise<void> {
	await connection.send(
		sealRunProcessEnvelope({
			challenge: pending.challenge,
			direction: "runtime-to-run-process",
			sequence: 0,
			message: {
				kind: "start",
				request: pending.request,
				handle: pending.handle,
				acceptedEvent: pending.acceptedEvent,
			},
			bootstrapKey: pending.bootstrapKey,
		}),
	);
}

function assertConnection(
	value: unknown,
): asserts value is RunProcessConnection {
	if (!value || typeof value !== "object") {
		throw new Error("Run Process connection is invalid.");
	}
	const connection = value as Partial<RunProcessConnection>;
	if (
		typeof connection.receive !== "function" ||
		typeof connection.send !== "function" ||
		typeof connection.requestClose !== "function" ||
		typeof connection.terminate !== "function" ||
		typeof connection.whenExited !== "function"
	) {
		throw new Error("Run Process connection is invalid.");
	}
}

function assertHandshakeMatchesChallenge(
	handshake: RunProcessHandshake,
	challenge: RunProcessChallenge,
): void {
	if (
		handshake.runtimeBuildDigest !== challenge.runtimeBuildDigest ||
		handshake.runProtocolVersion !== challenge.runProtocolVersion
	) {
		throw new Error("Run Process handshake does not match its challenge.");
	}
}

function lastEventSequence(active: ActiveRun): number {
	return active.events.at(-1)?.sequence ?? -1;
}

function keyFor(runId: string, requestDigest: string): string {
	return `${runId}\0${requestDigest}`;
}

function challengeExpiry(
	issuedAt: string,
	deadlineAt: string,
	timeoutMs: number,
): string {
	const expiry = Math.min(Date.parse(deadlineAt), Date.parse(issuedAt) + timeoutMs);
	if (expiry <= Date.parse(issuedAt)) {
		throw new Error("Run deadline leaves no Run Process handshake window.");
	}
	return new Date(expiry).toISOString();
}

function exactRandomBytes(value: Uint8Array, size: number): Uint8Array {
	if (!(value instanceof Uint8Array) || value.byteLength !== size) {
		throw new Error(`Runtime random source must return exactly ${size} bytes.`);
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

async function closeAndWait(connection: RunProcessConnection): Promise<void> {
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
