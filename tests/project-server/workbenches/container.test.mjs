import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	OCI_CONTAINER_WORKER_ENVELOPE_SCHEMA_VERSION,
	createOciContainerImplementationWorkerAdapter,
	runOciContainerCommand,
} from "../../../src/project-server/workbenches/container/adapter.ts";
import { IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION } from "../../../src/project-server/workers/implementation-adapter.ts";
import {producerSkills} from "../../helpers/checks.mjs";

const IMAGE = `registry.example/codewiki-worker@sha256:${"a".repeat(64)}`;

function assignment(root) {
	return {
		schemaVersion: IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION,
		repoRoot: root,
		assignmentId: "assignment:container-worker",
		workerId: "worker:container-worker",
		workUnitId: "work:container-worker",
		claimId: "claim:container-worker",
		traceId: "TRACE-CHG-container-worker",
		planningRefs: ["trace:TRACE-CHG-container-worker#planning:1"],
		traceRefs: ["TRACE-CHG-container-worker"],
		componentRefs: ["component:runtime"],
		pathScopes: ["src/project-server/**"],
		workStateDigest: "sha256:work-state",
		sourceBaseRef: "git:base:abc123",
		contextDigest: "sha256:context",
		producerSkillReceipt: producerSkills().receipt,
		prompt: "Implement the assigned container-isolated change.",
		reportPath: join(
			root,
			".codewiki",
			"runtime",
			"workers",
			"container-worker.json",
		),
		isolation: { kind: "container", ref: "container:container-worker" },
		worktree: {
			path: join(root, ".tmp-worktrees", "container-worker"),
			branch: "codewiki/container-worker",
			baseRef: "abc123",
		},
	};
}

function completedEvidence(input) {
	return {
		workerId: input.workerId,
		workUnitId: input.workUnitId,
		status: "completed",
		planningRefs: input.planningRefs,
		changedFiles: ["src/project-server/container-example.ts"],
		checksRun: ["node --test tests/project-server/container-example.test.mjs"],
	};
}

function mountedOutcomePath(args) {
	const mount = args.find((value) => value.includes("dst=/codewiki-runtime/outcome.json"));
	assert.ok(mount);
	return mount.match(/src=(.*),dst=\/codewiki-runtime\/outcome\.json,rw$/u)[1];
}

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-container-worker-"));
	const input = assignment(root);
	const adminDirectory = join(root, ".git", "worktrees", "container-worker");
	await mkdir(adminDirectory, { recursive: true });
	await writeFile(join(adminDirectory, "commondir"), "../..\n", "utf8");
	await mkdir(input.worktree.path, { recursive: true });
	await writeFile(
		join(input.worktree.path, ".git"),
		`gitdir: ${adminDirectory}\n`,
		"utf8",
	);
	return { root, input };
}

async function waitForFile(path, timeoutMs = 2_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			return await readFile(path, "utf8");
		} catch (error) {
			if (error?.code !== "ENOENT") throw error;
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`Timed out waiting for ${path}.`);
}

