import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveExitPolicy } from "../../src/loop-exit/resolve-policy.ts";
import { assertValidResolvedExitPolicy } from "../../src/loop-exit/contracts.ts";

const CANDIDATE_DIGEST = `sha256:${"a".repeat(64)}`;
const CHANGE_DIGEST = `sha256:${"b".repeat(64)}`;
const PLANNING_POLICY_DIGEST = `sha256:${"c".repeat(64)}`;

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

function projectRegistration() {
	return {
		check: {
			id: "project.documentation_current",
			version: "1.0.0",
			description: "Project documentation remains current.",
			requirement: "Affected documentation is updated.",
			execution: {
				id: "codewiki.code-check",
				version: "1.0.0",
				kind: "code",
			},
			measurement: { kind: "quantitative", shape: "boolean" },
			evidenceAdapterIds: ["source", "trace"],
			repairTarget: "source",
			cost: 1,
			timeoutMs: 5_000,
			protected: false,
		},
		loops: ["implementation"],
		rollout: "observe",
		rolloutHistory: [],
		dependsOn: [],
	};
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

	it("activates approved project Checks without granting progression authority", () => {
		const input = selectorInput("implementation");
		input.projectRegistrations = [projectRegistration()];
		input.approvedAdditions = [
			{
				checkId: "project.documentation_current",
				checkVersion: "1.0.0",
				authorityRef: "trace:decision:approval:4",
				parameters: { pathsRequired: true },
			},
		];
		const resolution = resolveExitPolicy(input);
		const binding = resolution.bindings.find(
			(entry) => entry.checkId === "project.documentation_current",
		);

		assert.equal(binding.enforcement, "observe");
		assert.equal(binding.required, false);
		assert.deepEqual(binding.parameters, { pathsRequired: true });
	});

	it("protects kernel Checks and frozen Planning minimums from exclusions", () => {
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

		const minimumInput = selectorInput("implementation");
		minimumInput.projectRegistrations = [projectRegistration()];
		minimumInput.frozenMinimum = {
			planningPolicyDigest: PLANNING_POLICY_DIGEST,
			bindings: [
				{
					checkId: "project.documentation_current",
					checkVersion: "1.0.0",
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
		elevatedInput.frozenMinimum.bindings[0].enforcement = "require";
		assert.throws(
			() => resolveExitPolicy(elevatedInput),
			/cannot exceed catalog rollout observe/,
		);

		minimumInput.approvedExclusions = [
			{
				checkId: "project.documentation_current",
				checkVersion: "1.0.0",
				authorityRef: "trace:approval:2",
				reason: "escalated_elsewhere",
				refs: [],
			},
		];
		assert.throws(
			() => resolveExitPolicy(minimumInput),
			/cannot be excluded from implementation/,
		);
	});

	it("rejects unknown additions and non-Implementation Planning minimums", () => {
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

		const wrongLoop = selectorInput("planning");
		wrongLoop.frozenMinimum = {
			planningPolicyDigest: PLANNING_POLICY_DIGEST,
			bindings: [],
		};
		assert.throws(
			() => resolveExitPolicy(wrongLoop),
			/Only Implementation Resolved Exit Policy may carry a frozen Planning minimum/,
		);
	});
});
