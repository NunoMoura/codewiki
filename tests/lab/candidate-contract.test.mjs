import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { decisionExitCandidate } from "../../lab/decision/exit.ts";
import { implementationExitCandidate } from "../../lab/implementation/exit.ts";
import { planningExitCandidate } from "../../lab/planning/exit.ts";
import {
	LAB_ALLOWED_CANDIDATE_IMPORTS,
	LAB_FORBIDDEN_CANDIDATE_IMPORTS,
	LAB_FORBIDDEN_CANDIDATE_TOKENS,
	LAB_LOCKED_EVALUATOR_FILES,
	LAB_LOOP_CANDIDATE_FILES,
} from "../../lab/runner/contract.ts";

const CANDIDATES = {
	decision: decisionExitCandidate,
	planning: planningExitCandidate,
	implementation: implementationExitCandidate,
};

const EXPECTED_METRICS = {
	decision: "DEC",
	planning: "PEC",
	implementation: "IEC",
};

describe("lab candidate contract", () => {
	it("declares the only experiment-editable candidate files", () => {
		assert.deepEqual(LAB_LOOP_CANDIDATE_FILES, {
			decision: "lab/decision/exit.ts",
			planning: "lab/planning/exit.ts",
			implementation: "lab/implementation/exit.ts",
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
				"lab/runner/contract.ts",
				"lab/runner/engine.ts",
				"lab/runner/holdout-score.ts",
				"lab/runner/holdout.ts",
				"lab/runner/score.ts",
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
			assert.equal(Array.isArray(candidate.standards), true);
			assert.equal(candidate.standards.length > 0, true);
			assertUnique(candidate.standards.map((standard) => standard.id));

			for (const standard of candidate.standards) {
				assert.equal(typeof standard.id, "string");
				assert.equal(standard.id.length > 0, true);
				assert.equal(standard.mode, "deterministic");
				assert.equal(typeof standard.weight, "number");
				assert.equal(standard.weight > 0, true);
				assert.equal(typeof standard.description, "string");
				assert.equal(standard.description.length > 0, true);
				assert.equal(typeof standard.evaluate, "function");
			}
		}
	});

	it("prevents candidate files from importing outside the allowlist", () => {
		assert.deepEqual(LAB_ALLOWED_CANDIDATE_IMPORTS, {
			decision: [
				"../../src/decision/exit.ts",
				"../../src/decision/types.ts",
				"../runner/types.ts",
			],
			planning: ["../../src/planning/exit.ts", "../runner/types.ts"],
			implementation: [
				"../../src/implementation/exit.ts",
				"../../src/implementation/types.ts",
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

function assertUnique(values) {
	assert.equal(new Set(values).size, values.length);
}
