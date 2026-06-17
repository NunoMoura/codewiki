import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(messages, predicate, stderrRef, timeoutMs = 15_000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const match = messages.find(predicate);
		if (match) return match;
		await wait(50);
	}
	throw new Error(
		`Timed out waiting for RPC event. Last events: ${JSON.stringify(
			messages.slice(-10),
		)}\nSTDERR:\n${stderrRef.value}`,
	);
}

const root = mkdtempSync(join(tmpdir(), "codewiki-pi-rpc-smoke-"));
let child;
try {
	const packRoot = join(root, "pack");
	const projectRoot = join(root, "project");
	const installRoot = join(root, "npm-install");
	mkdirSync(packRoot);
	mkdirSync(projectRoot);
	mkdirSync(installRoot);

	const pack = run("npm", ["pack", "--pack-destination", packRoot]);
	const tarball = pack.stdout.trim().split(/\r?\n/).at(-1);
	assert.match(tarball, /^codewiki-.*\.tgz$/);

	run("npm", ["install", "--prefix", installRoot, join(packRoot, tarball)]);
	const packageRoot = join(installRoot, "node_modules", "codewiki");
	const env = {
		...process.env,
		PI_CODING_AGENT_DIR: join(root, "agent"),
		PI_CODING_AGENT_SESSION_DIR: join(root, "sessions"),
		PI_OFFLINE: "1",
	};
	run("pi", ["install", packageRoot], { cwd: projectRoot, env });

	child = spawn(
		"pi",
		[
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
	const stderrRef = { value: "" };
	let stdoutBuffer = "";
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk) => {
		stdoutBuffer += chunk;
		let newlineIndex = stdoutBuffer.indexOf("\n");
		while (newlineIndex >= 0) {
			const line = stdoutBuffer.slice(0, newlineIndex).trim();
			stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
			if (line) messages.push(JSON.parse(line));
			newlineIndex = stdoutBuffer.indexOf("\n");
		}
	});
	child.stderr.on("data", (chunk) => {
		stderrRef.value += chunk;
	});

	function send(message) {
		child.stdin.write(`${JSON.stringify(message)}\n`);
	}

	send({ id: "commands", type: "get_commands" });
	const commands = await waitFor(
		messages,
		(message) => message.type === "response" && message.id === "commands",
		stderrRef,
	);
	assert.equal(commands.success, true);
	assert.equal(
		commands.data.commands.some((command) => command.name === "wiki"),
		true,
	);

	send({ id: "bootstrap", type: "prompt", message: "/wiki bootstrap" });
	const bootstrapNotice = await waitFor(
		messages,
		(message) =>
			message.type === "extension_ui_request" &&
			message.method === "notify" &&
			message.message.includes("CodeWiki Bootstrap"),
		stderrRef,
	);
	await waitFor(
		messages,
		(message) => message.type === "response" && message.id === "bootstrap",
		stderrRef,
	);
	assert.match(bootstrapNotice.message, /├/);
	assert.equal(existsSync(join(projectRoot, ".codewiki", "config.json")), true);
	assert.equal(existsSync(join(projectRoot, ".codewiki", "kb")), true);
	assert.equal(existsSync(join(projectRoot, ".codewiki", "traces")), true);
	assert.equal(existsSync(join(projectRoot, ".codewiki", "views")), true);

	send({ id: "state", type: "prompt", message: "/wiki state --board" });
	const stateNotice = await waitFor(
		messages,
		(message) =>
			message.type === "extension_ui_request" &&
			message.method === "notify" &&
			message.message.includes("CodeWiki Board"),
		stderrRef,
	);
	await waitFor(
		messages,
		(message) => message.type === "response" && message.id === "state",
		stderrRef,
	);
	assert.match(stateNotice.message, /To do/);
	assert.match(stateNotice.message, /├/);
	assert.equal(
		messages.some((message) => message.type === "agent_start"),
		false,
	);

	console.log(
		JSON.stringify(
			{
				ok: true,
				command: "/wiki",
				bootstrapRendered: bootstrapNotice.message.split("\n").slice(0, 4),
				stateRendered: stateNotice.message.split("\n").slice(0, 4),
			},
			null,
			2,
		),
	);
} finally {
	if (child && !child.killed) child.kill("SIGTERM");
	rmSync(root, { recursive: true, force: true });
}
