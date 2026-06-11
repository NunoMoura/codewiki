import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type {
	AuditFingerprint,
	AuditIssue,
	AuditProfileResult,
	AuditStatus,
} from "../audit/types.ts";
import type { WikiProject } from "../project/types.ts";
import { unique } from "../shared/utils.ts";

interface LexiconAuditInput {
	paths?: string[];
	include_fingerprints?: boolean;
}

interface CanonicalTerm {
	term: string;
	variants: string[];
}

interface RemovedTermRule {
	term: string;
	pattern: RegExp;
	patternSource: string;
	canonical: string;
	allowedTokenPatterns: RegExp[];
	allowedSourceLiterals: Set<string>;
	allowedDocPaths: Set<string>;
	allowedDocPathPatterns: RegExp[];
	deletionTrigger: string;
}

interface LexiconRules {
	canonicalTerms: CanonicalTerm[];
	removedRules: RemovedTermRule[];
	issues: AuditIssue[];
}

interface ScanSegment {
	path: string;
	line: number;
	text: string;
}

const PROFILE = "lexicon" as const;
const LEXICON_PATH = ".codewiki/kb/lexicon.md";
const TEMPORARY_COMPATIBILITY_HEADING = "temporary compatibility term";
const NON_CANONICAL_LEXICON_HEADINGS = new Set(["related docs"]);

function normalizeRel(path: string): string {
	return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function statusForIssues(issues: AuditIssue[]): AuditStatus {
	if (issues.some((issue) => issue.severity === "error")) return "fail";
	if (issues.some((issue) => issue.severity === "warning")) return "warning";
	return "pass";
}

function createIssue(
	severity: AuditIssue["severity"],
	kind: string,
	message: string,
	path?: string,
	rationale?: string,
): AuditIssue {
	return {
		profile: PROFILE,
		severity,
		kind,
		message,
		path,
		rationale,
	};
}

async function maybeReadText(path: string): Promise<string | null> {
	try {
		return await readFile(path, "utf8");
	} catch {
		return null;
	}
}

async function pathStat(path: string) {
	try {
		return await stat(path);
	} catch {
		return null;
	}
}

async function walkFiles(
	root: string,
	include: (path: string) => boolean,
): Promise<string[]> {
	const rootStat = await pathStat(root);
	if (!rootStat) return [];
	if (!rootStat.isDirectory()) return include(root) ? [root] : [];
	const entries = await readdir(root, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
		const entryPath = resolve(root, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walkFiles(entryPath, include)));
		} else if (include(entryPath)) {
			files.push(entryPath);
		}
	}
	return files;
}

function isMarkdown(path: string): boolean {
	return /\.(?:md|mdx)$/i.test(path);
}

function isSource(path: string): boolean {
	return /\.(?:ts|tsx|js|mjs|cjs)$/i.test(path);
}

function isJson(path: string): boolean {
	return /\.json$/i.test(path);
}

function isViewFile(path: string): boolean {
	return /\.(?:md|mdx|json)$/i.test(path);
}

