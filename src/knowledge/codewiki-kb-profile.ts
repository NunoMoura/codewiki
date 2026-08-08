import { normalizeOkfPath } from "./okf.ts";
import type { OkfDocument, OkfFrontmatterValue } from "./okf-frontmatter.ts";

export const CODEWIKI_KB_DOCUMENT_TYPES = Object.freeze([
	"Lexicon",
	"User",
	"User Story",
	"Design System",
	"System Component",
	"System Flow",
] as const);

export type CodeWikiKbDocumentType =
	(typeof CODEWIKI_KB_DOCUMENT_TYPES)[number];

export const CODEWIKI_KB_BODY_CHARACTER_LIMITS = Object.freeze({
	Lexicon: 20_000,
	User: 4_000,
	"User Story": 5_000,
	"Design System": 32_000,
	"System Component": 10_000,
	"System Flow": 8_000,
} as const satisfies Record<CodeWikiKbDocumentType, number>);

export interface CodeWikiKbProfileIssue {
	readonly code:
		| "invalid_document_path"
		| "invalid_document_type"
		| "missing_status"
		| "invalid_story_owner"
		| "unexpected_story_owner"
		| "realization_not_component_owned"
		| "frontmatter_too_large"
		| "document_body_too_large"
		| "invalid_lexicon_row"
		| "duplicate_lexicon_term"
		| "invalid_lexicon_definition"
		| "invalid_lexicon_owner";
	readonly path: string;
	readonly message: string;
}

const ROOT_LEXICON_PATH = "lexicon.md";
const DESIGN_PATH = "product/DESIGN.md";
const USER_PATH = /^product\/users\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const STORY_PATH = /^product\/stories\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const COMPONENT_PATH = /^system\/components\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const FLOW_PATH = /^system\/flows\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const REALIZATION_FIELDS = [
	"codewiki_component",
	"codewiki_components",
	"codewiki_source_patterns",
	"codewiki_test_patterns",
	"codewiki_trace_events",
	"codewiki_generated_views",
	"codewiki_role",
	"codewiki_roles",
	"codewiki_test_policy",
	"codewiki_test_rationale",
	"codewiki_source_map",
] as const;

export function validateCodeWikiKbDocument(
	document: OkfDocument,
): CodeWikiKbProfileIssue[] {
	const path = normalizeOkfPath(document.path);
	const frontmatter = document.frontmatter;
	if (!frontmatter) {
		return [
			issue(
				"invalid_document_type",
				path,
				"CodeWiki Knowledge documents require YAML frontmatter with a supported semantic type.",
			),
		];
	}
	const issues: CodeWikiKbProfileIssue[] = [];
	const type = documentType(frontmatter);
	if (!type) {
		return [
			issue(
				"invalid_document_type",
				path,
				"CodeWiki Knowledge documents require a supported semantic type.",
			),
		];
	}
	if (!pathMatchesType(path, type)) {
		issues.push(
			issue(
				"invalid_document_path",
				path,
				`${type} must use its canonical CodeWiki Knowledge path.`,
			),
		);
	}
	if (frontmatter.status !== "draft" && frontmatter.status !== "stable") {
		issues.push(
			issue(
				"missing_status",
				path,
				"CodeWiki Knowledge documents require status: draft or status: stable.",
			),
		);
	}
	const expectedOwner = storyOwnerFromPath(path);
	if (type === "User Story") {
		if (frontmatter.codewiki_user !== `/product/users/${expectedOwner}.md`) {
			issues.push(
				issue(
					"invalid_story_owner",
					path,
					"User Story codewiki_user must name its owning User concept.",
				),
			);
		}
	} else if (frontmatter.codewiki_user !== undefined) {
		issues.push(
			issue(
				"unexpected_story_owner",
				path,
				"Only User Story documents may declare codewiki_user.",
			),
		);
	}
	if (type !== "System Component" && hasRealizationMetadata(frontmatter)) {
		issues.push(
			issue(
				"realization_not_component_owned",
				path,
				"Only System Component documents may declare realization metadata.",
			),
		);
	}
	if (
		type !== "Design System" &&
		(document.frontmatterText?.length ?? 0) > 1_500
	) {
		issues.push(
			issue(
				"frontmatter_too_large",
				path,
				"Knowledge document frontmatter exceeds its 1500 character limit.",
			),
		);
	}
	if (type === "Lexicon") {
		issues.push(...validateLexiconRows(document));
	}
	if (document.body.length > CODEWIKI_KB_BODY_CHARACTER_LIMITS[type]) {
		issues.push(
			issue(
				"document_body_too_large",
				path,
				`${type} body exceeds its ${CODEWIKI_KB_BODY_CHARACTER_LIMITS[type]} character limit.`,
			),
		);
	}
	return issues;
}

