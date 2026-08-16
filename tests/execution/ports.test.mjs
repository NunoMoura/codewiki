import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createPackSkillSetSnapshot,
	createPackSkillSnapshot,
} from "../../src/checks/packs/contracts.ts";
import {
	EXECUTION_CAPABILITY_NAMES,
	assertProducerSkillReceipt,
	bindProducerSkills,
	resolveExecutionCapabilities,
} from "../../src/execution/ports.ts";
import {sha256Digest} from "../../src/utils/canonical-json.ts";

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
});