function canonicalHeadings(text: string): string[] {
	return [...text.matchAll(/^##\s+(.+?)\s*$/gm)]
		.map((match) => match[1]!.trim())
		.filter((term) => !NON_CANONICAL_LEXICON_HEADINGS.has(term.toLowerCase()));
}

function parseCanonicalTerms(text: string): CanonicalTerm[] {
	return canonicalHeadings(text).map((term) => {
		const variants = term
			.split("/")
			.map((variant) => variant.trim())
			.filter(Boolean);
		return { term, variants: variants.length ? variants : [term] };
	});
}

function compatibilitySection(text: string): string | null {
	const heading = new RegExp(
		`^##\\s+${escapeRegExp(TEMPORARY_COMPATIBILITY_HEADING)}\\s*$`,
		"im",
	).exec(text);
	if (!heading || heading.index === undefined) return null;
	const start = heading.index + heading[0].length;
	const nextHeading = /^##\s+/gm;
	nextHeading.lastIndex = start;
	const next = nextHeading.exec(text);
	return text.slice(start, next?.index ?? text.length);
}

function fieldValue(block: string, label: string): string | null {
	const pattern = new RegExp(`^-\\s+${escapeRegExp(label)}:\\s*(.+)$`, "im");
	return pattern.exec(block)?.[1]?.trim() ?? null;
}

function codeSpans(value: string | null): string[] {
	if (!value) return [];
	return [...value.matchAll(/`([^`]+)`/g)].map((match) => match[1]!.trim());
}

function wildcardPattern(token: string): RegExp {
	const escaped = escapeRegExp(token)
		.replace(/\\\*\\\*/g, ".*")
		.replace(/\\\*/g, "[A-Za-z0-9_-]*");
	return new RegExp(escaped, "g");
}

function pathPattern(token: string): RegExp {
	const escaped = escapeRegExp(normalizeRel(token))
		.replace(/\\\*\\\*/g, ".*")
		.replace(/\\\*/g, "[^/]*");
	return new RegExp(`^${escaped}$`);
}

function parseTemporaryCompatibilityTerms(text: string): {
	rules: RemovedTermRule[];
	issues: AuditIssue[];
} {
	const section = compatibilitySection(text);
	if (!section) {
		return {
			rules: [],
			issues: [
				createIssue(
					"error",
					"temporary-compatibility-section-missing",
					"Lexicon linter requires a Temporary compatibility term section with replacement, allowed-context, and deletion-trigger metadata.",
					LEXICON_PATH,
				),
			],
		};
	}
	const rules: RemovedTermRule[] = [];
	const issues: AuditIssue[] = [];
	const headings = [...section.matchAll(/^###\s+(.+?)\s*$/gm)];
	for (let index = 0; index < headings.length; index++) {
		const blockMatch = headings[index]!;
		const term = blockMatch[1]!.trim();
		const start = (blockMatch.index ?? 0) + blockMatch[0].length;
		const end = headings[index + 1]?.index ?? section.length;
		const block = section.slice(start, end);
		const canonical = fieldValue(block, "Canonical replacement");
		const patternSource = codeSpans(
			fieldValue(block, "Removed expression pattern"),
		)[0];
		const allowedTokens = codeSpans(
			fieldValue(block, "Allowed compatibility tokens"),
		);
		const allowedSourceLiterals = new Set(
			codeSpans(fieldValue(block, "Allowed source literals")),
		);
		const allowedDocTokens = codeSpans(
			fieldValue(block, "Allowed migration docs"),
		).map(normalizeRel);
		const allowedDocPaths = new Set(
			allowedDocTokens.filter((token) => !token.includes("*")),
		);
		const allowedDocPathPatterns = allowedDocTokens
			.filter((token) => token.includes("*"))
			.map(pathPattern);
		const deletionTrigger = fieldValue(block, "Deletion trigger");
		if (!canonical || !patternSource || !deletionTrigger) {
			issues.push(
				createIssue(
					"error",
					"temporary-compatibility-metadata-missing",
					`Temporary compatibility term "${term}" must define canonical replacement, removed expression pattern, and deletion trigger.`,
					LEXICON_PATH,
				),
			);
			continue;
		}
		if (
			allowedTokens.length === 0 &&
			allowedSourceLiterals.size === 0 &&
			allowedDocTokens.length === 0
		) {
			issues.push(
				createIssue(
					"error",
					"temporary-compatibility-context-missing",
					`Temporary compatibility term "${term}" must define narrow allowed tokens or migration docs.`,
					LEXICON_PATH,
				),
			);
			continue;
		}
		let pattern: RegExp;
		try {
			pattern = new RegExp(patternSource, "gi");
		} catch (error) {
			issues.push(
				createIssue(
					"error",
					"temporary-compatibility-pattern-invalid",
					`Temporary compatibility term "${term}" has an invalid removed expression pattern: ${String(error)}`,
					LEXICON_PATH,
				),
			);
			continue;
		}
		rules.push({
			term,
			pattern,
			patternSource,
			canonical,
			allowedTokenPatterns: allowedTokens.map(wildcardPattern),
			allowedSourceLiterals,
			allowedDocPaths,
			allowedDocPathPatterns,
			deletionTrigger,
		});
	}
	if (
		rules.length === 0 &&
		issues.length === 0 &&
		!/no temporary compatibility terms/i.test(section)
	) {
		issues.push(
			createIssue(
				"error",
				"temporary-compatibility-terms-missing",
				"Lexicon linter requires temporary compatibility term entries or an explicit no-temporary-compatibility-terms statement.",
				LEXICON_PATH,
			),
		);
	}
	return { rules, issues };
}

function cleanFieldValue(value: string): string {
	return value.trim().replace(/[.;]+$/g, "");
}

function parseLexiconRules(text: string): LexiconRules {
	const canonicalTerms = parseCanonicalTerms(text);
	const compatibility = parseTemporaryCompatibilityTerms(text);
	return {
		canonicalTerms,
		removedRules: compatibility.rules,
		issues: compatibility.issues,
	};
}

function isImportOnlySourceLine(line: string): boolean {
	return /^\s*(?:import\b|export\b[^;]*\bfrom\b)/.test(line);
}

function sourceStringSegments(rel: string, text: string): ScanSegment[] {
	const segments: ScanSegment[] = [];
	const lines = text.split(/\r?\n/);
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]!;
		if (isImportOnlySourceLine(line)) continue;
		const pattern = /(["'`])((?:\\.|(?!\1).)*)\1/g;
		for (const match of line.matchAll(pattern)) {
			const value = match[2] ?? "";
			if (!value.trim()) continue;
			segments.push({ path: rel, line: index + 1, text: value });
		}
	}
	return segments;
}

