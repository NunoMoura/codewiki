import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { promisify } from "node:util";
import type {
	AuditFingerprint,
	AuditIssue,
	AuditProfile,
	AuditProfileResult,
	AuditReport,
	AuditScope,
	AuditStatus,
} from "../../domain/audit/types.ts";
import type { WikiProject } from "../../domain/project/types.ts";
import { AUDIT_PROFILE_VALUES } from "../../domain/audit/types.ts";
import { formatError, nowIso, unique } from "../../domain/shared/utils.ts";
import { pathExists } from "../local/filesystem.ts";
import { assessRoadmapTaskBoundary } from "../../domain/roadmap/task-boundary.ts";
import { parseDoc } from "../knowledge/doc-parser.ts";
import { buildFileStructureDriftReport, validateSystemDiagramRefs } from "../knowledge/diagram-parser.ts";

const execFileAsync = promisify(execFile);
const FULL_AUDIT_PROFILES: AuditProfile[] = [
	"alignment",
	"file-structure",
	"stale-reference",
	"package",
	"security",
	"generated-parity",
];
const AUDIT_VERSION = 1;

type JsonObject = Record<string, any>;

interface TextRule {
	name: string;
	prefix: string;
	forbidden: RegExp[];
	forbiddenOutside?: string;
}

export interface CodewikiAuditInput {
	profiles?: AuditProfile[];
	paths?: string[];
	layers?: string[];
	task_id?: string;
	changed?: boolean;
	full?: boolean;
	include_fingerprints?: boolean;
}

