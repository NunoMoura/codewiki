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

function valueImportEdges(files) {
	const fileSet = new Set(files);
	const edges = [];
	for (const file of files) {
		const source = readFileSync(file, "utf8");
		for (const match of source.matchAll(
			/^import\s+(?!type\b)[\s\S]*?\sfrom\s+(["'])(\.{1,2}\/[^"']+)\1;/gmu,
		)) {
			const target = resolveImport(file, match[2], fileSet);
			if (target) edges.push([file, target]);
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
			"change-trace",
			"loops",
			"traces",
			"views",
		]);
		assert.equal(TARGET_SOURCE_ROOTS.includes("verification"), true);
		assert.equal(TARGET_SOURCE_ROOTS.includes("alignment"), true);
		assert.equal(TARGET_SOURCE_ROOTS.includes("clients"), true);
		assert.equal(TARGET_SOURCE_ROOTS.includes("execution"), true);
		assert.equal(TARGET_SOURCE_ROOTS.includes("host"), true);
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
		assert.equal(
			existsSync(join(sourceRoot, "host", "coordinator-entrypoint.ts")),
			true,
		);
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
			"project-coordinator-daemon.ts",
			"project-service-client.ts",
		]) {
			assert.equal(existsSync(join(sourceRoot, "clients", "pi", name)), true, name);
			assert.equal(existsSync(join(sourceRoot, "pi", name)), false, name);
		}
		assert.equal(
			existsSync(join(sourceRoot, "clients", "pi", "runtime-tool-routing.ts")),
			false,
		);
		assert.equal(existsSync(join(sourceRoot, "pi")), false);
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

	it("forbids Runtime Coordinator from importing API implementations", () => {
		for (const [source, target] of valueImportEdges(sourceFiles())) {
			if (!relative(sourceRoot, source).startsWith("runtime/coordinator/")) {
				continue;
			}
			assert.equal(
				relative(sourceRoot, target).startsWith("api/"),
				false,
				edgeLabel(source, target),
			);
		}
	});

	it("allows Runtime to depend only on neutral Execution ports", () => {
		for (const [source, targets] of importEdges(sourceFiles())) {
			if (!relative(sourceRoot, source).startsWith("runtime/")) continue;
			for (const target of targets) {
				const targetPath = relative(sourceRoot, target);
				assert.equal(
					targetPath.startsWith("host/"),
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
