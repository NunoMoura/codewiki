import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveExitPolicy } from "../../src/loop-exit/resolve-policy.ts";
import { assertValidResolvedExitPolicy } from "../../src/loop-exit/contracts.ts";
import {
	activateCustomCheckDefinition,
	createCustomCheckDefinition,
	customCheckDefinitionCheckId,
} from "../../src/loop-exit/custom-checks/index.ts";
import {classifySecuritySurfaces} from "../../src/loop-exit/security-surfaces.ts";

const CANDIDATE_DIGEST = `sha256:${"a".repeat(64)}`;
const CHANGE_DIGEST = `sha256:${"b".repeat(64)}`;

function selectorInput(loop = "decision") {
	return {
		loop,
		candidateDigest: CANDIDATE_DIGEST,
		changes: [
			{
				changeId: "CHG-check-policy",
				revision: 2,
				digest: CHANGE_DIGEST,
				kind: "improve",
				type: "architecture_change",
				risk: "low",
				affectedLayers: ["source"],
			},
		],
		projectTraits: [],
		technologies: [],
		paths: ["src/loop-exit/contracts.ts"],
	};
}

function customCheck() {
	return activateCustomCheckDefinition(
		createCustomCheckDefinition({
			checkTypeId: "organization_policy",
			name: "Documentation remains current",
			requirement: "Affected documentation is updated.",
			appliesWhen: {loops: ["implementation"]},
		}),
	);
}

