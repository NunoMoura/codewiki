import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { parse as parseYaml } from "yaml";
import { validateCodeWikiKbDocument } from "../../src/knowledge/codewiki-kb-profile.ts";
import { parseOkfDocument } from "../../src/knowledge/okf-frontmatter.ts";
import { analyzeOkfV02Document } from "../../src/knowledge/okf-v02.ts";
import { validateSystemDiagrams } from "../../src/knowledge/system-diagrams.ts";

const root = ".codewiki/kb";

function filesBelow(directory) {
	return readdirSync(directory)
		.sort()
		.flatMap((name) => {
			const file = `${directory}/${name}`;
			return statSync(file).isDirectory() ? filesBelow(file) : [file];
		});
}

function knowledgeState() {
	const files = filesBelow(root);
	const documents = files
		.filter((file) => file.endsWith(".md"))
		.map((file) =>
			parseOkfDocument(file.slice(root.length + 1), readFileSync(file, "utf8")),
		);
	const diagrams = files
		.filter((file) => file.endsWith(".yaml"))
		.map((file) => parseYaml(readFileSync(file, "utf8")));
	return { files, documents, diagrams };
}

describe("CodeWiki native Knowledge bundle", () => {
	it("contains only canonical semantic documents and diagrams", () => {
		const { files, documents } = knowledgeState();
		assert.equal(
			files.every(
				(file) =>
					file.endsWith(".md") ||
					/^\.codewiki\/kb\/system\/diagrams\/[a-z0-9-]+\.yaml$/.test(file),
			),
			true,
		);
		assert.deepEqual(documents.flatMap(validateCodeWikiKbDocument), []);
		const concepts = new Set(documents.map((document) => `/${document.path}`));
		const lexicon = documents.find((document) => document.path === "lexicon.md");
		assert.ok(lexicon);
		const ownerTargets = [...lexicon.body.matchAll(/\|\s*\[[^\]]+\]\(([^)]+)\)\s*\|$/gm)].map(
			(match) => `/${match[1]}`,
		);
		assert.equal(ownerTargets.length > 0, true);
		assert.equal(ownerTargets.every((target) => concepts.has(target)), true);
		assert.deepEqual(
			documents.flatMap((document) => analyzeOkfV02Document(document).issues),
			[],
		);
	});

	it("resolves every authored relationship to one canonical concept", () => {
		const { documents } = knowledgeState();
		const concepts = new Set(documents.map((document) => `/${document.path}`));
		const unresolved = documents.flatMap((document) =>
			(document.frontmatter?.codewiki_relationships ?? []).flatMap(
				(relationship) =>
					concepts.has(relationship.target)
						? []
						: [`${document.path} -> ${relationship.target}`],
			),
		);
		assert.deepEqual(unresolved, []);
	});

	it("maps every stable Component and Flow to diagram topology and Product intent", () => {
		const { documents, diagrams } = knowledgeState();
		const components = documents.filter(
			(document) => document.frontmatter?.type === "System Component",
		);
		const flows = documents.filter(
			(document) => document.frontmatter?.type === "System Flow",
		);
		assert.deepEqual(
			validateSystemDiagrams({
				diagrams,
				componentConcepts: components.map((document) => `/${document.path}`),
				flowConcepts: flows.map((document) => `/${document.path}`),
			}),
			[],
		);
		const realizedStories = new Set();
		for (const document of [...components, ...flows]) {
			const relationships = document.frontmatter.codewiki_relationships ?? [];
			for (const relationship of relationships) {
				if (
					relationship.type === "realizes" &&
					relationship.target.startsWith("/product/stories/")
				) {
					realizedStories.add(relationship.target);
				}
			}
			assert.equal(
				relationships.some(
					(relationship) =>
						relationship.type === "realizes" &&
						relationship.target.startsWith("/product/stories/"),
				),
				true,
				`${document.path} must realize a Product Story`,
			);
		}
		for (const story of documents.filter(
			(document) =>
				document.frontmatter?.type === "User Story" &&
				document.frontmatter.status === "stable",
		)) {
			assert.equal(
				realizedStories.has(`/${story.path}`),
				true,
				`${story.path} must be realized by a Component or Flow`,
			);
		}
	});

	it("contains desired state rather than authored history or migration views", () => {
		const { documents } = knowledgeState();
		const forbiddenHeading = /^## (Current State|History|Migration|Status|Update Log|Completed Checklist)$/m;
		assert.deepEqual(
			documents.flatMap((document) =>
				forbiddenHeading.test(document.body) ? [document.path] : [],
			),
			[],
		);
	});
});
