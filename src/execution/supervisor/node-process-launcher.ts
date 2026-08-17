import {spawn, type ChildProcess} from "node:child_process";
import {TextDecoder} from "node:util";
import {isAbsolute} from "node:path";
import type {Readable, Writable} from "node:stream";

import {canonicalJson, type Sha256Digest} from "../../utils/canonical-json.ts";
import type {
	AgentRunnerProcessConnection,
	AgentRunnerProcessLauncher,
} from "./agent-run-supervisor.ts";
import type {
	AgentRunnerAuthenticatedEnvelope,
	AgentRunnerProcessChallenge,
} from "./process-protocol.ts";

export interface NodeAgentRunnerProcessArtifact {
	readonly runnerBundleDigest: Sha256Digest;
	readonly runnerProtocolVersion: string;
	readonly executable: string;
	readonly args: readonly string[];
	readonly cwd: string;
}

export type NodeAgentRunnerArtifactResolver = (
	challenge: AgentRunnerProcessChallenge,
) => Promise<NodeAgentRunnerProcessArtifact>;

export interface NodeAgentRunnerProcessLauncherOptions {
	readonly resolveArtifact: NodeAgentRunnerArtifactResolver;
	readonly maxFrameBytes?: number;
	readonly terminationGraceMs?: number;
}

type AgentRunnerLaunchInput = Parameters<AgentRunnerProcessLauncher["launch"]>[0];

export function createNodeAgentRunnerProcessLauncher(
	options: NodeAgentRunnerProcessLauncherOptions,
): AgentRunnerProcessLauncher {
	if (!options || typeof options.resolveArtifact !== "function") {
		throw new Error("Node Agent Runner launcher requires an artifact resolver.");
	}
	const maxFrameBytes = boundedInteger(
		options.maxFrameBytes ?? 4 * 1024 * 1024,
		"Node Agent Runner maxFrameBytes",
		1024,
		16 * 1024 * 1024,
	);
	const terminationGraceMs = boundedInteger(
		options.terminationGraceMs ?? 5_000,
		"Node Agent Runner terminationGraceMs",
		1,
		60_000,
	);
	return Object.freeze({
		launch: async (input: AgentRunnerLaunchInput) => {
			if (input.signal.aborted) throw new Error("Agent Runner launch was aborted.");
			assertBootstrapKey(input.bootstrapKey);
			const artifact = normalizeArtifact(
				await options.resolveArtifact(input.challenge),
				input.challenge,
			);
			return launchNodeAgentRunner({
				artifact,
				challenge: input.challenge,
				bootstrapKey: input.bootstrapKey,
				signal: input.signal,
				maxFrameBytes,
				terminationGraceMs,
			});
		},
	});
}

async function launchNodeAgentRunner(input: {
	readonly artifact: NodeAgentRunnerProcessArtifact;
	readonly challenge: AgentRunnerProcessChallenge;
	readonly bootstrapKey: Uint8Array;
	readonly signal: AbortSignal;
	readonly maxFrameBytes: number;
	readonly terminationGraceMs: number;
}): Promise<AgentRunnerProcessConnection> {
	const child = spawn(input.artifact.executable, [...input.artifact.args], {
		cwd: input.artifact.cwd,
		env: {},
		shell: false,
		detached: false,
		windowsHide: true,
		stdio: ["ignore", "ignore", "ignore", "pipe", "pipe", "pipe"],
	});
	const privatePipes = child.stdio as unknown as readonly (
		| Readable
		| Writable
		| null
		| undefined
	)[];
	const keyWriter = privatePipes[3] as Writable | null | undefined;
	const commandWriter = privatePipes[4] as Writable | null | undefined;
	const eventReader = privatePipes[5] as Readable | null | undefined;
	if (!keyWriter || !commandWriter || !eventReader) {
		child.kill("SIGKILL");
		throw new Error("Agent Runner private process pipes are unavailable.");
	}
	const connection = createNodeAgentRunnerProcessConnection({
		child,
		commandWriter,
		eventReader,
		maxFrameBytes: input.maxFrameBytes,
		terminationGraceMs: input.terminationGraceMs,
	});
	const onAbort = () => {
		void connection.terminate();
	};
	input.signal.addEventListener("abort", onAbort, {once: true});
	try {
		const keyBytes = Buffer.from(input.bootstrapKey);
		try {
			await writeAndEnd(keyWriter, keyBytes);
		} finally {
			keyBytes.fill(0);
		}
		await writeFrame(commandWriter, input.challenge, input.maxFrameBytes);
		return connection;
	} catch (error) {
		input.signal.removeEventListener("abort", onAbort);
		await connection.terminate();
		throw asError(error, "Agent Runner private process bootstrap failed.");
	}
}