describe("Resolved Exit Policy resolver", () => {
	it("activates protected loop baseline and Change-kind Checks", () => {
		const resolution = resolveExitPolicy(selectorInput());
		const ids = resolution.bindings.map((binding) => binding.checkId);

		assert.ok(ids.includes("change_revision_ready"));
		assert.ok(ids.includes("approval_safety"));
		assert.ok(ids.includes("improvement_outcome_observable"));
		assert.ok(!ids.includes("security_privacy_reviewed"));
		assert.ok(
			resolution.exclusions.some(
				(exclusion) =>
					exclusion.checkId === "security_privacy_reviewed" &&
					exclusion.reason === "not_applicable",
			),
		);
		assert.ok(
			resolution.protectedCheckIds.includes("change_revision_ready"),
		);
		assert.ok(
			resolution.bindings.every(
				(binding) => binding.required && binding.enforcement === "require",
			),
		);
		assert.match(resolution.catalogDigest, /^sha256:[0-9a-f]{64}$/);
		assert.ok(
			resolution.bindings.every(
				(binding) =>
					/^sha256:[0-9a-f]{64}$/.test(binding.requirementDigest) &&
					/^sha256:[0-9a-f]{64}$/.test(binding.checkDigest),
			),
		);
		assert.doesNotThrow(() => assertValidResolvedExitPolicy(resolution));
	});

	it("combines multi-trait, path, risk, and technology overlays explainably", () => {
		const input = selectorInput("implementation");
		input.changes[0].risk = "high";
		input.changes[0].type = "dependency_change";
		input.changes[0].affectedLayers = ["API", "UI"];
		input.projectTraits = ["public-api", "web-ui", "release-producing"];
		input.technologies = ["typescript", "shell"];
		input.paths = [
			"src/dashboard/panel.tsx",
			"package-lock.json",
			".github/workflows/release.yml",
		];
		const resolution = resolveExitPolicy(input);
		const byId = new Map(
			resolution.bindings.map((binding) => [binding.checkId, binding]),
		);

		for (const checkId of [
			"security_privacy_reviewed",
			"accessibility_ui_reviewed",
			"dependency_risk_controlled",
			"release_safety_approved",
			"api_contract_reviewed",
			"typescript_verified",
			"shell_verified",
		]) {
			assert.ok(byId.has(checkId), `missing ${checkId}`);
		}
		assert.ok(
			byId
				.get("accessibility_ui_reviewed")
				.activatedBy.includes("project-trait:web-ui"),
		);
		assert.ok(
			byId
				.get("accessibility_ui_reviewed")
				.activatedBy.includes("path-trait:ui"),
		);
		assert.ok(
			byId
				.get("typescript_verified")
				.ruleRefs.includes(
					"check.technology.typescript.implementation@1.0.0",
				),
		);
	});

	it("activates Decision research assurance from exact risk facts", () => {
		const baseline = resolveExitPolicy(selectorInput("decision"));
		for (const checkId of [
			"research_provenance_valid",
			"research_claims_supported",
		]) {
			assert.equal(
				baseline.bindings.some((binding) => binding.checkId === checkId),
				false,
			);
		}

		const highRiskInput = selectorInput("decision");
		highRiskInput.changes[0].risk = "high";
		const highRisk = resolveExitPolicy(highRiskInput);
		for (const checkId of [
			"research_provenance_valid",
			"research_claims_supported",
		]) {
			const binding = highRisk.bindings.find(
				(candidate) => candidate.checkId === checkId,
			);
			assert.ok(binding, `missing ${checkId}`);
			assert.ok(
				binding.activatedBy.includes("change:CHG-check-policy:risk:high"),
			);
			assert.ok(binding.required);
		}

		const riskFactInputs = [
			(input) => {
				input.changes[0].kind = "migrate";
			},
			(input) => {
				input.changes[0].type = "dependency_change";
			},
			(input) => {
				input.changes[0].type = "security_change";
			},
			(input) => {
				input.changes[0].affectedLayers = ["privacy"];
			},
			(input) => {
				input.projectTraits = ["security-sensitive"];
			},
			(input) => {
				input.paths = ["package-lock.json"];
			},
		];
		for (const configure of riskFactInputs) {
			const input = selectorInput("decision");
			configure(input);
			const resolution = resolveExitPolicy(input);
			for (const checkId of [
				"research_provenance_valid",
				"research_claims_supported",
			]) {
				assert.ok(
					resolution.bindings.some((binding) => binding.checkId === checkId),
					`missing ${checkId}`,
				);
			}
		}
	});

	it("activates explainable Decision security and targeted Checks from classified surfaces", () => {
		const input = selectorInput("decision");
		input.securitySurfaceClassification = classifySecuritySurfaces({
			changeId: input.changes[0].changeId,
			revision: input.changes[0].revision,
			revisionDigest: input.changes[0].digest,
			kind: input.changes[0].kind,
			type: input.changes[0].type,
			scope: "system",
			risk: input.changes[0].risk,
			affectedLayers: ["api", "database"],
			targetRefs: [],
			knowledgeRefs: [],
			sourceRefs: [],
			signals: [],
		});
		const resolution = resolveExitPolicy(input);
		const byId = new Map(
			resolution.bindings.map((binding) => [binding.checkId, binding]),
		);

		for (const checkId of [
			"security_surface_requirements_complete",
			"security_privacy_reviewed",
			"api_contract_reviewed",
			"persistent_data_safety_reviewed",
		]) {
			assert.ok(byId.has(checkId), `missing ${checkId}`);
		}
		const security = byId.get("security_privacy_reviewed");
		assert.ok(
			security.activatedBy.includes("security-surface:network_public_api"),
		);
		assert.ok(
			security.activatedBy.includes("security-surface:persistence_migration"),
		);
		assert.deepEqual(security.dependsOn, [
			"security_surface_requirements_complete",
		]);
		assert.equal(
			security.parameters.securitySurfaceClassification.classificationDigest,
			input.securitySurfaceClassification.classificationDigest,
		);
	});

	it("uses Loop-specific release Checks and Planning UI preview validation", () => {
		const releaseChecks = {
			decision: "release_intent_authorized",
			planning: "release_plan_safe",
			implementation: "release_safety_approved",
		};
		for (const [loop, expectedCheckId] of Object.entries(releaseChecks)) {
			const input = selectorInput(loop);
			input.changes[0].type = "release_change";
			const resolution = resolveExitPolicy(input);
			const releaseBindings = resolution.bindings.filter((binding) =>
				Object.values(releaseChecks).includes(binding.checkId),
			);
			assert.deepEqual(
				releaseBindings.map((binding) => binding.checkId),
				[expectedCheckId],
			);
		}

		const planningInput = selectorInput("planning");
		planningInput.projectTraits = ["web-ui"];
		const planning = resolveExitPolicy(planningInput);
		const previewBinding = planning.bindings.find(
			(binding) => binding.checkId === "ui_preview_targets_valid",
		);
		assert.ok(previewBinding);
		assert.ok(previewBinding.activatedBy.includes("project-trait:web-ui"));

		const decisionInput = selectorInput("decision");
		decisionInput.projectTraits = ["web-ui"];
		assert.equal(
			resolveExitPolicy(decisionInput).bindings.some(
				(binding) => binding.checkId === "ui_preview_targets_valid",
			),
			false,
		);
	});

	it("normalizes selector ordering into stable policy identity", () => {
		const left = selectorInput("implementation");
		left.projectTraits = ["library", "web-ui"];
		left.technologies = ["shell", "typescript"];
		left.paths = ["scripts/release.sh", "src/ui/app.tsx"];
		left.changes.push({
			changeId: "CHG-second",
			revision: 1,
			digest: `sha256:${"d".repeat(64)}`,
			kind: "fix",
			type: "behavior_change",
			risk: "medium",
			affectedLayers: ["CLI"],
		});
		const right = structuredClone(left);
		right.projectTraits.reverse();
		right.technologies.reverse();
		right.paths.reverse();
		right.changes.reverse();
		right.changes[1].affectedLayers.reverse();

		const first = resolveExitPolicy(left);
		const second = resolveExitPolicy(right);
		assert.equal(first.selectorInputDigest, second.selectorInputDigest);
		assert.equal(first.policyDigest, second.policyDigest);
	});

	it("binds policy identity to exact Catalog content", () => {
		const baselineInput = selectorInput("implementation");
		const changedCatalogInput = selectorInput("implementation");
		changedCatalogInput.customChecks = [customCheck()];

		const baseline = resolveExitPolicy(baselineInput);
		const changedCatalog = resolveExitPolicy(changedCatalogInput);

		assert.notEqual(baseline.catalogDigest, changedCatalog.catalogDigest);
		assert.notEqual(baseline.selectorInputDigest, changedCatalog.selectorInputDigest);
		assert.notEqual(baseline.policyDigest, changedCatalog.policyDigest);
	});

	it("creates different identity for the same Check definition in different Loops", () => {
		const decision = resolveExitPolicy(selectorInput("decision"));
		const implementation = resolveExitPolicy(selectorInput("implementation"));
		const decisionBinding = decision.bindings.find(
			(binding) => binding.checkId === "improvement_outcome_observable",
		);
		const implementationBinding = implementation.bindings.find(
			(binding) => binding.checkId === "improvement_outcome_observable",
		);

		assert.ok(decisionBinding);
		assert.ok(implementationBinding);
		assert.equal(
			decisionBinding.requirementDigest,
			implementationBinding.requirementDigest,
		);
		assert.notEqual(decisionBinding.checkDigest, implementationBinding.checkDigest);
	});

	it("activates applicable Custom Checks as required policy", () => {
		const definition = customCheck();
		const input = selectorInput("implementation");
		input.customChecks = [definition];
		const resolution = resolveExitPolicy(input);
		const binding = resolution.bindings.find(
			(entry) => entry.checkId === customCheckDefinitionCheckId(definition),
		);

		assert.equal(binding.enforcement, "require");
		assert.equal(binding.required, true);
		assert.equal(binding.parameters.customCheckId, definition.customCheckId);
		assert.equal(
			binding.parameters.customCheckDefinitionDigest,
			definition.definitionDigest,
		);
	});

	it("protects kernel and active Custom Checks from exclusions", () => {
		const kernelInput = selectorInput("implementation");
		kernelInput.projectTraits = ["web-ui"];
		kernelInput.approvedExclusions = [
			{
				checkId: "accessibility_ui_reviewed",
				checkVersion: "1.0.0",
				authorityRef: "trace:approval:1",
				reason: "not_applicable",
				refs: [],
			},
		];
		assert.throws(
			() => resolveExitPolicy(kernelInput),
			/cannot be excluded from implementation/,
		);

		const definition = customCheck();
		const customInput = selectorInput("implementation");
		customInput.customChecks = [definition];
		customInput.approvedExclusions = [
			{
				checkId: customCheckDefinitionCheckId(definition),
				checkVersion: definition.schemaVersion,
				authorityRef: "trace:approval:custom-check",
				reason: "not_applicable",
				refs: [],
			},
		];
		assert.throws(
			() => resolveExitPolicy(customInput),
			/cannot be excluded from implementation/,
		);
	});

	it("rejects unknown additions and caller-supplied Planning minimums", () => {
		const unknown = selectorInput();
		unknown.approvedAdditions = [
			{
				checkId: "project.unknown",
				checkVersion: "1.0.0",
				authorityRef: "trace:approval:3",
			},
		];
		assert.throws(
			() => resolveExitPolicy(unknown),
			/Unknown Check project.unknown/,
		);

		const fabricatedMinimum = selectorInput("implementation");
		fabricatedMinimum.frozenMinimum = {
			planningPolicyDigest: `sha256:${"c".repeat(64)}`,
			bindings: [],
		};
		assert.throws(
			() => resolveExitPolicy(fabricatedMinimum),
			/unsupported field frozenMinimum; Runtime must derive Planning minimums/,
		);
	});
});
