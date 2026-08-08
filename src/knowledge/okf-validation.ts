import {
	extractOkfMarkdownLinks,
	isOkfMarkdownPath,
	isOkfRootIndexPath,
	isOkfReservedPath,
	normalizeOkfPath,
	OKF_SUPPORTED_VERSIONS,
	OKF_VERSION,
	type OkfSupportedVersion,
} from "./okf.ts";
import {
	parseOkfDocument,
	tryParseOkfDocument,
	type OkfDocument,
	type OkfFrontmatterValue,
} from "./okf-frontmatter.ts";

export interface OkfBundleFile {
	path: string;
	content: string;
}

export type OkfValidationIssueCode =
	| "missing_frontmatter"
	| "invalid_frontmatter"
	| "missing_type"
	| "invalid_type"
	| "invalid_recommended_field"
	| "invalid_tags"
	| "invalid_timestamp"
	| "reserved_frontmatter_not_allowed"
	| "invalid_root_index_frontmatter"
	| "invalid_index_structure"
	| "invalid_log_date_heading";

export interface OkfValidationIssue {
	code: OkfValidationIssueCode;
	path: string;
	message: string;
	field?: string;
}

export interface OkfBundleValidationResult {
	version: OkfSupportedVersion;
	conceptCount: number;
	reservedCount: number;
	issues: OkfValidationIssue[];
	documents: OkfDocument[];
}

export function validateOkfBundle(
	files: OkfBundleFile[],
): OkfBundleValidationResult {
	const documents: OkfDocument[] = [];
	const issues: OkfValidationIssue[] = [];
	for (const file of files.filter((candidate) =>
		isOkfMarkdownPath(candidate.path),
	)) {
		const path = normalizeOkfPath(file.path);
		const parsed = tryParseOkfDocument(path, file.content);
		if ("message" in parsed) {
			issues.push(issue("invalid_frontmatter", path, parsed.message));
			continue;
		}
		documents.push(parsed);
		issues.push(...validateOkfDocument(parsed));
	}
	return {
		version: declaredOkfVersion(documents),
		conceptCount: documents.filter((document) => document.kind === "concept")
			.length,
		reservedCount: documents.filter((document) => document.kind !== "concept")
			.length,
		issues,
		documents,
	};
}

function declaredOkfVersion(documents: readonly OkfDocument[]): OkfSupportedVersion {
	const declared = documents.find(
		(document) =>
			(document.kind === "index" && isOkfRootIndexPath(document.path)) ||
			(document.kind === "concept" && document.path === "lexicon.md"),
	)?.frontmatter?.okf_version;
	return OKF_SUPPORTED_VERSIONS.includes(declared as OkfSupportedVersion)
		? (declared as OkfSupportedVersion)
		: OKF_VERSION;
}

export function validateOkfDocument(
	document: OkfDocument,
): OkfValidationIssue[] {
	if (document.kind === "concept") return validateConceptDocument(document);
	if (document.kind === "index") return validateIndexDocument(document);
	return validateLogDocument(document);
}

export function okfConceptDocuments(files: OkfBundleFile[]): OkfDocument[] {
	return files.flatMap((file) =>
		isOkfMarkdownPath(file.path) && !isOkfReservedPath(file.path)
			? [parseOkfDocument(file.path, file.content)]
			: [],
	);
}

function validateConceptDocument(document: OkfDocument): OkfValidationIssue[] {
	if (!document.frontmatter) {
		return [
			issue(
				"missing_frontmatter",
				document.path,
				`${document.path} must start with OKF YAML frontmatter.`,
			),
		];
	}
	return [
		...requiredTypeIssues(document.path, document.frontmatter),
		...recommendedFieldIssues(document.path, document.frontmatter),
	];
}

function requiredTypeIssues(
	path: string,
	frontmatter: OkfFrontmatterValue,
): OkfValidationIssue[] {
	const value = frontmatter.type;
	if (typeof value !== "string") {
		return [
			issue("invalid_type", path, `${path} OKF type must be a string.`, "type"),
		];
	}
	if (!value.trim()) {
		return [
			issue(
				"missing_type",
				path,
				`${path} OKF type must be non-empty.`,
				"type",
			),
		];
	}
	return [];
}

function recommendedFieldIssues(
	path: string,
	frontmatter: OkfFrontmatterValue,
): OkfValidationIssue[] {
	return [
		...stringFieldIssues(path, frontmatter, [
			"title",
			"description",
			"resource",
		]),
		...tagIssues(path, frontmatter),
		...timestampIssues(path, frontmatter),
	];
}

