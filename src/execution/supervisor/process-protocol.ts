import {createHmac, timingSafeEqual} from "node:crypto";

import {
	AGENT_RUNNER_PROTOCOL,
	AGENT_RUN_SPEC_SCHEMA_VERSION,
	admitAgentRunnerHandshake,
	createAgentRunCancellationRequest,
	createAgentRunEvent,
	createAgentRunHandle,
	createAgentRunQuiescence,
	createAgentRunSpecification,
	type AgentRunnerHandshake,
	type AgentRunCancellationRequest,
	type AgentRunEvent,
	type AgentRunHandle,
	type AgentRunQuiescence,
	type AgentRunSpecification,
	type AgentRunSpecificationInput,
	type RunnerBundleBinding,
} from "../ports.ts";
import {
	assertSha256Digest,
	canonicalJson,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

export const AGENT_RUNNER_PROCESS_PROTOCOL = Object.freeze({
	id: "codewiki.agent-runner-process",
	version: "1.0.0",
} as const);

export type AgentRunnerProcessDirection =
	| "supervisor-to-runner"
	| "runner-to-supervisor";
export type AgentRunnerProcessMac = `hmac-sha256:${string}`;

export interface AgentRunnerProcessChallenge {
	readonly processProtocolId: typeof AGENT_RUNNER_PROCESS_PROTOCOL.id;
	readonly processProtocolVersion: typeof AGENT_RUNNER_PROCESS_PROTOCOL.version;
	readonly runnerProtocolId: typeof AGENT_RUNNER_PROTOCOL.id;
	readonly runnerProtocolVersion: string;
	readonly runnerBundleDigest: Sha256Digest;
	readonly runId: string;
	readonly specDigest: Sha256Digest;
	readonly channelId: string;
	readonly challengeNonce: string;
	readonly issuedAt: string;
	readonly expiresAt: string;
	readonly challengeDigest: Sha256Digest;
}

interface AgentRunnerHandshakeResponse {
	readonly challengeDigest: Sha256Digest;
	readonly handshake: AgentRunnerHandshake;
	readonly proof: AgentRunnerProcessMac;
}

export type AgentSupervisorWireMessage =
	| {
			readonly kind: "start";
			readonly specification: AgentRunSpecification;
			readonly handle: AgentRunHandle;
			readonly acceptedEvent: AgentRunEvent;
	  }
	| {
			readonly kind: "cancel";
			readonly request: AgentRunCancellationRequest;
	  };

export type AgentRunnerWireMessage =
	| {
			readonly kind: "event";
			readonly event: AgentRunEvent;
	  }
	| {
			readonly kind: "quiescence";
			readonly quiescence: AgentRunQuiescence;
	  };

export type AgentRunnerProcessMessage =
	| AgentSupervisorWireMessage
	| AgentRunnerWireMessage;

export interface AgentRunnerAuthenticatedEnvelope {
	readonly processProtocolId: typeof AGENT_RUNNER_PROCESS_PROTOCOL.id;
	readonly processProtocolVersion: typeof AGENT_RUNNER_PROCESS_PROTOCOL.version;
	readonly channelId: string;
	readonly direction: AgentRunnerProcessDirection;
	readonly sequence: number;
	readonly message: AgentRunnerProcessMessage;
	readonly mac: AgentRunnerProcessMac;
}

export function createAgentRunnerProcessChallenge(input: {
	readonly binding: RunnerBundleBinding;
	readonly specification: AgentRunSpecification;
	readonly channelId: string;
	readonly challengeNonce: string;
	readonly issuedAt: string;
	readonly expiresAt: string;
}): Readonly<AgentRunnerProcessChallenge> {
	const specification = normalizeSpecification(input.specification);
	assertBindingMatchesSpecification(input.binding, specification);
	assertIdentifier(input.channelId, "Runner process channelId");
	assertNonce(input.challengeNonce, "Runner process challengeNonce");
	const issuedAt = assertTimestamp(input.issuedAt, "Runner process challenge issuedAt");
	const expiresAt = assertTimestamp(
		input.expiresAt,
		"Runner process challenge expiresAt",
	);
	assertChallengeLifetime(issuedAt, expiresAt);
	const body = processChallengeBody({
		runnerProtocolVersion: input.binding.runnerProtocolVersion,
		runnerBundleDigest: input.binding.bundleDigest,
		runId: specification.runId,
		specDigest: specification.specDigest,
		channelId: input.channelId,
		challengeNonce: input.challengeNonce,
		issuedAt,
		expiresAt,
	});
	return Object.freeze({...body, challengeDigest: canonicalJsonDigest(body)});
}

export function createAgentRunnerHandshakeResponse(input: {
	readonly challenge: AgentRunnerProcessChallenge;
	readonly handshake: AgentRunnerHandshake;
	readonly bootstrapKey: Uint8Array;
}): Readonly<AgentRunnerHandshakeResponse> {
	const challenge = normalizeChallenge(input.challenge);
	const handshake = admitAgentRunnerHandshake(
		challengeBinding(challenge),
		input.handshake,
	);
	const proofBody = Object.freeze({
		challengeDigest: challenge.challengeDigest,
		handshake,
	});
	return Object.freeze({
		...proofBody,
		proof: authenticate("handshake", proofBody, input.bootstrapKey),
	});
}

export function admitAgentRunnerHandshakeResponse(input: {
	readonly challenge: AgentRunnerProcessChallenge;
	readonly binding: RunnerBundleBinding;
	readonly response: unknown;
	readonly bootstrapKey: Uint8Array;
	readonly admittedAt: string;
}): Readonly<AgentRunnerHandshake> {
	const challenge = normalizeChallenge(input.challenge);
	assertBindingMatchesChallenge(input.binding, challenge);
	const admittedAt = assertTimestamp(
		input.admittedAt,
		"Runner handshake admittedAt",
	);
	if (
		Date.parse(admittedAt) < Date.parse(challenge.issuedAt) ||
		Date.parse(admittedAt) >= Date.parse(challenge.expiresAt)
	) {
		throw new Error("Runner process challenge expired.");
	}
	const response = record(input.response, "Runner handshake response");
	assertExactKeys(response, ["challengeDigest", "handshake", "proof"], "Runner handshake response");
	if (response.challengeDigest !== challenge.challengeDigest) {
		throw new Error("Runner handshake challenge does not match.");
	}
	const handshake = admitAgentRunnerHandshake(input.binding, response.handshake);
	const proofBody = Object.freeze({
		challengeDigest: challenge.challengeDigest,
		handshake,
	});
	assertAuthenticated({
		context: "handshake",
		value: proofBody,
		actual: response.proof,
		key: input.bootstrapKey,
		message: "Runner handshake authentication failed.",
	});
	return handshake;
}

export function createAgentRunnerAcceptedEvent(
	challengeValue: AgentRunnerProcessChallenge,
	handle: AgentRunHandle,
): Readonly<AgentRunEvent> {
	const challenge = normalizeChallenge(challengeValue);
	requireHandle(handle, challenge);
	return createAgentRunEvent(handle, {
		sequence: 0,
		kind: "accepted",
		occurredAt: handle.acceptedAt,
		payloadDigest: canonicalJsonDigest({
			challengeDigest: challenge.challengeDigest,
			handle,
		}),
	});
}

export function sealAgentRunnerEnvelope(input: {
	readonly challenge: AgentRunnerProcessChallenge;
	readonly direction: AgentRunnerProcessDirection;
	readonly sequence: number;
	readonly message: AgentRunnerProcessMessage;
	readonly handle?: AgentRunHandle;
	readonly bootstrapKey: Uint8Array;
}): Readonly<AgentRunnerAuthenticatedEnvelope> {
	const challenge = normalizeChallenge(input.challenge);
	assertDirection(input.direction);
	assertSequence(input.sequence);
	const message = normalizeMessage({
		challenge,
		direction: input.direction,
		message: input.message,
		handle: input.handle,
	});
	const body = Object.freeze({
		processProtocolId: AGENT_RUNNER_PROCESS_PROTOCOL.id,
		processProtocolVersion: AGENT_RUNNER_PROCESS_PROTOCOL.version,
		channelId: challenge.channelId,
		direction: input.direction,
		sequence: input.sequence,
		message,
	});
	return Object.freeze({
		...body,
		mac: authenticate("envelope", body, input.bootstrapKey),
	});
}

export function openAgentRunnerEnvelope(input: {
	readonly challenge: AgentRunnerProcessChallenge;
	readonly expectedDirection: AgentRunnerProcessDirection;
	readonly expectedSequence: number;
	readonly value: unknown;
	readonly handle?: AgentRunHandle;
	readonly bootstrapKey: Uint8Array;
}): Readonly<AgentRunnerAuthenticatedEnvelope> {
	const challenge = normalizeChallenge(input.challenge);
	assertDirection(input.expectedDirection);
	assertSequence(input.expectedSequence);
	const envelope = record(input.value, "Runner envelope");
	assertExactKeys(
		envelope,
		[
			"processProtocolId",
			"processProtocolVersion",
			"channelId",
			"direction",
			"sequence",
			"message",
			"mac",
		],
		"Runner envelope",
	);
	if (
		envelope.processProtocolId !== AGENT_RUNNER_PROCESS_PROTOCOL.id ||
		envelope.processProtocolVersion !== AGENT_RUNNER_PROCESS_PROTOCOL.version
	) {
		throw new Error("Runner envelope process protocol is unsupported.");
	}
	if (envelope.channelId !== challenge.channelId) {
		throw new Error("Runner envelope channel does not match the challenge.");
	}
	if (envelope.direction !== input.expectedDirection) {
		throw new Error("Runner envelope direction does not match the channel side.");
	}
	if (envelope.sequence !== input.expectedSequence) {
		throw new Error("Runner envelope sequence is stale or out of order.");
	}
	const body = Object.freeze({
		processProtocolId: AGENT_RUNNER_PROCESS_PROTOCOL.id,
		processProtocolVersion: AGENT_RUNNER_PROCESS_PROTOCOL.version,
		channelId: challenge.channelId,
		direction: input.expectedDirection,
		sequence: input.expectedSequence,
		message: envelope.message,
	});
	assertAuthenticated({
		context: "envelope",
		value: body,
		actual: envelope.mac,
		key: input.bootstrapKey,
		message: "Runner envelope authentication failed.",
	});
	const message = normalizeMessage({
		challenge,
		direction: input.expectedDirection,
		message: envelope.message,
		handle: input.handle,
	});
	return Object.freeze({...body, message, mac: envelope.mac as AgentRunnerProcessMac});
}

function normalizeMessage(input: {
	readonly challenge: AgentRunnerProcessChallenge;
	readonly direction: AgentRunnerProcessDirection;
	readonly message: unknown;
	readonly handle?: AgentRunHandle;
}): AgentRunnerProcessMessage {
	const message = record(input.message, "Runner envelope message");
	if (message.kind === "start" && input.direction === "supervisor-to-runner") {
		assertExactKeys(
			message,
			["kind", "specification", "handle", "acceptedEvent"],
			"Runner start message",
		);
		const specification = normalizeSpecification(message.specification);
		assertSpecificationMatchesChallenge(specification, input.challenge);
		const handle = normalizeHandle(message.handle, specification);
		const acceptedEvent = normalizeEvent(message.acceptedEvent, handle);
		const expectedEvent = createAgentRunnerAcceptedEvent(input.challenge, handle);
		assertCanonicalMatch(
			expectedEvent,
			acceptedEvent,
			"Agent Run accepted event",
		);
		return Object.freeze({
			kind: "start",
			specification,
			handle,
			acceptedEvent,
		});
	}
	const handle = requireHandle(input.handle, input.challenge);
	if (message.kind === "cancel" && input.direction === "supervisor-to-runner") {
		assertExactKeys(message, ["kind", "request"], "Runner cancellation message");
		const request = normalizeCancellation(message.request, handle);
		return Object.freeze({kind: "cancel", request});
	}
	if (message.kind === "event" && input.direction === "runner-to-supervisor") {
		assertExactKeys(message, ["kind", "event"], "Runner event message");
		const event = normalizeEvent(message.event, handle);
		return Object.freeze({kind: "event", event});
	}
	if (message.kind === "quiescence" && input.direction === "runner-to-supervisor") {
		assertExactKeys(message, ["kind", "quiescence"], "Runner quiescence message");
		const quiescence = normalizeQuiescence(message.quiescence, handle);
		return Object.freeze({kind: "quiescence", quiescence});
	}
	throw new Error("Runner envelope message is not allowed for its direction.");
}

function normalizeSpecification(value: unknown): AgentRunSpecification {
	const specification = record(value, "Agent Run Specification");
	assertExactKeys(
		specification,
		[
			"schemaVersion",
			"runId",
			"operationId",
			"custody",
			"role",
			"stage",
			"subject",
			"runnerBundle",
			"session",
			"inputs",
			"workspace",
			"budget",
			"createdAt",
			"deadlineAt",
			"specDigest",
		],
		"Agent Run Specification",
	);
	if (specification.schemaVersion !== AGENT_RUN_SPEC_SCHEMA_VERSION) {
		throw new Error("Agent Run Specification schemaVersion is invalid.");
	}
	const {schemaVersion: _schemaVersion, specDigest, ...input} = specification;
	const normalized = createAgentRunSpecification(
		input as unknown as AgentRunSpecificationInput,
	);
	if (specDigest !== normalized.specDigest) {
		throw new Error("Agent Run Specification digest does not match its content.");
	}
	return normalized;
}

function normalizeHandle(
	value: unknown,
	specification: AgentRunSpecification,
): AgentRunHandle {
	const handle = record(value, "Agent Run handle");
	assertExactKeys(
		handle,
		[
			"runId",
			"specDigest",
			"custody",
			"runnerBundle",
			"sessionId",
			"acceptedAt",
		],
		"Agent Run handle",
	);
	if (typeof handle.acceptedAt !== "string") {
		throw new Error("Agent Run handle acceptedAt is invalid.");
	}
	const normalized = createAgentRunHandle(specification, handle.acceptedAt);
	if (canonicalJson(normalized) !== canonicalJson(handle)) {
		throw new Error("Agent Run handle does not match its specification.");
	}
	return normalized;
}

function normalizeCancellation(
	value: unknown,
	handle: AgentRunHandle,
): AgentRunCancellationRequest {
	const request = record(value, "Agent Run cancellation request");
	assertExactKeys(
		request,
		["runId", "specDigest", "expectedEventSequence", "reason", "requestedAt"],
		"Agent Run cancellation request",
	);
	const normalized = createAgentRunCancellationRequest(handle, {
		expectedEventSequence: request.expectedEventSequence as number,
		reason: request.reason as AgentRunCancellationRequest["reason"],
		requestedAt: request.requestedAt as string,
	});
	assertCanonicalMatch(normalized, request, "Agent Run cancellation request");
	return normalized;
}

function normalizeEvent(value: unknown, handle: AgentRunHandle): AgentRunEvent {
	const event = record(value, "Agent Run event");
	assertExactKeys(
		event,
		["runId", "specDigest", "sequence", "kind", "occurredAt", "payloadDigest"],
		"Agent Run event",
	);
	const normalized = createAgentRunEvent(handle, {
		sequence: event.sequence as number,
		kind: event.kind as AgentRunEvent["kind"],
		occurredAt: event.occurredAt as string,
		payloadDigest: event.payloadDigest as Sha256Digest,
	});
	assertCanonicalMatch(normalized, event, "Agent Run event");
	return normalized;
}

function normalizeQuiescence(
	value: unknown,
	handle: AgentRunHandle,
): AgentRunQuiescence {
	const quiescence = record(value, "Agent Run quiescence");
	assertExactKeys(
		quiescence,
		[
			"runId",
			"specDigest",
			"finalEventSequence",
			"quiescedAt",
			"proofDigest",
			"rawLog",
		],
		"Agent Run quiescence",
	);
	const normalized = createAgentRunQuiescence(handle, {
		finalEventSequence: quiescence.finalEventSequence as number,
		quiescedAt: quiescence.quiescedAt as string,
		proofDigest: quiescence.proofDigest as Sha256Digest,
		rawLog: quiescence.rawLog as AgentRunQuiescence["rawLog"],
	});
	assertCanonicalMatch(normalized, quiescence, "Agent Run quiescence");
	return normalized;
}

function assertChallengeLifetime(issuedAt: string, expiresAt: string): void {
	const lifetimeMs = Date.parse(expiresAt) - Date.parse(issuedAt);
	if (lifetimeMs < 1 || lifetimeMs > 60_000) {
		throw new Error("Runner process challenge lifetime is invalid.");
	}
}

function processChallengeBody(input: {
	readonly runnerProtocolVersion: string;
	readonly runnerBundleDigest: Sha256Digest;
	readonly runId: string;
	readonly specDigest: Sha256Digest;
	readonly channelId: string;
	readonly challengeNonce: string;
	readonly issuedAt: string;
	readonly expiresAt: string;
}): Omit<AgentRunnerProcessChallenge, "challengeDigest"> {
	return Object.freeze({
		processProtocolId: AGENT_RUNNER_PROCESS_PROTOCOL.id,
		processProtocolVersion: AGENT_RUNNER_PROCESS_PROTOCOL.version,
		runnerProtocolId: AGENT_RUNNER_PROTOCOL.id,
		...input,
	});
}

function normalizeChallenge(value: unknown): AgentRunnerProcessChallenge {
	const challenge = record(value, "Runner process challenge");
	assertExactKeys(
		challenge,
		[
			"processProtocolId",
			"processProtocolVersion",
			"runnerProtocolId",
			"runnerProtocolVersion",
			"runnerBundleDigest",
			"runId",
			"specDigest",
			"channelId",
			"challengeNonce",
			"issuedAt",
			"expiresAt",
			"challengeDigest",
		],
		"Runner process challenge",
	);
	if (
		challenge.processProtocolId !== AGENT_RUNNER_PROCESS_PROTOCOL.id ||
		challenge.processProtocolVersion !== AGENT_RUNNER_PROCESS_PROTOCOL.version ||
		challenge.runnerProtocolId !== AGENT_RUNNER_PROTOCOL.id
	) {
		throw new Error("Runner process challenge protocol is unsupported.");
	}
	assertVersion(challenge.runnerProtocolVersion, "Runner process protocol version");
	const runnerBundleDigest = assertSha256Digest(
		challenge.runnerBundleDigest,
		"Runner process bundle digest",
	);
	assertIdentifier(challenge.runId, "Runner process runId");
	const specDigest = assertSha256Digest(
		challenge.specDigest,
		"Runner process Specification digest",
	);
	assertIdentifier(challenge.channelId, "Runner process channelId");
	assertNonce(challenge.challengeNonce, "Runner process challengeNonce");
	const issuedAt = assertTimestamp(
		challenge.issuedAt,
		"Runner process challenge issuedAt",
	);
	const expiresAt = assertTimestamp(
		challenge.expiresAt,
		"Runner process challenge expiresAt",
	);
	assertChallengeLifetime(issuedAt, expiresAt);
	const body = processChallengeBody({
		runnerProtocolVersion: challenge.runnerProtocolVersion,
		runnerBundleDigest,
		runId: challenge.runId,
		specDigest,
		channelId: challenge.channelId,
		challengeNonce: challenge.challengeNonce,
		issuedAt,
		expiresAt,
	});
	const challengeDigest = assertSha256Digest(
		challenge.challengeDigest,
		"Runner process challenge digest",
	);
	if (challengeDigest !== canonicalJsonDigest(body)) {
		throw new Error("Runner process challenge digest does not match its content.");
	}
	return Object.freeze({...body, challengeDigest});
}

function challengeBinding(
	challenge: AgentRunnerProcessChallenge,
): RunnerBundleBinding {
	return Object.freeze({
		bundleDigest: challenge.runnerBundleDigest,
		runnerProtocolVersion: challenge.runnerProtocolVersion,
	});
}

function assertBindingMatchesSpecification(
	binding: RunnerBundleBinding,
	specification: AgentRunSpecification,
): void {
	if (canonicalJson(binding) !== canonicalJson(specification.runnerBundle)) {
		throw new Error("Runner process binding does not match the Run Specification.");
	}
}

function assertBindingMatchesChallenge(
	binding: RunnerBundleBinding,
	challenge: AgentRunnerProcessChallenge,
): void {
	if (canonicalJson(binding) !== canonicalJson(challengeBinding(challenge))) {
		throw new Error("Runner process binding does not match the challenge.");
	}
}

function assertSpecificationMatchesChallenge(
	specification: AgentRunSpecification,
	challenge: AgentRunnerProcessChallenge,
): void {
	if (
		specification.runId !== challenge.runId ||
		specification.specDigest !== challenge.specDigest ||
		specification.runnerBundle.bundleDigest !== challenge.runnerBundleDigest ||
		specification.runnerBundle.runnerProtocolVersion !==
			challenge.runnerProtocolVersion
	) {
		throw new Error("Runner start Specification does not match the challenge.");
	}
}

function requireHandle(
	handle: AgentRunHandle | undefined,
	challenge: AgentRunnerProcessChallenge,
): AgentRunHandle {
	if (
		!handle ||
		handle.runId !== challenge.runId ||
		handle.specDigest !== challenge.specDigest ||
		handle.runnerBundle.bundleDigest !== challenge.runnerBundleDigest ||
		handle.runnerBundle.runnerProtocolVersion !== challenge.runnerProtocolVersion
	) {
		throw new Error("Runner envelope requires the exact challenged Agent Run handle.");
	}
	return handle;
}

function authenticate(
	context: "handshake" | "envelope",
	value: unknown,
	key: Uint8Array,
): AgentRunnerProcessMac {
	assertBootstrapKey(key);
	const digest = createHmac("sha256", key)
		.update(`codewiki.agent-runner-process/${context}/1\0`)
		.update(canonicalJson(value))
		.digest("hex");
	return `hmac-sha256:${digest}`;
}

function assertAuthenticated(input: {
	readonly context: "handshake" | "envelope";
	readonly value: unknown;
	readonly actual: unknown;
	readonly key: Uint8Array;
	readonly message: string;
}): void {
	let expected: AgentRunnerProcessMac;
	try {
		expected = authenticate(input.context, input.value, input.key);
	} catch {
		throw new Error(input.message);
	}
	if (
		typeof input.actual !== "string" ||
		!/^hmac-sha256:[0-9a-f]{64}$/.test(input.actual)
	) {
		throw new Error(input.message);
	}
	const expectedBytes = Buffer.from(expected.slice("hmac-sha256:".length), "hex");
	const actualBytes = Buffer.from(
		input.actual.slice("hmac-sha256:".length),
		"hex",
	);
	if (!timingSafeEqual(expectedBytes, actualBytes)) {
		throw new Error(input.message);
	}
}

function assertBootstrapKey(key: Uint8Array): void {
	if (!(key instanceof Uint8Array) || key.byteLength < 32) {
		throw new Error("Runner process bootstrap key must contain at least 32 bytes.");
	}
}

function assertCanonicalMatch(
	normalized: unknown,
	value: unknown,
	field: string,
): void {
	if (canonicalJson(normalized) !== canonicalJson(value)) {
		throw new Error(`${field} does not match the challenged Agent Run.`);
	}
}

function assertDirection(value: unknown): asserts value is AgentRunnerProcessDirection {
	if (value !== "supervisor-to-runner" && value !== "runner-to-supervisor") {
		throw new Error("Runner envelope direction is invalid.");
	}
}

function assertSequence(value: unknown): asserts value is number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		throw new Error("Runner envelope sequence must be a non-negative safe integer.");
	}
}