interface JsonLineFrameQueue {
	readonly receive: (signal: AbortSignal) => Promise<unknown>;
	readonly stop: (error: Error) => void;
}

interface FrameWaiter {
	readonly resolve: (value: unknown) => void;
	readonly reject: (error: Error) => void;
	readonly signal: AbortSignal;
	readonly onAbort: () => void;
}

function createNodeAgentRunnerProcessConnection(input: {
	readonly child: ChildProcess;
	readonly commandWriter: Writable;
	readonly eventReader: Readable;
	readonly maxFrameBytes: number;
	readonly terminationGraceMs: number;
}): AgentRunnerProcessConnection {
	const frames = createJsonLineFrameQueue(input.eventReader, input.maxFrameBytes);
	const exit = processExit(input.child);
	void ignoreFailure(exit);
	let closeRequested = false;

	async function send(envelope: AgentRunnerAuthenticatedEnvelope): Promise<void> {
		if (closeRequested) throw new Error("Agent Runner command pipe is closed.");
		await writeFrame(input.commandWriter, envelope, input.maxFrameBytes);
	}

	async function requestClose(): Promise<void> {
		if (closeRequested) return;
		closeRequested = true;
		await endWriter(input.commandWriter);
	}

	async function terminate(): Promise<void> {
		frames.stop(new Error("Agent Runner process was terminated."));
		if (input.child.exitCode !== null || input.child.signalCode !== null) return;
		input.child.kill("SIGTERM");
		const exited = await settlesWithin(exit, input.terminationGraceMs);
		if (!exited && input.child.exitCode === null && input.child.signalCode === null) {
			input.child.kill("SIGKILL");
			await ignoreFailure(exit);
		}
	}

	async function whenExited(): Promise<void> {
		const result = await exit;
		if (result.code !== 0 || result.signal !== null) {
			throw new Error(
				`Agent Runner process exited abnormally (code=${String(result.code)}, signal=${String(result.signal)}).`,
			);
		}
	}

	return Object.freeze({
		receive: frames.receive,
		send,
		requestClose,
		terminate,
		whenExited,
	});
}

interface FrameQueueState {
	readonly decoder: TextDecoder;
	readonly maxFrameBytes: number;
	readonly queue: unknown[];
	buffer: Buffer;
	waiter: FrameWaiter | undefined;
	failure: Error | undefined;
	ended: boolean;
}

