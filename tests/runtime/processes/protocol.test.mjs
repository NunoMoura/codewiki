import assert from "node:assert/strict";
import {Buffer} from "node:buffer";
import {describe, it} from "node:test";

import {
	RUN_PROTOCOL,
	bindActiveRuntimeBuild,
	createRunCancellationRequest,
	createRunEvent,
	createRunHandle,
	createRunQuiescence,
	createRunRawLogReference,
	createRunRequest,
	createQualifiedRuntimeBuild,
	createRuntimeBuildManifest,
	createRuntimeBuildRegistrySnapshot,
	activateRuntimeBuild,
	qualifyRuntimeBuild,
} from "../../../src/runtime/contracts.ts";
import {
	RUNNER_PROCESS_PROTOCOL,
	admitRunProcessHandshakeResponse,
	createRunProcessAcceptedEvent,
	createRunProcessHandshakeResponse,
	createRunProcessChallenge,
	openRunProcessEnvelope,
	sealRunProcessEnvelope,
} from "../../../src/runtime/processes/protocol.ts";
import {canonicalJsonDigest, sha256Digest} from "../../../src/utils/canonical-json.ts";

const NOW = "2026-08-16T10:00:00.000Z";
const EXPIRES = "2026-08-16T10:01:00.000Z";
const KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 9);

