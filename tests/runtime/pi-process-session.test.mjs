import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createPiProcessSessionFactory } from "../../src/pi/process-session.ts";

function sessionInput(overrides = {}) {
	return {
		workerId: "pi-worker-001",
		workUnitId: "WU-process",
		traceId: "TRACE-process",
		planningRefs: ["trace:TRACE-process:planning:iteration:1#work:WU-process"],
		pathScopes: ["src/pi/process-session.ts"],
		componentRefs: ["component.pi"],
		prompt: "Implement WU-process.",
		...overrides,
	};
}

async function waitForOutputFile(outputFile, expected) {
	let lastError;
	for (let attempt = 0; attempt < 40; attempt++) {
		try {
			const content = await readFile(outputFile, "utf8");
			if (content.includes(expected)) return content;
			lastError = new Error(`output did not contain ${expected}: ${content}`);
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw lastError;
}

describe("Pi process session factory", () => {
	it("builds deterministic Pi CLI process inputs through a runner seam", async () => {
		const calls = [];
		const factory = createPiProcessSessionFactory({
			command: "pi-test",
			args: ["--mode", "json", "-p"],
			cwd: "/repo/codewiki",
			env: { CODEWIKI_TEST: "1" },
			outputFile: (input) =>
				`/repo/codewiki/.codewiki/runtime/tmp/${input.traceId}/runtime/pi-workers/${input.workerId}.jsonl`,
			runner(input) {
				calls.push(input);
				return {
					pid: 12345,
					sessionId: `session-${input.workerId}`,
					sessionFile: `/repo/codewiki/.codewiki/runtime/tmp/${input.traceId}/runtime/pi-workers/${input.workerId}.session.jsonl`,
					outputFile: input.outputFile,
					exitCode: 0,
				};
			},
		});
		const session = await factory.create(sessionInput());

		await session.prompt("Implement WU-process.");

		assert.equal(calls.length, 1);
		assert.equal(calls[0].command, "pi-test");
		assert.deepEqual(calls[0].args, [
			"--mode",
			"json",
			"-p",
			"Implement WU-process.",
		]);
		assert.equal(calls[0].cwd, "/repo/codewiki");
		assert.equal(calls[0].env.CODEWIKI_TEST, "1");
		assert.equal(calls[0].detached, false);
		assert.equal(
			calls[0].outputFile,
			"/repo/codewiki/.codewiki/runtime/tmp/TRACE-process/runtime/pi-workers/pi-worker-001.jsonl",
		);
		assert.equal(session.pid, 12345);
		assert.equal(session.sessionId, "session-pi-worker-001");
		assert.equal(
			session.sessionFile,
			"/repo/codewiki/.codewiki/runtime/tmp/TRACE-process/runtime/pi-workers/pi-worker-001.session.jsonl",
		);
		assert.equal(
			session.outputFile,
			"/repo/codewiki/.codewiki/runtime/tmp/TRACE-process/runtime/pi-workers/pi-worker-001.jsonl",
		);
	});

	it("defaults worker output under project runtime tmp", async () => {
		const calls = [];
		const factory = createPiProcessSessionFactory({
			cwd: "/repo/codewiki",
			runner(input) {
				calls.push(input);
				return { pid: 123, outputFile: input.outputFile, exitCode: 0 };
			},
		});
		const session = await factory.create(sessionInput());

		await session.prompt("Use project-local tmp.");

		assert.equal(
			calls[0].outputFile,
			"/repo/codewiki/.codewiki/runtime/tmp/TRACE-process/runtime/pi-workers/TRACE-process-pi-worker-001.jsonl",
		);
		assert.equal(session.outputFile, calls[0].outputFile);
	});

	it("supports detached no-session starts", async () => {
		const calls = [];
		const factory = createPiProcessSessionFactory({
			detached: true,
			noSession: true,
			outputFile:
				"/repo/codewiki/.codewiki/runtime/tmp/TRACE-process/runtime/pi-workers/detached-worker.jsonl",
			runner(input) {
				calls.push(input);
				return { pid: 222, outputFile: input.outputFile };
			},
		});
		const session = await factory.create(sessionInput());

		await session.prompt("Run detached.");

		assert.equal(calls[0].detached, true);
		assert.deepEqual(calls[0].args.slice(0, 4), [
			"--mode",
			"json",
			"-p",
			"--no-session",
		]);
		assert.equal(session.pid, 222);
		assert.equal(
			session.outputFile,
			"/repo/codewiki/.codewiki/runtime/tmp/TRACE-process/runtime/pi-workers/detached-worker.jsonl",
		);
	});

	it("revives session refs through an optional resume runner", async () => {
		const calls = [];
		const factory = createPiProcessSessionFactory({
			resumeRunner(input) {
				calls.push(input);
				return {
					state: "running",
					pid: 333,
					sessionId: input.sessionId,
					sessionFile: input.sessionFile,
					outputFile: input.outputFile,
				};
			},
		});

		const result = await factory.resume({
			workerId: "pi-worker-001",
			workUnitId: "WU-process",
			traceId: "TRACE-process",
			sessionId: "session-1",
			sessionFile:
				"/repo/codewiki/.codewiki/runtime/tmp/TRACE-process/runtime/pi-workers/session.jsonl",
			outputFile:
				"/repo/codewiki/.codewiki/runtime/tmp/TRACE-process/runtime/pi-workers/output.jsonl",
		});

		assert.equal(calls.length, 1);
		assert.equal(result.state, "running");
		assert.equal(result.pid, 333);
		assert.equal(result.sessionId, "session-1");
		assert.equal(
			result.outputFile,
			"/repo/codewiki/.codewiki/runtime/tmp/TRACE-process/runtime/pi-workers/output.jsonl",
		);
	});

	it("marks sessions detached when no resume runner is configured", async () => {
		const factory = createPiProcessSessionFactory();

		const result = await factory.resume({
			workerId: "pi-worker-001",
			workUnitId: "WU-process",
			traceId: "TRACE-process",
			sessionId: "session-1",
		});

		assert.equal(result.state, "detached");
		assert.equal(result.sessionId, "session-1");
		assert.equal(result.message, "No Pi process resume runner configured.");
	});

	it("rejects failed process exits", async () => {
		const factory = createPiProcessSessionFactory({
			runner() {
				return { pid: 999, exitCode: 2, stderr: "bad prompt" };
			},
		});
		const session = await factory.create(sessionInput());

		await assert.rejects(
			() => session.prompt("bad"),
			/pi process exited with code 2: bad prompt/,
		);
		assert.equal(session.pid, 999);
	});

	it("runs the default command runner and writes process output", async () => {
		const base = join(process.cwd(), ".tmp-worktrees/pi-process-session");
		await mkdir(base, { recursive: true });
		const root = await mkdtemp(join(base, "run-"));
		try {
			const outputFile = join(root, "worker.jsonl");
			const factory = createPiProcessSessionFactory({
				command: process.execPath,
				args: ["-e", "console.log(process.argv.at(-1))"],
				outputFile,
			});
			const session = await factory.create(sessionInput());

			await session.prompt("hello from pi worker");

			assert.equal(session.outputFile, outputFile);
			assert.equal(typeof session.pid, "number");
			assert.equal(
				(await readFile(outputFile, "utf8")).trim(),
				"hello from pi worker",
			);
		} finally {
			await rm(root, { recursive: true, force: true });
			await rm(base, { recursive: true, force: true });
		}
	});

	it("redirects detached process output for later worker collection", async () => {
		const base = join(process.cwd(), ".tmp-worktrees/pi-process-session");
		await mkdir(base, { recursive: true });
		const root = await mkdtemp(join(base, "detached-"));
		try {
			const outputFile = join(root, "detached-worker.jsonl");
			const factory = createPiProcessSessionFactory({
				command: process.execPath,
				args: ["-e", "setTimeout(() => console.log(process.argv.at(-1)), 25)"],
				outputFile,
				detached: true,
			});
			const session = await factory.create(sessionInput());

			await session.prompt("hello from detached pi worker");

			assert.equal(session.outputFile, outputFile);
			assert.equal(typeof session.pid, "number");
			assert.equal(
				(
					await waitForOutputFile(outputFile, "hello from detached pi worker")
				).trim(),
				"hello from detached pi worker",
			);
		} finally {
			await rm(root, { recursive: true, force: true });
			await rm(base, { recursive: true, force: true });
		}
	});
});
