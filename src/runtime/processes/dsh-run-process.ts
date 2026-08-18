import {createReadStream, createWriteStream, lstatSync, readFileSync} from "node:fs";
import {once} from "node:events";
import {isAbsolute, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import type {Readable, Writable} from "node:stream";

import {
	createRunEvent,
	createRunProcessResult,
	createRunQuiescence,
	type RunCancellationRequest,
	type RunEventKind,
	type RunHandle,
	type RunRequest,
} from "../contracts.ts";
import {
	assertStageContextBundle,
	type StageContextBundle,
} from "../context/bundle.ts";
import {runDshAgent} from "../dsh/adapter.ts";
import {createDshReplayModelInstaller} from "../dsh/replay.ts";
import {
	createRunProcessHandshakeResponse,
	openRunProcessEnvelope,
	sealRunProcessEnvelope,
	type RunProcessChallenge,
} from "./protocol.ts";
import {
	assertSha256Digest,
	canonicalJson,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

const INPUT_MANIFEST_VERSION = "1.0.0" as const;
const MAX_FRAME_BYTES = 1_048_576;
const MAX_INPUT_MANIFEST_BYTES = 12 * 1_024 * 1_024;

interface DshRunProcessInputManifest {
	readonly schemaVersion: typeof INPUT_MANIFEST_VERSION;
	readonly runtimeBuildDigest: Sha256Digest;
	readonly runProtocolVersion: string;
	readonly systemPrompt: string;
	readonly prompt: string;
	readonly workspacePath: string;
	readonly sessionRoot: string;
	readonly stageContextBundle: StageContextBundle | null;
	readonly replayFixturePath: string;
	readonly replayFixtureDigest: Sha256Digest;
}

function createDshRunProcessInputManifest(
	value: unknown,
): Readonly<DshRunProcessInputManifest> {
	if (
		value === null ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		!hasExactKeys(value, [
		"schemaVersion",
		"runtimeBuildDigest",
		"runProtocolVersion",
		"systemPrompt",
		"prompt",
		"workspacePath",
		"sessionRoot",
			"stageContextBundle",
			"replayFixturePath",
			"replayFixtureDigest",
		])
	) {
		throw new Error("DSH Run Process input manifest shape is invalid.");
	}
	const input = value as unknown as DshRunProcessInputManifest;
	if (input.schemaVersion !== INPUT_MANIFEST_VERSION) {
		throw new Error("DSH Run Process input manifest version is invalid.");
	}
	const runtimeBuildDigest = assertSha256Digest(
		input.runtimeBuildDigest,
		"DSH Run Process Runtime Build digest",
	);
	const replayFixtureDigest = assertSha256Digest(
		input.replayFixtureDigest,
		"DSH replay fixture digest",
	);
	assertText(input.runProtocolVersion, "DSH Run protocol version", 64);
	assertText(input.systemPrompt, "DSH system prompt", 65_536);
	assertText(input.prompt, "DSH prompt", 1_048_576);
	assertAbsolute(input.workspacePath, "DSH workspace path");
	assertAbsolute(input.sessionRoot, "DSH session root");
	const stageContextBundle = input.stageContextBundle === null
		? null
		: assertStageContextBundle(input.stageContextBundle);
	assertAbsolute(input.replayFixturePath, "DSH replay fixture path");
	return Object.freeze({
		...input,
		runtimeBuildDigest,
		replayFixtureDigest,
		stageContextBundle,
	});
}

async function runDshRunProcess(
	manifestPath: string,
): Promise<void> {
	const manifest = readDshInputManifest(manifestPath);
	const bootstrapKey = await readBootstrapKey(
		createReadStream("", {fd: 3, autoClose: true}),
	);
	const commandReader = createReadStream("", {fd: 4, autoClose: true});
	const eventWriter = createWriteStream("", {fd: 5, autoClose: true});
	const commands = jsonLines(commandReader);
	try {
		const admission = await admitDshRunProcess({
			manifest,
			commands,
			eventWriter,
			bootstrapKey,
		});
		await executeDshProcessRun({
			manifest,
			commands,
			eventWriter,
			bootstrapKey,
			...admission,
		});
	} finally {
		bootstrapKey.fill(0);
		commandReader.destroy();
		if (!eventWriter.closed) eventWriter.destroy();
	}
}

interface DshProcessAdmission {
	readonly challenge: RunProcessChallenge;
	readonly handle: RunHandle;
	readonly request: RunRequest;
	readonly acceptedEventSequence: number;
}

function readDshInputManifest(
	manifestPath: string,
): Readonly<DshRunProcessInputManifest> {
	assertAbsolute(manifestPath, "DSH Run Process input manifest path");
	const metadata = lstatSync(manifestPath);
	if (!metadata.isFile()) {
		throw new Error("DSH Run Process input manifest must be a regular file.");
	}
	if (metadata.size > MAX_INPUT_MANIFEST_BYTES) {
		throw new Error("DSH Run Process input manifest exceeds its byte limit.");
	}
	return createDshRunProcessInputManifest(
		parseJson(readFileSync(manifestPath, "utf8"), "DSH input manifest"),
	);
}

async function admitDshRunProcess(input: {
	readonly manifest: DshRunProcessInputManifest;
	readonly commands: AsyncGenerator<unknown>;
	readonly eventWriter: Writable;
	readonly bootstrapKey: Uint8Array;
}): Promise<DshProcessAdmission> {
	const challenge = await nextFrame(
		input.commands,
		"Run Process challenge",
	) as RunProcessChallenge;
	assertManifestChallenge(input.manifest, challenge);
	await writeFrame(input.eventWriter, createRunProcessHandshakeResponse({
		challenge,
		handshake: {
			runProtocolId: "codewiki.run-process",
			runProtocolVersion: input.manifest.runProtocolVersion,
			runtimeBuildDigest: input.manifest.runtimeBuildDigest,
		},
		bootstrapKey: input.bootstrapKey,
	}));
	const startEnvelope = openRunProcessEnvelope({
		challenge,
		expectedDirection: "runtime-to-run-process",
		expectedSequence: 0,
		value: await nextFrame(input.commands, "Run Process start"),
		bootstrapKey: input.bootstrapKey,
	});
	if (startEnvelope.message.kind !== "start") {
		throw new Error("Run Process expected one start message.");
	}
	assertManifestRequest(input.manifest, startEnvelope.message.request);
	return {
		challenge,
		handle: startEnvelope.message.handle,
		request: startEnvelope.message.request,
		acceptedEventSequence: startEnvelope.message.acceptedEvent.sequence,
	};
}

interface DshProcessSender {
	readonly eventSequence: number;
	send(message: Parameters<typeof sealRunProcessEnvelope>[0]["message"]): Promise<void>;
	sendEvent(kind: RunEventKind, payloadDigest: Sha256Digest): Promise<void>;
}

function createDshProcessSender(input: {
	readonly challenge: RunProcessChallenge;
	readonly handle: RunHandle;
	readonly bootstrapKey: Uint8Array;
	readonly eventWriter: Writable;
	readonly acceptedEventSequence: number;
}): DshProcessSender {
	let transmitSequence = 0;
	let eventSequence = input.acceptedEventSequence;
	const send = async (
		message: Parameters<typeof sealRunProcessEnvelope>[0]["message"],
	): Promise<void> => {
		await writeFrame(input.eventWriter, sealRunProcessEnvelope({
			challenge: input.challenge,
			direction: "run-process-to-runtime",
			sequence: transmitSequence,
			message,
			handle: input.handle,
			bootstrapKey: input.bootstrapKey,
		}));
		transmitSequence += 1;
	};
	return {
		get eventSequence() {
			return eventSequence;
		},
		send,
		async sendEvent(kind, payloadDigest) {
			eventSequence += 1;
			await send({
				kind: "event",
				event: createRunEvent(input.handle, {
					sequence: eventSequence,
					kind,
					occurredAt: new Date().toISOString(),
					payloadDigest,
				}),
			});
		},
	};
}

async function executeDshProcessRun(input: {
	readonly manifest: DshRunProcessInputManifest;
	readonly commands: AsyncGenerator<unknown>;
	readonly eventWriter: Writable;
	readonly bootstrapKey: Uint8Array;
	readonly challenge: RunProcessChallenge;
	readonly handle: RunHandle;
	readonly request: RunRequest;
	readonly acceptedEventSequence: number;
}): Promise<void> {
	const cancellation = {request: null as RunCancellationRequest | null};
	const cancellationController = new AbortController();
	const cancellationPump = pumpCancellation({
		commands: input.commands,
		challenge: input.challenge,
		handle: input.handle,
		bootstrapKey: input.bootstrapKey,
		cancellation,
		controller: cancellationController,
	});
	const sender = createDshProcessSender(input);
	await sender.sendEvent("process-started", canonicalJsonDigest({
		runtimeBuildDigest: input.manifest.runtimeBuildDigest,
		sessionId: input.request.session.sessionId,
	}));
	const result = await runDshAgent({
		request: input.request,
		artifacts: {
			systemPrompt: input.manifest.systemPrompt,
			prompt: input.manifest.prompt,
			workspacePath: input.manifest.workspacePath,
			sessionRoot: input.manifest.sessionRoot,
		},
		stageContextBundle: input.manifest.stageContextBundle,
		installModelAdapter: createDshReplayModelInstaller({
			fixturePath: input.manifest.replayFixturePath,
			fixtureDigest: input.manifest.replayFixtureDigest,
		}),
		signal: cancellationController.signal,
	});
	for (const event of result.sessionEvents) {
		await sender.sendEvent("session-event", event.digest);
	}
	const processResult = createRunProcessResult(input.handle, {
		runId: input.handle.runId,
		requestDigest: input.handle.requestDigest,
		outcome: result.outcome === "stopped" ? "failed" : result.outcome,
		startedAt: result.startedAt,
		finishedAt: result.finishedAt,
		executionLedgerDigest: result.executionLedgerDigest,
		outputDigest: result.outputDigest,
		usageDigest: result.usageDigest,
		cancellationDigest: cancellation.request
			? canonicalJsonDigest(cancellation.request)
			: null,
		custodyGaps: [],
	});
	const proofDigest = canonicalJsonDigest({
		resultDigest: processResult.resultDigest,
		rawLogDigest: result.rawLog.digest,
		finalSessionEventSequence: sender.eventSequence + 1,
	});
	await sender.sendEvent("quiescent", proofDigest);
	await sender.send({kind: "result", result: processResult});
	await sender.send({
		kind: "quiescence",
		quiescence: createRunQuiescence(input.handle, {
			finalEventSequence: sender.eventSequence,
			quiescedAt: new Date().toISOString(),
			proofDigest,
			rawLog: result.rawLog,
		}),
	});
	await endWriter(input.eventWriter);
	await cancellationPump;
}

async function pumpCancellation(input: {
	readonly commands: AsyncGenerator<unknown>;
	readonly challenge: RunProcessChallenge;
	readonly handle: RunHandle;
	readonly bootstrapKey: Uint8Array;
	readonly cancellation: {request: RunCancellationRequest | null};
	readonly controller: AbortController;
}): Promise<void> {
	let expectedSequence = 1;
	for await (const value of input.commands) {
		const envelope = openRunProcessEnvelope({
			challenge: input.challenge,
			expectedDirection: "runtime-to-run-process",
			expectedSequence,
			value,
			handle: input.handle,
			bootstrapKey: input.bootstrapKey,
		});
		expectedSequence += 1;
		if (envelope.message.kind !== "cancel" || input.cancellation.request) {
			throw new Error("Run Process received an unsupported command.");
		}
		input.cancellation.request = envelope.message.request;
		input.controller.abort();
	}
}

function assertManifestChallenge(
	manifest: DshRunProcessInputManifest,
	challenge: RunProcessChallenge,
): void {
	if (
		challenge.runtimeBuildDigest !== manifest.runtimeBuildDigest ||
		challenge.runProtocolVersion !== manifest.runProtocolVersion
	) {
		throw new Error("DSH input manifest does not match the Runtime challenge.");
	}
}

function assertManifestRequest(
	manifest: DshRunProcessInputManifest,
	request: RunRequest,
): void {
	if (canonicalJsonDigest(manifest) !== request.inputs.staticInputManifestDigest) {
		throw new Error("DSH input manifest does not match the Run Request digest.");
	}
}

async function readBootstrapKey(reader: Readable): Promise<Uint8Array> {
	const chunks: Buffer[] = [];
	let length = 0;
	for await (const chunk of reader) {
		const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		length += bytes.length;
		if (length > 32) throw new Error("Run Process bootstrap key is oversized.");
		chunks.push(bytes);
	}
	if (length !== 32) throw new Error("Run Process bootstrap key must contain 32 bytes.");
	return new Uint8Array(Buffer.concat(chunks));
}

async function* jsonLines(reader: Readable): AsyncGenerator<unknown> {
	let pending = Buffer.alloc(0);
	for await (const chunk of reader) {
		const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		pending = Buffer.concat([pending, bytes]);
		if (pending.length > MAX_FRAME_BYTES) {
			throw new Error("Run Process command frame exceeds its byte limit.");
		}
		let newline = pending.indexOf(10);
		while (newline >= 0) {
			const line = pending.subarray(0, newline);
			pending = pending.subarray(newline + 1);
			if (line.length === 0) throw new Error("Run Process command frame is empty.");
			yield parseJson(line.toString("utf8"), "Run Process command frame");
			newline = pending.indexOf(10);
		}
	}
	if (pending.length !== 0) throw new Error("Run Process command frame is incomplete.");
}

async function nextFrame(
	frames: AsyncGenerator<unknown>,
	field: string,
): Promise<unknown> {
	const next = await frames.next();
	if (next.done) throw new Error(`${field} is unavailable.`);
	return next.value;
}

async function writeFrame(writer: Writable, value: unknown): Promise<void> {
	const frame = Buffer.from(`${canonicalJson(value)}\n`);
	if (frame.length > MAX_FRAME_BYTES) {
		throw new Error("Run Process event frame exceeds its byte limit.");
	}
	if (!writer.write(frame)) await once(writer, "drain");
}

async function endWriter(writer: Writable): Promise<void> {
	writer.end();
	await once(writer, "finish");
}

function parseJson(value: string, field: string): unknown {
	try {
		return JSON.parse(value);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`${field} is not valid JSON: ${reason}`);
	}
}

function assertAbsolute(value: string, field: string): void {
	if (typeof value !== "string" || !isAbsolute(value)) {
		throw new Error(`${field} must be absolute.`);
	}
}

function assertText(value: string, field: string, maximum: number): void {
	if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
		throw new Error(`${field} must be non-empty and at most ${maximum} characters.`);
	}
}

function hasExactKeys(
	value: object,
	expected: readonly string[],
): boolean {
	const actual = Object.keys(value).sort(compareText);
	const sortedExpected = [...expected].sort(compareText);
	return actual.length === sortedExpected.length &&
		actual.every((key, index) => key === sortedExpected[index]);
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

const isMain = process.argv[1] !== undefined &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
	const manifestPath = process.argv[2];
	if (!manifestPath || process.argv.length !== 3) {
		throw new Error("DSH Run Process requires one input manifest path.");
	}
	await runDshRunProcess(resolve(manifestPath));
}
