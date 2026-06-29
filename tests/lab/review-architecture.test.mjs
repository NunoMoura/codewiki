import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
	createImplementationEvidenceReport,
	evaluateCommonReviewEvidence,
} from "../../src/implementation/review/index.ts";

describe("review architecture regressions", () => {
	it("keeps pi-lens and pi-posher out of runtime dependencies", async () => {
		const packageJson = JSON.parse(await readFile("package.json", "utf8"));
		const runtimeDependencies = {
			...(packageJson.dependencies || {}),
			...(packageJson.peerDependencies || {}),
			...(packageJson.optionalDependencies || {}),
		};

		assert.equal(runtimeDependencies["pi-lens"], undefined);
		assert.equal(runtimeDependencies["pi-posher"], undefined);
	});

	it("treats clean tool output without acceptance evidence as a false pass trap", () => {
		const report = createImplementationEvidenceReport({
			changedPaths: ["src/implementation/review/quality-nodes.ts"],
			checks: [
				{
					command: "npm run typecheck",
					status: "pass",
					outputRef: "tsconfig.json",
				},
			],
		});
		const result = evaluateCommonReviewEvidence({
			report,
			acceptanceRequirements: [
				{
					planningRef:
						"trace:TRACE-owned-implementation-review-sprint:planning:iteration:3#work:WU-lab-and-regression-coverage",
					criterionId: "AC-002",
				},
			],
		});

		assert.equal(result.passed, false);
		assert.equal(
			result.findings[0].code,
			"review_missing_acceptance_evidence_link",
		);
	});
});
