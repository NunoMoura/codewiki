import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveQualityPolicy } from "../../src/loops/quality-policy-resolver.ts";
import { assertValidQualityPolicyResolution } from "../../src/loops/quality-policy.ts";
import { createQualityStandardRegistry } from "../../src/loops/quality-standard-registry.ts";

const CANDIDATE_DIGEST = `sha256:${"a".repeat(64)}`;
const CHANGE_DIGEST = `sha256:${"b".repeat(64)}`;
const PLANNING_POLICY_DIGEST = `sha256:${"c".repeat(64)}`;

function selectorInput(stage = "decision") {
	return {
		stage,
		candidateDigest: CANDIDATE_DIGEST,
		changes: [
			{
				changeId: "CHG-quality-policy",
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
		paths: ["src/loops/quality-policy.ts"],
	};
}

function projectRegistration() {
	return {
		standard: {
			id: "project.documentation_current",
			version: "1.0.0",
			description: "Project documentation remains current.",
			assessmentCriteria: ["Affected documentation is updated."],
			verifier: {
				id: "codewiki.deterministic",
				version: "1.0.0",
				kind: "deterministic",
			},
			measurement: { shape: "boolean" },
			evidenceAdapterIds: ["source", "trace"],
			repairTarget: "source",
			cost: 1,
			timeoutMs: 5_000,
			protected: false,
		},
		stages: ["implementation"],
		authority: "project",
		rollout: "observe",
		rolloutHistory: [],
		evaluationDependsOn: [],
	};
}

describe("Quality Policy resolver", () => {
	it("activates protected stage baseline and Change-kind Standards", () => {
		const resolution = resolveQualityPolicy(selectorInput());
		const ids = resolution.bindings.map((binding) => binding.standardId);

		assert.ok(ids.includes("change_revision_ready"));
		assert.ok(ids.includes("approval_safety"));
		assert.ok(ids.includes("improvement_outcome_observable"));
		assert.ok(!ids.includes("security_privacy_reviewed"));
		assert.ok(
			resolution.exclusions.some(
				(exclusion) =>
					exclusion.standardId === "security_privacy_reviewed" &&
					exclusion.reason === "not_applicable",
			),
		);
		assert.ok(
			resolution.protectedStandardIds.includes("change_revision_ready"),
		);
		assert.deepEqual(resolution.gates, [
			{
				id: "decision.exit",
				version: "1.0.0",
				kind: "all_required",
				standardIds: resolution.bindings.map((binding) => binding.standardId),
				onFailure: "route_back",
			},
		]);
		assert.doesNotThrow(() => assertValidQualityPolicyResolution(resolution));
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
		const resolution = resolveQualityPolicy(input);
		const byId = new Map(
			resolution.bindings.map((binding) => [binding.standardId, binding]),
		);

		for (const standardId of [
			"security_privacy_reviewed",
			"accessibility_ui_reviewed",
			"dependency_risk_controlled",
			"release_safety_approved",
			"api_contract_reviewed",
			"typescript_quality_verified",
			"shell_quality_verified",
		]) {
			assert.ok(byId.has(standardId), `missing ${standardId}`);
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
				.get("typescript_quality_verified")
				.ruleRefs.includes(
					"quality.technology.typescript.implementation@1.0.0",
				),
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

		const first = resolveQualityPolicy(left);
		const second = resolveQualityPolicy(right);
		assert.equal(first.selectorInputDigest, second.selectorInputDigest);
		assert.equal(first.policyDigest, second.policyDigest);
	});

	it("activates approved project Standards without granting progression authority", () => {
		const registry = createQualityStandardRegistry([projectRegistration()]);
		const input = selectorInput("implementation");
		input.registry = registry;
		input.approvedAdditions = [
			{
				standardId: "project.documentation_current",
				standardVersion: "1.0.0",
				authorityRef: "trace:decision:approval:4",
				parameters: { pathsRequired: true },
			},
		];
		const resolution = resolveQualityPolicy(input);
		const binding = resolution.bindings.find(
			(entry) => entry.standardId === "project.documentation_current",
		);

		assert.equal(binding.enforcement, "observe");
		assert.equal(binding.required, false);
		assert.deepEqual(binding.parameters, { pathsRequired: true });
		assert.ok(!resolution.gates[0].standardIds.includes(binding.standardId));
	});

	it("protects kernel Standards and frozen Planning minimums from exclusions", () => {
		const kernelInput = selectorInput("implementation");
		kernelInput.projectTraits = ["web-ui"];
		kernelInput.approvedExclusions = [
			{
				standardId: "accessibility_ui_reviewed",
				standardVersion: "1.0.0",
				authorityRef: "trace:approval:1",
				reason: "not_applicable",
				refs: [],
			},
		];
		assert.throws(
			() => resolveQualityPolicy(kernelInput),
			/cannot be excluded from implementation/,
		);

		const registry = createQualityStandardRegistry([projectRegistration()]);
		const minimumInput = selectorInput("implementation");
		minimumInput.registry = registry;
		minimumInput.frozenMinimum = {
			planningPolicyDigest: PLANNING_POLICY_DIGEST,
			bindings: [
				{
					standardId: "project.documentation_current",
					standardVersion: "1.0.0",
					enforcement: "observe",
					required: false,
					parameters: {},
				},
			],
		};
		const elevatedInput = {
			...minimumInput,
			frozenMinimum: structuredClone(minimumInput.frozenMinimum),
		};
		elevatedInput.frozenMinimum.bindings[0].enforcement = "enforce";
		assert.throws(
			() => resolveQualityPolicy(elevatedInput),
			/cannot exceed registry rollout observe/,
		);

		minimumInput.approvedExclusions = [
			{
				standardId: "project.documentation_current",
				standardVersion: "1.0.0",
				authorityRef: "trace:approval:2",
				reason: "escalated_elsewhere",
				refs: [],
			},
		];
		assert.throws(
			() => resolveQualityPolicy(minimumInput),
			/cannot be excluded from implementation/,
		);
	});

	it("rejects unknown additions and non-Implementation Planning minimums", () => {
		const unknown = selectorInput();
		unknown.approvedAdditions = [
			{
				standardId: "project.unknown",
				standardVersion: "1.0.0",
				authorityRef: "trace:approval:3",
			},
		];
		assert.throws(
			() => resolveQualityPolicy(unknown),
			/Unknown Quality Standard project.unknown/,
		);

		const wrongStage = selectorInput("planning");
		wrongStage.frozenMinimum = {
			planningPolicyDigest: PLANNING_POLICY_DIGEST,
			bindings: [],
		};
		assert.throws(
			() => resolveQualityPolicy(wrongStage),
			/Only Implementation Quality Policy may carry a frozen Planning minimum/,
		);
	});
});
