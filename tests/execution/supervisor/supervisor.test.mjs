import assert from "node:assert/strict";
import {Buffer} from "node:buffer";
import {describe, it} from "node:test";

import {
	AGENT_RUNNER_PROTOCOL,
	activateRunnerBundle,
	bindActiveRunnerBundle,
	createAgentRunCancellationRequest,
	createAgentRunEvent,
	createAgentRunQuiescence,
	createAgentRunSpecification,
	createQualifiedRunnerBundle,
	createRunnerBundleManifest,
	createRunnerBundleRegistrySnapshot,
	qualifyRunnerBundle,
} from "../../../src/execution/ports.ts";
import {
	createAgentRunnerHandshakeResponse,
	openAgentRunnerEnvelope,
	sealAgentRunnerEnvelope,
} from "../../../src/execution/supervisor/process-protocol.ts";
import {createAgentSupervisor} from "../../../src/execution/supervisor/supervisor.ts";
import {canonicalJsonDigest, sha256Digest} from "../../../src/utils/canonical-json.ts";

const NOW = "2026-08-16T10:00:00.000Z";
const ACCEPTED_AT = "2026-08-16T10:00:01.000Z";
const DEADLINE = "2026-08-16T10:01:00.000Z";

describe("Agent Supervisor", () => {
	it("admits one exact Runner, sequences events, proves exit, and erases its key", async () => {
		const launcher = new FakeRunnerLauncher({completeAfterStart: true});
		const supervisor = createAgentSupervisor(supervisorOptions(launcher));
		const specification = runSpecification();
		const handle = await supervisor.start(specification);
		const quiescence = await supervisor.waitForQuiescence(handle);
		const events = supervisor.readEvents(handle);

		assert.equal(quiescence.finalEventSequence, 1);
		assert.deepEqual(
			events.map((event) => event.kind),
			["accepted", "runner-started"],
		);
		assert.equal(launcher.connection?.closeRequested, true);
		assert.equal(launcher.connection?.exited, true);
		assert.equal(launcher.connection?.terminated, false);
		assert.deepEqual(
			Object.keys(launcher.lastLaunchInput || {}).sort(),
			["bootstrapKey", "challenge", "signal"],
		);
		assert.equal(launcher.lastLaunchInput?.bootstrapKey.every((byte) => byte === 0), true);
	});

	it("uses expected event sequence as cancellation CAS and waits for quiescence", async () => {
		const launcher = new FakeRunnerLauncher({completeAfterStart: false});
		const supervisor = createAgentSupervisor(supervisorOptions(launcher));
		const handle = await supervisor.start(runSpecification());
		await until(() => supervisor.readEvents(handle).length === 2);

		await assert.rejects(
			() =>
				supervisor.cancel(
					createAgentRunCancellationRequest(handle, {
						expectedEventSequence: 0,
						reason: "user",
						requestedAt: "2026-08-16T10:00:02.000Z",
					}),
				),
			/Agent Run cancellation event sequence conflict/,
		);
		await supervisor.cancel(
			createAgentRunCancellationRequest(handle, {
				expectedEventSequence: 1,
				reason: "user",
				requestedAt: "2026-08-16T10:00:02.000Z",
			}),
		);
		const quiescence = await supervisor.waitForQuiescence(handle);
		assert.equal(quiescence.finalEventSequence, 2);
		assert.deepEqual(
			supervisor.readEvents(handle, 0).map((event) => event.kind),
			["runner-started", "cancellation-requested"],
		);
	});

	it("terminates and erases the key when Runner authentication fails", async () => {
		const launcher = new FakeRunnerLauncher({invalidHandshake: true});
		const supervisor = createAgentSupervisor(supervisorOptions(launcher));

		await assert.rejects(
			() => supervisor.start(runSpecification()),
			/Runner handshake authentication failed/,
		);
		assert.equal(launcher.connection?.terminated, true);
		assert.equal(launcher.lastLaunchInput?.bootstrapKey.every((byte) => byte === 0), true);
	});

	it("forces termination when shutdown cancellation cannot cross the process channel", async () => {
		const launcher = new FakeRunnerLauncher({
			completeAfterStart: false,
			rejectCancellation: true,
		});
		const supervisor = createAgentSupervisor(supervisorOptions(launcher));
		const handle = await supervisor.start(runSpecification());
		await until(() => supervisor.readEvents(handle).length === 2);
		const completion = supervisor.waitForQuiescence(handle);

		await supervisor.shutdown();
		await assert.rejects(completion, /Fake Runner rejected cancellation/);
		assert.equal(launcher.connection?.terminated, true);
		assert.equal(launcher.lastLaunchInput?.bootstrapKey.every((byte) => byte === 0), true);
	});
});

class FakeRunnerLauncher {
	constructor(options) {
		this.options = options;
		this.lastLaunchInput = undefined;
		this.connection = undefined;
	}

