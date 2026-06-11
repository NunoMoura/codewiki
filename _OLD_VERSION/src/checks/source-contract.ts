import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type {
	AuditFingerprint,
	AuditIssue,
	AuditProfileResult,
} from "../audit/types.ts";
import type { WikiProject } from "../project/types.ts";
import { pathExists } from "../project/local/filesystem.ts";
import { unique } from "../shared/utils.ts";
import {
	generateSourceContractSnapshot,
	type SourceContractSnapshot,
} from "./source-contract-snapshot.ts";

interface SourceContractAuditInput {
	paths?: string[];
	layers?: string[];
	include_fingerprints?: boolean;
}

interface ExpectedContract {
	tools: string[];
	commands: string[];
	knip_entry: string[];
	sources: string[];
}

const PROFILE = "source-contract";
const TOOL_TOKEN_RE = /`((?:codewiki|wiki)_[a-z0-9_]+)`/g;
const COMMAND_TOKEN_RE = /`\/(audit|wiki(?:-[a-z0-9-]+)?)(?:\s|`|\[|$)/g;
const PATH_TOKEN_RE =
	/`((?:src\/[^`]+\.ts|scripts\/[^`]+\.mjs|tests\/[^`]+\.mjs))`/g;
const STALE_TOOL_PREFIX = ["codewiki", ""].join("_");
const CODEWIKI_PREFIX_RE = new RegExp(`^${STALE_TOOL_PREFIX}(.+)$`);
const WIKI_PREFIX_RE = /^wiki_(.+)$/;

function normalizeRel(path: string): string {
	return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function section(text: string, heading: string, nextHeading: string): string {
	const start = text.indexOf(heading);
	if (start < 0) return "";
	const afterStart = start + heading.length;
	const end = text.indexOf(nextHeading, afterStart);
	return text.slice(afterStart, end >= 0 ? end : undefined);
}

function normalToolSection(text: string): string {
	const normal = section(
		text,
		"#### Normal workflow tools",
		"#### Compatibility",
	);
	return normal.trim() ? normal : text;
}

function collectMatches(text: string, pattern: RegExp): string[] {
	const out: string[] = [];
	for (const match of text.matchAll(pattern)) {
		const value = String(match[1] || "").trim();
		if (value) out.push(value.startsWith("/") ? value.slice(1) : value);
	}
	return unique(out).sort();
}

async function readOptional(path: string): Promise<string> {
	try {
		return await readFile(path, "utf8");
	} catch {
		return "";
	}
}

async function readExpectedContract(
	project: WikiProject,
): Promise<ExpectedContract> {
	const readme = await readOptional(resolve(project.root, "README.md"));
	const apiDoc = await readOptional(
		resolve(project.root, ".codewiki", "kb", "system", "api.md"),
	);
	const commandSection = section(
		readme,
		"### Commands",
		"### Internal agent tools",
	);
	const toolSection = section(
		readme,
		"### Internal agent tools",
		"### Static analysis entrypoints",
	);
	const staticSection = section(
		readme,
		"### Static analysis entrypoints",
		"### Skills",
	);
	const apiToolSection = section(
		apiDoc,
		"## Normal workflow tools",
		"## Compatibility",
	);
	return {
		tools: collectMatches(
			`${normalToolSection(toolSection)}\n${apiToolSection || apiDoc}`,
			TOOL_TOKEN_RE,
		),
		commands: collectMatches(commandSection, COMMAND_TOKEN_RE),
		knip_entry: collectMatches(staticSection, PATH_TOKEN_RE),
		sources: ["README.md", ".codewiki/kb/system/api.md"],
	};
}

function createIssue(
	severity: AuditIssue["severity"],
	kind: string,
	message: string,
	path?: string,
	refs?: string[],
): AuditIssue {
	return {
		profile: PROFILE as AuditIssue["profile"],
		severity,
		kind,
		message,
		...(path ? { path } : {}),
		...(refs?.length ? { refs } : {}),
	};
}

function statusForIssues(issues: AuditIssue[]) {
	if (issues.some((issue) => issue.severity === "error")) return "fail";
	if (issues.some((issue) => issue.severity === "warning")) return "warning";
	return "pass";
}

function compareLists(input: {
	label: string;
	kindPrefix: string;
	expected: string[];
	actual: string[];
	path: string;
	issues: AuditIssue[];
	extraSeverity?: AuditIssue["severity"];
}): void {
	const actual = new Set(input.actual);
	const expected = new Set(input.expected);
	for (const item of input.expected) {
		if (!actual.has(item)) {
			input.issues.push(
				createIssue(
					"error",
					`${input.kindPrefix}-missing`,
					`Documented ${input.label} '${item}' is not present in the source contract.`,
					input.path,
					[item],
				),
			);
		}
	}
	for (const item of input.actual) {
		if (!expected.has(item)) {
			input.issues.push(
				createIssue(
					input.extraSeverity || "warning",
					`${input.kindPrefix}-undocumented`,
					`Source ${input.label} '${item}' is not documented in the expected contract.`,
					input.path,
					[item],
				),
			);
		}
	}
}

function normalToolNames(snapshot: SourceContractSnapshot): string[] {
	return snapshot.tools
		.filter((tool) => snapshot.tool_surfaces[tool]?.surface !== "compatibility")
		.sort();
}

function compatibilityToolIssues(
	snapshot: SourceContractSnapshot,
	expectedTools: string[],
	issues: AuditIssue[],
): void {
	const expected = new Set(expectedTools);
	for (const tool of snapshot.tools) {
		const metadata = snapshot.tool_surfaces[tool];
		if (expected.has(tool)) {
			if (metadata?.surface === "compatibility") {
				issues.push(
					createIssue(
						"error",
						"tool-surface-mismatch",
						`Documented normal tool '${tool}' is marked as compatibility-only in source metadata.`,
						"src/adapters/pi/tools/surface.ts",
						[tool],
					),
				);
			}
			continue;
		}
		if (!tool.startsWith("wiki_")) continue;
		if (metadata?.surface !== "compatibility") {
			issues.push(
				createIssue(
					"error",
					"tool-compatibility-metadata-missing",
					`Non-normal tool '${tool}' must be marked as a compatibility tool in source metadata.`,
					"src/adapters/pi/tools/surface.ts",
					[tool],
				),
			);
			continue;
		}
		if (metadata.deprecated !== true || !metadata.compatibility_alias_for) {
			issues.push(
				createIssue(
					"error",
					"tool-deprecation-metadata-missing",
					`Compatibility tool '${tool}' must declare deprecated=true and compatibility_alias_for metadata.`,
					"src/adapters/pi/tools/surface.ts",
					[tool],
				),
			);
		}
	}
}

function staleToolNamespaceIssues(
	expectedTools: string[],
	actualTools: string[],
	issues: AuditIssue[],
): void {
	const actual = new Set(actualTools);
	for (const expected of expectedTools) {
		const suffix = expected.match(WIKI_PREFIX_RE)?.[1];
		if (!suffix) continue;
		const stale = `${STALE_TOOL_PREFIX}${suffix}`;
		if (actual.has(stale)) {
			issues.push(
				createIssue(
					"error",
					"tool-namespace-stale",
					`Expected wiki_* tool '${expected}' but stale internal tool '${stale}' is still registered.`,
					"src/adapters/pi",
					[expected, stale],
				),
			);
		}
	}
	for (const actualName of actualTools) {
		const suffix = actualName.match(CODEWIKI_PREFIX_RE)?.[1];
		if (!suffix) continue;
		const expected = `wiki_${suffix}`;
		if (expectedTools.includes(expected)) continue;
	}
}

function globToRegExp(pattern: string): RegExp {
	let source = "";
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i];
		if (char === "*" && pattern[i + 1] === "*") {
			source += ".*";
			i += 1;
			continue;
		}
		if (char === "*") {
			source += "[^/]*";
			continue;
		}
		source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
	}
	return new RegExp(`^${source}$`);
}

function entryPatternCovers(pattern: string, item: string): boolean {
	return pattern === item || globToRegExp(pattern).test(item);
}

function packageEntryIssues(
	snapshot: SourceContractSnapshot,
	expected: ExpectedContract,
	issues: AuditIssue[],
): void {
	for (const entry of expected.knip_entry) {
		if (
			snapshot.package.knip_entry.some((actual) =>
				entryPatternCovers(actual, entry),
			)
		)
			continue;
		issues.push(
			createIssue(
				"error",
				"package-entry-missing",
				`Documented package entry '${entry}' is not covered by package.json knip.entry.`,
				"package.json",
				[entry],
			),
		);
	}
	for (const entry of snapshot.package.knip_entry) {
		if (
			expected.knip_entry.some(
				(documented) =>
					entryPatternCovers(entry, documented) ||
					entryPatternCovers(documented, entry),
			)
		)
			continue;
		issues.push(
			createIssue(
				"warning",
				"package-entry-undocumented",
				`Package entry '${entry}' is not documented in the expected source contract.`,
				"package.json",
				[entry],
			),
		);
	}
	if (!snapshot.package.pi_extensions.includes("./src/index.ts")) {
		issues.push(
			createIssue(
				"error",
				"package-pi-extension-missing",
				"package.json must expose ./src/index.ts as the Pi extension entry surface.",
				"package.json",
				["./src/index.ts"],
			),
		);
	}
	if (!snapshot.package.files.includes("src")) {
		issues.push(
			createIssue(
				"error",
				"package-source-files-missing",
				"package.json files must include src so source contract entry surfaces are packaged.",
				"package.json",
				["src"],
			),
		);
	}
}

function apiFacadeIssues(
	snapshot: SourceContractSnapshot,
	issues: AuditIssue[],
): void {
	for (const required of ["* from ./tools.ts", "WikiProject"]) {
		if (!snapshot.api_exports.includes(required)) {
			issues.push(
				createIssue(
					"error",
					"api-facade-export-missing",
					`Public API facade is missing expected export '${required}'.`,
					"src/api/index.ts",
					[required],
				),
			);
		}
	}
}

function loopRootContractIssues(
	snapshot: SourceContractSnapshot,
	issues: AuditIssue[],
): void {
	const sourceRoots = new Set(snapshot.source_roots);
	const expectedLoopRoots = [...snapshot.loop_roots].sort();
	if (
		expectedLoopRoots.length !== 3 ||
		JSON.stringify(expectedLoopRoots) !==
			JSON.stringify(["src/decision", "src/implementation", "src/planning"])
	) {
		issues.push(
			createIssue(
				"error",
				"loop-root-contract-invalid",
				"Loop gate ownership contract must expose exactly decision, planning, and implementation source roots.",
				"src/gateway/loop-contracts.ts",
				expectedLoopRoots,
			),
		);
	}
	for (const forbidden of snapshot.forbidden_loop_roots) {
		if (!sourceRoots.has(forbidden)) continue;
		issues.push(
			createIssue(
				"error",
				"forbidden-loop-root-present",
				`${forbidden} would create a fourth workflow loop/root; publication and validation remain under implementation-owned gateway compatibility.`,
				forbidden,
				[forbidden],
			),
		);
	}
}

async function fingerprintFile(
	project: WikiProject,
	relPath: string,
): Promise<AuditFingerprint | null> {
	try {
		const absolute = resolve(project.root, relPath);
		const fileStat = await stat(absolute);
		if (!fileStat.isFile()) return null;
		const content = await readFile(absolute);
		return {
			path: relPath,
			digest: `sha256:${createHash("sha256").update(content).digest("hex")}`,
			bytes: content.length,
		};
	} catch {
		return null;
	}
}

async function fingerprints(
	project: WikiProject,
	paths: string[],
	enabled: boolean,
): Promise<AuditFingerprint[]> {
	if (!enabled) return [];
	const out: AuditFingerprint[] = [];
	for (const relPath of unique(paths.map(normalizeRel)).sort().slice(0, 80)) {
		if (!(await pathExists(resolve(project.root, relPath)))) continue;
		const fingerprint = await fingerprintFile(project, relPath);
		if (fingerprint) out.push(fingerprint);
	}
	return out;
}

export async function auditSourceContract(
	project: WikiProject,
	input: SourceContractAuditInput = {},
): Promise<AuditProfileResult> {
	const snapshot = await generateSourceContractSnapshot(project);
	const expected = await readExpectedContract(project);
	const issues: AuditIssue[] = [];
	compareLists({
		label: "tool",
		kindPrefix: "tool-contract",
		expected: expected.tools,
		actual: normalToolNames(snapshot),
		path: "README.md",
		issues,
	});
	compatibilityToolIssues(snapshot, expected.tools, issues);
	compareLists({
		label: "command",
		kindPrefix: "command-contract",
		expected: expected.commands,
		actual: snapshot.commands,
		path: "README.md",
		issues,
	});
	staleToolNamespaceIssues(expected.tools, snapshot.tools, issues);
	packageEntryIssues(snapshot, expected, issues);
	apiFacadeIssues(snapshot, issues);
	loopRootContractIssues(snapshot, issues);
	const files = unique([
		...snapshot.source_files,
		...expected.sources,
		"src/api/index.ts",
		"src/api/tools.ts",
		"src/gateway/loop-contracts.ts",
		"package.json",
	]).sort();
	return {
		profile: PROFILE as AuditProfileResult["profile"],
		status: statusForIssues(issues),
		summary: `Checked source/API contract across ${snapshot.tools.length} tool(s), ${snapshot.commands.length} command(s), ${snapshot.api_exports.length} API export(s), and ${snapshot.package.knip_entry.length} package entry surface(s).`,
		checked_scopes: {
			root: project.root,
			files,
			layers: unique([
				...(input.layers || []),
				"checks",
				"api",
				"adapters",
			]).sort(),
		},
		issues,
		evidence_refs: [
			"src/checks/source-contract.ts",
			"src/checks/source-contract-snapshot.ts",
			"src/gateway/loop-contracts.ts",
			"README.md",
			".codewiki/kb/system/api.md",
		],
		fingerprints: await fingerprints(
			project,
			files,
			input.include_fingerprints !== false,
		),
		details: { snapshot, expected },
	};
}
