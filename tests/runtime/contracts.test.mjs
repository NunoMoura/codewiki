import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createPackSkillSetSnapshot,
	createPackSkillSnapshot,
} from "../../src/checks/packs/contracts.ts";
import {
	RUN_PROTOCOL,
	RUN_RECEIPT_SCHEMA_VERSION,
	RUN_REQUEST_SCHEMA_VERSION,
	EXECUTION_CAPABILITY_NAMES,
	activateRuntimeBuild,
	admitRunProcessHandshake,
	assertProducerSkillReceipt,
	bindActiveRuntimeBuild,
	bindProducerSkills,
	createRunCancellationRequest,
	createRunEvent,
	createRunReceipt,
	createRunHandle,
	createRunQuiescence,
	createRunRawLogReference,
	createRunRequest,
	createQualifiedRuntimeBuild,
	createRuntimeBuildManifest,
	createRuntimeBuildRegistrySnapshot,
	qualifyRuntimeBuild,
	resolveExecutionCapabilities,
	resolveRuntimeBuildForResume,
} from "../../src/runtime/contracts.ts";
import {
	canonicalJsonDigest,
	sha256Digest,
} from "../../src/utils/canonical-json.ts";

describe("execution ports", () => {
	it("keeps one closed capability vocabulary", () => {
		assert.deepEqual(EXECUTION_CAPABILITY_NAMES, [
			"candidate_production",
			"model_evaluation",
			"worker_execution",
			"cancellation",
			"usage_reporting",
			"structured_output",
			"repository_read",
			"workbench_mutation",
			"session_isolation",
		]);
	});

	it("binds immutable exact Pack Skill digests without granting capabilities", () => {
		const markdown = Buffer.from(
			"---\nname: decision-guide\ndescription: Guide Decision work.\nallowed-tools: Bash Write\n---\nFollow project guidance.\n",
		);
		const skill = createPackSkillSnapshot({
			stage: "decision",
			packId: "standards",
			name: "decision-guide",
			description: "Guide Decision work.",
			allowedTools: "Bash Write",
			files: [
				{
					path: "SKILL.md",
					executable: false,
					byteLength: markdown.byteLength,
					digest: sha256Digest(markdown),
					contentBase64: markdown.toString("base64"),
				},
			],
		});
		const binding = bindProducerSkills(
			createPackSkillSetSnapshot({stage: "decision", skills: [skill]}),
			"decision",
		);
		assert.deepEqual(binding.receipt.skills, [
			{
				packId: "standards",
				name: "decision-guide",
				skillDigest: skill.skillDigest,
			},
		]);
		assert.equal(Object.isFrozen(binding), true);
		assert.equal(Object.isFrozen(binding.receipt.skills), true);
		assertProducerSkillReceipt(binding.receipt, binding.receipt);
		assert.throws(
			() =>
				assertProducerSkillReceipt(
					{...binding.receipt, skillSetDigest: sha256Digest("tampered")},
					binding.receipt,
				),
			/does not match its execution binding/,
		);
		assert.throws(
			() => bindProducerSkills(binding.snapshot, "planning"),
			/stage decision does not match planning/,
		);
	});

	it("marks undeclared capabilities unavailable instead of relaxing policy", () => {
		const profile = resolveExecutionCapabilities({
			candidate_production: "available",
			session_isolation: {
				capability: "session_isolation",
				status: "indeterminate",
				reason: "sealed calibration is unavailable",
			},
		});
		assert.equal(profile.length, EXECUTION_CAPABILITY_NAMES.length);
		assert.deepEqual(profile[0], {
			capability: "candidate_production",
			status: "available",
		});
		assert.deepEqual(profile.at(-1), {
			capability: "session_isolation",
			status: "indeterminate",
			reason: "sealed calibration is unavailable",
		});
		assert.deepEqual(profile[1], {
			capability: "model_evaluation",
			status: "unavailable",
			reason: "capability_not_declared",
		});
		assert.equal(Object.isFrozen(profile), true);
	});

	it("rejects unknown, mismatched, and unexplained unavailable declarations", () => {
		assert.throws(
			() => resolveExecutionCapabilities({ arbitrary_execution: "available" }),
			/Unsupported execution capability: arbitrary_execution\./,
		);
		assert.throws(
			() =>
				resolveExecutionCapabilities({
					model_evaluation: {
						capability: "candidate_production",
						status: "available",
					},
				}),
			/Execution capability declaration key model_evaluation does not match candidate_production\./,
		);
		assert.throws(
			() =>
				resolveExecutionCapabilities({
					cancellation: {
						capability: "cancellation",
						status: "unavailable",
					},
				}),
			/Execution capability cancellation requires a reason when unavailable\./,
		);
	});

	it("binds qualification evidence to one content-addressed Runtime Build", () => {
		const manifest = runnerManifest("a".repeat(40), "0.1.0-rc.5");
		const qualified = createQualifiedRuntimeBuild({
			manifest,
			qualificationSuiteDigest: sha256Digest("suite-v1"),
			qualificationEvidenceDigest: sha256Digest("conformance-and-restart"),
			qualifiedAt: "2026-08-16T10:00:00.000Z",
		});
		assert.equal(qualified.buildDigest, canonicalJsonDigest(manifest));
		assert.equal(
			qualified.qualificationEvidenceDigest,
			sha256Digest("conformance-and-restart"),
		);
		assert.notEqual(
			qualified.buildDigest,
			canonicalJsonDigest(runnerManifest("a".repeat(40), "0.1.0-rc.6")),
		);
		assert.equal(Object.isFrozen(qualified), true);
		assert.equal(Object.isFrozen(qualified.manifest), true);
	});

	it("activates only qualified builds through expected-generation CAS", () => {
		const qualified = createQualifiedRuntimeBuild({
			manifest: runnerManifest("a".repeat(40), "0.1.0-rc.5"),
			qualificationSuiteDigest: sha256Digest("suite-v1"),
			qualificationEvidenceDigest: sha256Digest("evidence"),
			qualifiedAt: "2026-08-16T10:00:00.000Z",
		});
		const initial = createRuntimeBuildRegistrySnapshot({
			generatedAt: "2026-08-16T09:00:00.000Z",
		});
		const admitted = qualifyRuntimeBuild({
			registry: initial,
			expectedGeneration: 0,
			build: qualified,
			generatedAt: "2026-08-16T10:01:00.000Z",
		});
		const active = activateRuntimeBuild({
			registry: admitted,
			expectedGeneration: 1,
			buildDigest: qualified.buildDigest,
			generatedAt: "2026-08-16T10:02:00.000Z",
		});
		assert.equal(active.generation, 2);
		assert.equal(active.activeBuildDigest, qualified.buildDigest);
		assert.deepEqual(bindActiveRuntimeBuild(active), {
			buildDigest: qualified.buildDigest,
			runProtocolVersion: RUN_PROTOCOL.version,
		});
		assert.throws(
			() =>
				activateRuntimeBuild({
					registry: admitted,
					expectedGeneration: 0,
					buildDigest: qualified.buildDigest,
					generatedAt: "2026-08-16T10:02:00.000Z",
				}),
			/Runtime Build registry generation conflict/,
		);
		assert.throws(
			() =>
				activateRuntimeBuild({
					registry: initial,
					expectedGeneration: 0,
					buildDigest: qualified.buildDigest,
					generatedAt: "2026-08-16T10:02:00.000Z",
				}),
			/is not qualified/,
		);
	});

	it("admits only a Run Process serving the exact bound build and protocol", () => {
		const build = qualifiedRuntimeBuild(
			"a".repeat(40),
			"0.1.0-rc.6",
			"evidence",
		);
		const binding = {
			buildDigest: build.buildDigest,
			runProtocolVersion: RUN_PROTOCOL.version,
		};
		assert.deepEqual(
			admitRunProcessHandshake(binding, {
				runProtocolId: RUN_PROTOCOL.id,
				runProtocolVersion: RUN_PROTOCOL.version,
				runtimeBuildDigest: build.buildDigest,
			}),
			{
				runProtocolId: RUN_PROTOCOL.id,
				runProtocolVersion: RUN_PROTOCOL.version,
				runtimeBuildDigest: build.buildDigest,
			},
		);
		assert.throws(
			() =>
				admitRunProcessHandshake(binding, {
					runProtocolId: RUN_PROTOCOL.id,
					runProtocolVersion: RUN_PROTOCOL.version,
					runtimeBuildDigest: sha256Digest("stale-runner"),
				}),
			/Run Process build does not match the bound Runtime Build/,
		);
		assert.throws(
			() =>
				admitRunProcessHandshake(binding, {
					runProtocolId: RUN_PROTOCOL.id,
					runProtocolVersion: "2.0.0",
					runtimeBuildDigest: build.buildDigest,
				}),
			/Run Process protocol does not match the bound Run protocol/,
		);
	});

	it("binds one immutable backend Run to exact inputs and Runtime Build", () => {
		const build = qualifiedRuntimeBuild(
			"a".repeat(40),
			"0.1.0-rc.6",
			"evidence",
		);
		const spec = runRequest(build.buildDigest);
		const {requestDigest, ...digestBody} = spec;
		assert.equal(spec.schemaVersion, RUN_REQUEST_SCHEMA_VERSION);
		assert.equal(requestDigest, canonicalJsonDigest(digestBody));
		assert.equal(Object.isFrozen(spec), true);
		assert.equal(Object.isFrozen(spec.inputs), true);
		assert.notEqual(
			requestDigest,
			runRequest(build.buildDigest, {
				promptDigest: sha256Digest("changed-prompt"),
			}).requestDigest,
		);
	});

	it("fails closed on role, tool, Workbench, and resume binding drift", () => {
		const build = qualifiedRuntimeBuild(
			"a".repeat(40),
			"0.1.0-rc.6",
			"evidence",
		);
		assert.throws(
			() =>
				runRequest(build.buildDigest, {
					role: "model-check",
					stage: "review",
					producerSkillSetDigest: sha256Digest("forbidden-skill"),
				}),
			/Model Check Runs cannot receive producer Skills or tools/,
		);
		assert.throws(
			() =>
				runRequest(build.buildDigest, {
					role: "implementation-worker",
					stage: "implementation",
				}),
			/Implementation Worker Runs require Project Server Workbench custody/,
		);

		const rawLog = createRunRawLogReference({
			encoding: "jsonl",
			formatVersion: 0,
			sessionId: "session-001",
			storageId: "runner-log-001",
			byteLength: 2048,
			digest: sha256Digest("raw-log"),
			runtimeBuildDigest: build.buildDigest,
		});
		assert.throws(
			() =>
				runRequest(build.buildDigest, {
					session: {
						mode: "resume",
						sessionId: "different-session",
						resumeLog: rawLog,
					},
				}),
			/Resume log session does not match the Run session/,
		);
		assert.throws(
			() =>
				runRequest(sha256Digest("different-build"), {
					session: {
						mode: "resume",
						sessionId: "session-001",
						resumeLog: rawLog,
					},
				}),
			/Resume log Runtime Build does not match the Run binding/,
		);
	});

	it("binds handle, events, cancellation, and quiescence to one exact Run Request", () => {
		const build = qualifiedRuntimeBuild(
			"a".repeat(40),
			"0.1.0-rc.6",
			"evidence",
		);
		const spec = runRequest(build.buildDigest);
		const handle = createRunHandle(spec, "2026-08-16T10:00:01.000Z");
		const event = createRunEvent(handle, {
			sequence: 0,
			kind: "accepted",
			occurredAt: "2026-08-16T10:00:01.000Z",
			payloadDigest: sha256Digest("accepted-event"),
		});
		const cancellation = createRunCancellationRequest(handle, {
			expectedEventSequence: 0,
			reason: "user",
			requestedAt: "2026-08-16T10:00:02.000Z",
		});
		const rawLog = runRawLog(build.buildDigest);
		const quiescence = createRunQuiescence(handle, {
			finalEventSequence: 3,
			quiescedAt: "2026-08-16T10:00:03.000Z",
			proofDigest: sha256Digest("quiescence-proof"),
			rawLog,
		});

		assert.equal(handle.requestDigest, spec.requestDigest);
		assert.equal(event.runId, spec.runId);
		assert.equal(cancellation.expectedEventSequence, 0);
		assert.equal(quiescence.rawLog?.digest, rawLog.digest);
		assert.equal(Object.isFrozen(quiescence), true);
		assert.throws(
			() =>
				createRunEvent(handle, {
					sequence: 1,
					kind: "unknown",
					occurredAt: "2026-08-16T10:00:02.000Z",
					payloadDigest: sha256Digest("unknown-event"),
				}),
			/Run event kind is invalid/,
		);
	});

	it("records complete backend-owned and honestly limited delegated receipts", () => {
		const build = qualifiedRuntimeBuild(
			"a".repeat(40),
			"0.1.0-rc.6",
			"evidence",
		);
		const ownedSpec = runRequest(build.buildDigest);
		const ownedHandle = createRunHandle(
			ownedSpec,
			"2026-08-16T10:00:01.000Z",
		);
		const owned = createRunReceipt({
			handle: ownedHandle,
			outcome: "completed",
			finalEventSequence: 4,
			startedAt: "2026-08-16T10:00:01.000Z",
			finishedAt: "2026-08-16T10:00:04.000Z",
			executionLedgerDigest: sha256Digest("ledger"),
			rawLog: runRawLog(build.buildDigest),
			outputDigest: sha256Digest("output"),
			usageDigest: sha256Digest("usage"),
			cancellationDigest: null,
			quiescenceDigest: sha256Digest("quiescence"),
			custodyGaps: [],
			operationalGaps: [],
		});
		const {receiptDigest, ...receiptBody} = owned;
		assert.equal(owned.schemaVersion, RUN_RECEIPT_SCHEMA_VERSION);
		assert.equal(receiptDigest, canonicalJsonDigest(receiptBody));

		const delegatedSpec = runRequest(build.buildDigest, {
			custody: "backend-delegated",
		});
		const delegated = createRunReceipt({
			handle: createRunHandle(
				delegatedSpec,
				"2026-08-16T10:00:01.000Z",
			),
			outcome: "completed",
			finalEventSequence: 4,
			startedAt: "2026-08-16T10:00:01.000Z",
			finishedAt: "2026-08-16T10:00:04.000Z",
			executionLedgerDigest: sha256Digest("delegate-ledger"),
			rawLog: runRawLog(build.buildDigest),
			outputDigest: sha256Digest("delegate-output"),
			usageDigest: null,
			cancellationDigest: null,
			quiescenceDigest: sha256Digest("delegate-quiescence"),
			custodyGaps: ["delegate-usage", "delegate-tools"],
			operationalGaps: [],
		});
		assert.deepEqual(delegated.custodyGaps, ["delegate-tools", "delegate-usage"]);

		assert.throws(
			() =>
				createRunReceipt(
					runReceiptInput(ownedHandle, build.buildDigest, {
						executionLedgerDigest: null,
						operationalGaps: ["execution-ledger-incomplete"],
					}),
				),
			/Operationally incomplete Runs must be stopped/,
		);
		assert.throws(
			() =>
				createRunReceipt(
					runReceiptInput(ownedHandle, build.buildDigest, {
						custodyGaps: ["delegate-trace"],
					}),
				),
			/Backend-owned Run Receipts cannot declare delegated custody gaps/,
		);
	});

	it("resumes only the exact bound build while allowing explicit rollback", () => {
		const first = qualifiedRuntimeBuild("a".repeat(40), "0.1.0-rc.5", "first");
		const second = qualifiedRuntimeBuild("b".repeat(40), "0.1.0-rc.6", "second");
		let registry = createRuntimeBuildRegistrySnapshot({
			generatedAt: "2026-08-16T09:00:00.000Z",
		});
		registry = qualifyRuntimeBuild({
			registry,
			expectedGeneration: 0,
			build: first,
			generatedAt: "2026-08-16T10:00:00.000Z",
		});
		registry = activateRuntimeBuild({
			registry,
			expectedGeneration: 1,
			buildDigest: first.buildDigest,
			generatedAt: "2026-08-16T10:01:00.000Z",
		});
		const firstRunBinding = bindActiveRuntimeBuild(registry);
		registry = qualifyRuntimeBuild({
			registry,
			expectedGeneration: 2,
			build: second,
			generatedAt: "2026-08-16T11:00:00.000Z",
		});
		registry = activateRuntimeBuild({
			registry,
			expectedGeneration: 3,
			buildDigest: second.buildDigest,
			generatedAt: "2026-08-16T11:01:00.000Z",
		});

		assert.equal(bindActiveRuntimeBuild(registry).buildDigest, second.buildDigest);
		assert.equal(
			resolveRuntimeBuildForResume(registry, firstRunBinding).buildDigest,
			first.buildDigest,
		);
		assert.throws(
			() =>
				resolveRuntimeBuildForResume(registry, {
					...firstRunBinding,
					buildDigest: sha256Digest("unknown"),
				}),
			/Exact Runtime Build required for resume is unavailable/,
		);
		assert.throws(
			() =>
				resolveRuntimeBuildForResume(registry, {
					...firstRunBinding,
					runProtocolVersion: "2.0.0",
				}),
			/Run protocol version does not match the bound build/,
		);

		registry = activateRuntimeBuild({
			registry,
			expectedGeneration: 4,
			buildDigest: first.buildDigest,
			generatedAt: "2026-08-16T12:00:00.000Z",
		});
		assert.equal(bindActiveRuntimeBuild(registry).buildDigest, first.buildDigest);
	});
});

