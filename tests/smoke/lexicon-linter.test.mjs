#!/usr/bin/env node
import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadProject } from "../../src/project/context.ts";
import { executeCodewikiAudit } from "../../src/audit/tool.ts";

function mkdir(path) {
	mkdirSync(path, { recursive: true });
}

function write(path, content) {
	writeFileSync(path, content);
}

function writeJson(path, value) {
	write(path, JSON.stringify(value, null, 2));
}

const baseLexicon = [
	"---",
	"id: spec.lexicon",
	"---",
	"",
	"# Lexicon",
	"",
	"## Gateway",
	"",
	"Validation boundary.",
	"",
	"## Linter",
	"",
	"Deterministic rule set.",
	"",
	"## Evidence",
	"",
	"Compact support for an assertion.",
	"",
	"## Validation",
	"",
	"Gateway verdict.",
	"",
	"## Temporary compatibility term",
	"",
	"Non-canonical expression retained temporarily with replacement, narrow allowed contexts, and deletion trigger.",
	"",
	"### audit",
	"",
	"- Canonical replacement: linter or gateway evidence.",
	"- Removed expression pattern: `\\baudit(?:s|ed|ing)?\\b`",
	"- Allowed compatibility tokens: `/audit`, `wiki_audit`, `src/audit/**`, `AUDIT_*`, `Audit*`, `audit:*`, `audit.test.mjs`.",
	"- Allowed source literals: `audit`.",
	"- Allowed migration docs: `.codewiki/kb/system/**`.",
	"- Deletion trigger: remove after command, tool, schema, and profile migrations no longer require audit wording.",
	"",
	"### proof",
	"",
	"- Canonical replacement: evidence or content evidence.",
	"- Removed expression pattern: `\\bproofs?\\b`",
	"- Allowed compatibility tokens: `proof_refs`, `publisher-proof`.",
	"- Allowed migration docs: `.codewiki/kb/system/**`.",
	"- Deletion trigger: remove after schemas and migration docs use evidence wording only.",
	"",
	"### checks",
	"",
	"- Canonical replacement: linters and tests.",
	"- Removed expression pattern: `\\bchecks\\b`",
	"- Allowed compatibility tokens: `checks_run`, `CodeWiki-Checks`.",
	"- Allowed migration docs: `.codewiki/kb/system/**`.",
	"- Deletion trigger: remove after build schemas and validation reports use linter/test wording only.",
	"",
	"## Related docs",
	"",
].join("\n");

function createFixture({
	lexicon = baseLexicon,
	readme = "Gateway validation uses linter evidence. Linters and tests run at the gateway.",
	migrationDoc = "Legacy audit, proof, and checks wording is documented here only as migration compatibility.",
	source = 'export const command = "/audit";\nexport const profile = "audit";\nexport const help = "Run CodeWiki linter profiles.";\n',
	view = { title: "Gateway linter evidence" },
	validation = {
		rationale: "Gateway validation evidence uses linters and tests.",
	},
} = {}) {
	const root = mkdtempSync(resolve(tmpdir(), "codewiki-lexicon-linter-"));
	mkdir(resolve(root, ".codewiki", "kb", "system"));
	mkdir(resolve(root, ".codewiki", "validation"));
	mkdir(resolve(root, "src", "adapters", "pi", "commands"));
	writeJson(resolve(root, ".codewiki", "config.json"), {
		project_name: "lexicon-linter-fixture",
	});
	write(resolve(root, ".codewiki", "kb", "lexicon.md"), lexicon);
	write(resolve(root, ".codewiki", "kb", "system", "audits.md"), migrationDoc);
	write(resolve(root, "README.md"), readme);
	write(resolve(root, "src", "adapters", "pi", "commands", "audit.ts"), source);
	writeJson(resolve(root, ".codewiki", "index_graph.json"), view);
	writeJson(
		resolve(root, ".codewiki", "validation", "current.json"),
		validation,
	);
	return root;
}

async function runLexicon(root, paths) {
	const project = await loadProject(root);
	return executeCodewikiAudit(project, {
		profiles: ["lexicon"],
		...(paths ? { paths } : {}),
		include_fingerprints: false,
	});
}

function assertIssue(report, kind) {
	assert.ok(
		report.issues.some((issue) => issue.kind === kind),
		`expected ${kind}, got ${report.issues.map((issue) => `${issue.kind}:${issue.message}`).join(" | ")}`,
	);
}

function assertNoIssue(report, kind) {
	assert.ok(
		!report.issues.some((issue) => issue.kind === kind),
		`unexpected ${kind}: ${report.issues.map((issue) => `${issue.kind}:${issue.message}`).join(" | ")}`,
	);
}

async function withFixture(options, callback) {
	const root = createFixture(options);
	try {
		await callback(root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

async function main() {
	await withFixture({}, async (root) => {
		const report = await runLexicon(root);
		assert.equal(
			report.status,
			"pass",
			`allowed compatibility usage should pass: ${report.issues.map((issue) => `${issue.kind}:${issue.message}`).join(" | ")}`,
		);
		assert.equal(
			report.profile_results[0].details.temporary_compatibility_terms.length,
			3,
		);
		assertNoIssue(report, "temporary-compatibility-term-used-as-canonical");
	});

	await withFixture(
		{
			readme:
				"Gateway validation uses linter evidence, but this user doc says audit proof checks are canonical quality terms.",
		},
		async (root) => {
			const report = await runLexicon(root, ["README.md"]);
			assert.equal(report.status, "fail");
			assertIssue(report, "temporary-compatibility-term-used-as-canonical");
		},
	);

	await withFixture(
		{
			view: { title: "Generated view says audit proof" },
			validation: { rationale: "Validation report says checks are canonical." },
		},
		async (root) => {
			const report = await runLexicon(root, [
				".codewiki/index_graph.json",
				".codewiki/validation",
			]);
			assert.equal(report.status, "fail");
			assertIssue(report, "temporary-compatibility-term-used-as-canonical");
		},
	);

	await withFixture(
		{
			lexicon: `${baseLexicon}\n## Quality surface\n\nUnused old quality language.\n`,
		},
		async (root) => {
			const report = await runLexicon(root);
			assert.equal(report.status, "fail");
			assertIssue(report, "unused-canonical-term");
		},
	);

	await withFixture(
		{
			lexicon: `${baseLexicon}\n## Audit proof\n\nRemoved vocabulary must not become canonical again.\n`,
		},
		async (root) => {
			const report = await runLexicon(root);
			assert.equal(report.status, "fail");
			assertIssue(report, "removed-term-in-lexicon");
		},
	);

	await withFixture(
		{
			lexicon: [
				"# Lexicon",
				"",
				"## Gateway",
				"",
				"Gateway validation uses linter evidence.",
				"",
				"## Temporary compatibility term",
				"",
				"Compatibility metadata owner.",
				"",
				"### audit",
				"",
				"- Canonical replacement: linter.",
				"- Removed expression pattern: `\\baudit\\b`",
				"- Allowed compatibility tokens: `/audit`.",
				"",
			].join("\n"),
		},
		async (root) => {
			const report = await runLexicon(root);
			assert.equal(report.status, "fail");
			assertIssue(report, "temporary-compatibility-metadata-missing");
		},
	);
}

main().then(() => console.log("✓ lexicon linter smoke passed"));
