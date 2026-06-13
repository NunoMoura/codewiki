import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createPiWorkerPrompt,
	dispatchPiWorkers,
} from "../../src/pi/dispatcher.ts";
import { createRuntimeDispatchClaimEvents } from "../../src/runtime/dispatcher.ts";
import { planRuntimeDispatch } from "../../src/runtime/scheduler.ts";
import { buildWorkQueueView } from "../../src/views/work-queue.ts";

function planningEvent(traceId, workUnitId, pathScope) {
	const decisionRef = `trace:${traceId}:decision:iteration:1#row:DTR-${workUnitId}`;
	return {
		type: "trace_event",
		id: `${traceId}:planning:iteration:1`,
		parentId: null,
		traceId,
		sequence: 1,
		loop: "planning",
		event: "planning.iteration",
		refs: [decisionRef, pathScope],
		createdAt: "2026-06-11T00:00:01.000Z",
		data: {
			exit: { status: "exit", targetLoop: "implementation" },
			output: {
				workItems: [
					{
						id: workUnitId,
						title: `Work ${workUnitId}`,
						decisionRefs: [decisionRef],
						componentRefs: ["component.runtime"],
						pathScopes: [pathScope],
						dependsOn: [],
					},
				],
			},
		},
	};
}

function planningWorkRef(event, workUnitId) {
	return `trace:${event.id}#work:${workUnitId}`;
}

function plannedDispatch() {
	const first = planningEvent("TRACE-pi-a", "WU-a", "src/runtime");
	const second = planningEvent("TRACE-pi-b", "WU-b", "src/views");
	const queue = buildWorkQueueView({ records: [first, second] });
	const plan = planRuntimeDispatch(queue, { maxWorkers: 2 });
	const claimBatch = createRuntimeDispatchClaimEvents(plan, {
		createdAt: "2026-06-11T00:00:02.000Z",
		nextSequenceByTrace: {
			"TRACE-pi-a": 2,
			"TRACE-pi-b": 2,
		},
		workerIdPrefix: "pi-worker",
	});
	return { plan, claimBatch };
}

describe("Pi worker dispatcher seam", () => {
	it("creates scoped implementation worker prompts", () => {
		const { plan } = plannedDispatch();
		const prompt = createPiWorkerPrompt(plan.dispatch[0], {
			promptPrefix: "PREFIX",
			promptSuffix: "SUFFIX",
		});

		assert.equal(prompt.startsWith("PREFIX\nYou are a CodeWiki"), true);
		assert.equal(prompt.includes("Work unit: WU-a"), true);
		assert.equal(prompt.includes("Trace: TRACE-pi-a"), true);
		assert.equal(
			prompt.includes(
				`- ${planningWorkRef(planningEvent("TRACE-pi-a", "WU-a", "src/runtime"), "WU-a")}`,
			),
			true,
		);
		assert.equal(prompt.includes("- component.runtime"), true);
		assert.equal(prompt.includes("- src/runtime"), true);
		assert.equal(prompt.includes("Worker owns local TDD"), true);
		assert.equal(prompt.endsWith("SUFFIX"), true);
	});

	it("starts one injected Pi session per dispatched work unit", async () => {
		const { plan, claimBatch } = plannedDispatch();
		const created = [];
		const prompts = [];
		const sessionFactory = {
			async create(input) {
				created.push(input);
				return {
					sessionId: `session-${input.workerId}`,
					sessionFile: `/tmp/${input.workerId}.jsonl`,
					async prompt(text) {
						prompts.push(text);
					},
				};
			},
		};

		const results = await dispatchPiWorkers(plan, {
			claimEvents: claimBatch.events,
			sessionFactory,
		});

		assert.deepEqual(
			created.map((input) => [input.workUnitId, input.workerId]),
			[
				["WU-a", "pi-worker-001"],
				["WU-b", "pi-worker-002"],
			],
		);
		assert.equal(prompts.length, 2);
		assert.equal(prompts[0].includes("Work unit: WU-a"), true);
		assert.deepEqual(
			results.map((result) => [
				result.workUnitId,
				result.workerId,
				result.status,
				result.sessionId,
			]),
			[
				["WU-a", "pi-worker-001", "started", "session-pi-worker-001"],
				["WU-b", "pi-worker-002", "started", "session-pi-worker-002"],
			],
		);
	});

	it("returns failed worker start results without throwing", async () => {
		const { plan, claimBatch } = plannedDispatch();
		const results = await dispatchPiWorkers(plan, {
			claimEvents: claimBatch.events,
			sessionFactory: {
				async create(input) {
					if (input.workUnitId === "WU-b") throw new Error("spawn failed");
					return {
						async prompt() {},
					};
				},
			},
		});

		assert.equal(results[0].status, "started");
		assert.equal(results[1].status, "failed");
		assert.equal(results[1].error, "spawn failed");
	});

	it("disposes sessions when requested", async () => {
		const { plan, claimBatch } = plannedDispatch();
		let disposed = 0;
		await dispatchPiWorkers(plan, {
			claimEvents: claimBatch.events,
			disposeSessions: true,
			sessionFactory: {
				async create() {
					return {
						async prompt() {},
						dispose() {
							disposed += 1;
						},
					};
				},
			},
		});

		assert.equal(disposed, 2);
	});
});
