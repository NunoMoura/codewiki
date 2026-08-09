import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	collectGitStatusSnapshot,
	parseGitPorcelainPaths,
	runtimeWorktreeInputsFromGitStatus,
} from "../../src/git/status.ts";

describe("git status snapshot helper", () => {
	it("parses dirty paths from porcelain output", () => {
		assert.deepEqual(
			parseGitPorcelainPaths(
				[
					" M src/a.ts",
					"?? tests/a.test.mjs",
					"R  src/new.ts",
					"src/old.ts",
					"C  src/copy.ts",
					"src/source.ts",
					"",
				].join("\0"),
			),
			[
				"src/a.ts",
				"src/copy.ts",
				"src/new.ts",
				"src/old.ts",
				"src/source.ts",
				"tests/a.test.mjs",
			],
		);
	});

	it("collects base SHA and dirty paths with read-only git commands", async () => {
		const calls = [];
		const runner = (args, context) => {
			calls.push([context.purpose, args]);
			const command = args.join(" ");
			if (command === "rev-parse --show-toplevel") {
				return { stdout: "/repo/codewiki\n" };
			}
			if (command === "rev-parse --verify main") {
				return { stdout: "abc1234\n" };
			}
			if (command === "status --porcelain=v1 -z") {
				return { stdout: " M src/runtime/claims/policy.ts\0?? tests/new.test.mjs\0" };
			}
			return { stderr: `unexpected ${command}`, exitCode: 1 };
		};

		const snapshot = await collectGitStatusSnapshot({
			repoRoot: "/repo/codewiki",
			baseRef: "main",
			runner,
		});
		const inputs = runtimeWorktreeInputsFromGitStatus(snapshot);

		assert.equal(snapshot.isGitRepository, true);
		assert.equal(snapshot.gitRoot, "/repo/codewiki");
		assert.equal(snapshot.baseRef, "main");
		assert.equal(snapshot.baseSha, "abc1234");
		assert.deepEqual(snapshot.dirtyPaths, [
			"src/runtime/claims/policy.ts",
			"tests/new.test.mjs",
		]);
		assert.deepEqual(snapshot.errors, []);
		assert.deepEqual(inputs, {
			baseRef: "abc1234",
			baseSha: "abc1234",
			dirtyPaths: ["src/runtime/claims/policy.ts", "tests/new.test.mjs"],
		});
		assert.deepEqual(
			calls.map(([, args]) => args),
			[
				["rev-parse", "--show-toplevel"],
				["rev-parse", "--verify", "main"],
				["status", "--porcelain=v1", "-z"],
			],
		);
	});

	it("returns non-git snapshot unless strict mode is requested", async () => {
		const runner = () => ({ stderr: "not a git repository", exitCode: 128 });
		const snapshot = await collectGitStatusSnapshot({
			repoRoot: "/tmp/not-git",
			runner,
		});

		assert.equal(snapshot.isGitRepository, false);
		assert.equal(snapshot.baseRef, "HEAD");
		assert.deepEqual(snapshot.dirtyPaths, []);
		assert.deepEqual(snapshot.errors, ["not a git repository"]);
		await assert.rejects(
			() =>
				collectGitStatusSnapshot({
					repoRoot: "/tmp/not-git",
					runner,
					strict: true,
				}),
			/not a git repository/,
		);
	});
});
