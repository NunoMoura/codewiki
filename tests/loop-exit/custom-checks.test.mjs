import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {createCheckCatalog} from "../../src/loop-exit/catalog.ts";
import {
	activateCustomCheckDefinition,
	createCustomCheckDefinition,
	customCheckConfigurationDigest,
	customCheckDefinitionCheckId,
	createProtectedCustomCheckConfigSnapshot,
	disableCustomCheckDefinition,
	listCustomCheckTypes,
	normalizeCustomCheckDefinitions,
	updateCustomCheckDefinition,
} from "../../src/loop-exit/custom-checks/index.ts";
import {resolveExitPolicy} from "../../src/loop-exit/resolve-policy.ts";
import {
	createTestUserStandard,
	standardRefsFor,
} from "./custom-checks/user-standard-fixture.mjs";

const USER_STANDARD = createTestUserStandard();
const USER_STANDARDS = [USER_STANDARD];
const CANDIDATE_DIGEST = `sha256:${"a".repeat(64)}`;
const CHANGE_DIGEST = `sha256:${"b".repeat(64)}`;

function proposal(overrides = {}) {
	return {
		checkTypeId: "organization_policy",
		name: "Public API ownership",
		requirement: "Every changed public API must name its owning team.",
		repairGuidance: "Add the owning team to accepted API documentation.",
		appliesWhen: {
			loops: ["decision"],
			changeKinds: ["improve"],
			affectedLayers: ["API"],
			pathScopes: ["src/api"],
		},
		standardRefs: standardRefsFor(USER_STANDARD),
		knowledgeRefs: ["knowledge:company-api-policy"],
		...overrides,
	};
}

function activeDefinition(overrides = {}) {
	return activateCustomCheckDefinition(
		createCustomCheckDefinition(proposal(overrides), USER_STANDARDS),
		USER_STANDARDS,
	);
}

function protectedConfig(customChecks) {
	return createProtectedCustomCheckConfigSnapshot({
		protectedSourceHead: "f".repeat(40),
		projectConfigDigest: `sha256:${"e".repeat(64)}`,
		userStandards: USER_STANDARDS,
		customChecks,
	});
}

function selectorInput(customChecks, overrides = {}) {
	return {
		loop: "decision",
		candidateDigest: CANDIDATE_DIGEST,
		changes: [
			{
				changeId: "CHG-custom-check",
				revision: 1,
				digest: CHANGE_DIGEST,
				kind: "improve",
				type: "behavior_change",
				risk: "low",
				affectedLayers: ["api"],
			},
		],
		projectTraits: [],
		technologies: [],
		paths: ["src/api/users.ts"],
		protectedBaseCustomCheckConfig: protectedConfig(customChecks),
		...overrides,
	};
}

