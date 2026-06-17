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
				content: "Use /wiki state and trace_close with repo-local dogfooding.",
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
				path: ".agents/skills/codewiki-state/SKILL.md",
				content:
					"Do this while the extension is disabled; hosts.cli is legacy.",
				scopes: ["operating_guidance"],
			},
		]);

		assert.deepEqual(
			issues.map((issue) => [issue.path, issue.ruleId, issue.match]),
			[
				["README.md", "public_command_namespace", "/codewiki "],
				["README.md", "transitional_cli_product_ux", "codewiki state"],
				["README.md", "trace_close_event_name", "trace.close"],
				[
					".agents/skills/codewiki-state/SKILL.md",
					"current_dogfood_guidance",
					"while the extension is disabled",
				],
			],
		);
	});

	it("formats findings for readiness assertions", () => {
		const issues = lintKnowledgeDrift(
			[
				{
					path: ".codewiki/kb/system/api.md",
					content: "Use /wiki status.",
					scopes: ["product_documentation"],
				},
			],
			CODEWIKI_KNOWLEDGE_DRIFT_RULES,
		);

		assert.deepEqual(formatKnowledgeDriftIssues(issues), [
			'.codewiki/kb/system/api.md: public_state_command: Public UX must use state, not status. (matched "/wiki status")',
		]);
	});
});