const ARCHITECTURE_RULES: TextRule[] = [
	{
		name: "no-deprecated-pi-package-scope",
		prefix: "",
		forbidden: [/@mariozechner\//],
	},
	{
		name: "domain-is-pure",
		prefix: "domain/",
		forbidden: [
			/@mariozechner\//,
			/@earendil-works\//,
			/from\s+["']node:/,
			/import\s+["']node:/,
			/from\s+["'](?:\.\.\/)+application/,
			/from\s+["'](?:\.\.\/)+adapters/,
			/from\s+["'](?:\.\.\/)+core/,
			/from\s+["'](?:\.\.\/)+engine/,
			/from\s+["'](?:\.\.\/)+tools/,
			/from\s+["'](?:\.\.\/)+commands/,
			/from\s+["'](?:\.\.\/)+ui/,
		],
	},
	{
		name: "application-is-agent-agnostic",
		prefix: "application/",
		forbidden: [
			/@mariozechner\//,
			/@earendil-works\//,
			/from\s+["'](?:\.\.\/)+adapters/,
			/from\s+["'](?:\.\.\/)+tools/,
			/from\s+["'](?:\.\.\/)+commands/,
			/from\s+["'](?:\.\.\/)+ui/,
		],
	},
	{
		name: "shared-has-no-product-behavior",
		prefix: "shared/",
		forbidden: [
			/@mariozechner\//,
			/@earendil-works\//,
			/from\s+["']node:/,
			/import\s+["']node:/,
			/from\s+["'](?:\.\.\/)+domain/,
			/from\s+["'](?:\.\.\/)+application/,
			/from\s+["'](?:\.\.\/)+adapters/,
			/from\s+["'](?:\.\.\/)+core/,
			/from\s+["'](?:\.\.\/)+engine/,
		],
	},
	{
		name: "pi-sdk-only-in-pi-adapter",
		prefix: "",
		forbiddenOutside: "adapters/pi/",
		forbidden: [/@earendil-works\/pi-/],
	},
];
const PI_SDK_ENTRYPOINT_ALLOWLIST = new Set(["index.ts", "bootstrap.ts", "mutation-queue.ts"]);
const CANONICAL_ROADMAP_STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"];
const LEGACY_ROADMAP_WORKFLOW_VALUES = new Set(["research", "implement", "verify"]);

function normalizeRel(path: string): string {
	return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isAuditProfile(value: string): value is AuditProfile {
	return (AUDIT_PROFILE_VALUES as readonly string[]).includes(value);
}

export function normalizeAuditProfiles(input: CodewikiAuditInput): AuditProfile[] {
	const requested: AuditProfile[] = [...new Set((input.profiles || []).filter(isAuditProfile))];
	if (input.full || requested.length === 0) {
		if (input.changed && !requested.includes("changed")) requested.push("changed");
		if (input.task_id && !requested.includes("task")) requested.push("task");
		if (input.layers?.length && requested.length === 0) requested.push("alignment");
		return requested.length ? requested : FULL_AUDIT_PROFILES;
	}
	if (input.changed && !requested.includes("changed")) requested.push("changed");
	if (input.task_id && !requested.includes("task")) requested.push("task");
	return requested;
}

function createIssue(
	profile: AuditProfile,
	severity: AuditIssue["severity"],
	kind: string,
	message: string,
	path?: string,
	rationale?: string,
	refs?: string[],
): AuditIssue {
	return {
		profile,
		severity,
		kind,
		message,
		...(path ? { path } : {}),
		...(rationale ? { rationale } : {}),
		...(refs?.length ? { refs } : {}),
	};
}

function statusForIssues(issues: AuditIssue[]): AuditStatus {
	if (issues.some((issue) => issue.severity === "error")) return "fail";
	if (issues.some((issue) => issue.severity === "warning")) return "warning";
	return "pass";
}

async function maybeReadJson(path: string): Promise<JsonObject | null> {
	try {
		return JSON.parse(await readFile(path, "utf8")) as JsonObject;
	} catch {
		return null;
	}
}

async function maybeReadText(path: string): Promise<string | null> {
	try {
		return await readFile(path, "utf8");
	} catch {
		return null;
	}
}

async function walkFiles(dir: string, predicate: (path: string) => boolean = () => true): Promise<string[]> {
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

async function fingerprintFile(project: WikiProject, relPath: string): Promise<AuditFingerprint | null> {
	const absolute = resolve(project.root, relPath);
	try {
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

async function fingerprintFiles(project: WikiProject, files: string[], enabled: boolean): Promise<AuditFingerprint[]> {
	if (!enabled) return [];
	const out: AuditFingerprint[] = [];
	for (const relPath of unique(files.map(normalizeRel)).sort().slice(0, 60)) {
		const fingerprint = await fingerprintFile(project, relPath);
		if (fingerprint) out.push(fingerprint);
	}
	return out;
}

function exportedStringArray(source: string, exportName: string): string[] | null {
	const match = source.match(new RegExp(`export\\s+const\\s+${exportName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const`));
	if (!match) return null;
	return [...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]);
}

function pushArrayEqualsIssue(issues: AuditIssue[], actual: string[] | null, exportName: string): void {
	if (!actual) {
		issues.push(createIssue("file-structure", "error", "workflow-drift", `Missing ${exportName} export.`, "src/domain/roadmap/types.ts"));
		return;
	}
	if (JSON.stringify(actual) !== JSON.stringify(CANONICAL_ROADMAP_STATUSES)) {
		issues.push(createIssue(
			"file-structure",
			"error",
			"workflow-drift",
			`${exportName} = ${JSON.stringify(actual)}, expected ${JSON.stringify(CANONICAL_ROADMAP_STATUSES)}.`,
			"src/domain/roadmap/types.ts",
		));
	}
}

async function auditFileStructure(project: WikiProject, input: CodewikiAuditInput): Promise<AuditProfileResult> {
	const profile: AuditProfile = "file-structure";
	const issues: AuditIssue[] = [];
	const evidence = ["src/application/tools/audit.ts", "scripts/check-architecture.mjs"];
	const srcRoot = resolve(project.root, "src");
	const tsFiles = await walkFiles(srcRoot, (path) => path.endsWith(".ts"));
	if (tsFiles.length === 0) {
		issues.push(createIssue(profile, "warning", "missing-source-tree", "No TypeScript source files found under src/.", "src"));
	}

	const roadmapTypesPath = resolve(project.root, "src/domain/roadmap/types.ts");
	const typesText = await maybeReadText(roadmapTypesPath);
	if (typesText) {
		pushArrayEqualsIssue(issues, exportedStringArray(typesText, "ROADMAP_STATUS_VALUES"), "ROADMAP_STATUS_VALUES");
		if (/TASK_PHASE_VALUES|TaskPhase|phase\?:/.test(typesText)) {
			issues.push(createIssue(profile, "error", "workflow-drift", "Task phases must not be canonical types; use roadmap status plus build/validation gates.", "src/domain/roadmap/types.ts"));
		}
	} else {
		issues.push(createIssue(profile, "warning", "missing-types", "Unable to read shared domain types.", "src/domain/roadmap/types.ts"));
	}

	const schemaText = await maybeReadText(resolve(project.root, "src/adapters/pi/schemas.ts"));
	if (schemaText && /taskLoopPhaseSchema|phase:\s*Type\.Optional|Type\.Literal\(["']verify["']\)/.test(schemaText)) {
		issues.push(createIssue(profile, "error", "workflow-drift", "Pi schema must not expose task phase fields or deprecated 'verify' literal.", "src/adapters/pi/schemas.ts"));
	}

	const graphText = await maybeReadText(resolve(project.root, ".codewiki/index_graph.json"));
	if (graphText && /"phase"\s*:/.test(graphText)) {
		issues.push(createIssue(profile, "error", "workflow-drift", "Generated index_graph.json must not expose task phase fields.", ".codewiki/index_graph.json"));
	}

	const queue = await maybeReadJson(resolve(project.root, project.roadmapPath));
	if (queue?.tasks && typeof queue.tasks === "object") {
		for (const [taskId, task] of Object.entries(queue.tasks)) {
			const status = String((task as JsonObject)?.status || "").trim();
			if (LEGACY_ROADMAP_WORKFLOW_VALUES.has(status)) {
				issues.push(createIssue(profile, "error", "workflow-drift", `${taskId} uses deprecated roadmap status '${status}'.`, project.roadmapPath));
			}
		}
	}

	for (const file of tsFiles) {
		const rel = normalizeRel(relative(srcRoot, file));
		const text = await readFile(file, "utf8");
		if (rel.startsWith("core/") || rel.startsWith("engine/") || rel.startsWith("infrastructure/")) {
			issues.push(createIssue(profile, "error", "transitional-layer-no-new-files", `${rel} is in a removed source layer.`, `src/${rel}`));
		}
		for (const rule of ARCHITECTURE_RULES) {
			if (!rel.startsWith(rule.prefix)) continue;
			if (rule.forbiddenOutside && (rel.startsWith(rule.forbiddenOutside) || PI_SDK_ENTRYPOINT_ALLOWLIST.has(rel))) continue;
			for (const pattern of rule.forbidden) {
				if (pattern.test(text)) {
					issues.push(createIssue(profile, "error", rule.name, `${rel} matches ${pattern}.`, `src/${rel}`));
				}
			}
		}
	}

	const architectureScript = await maybeReadText(resolve(project.root, "scripts/check-architecture.mjs"));
	if (!architectureScript) {
		issues.push(createIssue(profile, "warning", "missing-script-wrapper", "Optional architecture script wrapper is absent.", "scripts/check-architecture.mjs"));
	} else {
		if (!architectureScript.includes("executeCodewikiAudit")) {
			issues.push(createIssue(profile, "error", "script-owned-audit-semantics", "Architecture check script must delegate to the source-owned audit engine.", "scripts/check-architecture.mjs"));
		}
		if (/const\s+checks\s*=|ARCHITECTURE_RULES|domain-is-pure/.test(architectureScript)) {
			issues.push(createIssue(profile, "error", "script-owned-audit-semantics", "Architecture check script must not define authoritative audit rules.", "scripts/check-architecture.mjs"));
		}
	}

	const scriptFiles = await walkFiles(resolve(project.root, "scripts"), (path) => /\.(?:mjs|js|ts)$/.test(path));
	for (const scriptFile of scriptFiles) {
		const rel = normalizeRel(relative(project.root, scriptFile));
		const text = await maybeReadText(scriptFile);
		if (!text) continue;
		if (/const\s+checks\s*=|ARCHITECTURE_RULES|domain-is-pure|\.codewiki\/roadmap\/queue\.json|writeFileSync\([\s\S]{0,160}\.codewiki\//.test(text) && !text.includes("../src/")) {
			issues.push(createIssue(profile, "error", "script-owned-product-logic", "Script appears to own CodeWiki product/audit semantics instead of delegating to source-owned code.", rel));
		}
	}

	const docFiles = await walkFiles(resolve(project.root, project.docsRoot), (path) => path.endsWith(".md") || path.endsWith(".mdx"));
	const docs = docFiles.flatMap((file) => {
		try {
			return [parseDoc(project.root, project, file)];
		} catch {
			return [];
		}
	});
	const diagramValidation = validateSystemDiagramRefs(project.root, project, docs);
	for (const issue of diagramValidation.issues) {
		issues.push(createIssue(profile, issue.severity, issue.kind, issue.message, issue.path, undefined, issue.refs));
	}
	evidence.push(".codewiki/kb/system/diagrams", ...diagramValidation.diagrams.map((diagram) => diagram.path));

	const fileStructureDrift = buildFileStructureDriftReport(project.root, project);
	if (fileStructureDrift.available || fileStructureDrift.parse_issues.length > 0) {
		evidence.push(fileStructureDrift.map_path);
	}
	for (const issue of fileStructureDrift.parse_issues) {
		issues.push(createIssue(profile, issue.severity, issue.kind, issue.message, issue.path, undefined, issue.refs));
	}
	for (const entry of fileStructureDrift.entries) {
		if (entry.category === "approved_migration_delta") continue;
		issues.push(createIssue(profile, entry.severity, entry.category, entry.message, entry.path, undefined, entry.refs));
	}

	const fingerprints = await fingerprintFiles(project, [
		"src/application/tools/audit.ts",
		"src/domain/roadmap/types.ts",
		"src/domain/shared/types.ts",
		"src/adapters/pi/schemas.ts",
		"src/adapters/pi/index.ts",
		"scripts/check-architecture.mjs",
		...diagramValidation.diagrams.map((diagram) => diagram.path),
		fileStructureDrift.map_path,
	], input.include_fingerprints !== false);
	const blockingDriftEntries = fileStructureDrift.entries.filter((entry) => entry.category !== "approved_migration_delta").length;
	return {
		profile,
		status: statusForIssues(issues),
		summary: `Checked ${tsFiles.length} TypeScript source files, architecture wrapper boundaries, ${diagramValidation.refs.length} diagram refs, and file-structure drift lens (${fileStructureDrift.counts.approved_migration_delta} approved migration delta(s), ${blockingDriftEntries} actionable drift item(s)).`,
		checked_scopes: { root: project.root, files: ["src/**/*.ts", "scripts/**/*.mjs", "scripts/check-architecture.mjs", ".codewiki/kb/system/diagrams/**/*.yaml"] },
		issues,
		evidence_refs: unique(evidence),
		fingerprints,
		details: { file_structure: fileStructureDrift },
	};
}

async function auditAlignment(project: WikiProject, input: CodewikiAuditInput): Promise<AuditProfileResult> {
	const profile: AuditProfile = "alignment";
	const issues: AuditIssue[] = [];
	const graphPath = ".codewiki/index_graph.json";
	const queuePath = project.roadmapPath;
	const graph = await maybeReadJson(resolve(project.root, graphPath));
	if (!graph) {
		issues.push(createIssue(profile, "error", "missing-graph", "Generated graph index is missing or unreadable.", graphPath));
	} else {
		const health = graph?.lenses?.status?.health || graph?.status?.health;
		if (health?.errors > 0) {
			issues.push(createIssue(profile, "error", "graph-health", `Graph health reports ${health.errors} errors.`, graphPath));
		}
		if (health?.warnings > 0) {
			issues.push(createIssue(profile, "warning", "graph-health", `Graph health reports ${health.warnings} warnings.`, graphPath));
		}
	}
	const queue = await maybeReadJson(resolve(project.root, queuePath));
	if (!queue?.tasks) {
		issues.push(createIssue(profile, "error", "missing-roadmap", "Roadmap queue is missing or unreadable.", queuePath));
	}
	const fingerprints = await fingerprintFiles(project, [graphPath, queuePath, ...(input.paths || [])], input.include_fingerprints !== false);
	return {
		profile,
		status: statusForIssues(issues),
		summary: "Checked generated graph health and roadmap queue reachability.",
		checked_scopes: { root: project.root, layers: input.layers, files: [graphPath, queuePath] },
		issues,
		evidence_refs: [graphPath, queuePath],
		fingerprints,
	};
}

async function auditStaleReference(project: WikiProject, input: CodewikiAuditInput): Promise<AuditProfileResult> {
	const profile: AuditProfile = "stale-reference";
	const issues: AuditIssue[] = [];
	const docsRoot = resolve(project.root, project.docsRoot);
	const docs = await walkFiles(docsRoot, (path) => path.endsWith(".md") || path.endsWith(".mdx"));
	const activeTextFiles = [
		...docs,
		...(await walkFiles(resolve(project.root, "skills"), (path) => path.endsWith(".md"))),
		resolve(project.root, "README.md"),
	].filter(Boolean);
	const stalePatterns: Array<{ pattern: RegExp; message: string }> = [
		{ pattern: /extensions\/codewiki\/src/g, message: "Legacy package-source path extensions/codewiki/src appears in active docs/source." },
		{ pattern: /\.codewiki\/roadmap\.json/g, message: "Legacy root roadmap path appears in active docs/source." },
		{ pattern: /scripts\/codewiki-transaction\.mjs/g, message: "Deprecated script-owned CodeWiki transaction path appears in active docs/source." },
		{ pattern: /\/wiki-verify\b/g, message: "Deprecated wiki-verify command appears in active docs/source." },
	];
	const semanticMisusePatterns: Array<{ kind: string; pattern: RegExp; allowed: RegExp; message: string }> = [
		{
			kind: "dogfood-as-package-source",
			pattern: /(?:\.codewiki\/`?|\.codewiki\/\*\*).{0,100}(?:is|are|as|contains|holds|stores).{0,100}package source/gi,
			allowed: /\b(?:not|never|do not|must not)\b.{0,80}package source|package source.{0,80}\b(?:not|never)\b/i,
			message: ".codewiki dogfood state is described as package source.",
		},
		{
			kind: "generated-task-view-as-truth",
			pattern: /(?:\.codewiki\/roadmap\/tasks\/\*\*|generated task (?:views|shards|context)).{0,120}(?:canonical|source[- ]of[- ]truth|truth)/gi,
			allowed: /\b(?:not|never|do not|must not|read-only)\b.{0,100}(?:canonical|truth|hand-edit|source)/i,
			message: "Generated task views are described as canonical truth.",
		},
	];
	for (const file of activeTextFiles) {
		const rel = normalizeRel(relative(project.root, file));
		const text = await maybeReadText(file);
		if (!text) continue;
		for (const item of stalePatterns) {
			item.pattern.lastIndex = 0;
			if (item.pattern.test(text)) {
				issues.push(createIssue(profile, "error", "stale-reference", item.message, rel));
			}
		}
		for (const item of semanticMisusePatterns) {
			item.pattern.lastIndex = 0;
			for (const match of text.matchAll(item.pattern)) {
				const matched = match[0] ?? "";
				if (item.allowed.test(matched)) continue;
				issues.push(createIssue(profile, "error", item.kind, item.message, rel));
				break;
			}
		}
	}
	const fingerprints = await fingerprintFiles(project, [project.docsRoot, "skills/codewiki/SKILL.md", "README.md", ...(input.paths || [])], input.include_fingerprints !== false);
	return {
		profile,
		status: statusForIssues(issues),
		summary: `Scanned ${activeTextFiles.length} active markdown/source text files for known stale references.`,
		checked_scopes: { root: project.root, files: [project.docsRoot, "skills/**/*.md", "README.md"] },
		issues,
		evidence_refs: [project.docsRoot, "skills", "README.md"],
		fingerprints,
	};
}

async function npmPackDryRunFiles(project: WikiProject): Promise<string[] | null> {
	try {
		const result = await execFileAsync("npm", ["pack", "--dry-run", "--json"], { cwd: project.root, encoding: "utf8", maxBuffer: 1024 * 1024 * 8 });
		const parsed = JSON.parse(result.stdout || "[]");
		const files = parsed?.[0]?.files;
		if (!Array.isArray(files)) return null;
		return files.map((item: JsonObject) => String(item.path || "")).filter(Boolean).sort();
	} catch {
		return null;
	}
}

async function auditPackage(project: WikiProject, input: CodewikiAuditInput): Promise<AuditProfileResult> {
	const profile: AuditProfile = "package";
	const issues: AuditIssue[] = [];
	const packageJsonPath = "package.json";
	const packageJson = await maybeReadJson(resolve(project.root, packageJsonPath));
	if (!packageJson) {
		issues.push(createIssue(profile, "warning", "missing-package-json", "No package.json found; package audit has no package surface to inspect.", packageJsonPath));
	} else {
		const files = Array.isArray(packageJson.files) ? packageJson.files.map(String) : [];
		for (const required of ["src", "skills", "scripts", "README.md", "package.json"]) {
			if (!files.includes(required)) {
				issues.push(createIssue(profile, "error", "package-files", `package.json files must include ${required}.`, packageJsonPath));
			}
		}
		for (const entry of files) {
			if (entry.startsWith("extensions")) {
				issues.push(createIssue(profile, "error", "package-files", "package.json files must not include deprecated extensions/ source paths.", packageJsonPath));
			}
			if (!entry.includes("*") && !(await pathExists(resolve(project.root, entry)))) {
				issues.push(createIssue(profile, "error", "package-files-unreachable", `package.json files entry is unreachable: ${entry}.`, packageJsonPath));
			}
		}
		const extensions = Array.isArray(packageJson.pi?.extensions) ? packageJson.pi.extensions.map(String) : [];
		if (!extensions.includes("./src/index.ts")) {
			issues.push(createIssue(profile, "error", "pi-extension-entry", "Pi extension entry must resolve from ./src/index.ts.", packageJsonPath));
		}
		for (const entry of extensions) {
			if (!(await pathExists(resolve(project.root, entry.replace(/^\.\//, ""))))) {
				issues.push(createIssue(profile, "error", "pi-extension-unreachable", `Pi extension entry is unreachable: ${entry}.`, packageJsonPath));
			}
		}
		const skills = Array.isArray(packageJson.pi?.skills) ? packageJson.pi.skills.map(String) : [];
		if (!skills.includes("./skills")) {
			issues.push(createIssue(profile, "error", "pi-skill-entry", "Pi skill entry must resolve from ./skills.", packageJsonPath));
		}
		for (const entry of skills) {
			if (!(await pathExists(resolve(project.root, entry.replace(/^\.\//, ""))))) {
				issues.push(createIssue(profile, "error", "pi-skill-unreachable", `Pi skill entry is unreachable: ${entry}.`, packageJsonPath));
			}
		}
		if (!packageJson.scripts?.["check:architecture"]) {
			issues.push(createIssue(profile, "warning", "package-checks", "package.json should expose check:architecture wrapper for CI/package smoke.", packageJsonPath));
		}
		const requiredSkillAssets = [
			"skills/codewiki/SKILL.md",
			"skills/codewiki/prompts/resume-implementation.md",
			"skills/codewiki/bootstrap/onboarding.md",
			"skills/codewiki/bootstrap/starter-taxonomy.md",
		];
		for (const asset of requiredSkillAssets) {
			if (!(await pathExists(resolve(project.root, asset)))) {
				issues.push(createIssue(profile, "error", "skill-asset-unreachable", `Skill asset is unreachable: ${asset}.`, asset));
			}
		}
		const packedFiles = await npmPackDryRunFiles(project);
		if (packedFiles) {
			for (const required of ["src/index.ts", ...requiredSkillAssets, "scripts/check-architecture.mjs", "package.json", "README.md"]) {
				if (!packedFiles.includes(required)) {
					issues.push(createIssue(profile, "error", "package-dry-run-missing", `npm pack --dry-run omits required artifact ${required}.`, packageJsonPath));
				}
			}
			for (const packed of packedFiles) {
				if (/^(?:\.codewiki|\.pi|tests|node_modules|extensions)\//.test(packed)) {
					issues.push(createIssue(profile, "error", "package-dry-run-unexpected", `npm pack --dry-run includes unexpected artifact ${packed}.`, packageJsonPath));
				}
			}
		} else {
			issues.push(createIssue(profile, "warning", "package-dry-run-unavailable", "Unable to inspect npm pack --dry-run --json output.", packageJsonPath));
		}
	}
	if (packageJson && !(await pathExists(resolve(project.root, "package-lock.json")))) {
		issues.push(createIssue(profile, "error", "missing-lockfile", "package-lock.json is absent; publication reproducibility is not anchored.", "package-lock.json"));
	}
	const fingerprints = await fingerprintFiles(project, ["package.json", "package-lock.json", "src/index.ts", "skills/codewiki/SKILL.md", "skills/codewiki/prompts/resume-implementation.md", "skills/codewiki/bootstrap/onboarding.md", "skills/codewiki/bootstrap/starter-taxonomy.md"], input.include_fingerprints !== false);
	return {
		profile,
		status: statusForIssues(issues),
		summary: "Checked package manifest reachability, Pi package entries, and lockfile presence.",
		checked_scopes: { root: project.root, files: ["package.json", "package-lock.json", "src/index.ts", "skills"] },
		issues,
		evidence_refs: ["package.json", "package-lock.json"],
		fingerprints,
	};
}

async function gitOutput(project: WikiProject, args: string[]): Promise<string | null> {
	try {
		const result = await execFileAsync("git", args, { cwd: project.root, encoding: "utf8", maxBuffer: 1024 * 1024 * 8 });
		return result.stdout;
	} catch {
		return null;
	}
}

async function auditSecurity(project: WikiProject, input: CodewikiAuditInput): Promise<AuditProfileResult> {
	const profile: AuditProfile = "security";
	const issues: AuditIssue[] = [];
	const packageJson = await maybeReadJson(resolve(project.root, "package.json"));
	const riskyScriptPattern = /\b(curl|wget|sudo|chmod\s+777|rm\s+-rf\s+\/|npm\s+publish)\b/;
	if (packageJson?.scripts) {
		for (const [name, script] of Object.entries(packageJson.scripts)) {
			if (riskyScriptPattern.test(String(script))) {
				issues.push(createIssue(profile, "warning", "risky-package-script", `package script ${name} contains a risky shell fragment.`, "package.json"));
			}
		}
	}
	const tracked = await gitOutput(project, ["ls-files"]);
	if (tracked) {
		for (const rel of tracked.split("\n").filter(Boolean)) {
			if (/(^|\/)(\.env|id_rsa|id_dsa|.*\.pem|.*\.p12)$/.test(rel)) {
				issues.push(createIssue(profile, "error", "secret-risk-path", `Tracked path looks like a secret-bearing file: ${rel}.`, rel));
			}
		}
	} else {
		issues.push(createIssue(profile, "warning", "git-unavailable", "Unable to inspect git tracked files for secret-risk paths."));
	}
	const fingerprints = await fingerprintFiles(project, ["package.json", "package-lock.json", ...(input.paths || [])], input.include_fingerprints !== false);
	return {
		profile,
		status: statusForIssues(issues),
		summary: "Checked package scripts and tracked secret-risk paths.",
		checked_scopes: { root: project.root, files: ["package.json", "git ls-files"] },
		issues,
		evidence_refs: ["package.json", "git ls-files"],
		fingerprints,
	};
}

function comparableTaskFields(task: JsonObject): JsonObject {
	return {
		id: task.id,
		title: task.title,
		status: task.status,
		priority: task.priority,
		kind: task.kind,
		summary: task.summary,
	};
}

async function auditRoadmapTaskViewParity(project: WikiProject, issues: AuditIssue[]): Promise<number> {
	const profile: AuditProfile = "generated-parity";
	const queue = await maybeReadJson(resolve(project.root, project.roadmapPath));
	if (!queue?.tasks || typeof queue.tasks !== "object") return 0;
	let checked = 0;
	const activeIds = new Set<string>();
	const allIds = new Set(Object.keys(queue.tasks));
	for (const [taskId, rawTask] of Object.entries(queue.tasks)) {
		const task = rawTask as JsonObject;
		if (task.status === "done" || task.status === "cancelled") continue;
		activeIds.add(taskId);
		checked++;
		const taskViewPath = `.codewiki/roadmap/tasks/${taskId}/task.json`;
		const contextViewPath = `.codewiki/roadmap/tasks/${taskId}/context.json`;
		const taskView = await maybeReadJson(resolve(project.root, taskViewPath));
		const contextView = await maybeReadJson(resolve(project.root, contextViewPath));
		if (!taskView) {
			issues.push(createIssue(profile, "error", "roadmap-task-view-missing", `Generated task view missing for active ${taskId}.`, taskViewPath));
		} else if (JSON.stringify(comparableTaskFields(taskView)) !== JSON.stringify(comparableTaskFields(task))) {
			issues.push(createIssue(profile, "error", "roadmap-task-view-mismatch", `Generated task view does not match canonical roadmap queue for ${taskId}.`, taskViewPath));
		}
		const contextTask = contextView?.task;
		if (!contextTask) {
			issues.push(createIssue(profile, "error", "roadmap-task-context-missing", `Generated task context missing for active ${taskId}.`, contextViewPath));
		} else if (JSON.stringify(comparableTaskFields(contextTask)) !== JSON.stringify(comparableTaskFields(task))) {
			issues.push(createIssue(profile, "error", "roadmap-task-context-mismatch", `Generated task context does not match canonical roadmap queue for ${taskId}.`, contextViewPath));
		}
	}
	const generatedTaskDirs = await walkFiles(resolve(project.root, ".codewiki/roadmap/tasks"), (path) => path.endsWith("task.json"));
	for (const taskView of generatedTaskDirs) {
		const taskId = normalizeRel(relative(resolve(project.root, ".codewiki/roadmap/tasks"), taskView)).split("/")[0];
		if (taskId && !activeIds.has(taskId) && !allIds.has(taskId)) {
			issues.push(createIssue(profile, "error", "roadmap-task-view-orphan", `Generated task view exists for missing task ${taskId}.`, `.codewiki/roadmap/tasks/${taskId}/task.json`));
		}
	}
	return checked;
}

async function auditGeneratedParity(project: WikiProject, input: CodewikiAuditInput): Promise<AuditProfileResult> {
	const profile: AuditProfile = "generated-parity";
	const issues: AuditIssue[] = [];
	const graphPath = resolve(project.root, ".codewiki/index_graph.json");
	const canonicalPaths = [project.roadmapPath, project.docsRoot].map((path) => resolve(project.root, path));
	let graphStat: Awaited<ReturnType<typeof stat>> | null = null;
	try {
		graphStat = await stat(graphPath);
	} catch {
		issues.push(createIssue(profile, "error", "missing-generated-state", "Generated index_graph.json is missing.", ".codewiki/index_graph.json"));
	}
	if (graphStat) {
		for (const canonicalPath of canonicalPaths) {
			try {
				const canonicalStat = await stat(canonicalPath);
				if (canonicalStat.mtimeMs - graphStat.mtimeMs > 1000) {
					issues.push(createIssue(
						profile,
						"warning",
						"generated-state-maybe-stale",
						`${normalizeRel(relative(project.root, canonicalPath))} is newer than .codewiki/index_graph.json; refresh generated state before close/publication.`,
						".codewiki/index_graph.json",
					));
				}
			} catch {
				issues.push(createIssue(profile, "warning", "canonical-path-unreadable", `Unable to stat ${normalizeRel(relative(project.root, canonicalPath))}.`, normalizeRel(relative(project.root, canonicalPath))));
			}
		}
	}
	const taskViewsChecked = await auditRoadmapTaskViewParity(project, issues);
	const fingerprints = await fingerprintFiles(project, [".codewiki/index_graph.json", project.roadmapPath, ".codewiki/roadmap/tasks", ...(input.paths || [])], input.include_fingerprints !== false);
	return {
		profile,
		status: statusForIssues(issues),
		summary: `Checked generated graph presence, freshness, and ${taskViewsChecked} active roadmap task views against canonical sources.`,
		checked_scopes: { root: project.root, files: [".codewiki/index_graph.json", project.roadmapPath, ".codewiki/roadmap/tasks", project.docsRoot] },
		issues,
		evidence_refs: [".codewiki/index_graph.json", project.roadmapPath, project.docsRoot],
		fingerprints,
	};
}

function parseGitStatusPorcelain(raw: string): string[] {
	const files: string[] = [];
	const entries = raw.split("\0").filter(Boolean);
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		const statusCode = entry.slice(0, 2);
		const path = entry.slice(3);
		if (!path) continue;
		files.push(normalizeRel(path));
		if (statusCode.includes("R") || statusCode.includes("C")) i++;
	}
	return unique(files).sort();
}

function classifyLayer(path: string): string {
	if (path.startsWith(".codewiki/kb/")) return "knowledge";
	if (path === ".codewiki/roadmap/queue.json") return "roadmap";
	if (path.startsWith(".codewiki/roadmap/tasks/") || path === ".codewiki/index_graph.json") return "generated";
	if (path.startsWith(".codewiki/builds/")) return "build";
	if (path.startsWith(".codewiki/validation/")) return "validation";
	if (path.startsWith("src/") || path.startsWith("skills/") || path.startsWith("scripts/") || path.startsWith("tests/") || path === "package.json") return "source";
	return "other";
}

async function auditChanged(project: WikiProject, input: CodewikiAuditInput): Promise<AuditProfileResult> {
	const profile: AuditProfile = "changed";
	const issues: AuditIssue[] = [];
	let changedFiles: string[] = [];
	const raw = await gitOutput(project, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
	if (raw === null) {
		issues.push(createIssue(profile, "warning", "git-unavailable", "Unable to read git status for changed-file audit."));
	} else {
		changedFiles = parseGitStatusPorcelain(raw);
		for (const file of changedFiles) {
			if (file.startsWith(".codewiki/roadmap/tasks/") || file === ".codewiki/index_graph.json") {
				issues.push(createIssue(profile, "warning", "generated-file-changed", "Generated state/view file is changed; refresh or revert generated output before publication.", file));
			}
		}
	}
	const layers = unique(changedFiles.map(classifyLayer)).sort();
	const fingerprints = await fingerprintFiles(project, changedFiles, input.include_fingerprints !== false);
	return {
		profile,
		status: statusForIssues(issues),
		summary: `Checked ${changedFiles.length} changed files across ${layers.length} layers.`,
		checked_scopes: { root: project.root, files: changedFiles, layers, changed: true },
		issues,
		evidence_refs: ["git status --porcelain=v1 -z --untracked-files=all"],
		fingerprints,
	};
}

async function auditTask(project: WikiProject, input: CodewikiAuditInput): Promise<AuditProfileResult> {
	const profile: AuditProfile = "task";
	const issues: AuditIssue[] = [];
	const taskId = input.task_id;
	const queuePath = project.roadmapPath;
	const queue = await maybeReadJson(resolve(project.root, queuePath));
	const task = taskId && queue?.tasks ? (queue.tasks[taskId] as JsonObject | undefined) : undefined;
	if (!taskId) {
		issues.push(createIssue(profile, "error", "missing-task-id", "Task audit requires task_id or /audit --task TASK-###."));
	} else if (!task) {
		issues.push(createIssue(profile, "error", "task-not-found", `${taskId} was not found in roadmap queue.`, queuePath));
	} else {
		const boundary = assessRoadmapTaskBoundary(task as any);
		if (!boundary.executable) {
			issues.push(createIssue(profile, "error", "roadmap-container-task", `${taskId} is not self-contained executable work; use a sprint for grouping. ${boundary.reasons.join("; ")}`, queuePath));
		}
		for (const rel of [...(task.spec_paths || []), ...(task.code_paths || [])].filter((path: string) => !path.includes("*")).map(String)) {
			if (!(await pathExists(resolve(project.root, rel)))) {
				issues.push(createIssue(profile, "warning", "task-path-missing", `${taskId} references a missing path: ${rel}.`, rel));
			}
		}
		if (task.status === "done") {
			const validationDir = resolve(project.root, ".codewiki/validation");
			const validations = await walkFiles(validationDir, (path) => path.endsWith(".json"));
			const hasClosePass = validations.some((path) => path.includes("task-close-pass") && path.includes(taskId.toLowerCase()));
			if (!hasClosePass) {
				issues.push(createIssue(profile, "warning", "missing-task-close-validation", `${taskId} is done but no matching task-close pass report was found.`, ".codewiki/validation"));
			}
		}
	}
	const fingerprints = await fingerprintFiles(project, [queuePath, ...(taskId ? [`.codewiki/roadmap/tasks/${taskId}/task.json`, `.codewiki/roadmap/tasks/${taskId}/context.json`] : [])], input.include_fingerprints !== false);
	return {
		profile,
		status: statusForIssues(issues),
		summary: taskId ? `Checked roadmap task ${taskId}.` : "Task audit missing task id.",
		checked_scopes: { root: project.root, task_id: taskId, files: [queuePath] },
		issues,
		evidence_refs: [queuePath, ...(taskId ? [`.codewiki/roadmap/tasks/${taskId}/task.json`] : [])],
		fingerprints,
	};
}

async function runProfile(project: WikiProject, profile: AuditProfile, input: CodewikiAuditInput): Promise<AuditProfileResult> {
	switch (profile) {
		case "alignment": return auditAlignment(project, input);
		case "file-structure": return auditFileStructure(project, input);
		case "stale-reference": return auditStaleReference(project, input);
		case "package": return auditPackage(project, input);
		case "security": return auditSecurity(project, input);
		case "generated-parity": return auditGeneratedParity(project, input);
		case "changed": return auditChanged(project, input);
		case "task": return auditTask(project, input);
	}
}

function mergeScope(project: WikiProject, input: CodewikiAuditInput, profileResults: AuditProfileResult[]): AuditScope {
	return {
		root: project.root,
		files: unique(profileResults.flatMap((result) => result.checked_scopes.files || [])).sort(),
		layers: unique([...(input.layers || []), ...profileResults.flatMap((result) => result.checked_scopes.layers || [])]).sort(),
		task_id: input.task_id,
		changed: input.changed || profileResults.some((result) => result.checked_scopes.changed),
	};
}

export async function executeCodewikiAudit(project: WikiProject, input: CodewikiAuditInput = {}): Promise<AuditReport> {
	const profiles = normalizeAuditProfiles(input);
	const profileResults: AuditProfileResult[] = [];
	for (const profile of profiles) {
		profileResults.push(await runProfile(project, profile, input));
	}
	const issues = profileResults.flatMap((result) => result.issues);
	const fingerprints = profileResults.flatMap((result) => result.fingerprints);
	return {
		kind: "audit_report",
		version: AUDIT_VERSION,
		generated_at: nowIso(),
		project: project.label,
		status: statusForIssues(issues),
		profiles,
		checked_scopes: mergeScope(project, input, profileResults),
		issues,
		evidence_refs: unique(profileResults.flatMap((result) => result.evidence_refs)).sort(),
		fingerprints,
		profile_results: profileResults,
	};
}

export function formatAuditReport(report: AuditReport): string {
	const lines = [
		`CodeWiki audit: ${report.status}`,
		`profiles: ${report.profiles.join(", ")}`,
		`issues: ${report.issues.length}`,
	];
	for (const result of report.profile_results) {
		lines.push(`- ${result.profile}: ${result.status} — ${result.summary}`);
	}
	for (const issue of report.issues.slice(0, 30)) {
		const path = issue.path ? ` ${issue.path}` : "";
		lines.push(`  [${issue.severity}] ${issue.profile}/${issue.kind}${path}: ${issue.message}`);
	}
	if (report.issues.length > 30) lines.push(`  … ${report.issues.length - 30} more issues`);
	return lines.join("\n");
}

export function explainAuditError(error: unknown): string {
	return `CodeWiki audit failed: ${formatError(error)}`;
}
