import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveWikiConfig } from "../../src/project/config.ts";
import { resolveExecutionPolicy } from "../../src/runtime/execution-policy.ts";

const tools = ["wiki_state", "wiki_plan", "wiki_implement", "wiki_archive"];

function route(id, quality, overrides = {}) {
	return {
		id,
		provider: "test-provider",
		model: `test/${id}`,
		thinking: quality === "standard" ? "medium" : "high",
		quality,
		latency: quality === "standard" ? "fast" : "balanced",
		timeoutMs: 30_000,
		pricing: {
			inputUsdPerMillion: quality === "standard" ? 1 : 4,
			outputUsdPerMillion: quality === "standard" ? 2 : 8,
			cacheReadUsdPerMillion: 0.5,
			cacheWriteUsdPerMillion: 1,
		},
		allowedTools: tools,
		...overrides,
	};
}

function context(overrides = {}) {
	return {
		target: "implementation",
		changeType: "feature",
		workerProfile: "builder",
		risk: "low",
		pathScopes: ["src/runtime/**"],
		requiredTools: ["wiki_state", "wiki_implement"],
		estimatedInputTokens: 10_000,
		estimatedOutputTokens: 5_000,
		...overrides,
	};
}

function config(overrides = {}) {
	return resolveWikiConfig({
		runtime: {
			agency: "delegate",
			automation: "assist",
			budgets: {
				maxTokens: 100_000,
				maxCostUsd: 1,
				maxLatencyMs: 120_000,
			},
			modelRouting: {
				qualityFloor: "standard",
				maxEscalations: 1,
				routes: [route("economy", "standard"), route("expert", "high")],
			},
			...overrides,
		},
	});
}

describe("execution policy", () => {
	it("selects lowest-cost route only after enforcing quality floor", () => {
		const resolved = resolveExecutionPolicy(
			config({
				modelRouting: {
					qualityFloor: "high",
					maxEscalations: 1,
					routes: [
						route("economy", "standard"),
						route("expert-slow", "high", { latency: "slow" }),
						route("expert", "high"),
					],
				},
			}),
			context(),
		);

		assert.equal(resolved.status, "selected");
		assert.equal(resolved.selected.routeId, "expert");
		assert.equal(resolved.selected.provider, "test-provider");
		assert.equal(resolved.selected.model, "test/expert");
		assert.equal(resolved.selected.thinking, "high");
		assert.equal(resolved.selected.quality, "high");
		assert.ok(
			resolved.rejected
				.find((entry) => entry.routeId === "economy")
				.reasons[0].includes("below required high"),
		);
	});

	it("raises floor for risk, sensitive paths, change type, and worker profile", () => {
		for (const input of [
			context({ risk: "high" }),
			context({ pathScopes: ["src/security/tokens.ts"] }),
			context({ changeType: "security_fix" }),
			context({ workerProfile: "integration_reviewer" }),
		]) {
			const resolved = resolveExecutionPolicy(config(), input);
			assert.equal(resolved.qualityFloor, "high");
			assert.equal(resolved.selected.routeId, "expert");
		}
	});

	it("fails closed when tools or budgets cannot be satisfied", () => {
		const missingTool = resolveExecutionPolicy(
			config(),
			context({ requiredTools: ["wiki_implement", "shell"] }),
		);
		assert.equal(missingTool.status, "blocked");
		assert.match(missingTool.rationale, /no untried route/i);
		assert.ok(
			missingTool.rejected.every((entry) =>
				entry.reasons.some((reason) => /missing required tools/.test(reason)),
			),
		);

		const overBudget = resolveExecutionPolicy(
			config({
				budgets: { maxTokens: 1_000, maxCostUsd: 0.001, maxLatencyMs: 1_000 },
			}),
			context(),
		);
		assert.equal(overBudget.status, "blocked");
		assert.ok(overBudget.rejected.every((entry) => entry.reasons.length === 3));
	});

	it("allows one failed-attempt escalation only to higher quality", () => {
		const previousAttempts = [
			{
				routeId: "economy",
				outcome: "failed",
				inputTokens: 1_000,
				outputTokens: 500,
				costUsd: 0.01,
				latencyMs: 2_000,
			},
		];
		const escalated = resolveExecutionPolicy(
			config(),
			context({ previousAttempts }),
		);
		assert.equal(escalated.status, "selected");
		assert.equal(escalated.selected.routeId, "expert");
		assert.equal(escalated.escalation.attempt, 1);

		const exhausted = resolveExecutionPolicy(
			config({
				modelRouting: {
					qualityFloor: "standard",
					maxEscalations: 0,
					routes: [route("economy", "standard"), route("expert", "high")],
				},
			}),
			context({ previousAttempts }),
		);
		assert.equal(exhausted.status, "blocked");
		assert.match(exhausted.rationale, /not permitted/i);
	});

	it("emits deterministic policy evidence with immutable authority ceilings", () => {
		const first = resolveExecutionPolicy(config(), context());
		const second = resolveExecutionPolicy(config(), context());
		assert.equal(first.digest, second.digest);
		assert.match(first.digest, /^sha256:[a-f0-9]{64}$/);
		assert.deepEqual(
			first.selected.pricingSnapshot,
			route("economy", "standard").pricing,
		);
		const autonomous = resolveExecutionPolicy(
			config({ agency: "auto", automation: "auto" }),
			context(),
		);
		assert.equal(autonomous.capabilities.editSource, true);
		assert.equal(autonomous.capabilities.startWorkers, true);
		assert.equal(autonomous.capabilities.appendApprovedIterations, true);
		for (const capability of [
			"acceptChanges",
			"destructiveActions",
			"publicActions",
			"promoteSource",
			"publishPackage",
			"advanceController",
			"continueWithoutSupervision",
		]) {
			assert.equal(first.capabilities[capability], false);
		}
	});
});
