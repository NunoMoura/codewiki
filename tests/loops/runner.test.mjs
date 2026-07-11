import assert from "node:assert/strict";
import { test } from "node:test";

import { parseLoopQualityPack } from "../../src/loops/quality-pack.ts";
import {
	composeLoopQualityPacks,
	runLoopGraph,
} from "../../src/loops/runner.ts";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function qualityPack({
	id,
	rollout,
	standardId,
	dependsOn = [],
	evidenceAdapterIds = ["trace_refs"],
}) {
	return parseLoopQualityPack({
		schemaVersion: 1,
		id,
		version: "1.0.0",
		authority: rollout === "observe" ? "lab" : "official",
		rollout,
		graph: {
			id: "decision.loop",
			version: "pack-v1",
			layers: ["hard_gate"],
		},
		standards: [
			{
				id: standardId,
				description: standardId,
				layer: "hard_gate",
				standardType: "loop_contract",
				method: "deterministic",
				repairTarget: "decision",
				weight: 1,
				cost: 1,
				gate: "hard",
				timeoutMs: 100,
				dependsOn,
				evaluatorId: "issue_codes",
				evidenceAdapterIds,
				issuePredicate: {
					kind: "issue_codes",
					match: "any",
					codes: [`${standardId}_issue`],
				},
			},
		],
	});
}

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

test("composes validated quality packs through CodeWiki-owned registries", () => {
	const base = qualityPack({
		id: "codewiki.base",
		rollout: "enforce",
		standardId: "base",
	});
	const observed = qualityPack({
		id: "codewiki.observed",
		rollout: "observe",
		standardId: "observed",
	});
	const composition = composeLoopQualityPacks({ packs: [observed, base] });

	assert.equal(composition.graph.graphId, "decision.loop");
	assert.equal(composition.graph.schemaVersion, 3);
	assert.deepEqual(
		composition.graph.nodes.map((item) => [
			item.id,
			item.packId,
			item.rollout,
		]),
		[
			["base", "codewiki.base", "enforce"],
			["observed", "codewiki.observed", "observe"],
		],
	);
	assert.deepEqual(composition.graph.nodes[1].dependsOn, []);
});

test("rejects unregistered pack evaluators and evidence adapters before execution", () => {
	const pack = qualityPack({
		id: "codewiki.base",
		rollout: "enforce",
		standardId: "base",
	});
	assert.throws(
		() =>
			composeLoopQualityPacks({
				packs: [pack],
				registry: {
					evaluatorIds: [],
					evidenceAdapterIds: ["trace_refs"],
				},
			}),
		/pack codewiki\.base standard base evaluator issue_codes is not registered/,
	);
	assert.throws(
		() =>
			composeLoopQualityPacks({
				packs: [pack],
				registry: {
					evaluatorIds: ["issue_codes"],
					evidenceAdapterIds: [],
				},
			}),
		/pack codewiki\.base standard base evidence adapter trace_refs is not registered/,
	);
});

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

test("attributes each skipped node to its own failed dependency", async () => {
	const report = await runLoopGraph({
		graphId: "test.loop",
		graphVersion: "test",
		context: {},
		failFastHardGates: false,
		nodes: [
			node("hard-a", () => ({ status: "fail" }), { gate: "hard" }),
			node("hard-b", () => ({ status: "fail" }), { gate: "hard" }),
			node("dependent-a", () => ({ status: "pass" }), {
				dependsOn: ["hard-a"],
			}),
			node("dependent-b", () => ({ status: "pass" }), {
				dependsOn: ["hard-b"],
			}),
		],
	});

	assert.equal(
		report.nodes.find((item) => item.id === "dependent-a").skippedBy,
		"hard-a",
	);
	assert.equal(
		report.nodes.find((item) => item.id === "dependent-b").skippedBy,
		"hard-b",
	);
});

test("clears a node timeout after the node settles", async () => {
	const originalSetTimeout = globalThis.setTimeout;
	const originalClearTimeout = globalThis.clearTimeout;
	const timeoutHandle = { unref() {} };
	let cleared = false;
	globalThis.setTimeout = () => timeoutHandle;
	globalThis.clearTimeout = (handle) => {
		if (handle === timeoutHandle) cleared = true;
	};
	try {
		await runLoopGraph({
			graphId: "test.loop",
			graphVersion: "test",
			context: {},
			nodes: [
				node("timed-standard", () => ({ status: "pass" }), {
					timeoutMs: 1_000,
				}),
			],
		});
	} finally {
		globalThis.setTimeout = originalSetTimeout;
		globalThis.clearTimeout = originalClearTimeout;
	}

	assert.equal(cleared, true);
});
