import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseOkfDocument } from "../../src/knowledge/okf-frontmatter.ts";
import {
	CODEWIKI_KB_BODY_CHARACTER_LIMITS,
	validateCodeWikiKbDocument,
} from "../../src/knowledge/codewiki-kb-profile.ts";

function document(path, frontmatter, body = "# Concept\n") {
	return parseOkfDocument(
		path,
		`---\n${frontmatter}\n---\n${body}`,
	);
}

describe("CodeWiki native Knowledge profile", () => {
	it("accepts canonical desired-state document locations", () => {
		const documents = [
			document("lexicon.md", "type: Lexicon\nstatus: stable"),
			document("product/DESIGN.md", "type: Design System\nstatus: stable"),
			document("product/users/maintainer.md", "type: User\nstatus: stable"),
			document(
				"product/stories/maintainer/authorize-release.md",
				'type: User Story\nstatus: stable\ncodewiki_user: "/product/users/maintainer.md"',
			),
			document(
				"system/components/runtime.md",
				"type: System Component\nstatus: stable\ncodewiki_source_patterns: [src/runtime/**]",
			),
			document("system/flows/change-lifecycle.md", "type: System Flow\nstatus: stable"),
		];

		for (const entry of documents) {
			assert.deepEqual(validateCodeWikiKbDocument(entry), []);
		}
	});

	it("rejects legacy paths, generic types, and missing lifecycle", () => {
		const issues = validateCodeWikiKbDocument(
			document("product/stories/intent.md", "type: Concept"),
		);

		assert.deepEqual(
			issues.map((entry) => entry.code),
			["invalid_document_type"],
		);
	});

	it("requires a Story path and owner to agree", () => {
		const issues = validateCodeWikiKbDocument(
			document(
				"product/stories/maintainer/authorize-release.md",
				'type: User Story\nstatus: stable\ncodewiki_user: "/product/users/agent.md"',
			),
		);

		assert.equal(issues[0].code, "invalid_story_owner");
	});

	it("keeps realization metadata on System Components only", () => {
		const issues = validateCodeWikiKbDocument(
			document(
				"system/flows/change-lifecycle.md",
				"type: System Flow\nstatus: stable\ncodewiki_source_patterns: [src/runtime/**]",
			),
		);

		assert.equal(issues[0].code, "realization_not_component_owned");
	});

	it("enforces deterministic per-type body limits", () => {
		const issues = validateCodeWikiKbDocument(
			document(
				"product/users/maintainer.md",
				"type: User\nstatus: stable",
				"x".repeat(CODEWIKI_KB_BODY_CHARACTER_LIMITS.User + 1),
			),
		);

		assert.equal(issues[0].code, "document_body_too_large");
	});
});