function stringFieldIssues(
	path: string,
	frontmatter: OkfFrontmatterValue,
	fields: string[],
): OkfValidationIssue[] {
	return fields.flatMap((field) => {
		if (
			frontmatter[field] === undefined ||
			typeof frontmatter[field] === "string"
		) {
			return [];
		}
		return [
			issue(
				"invalid_recommended_field",
				path,
				`${path} OKF ${field} must be a string when present.`,
				field,
			),
		];
	});
}

function tagIssues(
	path: string,
	frontmatter: OkfFrontmatterValue,
): OkfValidationIssue[] {
	const tags = frontmatter.tags;
	if (tags === undefined) return [];
	if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string")) {
		return [
			issue(
				"invalid_tags",
				path,
				`${path} OKF tags must be a string list.`,
				"tags",
			),
		];
	}
	return [];
}

function timestampIssues(
	path: string,
	frontmatter: OkfFrontmatterValue,
): OkfValidationIssue[] {
	const timestamp = frontmatter.timestamp;
	if (timestamp === undefined) return [];
	if (typeof timestamp !== "string" || !isIsoTimestamp(timestamp)) {
		return [
			issue(
				"invalid_timestamp",
				path,
				`${path} OKF timestamp must be an ISO 8601 datetime string when present.`,
				"timestamp",
			),
		];
	}
	return [];
}

function validateIndexDocument(document: OkfDocument): OkfValidationIssue[] {
	const issues: OkfValidationIssue[] = [];
	if (document.frontmatter) {
		if (!isOkfRootIndexPath(document.path)) {
			issues.push(
				issue(
					"reserved_frontmatter_not_allowed",
					document.path,
					`${document.path} is an OKF index file and must not use frontmatter.`,
				),
			);
		} else {
			issues.push(
				...rootIndexFrontmatterIssues(document.path, document.frontmatter),
			);
		}
	}
	if (document.body.trim() && !/^#\s+\S/m.test(document.body)) {
		issues.push(
			issue(
				"invalid_index_structure",
				document.path,
				`${document.path} index body should group entries under markdown headings.`,
			),
		);
	}
	return issues;
}

function rootIndexFrontmatterIssues(
	path: string,
	frontmatter: OkfFrontmatterValue,
): OkfValidationIssue[] {
	const keys = Object.keys(frontmatter);
	const unknownKeys = keys.filter((key) => key !== "okf_version");
	if (unknownKeys.length > 0) {
		return [
			issue(
				"invalid_root_index_frontmatter",
				path,
				`${path} root index frontmatter may only declare okf_version.`,
				unknownKeys[0],
			),
		];
	}
	if (
		frontmatter.okf_version !== undefined &&
		!OKF_SUPPORTED_VERSIONS.includes(
			frontmatter.okf_version as (typeof OKF_SUPPORTED_VERSIONS)[number],
		)
	) {
		return [
			issue(
				"invalid_root_index_frontmatter",
				path,
				`${path} declares unsupported OKF version ${String(frontmatter.okf_version)}.`,
				"okf_version",
			),
		];
	}
	return [];
}

function validateLogDocument(document: OkfDocument): OkfValidationIssue[] {
	if (document.frontmatter) {
		return [
			issue(
				"reserved_frontmatter_not_allowed",
				document.path,
				`${document.path} is an OKF log file and must not use frontmatter.`,
			),
		];
	}
	return document.body
		.split("\n")
		.filter((line) => line.startsWith("## "))
		.flatMap((line) => {
			const date = line.slice(3).trim();
			return /^\d{4}-\d{2}-\d{2}$/.test(date)
				? []
				: [
						issue(
							"invalid_log_date_heading",
							document.path,
							`${document.path} log date heading ${date} must use YYYY-MM-DD form.`,
						),
					];
		});
}

export function okfMarkdownLinksForBundle(files: OkfBundleFile[]) {
	return validateOkfBundle(files).documents.flatMap((document) =>
		extractOkfMarkdownLinks(document.body).map((link) => ({
			path: document.path,
			...link,
		})),
	);
}

function isIsoTimestamp(value: string): boolean {
	return (
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) &&
		!Number.isNaN(Date.parse(value))
	);
}

function issue(
	code: OkfValidationIssueCode,
	path: string,
	message: string,
	field?: string,
): OkfValidationIssue {
	return { code, path, message, ...(field ? { field } : {}) };
}
