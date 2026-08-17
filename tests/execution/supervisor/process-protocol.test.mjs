import assert from "node:assert/strict";
import {Buffer} from "node:buffer";
import {describe, it} from "node:test";

import {
	AGENT_RUNNER_PROTOCOL,
	bindActiveRunnerBundle,
	createAgentRunCancellationRequest,
	createAgentRunEvent,
	createAgentRunHandle,
	createAgentRunQuiescence,
	createAgentRunRawLogReference,
	createAgentRunSpecification,
	createQualifiedRunnerBundle,
	createRunnerBundleManifest,
	createRunnerBundleRegistrySnapshot,
	activateRunnerBundle,
	qualifyRunnerBundle,
} from "../../../src/execution/ports.ts";
import {
	AGENT_RUNNER_PROCESS_PROTOCOL,
	admitAgentRunnerHandshakeResponse,
	createAgentRunnerAcceptedEvent,
	createAgentRunnerHandshakeResponse,
	createAgentRunnerProcessChallenge,
	openAgentRunnerEnvelope,
	sealAgentRunnerEnvelope,
} from "../../../src/execution/supervisor/process-protocol.ts";
import {canonicalJsonDigest, sha256Digest} from "../../../src/utils/canonical-json.ts";

const NOW = "2026-08-16T10:00:00.000Z";
const EXPIRES = "2026-08-16T10:01:00.000Z";
const KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 9);

describe("Agent Runner process protocol", () => {
	it("admits only an exact authenticated Runner handshake before challenge expiry", () => {
		const {binding, specification} = fixture();
		const challenge = createAgentRunnerProcessChallenge({
			binding,
			specification,
			channelId: "channel-001",
			challengeNonce: "a".repeat(64),
			issuedAt: NOW,
			expiresAt: EXPIRES,
		});
		const response = createAgentRunnerHandshakeResponse({
			challenge,
			handshake: {
				runnerProtocolId: AGENT_RUNNER_PROTOCOL.id,
				runnerProtocolVersion: binding.runnerProtocolVersion,
				runnerBundleDigest: binding.bundleDigest,
			},
			bootstrapKey: KEY,
		});
		const admitted = admitAgentRunnerHandshakeResponse({
			challenge,
			binding,
			response,
			bootstrapKey: KEY,
			admittedAt: "2026-08-16T10:00:01.000Z",
		});

		assert.equal(challenge.processProtocolId, AGENT_RUNNER_PROCESS_PROTOCOL.id);
		assert.equal(admitted.runnerBundleDigest, binding.bundleDigest);
		assert.equal(Object.isFrozen(challenge), true);
		assert.throws(
			() =>
				admitAgentRunnerHandshakeResponse({
					challenge,
					binding,
					response,
					bootstrapKey: OTHER_KEY,
					admittedAt: "2026-08-16T10:00:01.000Z",
				}),
			/Runner handshake authentication failed/,
		);
		assert.throws(
			() =>
				admitAgentRunnerHandshakeResponse({
					challenge,
					binding,
					response,
					bootstrapKey: KEY,
					admittedAt: EXPIRES,
				}),
			/Runner process challenge expired/,
		);
	});

	it("authenticates exact direction and sequence for start and Runner events", () => {
		const {binding, specification} = fixture();
		const challenge = processChallenge(binding, specification);
		const handle = createAgentRunHandle(
			specification,
			"2026-08-16T10:00:01.000Z",
		);
		const acceptedEvent = createAgentRunnerAcceptedEvent(challenge, handle);
		const start = sealAgentRunnerEnvelope({
			challenge,
			direction: "supervisor-to-runner",
			sequence: 0,
			message: {kind: "start", specification, handle, acceptedEvent},
			bootstrapKey: KEY,
		});
		const admittedStart = openAgentRunnerEnvelope({
			challenge,
			expectedDirection: "supervisor-to-runner",
			expectedSequence: 0,
			value: start,
			bootstrapKey: KEY,
		});
		assert.equal(admittedStart.message.kind, "start");

		const event = createAgentRunEvent(handle, {
			sequence: 0,
			kind: "runner-started",
			occurredAt: "2026-08-16T10:00:02.000Z",
			payloadDigest: sha256Digest("runner-started"),
		});
		const runnerEnvelope = sealAgentRunnerEnvelope({
			challenge,
			direction: "runner-to-supervisor",
			sequence: 0,
			message: {kind: "event", event},
			handle,
			bootstrapKey: KEY,
		});
		const admittedEvent = openAgentRunnerEnvelope({
			challenge,
			expectedDirection: "runner-to-supervisor",
			expectedSequence: 0,
			value: runnerEnvelope,
			handle,
			bootstrapKey: KEY,
		});
		assert.equal(admittedEvent.message.kind, "event");
		assert.equal(admittedEvent.message.event.sequence, 0);

		assert.throws(
			() =>
				openAgentRunnerEnvelope({
					challenge,
					expectedDirection: "runner-to-supervisor",
					expectedSequence: 1,
					value: runnerEnvelope,
					handle,
					bootstrapKey: KEY,
				}),
			/Runner envelope sequence is stale or out of order/,
		);
		assert.throws(
			() =>
				openAgentRunnerEnvelope({
					challenge,
					expectedDirection: "supervisor-to-runner",
					expectedSequence: 0,
					value: runnerEnvelope,
					handle,
					bootstrapKey: KEY,
				}),
			/Runner envelope direction does not match the channel side/,
		);
	});

	it("rejects tampering and admits only closed cancellation and quiescence messages", () => {
		const {binding, specification} = fixture();
		const challenge = processChallenge(binding, specification);
		const handle = createAgentRunHandle(
			specification,
			"2026-08-16T10:00:01.000Z",
		);
		const cancellation = createAgentRunCancellationRequest(handle, {
			expectedEventSequence: 2,
			reason: "deadline",
			requestedAt: "2026-08-16T10:00:03.000Z",
		});
		const cancelEnvelope = sealAgentRunnerEnvelope({
			challenge,
			direction: "supervisor-to-runner",
			sequence: 1,
			message: {kind: "cancel", request: cancellation},
			handle,
			bootstrapKey: KEY,
		});
		assert.equal(
			openAgentRunnerEnvelope({
				challenge,
				expectedDirection: "supervisor-to-runner",
				expectedSequence: 1,
				value: cancelEnvelope,
				handle,
				bootstrapKey: KEY,
			}).message.kind,
			"cancel",
		);

		const rawLog = createAgentRunRawLogReference({
			encoding: "jsonl",
			formatVersion: 0,
			sessionId: handle.sessionId,
			storageId: "runner-log-001",
			byteLength: 1024,
			digest: sha256Digest("raw-log"),
			runnerBundleDigest: binding.bundleDigest,
		});
		const quiescence = createAgentRunQuiescence(handle, {
			finalEventSequence: 3,
			quiescedAt: "2026-08-16T10:00:04.000Z",
			proofDigest: sha256Digest("quiescence"),
			rawLog,
		});
		const quiescenceEnvelope = sealAgentRunnerEnvelope({
			challenge,
			direction: "runner-to-supervisor",
			sequence: 2,
			message: {kind: "quiescence", quiescence},
			handle,
			bootstrapKey: KEY,
		});
		const tampered = {
			...quiescenceEnvelope,
			message: {
				...quiescenceEnvelope.message,
				quiescence: {...quiescence, finalEventSequence: 4},
			},
		};
		assert.throws(
			() =>
				openAgentRunnerEnvelope({
					challenge,
					expectedDirection: "runner-to-supervisor",
					expectedSequence: 2,
					value: tampered,
					handle,
					bootstrapKey: KEY,
				}),
			/Runner envelope authentication failed/,
		);
		assert.throws(
			() =>
				sealAgentRunnerEnvelope({
					challenge,
					direction: "runner-to-supervisor",
					sequence: 3,
					message: {kind: "cancel", request: cancellation},
					handle,
					bootstrapKey: KEY,
				}),
			/Runner envelope message is not allowed for its direction/,
		);
	});
});

