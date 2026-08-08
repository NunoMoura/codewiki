import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createWorkerObservation,
	workerObservationFreshness,
} from "../../src/runtime/workers/worker-observation.ts";

function observation(overrides = {}) {
	return {
		traceId: "TRACE-worker",
		workUnitId: "WU-worker",
		workerId: "worker-001",
		attemptId: "claim-001",
		phase: "running_checks",
		observedAt: "2026-07-12T12:00:00.000Z",
		leaseExpiresAt: "2026-07-12T12:10:00.000Z",
		progress: { current: 2, total: 3 },
		execution: {
			policyDigest: "sha256:" + "a".repeat(64),
			routeId: "route-high",
			provider: "openai-codex",
			model: "gpt-5.4",
			thinking: "high",
			quality: "high",
			allowedTools: ["bash", "edit", "read"],
			timeoutMs: 90_000,
			budget: { maxTokens: 10_000, maxCostUsd: 1, maxLatencyMs: 90_000 },
			usage: {
				inputTokens: 200,
				outputTokens: 100,
				totalTokens: 300,
				costUsd: 0.02,
				latencyMs: 2_000,
			},
		},
		...overrides,
	};
}

describe("worker observation contract", () => {
	it("normalizes bounded correlated activity and freshness", () => {
		const value = createWorkerObservation(observation());
		assert.equal(value.schemaVersion, "codewiki.worker-observation.v1");
		assert.equal(value.phase, "running_checks");
		assert.equal(value.execution.routeId, "route-high");
		assert.equal(value.execution.usage.totalTokens, 300);
		assert.equal(
			workerObservationFreshness(value, new Date("2026-07-12T12:00:20.000Z")),
			"live",
		);
		assert.equal(
			workerObservationFreshness(value, new Date("2026-07-12T12:01:00.000Z")),
			"stale",
		);
		assert.equal(
			workerObservationFreshness(value, new Date("2026-07-12T12:11:00.000Z")),
			"expired",
		);
	});

	it("rejects private, raw, unknown, and unbounded payload fields", () => {
		for (const field of [
			"prompt",
			"chainOfThought",
			"rawLog",
			"sourceContent",
			"authorization",
			"environment",
		]) {
			assert.throws(
				() => createWorkerObservation(observation({ [field]: "secret" })),
				new RegExp(`field ${field} is not allowed`),
			);
		}
		assert.throws(
			() => createWorkerObservation(observation({ phase: "thinking" })),
			/phase is not allowed/,
		);
		assert.throws(
			() =>
				createWorkerObservation(
					observation({
						execution: {
							...observation().execution,
							policyDigest: "stale",
						},
					}),
				),
			/policyDigest is invalid/,
		);
		assert.throws(
			() =>
				createWorkerObservation(
					observation({
						execution: {
							...observation().execution,
							budget: { maxTokens: 1, prompt: "private" },
						},
					}),
				),
			/budget field prompt is not allowed/,
		);
		assert.throws(
			() =>
				createWorkerObservation(
					observation({ progress: { current: 4, total: 3 } }),
				),
			/0 <= current <= total/,
		);
		assert.throws(
			() => createWorkerObservation(observation({ workerId: "x".repeat(129) })),
			/workerId is invalid/,
		);
		assert.throws(
			() =>
				createWorkerObservation(
					observation({ leaseExpiresAt: "2026-07-12T11:59:59.000Z" }),
				),
			/lease must expire after observedAt/,
		);
	});
});