function jsonValueSegments(rel: string, text: string): ScanSegment[] {
	const segments: ScanSegment[] = [];
	const lines = text.split(/\r?\n/);
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]!;
		const pattern = /"((?:\\.|[^"\\])*)"/g;
		for (const match of line.matchAll(pattern)) {
			const start = match.index ?? 0;
			const after = line.slice(start + match[0].length);
			if (/^\s*:/.test(after)) continue;
			const value = match[1] ?? "";
			if (!value.trim()) continue;
			segments.push({ path: rel, line: index + 1, text: value });
		}
	}
	return segments;
}

function textSegments(rel: string, text: string): ScanSegment[] {
	return text
		.split(/\r?\n/)
		.map((line, index) => ({ path: rel, line: index + 1, text: line }))
		.filter((segment) => segment.text.trim().length > 0);
}

function scanSegments(rel: string, text: string): ScanSegment[] {
	if (isSource(rel)) return sourceStringSegments(rel, text);
	if (isJson(rel)) return jsonValueSegments(rel, text);
	return textSegments(rel, text);
}

function isCompatibleToken(
	rule: RemovedTermRule,
	text: string,
	matchIndex: number,
): boolean {
	for (const pattern of rule.allowedTokenPatterns) {
		pattern.lastIndex = 0;
		for (const match of text.matchAll(pattern)) {
			const start = match.index ?? 0;
			const end = start + match[0].length;
			if (matchIndex >= start && matchIndex < end) return true;
		}
	}
	return false;
}

function isAllowedRemovedTerm(
	rule: RemovedTermRule,
	segment: ScanSegment,
	matchIndex: number,
): boolean {
	if (isCompatibleToken(rule, segment.text, matchIndex)) return true;
	if (
		isSource(segment.path) &&
		rule.allowedSourceLiterals.has(segment.text.trim())
	) {
		return true;
	}
	if (rule.allowedDocPaths.has(segment.path)) return true;
	if (
		rule.allowedDocPathPatterns.some((pattern) => pattern.test(segment.path))
	) {
		return true;
	}
	return false;
}

function lineRef(segment: ScanSegment): string {
	return `${segment.path}:${segment.line}`;
}

function canonicalVariantPattern(variant: string): RegExp {
	const parts = variant
		.trim()
		.split(/[\s-]+/)
		.filter(Boolean)
		.map(escapeRegExp);
	if (parts.length === 0) return /$a/;
	const last = parts[parts.length - 1]!;
	if (/^[a-z]+$/i.test(last) && !last.endsWith("s")) {
		parts[parts.length - 1] = `${last}s?`;
	}
	return new RegExp(`\\b${parts.join("[\\s-]+")}\\b`, "i");
}

