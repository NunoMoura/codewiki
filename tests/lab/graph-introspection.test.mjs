import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildLabGraphReport } from "../../lab/runner/graph.ts";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

describe("lab graph introspection", () => {
	it("exposes the lab graph command", () => {
		assert.equal(
			packageJson.scripts["lab:graph"],
			"node --experimental-strip-types lab/runner/graph.ts",
		);
	});

	it("summarizes production and candidate graphs by loop", () => {
		const report = buildLabGraphReport();

		assert.equal(report.version, 1);
		assert.deepEqual(
			report.loops.map((loop) => loop.loop),
			["decision", "planning", "implementation"],
		);
		for (const loopReport of report.loops) {
			assert.equal(loopReport.production.graphId, `${loopReport.loop}.loop`);
			assert.equal(loopReport.candidate.graphId, `${loopReport.loop}.loop.lab`);
			assert.match(loopReport.production.hash, /^sha256:/);
			assert.match(loopReport.candidate.hash, /^sha256:/);
			assert.equal(loopReport.production.nodeCount > 0, true);
			assert.equal(loopReport.candidate.nodeCount > 0, true);
			assert.equal(loopReport.production.layers.length > 0, true);
			assert.equal(loopReport.candidate.layers.length > 0, true);
			assert.deepEqual(loopReport.candidate.qualityPack, {
				id: `codewiki.lab.${loopReport.loop}`,
				version: loopReport.candidate.graphVersion,
				authority: "lab",
				rollout: "observe",
			});
			assert.equal(Array.isArray(loopReport.diff.layerDeltas), true);
		}
	});
});
