import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { generateOkfDirectoryIndex } from "../../src/knowledge/okf-index.ts";
import { validateOkfBundle } from "../../src/knowledge/okf-validation.ts";

function collectFiles(root) {
	const output = [];
	for (const name of readdirSync(root).sort()) {
		const path = `${root}/${name}`;
		if (statSync(path).isDirectory()) output.push(...collectFiles(path));
		else output.push(path);
	}
	return output;
}

function readKbBundle() {
	return collectFiles(".codewiki/kb")
		.filter((path) => path.endsWith(".md"))
		.map((path) => ({
			path: path.replace(/^\.codewiki\/kb\//, ""),
			content: readFileSync(path, "utf8"),
		}));
}

describe("OKF index and log navigation", () => {
	it("generates disposable indexes from semantic frontmatter", () => {
		const bundle = readKbBundle();
		const root = generateOkfDirectoryIndex(bundle, { includeRootVersion: true });
		const components = generateOkfDirectoryIndex(bundle, { directory: "system/components" });
		assert.match(root.content, /CodeWiki Lexicon/);
		assert.match(root.content, /11 concepts under `product\/`/);
		assert.match(root.content, /27 concepts under `system\/`/);
		assert.match(components.content, /Change Intake/);
		assert.match(components.content, /Verification/);
	});

	it("does not require disposable navigation projections in canonical Knowledge", () => {
		const paths = new Set(readKbBundle().map((file) => file.path));
		assert.equal(paths.has("index.md"), false);
		assert.equal(paths.has("log.md"), false);
	});

	it("treats the active native bundle as semantic concepts only", () => {
		const result = validateOkfBundle(readKbBundle());
		assert.deepEqual(result.issues, []);
		assert.equal(result.conceptCount, 39);
		assert.equal(result.reservedCount, 0);
	});

	it("uses progressive disclosure instead of linking every nested concept", () => {
		const bundle = readKbBundle();
		const root = generateOkfDirectoryIndex(bundle, {
			includeRootVersion: true,
		});
		const product = generateOkfDirectoryIndex(bundle, { directory: "product" });
		const system = generateOkfDirectoryIndex(bundle, { directory: "system" });

		assert.match(root.content, /\(product\/\)/);
		assert.match(root.content, /\(system\/\)/);
		assert.doesNotMatch(root.content, /system\/runtime\.md/);
		assert.doesNotMatch(root.content, /product\/stories\/intent\.md/);

		assert.match(product.content, /\(stories\/\)/);
		assert.doesNotMatch(product.content, /stories\/intent\.md/);

		assert.match(system.content, /\(components\/\)/);
		assert.doesNotMatch(system.content, /components\/runtime\.md/);
		const components = generateOkfDirectoryIndex(bundle, {
			directory: "system/components",
		});
		assert.match(components.content, /\(runtime\.md\)/);
	});
});