test("OCI container adapter runs a hardened digest-pinned worker and recovers its report", async () => {
	const { root, input } = await fixture();
	const calls = [];
	const adapter = createOciContainerImplementationWorkerAdapter({
		image: IMAGE,
		environment: { OPENAI_API_KEY: "provider-secret" },
		async runner(command) {
			calls.push(command);
			assert.equal(command.environment.DOCKER_HOST, undefined);
			assert.equal(command.environment.DOCKER_CONTEXT, undefined);
			assert.equal(command.environment.HOME, undefined);
			if (command.args[0] === "version") return { exitCode: 0 };
			if (command.args[0] === "rm") return { exitCode: 1 };
			if (command.args[0] === "container") {
				return { exitCode: 1, stdout: "" };
			}
			assert.equal(command.args[0], "run");
			assert.equal(typeof command.stdin, "string");
			let envelope;
			try {
				envelope = JSON.parse(command.stdin);
			} catch {
				assert.fail("Container worker stdin must be valid JSON.");
			}
			assert.equal(
				envelope.schemaVersion,
				OCI_CONTAINER_WORKER_ENVELOPE_SCHEMA_VERSION,
			);
			assert.equal(envelope.assignment.repoRoot, "/workspace");
			assert.equal(envelope.assignment.worktree.path, "/workspace");
			assert.equal(
				envelope.assignment.reportPath,
				"/codewiki-runtime/outcome.json",
			);
			assert.equal(envelope.outcomePath, "/codewiki-runtime/outcome.json");
			assert.equal(command.args.includes("GIT_WORK_TREE=/workspace"), true);
			assert.equal(command.args.includes("GIT_OPTIONAL_LOCKS=0"), true);
			assert.equal(
				command.args.includes("GIT_DIR=/codewiki-git/worktrees/container-worker"),
				true,
			);
			assert.equal(
				command.args.some(
					(value) =>
						value ===
						`type=bind,src=${join(root, ".git")},dst=/codewiki-git,readonly`,
				),
				true,
			);
			assert.equal(command.args.includes("provider-secret"), false);
			await writeFile(
				mountedOutcomePath(command.args),
				JSON.stringify({
					status: "completed",
					implementationEvidence: completedEvidence(input),
				}),
				"utf8",
			);
			return { exitCode: 0, stdout: "bounded worker status" };
		},
	});
	try {
		assert.deepEqual(await adapter.availability(), { available: true });
		await assert.rejects(
			adapter.execute(
				{
					...input,
					producerSkillReceipt: {
						...input.producerSkillReceipt,
						skillSetDigest: `sha256:${"b".repeat(64)}`,
						skills: [
							{
								packId: "standards",
								name: "implementation-guide",
								skillDigest: `sha256:${"c".repeat(64)}`,
							},
						],
					},
				},
				new AbortController().signal,
			),
			/do not support exact Pack Skill delivery/,
		);
		const report = await adapter.execute(input, new AbortController().signal);
		assert.equal(report.status, "completed");
		assert.equal(report.implementationEvidence.workerId, input.workerId);
		assert.match(report.reportRef, /^runtime-worker-report:[a-f0-9]{64}$/u);
		assert.deepEqual(await adapter.recover(input), report);
		assert.equal(existsSync(`${input.reportPath}.container-outcome`), false);
		const run = calls.find((call) => call.args[0] === "run");
		assert.ok(run);
		for (const expected of [
			"--pull",
			"never",
			"--network",
			"none",
			"--read-only",
			"--cap-drop",
			"ALL",
			"no-new-privileges=true",
			"--pids-limit",
			"--memory",
			"--cpus",
			"--user",
			"--tmpfs",
		]) {
			assert.equal(run.args.includes(expected), true, `missing ${expected}`);
		}
		assert.equal(run.args.includes("--privileged"), false);
		assert.equal(run.args.at(-2), IMAGE);
		assert.equal(run.args.at(-1), "/usr/local/bin/codewiki-worker");
		assert.equal(run.environment.OPENAI_API_KEY, "provider-secret");
		assert.deepEqual(
			calls.filter((call) => call.args[0] === "rm").map((call) => call.args[1]),
			["--force", "--force"],
		);
		const persisted = JSON.parse(await readFile(input.reportPath, "utf8"));
		assert.equal(persisted.reportRef, report.reportRef);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("OCI container adapter preserves outcome evidence when final report persistence fails", async () => {
	const { root, input } = await fixture();
	const adapter = createOciContainerImplementationWorkerAdapter({
		image: IMAGE,
		async runner(command) {
			if (command.args[0] === "version" || command.args[0] === "rm") {
				return { exitCode: 0 };
			}
			if (command.args[0] === "container") {
				return { exitCode: 1, stdout: "" };
			}
			const outcomePath = mountedOutcomePath(command.args);
			await writeFile(
				outcomePath,
				JSON.stringify({
					status: "completed",
					implementationEvidence: completedEvidence(input),
				}),
				"utf8",
			);
			await symlink(outcomePath, input.reportPath);
			return { exitCode: 0 };
		},
	});
	try {
		await assert.rejects(
			() => adapter.execute(input, new AbortController().signal),
			/reportPath cannot be a symbolic link/i,
		);
		assert.equal(existsSync(`${input.reportPath}.container-outcome`), true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("OCI container adapter refuses terminal reports when exact container cleanup is unproven", async () => {
	const { root, input } = await fixture();
	let inspections = 0;
	const adapter = createOciContainerImplementationWorkerAdapter({
		image: IMAGE,
		async runner(command) {
			if (command.args[0] === "version" || command.args[0] === "rm") {
				return { exitCode: 0 };
			}
			if (command.args[0] === "container") {
				inspections += 1;
				return inspections === 1
					? { exitCode: 1, stdout: "" }
					: { exitCode: 0, stdout: "still-running-container\n" };
			}
			return { exitCode: 1, cancelled: true };
		},
	});
	try {
		await assert.rejects(
			() => adapter.execute(input, new AbortController().signal),
			/could not prove the exact container stopped/i,
		);
		assert.equal(await adapter.recover(input), undefined);
		assert.equal(existsSync(`${input.reportPath}.container-outcome`), true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("OCI container adapter persists cancelled, failed, and malformed outcomes as terminal reports", async () => {
	for (const scenario of ["cancelled", "exit-failed", "malformed"]) {
		const { root, input } = await fixture();
		const controller = new AbortController();
		const started = Promise.withResolvers();
		const adapter = createOciContainerImplementationWorkerAdapter({
			image: IMAGE,
			async runner(command) {
				if (command.args[0] === "version" || command.args[0] === "rm") {
					return { exitCode: 0 };
				}
				if (command.args[0] === "container") {
					return { exitCode: 1, stdout: "" };
				}
				if (scenario === "cancelled") {
					started.resolve();
					await new Promise((resolve) =>
						command.signal.addEventListener("abort", resolve, { once: true }),
					);
					return { exitCode: 1, cancelled: true };
				}
				if (scenario === "malformed") {
					await writeFile(mountedOutcomePath(command.args), "not-json", "utf8");
					return { exitCode: 0 };
				}
				return { exitCode: 17 };
			},
		});
		try {
			const execution = adapter.execute(input, controller.signal);
			if (scenario === "cancelled") {
				await started.promise;
				controller.abort();
			}
			const report = await execution;
			assert.equal(report.status, scenario === "cancelled" ? "cancelled" : "failed");
			assert.deepEqual(await adapter.recover(input), report);
			assert.equal(existsSync(`${input.reportPath}.container-outcome`), false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	}
});

test("OCI container adapter rejects worktree Git metadata from another repository", async () => {
	const { root, input } = await fixture();
	const externalGit = join(root, "external-git");
	await mkdir(externalGit);
	await writeFile(
		join(root, ".git", "worktrees", "container-worker", "commondir"),
		"../../../external-git\n",
		"utf8",
	);
	const adapter = createOciContainerImplementationWorkerAdapter({
		image: IMAGE,
		async runner(command) {
			return command.args[0] === "version"
				? { exitCode: 0 }
				: assert.fail("foreign Git metadata must fail before container start");
		},
	});
	try {
		await assert.rejects(
			() => adapter.execute(input, new AbortController().signal),
			/does not belong to repository/i,
		);
		assert.equal(await adapter.recover(input), undefined);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("OCI container adapter rejects mutable images, broad networks, and invalid environment names", () => {
	assert.throws(
		() => createOciContainerImplementationWorkerAdapter({ image: "worker:latest" }),
		/immutable sha256 digest/i,
	);
	assert.throws(
		() =>
			createOciContainerImplementationWorkerAdapter({
				image: IMAGE,
				network: "host",
			}),
		/restricted network/i,
	);
	for (const environment of [
		{ "BAD-NAME": "secret" },
		{ DOCKER_HOST: "tcp://remote.example:2375" },
		{ HOME: "/private/host-home" },
	]) {
		assert.throws(
			() =>
				createOciContainerImplementationWorkerAdapter({
					image: IMAGE,
					environment,
				}),
			/environment name/i,
		);
	}
	for (const limits of [
		{ memoryBytes: 1024 },
		{ cpus: 65 },
		{ pidsLimit: 4_097 },
		{ timeoutMs: 999 },
		{ maxOutputBytes: 9 * 1024 * 1024 },
	]) {
		assert.throws(
			() =>
				createOciContainerImplementationWorkerAdapter({
					image: IMAGE,
					...limits,
				}),
			/container .* limit is invalid/i,
		);
	}
});

test("OCI command runner terminates and waits for its foreground client on cancellation", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-container-command-"));
	const pidFile = join(root, "pid.txt");
	const controller = new AbortController();
	try {
		const execution = runOciContainerCommand({
			executable: process.execPath,
			args: [
				"-e",
				"require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)",
				pidFile,
			],
			signal: controller.signal,
			timeoutMs: 10_000,
			terminationGraceMs: 250,
			maxOutputBytes: 64 * 1024,
		});
		const pid = Number.parseInt(await waitForFile(pidFile), 10);
		controller.abort();
		const result = await execution;
		assert.equal(result.cancelled, true);
		assert.equal(Number.isSafeInteger(pid), true);
		assert.throws(() => process.kill(pid, 0), /ESRCH/u);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("OCI container adapter reports unavailable runtimes without leaking command output", async () => {
	const adapter = createOciContainerImplementationWorkerAdapter({
		image: IMAGE,
		async runner() {
			return { exitCode: 1, stderr: "provider-secret" };
		},
	});
	assert.deepEqual(await adapter.availability(), {
		available: false,
		reason: "container_runtime_unavailable",
	});
});
