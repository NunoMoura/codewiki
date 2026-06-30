import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { parseOkfDocument } from "../../src/knowledge/okf-frontmatter.ts";
import {
	generateOkfDirectoryIndex,
	generateOkfDirectoryIndexes,
	generateOkfLog,
} from "../../src/knowledge/okf-index.ts";
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
	it("generates indexes from concept frontmatter descriptions", () => {
		const bundle = readKbBundle();
		const [root, product, system] = generateOkfDirectoryIndexes(bundle);

		assert.equal(root.path, "index.md");
		assert.match(root.content, /^---\nokf_version: "0\.1"\n---\n# CodeWiki Knowledge Index/);
		assert.match(
			root.content,
			/\* \[Lexicon\]\(lexicon\.md\) - This file is CodeWiki's active vocabulary contract\./,
		);
		assert.match(root.content, /\* \[Product\]\(product\/\) - 11 concepts/);
		assert.match(root.content, /\* \[System\]\(system\/\) - 31 concepts/);

		assert.equal(product.path, "product/index.md");
		assert.match(
			product.content,
			/\* \[Product\]\(overview\.md\) - CodeWiki exists to keep repository intent/,
		);
		assert.match(product.content, /\* \[Stories\]\(stories\/\) - 5 concepts/);

		assert.equal(system.path, "system/index.md");
		assert.match(system.content, /\* \[Runtime\]\(runtime\.md\) - Runtime is CodeWiki's outer control loop\./);
		assert.match(system.content, /\* \[Components\]\(components\/\) - 5 concepts/);
	});

	it("keeps checked-in navigation files identical to generated output", () => {
		const bundle = readKbBundle();
		for (const index of generateOkfDirectoryIndexes(bundle)) {
			assert.equal(
				readFileSync(`.codewiki/kb/${index.path}`, "utf8"),
				index.content,
			);
		}
		assert.equal(
			readFileSync(".codewiki/kb/log.md", "utf8"),
			generateOkfLog({
				date: "2026-06-30",
				entries: [
					{
						kind: "Update",
						text: "Migrated CodeWiki KB concepts to OKF v0.1 frontmatter.",
					},
					{
						kind: "Creation",
						text: "Added progressive-disclosure navigation through [root](index.md), [Product](product/index.md), and [System](system/index.md) indexes.",
					},
				],
			}),
		);
	});

	it("treats reserved navigation files as non-concepts", () => {
		const result = validateOkfBundle(readKbBundle());
		const documentsByPath = new Map(
			result.documents.map((document) => [document.path, document]),
		);

		assert.deepEqual(result.issues, []);
		assert.equal(result.conceptCount, 43);
		assert.equal(result.reservedCount, 4);
		assert.deepEqual(documentsByPath.get("index.md")?.frontmatter, {
			okf_version: "0.1",
		});
		for (const path of ["log.md", "product/index.md", "system/index.md"]) {
			const document = documentsByPath.get(path);
			assert.ok(document, `missing ${path}`);
			assert.equal(document.kind === "concept", false);
			assert.equal(document.frontmatter, undefined);
		}
		assert.equal(parseOkfDocument("system/index.md", "# System\n").kind, "index");
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

		assert.match(system.content, /\(runtime\.md\)/);
		assert.match(system.content, /\(components\/\)/);
		assert.doesNotMatch(system.content, /components\/runtime\.md/);
	});
});
