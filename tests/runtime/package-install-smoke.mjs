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
	CLIENT_SERVER_PROTOCOL,
	HOST_PAIRING_PROTOCOL,
	HOST_REGISTRY_PROTOCOL,
	buildWikiState,
	buildWorkState,
	issueHostPairing,
	normalizeClientServerQuery,
	normalizeHostRegistrySnapshot,
	runWikiConfig,
} from "@nunomoura/codewiki";
import {
	connectProjectRuntimeGateway,
	createProjectRuntimeGateway,
	stopProjectRuntime,
} from "@nunomoura/codewiki/runtime";

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
assert.deepEqual(packageJson.pi, { extensions: ["dist/clients/pi/extension.js"] });
assert.equal(packageJson.pi.skills, undefined);
assert.deepEqual(Object.keys(packageJson.exports).sort(), [
	".",
	"./package.json",
	"./pi-sdk",
	"./runtime",
]);
assert.deepEqual(packageJson.exports["./runtime"], {
	types: "./dist/runtime/index.d.ts",
	import: "./dist/runtime/index.js",
});
assert.deepEqual(packageJson.exports["./pi-sdk"], {
\ttypes: "./dist/execution/pi/sdk-semantic-session.d.ts",
\timport: "./dist/execution/pi/sdk-semantic-session.js",
});
assert.equal(
\tpackageJson.peerDependencies["@earendil-works/pi-coding-agent"],
\t">=0.80.10 <0.82.0",
);
assert.equal(
\tpackageJson.peerDependenciesMeta["@earendil-works/pi-coding-agent"].optional,
\ttrue,
);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "coordinator", "reactions.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "coordinator", "reactions.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "coordinator", "reactor.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "coordinator", "job-id.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "coordinator", "executor.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "coordinator", "executor.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "api", "loop-execution.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "runtime-reaction-jobs.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "reactor.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "semantic-job-id.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "semantic-executor.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "persistence", "dev-log.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "persistence", "tmp.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "persistence", "trace.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "persistence", "trace.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "dev-log.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "tmp.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "trace-writer.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "admission", "automation.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "claims", "policy.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "claims", "policy.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "coordinator", "heartbeat-policy.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "coordinator", "heartbeat-policy.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "policy.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "policy.d.ts")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "workers", "implementation-adapter.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "workers", "execution-policy.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "workers", "prompt.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "workers", "reports.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "workers", "start.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "workers", "handoff.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "verification", "runtime.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "verification", "custom-checks", "runtime.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "verification", "custom-checks", "runtime.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "user-standard-distillation.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "user-standard-distillation.d.ts")), false);
assert.equal(existsSync(join(packageRoot, "dist", "decision", "exit", "research.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "decision", "exit", "research-claims.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "decision", "exit", "research-executors.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "admission", "start.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "admission", "git.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "admission", "change.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "coordinator", "decision-attempt.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "effects", "decision-operations.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "effects", "research-collection.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "loop-exit-runtime.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "decision-research.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "decision-research-claims.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "native-decision-research.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "decision-attention-selection.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "decision-git-admission.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "native-decision-executor.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "native-decision-operations.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "change-intake.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "decision-research-collection.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "handoff.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "pi", "worker-start.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "pi", "worker-reports.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "clients", "app", "shell.js")), true);
assert.equal(
	existsSync(
		join(
			packageRoot,
			"dist",
			"clients",
			"app",
			"assets",
			"codewiki-logo.png",
		),
	),
	true,
);
assert.equal(
	existsSync(join(packageRoot, "dist", "dashboard")),
	false,
	"legacy Dashboard root is not packaged",
);
for (const name of [
	"app-state",
	"changes",
	"configuration",
	"dev-log",
]) {
	assert.equal(
		existsSync(join(packageRoot, "dist", "runtime", "queries", name + ".js")),
		true,
		name,
	);
}
assert.equal(existsSync(join(packageRoot, "dist", "host", "app", "daemon.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "host", "app", "server.js")), true);
assert.equal(
	existsSync(join(packageRoot, "dist", "host", "app", "request-error.js")),
	false,
);
assert.equal(
	existsSync(join(packageRoot, "dist", "host", "app", "installed-runtime.js")),
	true,
);
assert.equal(existsSync(join(packageRoot, "dist", "host", "coordinator-entrypoint.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "host", "coordinator-entrypoint.d.ts")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "index.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "index.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "gateway.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "gateway.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "api", "protocol.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "api", "protocol.d.ts")), false);
assert.equal(existsSync(join(packageRoot, "dist", "protocol", "client-server.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "protocol", "client-server.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "api", "input-validation.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "host", "registry", "state.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "host", "registry", "state.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "host", "pairing", "commands.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "host", "pairing", "commands.d.ts")), true);
assert.equal(CLIENT_SERVER_PROTOCOL.id, "codewiki.client-server");
assert.equal(CLIENT_SERVER_PROTOCOL.version, "1.0.0");
assert.equal(HOST_REGISTRY_PROTOCOL.version, "1.0.0");
assert.equal(HOST_PAIRING_PROTOCOL.version, "1.0.0");
assert.equal(typeof issueHostPairing, "function");
assert.equal(
	normalizeHostRegistrySnapshot({
		protocolId: HOST_REGISTRY_PROTOCOL.id,
		protocolVersion: HOST_REGISTRY_PROTOCOL.version,
		generation: 1,
		generatedAt: "2026-08-13T10:00:00.000Z",
		actors: [],
		pairings: [],
		projects: [],
	}).generation,
	1,
);
assert.equal(
	normalizeClientServerQuery({
		protocolId: CLIENT_SERVER_PROTOCOL.id,
		protocolVersion: CLIENT_SERVER_PROTOCOL.version,
		kind: "query",
		transportRequestId: "packed:query",
		actor: {
			actorId: "user:packed",
			authenticatedIdentityRef: "identity:packed",
		},
		client: {
			clientKind: "cli",
			clientInstanceId: "cli:packed",
			authenticationRef: "auth:packed",
		},
		repositoryIdentity: "sha256:" + "1".repeat(64),
		queryName: "runtime.state",
		maxItems: 1,
		payload: {},
	}).actor.actorId,
	"user:packed",
);
assert.equal(
	existsSync(join(packageRoot, "dist", "harnesses")),
	false,
	"legacy Harness root is not packaged",
);
for (const name of ["adapter", "command", "git-mount", "options"]) {
	assert.equal(
		existsSync(
			join(packageRoot, "dist", "runtime", "workbenches", "container", name + ".js"),
		),
		true,
		name,
	);
}
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "workers", "implementation-report-store.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "workers", "implementation-artifacts.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "workers", "observation.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "workers", "dispatch.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "workers", "jobs.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "integration", "worker.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "claims", "release.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "implementation-worker-dispatch.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "implementation-worker-jobs.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "implementation-worker-review.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "implementation-worker-integration.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "claims", "events.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "claims", "leases.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "claims", "work-unit-events.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "claims", "work-unit-selection.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "effects", "project-branch-merge.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "effects", "project-branch-merge-git.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "effects", "project-branch-push.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "effects", "project-branch-push-operations.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "effects", "project-branch-push-manifest.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "effects", "product-publication.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "effects", "product-publication-proof.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "effects", "product-publication-contract.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "effects", "product-publication-artifact.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "effects", "product-publication-manifest.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "effects", "product-release.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "effects", "product-release-proof.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "effects", "product-release-contract.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "effects", "product-release-manifest.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "execution", "pi", "process-worker-adapter.js")), true);
assert.equal(CODEWIKI_EXTENSION_AVAILABLE, true);
const runtimeModule = await import("@nunomoura/codewiki/runtime");
assert.deepEqual(Object.keys(runtimeModule).sort(), [
	"connectProjectRuntimeGateway",
	"createProjectRuntimeGateway",
	"stopProjectRuntime",
]);
assert.equal(typeof createProjectRuntimeGateway, "function");
const runtimeGateway = await connectProjectRuntimeGateway(process.cwd(), {
	clientId: "packed:runtime-client",
	kind: "test",
	supervision: "approved",
});
assert.equal((await runtimeGateway.queries.state()).supervisorCount, 1);
assert.equal(typeof runtimeGateway.queries.inspect, "function");
assert.equal(typeof runtimeGateway.queries.decisionAttention, "function");
assert.equal(typeof runtimeGateway.commands.selectDecision, "function");
assert.equal(typeof runtimeGateway.commands.submitCandidate, "function");
assert.deepEqual(Object.keys(runtimeGateway.commands).sort(), [
	"selectDecision",
	"submitCandidate",
]);
assert.equal(
	(await runtimeGateway.events.read(0)).events[0].state,
	"client_connected",
);
await runtimeGateway.connection.heartbeat();
await runtimeGateway.connection.disconnect();
await stopProjectRuntime(process.cwd());
await assert.rejects(
	import("@nunomoura/codewiki/coordinator"),
	(error) => error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
);
const runtimeDeclarations = readFileSync(
	join(packageRoot, "dist", "runtime", "gateway.d.ts"),
	"utf8",
);
assert.equal(runtimeDeclarations.includes("ProjectCoordinator"), false);
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
assert.equal(readdirSync(join(packageRoot, "dist")).includes("pi"), false);
for (const name of [
	"decision-model-check-session",
	"decision-research-claims-session",
	"isolated-json-model-session",
	"native-decision-host",
	"native-decision-research",
	"sdk-semantic-session",
	"user-standard-distillation-session",
]) {
	assert.equal(
		existsSync(join(packageRoot, "dist", "execution", "pi", name + ".js")),
		true,
		name,
	);
	assert.equal(
		existsSync(join(packageRoot, "dist", "execution", "pi", name + ".d.ts")),
		true,
		name,
	);
	assert.equal(
		existsSync(join(packageRoot, "dist", "pi", name + ".js")),
		false,
		name,
	);
}
assert.equal(
	existsSync(join(packageRoot, "dist", "execution", "pi", "process-session.js")),
	true,
);
assert.equal(
	existsSync(join(packageRoot, "dist", "execution", "pi", "process-session.d.ts")),
	true,
);
assert.equal(
	existsSync(join(packageRoot, "dist", "execution", "ports.js")),
	true,
);
assert.equal(
	existsSync(join(packageRoot, "dist", "pi", "process-session.js")),
	false,
	"legacy trace-host shell is not packaged",
);
assert.equal(existsSync(join(packageRoot, "dist", "preview", "evidence.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "changes", "trace-store.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "changes", "git-ref-store.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "changes", "legacy-migration.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "changes", "legacy-ref-reader.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "work-state", "projector.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "work-state", "session.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "coordinator", "reactor.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "reactor.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "coordinator", "project.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "coordinator", "entrypoint.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "project-reactors.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "coordinator", "process.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "coordinator", "daemon.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "clients", "pi", "project-coordinator-daemon.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "clients", "pi", "project-service-client.js")), true);
assert.equal(
	existsSync(join(packageRoot, "dist", "clients", "pi", "dashboard-session-actions.js")),
	false,
);
assert.equal(existsSync(join(packageRoot, "dist", "dashboard", "session-actions.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "clients", "pi", "runtime-tool-routing.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "pi", "project-coordinator-daemon.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "pi", "project-service-client.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "pi", "runtime-tool-routing.js")), false);
assert.equal(readFileSync(join(packageRoot, "dist", "clients", "pi", "extension.js"), "utf8").includes("lab/"), false);
assert.equal(readFileSync(join(packageRoot, "dist", "clients", "pi", "prompt", "index.js"), "utf8").includes("lab/"), false);

const extension = await import(pathToFileURL(join(packageRoot, "dist", "clients", "pi", "extension.js")).href);
const prompt = await import(pathToFileURL(join(packageRoot, "dist", "clients", "pi", "prompt", "index.js")).href);
const tui = await import(pathToFileURL(join(packageRoot, "dist", "clients", "pi", "tui", "index.js")).href);
assert.equal(extension.piExtensionAvailable, true);
assert.equal(prompt.codewikiPromptHooksAvailable, true);
assert.equal(tui.codewikiTuiRenderersAvailable, true);
assert.equal(typeof tui.renderBootstrapCommand, "function");
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
	"wiki_attention",
	"wiki_config",
	"wiki_change",
	"wiki_archive",
]);
assert.deepEqual(events.map((event) => event.eventName), [
	"before_agent_start",
	"tool_result",
	"session_shutdown",
	"session_start",
	"session_shutdown",
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
	"wiki-attention",
	"wiki-select",
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
