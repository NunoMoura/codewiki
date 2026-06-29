import assert from "node:assert/strict";
import { test } from "node:test";

import { runLoopGraph } from "../../src/loops/runner.ts";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function node(id, run, options = {}) {
	return {
		id,
		description: id,
		method: "deterministic",
		gate: "soft",
		cost: 1,
		run,
		...options,
	};
}

test("runs independent loop standards in parallel", async () => {
	const events = [];
	const report = await runLoopGraph({
		graphId: "test.loop",
		graphVersion: "test",
		context: {},
		nodes: [
			node("left", async () => {
				events.push("left-start");
				await sleep(20);
				events.push("left-end");
				return { status: "pass" };
			}),
			node("right", async () => {
				events.push("right-start");
				await sleep(20);
				events.push("right-end");
				return { status: "pass" };
			}),
		],
	});

	assert.equal(report.status, "pass");
	assert.ok(events.indexOf("right-start") < events.indexOf("left-end"));
	assert.ok(events.indexOf("left-start") < events.indexOf("right-end"));
});

test("skips dependent work after a hard gate fails", async () => {
	let ranExpensive = false;
	const report = await runLoopGraph({
		graphId: "test.loop",
		graphVersion: "test",
		context: {},
		nodes: [
			node(
				"hard-gate",
				() => ({
					status: "fail",
					diagnostics: [
						{
							standardId: "hard-gate",
							severity: "blocking",
							message: "missing required route authority",
							refs: [],
						},
					],
				}),
				{ gate: "hard" },
			),
			node(
				"expensive-judge",
				() => {
					ranExpensive = true;
					return { status: "pass" };
				},
				{ method: "model_judge", dependsOn: ["hard-gate"], cost: 10 },
			),
		],
	});

	assert.equal(report.status, "fail");
	assert.equal(ranExpensive, false);
	assert.equal(
		report.nodes.find((item) => item.id === "expensive-judge").status,
		"skip",
	);
	assert.equal(
		report.diagnostics[0].message,
		"missing required route authority",
	);
});

test("turns standard runner timeout into a blocking diagnostic", async () => {
	const report = await runLoopGraph({
		graphId: "test.loop",
		graphVersion: "test",
		context: {},
		nodes: [
			node(
				"slow-standard",
				async () => {
					await sleep(30);
					return { status: "pass" };
				},
				{ gate: "hard", timeoutMs: 1 },
			),
		],
	});

	assert.equal(report.status, "block");
	assert.match(report.diagnostics[0].message, /timed out/);
});
