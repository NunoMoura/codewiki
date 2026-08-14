import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, it } from "node:test";
import {
	CORE_SOURCE_ROOTS,
	CURRENT_SOURCE_ROOTS,
	FORBIDDEN_RUNTIME_SUBDIRECTORIES,
	IMPORT_CYCLE_BASELINE,
	LEGACY_SOURCE_FILE_COUNTS,
	LEGACY_SOURCE_FILES,
	LEGACY_SOURCE_ROOTS,
	OUTER_ADAPTER_SOURCE_ROOTS,
	TARGET_RUNTIME_SUBDIRECTORIES,
	TARGET_SOURCE_ROOTS,
} from "../../src/project/source-architecture.ts";

const sourceRoot = resolve("src");

function readJson(path) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		throw new Error(`Cannot parse ${path}.`, { cause: error });
	}
}

function sourceFiles(root = "src") {
	const files = [];
	for (const name of readdirSync(root).sort()) {
		const path = `${root}/${name}`;
		if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
		else if (path.endsWith(".ts")) files.push(resolve(path));
	}
	return files;
}

function importEdges(files) {
	const fileSet = new Set(files);
	const edges = new Map(files.map((file) => [file, new Set()]));
	for (const file of files) {
		const source = readFileSync(file, "utf8");
		for (const match of source.matchAll(
			/(?:from\s+|import\s*\()(["'])(\.{1,2}\/[^"']+)\1/g,
		)) {
			const target = resolveImport(file, match[2], fileSet);
			if (target) edges.get(file).add(target);
		}
	}
	return edges;
}

function resolveImport(file, specifier, fileSet) {
	const base = resolve(file, "..");
	const unresolved = resolve(base, specifier);
	for (const candidate of [
		unresolved,
		`${unresolved}.ts`,
		resolve(unresolved, "index.ts"),
	]) {
		if (fileSet.has(candidate)) return candidate;
	}
	return undefined;
}

function edgeLabel(source, target) {
	return `${relative(process.cwd(), source)} -> ${relative(process.cwd(), target)}`;
}

function importCycles(edges) {
	let index = 0;
	const stack = [];
	const active = new Set();
	const indexes = new Map();
	const lowlinks = new Map();
	const cycles = [];

	function visit(node) {
		indexes.set(node, index);
		lowlinks.set(node, index);
		index += 1;
		stack.push(node);
		active.add(node);
		for (const target of edges.get(node)) {
			if (!indexes.has(target)) {
				visit(target);
				lowlinks.set(node, Math.min(lowlinks.get(node), lowlinks.get(target)));
			} else if (active.has(target)) {
				lowlinks.set(node, Math.min(lowlinks.get(node), indexes.get(target)));
			}
		}
		if (lowlinks.get(node) !== indexes.get(node)) return;
		const component = [];
		while (true) {
			const member = stack.pop();
			active.delete(member);
			component.push(member);
			if (member === node) break;
		}
		if (component.length > 1) {
			cycles.push(
				component
					.map((member) => relative(process.cwd(), member))
					.sort()
					.join(" | "),
			);
		}
	}

	for (const file of edges.keys()) {
		if (!indexes.has(file)) visit(file);
	}
	return cycles.sort();
}

describe("source architecture", () => {
	it("records complete current roots and explicit target/legacy roots", () => {
		const roots = readdirSync("src")
			.filter((name) => statSync(`src/${name}`).isDirectory())
			.sort();
		assert.deepEqual(roots, [...CURRENT_SOURCE_ROOTS].sort());
		assert.deepEqual(LEGACY_SOURCE_ROOTS, [
			"benchmarks",
			"change-trace",
			"cli",
			"loops",
			"traces",
			"views",
		]);
		assert.deepEqual(
			CURRENT_SOURCE_ROOTS.filter(
				(root) => !TARGET_SOURCE_ROOTS.includes(root),
			),
			LEGACY_SOURCE_ROOTS,
		);
		assert.deepEqual(LEGACY_SOURCE_FILES, [
			"src/error-handling/config-errors.ts",
			"src/error-handling/trace-errors.ts",
			"src/semantic-loop.ts",
		]);
		for (const path of LEGACY_SOURCE_FILES) {
			assert.equal(existsSync(path), true, path);
		}
		assert.equal(TARGET_SOURCE_ROOTS.includes("verification"), true);
		assert.equal(TARGET_SOURCE_ROOTS.includes("alignment"), true);
		assert.equal(TARGET_SOURCE_ROOTS.includes("clients"), true);
		assert.equal(TARGET_SOURCE_ROOTS.includes("execution"), true);
		assert.equal(TARGET_SOURCE_ROOTS.includes("error-handling"), true);
		assert.equal(TARGET_SOURCE_ROOTS.includes("protocol"), true);
		assert.equal(TARGET_SOURCE_ROOTS.includes("runtime"), true);
		assert.equal(TARGET_SOURCE_ROOTS.includes("server"), true);
		assert.equal(TARGET_SOURCE_ROOTS.includes("api"), false);
		assert.equal(TARGET_SOURCE_ROOTS.includes("cli"), false);
		assert.equal(TARGET_SOURCE_ROOTS.includes("host"), false);
		assert.equal(TARGET_SOURCE_ROOTS.includes("harnesses"), false);
		assert.equal(TARGET_SOURCE_ROOTS.includes("benchmarks"), false);
		assert.equal(TARGET_SOURCE_ROOTS.includes("pi"), false);
		assert.equal(TARGET_SOURCE_ROOTS.includes("loop-exit"), false);
		assert.equal(TARGET_SOURCE_ROOTS.includes("traces"), false);
	});

	it("forbids new files in legacy source roots", () => {
		for (const [root, expectedCount] of Object.entries(
			LEGACY_SOURCE_FILE_COUNTS,
		)) {
			assert.equal(
				sourceFiles(`src/${root}`).length,
				expectedCount,
				root,
			);
		}
		assert.equal(existsSync(join(sourceRoot, "harnesses")), false);
		assert.equal(existsSync(join(sourceRoot, "dashboard")), false);
		assert.equal(existsSync(join(sourceRoot, "api")), false);
		assert.equal(existsSync(join(sourceRoot, "api", "protocol.ts")), false);
		assert.equal(
			existsSync(join(sourceRoot, "protocol", "client-server.ts")),
			true,
		);
		assert.equal(existsSync("tests/dashboard"), false);
		assert.equal(
			existsSync(join(sourceRoot, "clients", "pi", "dashboard-session-actions.ts")),
			false,
		);
		assert.equal(existsSync(join(sourceRoot, "clients", "app", "shell.ts")), true);
		for (const name of [
			"app-state.ts",
			"changes.ts",
			"configuration.ts",
			"dev-log.ts",
		]) {
			assert.equal(
				existsSync(join(sourceRoot, "runtime", "queries", name)),
				true,
				name,
			);
		}
		assert.equal(existsSync(join(sourceRoot, "host")), false);
		assert.equal(existsSync(join(sourceRoot, "server", "app", "server.ts")), true);
		assert.equal(
			existsSync(join(sourceRoot, "server", "app", "installed-runtime.ts")),
			true,
		);
		assert.equal(
			existsSync(join(sourceRoot, "server", "app", "authorization.ts")),
			true,
		);
		for (const name of ["enrollment.ts", "local.ts", "state.ts"]) {
			assert.equal(
				existsSync(join(sourceRoot, "server", "registry", name)),
				true,
				name,
			);
		}
		for (const name of ["oidc.ts", "proof.ts"]) {
			assert.equal(
				existsSync(join(sourceRoot, "server", "authentication", name)),
				true,
				name,
			);
		}
		for (const name of ["authorization.ts", "commands.ts"]) {
			assert.equal(
				existsSync(join(sourceRoot, "server", "pairing", name)),
				true,
				name,
			);
		}
		assert.equal(
			existsSync(join(sourceRoot, "server", "repository-access", "check.ts")),
			true,
		);
		assert.equal(
			existsSync(join(sourceRoot, "planning", "exit", "index.ts")),
			false,
		);
		assert.equal(
			existsSync(join(sourceRoot, "implementation", "exit", "index.ts")),
			false,
		);
		assert.equal(
			existsSync(join(sourceRoot, "server", "sessions", "contracts.ts")),
			true,
		);
		assert.equal(
			existsSync(join(sourceRoot, "server", "sessions", "state.ts")),
			true,
		);
		assert.equal(existsSync(join(sourceRoot, "project", "config-digest.ts")), false);
		assert.equal(existsSync(join(sourceRoot, "api", "views.ts")), false);
		assert.equal(existsSync(join(sourceRoot, "api", "traces.ts")), false);
		assert.equal(existsSync(join(sourceRoot, "api", "wiki-okf.ts")), false);
		assert.equal(
			existsSync(join(sourceRoot, "knowledge", "okf-export.ts")),
			true,
		);
		assert.equal(existsSync("tests/host"), false);
		assert.equal(existsSync("tests/server/app/lifecycle.test.mjs"), true);
		assert.equal(
			existsSync("tests/runtime/dashboard-preview-control.test.mjs"),
			false,
		);
		assert.equal(
			existsSync("tests/runtime/dashboard-coordinator-client.test.mjs"),
			false,
		);
		assert.equal(
			existsSync(
				join(sourceRoot, "clients", "app", "assets", "codewiki-logo.png"),
			),
			true,
		);
		assert.equal(
			existsSync(join(sourceRoot, "server", "coordinator-entrypoint.ts")),
			false,
		);
		assert.equal(existsSync(join(sourceRoot, "runtime", "gateway.ts")), true);
		assert.equal(existsSync(join(sourceRoot, "runtime", "index.ts")), true);
	});

	it("keeps Lab and source-checkout self-dogfood machinery deleted", () => {
		assert.equal(existsSync("lab"), false);
		assert.equal(existsSync("tests/lab"), false);
		for (const path of [
			"src/project/self-dogfood-baseline.ts",
			"src/project/self-dogfood-controller.ts",
			"tests/runtime/self-dogfood-baseline.test.mjs",
			"tests/runtime/self-dogfood-controller.test.mjs",
		]) {
			assert.equal(existsSync(path), false, path);
		}

		const packageJson = readJson("package.json");
		assert.deepEqual(
			Object.keys(packageJson.scripts).filter((name) =>
				/^(?:lab(?::|$)|self-dogfood:|test:self-dogfood)/u.test(name),
			),
			[],
		);
		for (const script of ["test:smoke", "test:features"]) {
			assert.match(
				packageJson.scripts[script],
				/tests\/execution\/pi\/\*\.test\.mjs/u,
			);
			assert.match(
				packageJson.scripts[script],
				/tests\/runtime\/workbenches\/\*\.test\.mjs/u,
			);
			assert.doesNotMatch(packageJson.scripts[script], /tests\/harnesses\/pi/u);
		}
		const tsconfig = readJson("tsconfig.json");
		assert.deepEqual(tsconfig.include, ["src/**/*.ts"]);
	});

	it("keeps Runtime subtrees within target responsibilities", () => {
		const runtimeEntries = readdirSync("src/runtime");
		const runtimeDirectories = runtimeEntries.filter((name) =>
			statSync(`src/runtime/${name}`).isDirectory(),
		);
		for (const directory of runtimeDirectories) {
			assert.equal(TARGET_RUNTIME_SUBDIRECTORIES.includes(directory), true, directory);
		}
		for (const directory of FORBIDDEN_RUNTIME_SUBDIRECTORIES) {
			assert.equal(runtimeDirectories.includes(directory), false, directory);
		}
		assert.equal(
			runtimeEntries.some((name) =>
				/^(?:product-(?:publication|release)|project-branch-(?:merge|push))/u.test(
					name,
				),
			),
			false,
		);
	});

	it("does not repeat responsibility directory names in filenames", () => {
		const repeatedPrefixes = {
			"src/runtime/coordinator": /^(?:coordinator-|project-coordinator)/u,
			"src/runtime/persistence": /^persistence-/u,
			"src/runtime/workers": /^(?:worker-|implementation-worker-)/u,
		};
		for (const [directory, repeatedPrefix] of Object.entries(repeatedPrefixes)) {
			for (const filename of readdirSync(directory)) {
				assert.equal(repeatedPrefix.test(filename), false, `${directory}/${filename}`);
			}
		}
	});

	it("keeps generic persistence mechanics under the Runtime persistence owner", () => {
		for (const obsolete of ["dev-log.ts", "tmp.ts", "trace-writer.ts"]) {
			assert.equal(existsSync(join(sourceRoot, "runtime", obsolete)), false, obsolete);
		}
		for (const current of ["dev-log.ts", "tmp.ts", "trace.ts"]) {
			assert.equal(
				existsSync(join(sourceRoot, "runtime", "persistence", current)),
				true,
				current,
			);
		}
	});

	it("keeps Runtime policy and admission with their responsibility owners", () => {
		assert.equal(existsSync(join(sourceRoot, "runtime", "policy.ts")), false);
		assert.equal(
			existsSync(join(sourceRoot, "runtime", "admission", "automation.ts")),
			true,
		);
		assert.equal(
			existsSync(join(sourceRoot, "runtime", "claims", "policy.ts")),
			true,
		);
		assert.equal(
			existsSync(
				join(sourceRoot, "runtime", "coordinator", "heartbeat-policy.ts"),
			),
			true,
		);
	});

	it("keeps User Standard distillation composition with Verification", () => {
		assert.equal(
			existsSync(join(sourceRoot, "runtime", "user-standard-distillation.ts")),
			false,
		);
		assert.equal(
			existsSync(
				join(sourceRoot, "verification", "custom-checks", "runtime.ts"),
			),
			true,
		);
	});

	it("keeps container custody under the Runtime workbench owner", () => {
		for (const name of ["adapter.ts", "command.ts", "git-mount.ts", "options.ts"]) {
			assert.equal(
				existsSync(join(sourceRoot, "runtime", "workbenches", "container", name)),
				true,
				name,
			);
		}
		assert.equal(existsSync(join(sourceRoot, "harnesses", "container")), false);
	});

	it("keeps managed Pi adapters under the Execution owner", () => {
		for (const name of [
			"coordinator-daemon.ts",
			"decision-model-check-session.ts",
			"decision-research-claims-session.ts",
			"isolated-json-model-session.ts",
			"native-decision-host.ts",
			"native-decision-research.ts",
			"process-session.ts",
			"process-worker-adapter.ts",
			"sdk-semantic-session.ts",
			"user-standard-distillation-session.ts",
		]) {
			assert.equal(existsSync(join(sourceRoot, "execution", "pi", name)), true, name);
			assert.equal(existsSync(join(sourceRoot, "harnesses", "pi", name)), false, name);
			assert.equal(existsSync(join(sourceRoot, "pi", name)), false, name);
		}
	});

	it("keeps Pi interaction adapters under the Client owner", () => {
		for (const name of [
			"command-catalog.ts",
			"extension.ts",
			"identity.ts",
			"install-scope.ts",
			"project-service-client.ts",
		]) {
			assert.equal(existsSync(join(sourceRoot, "clients", "pi", name)), true, name);
			assert.equal(existsSync(join(sourceRoot, "pi", name)), false, name);
		}
		assert.equal(
			existsSync(
				join(sourceRoot, "clients", "pi", "project-coordinator-daemon.ts"),
			),
			false,
		);
		assert.equal(
			existsSync(join(sourceRoot, "clients", "pi", "runtime-tool-routing.ts")),
			false,
		);
		assert.equal(existsSync(join(sourceRoot, "pi")), false);
		assert.equal(existsSync(join(sourceRoot, "pi-extension.ts")), true);
		const projectServiceClient = readFileSync(
			join(sourceRoot, "clients", "pi", "project-service-client.ts"),
			"utf8",
		);
		assert.doesNotMatch(
			projectServiceClient,
			/execution\/pi|coordinator\/process|spawnDaemon/u,
		);
		for (const path of sourceFiles(join(sourceRoot, "clients", "pi"))) {
			assert.doesNotMatch(
				readFileSync(path, "utf8"),
				/\b(?:ensureProjectCoordinatorService|connectEnsuredProjectCoordinatorClient|startProjectCoordinatorService|stopProjectCoordinatorService|spawnProjectCoordinatorDaemon)\b/u,
				path,
			);
		}
		const packageBootstrap = readFileSync(
			join(sourceRoot, "pi-extension.ts"),
			"utf8",
		);
		assert.match(packageBootstrap, /connectEnsuredProjectCoordinatorClient/u);
		assert.match(packageBootstrap, /spawnPiProjectCoordinatorDaemon/u);
	});

	it("forbids Clients from importing concrete Execution adapters", () => {
		for (const [source, targets] of importEdges(sourceFiles())) {
			if (!relative(sourceRoot, source).startsWith("clients/")) continue;
			for (const target of targets) {
				assert.equal(
					relative(sourceRoot, target).startsWith("execution/"),
					false,
					edgeLabel(source, target),
				);
			}
		}
	});

	it("forbids Execution adapters from importing interaction clients", () => {
		for (const [source, targets] of importEdges(sourceFiles())) {
			if (!relative(sourceRoot, source).startsWith("execution/")) continue;
			for (const target of targets) {
				assert.equal(
					relative(sourceRoot, target).startsWith("clients/"),
					false,
					edgeLabel(source, target),
				);
			}
		}
	});

	it("forbids core packages from importing outer adapters", () => {
		const rootFor = (file) => relative(sourceRoot, file).split("/")[0];
		for (const [source, targets] of importEdges(sourceFiles())) {
			if (!CORE_SOURCE_ROOTS.includes(rootFor(source))) continue;
			for (const target of targets) {
				assert.equal(
					OUTER_ADAPTER_SOURCE_ROOTS.includes(rootFor(target)),
					false,
					edgeLabel(source, target),
				);
			}
		}
	});

	it("forbids Loop packages from importing Runtime implementations", () => {
		const loopRoots = ["decision", "planning", "implementation"];
		for (const [source, targets] of importEdges(sourceFiles())) {
			const sourceRootName = relative(sourceRoot, source).split("/")[0];
			if (!loopRoots.includes(sourceRootName)) continue;
			for (const target of targets) {
				assert.equal(
					relative(sourceRoot, target).startsWith("runtime/"),
					false,
					edgeLabel(source, target),
				);
			}
		}
	});

	it("forbids Verification from importing Runtime or Loop implementations", () => {
		const forbiddenRoots = ["runtime", "decision", "planning", "implementation"];
		for (const [source, targets] of importEdges(sourceFiles())) {
			if (!relative(sourceRoot, source).startsWith("verification/")) continue;
			for (const target of targets) {
				assert.equal(
					forbiddenRoots.includes(relative(sourceRoot, target).split("/")[0]),
					false,
					edgeLabel(source, target),
				);
			}
		}
	});

	it("keeps Authentication and Pairing in distinct Server owners", () => {
		const authentication = readFileSync(
			join(sourceRoot, "server", "authentication", "proof.ts"),
			"utf8",
		);
		const pairing = readFileSync(
			join(sourceRoot, "server", "pairing", "commands.ts"),
			"utf8",
		);
		const pairingAuthorization = readFileSync(
			join(sourceRoot, "server", "pairing", "authorization.ts"),
			"utf8",
		);
		const registry = readFileSync(
			join(sourceRoot, "server", "registry", "state.ts"),
			"utf8",
		);
		const repositoryAccess = readFileSync(
			join(sourceRoot, "server", "repository-access", "check.ts"),
			"utf8",
		);
		assert.match(authentication, /export async function verifyServerAuthentication/);
		assert.match(authentication, /export interface ServerAuthenticationAssertion/);
		assert.match(authentication, /export function normalizeServerAuthenticationAssertion/);
		assert.doesNotMatch(authentication, /issueClientPairing|revokeClientPairing/);
		assert.match(pairing, /export function issueClientPairing/);
		assert.match(pairing, /export function revokeClientPairing/);
		assert.doesNotMatch(
			pairing,
			/verifyServerAuthentication|ServerAuthenticationProof|ServerAuthenticationAdapter/,
		);
		assert.match(pairingAuthorization, /export async function issueAuthorizedClientPairing/);
		assert.match(pairingAuthorization, /export async function revokeAuthorizedClientPairing/);
		assert.match(pairingAuthorization, /authorizeServerEndpoint/);
		assert.doesNotMatch(pairingAuthorization, /runtime\/gateway|repository-access/);
		assert.doesNotMatch(
			registry,
			/export (?:interface ServerAuthenticationAssertion|function normalizeServerAuthenticationAssertion)/,
		);
		assert.match(repositoryAccess, /export async function checkServerProviderRepositoryAccess/);
		assert.doesNotMatch(
			repositoryAccess,
			/issueClientPairing|openServerSession|runtime\/gateway|runtime\/authorization|authority|capability|permission|role/,
		);
		assert.equal(existsSync(join(sourceRoot, "api", "wiki-config.ts")), false);
	});

	it("wires App endpoints through Server Session authorization", () => {
		const server = readFileSync(
			join(sourceRoot, "server", "app", "server.ts"),
			"utf8",
		);
		const authorization = readFileSync(
			join(sourceRoot, "server", "app", "authorization.ts"),
			"utf8",
		);
		const shell = readFileSync(
			join(sourceRoot, "clients", "app", "shell.ts"),
			"utf8",
		);
		assert.match(server, /authorizeAppServerRequest/);
		assert.match(authorization, /authorizeServerEndpoint/);
		assert.match(authorization, /HttpOnly; SameSite=Strict/);
		assert.match(shell, /\/api\/session/);
		for (const source of [server, shell]) {
			assert.doesNotMatch(source, /codewiki\.dashboard\.token|#token=|validToken|\\?token=/);
		}
	});

	it("allows Server to import only the curated Runtime gateway", () => {
		for (const [source, targets] of importEdges(sourceFiles())) {
			const sourcePath = relative(sourceRoot, source);
			if (!sourcePath.startsWith("server/")) continue;
			for (const target of targets) {
				const targetPath = relative(sourceRoot, target);
				if (!targetPath.startsWith("runtime/")) continue;
				assert.equal(
					targetPath,
					"runtime/gateway.ts",
					edgeLabel(source, target),
				);
			}
		}
	});

	it("allows Runtime to depend only on neutral Execution ports", () => {
		for (const [source, targets] of importEdges(sourceFiles())) {
			if (!relative(sourceRoot, source).startsWith("runtime/")) continue;
			for (const target of targets) {
				const targetPath = relative(sourceRoot, target);
				assert.equal(
					targetPath.startsWith("server/"),
					false,
					edgeLabel(source, target),
				);
				if (!targetPath.startsWith("execution/")) continue;
				assert.equal(targetPath, "execution/ports.ts", edgeLabel(source, target));
			}
		}
	});

	it("forbids Runtime-to-concrete-Pi imports", () => {
		const files = sourceFiles();
		const edges = importEdges(files);
		const runtimeToPi = [];
		for (const [source, targets] of edges) {
			if (!relative(sourceRoot, source).startsWith("runtime/")) continue;
			for (const target of targets) {
				const targetPath = relative(sourceRoot, target);
				if (
					targetPath.startsWith("pi/") ||
					targetPath.startsWith("execution/pi/")
				) {
					runtimeToPi.push(edgeLabel(source, target));
				}
			}
		}
		assert.deepEqual(runtimeToPi.sort(), []);
	});

	it("freezes import-cycle debt until clean cuts remove it", () => {
		assert.deepEqual(importCycles(importEdges(sourceFiles())), [
			...IMPORT_CYCLE_BASELINE,
		].sort());
	});
});
