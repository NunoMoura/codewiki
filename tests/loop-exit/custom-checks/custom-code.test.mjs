import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {materializeEvidenceRecord} from "../../../src/evidence/materialize.ts";
import {reduceEvidenceObligation} from "../../../src/evidence/obligations.ts";
import {createCheckCatalog} from "../../../src/loop-exit/catalog.ts";
import {
	activateCustomCheckDefinition,
	assertCustomCodeCapabilitySnapshot,
	assertCustomCodeTemplateCapability,
	createCustomCodeCapabilitySnapshot,
	createCustomCodeCheckExecutors,
	createCustomCheckDefinition,
	createProtectedCustomCheckConfigSnapshot,
	createResourceUsageEvidenceMaterial,
	customCheckDefinitionCheckId,
	evaluateRuntimeResourceMeter,
	listCustomCodeTemplates,
	normalizeCustomCodeTemplateBinding,
	preflightRuntimeResourceGuards,
	resolveRuntimeResourceGuards,
} from "../../../src/loop-exit/custom-checks/index.ts";
import {resolveExitPolicy} from "../../../src/loop-exit/resolve-policy.ts";
import {createCheckResult} from "../../../src/loop-exit/results.ts";
import {createLoopExitRuntime} from "../../../src/runtime/loop-exit-runtime.ts";
import {canonicalJsonDigest} from "../../../src/utils/canonical-json.ts";
import {
	createTestUserStandard,
	standardRefsFor,
} from "./user-standard-fixture.mjs";

const CANDIDATE_DIGEST = `sha256:${"a".repeat(64)}`;
const CHANGE_DIGEST = `sha256:${"b".repeat(64)}`;
const ENVIRONMENT_DIGEST = `sha256:${"c".repeat(64)}`;
const METER_CONFIG_DIGEST = `sha256:${"d".repeat(64)}`;

function capabilitySnapshot(overrides = {}) {
	return createCustomCodeCapabilitySnapshot({
		observedAt: "2026-08-05T12:00:00.000Z",
		environmentDigest: ENVIRONMENT_DIGEST,
		capabilities: [
			{
				id: "codewiki.model-usage-meter",
				version: "1.0.0",
				configurationDigest: METER_CONFIG_DIGEST,
				metrics: ["model_tokens", "cost_usd", "latency_ms"],
				scopes: ["decision_attempt"],
				enforcement: ["preflight", "meter", "cancellation"],
				...overrides,
			},
		],
	});
}

function fixture() {
	const standard = createTestUserStandard({
		name: "Decision resource policy",
		passage: "Each Decision attempt uses no more than 1000 model tokens.",
	});
	const draft = createCustomCheckDefinition(
		{
			checkTypeId: "organization_policy",
			evaluator: "code",
			name: "Decision model token limit",
			requirement: "Each Decision attempt uses no more than 1000 model tokens.",
			repairGuidance: "Reduce request context or use protected review to revise the limit.",
			appliesWhen: {loops: ["decision"]},
			standardRefs: standardRefsFor(standard),
			codeTemplate: {
				templateId: "resource_usage_limit",
				parameters: {
					metric: "model_tokens",
					scope: "decision_attempt",
					maximum: 1_000,
				},
			},
		},
		[standard],
	);
	const snapshot = capabilitySnapshot();
	const definition = activateCustomCheckDefinition(draft, [standard], snapshot);
	const protectedConfig = createProtectedCustomCheckConfigSnapshot({
		protectedSourceHead: "f".repeat(40),
		projectConfigDigest: canonicalJsonDigest({project: "custom-code-test"}),
		userStandards: [standard],
		triagePreferences: [],
		customChecks: [definition],
	});
	return {standard, draft, definition, snapshot, protectedConfig};
}

function selectorInput(protectedConfig) {
	return {
		loop: "decision",
		candidateDigest: CANDIDATE_DIGEST,
		changes: [
			{
				changeId: "CHG-custom-code",
				revision: 1,
				digest: CHANGE_DIGEST,
				kind: "improve",
				type: "architecture_change",
				risk: "low",
				affectedLayers: ["source"],
			},
		],
		projectTraits: [],
		technologies: [],
		paths: ["src/runtime/loop-exit-runtime.ts"],
		protectedBaseCustomCheckConfig: protectedConfig,
	};
}