	async launch(input) {
		this.lastLaunchInput = input;
		this.connection = new FakeRunnerConnection(input, this.options);
		return this.connection;
	}
}

class FakeRunnerConnection {
	constructor(input, options) {
		this.challenge = input.challenge;
		this.key = input.bootstrapKey;
		this.options = options;
		this.handshakePending = true;
		this.incoming = [];
		this.waiter = undefined;
		this.txSequence = 0;
		this.rxSequence = 0;
		this.handle = undefined;
		this.closeRequested = false;
		this.exited = false;
		this.terminated = false;
	}

	async receive(signal) {
		if (this.handshakePending) {
			this.handshakePending = false;
			return createAgentRunnerHandshakeResponse({
				challenge: this.challenge,
				handshake: {
					runnerProtocolId: AGENT_RUNNER_PROTOCOL.id,
					runnerProtocolVersion: this.challenge.runnerProtocolVersion,
					runnerBundleDigest: this.challenge.runnerBundleDigest,
				},
				bootstrapKey: this.options.invalidHandshake
					? Buffer.alloc(32, 99)
					: this.key,
			});
		}
		if (this.incoming.length > 0) return this.incoming.shift();
		return new Promise((resolve, reject) => {
			const onAbort = () => {
				this.waiter = undefined;
				reject(new Error("Fake Runner receive aborted."));
			};
			signal.addEventListener("abort", onAbort, {once: true});
			this.waiter = (value) => {
				signal.removeEventListener("abort", onAbort);
				this.waiter = undefined;
				resolve(value);
			};
		});
	}

	async send(envelope) {
		const opened = openAgentRunnerEnvelope({
			challenge: this.challenge,
			expectedDirection: "supervisor-to-runner",
			expectedSequence: this.txSequence,
			value: envelope,
			handle: this.handle,
			bootstrapKey: this.key,
		});
		this.txSequence += 1;
		if (opened.message.kind === "start") {
			this.handle = opened.message.handle;
			this.enqueueEvent("runner-started", "2026-08-16T10:00:02.000Z");
			if (this.options.completeAfterStart) this.enqueueQuiescence();
			return;
		}
		if (opened.message.kind === "cancel") {
			if (this.options.rejectCancellation) {
				throw new Error("Fake Runner rejected cancellation.");
			}
			this.enqueueEvent(
				"cancellation-requested",
				opened.message.request.requestedAt,
			);
			this.enqueueQuiescence();
		}
	}

	async requestClose() {
		this.closeRequested = true;
		this.exited = true;
	}

	async terminate() {
		this.terminated = true;
		this.exited = true;
	}

	async whenExited() {
		if (!this.exited) throw new Error("Fake Runner has not exited.");
	}

	enqueueEvent(kind, occurredAt) {
		const event = createAgentRunEvent(this.handle, {
			sequence: kind === "runner-started" ? 1 : 2,
			kind,
			occurredAt,
			payloadDigest: sha256Digest(`event:${kind}`),
		});
		this.enqueue(
			sealAgentRunnerEnvelope({
				challenge: this.challenge,
				direction: "runner-to-supervisor",
				sequence: this.rxSequence,
				message: {kind: "event", event},
				handle: this.handle,
				bootstrapKey: this.key,
			}),
		);
		this.rxSequence += 1;
	}

	enqueueQuiescence() {
		const finalEventSequence = this.options.completeAfterStart ? 1 : 2;
		const quiescence = createAgentRunQuiescence(this.handle, {
			finalEventSequence,
			quiescedAt: "2026-08-16T10:00:03.000Z",
			proofDigest: sha256Digest("quiescence"),
			rawLog: null,
		});
		this.enqueue(
			sealAgentRunnerEnvelope({
				challenge: this.challenge,
				direction: "runner-to-supervisor",
				sequence: this.rxSequence,
				message: {kind: "quiescence", quiescence},
				handle: this.handle,
				bootstrapKey: this.key,
			}),
		);
		this.rxSequence += 1;
	}

	enqueue(value) {
		if (this.waiter) {
			this.waiter(value);
			return;
		}
		this.incoming.push(value);
	}
}

function supervisorOptions(launcher) {
	let nowCalls = 0;
	return {
		launcher,
		now: () => {
			nowCalls += 1;
			return nowCalls === 1 ? ACCEPTED_AT : "2026-08-16T10:00:01.500Z";
		},
		random: (size) => Buffer.alloc(size, size),
		handshakeTimeoutMs: 10_000,
		cancellationGraceMs: 1_000,
		processExitTimeoutMs: 1_000,
	};
}

async function until(predicate) {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	throw new Error("Condition was not reached.");
}

function runSpecification() {
	const binding = activeRunnerBinding();
	return createAgentRunSpecification({
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
		deadlineAt: DEADLINE,
	});
}

function activeRunnerBinding() {
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
	return bindActiveRunnerBundle(registry);
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
