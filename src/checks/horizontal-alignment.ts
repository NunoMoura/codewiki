import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type {
	AuditFingerprint,
	AuditIssue,
	AuditProfileResult,
} from "../audit/types.ts";
import type { WikiProject } from "../project/types.ts";
import { parseDoc, type ParsedDoc } from "../knowledge/doc-parser.ts";
import { pathExists } from "../project/local/filesystem.ts";
import { unique } from "../shared/utils.ts";

interface HorizontalAuditInput {
	paths?: string[];
	layers?: string[];
	include_fingerprints?: boolean;
}

type HorizontalClaim = {
	id: string;
	value: string;
	path: string;
	refs: string[];
};

const PROFILE = "horizontal-alignment";
const CODE_EXTENSIONS = [
	"",
	".ts",
	".tsx",
	".mts",
	".cts",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".json",
];
const REPO_REF_PREFIX = /^(?:\.codewiki|src|skills|scripts|tests|docs)\//;
const IMPORT_SPECIFIER_RE = [
	/\bimport\s+(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g,
	/\bexport\s+[^"']+?\s+from\s+["']([^"']+)["']/g,
	/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

function normalizeRel(path: string): string {
	return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function normalizeValue(value: unknown): string {
	return String(value || "").trim();
}

function normalizeList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return unique(value.map(normalizeValue).filter(Boolean));
}

function createHorizontalIssue(
	severity: AuditIssue["severity"],
	kind: string,
	message: string,
	path?: string,
	refs?: string[],
): AuditIssue {
	return {
		profile: PROFILE,
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

async function walkFiles(
	dir: string,
	predicate: (path: string) => boolean = () => true,
): Promise<string[]> {
	if (!(await pathExists(dir))) return [];
	const out: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name === ".git") continue;
		const child = resolve(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await walkFiles(child, predicate)));
		else if (predicate(child)) out.push(child);
	}
	return out.sort();
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

async function fingerprintFiles(
	project: WikiProject,
	files: string[],
	enabled: boolean,
): Promise<AuditFingerprint[]> {
	if (!enabled) return [];
	const out: AuditFingerprint[] = [];
	for (const relPath of unique(files.map(normalizeRel)).sort().slice(0, 80)) {
		const fingerprint = await fingerprintFile(project, relPath);
		if (fingerprint) out.push(fingerprint);
	}
	return out;
}

function isRepoPathRef(ref: string): boolean {
	const normalized = normalizeRel(ref).split("#")[0];
	return (
		REPO_REF_PREFIX.test(normalized) ||
		/^(?:README\.md|package(?:-lock)?\.json|tsconfig\.json)$/.test(normalized)
	);
}

function isGeneratedReadModelRef(ref: string): boolean {
	const normalized = normalizeRel(ref).split("#")[0];
	return (
		normalized === ".codewiki/index_graph.json" ||
		normalized.startsWith(".codewiki/roadmap/tasks/")
	);
}

function refExists(project: WikiProject, ref: string): boolean {
	const normalized = normalizeRel(ref).split("#")[0];
	if (!normalized || normalized.includes("://")) return true;
	const wildcardIndex = normalized.indexOf("*");
	const candidate =
		wildcardIndex >= 0
			? normalized.slice(0, wildcardIndex).replace(/\/+$/, "")
			: normalized;
	if (!candidate) return true;
	return existsSync(resolve(project.root, candidate));
}

function claimArray(doc: ParsedDoc): unknown[] {
	const value =
		doc.frontmatter.horizontal_claims ?? doc.frontmatter.alignment_claims;
	return Array.isArray(value) ? value : [];
}

function extractClaims(doc: ParsedDoc): HorizontalClaim[] {
	return claimArray(doc)
		.map((raw) => {
			if (!raw || typeof raw !== "object") return null;
			const item = raw as Record<string, unknown>;
			const id = normalizeValue(item.id ?? item.key ?? item.claim);
			const value = normalizeValue(item.value ?? item.state ?? item.expected);
			const refs = unique([
				...normalizeList(item.refs),
				...normalizeList(item.source_refs),
				...normalizeList(item.code_refs),
			]);
			if (!id || !value) return null;
			return { id, value, refs, path: doc.path };
		})
		.filter((claim): claim is HorizontalClaim => Boolean(claim));
}

function explicitDocCodeRefs(doc: ParsedDoc): string[] {
	return unique([
		...doc.code_paths,
		...normalizeList(doc.frontmatter.horizontal_code_paths),
		...extractClaims(doc)
			.flatMap((claim) => claim.refs)
			.filter(isRepoPathRef),
	]);
}

function checkKbClaims(claims: HorizontalClaim[], issues: AuditIssue[]): void {
	const byId = new Map<string, HorizontalClaim[]>();
	for (const claim of claims) {
		byId.set(claim.id, [...(byId.get(claim.id) || []), claim]);
	}
	for (const [id, group] of byId) {
		const byValue = new Map<string, HorizontalClaim[]>();
		for (const claim of group) {
			byValue.set(claim.value, [...(byValue.get(claim.value) || []), claim]);
		}
		if (byValue.size > 1) {
			issues.push(
				createHorizontalIssue(
					"error",
					"kb-claim-conflict",
					`Horizontal KB claim '${id}' has conflicting values: ${[
						...byValue.keys(),
					].join(", ")}.`,
					group[0].path,
					group.map((claim) => claim.path),
				),
			);
		} else if (group.length > 1) {
			issues.push(
				createHorizontalIssue(
					"warning",
					"kb-claim-duplicate",
					`Horizontal KB claim '${id}' is repeated in ${group.length} docs; prefer one canonical owner with refs from dependents.`,
					group[0].path,
					group.map((claim) => claim.path),
				),
			);
		}
	}
}

function checkKbCodeRefs(
	project: WikiProject,
	docs: ParsedDoc[],
	issues: AuditIssue[],
): string[] {
	const refs: string[] = [];
	for (const doc of docs) {
		for (const ref of explicitDocCodeRefs(doc)) {
			const normalized = normalizeRel(ref);
			refs.push(normalized);
			if (isGeneratedReadModelRef(normalized)) {
				issues.push(
					createHorizontalIssue(
						"warning",
						"kb-code-generated-ref",
						`${doc.path} uses generated read model ${normalized} as an explicit horizontal code/source ref; canonical refs should point at source, KB, roadmap truth, builds, or validation proof.`,
						doc.path,
						[normalized],
					),
				);
			}
			if (!refExists(project, normalized)) {
				issues.push(
					createHorizontalIssue(
						"error",
						"kb-code-missing-source-ref",
						`${doc.path} references missing horizontal source path ${normalized}.`,
						doc.path,
						[normalized],
					),
				);
			}
		}
	}
	return unique(refs).sort();
}

function extractImportSpecifiers(source: string): string[] {
	const out: string[] = [];
	for (const pattern of IMPORT_SPECIFIER_RE) {
		pattern.lastIndex = 0;
		for (const match of source.matchAll(pattern)) {
			if (match[1]) out.push(match[1]);
		}
	}
	return unique(out);
}

function resolvesRelativeSpecifier(
	filePath: string,
	specifier: string,
): boolean {
	const base = resolve(dirname(filePath), specifier);
	if (existsSync(base)) return true;
	if (specifier.endsWith(".js")) {
		const withoutRuntimeExt = base.slice(0, -3);
		if ([".ts", ".tsx"].some((ext) => existsSync(`${withoutRuntimeExt}${ext}`)))
			return true;
	}
	if (specifier.endsWith(".mjs") && existsSync(`${base.slice(0, -4)}.mts`))
		return true;
	if (specifier.endsWith(".cjs") && existsSync(`${base.slice(0, -4)}.cts`))
		return true;
	for (const ext of CODE_EXTENSIONS) {
		if (ext && specifier.endsWith(ext)) continue;
		if (existsSync(`${base}${ext}`)) return true;
	}
	return ["index.ts", "index.tsx", "index.js", "index.mjs"].some((entry) =>
		existsSync(resolve(base, entry)),
	);
}

async function checkCodeImportContracts(
	project: WikiProject,
	issues: AuditIssue[],
): Promise<{ files: string[]; imports: number }> {
	const sourceFiles = await walkFiles(resolve(project.root, "src"), (path) =>
		/\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path),
	);
	let imports = 0;
	for (const file of sourceFiles) {
		const rel = normalizeRel(relative(project.root, file));
		const source = await readFile(file, "utf8");
		for (const specifier of extractImportSpecifiers(source)) {
			if (!specifier.startsWith(".")) continue;
			imports += 1;
			if (!resolvesRelativeSpecifier(file, specifier)) {
				issues.push(
					createHorizontalIssue(
						"error",
						"code-import-target-missing",
						`${rel} imports missing relative source target ${specifier}.`,
						rel,
						[specifier],
					),
				);
			}
		}
	}
	return {
		files: sourceFiles.map((file) =>
			normalizeRel(relative(project.root, file)),
		),
		imports,
	};
}

export async function auditHorizontalAlignment(
	project: WikiProject,
	input: HorizontalAuditInput,
): Promise<AuditProfileResult> {
	const issues: AuditIssue[] = [];
	const docsRoot = resolve(project.root, project.docsRoot);
	const docFiles = await walkFiles(
		docsRoot,
		(path) => path.endsWith(".md") || path.endsWith(".mdx"),
	);
	const docs = docFiles.flatMap((file) => {
		try {
			return [parseDoc(project.root, project, file)];
		} catch {
			return [];
		}
	});
	const claims = docs.flatMap(extractClaims);
	checkKbClaims(claims, issues);
	const explicitKbCodeRefs = checkKbCodeRefs(project, docs, issues);
	const code = await checkCodeImportContracts(project, issues);
	const graphPath = ".codewiki/index_graph.json";
	if (!(await pathExists(resolve(project.root, graphPath)))) {
		issues.push(
			createHorizontalIssue(
				"warning",
				"horizontal-graph-missing",
				"Generated graph is unavailable; horizontal alignment still checked canonical docs and source imports, but graph-backed routing evidence is missing.",
				graphPath,
			),
		);
	}
	const evidenceRefs = unique([
		project.docsRoot,
		"src/**/*.ts",
		graphPath,
		...explicitKbCodeRefs,
		...(input.paths || []),
	]).sort();
	const fingerprints = await fingerprintFiles(
		project,
		[
			...docFiles.map((file) => normalizeRel(relative(project.root, file))),
			...code.files.slice(0, 40),
			...explicitKbCodeRefs,
			graphPath,
		],
		input.include_fingerprints !== false,
	);
	return {
		profile: PROFILE,
		status: statusForIssues(issues),
		summary: `Checked horizontal alignment across ${docs.length} KB docs, ${claims.length} explicit KB claim(s), ${explicitKbCodeRefs.length} KB-code ref(s), and ${code.imports} relative source import(s).`,
		checked_scopes: {
			root: project.root,
			files: [
				project.docsRoot,
				"src/**/*.ts",
				graphPath,
				...(input.paths || []),
			],
			layers: unique([
				...(input.layers || []),
				"knowledge",
				"source",
				"graph",
			]).sort(),
		},
		issues,
		evidence_refs: evidenceRefs,
		fingerprints,
		details: {
			kb_kb: { docs: docs.length, claims: claims.length },
			kb_code: { explicit_refs: explicitKbCodeRefs.length },
			code_code: { files: code.files.length, relative_imports: code.imports },
		},
	};
}