function createJsonLineFrameQueue(
	reader: Readable,
	maxFrameBytes: number,
): JsonLineFrameQueue {
	const state: FrameQueueState = {
		decoder: new TextDecoder("utf-8", {fatal: true}),
		maxFrameBytes,
		queue: [],
		buffer: Buffer.alloc(0),
		waiter: undefined,
		failure: undefined,
		ended: false,
	};
	reader.on("data", (chunk: Buffer | string) => {
		acceptFrameChunk(state, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	});
	reader.once("error", (error) => {
		stopFrameQueue(state, asError(error, "Agent Runner event pipe failed."));
	});
	reader.once("end", () => endFrameQueue(state));
	return Object.freeze({
		receive: (signal: AbortSignal) => receiveFrame(state, signal),
		stop: (error: Error) => stopFrameQueue(state, error),
	});
}

function receiveFrame(
	state: FrameQueueState,
	signal: AbortSignal,
): Promise<unknown> {
	if (signal.aborted) return Promise.reject(new Error("Agent Runner receive aborted."));
	if (state.queue.length > 0) return Promise.resolve(state.queue.shift());
	if (state.failure) return Promise.reject(state.failure);
	if (state.ended) return Promise.reject(new Error("Agent Runner event pipe ended."));
	if (state.waiter) {
		return Promise.reject(new Error("Concurrent Agent Runner receives are forbidden."));
	}
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			state.waiter = undefined;
			reject(new Error("Agent Runner receive aborted."));
		};
		signal.addEventListener("abort", onAbort, {once: true});
		state.waiter = {resolve, reject, signal, onAbort};
	});
}

function acceptFrameChunk(state: FrameQueueState, chunk: Buffer): void {
	if (state.failure) return;
	state.buffer = Buffer.concat([state.buffer, chunk]);
	while (true) {
		const newline = state.buffer.indexOf(0x0a);
		if (newline < 0) break;
		if (newline < 1 || newline > state.maxFrameBytes) {
			stopFrameQueue(state, new Error("Agent Runner event frame size is invalid."));
			return;
		}
		const bytes = state.buffer.subarray(0, newline);
		state.buffer = state.buffer.subarray(newline + 1);
		try {
			deliverFrame(state, JSON.parse(state.decoder.decode(bytes)));
		} catch {
			stopFrameQueue(
				state,
				new Error("Agent Runner event frame is not valid UTF-8 JSON."),
			);
			return;
		}
	}
	if (state.buffer.byteLength > state.maxFrameBytes) {
		stopFrameQueue(
			state,
			new Error("Agent Runner event frame exceeds its byte limit."),
		);
	}
}

function deliverFrame(state: FrameQueueState, value: unknown): void {
	if (!state.waiter) {
		if (state.queue.length >= 1024) {
			stopFrameQueue(state, new Error("Agent Runner event queue limit exceeded."));
			return;
		}
		state.queue.push(value);
		return;
	}
	const delivered = state.waiter;
	state.waiter = undefined;
	delivered.signal.removeEventListener("abort", delivered.onAbort);
	delivered.resolve(value);
}

function stopFrameQueue(state: FrameQueueState, error: Error): void {
	if (state.failure) return;
	state.failure = error;
	rejectFrameWaiter(state, error);
}

function endFrameQueue(state: FrameQueueState): void {
	state.ended = true;
	if (state.buffer.byteLength > 0) {
		stopFrameQueue(
			state,
			new Error("Agent Runner event pipe ended with a truncated frame."),
		);
	} else {
		rejectFrameWaiter(state, new Error("Agent Runner event pipe ended."));
	}
}

function rejectFrameWaiter(state: FrameQueueState, error: Error): void {
	if (!state.waiter) return;
	const rejected = state.waiter;
	state.waiter = undefined;
	rejected.signal.removeEventListener("abort", rejected.onAbort);
	rejected.reject(error);
}