function assertIdentifier(value: unknown, field: string): asserts value is string {
	if (
		typeof value !== "string" ||
		!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)
	) {
		throw new Error(`${field} is invalid.`);
	}
}

function assertNonce(value: unknown, field: string): asserts value is string {
	if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
		throw new Error(`${field} must be 32 lowercase hexadecimal bytes.`);
	}
}

function assertTimestamp(value: unknown, field: string): string {
	if (
		typeof value !== "string" ||
		!Number.isFinite(Date.parse(value)) ||
		new Date(value).toISOString() !== value
	) {
		throw new Error(`${field} must be a canonical ISO timestamp.`);
	}
	return value;
}

function assertVersion(value: unknown, field: string): asserts value is string {
	if (typeof value !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)) {
		throw new Error(`${field} is invalid.`);
	}
}

function record(value: unknown, field: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${field} shape is invalid.`);
	}
	return value as Record<string, unknown>;
}

function assertExactKeys(
	value: Record<string, unknown>,
	expected: readonly string[],
	field: string,
): void {
	const keys = Object.keys(value).sort(compareText);
	const expectedKeys = [...expected].sort(compareText);
	if (
		keys.length !== expectedKeys.length ||
		keys.some((key, index) => key !== expectedKeys[index])
	) {
		throw new Error(`${field} shape is invalid.`);
	}
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