function runRequest(buildDigest, overrides = {}) {
	const provider = "deepseek";
	const model = "deepseek-v4-flash";
	const optionsDigest = sha256Digest("route-options");
	const role = overrides.role || "decision-producer";
	const stage = overrides.stage || "decision";
	const workspace =
		overrides.workspace ||
		({
			kind: "immutable",
			repositorySnapshotDigest: sha256Digest("repository"),
		});
	return createRunRequest({
		runId: "run-001",
		operationId: "operation-001",
		custody: overrides.custody || "backend-owned",
		role,
		stage,
		subject: {
			id: "change-001",
			digest: sha256Digest("subject"),
		},
		runtimeBuild: {
			buildDigest,
			runProtocolVersion: RUN_PROTOCOL.version,
		},
		session:
			overrides.session ||
			({mode: "create", sessionId: "session-001", resumeLog: null}),
		inputs: {
			stageContextDigest: sha256Digest("stage-context"),
			staticInputManifestDigest: sha256Digest("static-inputs"),
			systemPromptDigest: sha256Digest("system-prompt"),
			promptDigest: overrides.promptDigest || sha256Digest("prompt"),
			producerSkillSetDigest:
				overrides.producerSkillSetDigest === undefined
					? null
					: overrides.producerSkillSetDigest,
			toolMode: role === "model-check" ? "none" : "admitted",
			toolSetDigest: sha256Digest(role === "model-check" ? "no-tools" : "tools"),
			modelRoute: {
				provider,
				model,
				optionsDigest,
				routeDigest: canonicalJsonDigest({provider, model, optionsDigest}),
			},
		},
		workspace,
		budget: {
			timeoutMs: 60_000,
			maxModelRequests: 8,
			maxToolCalls: role === "model-check" ? 0 : 16,
			maxInputTokens: 64_000,
			maxOutputTokens: 8_000,
		},
		createdAt: "2026-08-16T10:00:00.000Z",
		deadlineAt: "2026-08-16T10:01:00.000Z",
	});
}

