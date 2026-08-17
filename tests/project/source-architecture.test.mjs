import assert from "node:assert/strict";
import {existsSync, readdirSync, readFileSync, statSync} from "node:fs";
import {join, relative, resolve} from "node:path";
import {describe, it} from "node:test";

import {
	CORE_SOURCE_ROOTS,
	CURRENT_SOURCE_ROOTS,
	FORBIDDEN_PROJECT_SERVER_SUBDIRECTORIES,
	IMPORT_CYCLE_BASELINE,
	LEGACY_SOURCE_FILES,
	LEGACY_SOURCE_ROOTS,
	OUTER_ADAPTER_SOURCE_ROOTS,
	TARGET_PROJECT_SERVER_SUBDIRECTORIES,
	TARGET_RUNTIME_SUBDIRECTORIES,
	TARGET_SOURCE_ROOTS,
} from "../../src/project/source-architecture.ts";

const sourceRoot = resolve("src");

function readJson(path) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		throw new Error(`Cannot parse ${path}.`, {cause: error});
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
	const unresolved = resolve(file, "..", specifier);
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
	it("records one clean set of current roots", () => {
		const roots = readdirSync("src")
			.filter((name) => statSync(`src/${name}`).isDirectory())
			.sort();
		assert.deepEqual(roots, [...CURRENT_SOURCE_ROOTS].sort());
		assert.deepEqual(TARGET_SOURCE_ROOTS, CURRENT_SOURCE_ROOTS);
		assert.deepEqual(LEGACY_SOURCE_ROOTS, []);
		assert.deepEqual(LEGACY_SOURCE_FILES, []);
		for (const root of ["project-server", "runtime", "checks", "loops"]) {
			assert.equal(TARGET_SOURCE_ROOTS.includes(root), true, root);
		}
		for (const removed of ["server", "execution", "api", "host", "harnesses"]) {
			assert.equal(TARGET_SOURCE_ROOTS.includes(removed), false, removed);
		}
	});

	it("keeps Project Server ownership in one source root", () => {
		const directories = readdirSync("src/project-server").filter((name) =>
			statSync(`src/project-server/${name}`).isDirectory(),
		);
		for (const directory of directories) {
			assert.equal(
				TARGET_PROJECT_SERVER_SUBDIRECTORIES.includes(directory),
				true,
				directory,
			);
		}
		for (const directory of FORBIDDEN_PROJECT_SERVER_SUBDIRECTORIES) {
			assert.equal(directories.includes(directory), false, directory);
		}
		for (const path of [
			"src/project-server/api.ts",
			"src/project-server/index.ts",
			"src/project-server/app/server.ts",
			"src/project-server/authentication/proof.ts",
			"src/project-server/pairing/commands.ts",
			"src/project-server/registry/state.ts",
			"src/project-server/sessions/state.ts",
			"src/project-server/lifecycle/gates.ts",
			"src/project-server/workbenches/container/adapter.ts",
		]) {
			assert.equal(existsSync(path), true, path);
		}
		assert.equal(existsSync("src/server"), false);
	});

	it("keeps Runtime execution mechanics in one subordinate source root", () => {
		const entries = readdirSync("src/runtime");
		const directories = entries.filter((name) =>
			statSync(`src/runtime/${name}`).isDirectory(),
		);
		assert.deepEqual(directories.sort(), [...TARGET_RUNTIME_SUBDIRECTORIES].sort());
		for (const path of [
			"src/runtime/index.ts",
			"src/runtime/contracts.ts",
			"src/runtime/runtime.ts",
			"src/runtime/builds/store.ts",
			"src/runtime/processes/protocol.ts",
			"src/runtime/processes/node-process-manager.ts",
			"src/runtime/checks/code.ts",
			"src/runtime/checks/model.ts",
		]) {
			assert.equal(existsSync(path), true, path);
		}
		assert.equal(existsSync("src/execution"), false);
	});

	it("keeps Workbenches under Implementation-owning Project Server", () => {
		for (const name of ["adapter.ts", "command.ts", "git-mount.ts", "options.ts"]) {
			assert.equal(
				existsSync(join(sourceRoot, "project-server", "workbenches", "container", name)),
				true,
				name,
			);
		}
		assert.equal(existsSync(join(sourceRoot, "runtime", "workbenches")), false);
	});

	it("keeps AuthN, pairing, sessions, and project AuthZ inside Project Server", () => {
		const authentication = readFileSync(
			join(sourceRoot, "project-server", "authentication", "proof.ts"),
			"utf8",
		);
		const pairing = readFileSync(
			join(sourceRoot, "project-server", "pairing", "commands.ts"),
			"utf8",
		);
		const authorization = readFileSync(
			join(sourceRoot, "project-server", "app", "authorization.ts"),
			"utf8",
		);
		assert.match(authentication, /verifyProjectServerAuthentication/);
		assert.doesNotMatch(authentication, /issueClientPairing|revokeClientPairing/);
		assert.match(pairing, /issueClientPairing/);
		assert.match(pairing, /revokeClientPairing/);
		assert.match(authorization, /authorizeProjectServerEndpoint/);
	});

	it("keeps domain cores independent of outer adapters", () => {
		const rootFor = (file) => relative(sourceRoot, file).split("/")[0];
		for (const [source, targets] of importEdges(sourceFiles())) {
			if (!CORE_SOURCE_ROOTS.includes(rootFor(source))) continue;
			for (const target of targets) {
				const targetPath = relative(sourceRoot, target);
				if (targetPath === "runtime/contracts.ts") continue;
				assert.equal(
					OUTER_ADAPTER_SOURCE_ROOTS.includes(rootFor(target)),
					false,
					edgeLabel(source, target),
				);
			}
		}
	});

	it("keeps Stage Loops independent of Project Server implementations", () => {
		for (const [source, targets] of importEdges(sourceFiles())) {
			if (!relative(sourceRoot, source).startsWith("loops/")) continue;
			for (const target of targets) {
				assert.equal(
					relative(sourceRoot, target).startsWith("project-server/"),
					false,
					edgeLabel(source, target),
				);
			}
		}
	});

	it("limits Project Server imports from Runtime to contracts and legacy review", () => {
		for (const [source, targets] of importEdges(sourceFiles())) {
			if (!relative(sourceRoot, source).startsWith("project-server/")) continue;
			for (const target of targets) {
				const targetPath = relative(sourceRoot, target);
				if (!targetPath.startsWith("runtime/")) continue;
				assert.equal(
					targetPath === "runtime/contracts.ts" ||
						targetPath.startsWith("runtime/review/"),
					true,
					edgeLabel(source, target),
				);
			}
		}
	});

	it("contains temporary Pi execution imports inside Runtime pi only", () => {
		for (const [source, targets] of importEdges(sourceFiles())) {
			const sourcePath = relative(sourceRoot, source);
			if (!sourcePath.startsWith("runtime/")) continue;
			for (const target of targets) {
				const targetPath = relative(sourceRoot, target);
				if (!targetPath.startsWith("project-server/")) continue;
				assert.equal(
					sourcePath.startsWith("runtime/pi/"),
					true,
					edgeLabel(source, target),
				);
			}
		}
	});

	it("keeps package subpaths aligned with Project Server and Runtime", () => {
		const packageJson = readJson("package.json");
		assert.equal(
			packageJson.exports["./project-server"].import,
			"./dist/project-server/index.js",
		);
		assert.equal(packageJson.exports["./runtime"].import, "./dist/runtime/index.js");
		for (const script of ["test:smoke", "test:features"]) {
			assert.match(packageJson.scripts[script], /tests\/project-server\/\*\*\/\*\.test\.mjs/u);
			assert.match(packageJson.scripts[script], /tests\/runtime\/processes\/\*\.test\.mjs/u);
			assert.match(packageJson.scripts[script], /tests\/runtime\/builds\/\*\.test\.mjs/u);
		}
	});

	it("freezes import-cycle debt through renamed owners", () => {
		assert.deepEqual(importCycles(importEdges(sourceFiles())), [
			...IMPORT_CYCLE_BASELINE,
		].sort());
	});
});
