import assert from "node:assert/strict";
import {
	mkdtempSync,
	rmSync,
	mkdirSync,
	writeFileSync,
	readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import {
	findCandidateLoopFiles,
	runLabExperiment,
} from "../../lab/runner/experiment-runner.ts";

const tempRoots = [];

afterEach(() => {
	while (tempRoots.length > 0) {
		rmSync(tempRoots.pop(), { recursive: true, force: true });
	}
});

function tempRoot() {
	const root = mkdtempSync(join(tmpdir(), "codewiki-experiment-test-"));
	tempRoots.push(root);
	return root;
}

describe("lab experiment runner", () => {
	it("rejects candidate dirs with files outside lab loop candidates", () => {
		const root = tempRoot();
		mkdirSync(join(root, "lab", "decision"), { recursive: true });
		writeFileSync(join(root, "lab", "decision", "loop.ts"), "export {};\n");
		writeFileSync(join(root, "README.md"), "nope\n");

		assert.throws(() => findCandidateLoopFiles(root), /unexpected: README\.md/);
	});

	it("detects allowed candidate loop files", () => {
		const root = tempRoot();
		mkdirSync(join(root, "lab", "planning"), { recursive: true });
		writeFileSync(join(root, "lab", "planning", "loop.ts"), "export {};\n");

		assert.deepEqual(findCandidateLoopFiles(root), ["lab/planning/loop.ts"]);
	});

	it("runs visible lab gate in an isolated worktree", async () => {
		const report = await runLabExperiment({
			commands: ["visible_gate"],
		});

		assert.equal(report.status, "pass");
		assert.equal(report.worktree.kept, false);
		assert.equal(report.candidateFiles.length, 0);
		assert.equal(report.commands[0].name, "visible_gate");
		assert.equal(report.visible.status, "pass");
		assert.equal(report.visible.metrics.decision.score, 100);
	});

	it("applies allowed candidate loop files inside the isolated worktree", async () => {
		const root = tempRoot();
		mkdirSync(join(root, "lab", "decision"), { recursive: true });
		writeFileSync(
			join(root, "lab", "decision", "loop.ts"),
			readFileSync("lab/decision/loop.ts"),
		);

		const report = await runLabExperiment({
			candidateDir: root,
			commands: ["visible_gate"],
		});

		assert.deepEqual(report.candidateFiles, ["lab/decision/loop.ts"]);
		assert.equal(report.status, "pass");
	});

	it("redacts sealed evaluator command output", async () => {
		const report = await runLabExperiment({
			commands: ["judge_calibration"],
		});

		assert.equal(report.status, "fail");
		assert.equal(report.commands[0].name, "judge_calibration");
		assert.deepEqual(report.commands[0].stdoutTail, []);
		assert.deepEqual(report.commands[0].stderrTail, []);
	});
});
