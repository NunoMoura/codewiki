import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, it } from "node:test";
import {
	CORE_SOURCE_ROOTS,
	CURRENT_SOURCE_ROOTS,
	FORBIDDEN_RUNTIME_SUBDIRECTORIES,
	IMPORT_CYCLE_BASELINE,
	LEGACY_SOURCE_FILE_COUNTS,
	LEGACY_SOURCE_ROOTS,
	OUTER_ADAPTER_SOURCE_ROOTS,
	RUNTIME_TO_PI_IMPORT_BASELINE,
	TARGET_SOURCE_ROOTS,
} from "../../src/project/source-architecture.ts";

const sourceRoot = resolve("src");

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
			"change-trace",
			"loops",
			"traces",
			"views",
		]);
		assert.equal(TARGET_SOURCE_ROOTS.includes("verification"), true);
		assert.equal(TARGET_SOURCE_ROOTS.includes("alignment"), true);
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
	});

	it("forbids parallel Loop Runtime subtrees", () => {
		const runtimeDirectories = readdirSync("src/runtime")
			.filter((name) => statSync(`src/runtime/${name}`).isDirectory());
		for (const directory of FORBIDDEN_RUNTIME_SUBDIRECTORIES) {
			assert.equal(runtimeDirectories.includes(directory), false, directory);
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

	it("freezes Runtime-to-Pi import debt until adapters invert", () => {
		const files = sourceFiles();
		const edges = importEdges(files);
		const runtimeToPi = [];
		for (const [source, targets] of edges) {
			if (!relative(sourceRoot, source).startsWith("runtime/")) continue;
			for (const target of targets) {
				if (relative(sourceRoot, target).startsWith("pi/")) {
					runtimeToPi.push(edgeLabel(source, target));
				}
			}
		}
		assert.deepEqual(runtimeToPi.sort(), [...RUNTIME_TO_PI_IMPORT_BASELINE]);
	});

	it("freezes import-cycle debt until clean cuts remove it", () => {
		assert.deepEqual(importCycles(importEdges(sourceFiles())), [
			...IMPORT_CYCLE_BASELINE,
		].sort());
	});
});
