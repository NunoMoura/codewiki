import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createPackSkillSetSnapshot,
	createPackSkillSnapshot,
} from "../../src/checks/packs/contracts.ts";
import {
	AGENT_RUNNER_PROTOCOL,
	EXECUTION_CAPABILITY_NAMES,
	activateRunnerBundle,
	assertProducerSkillReceipt,
	bindActiveRunnerBundle,
	bindProducerSkills,
	createQualifiedRunnerBundle,
	createRunnerBundleManifest,
	createRunnerBundleRegistrySnapshot,
	qualifyRunnerBundle,
	resolveExecutionCapabilities,
	resolveRunnerBundleForResume,
} from "../../src/execution/ports.ts";
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

	it("binds qualification evidence to one content-addressed Runner Bundle", () => {
		const manifest = runnerManifest("a".repeat(40), "0.1.0-rc.5");
		const qualified = createQualifiedRunnerBundle({
			manifest,
			qualificationSuiteDigest: sha256Digest("suite-v1"),
			qualificationEvidenceDigest: sha256Digest("conformance-and-restart"),
			qualifiedAt: "2026-08-16T10:00:00.000Z",
		});
		assert.equal(qualified.bundleDigest, canonicalJsonDigest(manifest));
		assert.equal(
			qualified.qualificationEvidenceDigest,
			sha256Digest("conformance-and-restart"),
		);
		assert.notEqual(
			qualified.bundleDigest,
			canonicalJsonDigest(runnerManifest("a".repeat(40), "0.1.0-rc.6")),
		);
		assert.equal(Object.isFrozen(qualified), true);
		assert.equal(Object.isFrozen(qualified.manifest), true);
	});

	it("activates only qualified bundles through expected-generation CAS", () => {
		const qualified = createQualifiedRunnerBundle({
			manifest: runnerManifest("a".repeat(40), "0.1.0-rc.5"),
			qualificationSuiteDigest: sha256Digest("suite-v1"),
			qualificationEvidenceDigest: sha256Digest("evidence"),
			qualifiedAt: "2026-08-16T10:00:00.000Z",
		});
		const initial = createRunnerBundleRegistrySnapshot({
			generatedAt: "2026-08-16T09:00:00.000Z",
		});
		const admitted = qualifyRunnerBundle({
			registry: initial,
			expectedGeneration: 0,
			bundle: qualified,
			generatedAt: "2026-08-16T10:01:00.000Z",
		});
		const active = activateRunnerBundle({
			registry: admitted,
			expectedGeneration: 1,
			bundleDigest: qualified.bundleDigest,
			generatedAt: "2026-08-16T10:02:00.000Z",
		});
		assert.equal(active.generation, 2);
		assert.equal(active.activeBundleDigest, qualified.bundleDigest);
		assert.deepEqual(bindActiveRunnerBundle(active), {
			bundleDigest: qualified.bundleDigest,
			runnerProtocolVersion: AGENT_RUNNER_PROTOCOL.version,
		});
		assert.throws(
			() =>
				activateRunnerBundle({
					registry: admitted,
					expectedGeneration: 0,
					bundleDigest: qualified.bundleDigest,
					generatedAt: "2026-08-16T10:02:00.000Z",
				}),
			/Runner Bundle registry generation conflict/,
		);
		assert.throws(
			() =>
				activateRunnerBundle({
					registry: initial,
					expectedGeneration: 0,
					bundleDigest: qualified.bundleDigest,
					generatedAt: "2026-08-16T10:02:00.000Z",
				}),
			/is not qualified/,
		);
	});

	it("resumes only the exact bound bundle while allowing explicit rollback", () => {
		const first = qualifiedRunnerBundle("a".repeat(40), "0.1.0-rc.5", "first");
		const second = qualifiedRunnerBundle("b".repeat(40), "0.1.0-rc.6", "second");
		let registry = createRunnerBundleRegistrySnapshot({
			generatedAt: "2026-08-16T09:00:00.000Z",
		});
		registry = qualifyRunnerBundle({
			registry,
			expectedGeneration: 0,
			bundle: first,
			generatedAt: "2026-08-16T10:00:00.000Z",
		});
		registry = activateRunnerBundle({
			registry,
			expectedGeneration: 1,
			bundleDigest: first.bundleDigest,
			generatedAt: "2026-08-16T10:01:00.000Z",
		});
		const firstRunBinding = bindActiveRunnerBundle(registry);
		registry = qualifyRunnerBundle({
			registry,
			expectedGeneration: 2,
			bundle: second,
			generatedAt: "2026-08-16T11:00:00.000Z",
		});
		registry = activateRunnerBundle({
			registry,
			expectedGeneration: 3,
			bundleDigest: second.bundleDigest,
			generatedAt: "2026-08-16T11:01:00.000Z",
		});

		assert.equal(bindActiveRunnerBundle(registry).bundleDigest, second.bundleDigest);
		assert.equal(
			resolveRunnerBundleForResume(registry, firstRunBinding).bundleDigest,
			first.bundleDigest,
		);
		assert.throws(
			() =>
				resolveRunnerBundleForResume(registry, {
					...firstRunBinding,
					bundleDigest: sha256Digest("unknown"),
				}),
			/Exact Runner Bundle required for resume is unavailable/,
		);
		assert.throws(
			() =>
				resolveRunnerBundleForResume(registry, {
					...firstRunBinding,
					runnerProtocolVersion: "2.0.0",
				}),
			/Runner protocol version does not match the bound bundle/,
		);

		registry = activateRunnerBundle({
			registry,
			expectedGeneration: 4,
			bundleDigest: first.bundleDigest,
			generatedAt: "2026-08-16T12:00:00.000Z",
		});
		assert.equal(bindActiveRunnerBundle(registry).bundleDigest, first.bundleDigest);
	});
});

function runnerManifest(dshSourceCommit, dshVersion) {
	return createRunnerBundleManifest({
		schemaVersion: "1.0.0",
		runnerProtocolVersion: AGENT_RUNNER_PROTOCOL.version,
		nodeVersion: "26.1.0",
		dshSourceCommit,
		dshPackageClosureDigest: sha256Digest(`dsh:${dshVersion}`),
		cordisClosureDigest: sha256Digest("cordis:4.0.0-rc.7"),
		backendPluginClosureDigest: sha256Digest("backend-plugins:v1"),
		modelAdapterClosureDigest: sha256Digest("model-adapters:v1"),
		delegateAdapterClosureDigest: sha256Digest("delegate-adapters:v1"),
		runnerArtifactDigest: sha256Digest(`artifact:${dshVersion}`),
	});
}

function qualifiedRunnerBundle(dshSourceCommit, dshVersion, evidence) {
	return createQualifiedRunnerBundle({
		manifest: runnerManifest(dshSourceCommit, dshVersion),
		qualificationSuiteDigest: sha256Digest("suite-v1"),
		qualificationEvidenceDigest: sha256Digest(evidence),
		qualifiedAt: "2026-08-16T10:00:00.000Z",
	});
}