function canonicalTermUsed(
	term: CanonicalTerm,
	segments: ScanSegment[],
): boolean {
	const patterns = term.variants.map(canonicalVariantPattern);
	return segments.some((segment) =>
		patterns.some((pattern) => pattern.test(segment.text)),
	);
}

function canonicalTermContainsRemovedTerm(
	term: CanonicalTerm,
	rules: RemovedTermRule[],
): RemovedTermRule | null {
	for (const variant of term.variants) {
		for (const rule of rules) {
			rule.pattern.lastIndex = 0;
			if (rule.pattern.test(variant)) return rule;
		}
	}
	return null;
}

async function fingerprintFile(
	project: WikiProject,
	rel: string,
	include: boolean,
): Promise<AuditFingerprint | null> {
	if (!include) return null;
	const abs = resolve(project.root, rel);
	try {
		const bytes = await readFile(abs);
		return {
			path: rel,
			digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
			bytes: bytes.length,
		};
	} catch {
		return null;
	}
}

async function collectDefaultTargets(project: WikiProject): Promise<string[]> {
	const targets = [
		"README.md",
		"src/adapters/pi/index.ts",
		"src/adapters/pi/schemas.ts",
	];
	const dirs: Array<{ path: string; include: (path: string) => boolean }> = [
		{ path: "skills", include: isMarkdown },
		{ path: project.docsRoot, include: isMarkdown },
		{ path: "src/adapters/pi/commands", include: isSource },
		{ path: "src/adapters/pi/tools", include: isSource },
		{ path: "src/adapters/pi/ui", include: isSource },
		{ path: ".codewiki/views", include: isViewFile },
	];
	for (const item of dirs) {
		const abs = resolve(project.root, item.path);
		const files = await walkFiles(abs, item.include);
		targets.push(
			...files.map((file) => normalizeRel(relative(project.root, file))),
		);
	}
	return unique(targets)
		.filter((rel) => rel !== LEXICON_PATH)
		.sort();
}

async function collectInputTargets(
	project: WikiProject,
	paths: string[],
): Promise<string[]> {
	const targets: string[] = [];
	for (const path of paths) {
		const relPath = normalizeRel(path);
		const abs = resolve(project.root, relPath);
		const files = await walkFiles(abs, (candidate) => {
			const rel = normalizeRel(relative(project.root, candidate));
			return isMarkdown(rel) || isSource(rel) || isJson(rel);
		});
		targets.push(
			...files.map((file) => normalizeRel(relative(project.root, file))),
		);
	}
	return unique(targets)
		.filter((rel) => rel !== LEXICON_PATH)
		.sort();
}