describe("Custom Check contracts", () => {
	it("materializes bounded Runtime-owned identity and normalized text", () => {
		const definition = createCustomCheckDefinition(
			proposal({
				name: "  Public API ownership  ",
				requirement:
					"Every changed public API must name its owning team.\r\nNo exceptions.",
			}),
			USER_STANDARDS,
		);
		const equivalent = createCustomCheckDefinition({
			...proposal(),
			requirement:
				"Every changed public API must name its owning team.\nNo exceptions.",
		}, USER_STANDARDS);

		assert.equal(definition.customCheckId, equivalent.customCheckId);
		assert.equal(definition.definitionDigest, equivalent.definitionDigest);
		assert.equal(definition.schemaVersion, "3.0.0");
		assert.equal(definition.lifecycle, "draft");
		assert.deepEqual(definition.appliesWhen.affectedLayers, ["api"]);
		assert.match(definition.customCheckId, /^custom-check:[0-9a-f]{64}$/);
		assert.match(definition.definitionDigest, /^sha256:[0-9a-f]{64}$/);
		assert.equal(Object.isFrozen(definition), true);
	});

	it("separates semantic identity from draft, active, and disabled lifecycle", () => {
		const draft = createCustomCheckDefinition(proposal(), USER_STANDARDS);
		const active = activateCustomCheckDefinition(draft, USER_STANDARDS);
		const disabled = disableCustomCheckDefinition(active, USER_STANDARDS);
		const updated = updateCustomCheckDefinition(active, {
			...proposal(),
			requirement: "Every public API must name an accountable owning team.",
		}, USER_STANDARDS);

		assert.deepEqual(
			[draft, active, disabled, updated].map((entry) => entry.lifecycle),
			["draft", "active", "disabled", "active"],
		);
		assert.equal(active.customCheckId, draft.customCheckId);
		assert.equal(disabled.customCheckId, draft.customCheckId);
		assert.equal(updated.customCheckId, draft.customCheckId);
		assert.equal(active.definitionDigest, draft.definitionDigest);
		assert.equal(disabled.definitionDigest, draft.definitionDigest);
		assert.notEqual(updated.definitionDigest, draft.definitionDigest);
		assert.notEqual(
			customCheckConfigurationDigest({userStandards: USER_STANDARDS, customChecks: [draft]}),
			customCheckConfigurationDigest({userStandards: USER_STANDARDS, customChecks: [active]}),
		);
		assert.notEqual(
			customCheckConfigurationDigest({userStandards: USER_STANDARDS, customChecks: [active]}),
			customCheckConfigurationDigest({userStandards: USER_STANDARDS, customChecks: [updated]}),
		);
		assert.equal("revision" in active, false);
		assert.equal("rollout" in active, false);
		assert.equal("approval" in active, false);
		assert.throws(
			() => activateCustomCheckDefinition(active, USER_STANDARDS),
			/must be draft before activation/,
		);
		assert.throws(
			() =>
				updateCustomCheckDefinition(active, {
					...proposal(),
					checkTypeId: "security_and_privacy",
				}, USER_STANDARDS),
			/Custom Check Type cannot change after creation/,
		);
	});

	it("rejects unsupported, executable, oversized, and tampered input", () => {
		assert.throws(
			() => createCustomCheckDefinition({...proposal(), timeoutMs: 1}, USER_STANDARDS),
			/unsupported field timeoutMs/,
		);
		assert.throws(
			() =>
				createCustomCheckDefinition(
					proposal({requirement: `x${"y".repeat(2_000)}`}),
					USER_STANDARDS,
				),
			/cannot exceed 2000 Unicode code points/,
		);
		assert.throws(
			() =>
				createCustomCheckDefinition(
					proposal({appliesWhen: {pathScopes: ["../secrets"]}}),
					USER_STANDARDS,
				),
			/path scope .* is invalid/,
		);
		const active = activeDefinition();
		assert.throws(
			() =>
				normalizeCustomCheckDefinitions([
					{...active, requirement: "Tampered requirement."},
				], USER_STANDARDS),
			/definitionDigest does not match definition/,
		);
		assert.throws(
			() => normalizeCustomCheckDefinitions([{...active, revision: 2}], USER_STANDARDS),
			/unsupported field revision/,
		);
		assert.throws(
			() => normalizeCustomCheckDefinitions([{...active, rollout: "require"}], USER_STANDARDS),
			/unsupported field rollout/,
		);
	});

	it("publishes one closed versioned Check Type catalog", () => {
		const types = listCustomCheckTypes();
		assert.deepEqual(
			types.map((entry) => entry.id),
			[
				"intent_and_product",
				"research_and_claims",
				"architecture_and_api",
				"security_and_privacy",
				"accessibility",
				"design_system",
				"library_compatibility",
				"implementation_quality",
				"delivery_and_release",
				"organization_policy",
			],
		);
		assert.ok(types.every((entry) => entry.version === "1.0.0"));
		assert.ok(types.every((entry) => entry.evaluatorId.startsWith("codewiki.check-evaluator.")));
	});
});