describe("Run Process protocol", () => {
	it("admits only an exact authenticated Run Process handshake before challenge expiry", () => {
		const {binding, request} = fixture();
		const challenge = createRunProcessChallenge({
			binding,
			request,
			channelId: "channel-001",
			challengeNonce: "a".repeat(64),
			issuedAt: NOW,
			expiresAt: EXPIRES,
		});
		const response = createRunProcessHandshakeResponse({
			challenge,
			handshake: {
				runProtocolId: RUN_PROTOCOL.id,
				runProtocolVersion: binding.runProtocolVersion,
				runtimeBuildDigest: binding.buildDigest,
			},
			bootstrapKey: KEY,
		});
		const admitted = admitRunProcessHandshakeResponse({
			challenge,
			binding,
			response,
			bootstrapKey: KEY,
			admittedAt: "2026-08-16T10:00:01.000Z",
		});

		assert.equal(challenge.processProtocolId, RUNNER_PROCESS_PROTOCOL.id);
		assert.equal(admitted.runtimeBuildDigest, binding.buildDigest);
		assert.equal(Object.isFrozen(challenge), true);
		assert.throws(
			() =>
				admitRunProcessHandshakeResponse({
					challenge,
					binding,
					response,
					bootstrapKey: OTHER_KEY,
					admittedAt: "2026-08-16T10:00:01.000Z",
				}),
			/Run Process handshake authentication failed/,
		);
		assert.throws(
			() =>
				admitRunProcessHandshakeResponse({
					challenge,
					binding,
					response,
					bootstrapKey: KEY,
					admittedAt: EXPIRES,
				}),
			/Run Process challenge expired/,
		);
	});

	it("authenticates exact direction and sequence for start and Run Process events", () => {
		const {binding, request} = fixture();
		const challenge = processChallenge(binding, request);
		const handle = createRunHandle(
			request,
			"2026-08-16T10:00:01.000Z",
		);
		const acceptedEvent = createRunProcessAcceptedEvent(challenge, handle);
		const start = sealRunProcessEnvelope({
			challenge,
			direction: "runtime-to-run-process",
			sequence: 0,
			message: {kind: "start", request, handle, acceptedEvent},
			bootstrapKey: KEY,
		});
		const admittedStart = openRunProcessEnvelope({
			challenge,
			expectedDirection: "runtime-to-run-process",
			expectedSequence: 0,
			value: start,
			bootstrapKey: KEY,
		});
		assert.equal(admittedStart.message.kind, "start");

		const event = createRunEvent(handle, {
			sequence: 0,
			kind: "process-started",
			occurredAt: "2026-08-16T10:00:02.000Z",
			payloadDigest: sha256Digest("process-started"),
		});
		const runnerEnvelope = sealRunProcessEnvelope({
			challenge,
			direction: "run-process-to-runtime",
			sequence: 0,
			message: {kind: "event", event},
			handle,
			bootstrapKey: KEY,
		});
		const admittedEvent = openRunProcessEnvelope({
			challenge,
			expectedDirection: "run-process-to-runtime",
			expectedSequence: 0,
			value: runnerEnvelope,
			handle,
			bootstrapKey: KEY,
		});
		assert.equal(admittedEvent.message.kind, "event");
		assert.equal(admittedEvent.message.event.sequence, 0);

		assert.throws(
			() =>
				openRunProcessEnvelope({
					challenge,
					expectedDirection: "run-process-to-runtime",
					expectedSequence: 1,
					value: runnerEnvelope,
					handle,
					bootstrapKey: KEY,
				}),
			/Run Process envelope sequence is stale or out of order/,
		);
		assert.throws(
			() =>
				openRunProcessEnvelope({
					challenge,
					expectedDirection: "runtime-to-run-process",
					expectedSequence: 0,
					value: runnerEnvelope,
					handle,
					bootstrapKey: KEY,
				}),
			/Run Process envelope direction does not match the channel side/,
		);
	});

	it("rejects tampering and admits only closed cancellation and quiescence messages", () => {
		const {binding, request} = fixture();
		const challenge = processChallenge(binding, request);
		const handle = createRunHandle(
			request,
			"2026-08-16T10:00:01.000Z",
		);
		const cancellation = createRunCancellationRequest(handle, {
			expectedEventSequence: 2,
			reason: "deadline",
			requestedAt: "2026-08-16T10:00:03.000Z",
		});
		const cancelEnvelope = sealRunProcessEnvelope({
			challenge,
			direction: "runtime-to-run-process",
			sequence: 1,
			message: {kind: "cancel", request: cancellation},
			handle,
			bootstrapKey: KEY,
		});
		assert.equal(
			openRunProcessEnvelope({
				challenge,
				expectedDirection: "runtime-to-run-process",
				expectedSequence: 1,
				value: cancelEnvelope,
				handle,
				bootstrapKey: KEY,
			}).message.kind,
			"cancel",
		);

		const rawLog = createRunRawLogReference({
			encoding: "jsonl",
			formatVersion: 0,
			sessionId: handle.sessionId,
			storageId: "runner-log-001",
			byteLength: 1024,
			digest: sha256Digest("raw-log"),
			runtimeBuildDigest: binding.buildDigest,
		});
		const quiescence = createRunQuiescence(handle, {
			finalEventSequence: 3,
			quiescedAt: "2026-08-16T10:00:04.000Z",
			proofDigest: sha256Digest("quiescence"),
			rawLog,
		});
		const quiescenceEnvelope = sealRunProcessEnvelope({
			challenge,
			direction: "run-process-to-runtime",
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
				openRunProcessEnvelope({
					challenge,
					expectedDirection: "run-process-to-runtime",
					expectedSequence: 2,
					value: tampered,
					handle,
					bootstrapKey: KEY,
				}),
			/Run Process envelope authentication failed/,
		);
		assert.throws(
			() =>
				sealRunProcessEnvelope({
					challenge,
					direction: "run-process-to-runtime",
					sequence: 3,
					message: {kind: "cancel", request: cancellation},
					handle,
					bootstrapKey: KEY,
				}),
			/Run Process envelope message is not allowed for its direction/,
		);
	});
});

function processChallenge(binding, request) {
	return createRunProcessChallenge({
		binding,
		request,
		channelId: "channel-001",
		challengeNonce: "a".repeat(64),
		issuedAt: NOW,
		expiresAt: EXPIRES,
	});
}

function fixture() {
	const build = createQualifiedRuntimeBuild({
		manifest: createRuntimeBuildManifest({
			schemaVersion: "1.0.0",
			runProtocolVersion: RUN_PROTOCOL.version,
			nodeVersion: "26.1.0",
			dshSourceCommit: "a".repeat(40),
			dshPackageClosureDigest: sha256Digest("dsh-closure"),
			cordisClosureDigest: sha256Digest("cordis-closure"),
			runtimePluginClosureDigest: sha256Digest("backend-plugin-closure"),
			modelAdapterClosureDigest: sha256Digest("model-adapter-closure"),
			delegateAdapterClosureDigest: sha256Digest("delegate-adapter-closure"),
			runtimeArtifactDigest: sha256Digest("runner-artifact"),
		}),
		qualificationSuiteDigest: sha256Digest("suite"),
		qualificationEvidenceDigest: sha256Digest("evidence"),
		qualifiedAt: NOW,
	});
	let registry = createRuntimeBuildRegistrySnapshot({generatedAt: NOW});
	registry = qualifyRuntimeBuild({
		registry,
		expectedGeneration: 0,
		build,
		generatedAt: NOW,
	});
	registry = activateRuntimeBuild({
		registry,
		expectedGeneration: 1,
		buildDigest: build.buildDigest,
		generatedAt: NOW,
	});
	const binding = bindActiveRuntimeBuild(registry);
	const request = createRunRequest({
		runId: "run-001",
		operationId: "operation-001",
		custody: "backend-owned",
		role: "decision-producer",
		stage: "decision",
		subject: {id: "change-001", digest: sha256Digest("subject")},
		runtimeBuild: binding,
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
	return {binding, request};
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
