import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { bootstrapCodewiki } from "../../src/project/bootstrap.ts";

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		...options,
	});
	assert.equal(
		result.status,
		0,
		`${command} ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
	);
	return result;
}

function startPi(projectRoot, env, name) {
	const child = spawn(
		"pi",
		[
			"--approve",
			"--mode",
			"rpc",
			"--no-session",
			"--no-builtin-tools",
			"--no-skills",
			"--no-prompt-templates",
			"--no-themes",
			"--no-context-files",
		],
		{ cwd: projectRoot, env, stdio: ["pipe", "pipe", "pipe"] },
	);
	const messages = [];
	let stderr = "";
	let buffer = "";
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk) => {
		buffer += chunk;
		let newline = buffer.indexOf("\n");
		while (newline >= 0) {
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			if (line) messages.push(JSON.parse(line));
			newline = buffer.indexOf("\n");
		}
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	let sequence = 0;
	return {
		name,
		child,
		async request(type, input = {}) {
			const id = `${name}:${++sequence}`;
			child.stdin.write(`${JSON.stringify({ id, type, ...input })}\n`);
			return waitUntil(
				() => messages.find((message) => message.type === "response" && message.id === id),
				10_000,
				() => `${name} RPC timeout. STDERR:\n${stderr}`,
			);
		},
	};
}

async function stopPi(client) {
	if (client.child.exitCode !== null) return;
	client.child.kill("SIGTERM");
	await waitUntil(
		() => client.child.exitCode !== null,
		5_000,
		() => `${client.name} did not stop.`,
	).catch(() => {
		client.child.kill("SIGKILL");
	});
}

async function waitUntil(read, timeoutMs, message) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const value = await read();
		if (value) return value;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(message());
}

const root = mkdtempSync(join(tmpdir(), "codewiki-pi-multiprocess-"));
const clients = [];
let coordinator;
let projectRoot;
try {
	const packRoot = join(root, "pack");
	const installRoot = join(root, "install");
	projectRoot = join(root, "project");
	mkdirSync(packRoot);
	mkdirSync(installRoot);
	mkdirSync(projectRoot);
	writeFileSync(
		join(projectRoot, "package.json"),
		`${JSON.stringify({ name: "codewiki-pi-multiprocess", type: "module" }, null, 2)}\n`,
	);
	await bootstrapCodewiki(projectRoot, { projectName: "codewiki-pi-multiprocess" });
	const pack = run("npm", ["pack", "--pack-destination", packRoot]);
	const tarball = pack.stdout.trim().split(/\r?\n/).at(-1);
	run("npm", ["install", "--prefix", installRoot, join(packRoot, tarball)]);
	const packageRoot = join(
		installRoot,
		"node_modules",
		"@nunomoura",
		"codewiki",
	);
	assert.equal(existsSync(join(packageRoot, "dist", "pi", "extension.js")), true);
	const env = {
		...process.env,
		PI_CODING_AGENT_DIR: join(root, "agent"),
		PI_CODING_AGENT_SESSION_DIR: join(root, "sessions"),
		PI_OFFLINE: "1",
	};
	run("pi", ["install", "-l", packageRoot, "--approve"], {
		cwd: projectRoot,
		env,
	});
	coordinator = await import(
		pathToFileURL(
			join(packageRoot, "dist", "runtime", "coordinator-api.js"),
		).href
	);
	const first = startPi(projectRoot, env, "pi-one");
	clients.push(first);
	assert.equal((await first.request("get_state")).success, true);
	await waitUntil(
		async () => {
			try {
				const state = await coordinator.readProjectCoordinatorServiceState(projectRoot);
				return state.clientCount === 2 && state.supervisorCount === 1
					? state
					: undefined;
			} catch {
				return undefined;
			}
		},
		15_000,
		() => "First Pi client and dashboard did not connect.",
	);
	const second = startPi(projectRoot, env, "pi-two");
	clients.push(second);
	assert.equal((await second.request("get_state")).success, true);
	const shared = await waitUntil(
		async () => {
			try {
				const state = await coordinator.readProjectCoordinatorServiceState(projectRoot);
				return state.clientCount >= 3 && state.supervisorCount === 2
					? state
					: undefined;
			} catch {
				return undefined;
			}
		},
		15_000,
		() => "Two Pi clients and dashboard did not share one coordinator.",
	);
	assert.equal(shared.clientCount, 3);
	assert.equal(shared.supervisorCount, 2);
	const endpoint = await coordinator.readProjectCoordinatorEndpoint(projectRoot);
	assert.equal(endpoint.generationId, shared.generationId);

	await stopPi(second);
	const afterOneExit = await waitUntil(
		async () => {
			const state = await coordinator.readProjectCoordinatorServiceState(projectRoot);
			return state.clientCount < 3 ? state : undefined;
		},
		5_000,
		() => "Coordinator did not observe Pi client shutdown.",
	);
	assert.equal(afterOneExit.supervisorCount, 1);
	await stopPi(first);
	const unsupervised = await waitUntil(
		async () => {
			const state = await coordinator.readProjectCoordinatorServiceState(projectRoot);
			return state.supervisorCount === 0 ? state : undefined;
		},
		5_000,
		() => "Coordinator did not pause after all Pi supervisors exited.",
	);
	assert.equal(unsupervised.executionPermitted, false);
	await coordinator.stopProjectCoordinatorService(projectRoot, {
		timeoutMs: 5_000,
	});
	console.log(
		JSON.stringify(
			{
				ok: true,
				generationId: shared.generationId,
				sharedClients: shared.clientCount,
				supervisors: shared.supervisorCount,
				pausedAfterExit: !unsupervised.executionPermitted,
			},
			null,
			2,
		),
	);
} finally {
	await Promise.all(clients.map((client) => stopPi(client)));
	if (coordinator && projectRoot) {
		await coordinator
			.stopProjectCoordinatorService(projectRoot, { timeoutMs: 2_000 })
			.catch(() => undefined);
	}
	rmSync(root, { recursive: true, force: true });
}
