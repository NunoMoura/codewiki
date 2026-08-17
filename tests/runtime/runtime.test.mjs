import assert from "node:assert/strict";
import {Buffer} from "node:buffer";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {describe, it} from "node:test";
import {pathToFileURL} from "node:url";

import {
	RUN_PROTOCOL,
	activateRuntimeBuild,
	bindActiveRuntimeBuild,
	createRunCancellationRequest,
	createRunEvent,
	createRunQuiescence,
	createRunRequest,
	createQualifiedRuntimeBuild,
	createRuntimeBuildManifest,
	createRuntimeBuildRegistrySnapshot,
	qualifyRuntimeBuild,
} from "../../src/runtime/contracts.ts";
import {
	createRunProcessHandshakeResponse,
	openRunProcessEnvelope,
	sealRunProcessEnvelope,
} from "../../src/runtime/processes/protocol.ts";
import {createNodeRunProcessManager} from "../../src/runtime/processes/node-process-manager.ts";
import {createRuntime} from "../../src/runtime/runtime.ts";
import {canonicalJsonDigest, sha256Digest} from "../../src/utils/canonical-json.ts";

const NOW = "2026-08-16T10:00:00.000Z";
const ACCEPTED_AT = "2026-08-16T10:00:01.000Z";
const DEADLINE = "2026-08-16T10:01:00.000Z";

describe("Runtime", () => {
	it("admits one exact Run Process, sequences events, proves exit, and erases its key", async () => {
		const processManager = new FakeRunProcessManager({completeAfterStart: true});
		const runtime = createRuntime(runtimeOptions(processManager));
		const request = runRequest();
		const handle = await runtime.start(request);
		const quiescence = await runtime.waitForQuiescence(handle);
		const events = runtime.readEvents(handle);

		assert.equal(quiescence.finalEventSequence, 1);
		assert.deepEqual(
			events.map((event) => event.kind),
			["accepted", "process-started"],
		);
		assert.equal(processManager.connection?.closeRequested, true);
		assert.equal(processManager.connection?.exited, true);
		assert.equal(processManager.connection?.terminated, false);
		assert.deepEqual(
			Object.keys(processManager.lastLaunchInput || {}).sort(),
			["bootstrapKey", "challenge", "signal"],
		);
		assert.equal(processManager.lastLaunchInput?.bootstrapKey.every((byte) => byte === 0), true);
	});

	it("uses expected event sequence as cancellation CAS and waits for quiescence", async () => {
		const processManager = new FakeRunProcessManager({completeAfterStart: false});
		const runtime = createRuntime(runtimeOptions(processManager));
		const handle = await runtime.start(runRequest());
		await until(() => runtime.readEvents(handle).length === 2);

		await assert.rejects(
			() =>
				runtime.cancel(
					createRunCancellationRequest(handle, {
						expectedEventSequence: 0,
						reason: "user",
						requestedAt: "2026-08-16T10:00:02.000Z",
					}),
				),
			/Run cancellation event sequence conflict/,
		);
		await runtime.cancel(
			createRunCancellationRequest(handle, {
				expectedEventSequence: 1,
				reason: "user",
				requestedAt: "2026-08-16T10:00:02.000Z",
			}),
		);
		const quiescence = await runtime.waitForQuiescence(handle);
		assert.equal(quiescence.finalEventSequence, 2);
		assert.deepEqual(
			runtime.readEvents(handle, 0).map((event) => event.kind),
			["process-started", "cancellation-requested"],
		);
	});

	it("terminates and erases the key when Run Process authentication fails", async () => {
		const processManager = new FakeRunProcessManager({invalidHandshake: true});
		const runtime = createRuntime(runtimeOptions(processManager));

		await assert.rejects(
			() => runtime.start(runRequest()),
			/Run Process handshake authentication failed/,
		);
		assert.equal(processManager.connection?.terminated, true);
		assert.equal(processManager.lastLaunchInput?.bootstrapKey.every((byte) => byte === 0), true);
	});

	it("runs one exact child through private key, command, and event file descriptors", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codewiki-run-process-"));
		try {
			const scriptPath = join(directory, "run-process.mjs");
			await writeFile(scriptPath, nodeRunProcessFixtureSource(), {mode: 0o700});
			const processManager = createNodeRunProcessManager({
				resolveArtifact: async (challenge) => ({
					runtimeBuildDigest: challenge.runtimeBuildDigest,
					runProtocolVersion: challenge.runProtocolVersion,
					executable: process.execPath,
					args: [scriptPath],
					cwd: directory,
				}),
				maxFrameBytes: 1_000_000,
				terminationGraceMs: 1_000,
			});
			const runtime = createRuntime(runtimeOptions(processManager));
			const handle = await runtime.start(runRequest());
			const quiescence = await runtime.waitForQuiescence(handle);

			assert.equal(quiescence.finalEventSequence, 1);
			assert.deepEqual(
				runtime.readEvents(handle).map((event) => event.kind),
				["accepted", "process-started"],
			);
		} finally {
			await rm(directory, {recursive: true, force: true});
		}
	});

	it("forces termination when shutdown cancellation cannot cross the process channel", async () => {
		const processManager = new FakeRunProcessManager({
			completeAfterStart: false,
			rejectCancellation: true,
		});
		const runtime = createRuntime(runtimeOptions(processManager));
		const handle = await runtime.start(runRequest());
		await until(() => runtime.readEvents(handle).length === 2);
		const completion = runtime.waitForQuiescence(handle);

		await runtime.shutdown();
		await assert.rejects(completion, /Fake Run Process rejected cancellation/);
		assert.equal(processManager.connection?.terminated, true);
		assert.equal(processManager.lastLaunchInput?.bootstrapKey.every((byte) => byte === 0), true);
	});
});

