import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	executeRuntimeWorktreeCommands,
	planRuntimeDispatchWorktrees,
	WorktreeCommandExecutionError,
} from "../../src/git/worktrees.ts";
import { createShellWorktreeCommandRunner } from "../../src/git/worktree-shell-runner.ts";

function item(id, pathScopes = [`src/${id}.ts`]) {
	return {
		workUnitId: id,
		traceId: "TRACE-worktree",
		title: id,
		planningRefs: [`trace:TRACE-worktree:planning:iteration:1#work:${id}`],
		componentRefs: ["runtime"],
		pathScopes,
		traceRefs: [],
	};
}

describe("runtime worktree planning", () => {
	it("creates deterministic worktree refs and shell commands", () => {
		const [plan] = planRuntimeDispatchWorktrees([item("WU-one")], {
			mode: "worktree",
			repoRoot: "/tmp/repo/codewiki",
			projectName: "codewiki",
			baseSha: "abc1234",
			workerIds: { "WU-one": "worker-custom" },
		});

		assert.equal(plan.required, true);
		assert.equal(plan.reason, "policy_required");
		assert.equal(plan.workerId, "worker-custom");
		assert.equal(
			plan.worktree?.path,
			"/tmp/repo/.codewiki-worktrees/codewiki/TRACE-worktree/WU-one/worker-custom",
		);
		assert.equal(
			plan.worktree?.branch,
			"codewiki/TRACE-worktree/WU-one/worker-custom",
		);
		assert.equal(plan.worktree?.baseRef, "abc1234");
		assert.equal(plan.worktree?.baseSha, "abc1234");
		assert.deepEqual(plan.commands.worktreePrepare, [
			'git worktree add -B "codewiki/TRACE-worktree/WU-one/worker-custom" "/tmp/repo/.codewiki-worktrees/codewiki/TRACE-worktree/WU-one/worker-custom" "abc1234"',
		]);
	});

	it("adds optional setup commands to explicit worktree prepare", async () => {
		const [plan] = planRuntimeDispatchWorktrees([item("WU-one")], {
			mode: "worktree",
			repoRoot: "/tmp/repo/codewiki",
			setupCommands: ["npm install", "npm test -- --runInBand"],
		});

		assert.deepEqual(plan.commands.worktreePrepare.slice(1), [
			"npm install",
			"npm test -- --runInBand",
		]);

		const dryRun = await executeRuntimeWorktreeCommands(plan, {
			steps: ["worktree.prepare"],
		});
		assert.deepEqual(
			dryRun.records.map((record) => [
				record.commandIndex,
				record.command,
				record.skipped,
			]),
			[
				[0, plan.commands.worktreePrepare[0], true],
				[1, "npm install", true],
				[2, "npm test -- --runInBand", true],
			],
		);
	});

	it("dry-runs planned worktree commands by default", async () => {
		const [plan] = planRuntimeDispatchWorktrees([item("WU-one")], {
			mode: "worktree",
			repoRoot: "/tmp/repo/codewiki",
		});
		const result = await executeRuntimeWorktreeCommands(plan);

		assert.equal(result.dryRun, true);
		assert.deepEqual(result.steps, ["worktree.prepare", "worktree.verify"]);
		assert.deepEqual(
			result.records.map((record) => [
				record.step,
				record.commandIndex,
				record.skipped,
			]),
			[
				["worktree.prepare", 0, true],
				["worktree.verify", 0, true],
				["worktree.verify", 1, true],
			],
		);
		assert.equal(result.records[0].workUnitId, "WU-one");
	});

	it("executes worktree commands only with an explicit runner", async () => {
		const [plan] = planRuntimeDispatchWorktrees([item("WU-one")], {
			mode: "worktree",
			repoRoot: "/tmp/repo/codewiki",
		});
		await assert.rejects(
			() => executeRuntimeWorktreeCommands(plan, { dryRun: false }),
			/requires a runner/,
		);

		const calls = [];
		const result = await executeRuntimeWorktreeCommands(plan, {
			dryRun: false,
			steps: ["worktree.prepare", "worktree.cleanup"],
			runner(command, context) {
				calls.push([context.step, context.commandIndex, command]);
				return { stdout: `${context.step}:${context.commandIndex}` };
			},
		});

		assert.deepEqual(
			calls.map(([step, index]) => [step, index]),
			[
				["worktree.prepare", 0],
				["worktree.cleanup", 0],
				["worktree.cleanup", 1],
			],
		);
		assert.equal(result.dryRun, false);
		assert.equal(result.records[0].skipped, false);
		assert.equal(result.records[0].stdout, "worktree.prepare:0");
	});

	it("stops explicit command execution on non-zero exit", async () => {
		const [plan] = planRuntimeDispatchWorktrees([item("WU-one")], {
			mode: "worktree",
			repoRoot: "/tmp/repo/codewiki",
		});

		await assert.rejects(
			() =>
				executeRuntimeWorktreeCommands(plan, {
					dryRun: false,
					runner(_command, context) {
						return context.step === "worktree.verify" &&
							context.commandIndex === 0
							? { stderr: "bad worktree", exitCode: 2 }
							: { exitCode: 0 };
					},
				}),
			(error) => {
				assert.equal(error instanceof WorktreeCommandExecutionError, true);
				assert.equal(error.record.step, "worktree.verify");
				assert.equal(error.record.stderr, "bad worktree");
				assert.equal(error.record.exitCode, 2);
				return true;
			},
		);
	});

	it("creates an explicit host shell runner for worktree commands", async () => {
		const [plan] = planRuntimeDispatchWorktrees([item("WU-one")], {
			mode: "worktree",
			repoRoot: "/tmp/repo/codewiki",
		});
		const calls = [];
		const runner = createShellWorktreeCommandRunner({
			cwd: "/tmp/repo/codewiki",
			env: { CODEWIKI_TEST: "1" },
			timeoutMs: 123,
			maxBufferBytes: 456,
			shell: "/bin/sh",
			exec(command, options, callback) {
				calls.push({ command, options });
				callback(null, "verified\n", "");
			},
		});

		const result = await executeRuntimeWorktreeCommands(plan, {
			dryRun: false,
			steps: ["worktree.verify"],
			runner,
		});

		assert.equal(calls.length, 2);
		assert.equal(calls[0].options.cwd, "/tmp/repo/codewiki");
		assert.deepEqual(calls[0].options.env, { CODEWIKI_TEST: "1" });
		assert.equal(calls[0].options.timeout, 123);
		assert.equal(calls[0].options.maxBuffer, 456);
		assert.equal(calls[0].options.shell, "/bin/sh");
		assert.equal(calls[0].options.windowsHide, true);
		assert.equal(result.records[0].stdout, "verified\n");
		assert.equal(result.records[0].exitCode, 0);
	});

	it("surfaces shell runner failures through worktree execution records", async () => {
		const [plan] = planRuntimeDispatchWorktrees([item("WU-one")], {
			mode: "worktree",
			repoRoot: "/tmp/repo/codewiki",
		});
		const runner = createShellWorktreeCommandRunner({
			exec(_command, _options, callback) {
				const error = new Error("Command failed");
				error.code = 2;
				callback(error, "", "bad worktree");
			},
		});

		await assert.rejects(
			() =>
				executeRuntimeWorktreeCommands(plan, {
					dryRun: false,
					steps: ["worktree.verify"],
					runner,
				}),
			(error) => {
				assert.equal(error instanceof WorktreeCommandExecutionError, true);
				assert.equal(error.record.stderr, "bad worktree");
				assert.equal(error.record.exitCode, 2);
				return true;
			},
		);
	});

	it("auto mode isolates parallel or dirty overlapping work only", () => {
		const parallel = planRuntimeDispatchWorktrees(
			[item("WU-one"), item("WU-two")],
			{ mode: "auto", repoRoot: "/tmp/repo/codewiki" },
		);
		const cleanSolo = planRuntimeDispatchWorktrees([item("WU-one")], {
			mode: "auto",
			repoRoot: "/tmp/repo/codewiki",
		});
		const dirtySolo = planRuntimeDispatchWorktrees(
			[item("WU-one", ["src/runtime"])],
			{
				mode: "auto",
				repoRoot: "/tmp/repo/codewiki",
				dirtyPaths: ["src/runtime/policy.ts"],
			},
		);
		const dirtyGlobSolo = planRuntimeDispatchWorktrees(
			[item("WU-one", ["src/pi/**"])],
			{
				mode: "auto",
				repoRoot: "/tmp/repo/codewiki",
				dirtyPaths: ["src/pi/rendering/tool-renderers.ts"],
			},
		);
		const unrelatedDirtySolo = planRuntimeDispatchWorktrees(
			[item("WU-one", ["src/decision"])],
			{
				mode: "auto",
				repoRoot: "/tmp/repo/codewiki",
				dirtyPaths: ["src/planning/exit.ts"],
			},
		);

		assert.deepEqual(
			parallel.map((plan) => plan.reason),
			["parallel_dispatch", "parallel_dispatch"],
		);
		assert.equal(cleanSolo[0].required, false);
		assert.equal(cleanSolo[0].commands.worktreePrepare.length, 0);
		assert.equal(dirtySolo[0].reason, "dirty_working_tree_overlap");
		assert.equal(dirtyGlobSolo[0].reason, "dirty_working_tree_overlap");
		assert.equal(unrelatedDirtySolo[0].required, false);
	});
});
