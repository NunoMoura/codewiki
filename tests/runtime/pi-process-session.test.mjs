import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	createPiProcessSessionFactory,
	createPiTraceHostSessionFactory,
} from "../../src/pi/process-session.ts";

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

function executionPolicy(overrides = {}) {
	return {
		digest: "sha256:" + "a".repeat(64),
		qualityFloor: "high",
		route: {
			routeId: "route-high",
			provider: "openai-codex",
			model: "gpt-5.4",
			thinking: "high",
			quality: "high",
			timeoutMs: 90_000,
			allowedTools: ["read", "edit", "bash"],
			pricingSnapshot: {
				inputUsdPerMillion: 2.5,
				outputUsdPerMillion: 15,
				cacheReadUsdPerMillion: 0.25,
				cacheWriteUsdPerMillion: 0,
			},
		},
		budget: {
			maxTokens: 10_000,
			maxCostUsd: 1,
			maxLatencyMs: 90_000,
			spentTokens: 1_000,
			spentCostUsd: 0.1,
			spentLatencyMs: 1_000,
		},
		escalation: { attempt: 0, maxEscalations: 1 },
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
	it("starts supervised trace hosts as independent Pi processes", async () => {
		const root = await mkdtemp(join("/tmp", "codewiki-pi-trace-host-"));
		try {
			const calls = [];
			const factory = createPiTraceHostSessionFactory({
				command: "pi-test",
				model: {
					provider: "openai",
					model: "gpt-5.4",
					thinking: "high",
				},
				timeoutMs: 45_000,
				runner(input) {
					calls.push(input);
					return {
						pid: 2468,
						outputFile: input.outputFile,
						controller: {
							isRunning: () => true,
							stop: () => undefined,
						},
					};
				},
			});
			const started = await factory({
				repoRoot: root,
				traceId: "TRACE-independent",
				target: "planning",
				refs: ["trace:TRACE-independent:decision:iteration:1"],
				prompt: "Run planning for TRACE-independent.",
				supervisorId: "dashboard:1",
			});

			assert.equal(calls[0].command, "pi-test");
			assert.equal(calls[0].cwd, root);
			assert.equal(calls[0].detached, true);
			assert.equal(calls[0].outputMode, "trace-host");
			assert.deepEqual(calls[0].args.slice(-7), [
				"--provider",
				"openai",
				"--model",
				"gpt-5.4",
				"--thinking",
				"high",
				"Run planning for TRACE-independent.",
			]);
			assert.match(
				calls[0].outputFile,
				/TRACE-independent\/trace-host\/session\.log$/,
			);
			assert.equal(started.sessionRef, "pi-process:2468");
			assert.equal(started.pid, 2468);
			assert.equal(started.timeoutMs, 45_000);
			assert.deepEqual(started.executionModel, {
				provider: "openai",
				model: "gpt-5.4",
				thinking: "high",
			});
			assert.equal(await started.controller.isRunning(), true);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("resumes an exact persisted Pi session", async () => {
		const root = await mkdtemp(join("/tmp", "codewiki-pi-trace-resume-"));
		try {
			const calls = [];
			const factory = createPiTraceHostSessionFactory({
				command: "pi-test",
				runner(input) {
					calls.push(input);
					return {
						pid: 2469,
						outputFile: input.outputFile,
						controller: {
							isRunning: () => true,
							stop: () => undefined,
						},
					};
				},
			});
			const started = await factory({
				repoRoot: root,
				traceId: "TRACE-resume",
				target: "implementation",
				refs: [],
				prompt: "Resume guarded trace work.",
				supervisorId: "dashboard:1",
				resumeSessionId: "session-resume-1",
			});

			assert.deepEqual(calls[0].args.slice(-3), [
				"--session",
				"session-resume-1",
				"Resume guarded trace work.",
			]);
			assert.equal(started.sessionRef, "session-resume-1");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects resume when session persistence is disabled", async () => {
		const root = await mkdtemp(
			join("/tmp", "codewiki-pi-trace-resume-disabled-"),
		);
		try {
			const factory = createPiTraceHostSessionFactory({ noSession: true });
			await assert.rejects(
				factory({
					repoRoot: root,
					traceId: "TRACE-resume-disabled",
					target: "planning",
					refs: [],
					prompt: "Resume guarded trace work.",
					supervisorId: "dashboard:1",
					resumeSessionId: "session-resume-1",
				}),
				/resume cannot disable session persistence/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("terminates an independently running trace host through its controller", async () => {
		const root = await mkdtemp(join("/tmp", "codewiki-pi-trace-stop-"));
		let started;
		try {
			const factory = createPiTraceHostSessionFactory({
				command: process.execPath,
				args: ["-e", "setInterval(() => {}, 1000)"],
			});
			started = await factory({
				repoRoot: root,
				traceId: "TRACE-stoppable",
				target: "implementation",
				refs: [],
				prompt: "trace-host-test",
				supervisorId: "test:1",
			});
			assert.equal(await started.controller.isRunning(), true);

			await started.controller.stop("cancelled");
			assert.equal(await started.controller.isRunning(), false);
		} finally {
			if (started && (await started.controller.isRunning())) {
				await started.controller.stop("shutdown");
			}
			await rm(root, { recursive: true, force: true });
		}
	});

	it("captures only bounded structured trace host output", async () => {
		const root = await mkdtemp(join("/tmp", "codewiki-pi-trace-result-"));
		const structured = {
			version: 1,
			outcome: "blocked",
			summary: "Waiting for external review evidence.",
			refs: ["trace:TRACE-result:planning:iteration:1"],
		};
		const message = {
			type: "message_end",
			message: {
				role: "assistant",
				content: [
					{
						type: "text",
						text: `RAW_PRIVATE_SHOULD_NOT_PERSIST\nCODEWIKI_TRACE_HOST_RESULT ${JSON.stringify(structured)}`,
					},
				],
				provider: "test-provider",
				model: "test-model",
				stopReason: "stop",
				usage: { input: 1, output: 2, totalTokens: 3, cost: { total: 0.01 } },
			},
		};
		const script = [
			`console.log(${JSON.stringify(JSON.stringify({ type: "session", version: 3, id: "session-result-1" }))})`,
			`console.log(${JSON.stringify(JSON.stringify(message))})`,
		].join(";");
		try {
			const factory = createPiTraceHostSessionFactory({
				command: process.execPath,
				args: ["-e", script],
			});
			const started = await factory({
				repoRoot: root,
				traceId: "TRACE-result",
				target: "planning",
				refs: [],
				prompt: "trace-host-test",
				supervisorId: "test:1",
			});
			for (let attempt = 0; attempt < 40; attempt++) {
				if (!(await started.controller.isRunning())) break;
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
			const completion = await started.controller.completion();
			assert.equal(completion.result.outcome, "blocked");
			assert.equal(completion.result.sessionId, "session-result-1");
			assert.equal(completion.result.usage.cost, 0.01);

			const outputPath = join(
				root,
				".codewiki",
				"runtime",
				"tmp",
				"TRACE-result",
				"trace-host",
				"session.log",
			);
			const output = await readFile(outputPath, "utf8");
			assert.match(output, /"type":"trace_host_result"/);
			assert.equal(output.includes("RAW_PRIVATE_SHOULD_NOT_PERSIST"), false);
			if (process.platform !== "win32") {
				assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("builds deterministic Pi CLI process inputs through a runner seam", async () => {
		const calls = [];
		const factory = createPiProcessSessionFactory({
			command: "pi-test",
			args: ["--mode", "json", "-p"],
			cwd: "/repo/codewiki",
			env: { CODEWIKI_TEST: "1" },
			model: {
				provider: "anthropic",
				model: "claude-opus-4-6",
				thinking: "xhigh",
			},
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
			"--provider",
			"anthropic",
			"--model",
			"claude-opus-4-6",
			"--thinking",
			"xhigh",
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

	it("applies exact worker policy and attributes bounded usage", async () => {
		const calls = [];
		const policy = executionPolicy();
		const factory = createPiProcessSessionFactory({
			command: "pi-test",
			runner(input) {
				calls.push(input);
				return {
					exitCode: 0,
					outputFile: input.outputFile,
					usage: {
						inputTokens: 200,
						outputTokens: 100,
						totalTokens: 300,
						costUsd: 0.02,
						latencyMs: 2_000,
					},
				};
			},
		});
		const session = await factory.create(
			sessionInput({ executionPolicy: policy }),
		);
		await session.prompt("Implement with exact policy.");

		assert.deepEqual(calls[0].args.slice(-9), [
			"--provider",
			"openai-codex",
			"--model",
			"gpt-5.4",
			"--thinking",
			"high",
			"--tools",
			"read,edit,bash",
			"Implement with exact policy.",
		]);
		assert.equal(calls[0].timeoutMs, 90_000);
		assert.deepEqual(session.executionVerification, {
			policyDigest: policy.digest,
			routeId: "route-high",
			usage: {
				inputTokens: 200,
				outputTokens: 100,
				totalTokens: 300,
				costUsd: 0.02,
				latencyMs: 2_000,
			},
		});
	});

	it("fails closed when policy usage is missing, exhausted, or mismatched", async () => {
		const missing = createPiProcessSessionFactory({
			runner: (input) => ({ exitCode: 0, outputFile: input.outputFile }),
		});
		const missingSession = await missing.create(
			sessionInput({ executionPolicy: executionPolicy() }),
		);
		await assert.rejects(
			missingSession.prompt("run"),
			/usage telemetry is missing/,
		);

		const exhausted = createPiProcessSessionFactory({
			runner: (input) => ({
				exitCode: 0,
				outputFile: input.outputFile,
				usage: {
					inputTokens: 9_000,
					outputTokens: 1_000,
					totalTokens: 10_000,
					costUsd: 0.1,
					latencyMs: 1_000,
				},
			}),
		});
		const exhaustedSession = await exhausted.create(
			sessionInput({ executionPolicy: executionPolicy() }),
		);
		await assert.rejects(
			exhaustedSession.prompt("run"),
			/token budget exceeded/,
		);

		const mismatched = createPiProcessSessionFactory({
			model: { provider: "anthropic", model: "wrong", thinking: "low" },
		});
		const mismatchSession = await mismatched.create(
			sessionInput({ executionPolicy: executionPolicy() }),
		);
		await assert.rejects(mismatchSession.prompt("run"), /route mismatch/);

		const detached = createPiProcessSessionFactory({ detached: true });
		const detachedSession = await detached.create(
			sessionInput({ executionPolicy: executionPolicy() }),
		);
		await assert.rejects(
			detachedSession.prompt("run"),
			/foreground usage monitoring/,
		);

		const timeoutPolicy = executionPolicy();
		timeoutPolicy.route.timeoutMs = 10;
		const timed = createPiProcessSessionFactory({
			command: process.execPath,
			args: ["-e", "setTimeout(() => {}, 1000)", "--"],
		});
		const timedSession = await timed.create(
			sessionInput({ executionPolicy: timeoutPolicy }),
		);
		await assert.rejects(timedSession.prompt("run"), /exceeded timeout 10ms/);
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

	it("terminates an aborted foreground worker without leaking its child", async () => {
		const base = join(process.cwd(), ".tmp-worktrees/pi-process-session");
		await mkdir(base, { recursive: true });
		const root = await mkdtemp(join(base, "cancel-"));
		try {
			const controller = new AbortController();
			const factory = createPiProcessSessionFactory({
				command: process.execPath,
				args: ["-e", "setInterval(() => {}, 1000)", "--"],
				outputFile: join(root, "cancelled-worker.jsonl"),
				terminationGraceMs: 25,
			});
			const session = await factory.create(sessionInput());
			const prompt = session.prompt("wait", undefined, controller.signal);
			setTimeout(() => controller.abort(), 25);

			await assert.rejects(prompt, /process cancelled/);
			assert.equal(typeof session.pid, "number");
			assert.throws(
				() => process.kill(session.pid, 0),
				(error) => error?.code === "ESRCH",
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
