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
	assert.match(tarball, /^nunomoura-codewiki-.*\.tgz$/);
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
	assert.equal(
		existsSync(
			join(installRoot, "node_modules", "@earendil-works", "pi-coding-agent"),
		),
		false,
	);

	const smokeScript = join(installRoot, "smoke.mjs");
	writeFileSync(
		smokeScript,
		`import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
	CODEWIKI_EXTENSION_AVAILABLE,
	ProjectCoordinator,
	buildWikiState,
	buildWorkState,
	runWikiConfig,
} from "@nunomoura/codewiki";
import {
	IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION,
	ImplementationWorkerDispatcher,
	connectProjectCoordinatorClient,
	createOciContainerImplementationWorkerAdapter,
	ensureProjectCoordinatorService,
	scheduleImplementationWorkerClaimRelease,
	scheduleImplementationWorkerIntegration,
	scheduleImplementationWorkerAssignments,
	scheduleProjectBranchMerge,
	scheduleProjectBranchPush,
	scheduleProductPublication,
	scheduleRuntimeReactions,
	startProjectCoordinatorService,
	stopProjectCoordinatorService,
} from "@nunomoura/codewiki/coordinator";

function filesUnder(root) {
	const files = [];
	for (const name of readdirSync(root).sort()) {
		const path = join(root, name);
		if (statSync(path).isDirectory()) files.push(...filesUnder(path));
		else files.push(path);
	}
	return files;
}

const packageRoot = join(process.cwd(), "node_modules", "@nunomoura", "codewiki");
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
assert.equal(packageJson.name, "@nunomoura/codewiki");
assert.equal(packageJson.private, true);
assert.equal(packageJson.bin, undefined);
assert.equal(packageJson.publishConfig, undefined);
assert.deepEqual(packageJson.pi, { extensions: ["dist/pi/extension.js"] });
assert.equal(packageJson.pi.skills, undefined);
assert.deepEqual(Object.keys(packageJson.exports).sort(), [
	".",
	"./coordinator",
	"./package.json",
	"./pi-sdk",
]);
assert.deepEqual(packageJson.exports["./coordinator"], {
	types: "./dist/runtime/coordinator-entrypoint.d.ts",
	import: "./dist/runtime/coordinator-entrypoint.js",
});
assert.deepEqual(packageJson.exports["./pi-sdk"], {
\ttypes: "./dist/pi/sdk-semantic-session.d.ts",
\timport: "./dist/pi/sdk-semantic-session.js",
});
assert.equal(
\tpackageJson.peerDependencies["@earendil-works/pi-coding-agent"],
\t">=0.80.10 <0.82.0",
);
assert.equal(
\tpackageJson.peerDependenciesMeta["@earendil-works/pi-coding-agent"].optional,
\ttrue,
);
assert.equal(existsSync(join(packageRoot, "dist", "pi", "sdk-semantic-session.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "pi", "sdk-semantic-session.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "runtime-reaction-jobs.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "runtime-reaction-jobs.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "implementation-worker-adapter.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "container-worker-adapter.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "container-worker-options.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "container-worker-git.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "oci-container-command.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "implementation-worker-report-store.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "implementation-worker-dispatch.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "implementation-worker-jobs.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "implementation-worker-review.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "implementation-worker-integration.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "project-branch-merge.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "project-branch-merge-git.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "project-branch-push.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "project-branch-push-operations.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "project-branch-push-manifest.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "product-publication.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "product-publication-proof.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "product-publication-contract.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "product-publication-artifact.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "product-publication-manifest.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "pi", "process-worker-adapter.js")), true);
assert.equal(CODEWIKI_EXTENSION_AVAILABLE, true);
const coordinator = new ProjectCoordinator(process.cwd(), {
	generationId: "packed:coordinator",
	executionPolicy: "unattended",
});
assert.equal(coordinator.snapshot().generationId, "packed:coordinator");
coordinator.close();
const service = await startProjectCoordinatorService(process.cwd(), {
	generationId: "packed:service",
});
const remoteClient = await connectProjectCoordinatorClient(process.cwd(), {
	clientId: "packed:client",
	kind: "test",
	supervision: "approved",
});
assert.equal((await remoteClient.state()).supervisorCount, 1);
assert.equal(typeof remoteClient.react, "function");
assert.equal(typeof remoteClient.inspect, "function");
assert.equal(typeof remoteClient.submitCandidate, "function");
assert.equal(typeof remoteClient.reconcileWorkers, "function");
assert.equal(typeof remoteClient.events, "function");
assert.equal((await remoteClient.events(0)).events[0].state, "client_connected");
assert.equal(remoteClient.semanticExecution, "client_candidate");
assert.equal(typeof scheduleRuntimeReactions, "function");
assert.equal(typeof scheduleImplementationWorkerAssignments, "function");
assert.equal(typeof scheduleImplementationWorkerClaimRelease, "function");
assert.equal(typeof scheduleImplementationWorkerIntegration, "function");
assert.equal(typeof scheduleProjectBranchMerge, "function");
assert.equal(typeof scheduleProjectBranchPush, "function");
assert.equal(typeof scheduleProductPublication, "function");
assert.equal(typeof createOciContainerImplementationWorkerAdapter, "function");
assert.equal(typeof ImplementationWorkerDispatcher, "function");
assert.equal(IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION, 1);
assert.equal(typeof ensureProjectCoordinatorService, "function");
assert.equal(typeof stopProjectCoordinatorService, "function");
await remoteClient.disconnect();
await service.close();
await ensureProjectCoordinatorService(process.cwd());
const daemonClient = await connectProjectCoordinatorClient(process.cwd(), {
	clientId: "packed:daemon-client",
	kind: "test",
	supervision: "approved",
});
assert.equal(daemonClient.semanticExecution, "client_candidate");
await daemonClient.disconnect();
await stopProjectCoordinatorService(process.cwd());
assert.deepEqual(buildWikiState({ records: [] }).traceIds, []);
assert.deepEqual(buildWorkState({ records: [] }).changeIds, []);
assert.match(buildWorkState({ records: [] }).snapshotDigest, /^sha256:[a-f0-9]{64}$/);
assert.equal(runWikiConfig({}).config.project, "codewiki");

for (const dependency of Object.keys(packageJson.dependencies || {})) {
	assert.equal(dependency.startsWith("@earendil-works/"), false);
}
assert.equal(packageJson.dependencies["js-yaml"], undefined);
assert.equal(packageJson.dependencies.yaml.startsWith("^2."), true);
assert.equal(packageJson.dependencies.typebox, undefined);
assert.deepEqual(packageJson.peerDependencies, {
	"@earendil-works/pi-coding-agent": ">=0.80.10 <0.82.0",
	typebox: "*",
});
for (const forbiddenPath of [
	"lab",
	"tests",
	".codewiki",
	".pi",
	"_OLD_VERSION",
	"benchmarks",
	"private",
	"sealed",
	join("dist", "lab"),
	join("dist", "tests"),
	join("dist", "ideas"),
]) {
	assert.equal(existsSync(join(packageRoot, forbiddenPath)), false, forbiddenPath);
}
for (const path of filesUnder(packageRoot)) {
	if (!/\\.(?:js|d\\.ts|md|json)$/.test(path)) continue;
	const content = readFileSync(path, "utf8");
	for (const forbidden of [
		"wiki_ideas",
		"refs/codewiki/ideas",
		"ProposedChange",
		"src/ideas/",
	]) {
		assert.equal(content.includes(forbidden), false, path + ": " + forbidden);
	}
}
assert.equal(readdirSync(join(packageRoot, "dist")).includes("pi"), true);
assert.equal(existsSync(join(packageRoot, "dist", "preview", "evidence.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "changes", "trace-store.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "changes", "git-ref-store.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "changes", "legacy-migration.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "changes", "legacy-ref-reader.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "work-state", "projector.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "work-state", "session.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "reactor.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "project-coordinator.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "coordinator-entrypoint.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "project-reactors.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "project-coordinator-process.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "project-coordinator-daemon.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "pi", "project-coordinator-daemon.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "pi", "project-service-client.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "pi", "runtime-tool-routing.js")), true);
assert.equal(readFileSync(join(packageRoot, "dist", "pi", "extension.js"), "utf8").includes("lab/"), false);
assert.equal(readFileSync(join(packageRoot, "dist", "pi", "prompt", "index.js"), "utf8").includes("lab/"), false);

const extension = await import(pathToFileURL(join(packageRoot, "dist", "pi", "extension.js")).href);
const prompt = await import(pathToFileURL(join(packageRoot, "dist", "pi", "prompt", "index.js")).href);
const tui = await import(pathToFileURL(join(packageRoot, "dist", "pi", "tui", "index.js")).href);
const piSessionActions = await import(pathToFileURL(join(packageRoot, "dist", "pi", "dashboard-session-actions.js")).href);
assert.equal(extension.piExtensionAvailable, true);
assert.equal(prompt.codewikiPromptHooksAvailable, true);
assert.equal(tui.codewikiTuiRenderersAvailable, true);
assert.equal(typeof tui.renderBootstrapCommand, "function");
assert.equal(typeof extension.default, "function");
const deliveredUserMessages = [];
const actionControl = piSessionActions.createPiDashboardSessionActionControl(
	{
		registerTool() {},
		registerCommand() {},
		sendUserMessage(message, options) {
			deliveredUserMessages.push({ message, options });
		},
	},
	{ cwd: process.cwd(), isIdle: () => false },
);
const actionState = actionControl.status();
const actionResult = await actionControl.execute({
	commandId: "packed-session-action",
	traceId: "TRACE-packed-session-action",
	action: "change",
	expectedStateDigest: actionState.stateDigest,
});
assert.equal(actionResult.receipt.deliveredAs, "steer");
assert.equal(deliveredUserMessages.length, 1);
assert.match(deliveredUserMessages[0].message, /linked mutable Change/);
assert.deepEqual(deliveredUserMessages[0].options, { deliverAs: "steer" });
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
	"wiki_change",
	"wiki_decide",
	"wiki_plan",
	"wiki_implement",
	"wiki_archive",
]);
assert.deepEqual(events.map((event) => event.eventName), [
	"before_agent_start",
	"tool_result",
	"session_shutdown",
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
assert.match(
	statuses[0].value,
	/^CodeWiki \\S+ non-project · dashboard unavailable · \\/wiki-dashboard retry$/,
);
assert.deepEqual(commands, [
	"wiki-dashboard",
	"wiki-resume",
	"wiki-explain",
	"wiki-config",
	"wiki-bootstrap",
]);
const injected = await promptHook.handler({ systemPrompt: "base" }, { cwd: process.cwd() });
assert.match(injected.systemPrompt, /CodeWiki Pi guidance/);
assert.equal(injected.systemPrompt.includes("wiki_state"), true);
assert.equal(injected.systemPrompt.includes("runtimeReaction"), true);
assert.equal(injected.systemPrompt.includes("wiki_decide"), false);
assert.equal(
	injected.systemPrompt.includes("open the Work Pipeline dashboard automatically"),
	true,
);
assert.equal(injected.systemPrompt.includes("/wiki or"), false);
assert.deepEqual(await promptHook.handler({ systemPrompt: injected.systemPrompt }, { cwd: process.cwd() }), {});
`,
	);
	run(process.execPath, [smokeScript], { cwd: installRoot });
} finally {
	rmSync(root, { recursive: true, force: true });
}
