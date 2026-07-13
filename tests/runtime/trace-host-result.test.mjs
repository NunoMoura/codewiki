import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTraceHostResultCollector } from "../../src/pi/trace-host-result.ts";

function assistantEvent(text, overrides = {}) {
	return JSON.stringify({
		type: "message_end",
		message: {
			role: "assistant",
			content: [{ type: "text", text }],
			provider: "openai-codex",
			model: "gpt-5.4",
			stopReason: "stop",
			usage: {
				input: 120,
				output: 80,
				cacheRead: 40,
				cacheWrite: 10,
				totalTokens: 250,
				cost: { total: 0.42 },
			},
			...overrides,
		},
	});
}

describe("trace host result collector", () => {
	it("collects bounded structured outcomes and resumable session identity", () => {
		const collector = createTraceHostResultCollector();
		collector.acceptLine(
			JSON.stringify({
				type: "session",
				version: 3,
				id: "123e4567-e89b-12d3-a456-426614174000",
			}),
		);
		collector.acceptLine(
			assistantEvent(
				[
					"Planning preview prepared.",
					`CODEWIKI_TRACE_HOST_RESULT ${JSON.stringify({
						version: 1,
						outcome: "needs_approval",
						summary: "Planning proposal is ready for user review.",
						refs: ["trace:TRACE-one:decision:iteration:1"],
						approval: {
							kind: "planning",
							proposalDigest: `sha256:${"a".repeat(64)}`,
							proposalRef: "proposal:planning:TRACE-one:1",
						},
					})}`,
				].join("\n"),
			),
		);

		const completion = collector.complete(0, null);
		assert.equal(completion.result.outcome, "needs_approval");
		assert.equal(
			completion.result.sessionId,
			"123e4567-e89b-12d3-a456-426614174000",
		);
		assert.equal(completion.result.approval.kind, "planning");
		assert.equal(completion.result.model, "gpt-5.4");
		assert.equal(completion.result.provider, "openai-codex");
		assert.deepEqual(completion.result.usage, {
			input: 120,
			output: 80,
			cacheRead: 40,
			cacheWrite: 10,
			totalTokens: 250,
			cost: 0.42,
		});
	});

	it("fails closed when structured output is missing or malformed", () => {
		const missing = createTraceHostResultCollector();
		missing.acceptLine(
			assistantEvent(
				`CODEWIKI_TRACE_HOST_RESULT ${JSON.stringify({
					version: 1,
					outcome: "completed",
					summary: "Earlier non-final result.",
					refs: [],
				})}`,
			),
		);
		missing.acceptLine(assistantEvent("Ordinary final response."));
		assert.deepEqual(missing.complete(0, null).result, {
			version: 1,
			outcome: "failed",
			summary: "Trace host exited without a valid structured result.",
			refs: [],
			model: "gpt-5.4",
			provider: "openai-codex",
			usage: {
				input: 120,
				output: 80,
				cacheRead: 40,
				cacheWrite: 10,
				totalTokens: 250,
				cost: 0.42,
			},
		});

		const invalid = createTraceHostResultCollector();
		invalid.acceptLine(
			assistantEvent(
				`CODEWIKI_TRACE_HOST_RESULT ${JSON.stringify({
					version: 1,
					outcome: "needs_approval",
					summary: "Missing exact approval metadata.",
					refs: [],
				})}`,
			),
		);
		assert.equal(invalid.complete(0, null).result.outcome, "failed");
	});

	it("rejects secret-shaped summaries and unbounded event lines", () => {
		const collector = createTraceHostResultCollector();
		collector.acceptLine("x".repeat(262_145));
		collector.acceptLine(
			assistantEvent(
				`CODEWIKI_TRACE_HOST_RESULT ${JSON.stringify({
					version: 1,
					outcome: "blocked",
					summary: "api_key=abcdefghijklmnop",
					refs: [],
				})}`,
			),
		);
		const result = collector.complete(0, null).result;
		assert.equal(result.outcome, "failed");
		assert.equal(result.summary.includes("abcdefghijklmnop"), false);

		const unrestrictedRef = createTraceHostResultCollector();
		unrestrictedRef.acceptLine(
			assistantEvent(
				`CODEWIKI_TRACE_HOST_RESULT ${JSON.stringify({
					version: 1,
					outcome: "blocked",
					summary: "External input is missing.",
					refs: ["raw private prose is not a ref"],
				})}`,
			),
		);
		assert.equal(unrestrictedRef.complete(0, null).result.outcome, "failed");
	});

	it("treats process and assistant failures as authoritative", () => {
		const processFailure = createTraceHostResultCollector();
		processFailure.acceptLine(
			assistantEvent(
				`CODEWIKI_TRACE_HOST_RESULT ${JSON.stringify({
					version: 1,
					outcome: "completed",
					summary: "Claimed completion.",
					refs: [],
				})}`,
			),
		);
		assert.equal(processFailure.complete(2, null).result.outcome, "failed");

		const assistantFailure = createTraceHostResultCollector();
		assistantFailure.acceptLine(
			assistantEvent("No result.", { stopReason: "error" }),
		);
		assert.equal(assistantFailure.complete(0, null).result.outcome, "failed");
	});
});
