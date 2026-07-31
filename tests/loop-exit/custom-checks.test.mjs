import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {createCheckCatalog} from "../../src/loop-exit/catalog.ts";
import {
	activateCustomCheckDefinition,
	createCustomCheckDefinition,
	customCheckDefinitionCheckId,
	disableCustomCheckDefinition,
	listCustomCheckTypes,
	normalizeCustomCheckDefinitions,
	promoteCustomCheckDefinition,
	reviseCustomCheckDefinition,
} from "../../src/loop-exit/custom-checks/index.ts";
import {resolveExitPolicy} from "../../src/loop-exit/resolve-policy.ts";

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
		knowledgeRefs: ["knowledge:company-api-policy"],
		...overrides,
	};
}

function activeDefinition(overrides = {}) {
	return activateCustomCheckDefinition(
		createCustomCheckDefinition(proposal(overrides)),
	);
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
		customChecks,
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
		);
		const equivalent = createCustomCheckDefinition({
			...proposal(),
			requirement:
				"Every changed public API must name its owning team.\nNo exceptions.",
		});

		assert.equal(definition.customCheckId, equivalent.customCheckId);
		assert.equal(definition.contentDigest, equivalent.contentDigest);
		assert.equal(definition.schemaVersion, "1.0.0");
		assert.equal(definition.revision, 1);
		assert.equal(definition.lifecycle, "draft");
		assert.equal(definition.rollout, "observe");
		assert.deepEqual(definition.appliesWhen.affectedLayers, ["api"]);
		assert.match(definition.customCheckId, /^custom-check:[0-9a-f]{64}$/);
		assert.match(definition.contentDigest, /^sha256:[0-9a-f]{64}$/);
		assert.equal(Object.isFrozen(definition), true);
	});

	it("keeps revision and rollout transitions immutable and approval-bound", () => {
		const draft = createCustomCheckDefinition(proposal());
		const active = activateCustomCheckDefinition(draft);
		const warned = promoteCustomCheckDefinition(active);
		const required = promoteCustomCheckDefinition(warned, {
			status: "approved",
			refs: ["approval:custom-check:1"],
		});
		const disabled = disableCustomCheckDefinition(required);
		const revised = reviseCustomCheckDefinition(disabled, {
			...proposal(),
			requirement: "Every public API must name an accountable owning team.",
		});

		assert.deepEqual(
			[draft, active, warned, required, disabled, revised].map((entry) => [
				entry.revision,
				entry.lifecycle,
				entry.rollout,
			]),
			[
				[1, "draft", "observe"],
				[2, "active", "observe"],
				[3, "active", "warn"],
				[4, "active", "require"],
				[5, "disabled", "require"],
				[6, "draft", "observe"],
			],
		);
		assert.deepEqual(required.rolloutHistory, ["observe", "warn"]);
		assert.deepEqual(required.approval.refs, ["approval:custom-check:1"]);
		assert.equal(revised.customCheckId, draft.customCheckId);
		assert.notEqual(revised.contentDigest, disabled.contentDigest);
		assert.throws(
			() => promoteCustomCheckDefinition(warned),
			/require promotion needs approval/,
		);
	});

	it("rejects unsupported, executable, oversized, and tampered input", () => {
		assert.throws(
			() => createCustomCheckDefinition({...proposal(), timeoutMs: 1}),
			/unsupported field timeoutMs/,
		);
		assert.throws(
			() =>
				createCustomCheckDefinition(
					proposal({requirement: `x${"y".repeat(2_000)}`}),
				),
			/cannot exceed 2000 Unicode code points/,
		);
		assert.throws(
			() =>
				createCustomCheckDefinition(
					proposal({appliesWhen: {pathScopes: ["../secrets"]}}),
				),
			/path scope .* is invalid/,
		);
		const active = activeDefinition();
		assert.throws(
			() =>
				normalizeCustomCheckDefinitions([
					{...active, requirement: "Tampered requirement."},
				]),
			/contentDigest does not match content/,
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
		const draft = createCustomCheckDefinition(proposal());
		const active = activateCustomCheckDefinition(draft);
		const catalog = createCheckCatalog([active]);
		const draftCatalog = createCheckCatalog([draft]);
		const checkId = customCheckDefinitionCheckId(active);
		const registration = catalog.get(checkId, "decision");

		assert.equal(registration.authority, "project");
		assert.equal(registration.check.execution.kind, "model");
		assert.equal(registration.check.requirement, active.requirement);
		assert.equal(registration.check.version, "2.0.0");
		assert.equal(registration.rollout, "observe");
		assert.equal(registration.customCheck.definition.contentDigest, active.contentDigest);
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

	it("activates matching Custom Checks with exact type and revision bindings", () => {
		const active = activeDefinition();
		const checkId = customCheckDefinitionCheckId(active);
		const policy = resolveExitPolicy(selectorInput([active]));
		const binding = policy.bindings.find((entry) => entry.checkId === checkId);

		assert.ok(binding);
		assert.equal(binding.required, false);
		assert.equal(binding.enforcement, "observe");
		assert.equal(binding.parameters.customCheckId, active.customCheckId);
		assert.equal(binding.parameters.customCheckRevision, active.revision);
		assert.equal(binding.parameters.customCheckContentDigest, active.contentDigest);
		assert.equal(binding.parameters.customCheckTypeId, "organization_policy");
		assert.equal(
			binding.parameters.checkEvaluatorId,
			"codewiki.check-evaluator.organization_policy",
		);
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
		const draft = createCustomCheckDefinition(proposal());
		const active = activateCustomCheckDefinition(draft);
		const disabled = disableCustomCheckDefinition(active);
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

	it("cleanly rejects the removed project registration path", () => {
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
