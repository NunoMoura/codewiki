import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	dispatchTraceHosts,
	traceHostPrompt,
} from "../../src/runtime/trace-host-runner.ts";

function plan(actions) {
	return {
		role: "main",
		state: "active",
		actions,
		blockers: [],
		refs: actions.flatMap((action) => action.refs),
	};
}

function startAction(traceId, targetLoop) {
	return {
		kind: "start_trace_host",
		traceId,
		targetLoop,
		message: `Start ${traceId}`,
		refs: [`trace:${traceId}:decision:iteration:1`],
	};
}

describe("trace host dispatcher", () => {
	it("starts one supervised independent session per lifecycle action", async () => {
		const inputs = [];
		const result = await dispatchTraceHosts({
			repoRoot: "/repo",
			plan: plan([
				startAction("TRACE-plan", "planning"),
				startAction("TRACE-implement", "implementation"),
			]),
			supervision: { attached: true, supervisorId: "dashboard:123" },
			startSession: async (input) => {
				inputs.push(input);
				return {
					traceId: input.traceId,
					target: input.target,
					sessionRef: `pi:${input.traceId}`,
					controller: {
						isRunning: () => true,
						stop: () => undefined,
					},
				};
			},
		});

		assert.deepEqual(
			result.started.map((session) => session.traceId),
			["TRACE-plan", "TRACE-implement"],
		);
		assert.deepEqual(result.held, []);
		assert.equal(inputs[0].supervisorId, "dashboard:123");
		assert.match(inputs[0].prompt, /Work only on this trace/);
		assert.match(inputs[0].prompt, /Do not create or accept Changes/);
		assert.match(inputs[1].prompt, /Run the implementation loop/);
	});

	it("holds all starts when supervision is detached", async () => {
		let called = false;
		const result = await dispatchTraceHosts({
			repoRoot: "/repo",
			plan: plan([startAction("TRACE-plan", "planning")]),
			supervision: { attached: false, supervisorId: "missing" },
			startSession: async () => {
				called = true;
				throw new Error("must not run");
			},
		});

		assert.equal(called, false);
		assert.deepEqual(result.started, []);
		assert.match(result.held[0].message, /requires an attached supervisor/);
	});

	it("never dispatches Decision authority to a trace host", async () => {
		const result = await dispatchTraceHosts({
			repoRoot: "/repo",
			plan: plan([startAction("TRACE-decision", "decision")]),
			supervision: { attached: true, supervisorId: "dashboard:123" },
			startSession: async () => {
				throw new Error("must not run");
			},
		});

		assert.deepEqual(result.started, []);
		assert.match(result.held[0].message, /cannot dispatch Decision authority/);
	});

	it("builds bounded close prompts without execution authority", () => {
		const prompt = traceHostPrompt(
			"TRACE-close",
			"close",
			Array.from({ length: 30 }, (_, index) => `trace:ref:${index}`),
		);
		assert.match(prompt, /guarded archive facade/);
		assert.match(prompt, /Stop and report a blocker/);
		assert.equal(prompt.includes("trace:ref:20"), false);
	});
});
