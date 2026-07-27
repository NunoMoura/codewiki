import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import packageJson from "../../package.json" with { type: "json" };
import { runWikiOkf } from "../../src/api/wiki-okf.ts";
import { parseOkfDocument } from "../../src/knowledge/okf-frontmatter.ts";
import {
	consumeOkfBundle,
	exportCodeWikiOkfBundle,
} from "../../src/knowledge/okf-export.ts";

function collectFiles(root) {
	const output = [];
	for (const name of readdirSync(root).sort()) {
		const path = `${root}/${name}`;
		if (statSync(path).isDirectory()) output.push(...collectFiles(path));
		else output.push(path);
	}
	return output;
}

function repoOkfInputFiles() {
	return [...collectFiles(".codewiki/kb"), ...collectFiles(".codewiki/traces")]
		.filter((path) => path.endsWith(".md") || path.endsWith(".jsonl"))
		.map((path) => ({ path, content: readFileSync(path, "utf8") }));
}

describe("OKF export compatibility API", () => {
	it("validates and exports the active CodeWiki KB as OKF v0.1", () => {
		const input = repoOkfInputFiles();
		const validation = runWikiOkf({ action: "validate", files: input });
		const exported = runWikiOkf({ action: "export", files: input });

		assert.equal(validation.action, "validate");
		assert.equal(validation.okfVersion, "0.1");
		assert.equal(validation.scope, "codewiki-kb");
		assert.deepEqual(validation.validation.issues, []);
		assert.equal(validation.validation.conceptCount, 50);
		assert.equal(validation.validation.reservedCount, 10);
		assert.equal(exported.action, "export");
		assert.equal(exported.okfVersion, "0.1");
		assert.deepEqual(exported.validation.issues, []);
		assert.equal(exported.files.length, 60);
		assert.equal(
			exported.files.some((file) => file.path === "index.md"),
			true,
		);
		assert.equal(
			exported.files.some((file) => file.path.startsWith(".codewiki/traces/")),
			false,
		);
		assert.equal(
			exported.files.some((file) => file.path.endsWith(".jsonl")),
			false,
		);
		assert.deepEqual(exported.excludedTraceFiles, []);
	});

	it("preserves unknown OKF producer fields through consume/export", () => {
		const foreignConcept = `---
type: Concept
title: Foreign Concept
description: Imported from another OKF producer.
tags:
  - imported
timestamp: 2026-06-30T00:00:00Z
x_google_catalog:
  system: external
  id: concept-123
unknown_producer_key:
  nested:
    - keep-me
---
# Foreign Concept

Imported body.
`;
		const consumed = runWikiOkf({
			action: "consume",
			files: [{ path: "foreign/concept.md", content: foreignConcept }],
		});
		const exported = runWikiOkf({
			action: "export",
			scope: "okf-bundle",
			files: consumed.files,
		});
		const parsed = parseOkfDocument(
			exported.files[0].path,
			exported.files[0].content,
		);

		assert.equal(consumed.scope, "okf-bundle");
		assert.deepEqual(consumed.validation.issues, []);
		assert.equal(exported.files[0].content, foreignConcept);
		assert.deepEqual(parsed.frontmatter?.x_google_catalog, {
			system: "external",
			id: "concept-123",
		});
		assert.deepEqual(parsed.frontmatter?.unknown_producer_key, {
			nested: ["keep-me"],
		});
	});

	it("keeps trace JSONL out of generic CodeWiki KB exports", () => {
		const exported = exportCodeWikiOkfBundle({
			files: [
				{
					path: ".codewiki/kb/example.md",
					content: "---\ntype: Concept\n---\n# Example\n",
				},
				{
					path: ".codewiki/traces/TRACE-frontmatter-trap.jsonl",
					content: "---\ntype: Concept\n---\n# Trap\n",
				},
			],
		});

		assert.deepEqual(
			exported.files.map((file) => file.path),
			["example.md"],
		);
		assert.deepEqual(exported.excludedTraceFiles, [
			".codewiki/traces/TRACE-frontmatter-trap.jsonl",
		]);
	});

	it("does not add Google runtime dependencies for OKF compatibility", () => {
		const dependencyNames = [
			...Object.keys(packageJson.dependencies || {}),
			...Object.keys(packageJson.devDependencies || {}),
			...Object.keys(packageJson.peerDependencies || {}),
			...Object.keys(packageJson.optionalDependencies || {}),
			...Object.keys(packageJson.bundledDependencies || {}),
		];
		const forbidden = [
			"@google-cloud/bigquery",
			"@google-cloud/knowledge-catalog",
			"@google-cloud/aiplatform",
			"@google/generative-ai",
			"googleapis",
			"knowledge-catalog",
			"gemini",
		];

		assert.deepEqual(
			dependencyNames.filter((name) =>
				forbidden.some((forbiddenName) => name.includes(forbiddenName)),
			),
			[],
		);
		assert.equal(packageJson.dependencies.yaml.startsWith("^2."), true);
		assert.equal(packageJson.keywords.includes("okf"), true);
	});

	it("consume helper accepts generic OKF bundles without CodeWiki paths", () => {
		const result = consumeOkfBundle({
			files: [
				{
					path: "concepts/basic.md",
					content: "---\ntype: Concept\ntitle: Basic\n---\n# Basic\n",
				},
			],
		});

		assert.equal(result.scope, "okf-bundle");
		assert.deepEqual(result.validation.issues, []);
		assert.deepEqual(
			result.files.map((file) => file.path),
			["concepts/basic.md"],
		);
	});
});