class FakeRunProcessManager {
	constructor(options) {
		this.options = options;
		this.lastLaunchInput = undefined;
		this.connection = undefined;
	}

	async launch(input) {
		this.lastLaunchInput = input;
		this.connection = new FakeRunProcessConnection(input, this.options);
		return this.connection;
	}
}

class FakeRunProcessConnection {
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
			return createRunProcessHandshakeResponse({
				challenge: this.challenge,
				handshake: {
					runProtocolId: RUN_PROTOCOL.id,
					runProtocolVersion: this.challenge.runProtocolVersion,
					runtimeBuildDigest: this.challenge.runtimeBuildDigest,
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
				reject(new Error("Fake Run Process receive aborted."));
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
		const opened = openRunProcessEnvelope({
			challenge: this.challenge,
			expectedDirection: "runtime-to-run-process",
			expectedSequence: this.txSequence,
			value: envelope,
			handle: this.handle,
			bootstrapKey: this.key,
		});
		this.txSequence += 1;
		if (opened.message.kind === "start") {
			this.handle = opened.message.handle;
			this.enqueueEvent("process-started", "2026-08-16T10:00:02.000Z");
			if (this.options.completeAfterStart) this.enqueueQuiescence();
			return;
		}
		if (opened.message.kind === "cancel") {
			if (this.options.rejectCancellation) {
				throw new Error("Fake Run Process rejected cancellation.");
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
		if (!this.exited) throw new Error("Fake Run Process has not exited.");
	}

	enqueueEvent(kind, occurredAt) {
		const event = createRunEvent(this.handle, {
			sequence: kind === "process-started" ? 1 : 2,
			kind,
			occurredAt,
			payloadDigest: sha256Digest(`event:${kind}`),
		});
		this.enqueue(
			sealRunProcessEnvelope({
				challenge: this.challenge,
				direction: "run-process-to-runtime",
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
		const quiescence = createRunQuiescence(this.handle, {
			finalEventSequence,
			quiescedAt: "2026-08-16T10:00:03.000Z",
			proofDigest: sha256Digest("quiescence"),
			rawLog: null,
		});
		this.enqueue(
			sealRunProcessEnvelope({
				challenge: this.challenge,
				direction: "run-process-to-runtime",
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

function nodeRunProcessFixtureSource() {
	const ports = pathToFileURL(resolve("src/runtime/contracts.ts")).href;
	const protocol = pathToFileURL(
		resolve("src/runtime/processes/protocol.ts"),
	).href;
	return `
import {createReadStream, createWriteStream, readFileSync} from "node:fs";
import {createInterface} from "node:readline";
import {
  createRunEvent,
  createRunQuiescence,
} from ${JSON.stringify(ports)};
import {
  createRunProcessHandshakeResponse,
  openRunProcessEnvelope,
  sealRunProcessEnvelope,
} from ${JSON.stringify(protocol)};

if (process.argv.length !== 2 || Object.keys(process.env).length !== 0) {
  throw new Error("Run Process received ambient argv or environment state.");
}
const bootstrapKey = new Uint8Array(readFileSync(3));
const commands = createInterface({
  input: createReadStream("", {fd: 4, autoClose: false}),
  crlfDelay: Infinity,
});
const events = createWriteStream("", {fd: 5, autoClose: false});
let challenge;
let handle;
let commandSequence = 0;
let runProcessSequence = 0;
for await (const line of commands) {
  const value = JSON.parse(line);
  if (!challenge) {
    challenge = value;
    await send(createRunProcessHandshakeResponse({
      challenge,
      handshake: {
        runProtocolId: challenge.runProtocolId,
        runProtocolVersion: challenge.runProtocolVersion,
        runtimeBuildDigest: challenge.runtimeBuildDigest,
      },
      bootstrapKey,
    }));
    continue;
  }
  const envelope = openRunProcessEnvelope({
    challenge,
    expectedDirection: "runtime-to-run-process",
    expectedSequence: commandSequence,
    value,
    handle,
    bootstrapKey,
  });
  commandSequence += 1;
  if (envelope.message.kind !== "start") continue;
  handle = envelope.message.handle;
  const event = createRunEvent(handle, {
    sequence: 1,
    kind: "process-started",
    occurredAt: "2026-08-16T10:00:02.000Z",
    payloadDigest: "sha256:" + "1".repeat(64),
  });
  await send(sealRunProcessEnvelope({
    challenge,
    direction: "run-process-to-runtime",
    sequence: runProcessSequence++,
    message: {kind: "event", event},
    handle,
    bootstrapKey,
  }));
  const quiescence = createRunQuiescence(handle, {
    finalEventSequence: 1,
    quiescedAt: "2026-08-16T10:00:03.000Z",
    proofDigest: "sha256:" + "2".repeat(64),
    rawLog: null,
  });
  await send(sealRunProcessEnvelope({
    challenge,
    direction: "run-process-to-runtime",
    sequence: runProcessSequence++,
    message: {kind: "quiescence", quiescence},
    handle,
    bootstrapKey,
  }));
}
bootstrapKey.fill(0);
events.end();

function send(value) {
  return new Promise((resolve, reject) => {
    events.write(JSON.stringify(value) + "\\n", (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
`;
}

function runtimeOptions(processManager) {
	let nowCalls = 0;
	return {
		processManager,
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

function runRequest() {
	const binding = activeRunProcessBinding();
	return createRunRequest({
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
		deadlineAt: DEADLINE,
	});
}

function activeRunProcessBinding() {
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
	return bindActiveRuntimeBuild(registry);
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