function processChallenge(binding, specification) {
	return createAgentRunnerProcessChallenge({
		binding,
		specification,
		channelId: "channel-001",
		challengeNonce: "a".repeat(64),
		issuedAt: NOW,
		expiresAt: EXPIRES,
	});
}

function fixture() {
	const bundle = createQualifiedRunnerBundle({
		manifest: createRunnerBundleManifest({
			schemaVersion: "1.0.0",
			runnerProtocolVersion: AGENT_RUNNER_PROTOCOL.version,
			nodeVersion: "26.1.0",
			dshSourceCommit: "a".repeat(40),
			dshPackageClosureDigest: sha256Digest("dsh-closure"),
			cordisClosureDigest: sha256Digest("cordis-closure"),
			backendPluginClosureDigest: sha256Digest("backend-plugin-closure"),
			modelAdapterClosureDigest: sha256Digest("model-adapter-closure"),
			delegateAdapterClosureDigest: sha256Digest("delegate-adapter-closure"),
			runnerArtifactDigest: sha256Digest("runner-artifact"),
		}),
		qualificationSuiteDigest: sha256Digest("suite"),
		qualificationEvidenceDigest: sha256Digest("evidence"),
		qualifiedAt: NOW,
	});
	let registry = createRunnerBundleRegistrySnapshot({generatedAt: NOW});
	registry = qualifyRunnerBundle({
		registry,
		expectedGeneration: 0,
		bundle,
		generatedAt: NOW,
	});
	registry = activateRunnerBundle({
		registry,
		expectedGeneration: 1,
		bundleDigest: bundle.bundleDigest,
		generatedAt: NOW,
	});
	const binding = bindActiveRunnerBundle(registry);
	const specification = createAgentRunSpecification({
		runId: "run-001",
		operationId: "operation-001",
		custody: "backend-owned",
		role: "decision-producer",
		stage: "decision",
		subject: {id: "change-001", digest: sha256Digest("subject")},
		runnerBundle: binding,
		session: {mode: "create", sessionId: "session-001", resumeLog: null},
		inputs: {
			stageContextDigest: sha256Digest("context"),
			staticInputManifestDigest: sha256Digest("input-manifest"),
			systemPromptDigest: sha256Digest("system-prompt"),
			promptDigest: sha256Digest("prompt"),
			producerSkillSetDigest: sha256Digest("skills"),
			toolMode: "admitted",
			toolSetDigest: sha256Digest("tools"),
			modelRoute: modelRoute("provider", "model"),
		},
		workspace: {
			kind: "immutable",
			repositorySnapshotDigest: sha256Digest("repository"),
		},
		budget: {
			timeoutMs: 60_000,
			maxModelRequests: 4,
			maxToolCalls: 8,
			maxInputTokens: 16_000,
			maxOutputTokens: 4_000,
		},
		createdAt: NOW,
		deadlineAt: EXPIRES,
	});
	return {binding, specification};
}

function modelRoute(provider, model) {
	const optionsDigest = sha256Digest("model-options");
	return {
		provider,
		model,
		optionsDigest,
		routeDigest: canonicalJsonDigest({provider, model, optionsDigest}),
	};
}
