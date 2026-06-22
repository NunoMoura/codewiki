import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

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

const root = mkdtempSync(join(tmpdir(), "codewiki-package-smoke-"));
try {
	const pack = run("npm", ["pack", "--pack-destination", root]);
	const tarball = pack.stdout.trim().split(/\r?\n/).at(-1);
	assert.match(tarball, /^codewiki-.*\.tgz$/);
	const installRoot = join(root, "install");
	run("npm", ["install", "--prefix", installRoot, join(root, tarball)]);
	assert.equal(
		existsSync(
			join(
				installRoot,
				"node_modules",
				".bin",
				process.platform === "win32" ? "codewiki.cmd" : "codewiki",
			),
		),
		false,
	);

	const smokeScript = join(installRoot, "smoke.mjs");
	writeFileSync(
		smokeScript,
		`import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
	CODEWIKI_EXTENSION_AVAILABLE,
	buildWikiState,
	runWikiConfig,
} from "codewiki";

const packageRoot = join(process.cwd(), "node_modules", "codewiki");
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
assert.equal(packageJson.name, "codewiki");
assert.equal(packageJson.private, true);
assert.equal(packageJson.bin, undefined);
assert.equal(packageJson.publishConfig, undefined);
assert.deepEqual(packageJson.pi, { extensions: ["dist/pi/extension.js"] });
assert.equal(packageJson.pi.skills, undefined);
assert.deepEqual(Object.keys(packageJson.exports).sort(), [".", "./package.json"]);
assert.equal(CODEWIKI_EXTENSION_AVAILABLE, true);
assert.deepEqual(buildWikiState({ records: [] }).traceIds, []);
assert.equal(runWikiConfig({}).config.project, "codewiki");

for (const dependency of Object.keys(packageJson.dependencies || {})) {
	assert.equal(dependency.startsWith("@earendil-works/"), false);
}
assert.equal(packageJson.dependencies["js-yaml"], undefined);
assert.equal(packageJson.dependencies.yaml.startsWith("^2."), true);
assert.equal(packageJson.dependencies.typebox, undefined);
assert.deepEqual(packageJson.peerDependencies, { typebox: "*" });

const extension = await import(pathToFileURL(join(packageRoot, "dist", "pi", "extension.js")).href);
const prompt = await import(pathToFileURL(join(packageRoot, "dist", "pi", "prompt", "index.js")).href);
const tui = await import(pathToFileURL(join(packageRoot, "dist", "pi", "tui", "index.js")).href);
assert.equal(extension.piExtensionAvailable, true);
assert.equal(prompt.codewikiPromptHooksAvailable, true);
assert.equal(tui.codewikiTuiRenderersAvailable, true);
assert.equal(typeof tui.renderStateCommand, "function");
assert.equal(typeof extension.default, "function");
const tools = [];
const commands = [];
const events = [];
extension.default({
	registerTool(tool) {
		tools.push(tool.name);
	},
	registerCommand(name) {
		commands.push(name);
	},
	on(eventName, handler) {
		events.push({ eventName, handler });
	},
});
assert.deepEqual(tools, [
	"wiki_state",
	"wiki_config",
	"wiki_decide",
	"wiki_plan",
	"wiki_implement",
	"wiki_archive",
]);
assert.deepEqual(events.map((event) => event.eventName), [
	"before_agent_start",
	"session_start",
]);
const promptHook = events.find((event) => event.eventName === "before_agent_start");
const footerHook = events.find((event) => event.eventName === "session_start");
const statuses = [];
await footerHook.handler(
	{ reason: "startup" },
	{
		cwd: process.cwd(),
		ui: {
			notify() {},
			setStatus(key, value) {
				statuses.push({ key, value });
			},
		},
	},
);
assert.equal(statuses.length, 1);
assert.equal(statuses[0].key, "codewiki");
assert.match(statuses[0].value, /^CodeWiki \\S+ non-project · \\/wiki-state$/);
assert.deepEqual(commands, [
	"wiki-state",
	"wiki-resume",
	"wiki-explain",
	"wiki-config",
	"wiki-bootstrap",
]);
const injected = await promptHook.handler({ systemPrompt: "base" }, { cwd: process.cwd() });
assert.match(injected.systemPrompt, /CodeWiki Pi guidance/);
assert.equal(injected.systemPrompt.includes("wiki_state"), true);
assert.equal(injected.systemPrompt.includes("wiki_decide"), true);
assert.equal(injected.systemPrompt.includes("/wiki-*"), true);
assert.equal(injected.systemPrompt.includes("/wiki or"), false);
assert.deepEqual(await promptHook.handler({ systemPrompt: injected.systemPrompt }, { cwd: process.cwd() }), {});
`,
	);
	run(process.execPath, [smokeScript], { cwd: installRoot });
} finally {
	rmSync(root, { recursive: true, force: true });
}
