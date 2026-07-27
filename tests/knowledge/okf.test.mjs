import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import {
	extractOkfMarkdownLinks,
	okfConceptId,
	okfDocumentKind,
} from "../../src/knowledge/okf.ts";
import {
	parseOkfDocument,
	serializeOkfDocument,
} from "../../src/knowledge/okf-frontmatter.ts";
import { generateOkfSourceMapExtensions } from "../../src/knowledge/okf-source-map.ts";
import { sourceOwnershipMapFromOkfBundle } from "../../src/knowledge/source-ownership.ts";
import {
	okfConceptDocuments,
	validateOkfBundle,
} from "../../src/knowledge/okf-validation.ts";

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

function readFullPathKbBundle() {
	return collectFiles(".codewiki/kb")
		.filter((path) => path.endsWith(".md"))
		.map((path) => ({ path, content: readFileSync(path, "utf8") }));
}

const validConcept = `---
type: Playbook
title: Incident response
description: Triage production incidents.
resource: https://example.com/runbook
tags: [incident, oncall]
timestamp: 2026-06-28T09:00:00Z
codewiki_component: runtime
codewiki_source_patterns:
  - src/runtime/**
---
# Steps

See [runtime](./runtime.md) and [traces](/system/components/traces.md).
`;

describe("Open Knowledge Format v0.1", () => {
	it("parses concept identity, frontmatter, body, and links", () => {
		const document = parseOkfDocument("system/runbook.md", validConcept);

		assert.equal(document.kind, "concept");
		assert.equal(document.conceptId, "system/runbook");
		assert.equal(document.frontmatter?.type, "Playbook");
		assert.equal(document.frontmatter?.codewiki_component, "runtime");
		assert.match(document.body, /^# Steps/);
		assert.deepEqual(
			extractOkfMarkdownLinks(document.body).map((link) => link.target),
			["./runtime.md", "/system/components/traces.md"],
		);
		assert.equal(okfConceptId("index.md"), undefined);
		assert.equal(okfDocumentKind("product/index.md"), "index");
	});

	it("round-trips producer extension fields", () => {
		const document = parseOkfDocument("system/runbook.md", validConcept);
		const serialized = serializeOkfDocument({
			frontmatter: document.frontmatter,
			body: document.body,
		});
		const reparsed = parseOkfDocument("system/runbook.md", serialized);

		assert.deepEqual(reparsed.frontmatter, document.frontmatter);
		assert.equal(reparsed.body, document.body);
	});

	it("validates the active CodeWiki KB as OKF concepts", () => {
		const bundle = readKbBundle();
		const result = validateOkfBundle(bundle);
		const sourceMap = sourceOwnershipMapFromOkfBundle(readFullPathKbBundle());
		const documentsByPath = new Map(
			result.documents.map((document) => [
				`.codewiki/kb/${document.path}`,
				document,
			]),
		);

		assert.deepEqual(result.issues, []);
		assert.equal(result.conceptCount, 50);
		assert.equal(result.reservedCount, 10);
		for (const extension of generateOkfSourceMapExtensions(sourceMap).filter(
			(candidate) => candidate.path.startsWith(".codewiki/kb/"),
		)) {
			const frontmatter = documentsByPath.get(extension.path)?.frontmatter;
			assert.ok(frontmatter, `missing OKF frontmatter for ${extension.path}`);
			for (const [key, value] of Object.entries(extension.fields)) {
				assert.deepEqual(frontmatter[key], value, `${extension.path} ${key}`);
			}
		}
		for (const path of collectFiles(".codewiki/traces").filter((candidate) =>
			candidate.endsWith(".jsonl"),
		)) {
			assert.equal(readFileSync(path, "utf8").startsWith("---\n"), false);
		}
	});

	it("validates required concept frontmatter and type", () => {
		const result = validateOkfBundle([
			{ path: "system/runbook.md", content: validConcept },
			{ path: "system/missing-frontmatter.md", content: "# Missing\n" },
			{
				path: "system/missing-type.md",
				content: "---\ntitle: Missing\n---\n# Body\n",
			},
			{
				path: "system/bad-tags.md",
				content: "---\ntype: Reference\ntags: nope\n---\n# Body\n",
			},
			{
				path: "system/bad-timestamp.md",
				content: "---\ntype: Reference\ntimestamp: yesterday\n---\n# Body\n",
			},
		]);

		assert.equal(result.conceptCount, 5);
		assert.deepEqual(
			result.issues.map((issue) => issue.code),
			[
				"missing_frontmatter",
				"invalid_type",
				"invalid_tags",
				"invalid_timestamp",
			],
		);
	});

	it("treats index.md and log.md as reserved non-concepts", () => {
		const result = validateOkfBundle([
			{
				path: "index.md",
				content:
					'---\nokf_version: "0.1"\n---\n# Root\n\n* [Runbook](system/runbook.md) - Triage.\n',
			},
			{
				path: "system/index.md",
				content: "# System\n\n* [Runbook](runbook.md) - Triage.\n",
			},
			{
				path: "system/log.md",
				content:
					"# Directory Update Log\n\n## 2026-06-28\n* **Update**: Added OKF.\n",
			},
			{ path: "system/runbook.md", content: validConcept },
		]);

		assert.equal(result.conceptCount, 1);
		assert.equal(result.reservedCount, 3);
		assert.deepEqual(result.issues, []);
		assert.deepEqual(
			okfConceptDocuments([
				{ path: "index.md", content: "# Root\n" },
				{ path: "system/runbook.md", content: validConcept },
			]).map((document) => document.conceptId),
			["system/runbook"],
		);
	});

	it("validates reserved file structure without rejecting broken concept links", () => {
		const result = validateOkfBundle([
			{ path: "system/index.md", content: "---\ntype: Index\n---\n# Bad\n" },
			{
				path: "system/log.md",
				content: "# Log\n\n## June 28\n* Bad heading.\n",
			},
			{
				path: "system/runbook.md",
				content:
					"---\ntype: Reference\n---\nSee [not yet written](./missing.md).\n",
			},
		]);

		assert.deepEqual(
			result.issues.map((issue) => issue.code),
			["reserved_frontmatter_not_allowed", "invalid_log_date_heading"],
		);
	});
});