export async function auditLexicon(
	project: WikiProject,
	input: LexiconAuditInput,
): Promise<AuditProfileResult> {
	const issues: AuditIssue[] = [];
	const lexiconText = await maybeReadText(resolve(project.root, LEXICON_PATH));
	let rules: LexiconRules = {
		canonicalTerms: [],
		removedRules: [],
		issues: [],
	};
	if (!lexiconText) {
		issues.push(
			createIssue(
				"error",
				"lexicon-missing",
				"Lexicon linter requires .codewiki/kb/lexicon.md as the active vocabulary source.",
				LEXICON_PATH,
			),
		);
	} else {
		rules = parseLexiconRules(lexiconText);
		issues.push(...rules.issues);
	}
	const { canonicalTerms, removedRules } = rules;
	if (lexiconText && canonicalTerms.length === 0) {
		issues.push(
			createIssue(
				"error",
				"lexicon-empty",
				"Lexicon linter found no active canonical terms in .codewiki/kb/lexicon.md.",
				LEXICON_PATH,
			),
		);
	}

	for (const term of canonicalTerms) {
		if (term.term.toLowerCase() === TEMPORARY_COMPATIBILITY_HEADING) continue;
		const removed = canonicalTermContainsRemovedTerm(term, removedRules);
		if (!removed) continue;
		issues.push(
			createIssue(
				"error",
				"removed-term-in-lexicon",
				`Canonical lexicon term "${term.term}" uses temporary compatibility vocabulary; prefer ${removed.canonical}.`,
				LEXICON_PATH,
			),
		);
	}

	const pathInputs = input.paths?.map(normalizeRel) ?? [];
	const targets = pathInputs.length
		? await collectInputTargets(project, pathInputs)
		: await collectDefaultTargets(project);
	const segments: ScanSegment[] = [];
	for (const rel of targets) {
		const text = await maybeReadText(resolve(project.root, rel));
		if (!text) continue;
		for (const segment of scanSegments(rel, text)) {
			segments.push(segment);
		}
	}

	const seenRemovedIssues = new Set<string>();
	for (const segment of segments) {
		for (const rule of removedRules) {
			rule.pattern.lastIndex = 0;
			for (const match of segment.text.matchAll(rule.pattern)) {
				const matchIndex = match.index ?? 0;
				if (isAllowedRemovedTerm(rule, segment, matchIndex)) continue;
				const key = `${rule.term}:${lineRef(segment)}`;
				if (seenRemovedIssues.has(key)) continue;
				seenRemovedIssues.add(key);
				issues.push(
					createIssue(
						"error",
						"temporary-compatibility-term-used-as-canonical",
						`Lexicon linter rejected temporary compatibility term "${match[0]}"; use ${cleanFieldValue(rule.canonical)} unless the usage is listed in .codewiki/kb/lexicon.md with a deletion trigger.`,
						lineRef(segment),
						"Temporary compatibility is limited to source fields, file paths, command names, profile names, and migration docs named in the lexicon.",
					),
				);
			}
		}
	}

	const checkUnusedTerms =
		pathInputs.length === 0 || pathInputs.some((path) => path === LEXICON_PATH);
	let usageSegments = segments;
	if (checkUnusedTerms && pathInputs.length > 0) {
		const usageTargets = (await collectDefaultTargets(project)).filter(
			(rel) => !targets.includes(rel),
		);
		const extraUsageSegments: ScanSegment[] = [];
		for (const rel of usageTargets) {
			const text = await maybeReadText(resolve(project.root, rel));
			if (!text) continue;
			for (const segment of scanSegments(rel, text)) {
				extraUsageSegments.push(segment);
			}
		}
		usageSegments = [...segments, ...extraUsageSegments];
	}
	if (checkUnusedTerms) {
		for (const term of canonicalTerms) {
			if (term.term.toLowerCase() === TEMPORARY_COMPATIBILITY_HEADING) continue;
			if (canonicalTermUsed(term, usageSegments)) continue;
			issues.push(
				createIssue(
					"error",
					"unused-canonical-term",
					`Canonical lexicon term "${term.term}" has no usage in active scanned surfaces; remove it or add a narrow source-owned use.`,
					LEXICON_PATH,
				),
			);
		}
	}

	const fingerprintTargets = unique([LEXICON_PATH, ...targets]).sort();
	const fingerprints = (
		await Promise.all(
			fingerprintTargets.map((rel) =>
				fingerprintFile(project, rel, input.include_fingerprints !== false),
			),
		)
	).filter((item): item is AuditFingerprint => Boolean(item));

	return {
		profile: PROFILE,
		status: statusForIssues(issues),
		summary: `Checked ${canonicalTerms.length} canonical lexicon terms and ${removedRules.length} temporary compatibility terms across ${targets.length} surfaces.`,
		checked_scopes: { root: project.root, files: fingerprintTargets },
		issues,
		evidence_refs: [LEXICON_PATH, ...targets],
		fingerprints,
		details: {
			canonical_terms: canonicalTerms.map((term) => term.term),
			temporary_compatibility_terms: removedRules.map((rule) => ({
				term: rule.term,
				canonical: rule.canonical,
				pattern: rule.patternSource,
				deletion_trigger: rule.deletionTrigger,
			})),
			target_count: targets.length,
		},
	};
}
