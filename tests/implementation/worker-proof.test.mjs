import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	contentProofFromWorkerProof,
	detectImplementationWorkerProofConflicts,
	normalizeImplementationWorkerProof,
	workerProofRefs,
} from "../../src/implementation/worker-proof.ts";

describe("implementation worker proof normalization", () => {
	it("normalizes worker proof metadata deterministically", () => {
		const input = {
			worker_id: " worker-1 ",
			task_id: " WU-001 ",
			claim_id: " claim-1 ",
			planning_refs: ["trace:TRACE-proof:planning:iteration:1#work:WU-001"],
			base_sha: "aaa111",
			headSha: "bbb222",
			tree_sha: "ccc333",
			worktree_path: "/tmp/worktrees/WU-001",
			branch: "codewiki/TRACE-proof/WU-001/worker-1",
			changed_files: ["./src/b.ts", "src/a.ts", "src/a.ts", "src\\c.ts"],
			checks_run: ["npm test", "npm test"],
			validation_ref: "tests/implementation/worker-proof.test.mjs",
			clean: true,
			change_inputs: [
				{
					codePaths: ["src/d.ts"],
					checkResults: [{ command: "node --test worker", status: "pass" }],
				},
			],
		};
		const proof = normalizeImplementationWorkerProof(input);
		const proofAgain = normalizeImplementationWorkerProof({
			...input,
			changed_files: ["src\\c.ts", "src/a.ts", "./src/b.ts"],
		});

		assert.equal(proof.workerId, "worker-1");
		assert.equal(proof.workUnitId, "WU-001");
		assert.deepEqual(proof.changedPaths, [
			"src/a.ts",
			"src/b.ts",
			"src/c.ts",
			"src/d.ts",
		]);
		assert.deepEqual(proof.checks, ["node --test worker", "npm test"]);
		assert.equal(proof.validationVerdict, "pass");
		assert.equal(proof.clean, true);
		assert.match(proof.digest, /^sha256:[a-f0-9]{64}$/);
		assert.equal(proof.digest, proofAgain.digest);
		assert.deepEqual(contentProofFromWorkerProof(proof), {
			commit: "bbb222",
			tree: "ccc333",
		});
		assert.equal(workerProofRefs(proof).includes(proof.digest), true);
	});

	it("detects overlap, duplicate proof, and base mismatch conflicts", () => {
		const first = normalizeImplementationWorkerProof({
			workerId: "worker-1",
			workUnitId: "WU-001",
			baseSha: "base-a",
			changedPaths: ["src/shared.ts"],
			checks: ["npm test"],
		});
		const duplicate = normalizeImplementationWorkerProof({
			workerId: "worker-1",
			workUnitId: "WU-001",
			baseSha: "base-a",
			changedPaths: ["src/other.ts"],
			checks: ["npm test"],
		});
		const second = normalizeImplementationWorkerProof({
			workerId: "worker-2",
			workUnitId: "WU-002",
			baseSha: "base-b",
			changedPaths: ["src/shared.ts"],
			checks: ["npm test"],
		});

		const conflicts = detectImplementationWorkerProofConflicts([
			first,
			duplicate,
			second,
		]);

		assert.deepEqual(
			conflicts.map((conflict) => conflict.kind),
			["duplicate-worker-work", "base-mismatch", "file-overlap"],
		);
		assert.equal(
			conflicts.every((conflict) => conflict.severity === "block"),
			true,
		);
		assert.deepEqual(conflicts.at(-1).files, ["src/shared.ts"]);
		assert.deepEqual(
			detectImplementationWorkerProofConflicts([first], "other-base").map(
				(conflict) => conflict.kind,
			),
			["base-mismatch"],
		);
	});
});
