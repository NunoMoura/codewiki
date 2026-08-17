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
import * as packageModule from "@nunomoura/codewiki";
import {
	CODEWIKI_EXTENSION_AVAILABLE,
	CLIENT_PROJECT_SERVER_PROTOCOL,
	CLIENT_PAIRING_PROTOCOL,
	PROJECT_SERVER_REGISTRY_PROTOCOL,
	PROJECT_SERVER_REPOSITORY_ACCESS_PROTOCOL,
	PROJECT_SERVER_SESSION_PROTOCOL,
	buildWorkState,
	checkProjectServerProviderRepositoryAccess,
	createNextChangeOperation,
	enrollProjectServerOidcActor,
	issueAuthorizedClientPairing,
	revokeAuthorizedClientPairing,
	normalizeClientProjectServerQuery,
	openProjectServerSession,
	projectAlignmentGraph,
	verifyProjectServerAuthentication,
	verifyProjectServerOidcAuthentication,
	normalizeProjectServerRegistrySnapshot,
} from "@nunomoura/codewiki";
import {
	buildWikiState,
	connectProjectServerApi,
	createProjectServerApi,
	runWikiConfig,
	stopProjectServer,
} from "@nunomoura/codewiki/project-server";

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
assert.deepEqual(packageJson.pi, { extensions: ["dist/pi-extension.js"] });
assert.equal(packageJson.pi.skills, undefined);
assert.deepEqual(Object.keys(packageJson.exports).sort(), [
	".",
	"./package.json",
	"./pi-sdk",
	"./project-server",
	"./runtime",
]);
assert.deepEqual(packageJson.exports["./project-server"], {
	types: "./dist/project-server/index.d.ts",
	import: "./dist/project-server/index.js",
});
assert.deepEqual(packageJson.exports["./runtime"], {
	types: "./dist/runtime/index.d.ts",
	import: "./dist/runtime/index.js",
});
assert.deepEqual(packageJson.exports["./pi-sdk"], {
\ttypes: "./dist/runtime/pi/sdk-semantic-session.d.ts",
\timport: "./dist/runtime/pi/sdk-semantic-session.js",
});
assert.equal(
\tpackageJson.peerDependencies["@earendil-works/pi-coding-agent"],
\t">=0.80.10 <0.82.0",
);
assert.equal(
\tpackageJson.peerDependenciesMeta["@earendil-works/pi-coding-agent"].optional,
\ttrue,
);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "coordinator", "reactions.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "coordinator", "reactions.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "coordinator", "reactor.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "coordinator", "job-id.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "coordinator", "executor.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "coordinator", "executor.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "api", "loop-execution.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "change-trace")), false);
assert.equal(existsSync(join(packageRoot, "dist", "traces")), false);
assert.equal(existsSync(join(packageRoot, "dist", "views")), false);
assert.equal(existsSync(join(packageRoot, "dist", "loops")), true);
assert.equal(existsSync(join(packageRoot, "dist", "checks")), true);
assert.equal(existsSync(join(packageRoot, "dist", "verification")), false);
assert.equal(existsSync(join(packageRoot, "dist", "decision")), false);
assert.equal(existsSync(join(packageRoot, "dist", "planning")), false);
assert.equal(existsSync(join(packageRoot, "dist", "implementation")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "loop-exit")), false);
assert.equal(existsSync(join(packageRoot, "dist", "semantic-loop.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "error-handling", "trace-errors.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "error-handling", "config-errors.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project", "config-errors.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project", "config-errors.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "queries", "projection-types.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "queries", "project-board.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "work-state", "projection-types.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "work-state", "work-queue.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "alignment", "graph.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "alignment", "query.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "checks", "quality", "evaluator.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "checks", "quality", "graph.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "checks", "quality", "runner.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "loops", "implementation", "quality-feedback.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "loops", "review", "contracts.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "review", "index.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "security", "scanners.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "lifecycle", "decision.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "changes", "trace", "index.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "changes", "trace", "storage-errors.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "runtime-reaction-jobs.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "reactor.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "semantic-job-id.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "semantic-executor.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "persistence", "dev-log.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "persistence", "tmp.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "persistence", "trace.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "pairing", "authorization.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "pairing", "authorization.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "admission", "authority.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "admission", "authority.d.ts")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "repository-access", "check.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "repository-access", "check.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "implementation", "worker-observation-authority.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "persistence", "trace.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "dev-log.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "tmp.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "trace-writer.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "admission", "automation.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "claims", "policy.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "claims", "policy.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "coordinator", "heartbeat-policy.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "coordinator", "heartbeat-policy.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "policy.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "policy.d.ts")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "workers", "implementation-adapter.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "workers", "execution-policy.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "workers", "prompt.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "workers", "reports.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "workers", "start.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "workers", "handoff.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "checks", "index.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "checks", "packs", "defaults.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "checks", "packs", "loader.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "checks", "code.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "checks", "model.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "changes", "triage", "standards.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "checks", "packs", "runtime.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "user-standard-distillation.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "user-standard-distillation.d.ts")), false);
assert.equal(existsSync(join(packageRoot, "dist", "loops", "decision", "research.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "loops", "decision", "research-claims.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "loops", "decision", "research-executors.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "admission", "start.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "admission", "git.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "admission", "change.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "coordinator", "decision-attempt.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "effects", "gate-operations.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "effects", "decision-operations.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "lifecycle", "decision.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "lifecycle", "gates.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "effects", "research-collection.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "loop-exit-runtime.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "decision-research.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "decision-research-claims.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "native-decision-research.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "decision-attention-selection.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "decision-git-admission.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "native-decision-executor.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "native-decision-operations.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "change-intake.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "decision-research-collection.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "handoff.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "pi", "worker-start.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "pi", "worker-reports.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "clients", "app", "shell.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "clients", "cli", "index.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "cli")), false);
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
	"state",
]) {
	assert.equal(
		existsSync(join(packageRoot, "dist", "project-server", "queries", name + ".js")),
		true,
		name,
	);
}
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "app", "daemon.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "app", "server.js")), true);
assert.equal(
	existsSync(join(packageRoot, "dist", "project-server", "app", "request-error.js")),
	false,
);
assert.equal(
	existsSync(join(packageRoot, "dist", "project-server", "app", "installed-codewiki.js")),
	true,
);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "coordinator-entrypoint.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "coordinator-entrypoint.d.ts")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "index.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "index.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "index.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "contracts.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "runtime.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "builds", "store.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "processes", "protocol.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "api.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "api.d.ts")), true);
for (const name of ["archive", "implementation", "planning", "work"]) {
	assert.equal(
		existsSync(join(packageRoot, "dist", "project-server", "commands", name + ".js")),
		true,
		name,
	);
}
assert.equal(existsSync(join(packageRoot, "dist", "api")), false);
assert.equal(existsSync(join(packageRoot, "dist", "api", "protocol.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "api", "protocol.d.ts")), false);
assert.equal(existsSync(join(packageRoot, "dist", "protocol", "client-project-server.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "protocol", "client-project-server.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "protocol", "client-pairing.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "protocol", "client-pairing.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "api", "input-validation.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "api", "wiki-config.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "api", "views.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "api", "traces.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "host")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "authentication", "oidc.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "authentication", "oidc.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "authentication", "proof.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "authentication", "proof.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "registry", "enrollment.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "registry", "enrollment.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "registry", "local.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "registry", "local.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "registry", "state.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "registry", "state.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "utils", "time.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "utils", "time.d.ts")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "pairing", "commands.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "pairing", "commands.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "sessions", "contracts.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "sessions", "contracts.d.ts")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "sessions", "state.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "sessions", "state.d.ts")), true);
assert.doesNotMatch(
	readFileSync(join(packageRoot, "dist", "project-server", "pairing", "commands.d.ts"), "utf8"),
	/verifyProjectServerAuthentication|ProjectServerAuthenticationProof|ProjectServerAuthenticationAdapter/,
);
assert.doesNotMatch(
	readFileSync(join(packageRoot, "dist", "project-server", "registry", "state.d.ts"), "utf8"),
	/export (?:interface ProjectServerAuthenticationAssertion|declare function normalizeProjectServerAuthenticationAssertion)/,
);
assert.equal(existsSync(join(packageRoot, "dist", "error-handling", "host-errors.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "error-handling", "execution-errors.js")), false);
assert.equal(CLIENT_PROJECT_SERVER_PROTOCOL.id, "codewiki.client-project-server");
assert.equal(CLIENT_PROJECT_SERVER_PROTOCOL.version, "1.0.0");
assert.equal(PROJECT_SERVER_REGISTRY_PROTOCOL.id, "codewiki.project-server-registry");
assert.equal(PROJECT_SERVER_REGISTRY_PROTOCOL.version, "2.0.0");
assert.equal(CLIENT_PAIRING_PROTOCOL.id, "codewiki.client-pairing");
assert.equal(CLIENT_PAIRING_PROTOCOL.version, "1.0.0");
assert.equal(PROJECT_SERVER_SESSION_PROTOCOL.id, "codewiki.project-server-session");
assert.equal(PROJECT_SERVER_SESSION_PROTOCOL.version, "1.0.0");
assert.equal(PROJECT_SERVER_REPOSITORY_ACCESS_PROTOCOL.version, "1.0.0");
assert.equal(typeof checkProjectServerProviderRepositoryAccess, "function");
assert.equal(typeof createNextChangeOperation, "function");
assert.equal(typeof projectAlignmentGraph, "function");
assert.equal(typeof packageModule.createReviewAttempt, "function");
assert.equal(typeof packageModule.createReviewGate, "function");
assert.equal(typeof packageModule.commitReviewOperationSequence, "function");
assert.equal(typeof issueAuthorizedClientPairing, "function");
assert.equal(typeof revokeAuthorizedClientPairing, "function");
assert.equal(packageModule.issueClientPairing, undefined);
assert.equal(packageModule.revokeClientPairing, undefined);
assert.equal(typeof openProjectServerSession, "function");
assert.equal(typeof verifyProjectServerAuthentication, "function");
assert.equal(typeof verifyProjectServerOidcAuthentication, "function");
assert.equal(typeof enrollProjectServerOidcActor, "function");
assert.equal(
	normalizeProjectServerRegistrySnapshot({
		protocolId: PROJECT_SERVER_REGISTRY_PROTOCOL.id,
		protocolVersion: PROJECT_SERVER_REGISTRY_PROTOCOL.version,
		generation: 1,
		generatedAt: "2026-08-13T10:00:00.000Z",
		actors: [],
		pairings: [],
		projects: [],
	}).generation,
	1,
);
assert.equal(
	normalizeClientProjectServerQuery({
		protocolId: CLIENT_PROJECT_SERVER_PROTOCOL.id,
		protocolVersion: CLIENT_PROJECT_SERVER_PROTOCOL.version,
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
assert.equal(existsSync(join(packageRoot, "dist", "loops", "planning", "exit", "index.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "loops", "implementation", "exit", "index.js")), false);
assert.equal(
	existsSync(join(packageRoot, "dist", "harnesses")),
	false,
	"legacy Harness root is not packaged",
);
for (const name of ["adapter", "command", "git-mount", "options"]) {
	assert.equal(
		existsSync(
			join(packageRoot, "dist", "project-server", "workbenches", "container", name + ".js"),
		),
		true,
		name,
	);
}
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "workers", "implementation-report-store.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "workers", "implementation-artifacts.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "workers", "observation.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "workers", "dispatch.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "workers", "jobs.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "integration", "worker.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "claims", "release.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "implementation-worker-dispatch.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "implementation-worker-jobs.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "implementation-worker-review.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "implementation-worker-integration.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "claims", "events.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "claims", "leases.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "claims", "work-unit-events.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "claims", "work-unit-selection.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "effects", "project-branch-merge.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "effects", "project-branch-merge-git.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "effects", "project-branch-push.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "effects", "project-branch-push-operations.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "effects", "project-branch-push-manifest.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "effects", "product-publication.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "effects", "product-publication-proof.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "effects", "product-publication-contract.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "effects", "product-publication-artifact.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "effects", "product-publication-manifest.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "effects", "product-release.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "effects", "product-release-proof.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "effects", "product-release-contract.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "effects", "product-release-manifest.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "pi", "process-worker-adapter.js")), true);
assert.equal(CODEWIKI_EXTENSION_AVAILABLE, true);
const projectServerModule = await import("@nunomoura/codewiki/project-server");
assert.deepEqual(Object.keys(projectServerModule).sort(), [
	"CHANGE_INTAKE_RUNTIME_PROTOCOL",
	"buildProjectWikiState",
	"buildWikiState",
	"connectProjectServerApi",
	"createChangeIntakeProjectServer",
	"createCodeWikiLoopExecutionPorts",
	"createProjectServerApi",
	"runProjectServer",
	"runProjectServerSemanticExecutor",
	"runWikiArchive",
	"runWikiChange",
	"runWikiConfig",
	"runWikiDecide",
	"runWikiImplement",
	"runWikiOkf",
	"runWikiPlan",
	"stopProjectServer",
	"wikiChangeOperationMutates",
]);
assert.equal(typeof createProjectServerApi, "function");
const { spawnPiProjectCoordinatorDaemon } = await import(
	pathToFileURL(
		join(packageRoot, "dist", "runtime", "pi", "coordinator-daemon.js"),
	).href
);
const projectServerApi = await connectProjectServerApi(
	process.cwd(),
	{
		clientId: "packed:runtime-client",
		kind: "test",
		supervision: "approved",
	},
	{ spawnDaemon: spawnPiProjectCoordinatorDaemon },
);
assert.equal((await projectServerApi.queries.state()).supervisorCount, 1);
const appRequestContext = {
	actor: {actorId: "user:pack", authenticatedIdentityRef: "identity:pack"},
	client: {clientKind: "app", clientInstanceId: "app:pack", authenticationRef: "auth:pack"},
};
assert.equal((await projectServerApi.queries.appState(appRequestContext)).projectRoot, process.cwd());
assert.deepEqual((await projectServerApi.queries.changes(appRequestContext)).records, []);
assert.equal((await projectServerApi.queries.configuration(appRequestContext)).validation, "valid");
assert.equal(typeof projectServerApi.queries.inspect, "function");
assert.equal(typeof projectServerApi.queries.decisionAttention, "function");
assert.deepEqual(Object.keys(projectServerApi.queries).sort(), [
	"appState",
	"changes",
	"configuration",
	"decisionAttention",
	"inspect",
	"state",
]);
assert.equal(typeof projectServerApi.commands.selectDecision, "function");
assert.equal(typeof projectServerApi.commands.submitCandidate, "function");
assert.deepEqual(Object.keys(projectServerApi.commands).sort(), [
	"selectDecision",
	"submitCandidate",
]);
assert.equal(
	(await projectServerApi.events.read(0)).events[0].state,
	"client_connected",
);
await projectServerApi.connection.heartbeat();
await projectServerApi.connection.disconnect();
await stopProjectServer(process.cwd());
await assert.rejects(
	import("@nunomoura/codewiki/coordinator"),
	(error) => error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
);
const runtimeDeclarations = readFileSync(
	join(packageRoot, "dist", "project-server", "api.d.ts"),
	"utf8",
);
assert.equal(runtimeDeclarations.includes("ProjectCoordinator"), false);
assert.deepEqual(buildWikiState({ records: [] }).traceIds, []);
assert.deepEqual(buildWorkState({ records: [] }).changeIds, []);
assert.match(buildWorkState({ records: [] }).snapshotDigest, /^sha256:[a-f0-9]{64}$/);
assert.equal(runWikiConfig({}).config.project, "codewiki");
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "app", "authorization.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project", "config-digest.js")), false);

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
	join("dist", "benchmarks"),
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
	"isolated-json-model-session",
	"native-decision-host",
	"native-decision-research",
	"sdk-semantic-session",
]) {
	assert.equal(
		existsSync(join(packageRoot, "dist", "runtime", "pi", name + ".js")),
		true,
		name,
	);
	assert.equal(
		existsSync(join(packageRoot, "dist", "runtime", "pi", name + ".d.ts")),
		true,
		name,
	);
	assert.equal(
		existsSync(join(packageRoot, "dist", "pi", name + ".js")),
		false,
		name,
	);
}
for (const deleted of [
	"decision-research-claims-session",
	"user-standard-distillation-session",
]) {
	assert.equal(
		existsSync(join(packageRoot, "dist", "runtime", "pi", deleted + ".js")),
		false,
		deleted,
	);
}
assert.equal(
	existsSync(join(packageRoot, "dist", "runtime", "pi", "process-session.js")),
	true,
);
assert.equal(
	existsSync(join(packageRoot, "dist", "runtime", "pi", "process-session.d.ts")),
	true,
);
assert.equal(
	existsSync(join(packageRoot, "dist", "runtime", "contracts.js")),
	true,
);
assert.equal(
	existsSync(join(packageRoot, "dist", "pi", "process-session.js")),
	false,
	"legacy trace-host shell is not packaged",
);
assert.equal(existsSync(join(packageRoot, "dist", "preview", "evidence.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "changes", "trace", "store.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "changes", "git-ref-store.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "changes", "legacy-migration.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "changes", "legacy-ref-reader.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "work-state", "projector.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "work-state", "session.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "coordinator", "reactor.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "reactor.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "coordinator", "project.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "coordinator", "entrypoint.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "project-reactors.js")), false);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "coordinator", "process.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "project-server", "coordinator", "daemon.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "runtime", "pi", "coordinator-daemon.js")), true);
assert.equal(existsSync(join(packageRoot, "dist", "clients", "pi", "project-coordinator-daemon.js")), false);
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
assert.equal(readFileSync(join(packageRoot, "dist", "pi-extension.js"), "utf8").includes("lab/"), false);
assert.equal(readFileSync(join(packageRoot, "dist", "clients", "pi", "prompt", "index.js"), "utf8").includes("lab/"), false);

const extension = await import(pathToFileURL(join(packageRoot, "dist", "pi-extension.js")).href);
const prompt = await import(pathToFileURL(join(packageRoot, "dist", "clients", "pi", "prompt", "index.js")).href);
const tui = await import(pathToFileURL(join(packageRoot, "dist", "clients", "pi", "tui", "index.js")).href);
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