function normalizeArtifact(
	value: NodeAgentRunnerProcessArtifact,
	challenge: AgentRunnerProcessChallenge,
): NodeAgentRunnerProcessArtifact {
	if (
		!value ||
		typeof value !== "object" ||
		!hasExactKeys(value, [
			"runnerBundleDigest",
			"runnerProtocolVersion",
			"executable",
			"args",
			"cwd",
		])
	) {
		throw new Error("Node Agent Runner artifact is invalid.");
	}
	if (
		value.runnerBundleDigest !== challenge.runnerBundleDigest ||
		value.runnerProtocolVersion !== challenge.runnerProtocolVersion
	) {
		throw new Error("Node Agent Runner artifact does not match the challenged bundle.");
	}
	if (!isAbsolute(value.executable) || !isAbsolute(value.cwd)) {
		throw new Error("Node Agent Runner executable and cwd must be absolute paths.");
	}
	assertProcessText(value.executable, "Node Agent Runner executable", 4096);
	assertProcessText(value.cwd, "Node Agent Runner cwd", 4096);
	if (!Array.isArray(value.args) || value.args.length > 64) {
		throw new Error("Node Agent Runner arguments are invalid.");
	}
	const args = value.args.map((argument) => {
		assertProcessText(argument, "Node Agent Runner argument", 4096);
		return argument;
	});
	return Object.freeze({
		runnerBundleDigest: value.runnerBundleDigest,
		runnerProtocolVersion: value.runnerProtocolVersion,
		executable: value.executable,
		args: Object.freeze(args),
		cwd: value.cwd,
	});
}

function writeFrame(
	writer: Writable,
	value: unknown,
	maxFrameBytes: number,
): Promise<void> {
	const frame = Buffer.from(`${canonicalJson(value)}\n`, "utf8");
	if (frame.byteLength < 2 || frame.byteLength - 1 > maxFrameBytes) {
		return Promise.reject(new Error("Agent Runner command frame size is invalid."));
	}
	return writeBytes(writer, frame);
}

function writeAndEnd(writer: Writable, bytes: Buffer): Promise<void> {
	return new Promise((resolve, reject) => {
		writer.end(bytes, (error?: Error | null) => {
			if (error) reject(error);
			else resolve();
		});
	});
}

function writeBytes(writer: Writable, bytes: Buffer): Promise<void> {
	return new Promise((resolve, reject) => {
		writer.write(bytes, (error?: Error | null) => {
			if (error) reject(error);
			else resolve();
		});
	});
}

function endWriter(writer: Writable): Promise<void> {
	return new Promise((resolve, reject) => {
		writer.end((error?: Error | null) => {
			if (error) reject(error);
			else resolve();
		});
	});
}

function processExit(
	child: ChildProcess,
): Promise<{readonly code: number | null; readonly signal: string | null}> {
	return new Promise((resolve, reject) => {
		child.once("error", (error) => reject(error));
		child.once("exit", (code, signal) => resolve({code, signal}));
	});
}

async function settlesWithin(
	operation: Promise<unknown>,
	timeoutMs: number,
): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			settled(operation),
			new Promise<boolean>((resolve) => {
				timer = setTimeout(() => resolve(false), timeoutMs);
				timer.unref?.();
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

async function settled(operation: Promise<unknown>): Promise<true> {
	await ignoreFailure(operation);
	return true;
}

async function ignoreFailure(operation: Promise<unknown>): Promise<void> {
	try {
		await operation;
	} catch {
		// Forced termination only needs convergence, not a second failure.
	}
}

function assertBootstrapKey(value: Uint8Array): void {
	if (!(value instanceof Uint8Array) || value.byteLength !== 32) {
		throw new Error("Node Agent Runner bootstrap key must contain exactly 32 bytes.");
	}
}

function assertProcessText(value: unknown, field: string, maximum: number): void {
	if (
		typeof value !== "string" ||
		value.length < 1 ||
		value.length > maximum ||
		/[\u0000-\u001f\u007f]/.test(value)
	) {
		throw new Error(`${field} is invalid.`);
	}
}

function boundedInteger(
	value: number,
	field: string,
	minimum: number,
	maximum: number,
): number {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new Error(`${field} is invalid.`);
	}
	return value;
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
	const keys = Object.keys(value).sort(compareText);
	const expectedKeys = [...expected].sort(compareText);
	return (
		keys.length === expectedKeys.length &&
		keys.every((key, index) => key === expectedKeys[index])
	);
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function asError(error: unknown, fallback: string): Error {
	return error instanceof Error ? error : new Error(fallback);
}