function runRawLog(runtimeBuildDigest) {
	return createRunRawLogReference({
		encoding: "jsonl",
		formatVersion: 0,
		sessionId: "session-001",
		storageId: "runner-log-001",
		byteLength: 2048,
		digest: sha256Digest("raw-log"),
		runtimeBuildDigest,
	});
}

function runReceiptInput(handle, runtimeBuildDigest, overrides = {}) {
	return {
		handle,
		outcome: overrides.outcome || "completed",
		finalEventSequence: 4,
		startedAt: "2026-08-16T10:00:01.000Z",
		finishedAt: "2026-08-16T10:00:04.000Z",
		executionLedgerDigest:
			overrides.executionLedgerDigest === undefined
				? sha256Digest("ledger")
				: overrides.executionLedgerDigest,
		rawLog: runRawLog(runtimeBuildDigest),
		outputDigest: sha256Digest("output"),
		usageDigest: sha256Digest("usage"),
		cancellationDigest: null,
		quiescenceDigest: sha256Digest("quiescence"),
		custodyGaps: overrides.custodyGaps || [],
		operationalGaps: overrides.operationalGaps || [],
	};
}

function runnerManifest(dshSourceCommit, dshVersion) {
	return createRuntimeBuildManifest({
		schemaVersion: "1.0.0",
		runProtocolVersion: RUN_PROTOCOL.version,
		nodeVersion: "26.1.0",
		dshSourceCommit,
		dshPackageClosureDigest: sha256Digest(`dsh:${dshVersion}`),
		cordisClosureDigest: sha256Digest("cordis:4.0.0-rc.7"),
		runtimePluginClosureDigest: sha256Digest("backend-plugins:v1"),
		modelAdapterClosureDigest: sha256Digest("model-adapters:v1"),
		delegateAdapterClosureDigest: sha256Digest("delegate-adapters:v1"),
		runtimeArtifactDigest: sha256Digest(`artifact:${dshVersion}`),
	});
}

function qualifiedRuntimeBuild(dshSourceCommit, dshVersion, evidence) {
	return createQualifiedRuntimeBuild({
		manifest: runnerManifest(dshSourceCommit, dshVersion),
		qualificationSuiteDigest: sha256Digest("suite-v1"),
		qualificationEvidenceDigest: sha256Digest(evidence),
		qualifiedAt: "2026-08-16T10:00:00.000Z",
	});
}