function evidenceRecord(
	guard,
	snapshot,
	value,
	candidateDigest = CANDIDATE_DIGEST,
) {
	return materializeEvidenceRecord(
		createResourceUsageEvidenceMaterial({guard, capabilitySnapshot: snapshot, value}),
		{
			subject: {
				changeRefs: ["CHG-custom-code@1"],
				changeRevisionDigests: [CHANGE_DIGEST],
				candidateDigest,
				acceptanceRequirementIds: [],
			},
			observedAt: "2026-08-05T12:01:00.000Z",
			producer: {
				kind: "runtime",
				id: "codewiki.model-usage-meter",
				version: "1.0.0",
			},
			authority: "observed",
			coverage: "complete",
			freshnessBoundary: "decision-attempt:1",
			sensitivity: "project",
		},
	);
}

describe("approved-template Custom Code Checks", () => {
	it("normalizes one closed template and rejects unsafe or tampered parameters", () => {
		assert.deepEqual(listCustomCodeTemplates(), [
			{
				id: "resource_usage_limit",
				version: "1.0.0",
				evaluator: "code",
				allowedCheckTypeIds: [
					"implementation_quality",
					"delivery_and_release",
					"organization_policy",
				],
				metrics: [
					"model_tokens",
					"cost_usd",
					"latency_ms",
					"changed_files",
					"trace_bytes",
				],
				scopes: [
					"decision_attempt",
					"planning_attempt",
					"implementation_assignment",
					"implementation_attempt",
				],
				parameterNames: ["metric", "scope", "maximum"],
			},
		]);
		for (const [metric, unit, requiredCapabilityId] of [
			["model_tokens", "tokens", "codewiki.model-usage-meter"],
			["cost_usd", "usd", "codewiki.model-usage-meter"],
			["latency_ms", "milliseconds", "codewiki.model-usage-meter"],
			["changed_files", "files", "codewiki.git-change-meter"],
			["trace_bytes", "bytes", "codewiki.trace-size-meter"],
		]) {
			const metricBinding = normalizeCustomCodeTemplateBinding({
				value: {
					templateId: "resource_usage_limit",
					parameters: {metric, scope: "decision_attempt", maximum: 100},
				},
				checkTypeId: "organization_policy",
				applicabilityLoops: ["decision"],
			});
			assert.equal(metricBinding.unit, unit);
			assert.equal(metricBinding.requiredCapabilityId, requiredCapabilityId);
		}
		for (const [scope, loop] of [
			["decision_attempt", "decision"],
			["planning_attempt", "planning"],
			["implementation_assignment", "implementation"],
			["implementation_attempt", "implementation"],
		]) {
			assert.equal(
				normalizeCustomCodeTemplateBinding({
					value: {
						templateId: "resource_usage_limit",
						parameters: {metric: "model_tokens", scope, maximum: 100},
					},
					checkTypeId: "organization_policy",
					applicabilityLoops: [loop],
				}).parameters.scope,
				scope,
			);
		}
		const binding = normalizeCustomCodeTemplateBinding({
			value: {
				templateId: "resource_usage_limit",
				parameters: {
					metric: "changed_files",
					scope: "implementation_attempt",
					maximum: 12,
				},
			},
			checkTypeId: "organization_policy",
			applicabilityLoops: ["implementation"],
		});
		assert.equal(binding.unit, "files");
		assert.equal(binding.accountingWindow, "one integrated Implementation attempt");
		assert.equal(binding.requiredCapabilityId, "codewiki.git-change-meter");
		assert.match(binding.bindingDigest, /^sha256:[0-9a-f]{64}$/);
		assert.throws(
			() =>
				normalizeCustomCodeTemplateBinding({
					value: {
						...binding,
						bindingDigest: `sha256:${"e".repeat(64)}`,
					},
					checkTypeId: "organization_policy",
					applicabilityLoops: ["implementation"],
					allowRuntimeFields: true,
				}),
			/bindingDigest does not match/,
		);
		assert.throws(
			() =>
				normalizeCustomCodeTemplateBinding({
					value: {
						templateId: "resource_usage_limit",
						parameters: {
							metric: "changed_files",
							scope: "implementation_attempt",
							maximum: 1.5,
						},
					},
					checkTypeId: "organization_policy",
					applicabilityLoops: ["implementation"],
				}),
			/maximum is invalid/,
		);
		assert.throws(
			() =>
				normalizeCustomCodeTemplateBinding({
					value: {
						templateId: "resource_usage_limit",
						parameters: {
							metric: "model_tokens",
							scope: "decision_attempt",
							maximum: 100,
							extra: "node --test",
						},
					},
					checkTypeId: "organization_policy",
					applicabilityLoops: ["decision"],
				}),
			/unsupported field extra/,
		);
		assert.throws(
			() =>
				normalizeCustomCodeTemplateBinding({
					value: {
						templateId: "resource_usage_limit",
						parameters: {
							metric: "model_tokens",
							scope: "decision_attempt",
							maximum: 100,
						},
					},
					checkTypeId: "organization_policy",
					applicabilityLoops: ["planning"],
				}),
			/requires appliesWhen.loops decision/,
		);
	});

	it("binds activation, Catalog execution, policy, and Runtime guards to exact capability", () => {
		const {standard, draft, definition, snapshot, protectedConfig} = fixture();
		assert.throws(
			() => activateCustomCheckDefinition(draft, [standard]),
			/requires an executor capability snapshot before activation/,
		);
		assert.throws(
			() =>
				activateCustomCheckDefinition(
					draft,
					[standard],
					capabilitySnapshot({metrics: ["cost_usd"]}),
				),
			/does not cover exact metric, scope, and enforcement/,
		);
		assert.doesNotThrow(() => assertCustomCodeCapabilitySnapshot(snapshot));
		assert.equal(
			assertCustomCodeTemplateCapability({
				binding: definition.codeTemplate,
				capabilitySnapshot: snapshot,
			}).configurationDigest,
			METER_CONFIG_DIGEST,
		);
		assert.throws(
			() =>
				assertCustomCodeCapabilitySnapshot({
					...snapshot,
					environmentDigest: `sha256:${"e".repeat(64)}`,
				}),
			/identity is invalid/,
		);
		const catalog = createCheckCatalog({userStandards: [standard], customChecks: [definition]});
		const checkId = customCheckDefinitionCheckId(definition);
		const registration = catalog.get(checkId, "decision");
		assert.equal(catalog.version, "10.0.0");
		assert.deepEqual(registration.check.execution, {
			kind: "code",
			id: "codewiki.custom-code.resource_usage_limit",
			version: "1.0.0",
		});
		assert.equal(registration.check.measurement.shape, "count");
		assert.equal(registration.check.evidenceObligations[0].kinds[0], "resource_usage");
		assert.equal(
			registration.customCheck.definition.codeTemplate.bindingDigest,
			definition.codeTemplate.bindingDigest,
		);
		const policy = resolveExitPolicy(selectorInput(protectedConfig));
		const binding = policy.bindings.find((entry) => entry.checkId === checkId);
		assert.equal(binding.enforcement, "require");
		assert.equal(
			binding.parameters.customCodeTemplate.bindingDigest,
			definition.codeTemplate.bindingDigest,
		);

		assert.throws(
			() =>
				resolveRuntimeResourceGuards({
					protectedConfig: {
						...protectedConfig,
						snapshotDigest: `sha256:${"e".repeat(64)}`,
					},
					capabilitySnapshot: snapshot,
				}),
			/snapshot digest does not match/i,
		);
		const resolution = resolveRuntimeResourceGuards({
			protectedConfig,
			capabilitySnapshot: snapshot,
		});
		assert.equal(resolution.status, "ready");
		assert.equal(resolution.guards.length, 1);
		const guard = resolution.guards[0];
		assert.equal(
			guard.protectedConfigSnapshotDigest,
			protectedConfig.snapshotDigest,
		);
		assert.deepEqual(guard.enforcement, ["preflight", "meter", "cancellation"]);
		assert.equal(preflightRuntimeResourceGuards({resolution}).status, "blocked");
		assert.equal(
			preflightRuntimeResourceGuards({
				resolution,
				estimates: [
					{
						guardId: guard.guardId,
						capabilitySnapshotDigest: `sha256:${"e".repeat(64)}`,
						value: 900,
					},
				],
			}).status,
			"blocked",
		);
		const readyPreflight = preflightRuntimeResourceGuards({
			resolution,
			estimates: [
				{
					guardId: guard.guardId,
					capabilitySnapshotDigest: snapshot.snapshotDigest,
					value: 900,
				},
			],
		});
		assert.equal(readyPreflight.status, "ready");
		assert.match(readyPreflight.estimateInputDigest, /^sha256:[0-9a-f]{64}$/);
		assert.equal(
			preflightRuntimeResourceGuards({
				resolution,
				estimates: [
					{
						guardId: guard.guardId,
						capabilitySnapshotDigest: snapshot.snapshotDigest,
						value: 1_001,
					},
				],
			}).status,
			"blocked",
		);
		assert.equal(
			evaluateRuntimeResourceMeter({guard, observation: {guardId: guard.guardId, value: 900}}).action,
			"continue",
		);
		assert.equal(
			evaluateRuntimeResourceMeter({guard, observation: {guardId: guard.guardId, value: 1_001}}).action,
			"cancel",
		);
		const missingMeter = evaluateRuntimeResourceMeter({guard});
		assert.equal(missingMeter.action, "cancel");
		assert.equal(missingMeter.observationStatus, "indeterminate");
		const malformedMeter = evaluateRuntimeResourceMeter({
			guard,
			observation: {guardId: guard.guardId, value: 900, command: "continue"},
		});
		assert.equal(malformedMeter.action, "cancel");
		assert.equal(malformedMeter.observationStatus, "indeterminate");
		const blockedRuntime = createLoopExitRuntime({
			protectedBaseCustomCheckConfig: protectedConfig,
		});
		assert.throws(
			() => blockedRuntime.createRunner({executors: []}),
			/Runtime resource guard admission blocked/,
		);
		assert.doesNotThrow(() =>
			createLoopExitRuntime({
				protectedBaseCustomCheckConfig: protectedConfig,
				customCodeCapabilitySnapshot: snapshot,
			}).createRunner({executors: []}),
		);
	});

	it("reduces exact quantitative Evidence to satisfied, unsatisfied, or indeterminate", async () => {
		const {standard, definition, snapshot, protectedConfig} = fixture();
		const catalog = createCheckCatalog({userStandards: [standard], customChecks: [definition]});
		const checkId = customCheckDefinitionCheckId(definition);
		const registration = catalog.get(checkId, "decision");
		const policy = resolveExitPolicy(selectorInput(protectedConfig));
		const policyBinding = policy.bindings.find((entry) => entry.checkId === checkId);
		const resolution = resolveRuntimeResourceGuards({
			protectedConfig,
			capabilitySnapshot: snapshot,
		});
		const guard = resolution.guards[0];
		const executor = createCustomCodeCheckExecutors({catalog, capabilitySnapshot: snapshot})[0];
		const context = (records) => ({
			candidate: {digest: CANDIDATE_DIGEST},
			policy,
			binding: policyBinding,
			check: registration.check,
			evidenceResolutions: registration.check.evidenceObligations.map(
				(obligation) =>
					reduceEvidenceObligation({
						obligation,
						evidence: records.map((evidence) => ({evidence, relation: "supporting"})),
						expectedSubject: {
							changeRefs: ["CHG-custom-code@1"],
							changeRevisionDigests: [CHANGE_DIGEST],
							candidateDigest: CANDIDATE_DIGEST,
							acceptanceRequirementIds: [],
						},
						expectedFreshnessBoundary: "decision-attempt:1",
					}),
			),
			evidenceRecords: records,
			dependencyResults: [],
			signal: new AbortController().signal,
		});
		const resultFrom = (observation, executionContext) =>
			createCheckResult({
				loop: "decision",
				policy,
				check: registration.check,
				disposition: observation.disposition,
				...(observation.measurement
					? {measurement: observation.measurement}
					: {}),
				evidenceResolutions: executionContext.evidenceResolutions,
				findings: observation.findings,
				...(observation.issueClass ? {issueClass: observation.issueClass} : {}),
				...(observation.feedback ? {feedback: observation.feedback} : {}),
				execution: {...registration.check.execution},
			});
		const passingRecord = evidenceRecord(guard, snapshot, 900);
		assert.equal(passingRecord.kind, "resource_usage");
		assert.equal(passingRecord.payload.value, 900);
		assert.equal(
			passingRecord.payload.protectedCustomCheckConfigSnapshotDigest,
			protectedConfig.snapshotDigest,
		);
		const passingContext = context([passingRecord]);
		const passing = await executor.execute(passingContext);
		assert.equal(passing.disposition, "satisfied");
		assert.equal(resultFrom(passing, passingContext).status, "pass");
		const failingContext = context([evidenceRecord(guard, snapshot, 1_001)]);
		const failing = await executor.execute(failingContext);
		assert.equal(failing.disposition, "unsatisfied");
		assert.equal(failing.issueClass, "resource_limit_exceeded");
		const failedResult = resultFrom(failing, failingContext);
		assert.equal(failedResult.status, "fail");
		assert.equal(failedResult.threshold.maximum, 1_000);
		const missingContext = context([]);
		const missing = await executor.execute(missingContext);
		assert.equal(missing.disposition, "indeterminate");
		assert.equal(resultFrom(missing, missingContext).status, "indeterminate");
		assert.equal(
			(
				await executor.execute(
					context([
						evidenceRecord(
							guard,
							snapshot,
							900,
							`sha256:${"e".repeat(64)}`,
						),
					]),
				)
			).disposition,
			"indeterminate",
		);
		assert.equal(
			(await executor.execute(context([passingRecord, passingRecord]))).disposition,
			"indeterminate",
		);
		const unavailableExecutor = createCustomCodeCheckExecutors({catalog})[0];
		assert.equal(
			(await unavailableExecutor.execute(context([passingRecord]))).disposition,
			"indeterminate",
		);
	});
});
