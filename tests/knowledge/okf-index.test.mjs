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
		const indexes = generateOkfDirectoryIndexes(bundle);
		const root = indexes.find((index) => index.path === "index.md");
		const product = indexes.find((index) => index.path === "product/index.md");
		const stories = indexes.find(
			(index) => index.path === "product/stories/index.md",
		);
		const system = indexes.find((index) => index.path === "system/index.md");
		const components = indexes.find(
			(index) => index.path === "system/components/index.md",
		);

		assert.equal(root.path, "index.md");
		assert.match(
			root.content,
			/^---\nokf_version: "0\.1"\n---\n# CodeWiki Knowledge Index/,
		);
		assert.match(
			root.content,
			/\* \[Lexicon\]\(lexicon\.md\) - This file is CodeWiki's active vocabulary contract\./,
		);
		assert.match(root.content, /\* \[Product\]\(product\/\) - 14 concepts/);
		assert.match(root.content, /\* \[System\]\(system\/\) - 39 concepts/);

		assert.equal(product.path, "product/index.md");
		assert.match(
			product.content,
			/\* \[Product\]\(overview\.md\) - CodeWiki is a project-scoped intent-to-production alignment runtime/,
		);
		assert.match(product.content, /\* \[Stories\]\(stories\/\) - 6 concepts/);
		assert.match(
			stories.content,
			/\* \[Enforce Project-Specific Expectations\]\(custom-checks\.md\) - As a maintainer, I want bounded Custom Checks/,
		);

		assert.equal(system.path, "system/index.md");
		assert.match(
			system.content,
			/\* \[Components\]\(components\/\) - 31 concepts/,
		);
		assert.match(system.content, /\* \[Diagrams\]\(diagrams\/\) - 0 concepts/);
		assert.match(
			components.content,
			/\* \[Change Intake and Backlog Triage\]\(change-intake\.md\) - Change intake converts bounded findings and suggestions/,
		);
		assert.match(
			components.content,
			/\* \[Custom Checks\]\(custom-checks\.md\) - Custom Checks let a project define bounded required semantic policy/,
		);
		assert.match(
			components.content,
			/\* \[Evidence Records\]\(evidence\.md\) - Evidence Records give every Loop one immutable, typed, content-addressed way/,
		);
		assert.match(
			components.content,
			/\* \[Runtime\]\(runtime\.md\) - Runtime is CodeWiki's project-scoped authority and control plane/,
		);
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
				date: "2026-08-01",
				entries: [
					{
						kind: "Decision",
						text: "Deferred the complete Dashboard refactor until Runtime admission, native Loops, Evidence and assurance, archive/hydration, stable projections, and the legacy Trace clean cut are complete. Backend client contracts may proceed earlier, but visual patching of the legacy dashboard does not.",
					},
					{
						kind: "Update",
						text: "Added `codewiki.backlog-triage-projection@1.0.0` and bounded shared user/agent query `codewiki.backlog-triage-query@1.0.0`. Exact WorkState/Alignment Graph/config/policy bindings now produce provenance-bearing readiness, supported estimates, overlap, active-work blocking, freshness, Pareto, fairness, and explainable Decision-attention order without an overall score or Planning priority.",
					},
					{
						kind: "Update",
						text: "Added `codewiki.change-defect-profile@1.0.0` and Change Trace Protocol `1.2.0`. Exact revisions may preserve closed defect dimensions and qualified SARIF/CWE/CVE/GHSA/OSV/CVSS/KEV references with explicit Evidence authority while keeping unknown values, risk, and Planning priority separate.",
					},
					{
						kind: "Update",
						text: "Added closed user, provider-review, Worker Report, regression/scanner, delivery/outcome Evidence, and Knowledge-drift producers; advanced Change Intake Material to `1.1.0` and Change Trace to `1.3.0` for bounded claimed-security metadata. Pi process Worker Reports preserve bounded discovery proposals while Runtime alone adds exact Assignment, Claim, and tree bindings.",
					},
					{
						kind: "Update",
						text: "Replaced legacy `user | runtime | lab` feedback with strict `codewiki.change-intake-material@1.0.0` contracts under `src/changes/intake/**`. Eight closed source members carry bounded normalized semantic content and exact source-specific bindings without caller-owned Change identity, authority, time, priority, risk, route, or Check outcomes. Runtime now authenticates and correlates the exact material, records durable request/source/semantic fingerprints, deterministically routes current feedback or linked independent discovery, and verifies fresh expected-head Git acceptance.",
					},
					{
						kind: "Update",
						text: "Added provider-neutral protected Custom Check policy review and acceptance: exact authenticated review receipt, separate acceptance authority, repository/ref/config binding, deterministic config-only child commit, expected-head Git CAS, exact post-push verification, stale/drift rejection, and idempotent accepted-commit replay.",
					},
					{
						kind: "Update",
						text: "Added guarded Custom Check create/update/activate/disable commands with exact current/protected config CAS, protected Git-head loading, authenticated authority verification, idempotency, next-snapshot receipts, and protected-base anti-self-disable bindings; advanced the per-Check transport to Decision Model Check Request Protocol `3.0.0` and changed its machine id to `codewiki.decision.model-check-request`.",
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
		assert.equal(result.conceptCount, 54);
		assert.equal(result.reservedCount, 10);
		assert.deepEqual(documentsByPath.get("index.md")?.frontmatter, {
			okf_version: "0.1",
		});
		for (const path of [
			"log.md",
			"product/index.md",
			"product/stories/index.md",
			"product/uis/index.md",
			"product/users/index.md",
			"system/index.md",
			"system/components/index.md",
			"system/flows/index.md",
			"system/diagrams/index.md",
		]) {
			const document = documentsByPath.get(path);
			assert.ok(document, `missing ${path}`);
			assert.equal(document.kind === "concept", false);
			assert.equal(document.frontmatter, undefined);
		}
		assert.equal(
			parseOkfDocument("system/index.md", "# System\n").kind,
			"index",
		);
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
		assert.match(system.content, /\(diagrams\/\)/);
		assert.doesNotMatch(system.content, /components\/runtime\.md/);
		const components = generateOkfDirectoryIndex(bundle, {
			directory: "system/components",
		});
		assert.match(components.content, /\(runtime\.md\)/);
	});
});
