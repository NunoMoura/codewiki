import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { normalizeImplementationChanges } from "../../src/implementation/evidence.ts";
import { createImplementationMergeContentProof } from "../../src/implementation/merge-proof.ts";

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-merge-proof-"));
	await mkdir(join(root, "src"), { recursive: true });
	await mkdir(join(root, "tests"), { recursive: true });
	await writeFile(
		join(root, "src", "feature.ts"),
		"export const feature = true;\n",
	);
	await writeFile(
		join(root, "tests", "feature.test.mjs"),
		"assert.ok(true);\n",
	);
	return root;
}

function changes(planningRef) {
	return normalizeImplementationChanges([
		{
			id: "CH-merge-proof",
			planningRefs: [planningRef],
			codePaths: ["src/feature.ts"],
			testPaths: ["tests/feature.test.mjs"],
		},
	]);
}

function workerReport(planningRef, overrides = {}) {
	return {
		workerId: "worker-merge-proof",
		workUnitId: "WU-merge-proof",
		claimId: "claim-merge-proof",
		planningRefs: [planningRef],
		status: "completed",
		changedFiles: ["src/feature.ts", "tests/feature.test.mjs"],
		workingTreeDigest: "sha256:worker-local",
		checksRun: ["node --test tests/feature.test.mjs"],
		...overrides,
	};
}

describe("implementation merge content proof", () => {
	it("creates aggregate proof from merged worker paths", async () => {
		const root = await fixture();
		try {
			const planningRef =
				"trace:TRACE-merge-proof:planning:iteration:1#work:WU-merge-proof";
			const result = await createImplementationMergeContentProof({
				repoRoot: root,
				changes: changes(planningRef),
				workerReports: [workerReport(planningRef)],
			});

			assert.deepEqual(result.proofPaths, [
				"src/feature.ts",
				"tests/feature.test.mjs",
			]);
			assert.match(
				result.aggregateContentProof?.workingTreeDigest,
				/^sha256:[a-f0-9]{64}$/,
			);
			assert.deepEqual(result.workerIds, ["worker-merge-proof"]);
			assert.deepEqual(result.workUnitIds, ["WU-merge-proof"]);
			assert.equal(result.workerProofDigests.length, 1);
			assert.equal(
				result.workerProofRefs.includes("sha256:worker-local"),
				true,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("requires worker changed paths to exist in the merged tree", async () => {
		const root = await fixture();
		try {
			const planningRef =
				"trace:TRACE-merge-proof:planning:iteration:1#work:WU-merge-proof";
			await assert.rejects(
				() =>
					createImplementationMergeContentProof({
						repoRoot: root,
						workerReports: [
							workerReport(planningRef, {
								changedFiles: ["src/missing.ts"],
							}),
						],
					}),
				/Missing working-tree digest path: src\/missing\.ts/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("accepts explicit aggregate proof without executing Git or reading paths", async () => {
		const result = await createImplementationMergeContentProof({
			repoRoot: "/missing/repo",
			proofPaths: ["src/missing.ts"],
			aggregateContentProof: { tree: "git:tree:merged" },
		});

		assert.deepEqual(result.proofPaths, ["src/missing.ts"]);
		assert.deepEqual(result.aggregateContentProof, { tree: "git:tree:merged" });
	});
});