describe("Custom Check catalog and policy", () => {
	it("materializes active Custom Checks as project-authority Model Checks", () => {
		const draft = createCustomCheckDefinition(proposal(), USER_STANDARDS);
		const active = activateCustomCheckDefinition(draft, USER_STANDARDS);
		const catalog = createCheckCatalog({userStandards: USER_STANDARDS, customChecks: [active]});
		const draftCatalog = createCheckCatalog({userStandards: USER_STANDARDS, customChecks: [draft]});
		const checkId = customCheckDefinitionCheckId(active);
		const registration = catalog.get(checkId, "decision");

		assert.equal(registration.authority, "project");
		assert.equal(registration.check.execution.kind, "model");
		assert.equal(registration.check.requirement, active.requirement);
		assert.equal(registration.check.version, "3.0.0");
		assert.equal(registration.rollout, "require");
		assert.equal(
			registration.customCheck.definition.definitionDigest,
			active.definitionDigest,
		);
		assert.notEqual(catalog.customCheckConfigDigest, draftCatalog.customCheckConfigDigest);
		assert.equal(
			registration.customCheck.evaluatorId,
			"codewiki.check-evaluator.organization_policy",
		);
		assert.equal(
			catalog.list().filter((entry) => entry.check.id === checkId).length,
			1,
		);
		assert.equal(draftCatalog.get(checkId, "decision"), undefined);
	});

	it("activates matching Custom Checks as required with exact definition bindings", () => {
		const active = activeDefinition();
		const checkId = customCheckDefinitionCheckId(active);
		const policy = resolveExitPolicy(selectorInput([active]));
		const binding = policy.bindings.find((entry) => entry.checkId === checkId);

		assert.ok(binding);
		assert.equal(binding.required, true);
		assert.equal(binding.enforcement, "require");
		assert.equal(binding.parameters.customCheckId, active.customCheckId);
		assert.equal(
			binding.parameters.customCheckDefinitionDigest,
			active.definitionDigest,
		);
		assert.equal(binding.parameters.customCheckTypeId, "organization_policy");
		assert.equal(
			binding.parameters.checkEvaluatorId,
			"codewiki.check-evaluator.organization_policy",
		);
		assert.deepEqual(binding.parameters.standardRefs, standardRefsFor(USER_STANDARD));
		assert.deepEqual(binding.parameters.knowledgeRefs, [
			"knowledge:company-api-policy",
		]);
		assert.ok(
			binding.activatedBy.includes("custom_change_kind:improve") &&
				binding.activatedBy.includes("custom_affected_layer:api") &&
				binding.activatedBy.includes("custom_path_scope:src/api"),
		);
		assert.match(policy.catalogDigest, /^sha256:[0-9a-f]{64}$/);
	});

	it("does not activate nonmatching, draft, or disabled Custom Checks", () => {
		const draft = createCustomCheckDefinition(proposal(), USER_STANDARDS);
		const active = activateCustomCheckDefinition(draft, USER_STANDARDS);
		const disabled = disableCustomCheckDefinition(active, USER_STANDARDS);
		const checkId = customCheckDefinitionCheckId(active);
		const nonmatching = resolveExitPolicy(
			selectorInput([active], {paths: ["src/core/runtime.ts"]}),
		);
		const draftPolicy = resolveExitPolicy(selectorInput([draft]));
		const disabledPolicy = resolveExitPolicy(selectorInput([disabled]));

		assert.equal(nonmatching.bindings.some((entry) => entry.checkId === checkId), false);
		assert.equal(draftPolicy.bindings.some((entry) => entry.checkId === checkId), false);
		assert.equal(disabledPolicy.bindings.some((entry) => entry.checkId === checkId), false);
	});

	it("cleanly rejects removed unprotected Custom Check inputs", () => {
		assert.throws(
			() =>
				resolveExitPolicy({
					...selectorInput([]),
					customChecks: [],
				}),
			/unsupported field customChecks; use protectedBaseCustomCheckConfig/,
		);
		assert.throws(
			() =>
				resolveExitPolicy({
					...selectorInput([]),
					projectRegistrations: [],
				}),
			/unsupported field projectRegistrations; use bounded Custom Checks/,
		);
	});
});
