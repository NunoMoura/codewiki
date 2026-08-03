import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { decisionLoopCandidate } from "../../lab/decision/loop.ts";
import { implementationLoopCandidate } from "../../lab/implementation/loop.ts";
import { planningLoopCandidate } from "../../lab/planning/loop.ts";
import {
	LAB_ALLOWED_CANDIDATE_IMPORTS,
	LAB_FORBIDDEN_CANDIDATE_IMPORTS,
	LAB_FORBIDDEN_CANDIDATE_TOKENS,
	LAB_LOCKED_EVALUATOR_FILES,
	LAB_LOOP_CANDIDATE_FILES,
} from "../../lab/runner/contract.ts";

const CANDIDATES = {
	decision: decisionLoopCandidate,
	planning: planningLoopCandidate,
	implementation: implementationLoopCandidate,
};

const EXPECTED_METRICS = {
	decision: "DEC",
	planning: "PEC",
	implementation: "IEC",
};

const EXPECTED_GRAPH_IDS = {
	decision: "codewiki.decision.change",
	planning: "codewiki.planning.portfolio",
	implementation: "implementation.loop",
};

const EXPECTED_SCHEMA_VERSIONS = {
	decision: 1,
	planning: 1,
	implementation: 3,
};

describe("lab candidate contract", () => {
	it("declares the only experiment-editable candidate files", () => {
		assert.deepEqual(LAB_LOOP_CANDIDATE_FILES, {
			decision: "lab/decision/loop.ts",
			planning: "lab/planning/loop.ts",
			implementation: "lab/implementation/loop.ts",
		});
		for (const filePath of Object.values(LAB_LOOP_CANDIDATE_FILES)) {
			assert.equal(existsSync(filePath), true, filePath);
		}
	});

	it("declares locked evaluator files outside candidate edit scope", () => {
		assert.deepEqual(
			[...LAB_LOCKED_EVALUATOR_FILES].sort(),
			[
				"lab/decision/cases.ts",
				"lab/decision/score.ts",
				"lab/implementation/cases.ts",
				"lab/implementation/score.ts",
				"lab/pipeline/cases.ts",
				"lab/pipeline/score.ts",
				"lab/pipeline/trace-harness.ts",
				"lab/pipeline/types.ts",
				"lab/planning/cases.ts",
				"lab/planning/score.ts",
				"lab/program.md",
				"lab/runner/contract.ts",
				"lab/runner/engine.ts",
				"lab/runner/experiment-budget.ts",
				"lab/runner/experiment-runner.ts",
				"lab/runner/graph.ts",
				"lab/runner/judge-calibration.ts",
				"lab/runner/judge-smoke.ts",
				"lab/runner/holdout-score.ts",
				"lab/runner/holdout.ts",
				"lab/runner/objective.ts",
				"lab/runner/quality-pack.ts",
				"lab/runner/score.ts",
				"lab/runner/security-calibration.ts",
				"lab/runner/sealed-check.ts",
				"lab/runner/sealed-template.ts",
				"lab/runner/trace-forge.ts",
				"lab/runner/types.ts",
			].sort(),
		);
		for (const filePath of LAB_LOCKED_EVALUATOR_FILES) {
			assert.equal(existsSync(filePath), true, filePath);
		}
		for (const filePath of Object.values(LAB_LOOP_CANDIDATE_FILES)) {
			assert.equal(LAB_LOCKED_EVALUATOR_FILES.includes(filePath), false);
		}
	});

	it("keeps candidate modules standards-only and deterministic", () => {
		for (const [loop, candidate] of Object.entries(CANDIDATES)) {
			assert.equal(candidate.loop, loop);
			assert.equal(candidate.metric, EXPECTED_METRICS[loop]);
			assert.equal(candidate.graphId, `${EXPECTED_GRAPH_IDS[loop]}.lab`);
			assert.equal(typeof candidate.graphVersion, "string");
			assert.equal(candidate.schemaVersion, EXPECTED_SCHEMA_VERSIONS[loop]);
			assert.equal(Array.isArray(candidate.layers), true);
			assert.equal(Array.isArray(candidate.standards), true);
			assert.equal(candidate.standards.length > 0, true);
			assert.equal(candidate.qualityPack.id, `codewiki.lab.${loop}`);
			assert.equal(candidate.qualityPack.authority, "lab");
			assert.equal(candidate.qualityPack.rollout, "observe");
			assert.equal(candidate.qualityPack.graph.graphId, `${loop}.loop`);
			assert.deepEqual(
				candidate.qualityPack.standards.map((standard) => standard.id),
				candidate.standards.map((standard) => standard.id),
			);
			assertUnique(candidate.standards.map((standard) => standard.id));
			assertLayerCoverage(loop, candidate.standards);

			for (const standard of candidate.standards) {
				assert.equal(typeof standard.id, "string");
				assert.equal(standard.id.length > 0, true);
				assert.equal(
					["deterministic", "agent", "user"].includes(standard.mode),
					true,
				);
				assert.equal(typeof standard.standardType, "string");
				assert.equal(typeof standard.layer, "string");
				assert.equal(typeof standard.repairTarget, "string");
				assert.equal(typeof standard.weight, "number");
				assert.equal(standard.weight > 0, true);
				assert.equal(typeof standard.cost, "number");
				assert.equal(standard.cost > 0, true);
				assert.equal(typeof standard.description, "string");
				assert.equal(standard.description.length > 0, true);
				assert.equal(typeof standard.evaluate, "function");
			}
		}
	});

	it("prevents candidate files from importing outside the allowlist", () => {
		assert.deepEqual(LAB_ALLOWED_CANDIDATE_IMPORTS, {
			decision: ["../runner/quality-pack.ts", "../runner/types.ts"],
			planning: ["../runner/quality-pack.ts", "../runner/types.ts"],
			implementation: [
				"../../src/implementation/loop.ts",
				"../../src/implementation/types.ts",
				"../runner/quality-pack.ts",
				"../runner/types.ts",
			],
		});
		for (const [loop, filePath] of Object.entries(LAB_LOOP_CANDIDATE_FILES)) {
			const source = readFileSync(filePath, "utf8");
			const imports = importSpecifiers(source);
			for (const importSpecifier of imports) {
				assert.equal(
					LAB_ALLOWED_CANDIDATE_IMPORTS[loop].includes(importSpecifier),
					true,
					`${loop} candidate imports non-allowlisted module ${importSpecifier}`,
				);
			}
		}
	});

	it("prevents candidate files from importing locked cases, scores, or host IO", () => {
		for (const [loop, filePath] of Object.entries(LAB_LOOP_CANDIDATE_FILES)) {
			const source = readFileSync(filePath, "utf8");
			const imports = importSpecifiers(source);
			for (const forbidden of LAB_FORBIDDEN_CANDIDATE_IMPORTS) {
				assert.equal(
					imports.includes(forbidden),
					false,
					`${loop} candidate imports forbidden module ${forbidden}`,
				);
			}
			for (const token of LAB_FORBIDDEN_CANDIDATE_TOKENS) {
				assert.equal(
					source.includes(token),
					false,
					`${loop} candidate contains forbidden token ${token}`,
				);
			}
		}
	});
});

function importSpecifiers(source) {
	return [
		...source.matchAll(
			/(?:import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+|import\s+)["']([^"']+)["']/g,
		),
	].map((match) => match[1]);
}

function assertLayerCoverage(loop, standards) {
	const layers = new Set(standards.map((standard) => standard.layer));
	for (const layer of ["hard_gate"]) {
		assert.equal(
			layers.has(layer),
			true,
			`${loop} candidate missing ${layer} quality-graph layer`,
		);
	}
}

function assertUnique(values) {
	assert.equal(new Set(values).size, values.length);
}