function validateLexiconRows(
	document: OkfDocument,
	conceptPaths?: ReadonlySet<string>,
): CodeWikiKbProfileIssue[] {
	const path = normalizeOkfPath(document.path);
	if (path !== ROOT_LEXICON_PATH) return [];
	const issues: CodeWikiKbProfileIssue[] = [];
	const terms = new Set<string>();
	const rows = document.body
		.split(/\r?\n/)
		.filter((line) => line.startsWith("|") && !/^\|\s*-/.test(line))
		.slice(1);
	for (const [index, row] of rows.entries()) {
		const cells = row
			.slice(1, -1)
			.split("|")
			.map((cell) => cell.trim());
		if (cells.length !== 3 || cells.some((cell) => cell.length === 0)) {
			issues.push(issue("invalid_lexicon_row", path, `Lexicon row ${index + 1} requires Term, Definition, and Owner.`));
			continue;
		}
		const [term, definition, owner] = cells as [string, string, string];
		if (terms.has(term)) {
			issues.push(issue("duplicate_lexicon_term", path, `Lexicon term ${term} is duplicated.`));
		}
		terms.add(term);
		if (!/^[^.!?]+[.!?]$/.test(definition)) {
			issues.push(issue("invalid_lexicon_definition", path, `Lexicon term ${term} requires one sentence.`));
		}
		const ownerMatch = /^\[[^\]]+\]\(([^)]+)\)$/.exec(owner);
		const ownerPath = ownerMatch?.[1]
			? `/${normalizeOkfPath(ownerMatch[1])}`
			: undefined;
		if (!ownerPath || (conceptPaths && !conceptPaths.has(ownerPath))) {
			issues.push(issue("invalid_lexicon_owner", path, `Lexicon term ${term} requires one resolvable owning concept.`));
		}
	}
	return issues;
}

function documentType(
	frontmatter: OkfFrontmatterValue,
): CodeWikiKbDocumentType | undefined {
	return CODEWIKI_KB_DOCUMENT_TYPES.includes(
		frontmatter.type as CodeWikiKbDocumentType,
	)
		? (frontmatter.type as CodeWikiKbDocumentType)
		: undefined;
}

function pathMatchesType(path: string, type: CodeWikiKbDocumentType): boolean {
	switch (type) {
		case "Lexicon":
			return path === ROOT_LEXICON_PATH;
		case "Design System":
			return path === DESIGN_PATH;
		case "User":
			return USER_PATH.test(path);
		case "User Story":
			return STORY_PATH.test(path);
		case "System Component":
			return COMPONENT_PATH.test(path);
		case "System Flow":
			return FLOW_PATH.test(path);
		default:
			return false;
	}
}

function storyOwnerFromPath(path: string): string | undefined {
	return STORY_PATH.exec(path)?.[1];
}

function hasRealizationMetadata(frontmatter: OkfFrontmatterValue): boolean {
	return REALIZATION_FIELDS.some((field) => frontmatter[field] !== undefined);
}

function issue(
	code: CodeWikiKbProfileIssue["code"],
	path: string,
	message: string,
): CodeWikiKbProfileIssue {
	return { code, path, message };
}
