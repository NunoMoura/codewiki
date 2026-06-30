import assert from "node:assert/strict";
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
import {
	okfConceptDocuments,
	validateOkfBundle,
} from "../../src/knowledge/okf-validation.ts";

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

See [runtime](./runtime.md) and [traces](/system/traces.md).
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
			["./runtime.md", "/system/traces.md"],
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
