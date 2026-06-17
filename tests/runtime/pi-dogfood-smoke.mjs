import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

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

const settings = JSON.parse(readFileSync(".pi/settings.json", "utf8"));
assert.equal(settings.packages.includes("npm:pi-lens"), true);
assert.equal(settings.packages.includes(".."), true);
assert.equal(existsSync("dist/pi/extension.js"), true);

let child;
try {
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
		{ stdio: ["pipe", "pipe", "pipe"] },
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
	assert.equal(messages.some((message) => message.type === "agent_start"), false);
	assert.doesNotMatch(
		stderrRef.value,
		/failed to load|cannot find module|error loading/i,
	);

	console.log(
		JSON.stringify(
			{
				ok: true,
				command: "/wiki",
				rendered: stateNotice.message.split("\n").slice(0, 4),
			},
			null,
			2,
		),
	);
} finally {
	if (child && !child.killed) child.kill("SIGTERM");
}
