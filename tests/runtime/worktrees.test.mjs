import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	executeRuntimeWorktreeCommands,
	planRuntimeWorkUnitClaimWorktrees,
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
	it("creates deterministic worktree refs and process commands", () => {
		const [plan] = planRuntimeWorkUnitClaimWorktrees([item("WU-one")], {
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
			"/tmp/repo/codewiki/.codewiki/runtime/tmp/TRACE-worktree/worktree/WU-one/worker-custom",
		);
		assert.equal(
			plan.worktree?.branch,
			"codewiki/TRACE-worktree/WU-one/worker-custom",
		);
		assert.equal(plan.worktree?.baseRef, "abc1234");
		assert.equal(plan.worktree?.baseSha, "abc1234");
		assert.deepEqual(plan.commands.worktreePrepare, [
			{
				executable: "git",
				args: [
					"worktree",
					"add",
					"-B",
					"codewiki/TRACE-worktree/WU-one/worker-custom",
					"/tmp/repo/codewiki/.codewiki/runtime/tmp/TRACE-worktree/worktree/WU-one/worker-custom",
					"abc1234",
				],
			},
		]);
	});

	it("keeps explicit worktree roots available for custom hosts", () => {
		const [plan] = planRuntimeWorkUnitClaimWorktrees([item("WU-one")], {
			mode: "worktree",
			repoRoot: "/tmp/repo/codewiki",
			worktreeRoot: "/sandbox/custom-worktrees",
			workerIds: { "WU-one": "worker-custom" },
		});

		assert.equal(
			plan.worktree?.path,
			"/sandbox/custom-worktrees/TRACE-worktree/WU-one/worker-custom",
		);
	});

	it("keeps generated command arguments literal", () => {
		const baseRef = "refs/heads/main$(touch should-not-run)";
		const [plan] = planRuntimeWorkUnitClaimWorktrees([item("WU-one")], {
			mode: "worktree",
			repoRoot: "/tmp/repo/codewiki",
			worktreeRoot: "/sandbox/$(touch should-not-run)",
			baseRef,
		});

		const command = plan.commands.worktreePrepare[0];
		assert.equal(typeof command, "object");
		assert.equal(command.executable, "git");
		assert.equal(command.args.at(-1), baseRef);
		assert.match(command.args.at(-2), /\$\(touch should-not-run\)/);
	});

	it("adds optional setup commands to explicit worktree prepare", async () => {
		const [plan] = planRuntimeWorkUnitClaimWorktrees([item("WU-one")], {
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
			dryRun.records.map((record) => [record.commandIndex, record.skipped]),
			[
				[0, true],
				[1, true],
				[2, true],
			],
		);
		assert.match(dryRun.records[0].command, /^git worktree add /);
		assert.equal(dryRun.records[1].command, "npm install");
	});

	it("dry-runs planned worktree commands by default", async () => {
		const [plan] = planRuntimeWorkUnitClaimWorktrees([item("WU-one")], {
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
		const [plan] = planRuntimeWorkUnitClaimWorktrees([item("WU-one")], {
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
		const [plan] = planRuntimeWorkUnitClaimWorktrees([item("WU-one")], {
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

	it("runs generated commands without a shell and explicit setup through a shell", async () => {
		const [plan] = planRuntimeWorkUnitClaimWorktrees([item("WU-one")], {
			mode: "worktree",
			repoRoot: "/tmp/repo/codewiki",
			setupCommands: ["npm install"],
		});
		const processCalls = [];
		const shellCalls = [];
		const runner = createShellWorktreeCommandRunner({
			cwd: "/tmp/repo/codewiki",
			env: { CODEWIKI_TEST: "1" },
			timeoutMs: 123,
			maxBufferBytes: 456,
			shell: "/bin/sh",
			exec(command, options, callback) {
				shellCalls.push({ command, options });
				callback(null, "setup\n", "");
			},
			execFile(executable, args, options, callback) {
				processCalls.push({ executable, args, options });
				callback(null, "verified\n", "");
			},
		});

		const result = await executeRuntimeWorktreeCommands(plan, {
			dryRun: false,
			steps: ["worktree.prepare", "worktree.verify"],
			runner,
		});

		assert.equal(processCalls.length, 3);
		assert.equal(processCalls[0].executable, "git");
		assert.deepEqual(processCalls[0].args.slice(0, 3), [
			"worktree",
			"add",
			"-B",
		]);
		assert.equal(processCalls[0].options.cwd, "/tmp/repo/codewiki");
		assert.deepEqual(processCalls[0].options.env, { CODEWIKI_TEST: "1" });
		assert.equal(processCalls[0].options.timeout, 123);
		assert.equal(processCalls[0].options.maxBuffer, 456);
		assert.equal(processCalls[0].options.shell, undefined);
		assert.equal(processCalls[0].options.windowsHide, true);
		assert.equal(shellCalls.length, 1);
		assert.equal(shellCalls[0].command, "npm install");
		assert.equal(shellCalls[0].options.shell, "/bin/sh");
		assert.equal(result.records[0].stdout, "verified\n");
		assert.equal(result.records[0].exitCode, 0);

		const controller = new AbortController();
		await runner(
			{ executable: "git", args: ["status"] },
			{
				plan,
				step: "worktree.verify",
				command: "git status",
				commandIndex: 0,
				dryRun: false,
				signal: controller.signal,
			},
		);
		assert.equal(processCalls.at(-1).options.signal, controller.signal);
	});

	it("surfaces shell runner failures through worktree execution records", async () => {
		const [plan] = planRuntimeWorkUnitClaimWorktrees([item("WU-one")], {
			mode: "worktree",
			repoRoot: "/tmp/repo/codewiki",
		});
		const runner = createShellWorktreeCommandRunner({
			execFile(_executable, _args, _options, callback) {
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
		const parallel = planRuntimeWorkUnitClaimWorktrees(
			[item("WU-one"), item("WU-two")],
			{ mode: "auto", repoRoot: "/tmp/repo/codewiki" },
		);
		const cleanSolo = planRuntimeWorkUnitClaimWorktrees([item("WU-one")], {
			mode: "auto",
			repoRoot: "/tmp/repo/codewiki",
		});
		const dirtySolo = planRuntimeWorkUnitClaimWorktrees(
			[item("WU-one", ["src/runtime"])],
			{
				mode: "auto",
				repoRoot: "/tmp/repo/codewiki",
				dirtyPaths: ["src/runtime/claims/policy.ts"],
			},
		);
		const dirtyGlobSolo = planRuntimeWorkUnitClaimWorktrees(
			[item("WU-one", ["src/clients/pi/**"])],
			{
				mode: "auto",
				repoRoot: "/tmp/repo/codewiki",
				dirtyPaths: ["src/clients/pi/rendering/command-renderers.ts"],
			},
		);
		const unrelatedDirtySolo = planRuntimeWorkUnitClaimWorktrees(
			[item("WU-one", ["src/loops/decision"])],
			{
				mode: "auto",
				repoRoot: "/tmp/repo/codewiki",
				dirtyPaths: ["src/loops/planning/loop.ts"],
			},
		);

		assert.deepEqual(
			parallel.map((plan) => plan.reason),
			["parallel_claims", "parallel_claims"],
		);
		assert.equal(cleanSolo[0].required, false);
		assert.equal(cleanSolo[0].commands.worktreePrepare.length, 0);
		assert.equal(dirtySolo[0].reason, "dirty_working_tree_overlap");
		assert.equal(dirtyGlobSolo[0].reason, "dirty_working_tree_overlap");
		assert.equal(unrelatedDirtySolo[0].required, false);
	});
});
