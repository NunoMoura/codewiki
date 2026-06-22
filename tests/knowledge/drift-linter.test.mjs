import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	CODEWIKI_KNOWLEDGE_DRIFT_RULES,
	formatKnowledgeDriftIssues,
	lintKnowledgeDrift,
} from "../../src/knowledge/drift-linter.ts";

describe("knowledge drift linter", () => {
	it("returns no issues for current terminology", () => {
		const issues = lintKnowledgeDrift([
			{
				path: "README.md",
				content:
					"Use /wiki-state and trace_close with repo-local CodeWiki dogfooding disabled.",
				scopes: ["product_documentation", "operating_guidance"],
			},
		]);

		assert.deepEqual(issues, []);
	});

	it("scopes product UX and operating guidance rules separately", () => {
		const issues = lintKnowledgeDrift([
			{
				path: "README.md",
				content: "Run /codewiki state. Old trace.close wording remains.",
				scopes: ["product_documentation", "operating_guidance"],
			},
			{
				path: ".codewiki/kb/system/api-tools.md",
				content: "Run /wiki state for project state.",
				scopes: ["product_documentation"],
			},
			{
				path: ".agents/skills/codewiki-decide/SKILL.md",
				content:
					"Repo-local CodeWiki dogfooding is enabled; hosts.cli is legacy.",
				scopes: ["operating_guidance"],
			},
		]);

		assert.deepEqual(
			issues.map((issue) => [issue.path, issue.ruleId, issue.match]),
			[
				["README.md", "public_command_namespace", " /codewiki "],
				["README.md", "transitional_cli_product_ux", "codewiki state"],
				["README.md", "trace_close_event_name", "trace.close"],
				[
					".codewiki/kb/system/api-tools.md",
					"grouped_wiki_namespace",
					"/wiki state",
				],
				[
					".agents/skills/codewiki-decide/SKILL.md",
					"repo_local_dogfood_disabled",
					"Repo-local CodeWiki dogfooding is enabled",
				],
			],
		);
	});

	it("formats findings for readiness assertions", () => {
		const issues = lintKnowledgeDrift(
			[
				{
					path: ".codewiki/kb/system/api.md",
					content: "Use /wiki-status.",
					scopes: ["product_documentation"],
				},
			],
			CODEWIKI_KNOWLEDGE_DRIFT_RULES,
		);

		assert.deepEqual(formatKnowledgeDriftIssues(issues), [
			'.codewiki/kb/system/api.md: public_state_command: Public UX must use /wiki-state, not status. (matched "/wiki-status")',
		]);
	});

	it("blocks stored semantic event examples that duplicate loop names", () => {
		const issues = lintKnowledgeDrift([
			{
				path: ".codewiki/kb/system/traces.md",
				content: '{ "loop": "decision", "event": "decision.rows_approved" }',
				scopes: ["product_documentation"],
			},
		]);

		assert.deepEqual(
			issues.map((issue) => [issue.path, issue.ruleId, issue.match]),
			[
				[
					".codewiki/kb/system/traces.md",
					"prefixed_semantic_event_field",
					'"event": "decision.',
				],
			],
		);
	});
});
