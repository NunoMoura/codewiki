import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import yaml from "js-yaml";
import type { WikiProject } from "../../project/types.ts";
import type { ParsedDoc } from "./doc-parser.ts";

export type DiagramRefCategory = "component" | "adapter" | "flow" | "domain_entity" | "lifecycle" | "policy" | "artifact" | "actor" | "external_system";
export type DiagramRefMode = "off" | "warn" | "error";

export interface ParsedDiagramRef {
	ref: string;
	aliases: string[];
	local_id: string;
	label: string;
	category: DiagramRefCategory;
	diagram_id: string;
	diagram_slug: string;
	diagram_path: string;
	raw_kind?: string;
	source?: string;
	requires_doc: boolean;
	metadata?: Record<string, unknown>;
}

export interface ParsedDiagramEdge {
	kind: string;
	from: string;
	to: string;
	label?: string;
	ref?: string;
	diagram_path: string;
}

export interface ParsedSystemDiagram {
	path: string;
	id: string;
	slug: string;
	title: string;
	kind: string;
	purpose: string;
	source_docs: string[];
	refs: ParsedDiagramRef[];
	edges: ParsedDiagramEdge[];
}

export interface SystemDiagramInventory {
	diagrams: ParsedSystemDiagram[];
	refs: ParsedDiagramRef[];
	ref_index: Record<string, string>;
	parse_issues: SystemDiagramValidationIssue[];
}

export interface SystemDiagramValidationIssue {
	severity: "warning" | "error";
	kind: string;
	path: string;
	message: string;
	refs?: string[];
}

export interface SystemDiagramValidationResult extends SystemDiagramInventory {
	mode: DiagramRefMode;
	system_docs_checked: number;
	required_refs: string[];
	docs_by_ref: Record<string, string[]>;
	issues: SystemDiagramValidationIssue[];
}

export const FILE_STRUCTURE_DRIFT_CATEGORY_VALUES = [
	"missing_expected_path",
	"unexpected_path",
	"ownership_mismatch",
	"deprecated_path_present",
	"generated_or_runtime_artifact_in_source_area",
	"approved_migration_delta",
	"compatibility_export_gap",
] as const;

export type FileStructureDriftCategory = (typeof FILE_STRUCTURE_DRIFT_CATEGORY_VALUES)[number];

export interface ParsedFileStructurePathRule {
	owner_id: string;
	owner_label: string;
	group: string;
	kind: string;
	status: string;
	source?: string;
	pattern: string;
	role: "current" | "target" | "intended";
	approved_delta: boolean;
}

export interface ParsedFileStructureMapNode {
	id: string;
	label: string;
	group: string;
	kind: string;
	status: string;
	source?: string;
	paths: string[];
	categories: FileStructureDriftCategory[];
	compatibility_exports: FileStructureCompatibilityExport[];
	metadata: Record<string, unknown>;
}

export interface FileStructureCompatibilityExport {
	path: string;
	target?: string;
	owner_id: string;
}

export interface ParsedFileStructureMap {
	path: string;
	id: string;
	title: string;
	categories: FileStructureDriftCategory[];
	nodes: ParsedFileStructureMapNode[];
	intended_path_rules: ParsedFileStructurePathRule[];
	current_path_rules: ParsedFileStructurePathRule[];
	target_path_rules: ParsedFileStructurePathRule[];
	approved_delta_edges: Array<{ from: string; to: string; label: string }>;
	parse_issues: SystemDiagramValidationIssue[];
}

export interface FileStructureDriftEntry {
	category: FileStructureDriftCategory;
	severity: "info" | "warning" | "error";
	path: string;
	message: string;
	owner_id?: string;
	owner_label?: string;
	refs?: string[];
}

export interface FileStructureDriftReport {
	version: 1;
	source: "file-structure-map";
	map_path: string;
	available: boolean;
	categories: FileStructureDriftCategory[];
	intended_path_rules: ParsedFileStructurePathRule[];
	current_path_rules: ParsedFileStructurePathRule[];
	target_path_rules: ParsedFileStructurePathRule[];
	approved_delta_edges: Array<{ from: string; to: string; label: string }>;
	entries: FileStructureDriftEntry[];
	counts: Record<FileStructureDriftCategory, number>;
	satisfied_deferred_triggers: string[];
	parse_issues: SystemDiagramValidationIssue[];
}

export interface FileStructureDriftGraphEvidence {
	version: 1;
	source: "file-structure-map";
	map_path: string;
	available: boolean;
	categories: FileStructureDriftCategory[];
	counts: Record<FileStructureDriftCategory, number>;
	intended_paths: Array<Pick<ParsedFileStructurePathRule, "pattern" | "owner_id" | "owner_label" | "group" | "status" | "role" | "approved_delta">>;
	current_paths: Array<Pick<ParsedFileStructurePathRule, "pattern" | "owner_id" | "owner_label" | "group" | "status" | "role" | "approved_delta">>;
	target_paths: Array<Pick<ParsedFileStructurePathRule, "pattern" | "owner_id" | "owner_label" | "group" | "status" | "role" | "approved_delta">>;
	approved_delta_edges: Array<{ from: string; to: string; label: string }>;
	approved_migration_deltas: FileStructureDriftEntry[];
	actionable_entries: FileStructureDriftEntry[];
	satisfied_deferred_triggers: string[];
	parse_issues: SystemDiagramValidationIssue[];
}

const FILE_STRUCTURE_MAP_FILE = "file-structure-map.yaml";
const SOURCE_AREA_PREFIXES = ["src/", "skills/", "tests/", "scripts/", ".codewiki/"];
const REPOSITORY_WALK_IGNORES = new Set([".git", "node_modules"]);
const DEFAULT_ROOT_ALLOWED_PATHS = [
	".gitignore",
	".pi/**",
	".pi-lens/**",
	"AGENTS.md",
	"LICENSE",
	"README.md",
	"package.json",
	"package-lock.json",
	"tsconfig.json",
	"src/*.ts",
	".codewiki/roadmap/archive.jsonl",
];
const DEPRECATED_PATH_PATTERNS = [
	".codewiki/index/**",
	".codewiki/evidence/**",
	".codewiki/kb/system/clients/**",
	".codewiki/kb/system/compilers/**",
	".codewiki/kb/system/components/**",
	".codewiki/kb/system/extensions/**",
	".codewiki/kb/system/flows/**",
	".codewiki/kb/system/runtime/**",
	".codewiki/kb/system/architecture.json",
	".codewiki/kb/system/v2-operating-model.md",
	"src/core/**",
	"src/engine/**",
	"src/infrastructure/**",
	"core/**",
	"engine/**",
	"infrastructure/**",
];

function fileStructureMapPath(project: WikiProject): string {
	return normalizeRel(join(project.docsRoot || ".codewiki/kb", "system", "diagrams", FILE_STRUCTURE_MAP_FILE));
}

function isDriftCategory(value: string): value is FileStructureDriftCategory {
	return (FILE_STRUCTURE_DRIFT_CATEGORY_VALUES as readonly string[]).includes(value);
}

function fileStructureCategories(value: unknown): FileStructureDriftCategory[] {
	const parsed = stringList(value).filter(isDriftCategory);
	return parsed.length ? Array.from(new Set(parsed)) : [...FILE_STRUCTURE_DRIFT_CATEGORY_VALUES];
}

function isRepositoryPathPattern(value: string): boolean {
	const pattern = normalizeRel(value);
	if (!pattern || /\s/.test(pattern)) return false;
	if (/^[a-z]+:/i.test(pattern)) return false;
	return pattern.includes("/") || pattern.startsWith(".") || DEFAULT_ROOT_ALLOWED_PATHS.includes(pattern);
}

function wildcardPatternToRegex(pattern: string): RegExp {
	const normalized = normalizeRel(pattern);
	let escaped = "";
	for (let i = 0; i < normalized.length; i += 1) {
		const char = normalized[i];
		if (char === "*" && normalized[i + 1] === "*") {
			escaped += ".*";
			i += 1;
		} else if (char === "*") {
			escaped += "[^/]*";
		} else {
			escaped += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
		}
	}
	return new RegExp(`^${escaped}$`);
}

function pathMatchesFileStructurePattern(path: string, pattern: string): boolean {
	const normalizedPath = normalizeRel(path);
	const normalizedPattern = normalizeRel(pattern);
	if (!normalizedPath || !normalizedPattern) return false;
	if (normalizedPattern.endsWith("/**")) {
		const prefix = normalizedPattern.slice(0, -3);
		return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
	}
	if (normalizedPattern.includes("*")) return wildcardPatternToRegex(normalizedPattern).test(normalizedPath);
	return normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`);
}

function treeHasPathPattern(paths: Set<string>, pattern: string): boolean {
	const normalizedPattern = normalizeRel(pattern);
	if (!normalizedPattern) return false;
	if (normalizedPattern.endsWith("/**")) {
		const prefix = normalizedPattern.slice(0, -3);
		return paths.has(prefix) || [...paths].some((path) => path.startsWith(`${prefix}/`));
	}
	if (normalizedPattern.includes("*")) return [...paths].some((path) => pathMatchesFileStructurePattern(path, normalizedPattern));
	return paths.has(normalizedPattern) || [...paths].some((path) => path.startsWith(`${normalizedPattern}/`));
}

function collectRepositoryStructurePaths(repoRoot: string): Set<string> {
	const out = new Set<string>();
	const walk = (absDir: string, relDir: string) => {
		if (!existsSync(absDir)) return;
		for (const entry of readdirSync(absDir, { withFileTypes: true })) {
			if (REPOSITORY_WALK_IGNORES.has(entry.name)) continue;
			const rel = normalizeRel(relDir ? `${relDir}/${entry.name}` : entry.name);
			out.add(rel);
			if (entry.isDirectory()) walk(resolve(repoRoot, rel), rel);
		}
	};
	walk(repoRoot, "");
	return out;
}

function compatibilityExports(raw: Record<string, unknown>, ownerId: string): FileStructureCompatibilityExport[] {
	const fields = [raw.compatibility_exports, raw.compatibilityExports, raw.compatibility_paths, raw.compatibilityPaths];
	const out: FileStructureCompatibilityExport[] = [];
	for (const field of fields) {
		if (Array.isArray(field)) {
			for (const item of field) {
				if (typeof item === "string") {
					const path = normalizeRel(item);
					if (path) out.push({ path, owner_id: ownerId });
				} else if (item && typeof item === "object" && !Array.isArray(item)) {
					const record = item as Record<string, unknown>;
					const path = normalizeRel(stringValue(record.path || record.from || record.export || record.compatibility_path));
					const target = normalizeRel(stringValue(record.target || record.to || record.target_path));
					if (path) out.push({ path, ...(target ? { target } : {}), owner_id: ownerId });
				}
			}
		}
	}
	return out;
}

function parseFileStructureMapNode(raw: Record<string, unknown>): ParsedFileStructureMapNode | null {
	const id = stringValue(raw.id);
	if (!id) return null;
	const categories = stringList(raw.categories).filter(isDriftCategory);
	const paths = stringList(raw.paths).map(normalizeRel).filter(isRepositoryPathPattern);
	return {
		id,
		label: stringValue(raw.label) || id,
		group: stringValue(raw.group),
		kind: stringValue(raw.kind),
		status: stringValue(raw.status),
		...(stringValue(raw.source) ? { source: stringValue(raw.source) } : {}),
		paths,
		categories,
		compatibility_exports: compatibilityExports(raw, id),
		metadata: Object.fromEntries(Object.entries(raw).filter(([key]) => !["id", "label", "group", "kind", "status", "source", "paths", "categories", "compatibility_exports", "compatibilityExports", "compatibility_paths", "compatibilityPaths"].includes(key))),
	};
}

function fileStructureRoleForNode(node: ParsedFileStructureMapNode): "current" | "target" | "intended" {
	const group = node.group.toLowerCase();
	const status = node.status.toLowerCase();
	if (group === "source_current" || status.includes("current")) return "current";
	if (group === "source_target" || status.includes("target")) return "target";
	return "intended";
}

function isApprovedDeltaNode(node: ParsedFileStructureMapNode, approvedNodeIds: Set<string>): boolean {
	const status = node.status.toLowerCase();
	return approvedNodeIds.has(node.id) || status === "accepted_target" || status === "current_valid_until_migrated";
}

function pathRulesForNodes(nodes: ParsedFileStructureMapNode[], approvedNodeIds: Set<string>): ParsedFileStructurePathRule[] {
	return nodes.flatMap((node) => {
		const role = fileStructureRoleForNode(node);
		const approved = isApprovedDeltaNode(node, approvedNodeIds);
		return node.paths.map((pattern) => ({
			owner_id: node.id,
			owner_label: node.label,
			group: node.group,
			kind: node.kind,
			status: node.status,
			...(node.source ? { source: node.source } : {}),
			pattern,
			role,
			approved_delta: approved,
		}));
	});
}

export function parseFileStructureMap(repoRoot: string, project: WikiProject): ParsedFileStructureMap {
	const relPath = fileStructureMapPath(project);
	const parseIssues: SystemDiagramValidationIssue[] = [];
	if (!existsSync(resolve(repoRoot, relPath))) {
		return {
			path: relPath,
			id: "",
			title: "",
			categories: [...FILE_STRUCTURE_DRIFT_CATEGORY_VALUES],
			nodes: [],
			intended_path_rules: [],
			current_path_rules: [],
			target_path_rules: [],
			approved_delta_edges: [],
			parse_issues: [],
		};
	}
	let loaded: unknown;
	try {
		loaded = yaml.load(readFileSync(resolve(repoRoot, relPath), "utf8"));
	} catch (error) {
		parseIssues.push({ severity: "error", kind: "file-structure-map-yaml-invalid", path: relPath, message: `Invalid file-structure map YAML: ${error instanceof Error ? error.message : String(error)}` });
		return {
			path: relPath,
			id: "",
			title: "",
			categories: [...FILE_STRUCTURE_DRIFT_CATEGORY_VALUES],
			nodes: [],
			intended_path_rules: [],
			current_path_rules: [],
			target_path_rules: [],
			approved_delta_edges: [],
			parse_issues: parseIssues,
		};
	}
	const data = plainObject(loaded);
	if (!data) {
		parseIssues.push({ severity: "error", kind: "file-structure-map-yaml-invalid", path: relPath, message: "File-structure map YAML must contain an object." });
		return {
			path: relPath,
			id: "",
			title: "",
			categories: [...FILE_STRUCTURE_DRIFT_CATEGORY_VALUES],
			nodes: [],
			intended_path_rules: [],
			current_path_rules: [],
			target_path_rules: [],
			approved_delta_edges: [],
			parse_issues: parseIssues,
		};
	}
	const nodes = objectList(data.nodes).map(parseFileStructureMapNode).filter((node): node is ParsedFileStructureMapNode => Boolean(node));
	const driftNodeCategories = nodes.flatMap((node) => node.categories);
	const approvedDeltaEdges = objectList(data.edges).map((edge) => ({
		from: stringValue(edge.from),
		to: stringValue(edge.to),
		label: stringValue(edge.label || edge.kind || edge.type),
	})).filter((edge) => edge.from && edge.to && /approved.*(?:migration|delta)|migration.*delta/i.test(edge.label));
	const approvedNodeIds = new Set(approvedDeltaEdges.flatMap((edge) => [edge.from, edge.to]));
	const allRules = pathRulesForNodes(nodes, approvedNodeIds);
	return {
		path: relPath,
		id: stringValue(data.id),
		title: stringValue(data.title),
		categories: driftNodeCategories.length ? Array.from(new Set(driftNodeCategories)) : fileStructureCategories(undefined),
		nodes,
		intended_path_rules: allRules,
		current_path_rules: allRules.filter((rule) => rule.role === "current"),
		target_path_rules: allRules.filter((rule) => rule.role === "target"),
		approved_delta_edges: approvedDeltaEdges,
		parse_issues: parseIssues,
	};
}

function defaultAllowedPathPatterns(project: WikiProject): string[] {
	return [
		...DEFAULT_ROOT_ALLOWED_PATHS,
		`${normalizeRel(project.docsRoot || ".codewiki/kb")}/**`,
		`${normalizeRel(project.researchRoot || ".codewiki/research")}/**`,
		`${normalizeRel(project.metaRoot || ".codewiki")}/gc/**`,
		`${normalizeRel(project.metaRoot || ".codewiki")}/runtime/**`,
		`${normalizeRel(project.metaRoot || ".codewiki")}/session/**`,
		`${normalizeRel(project.metaRoot || ".codewiki")}/builds/**`,
		`${normalizeRel(project.metaRoot || ".codewiki")}/validation/**`,
		`${normalizeRel(project.metaRoot || ".codewiki")}/roadmap/tasks/**`,
		`${normalizeRel(project.metaRoot || ".codewiki")}/index_graph.json`,
		`${normalizeRel(project.metaRoot || ".codewiki")}/config.json`,
		project.roadmapPath,
	].map(normalizeRel).filter(Boolean);
}

function countEntries(entries: FileStructureDriftEntry[]): Record<FileStructureDriftCategory, number> {
	const counts = Object.fromEntries(FILE_STRUCTURE_DRIFT_CATEGORY_VALUES.map((category) => [category, 0])) as Record<FileStructureDriftCategory, number>;
	for (const entry of entries) counts[entry.category] += 1;
	return counts;
}

function compactPathRule(rule: ParsedFileStructurePathRule): Pick<ParsedFileStructurePathRule, "pattern" | "owner_id" | "owner_label" | "group" | "status" | "role" | "approved_delta"> {
	return {
		pattern: rule.pattern,
		owner_id: rule.owner_id,
		owner_label: rule.owner_label,
		group: rule.group,
		status: rule.status,
		role: rule.role,
		approved_delta: rule.approved_delta,
	};
}

function isSatisfiedTriggerState(value: unknown): boolean {
	const normalized = stringValue(value).toLowerCase();
	return Boolean(normalized && normalized.includes("satisfied") && !normalized.includes("not_satisfied") && !normalized.includes("not satisfied") && !normalized.includes("unsatisfied"));
}

function satisfiedDeferredTriggerRefs(nodes: ParsedFileStructureMapNode[]): string[] {
	return Array.from(new Set(nodes.filter((node) => {
		const triggerState = node.metadata.trigger_state ?? node.metadata.triggerState ?? node.metadata.defer_status ?? node.metadata.deferStatus ?? node.status;
		return isSatisfiedTriggerState(triggerState);
	}).flatMap((node) => [
		node.id,
		`file-structure-map:${node.id}`,
		node.label,
		stringValue(node.metadata.trigger),
		stringValue(node.metadata.trigger_state ?? node.metadata.triggerState),
		stringValue(node.metadata.defer_status ?? node.metadata.deferStatus),
	]).map((value) => stringValue(value)).filter(Boolean)));
}

export function fileStructureSatisfiedDeferredTriggerRefs(repoRoot: string, project: WikiProject): string[] {
	return satisfiedDeferredTriggerRefs(parseFileStructureMap(repoRoot, project).nodes);
}

export function compactFileStructureDriftReport(report: FileStructureDriftReport): FileStructureDriftGraphEvidence {
	return {
		version: 1,
		source: report.source,
		map_path: report.map_path,
		available: report.available,
		categories: report.categories,
		counts: report.counts,
		intended_paths: report.intended_path_rules.map(compactPathRule),
		current_paths: report.current_path_rules.map(compactPathRule),
		target_paths: report.target_path_rules.map(compactPathRule),
		approved_delta_edges: report.approved_delta_edges,
		approved_migration_deltas: report.entries.filter((entry) => entry.category === "approved_migration_delta"),
		actionable_entries: report.entries.filter((entry) => entry.category !== "approved_migration_delta"),
		satisfied_deferred_triggers: report.satisfied_deferred_triggers,
		parse_issues: report.parse_issues,
	};
}

function isManagedStructurePath(path: string): boolean {
	return SOURCE_AREA_PREFIXES.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix));
}

function isParentOfKnownFileStructurePattern(path: string, patterns: string[]): boolean {
	const normalizedPath = normalizeRel(path);
	if (!normalizedPath) return false;
	return patterns.some((pattern) => {
		const normalizedPattern = normalizeRel(pattern).replace(/\/\*\*$/, "").replace(/\/\*$/, "");
		return normalizedPattern.startsWith(`${normalizedPath}/`);
	});
}

function generatedRuntimeSourcePathKind(path: string): string | null {
	if (!path.startsWith("src/")) return null;
	if (path.includes("/.codewiki/") || path.endsWith("/.codewiki")) return ".codewiki artifact nested under src";
	if (path.endsWith("/index_graph.json") || path === "src/index_graph.json") return "generated graph artifact under src";
	if (path.startsWith("src/runtime/") || path.includes("/runtime/.codewiki/") || path.endsWith("/session/queue.json")) return "runtime/session artifact under src";
	return null;
}

function pushDriftEntry(entries: FileStructureDriftEntry[], entry: FileStructureDriftEntry): void {
	const key = `${entry.category}:${entry.path}:${entry.owner_id || ""}:${entry.message}`;
	if (!entries.some((candidate) => `${candidate.category}:${candidate.path}:${candidate.owner_id || ""}:${candidate.message}` === key)) entries.push(entry);
}

export function buildFileStructureDriftReport(repoRoot: string, project: WikiProject): FileStructureDriftReport {
	const map = parseFileStructureMap(repoRoot, project);
	const entries: FileStructureDriftEntry[] = [];
	const treePaths = collectRepositoryStructurePaths(repoRoot);
	if (!map.id && map.parse_issues.length === 0) {
		return {
			version: 1,
			source: "file-structure-map",
			map_path: map.path,
			available: false,
			categories: map.categories,
			intended_path_rules: [],
			current_path_rules: [],
			target_path_rules: [],
			approved_delta_edges: [],
			entries: [],
			counts: countEntries([]),
			satisfied_deferred_triggers: [],
			parse_issues: [],
		};
	}
	const knownPatterns = [...map.intended_path_rules.map((rule) => rule.pattern), ...defaultAllowedPathPatterns(project)];
	for (const rule of map.intended_path_rules) {
		const exists = treeHasPathPattern(treePaths, rule.pattern);
		if (!exists && rule.approved_delta) {
			pushDriftEntry(entries, {
				category: "approved_migration_delta",
				severity: "info",
				path: rule.pattern,
				owner_id: rule.owner_id,
				owner_label: rule.owner_label,
				refs: [map.path, ...(rule.source ? [rule.source] : [])],
				message: `${rule.pattern} is an accepted target path not yet present; migration delta is approved by file-structure map.`,
			});
			continue;
		}
		if (!exists && !rule.approved_delta) {
			pushDriftEntry(entries, {
				category: "missing_expected_path",
				severity: "warning",
				path: rule.pattern,
				owner_id: rule.owner_id,
				owner_label: rule.owner_label,
				refs: [map.path, ...(rule.source ? [rule.source] : [])],
				message: `${rule.pattern} is expected by ${rule.owner_label} but is absent from the repository tree.`,
			});
		} else if (exists && rule.approved_delta && rule.role === "current") {
			pushDriftEntry(entries, {
				category: "approved_migration_delta",
				severity: "info",
				path: rule.pattern,
				owner_id: rule.owner_id,
				owner_label: rule.owner_label,
				refs: [map.path, ...(rule.source ? [rule.source] : [])],
				message: `${rule.pattern} remains current-valid until concept-root migration lands.`,
			});
		}
	}
	for (const pattern of DEPRECATED_PATH_PATTERNS) {
		if (!treeHasPathPattern(treePaths, pattern)) continue;
		pushDriftEntry(entries, {
			category: "deprecated_path_present",
			severity: "error",
			path: pattern,
			refs: [map.path, ".codewiki/kb/system/file-structure.md"],
			message: `${pattern} is deprecated by the file-structure contract and must not be recreated.`,
		});
	}
	for (const path of [...treePaths].sort()) {
		if (!isManagedStructurePath(path)) continue;
		const generatedKind = generatedRuntimeSourcePathKind(path);
		if (generatedKind) {
			pushDriftEntry(entries, {
				category: "generated_or_runtime_artifact_in_source_area",
				severity: "error",
				path,
				refs: [map.path],
				message: `${path} is a ${generatedKind}; generated/runtime artifacts must stay out of package source areas.`,
			});
		}
		if (!knownPatterns.some((pattern) => pathMatchesFileStructurePattern(path, pattern)) && !isParentOfKnownFileStructurePattern(path, knownPatterns)) {
			pushDriftEntry(entries, {
				category: "unexpected_path",
				severity: "warning",
				path,
				refs: [map.path],
				message: `${path} is inside a managed structure area but is not covered by the file-structure map.`,
			});
		}
		if (!path.startsWith("src/")) continue;
		const strictOwners = map.intended_path_rules.filter((rule) => rule.pattern.startsWith("src/") && !rule.approved_delta && pathMatchesFileStructurePattern(path, rule.pattern));
		const ownerIds = Array.from(new Set(strictOwners.map((rule) => rule.owner_id)));
		if (ownerIds.length > 1) {
			pushDriftEntry(entries, {
				category: "ownership_mismatch",
				severity: "warning",
				path,
				refs: [map.path, ...strictOwners.flatMap((rule) => rule.source ? [rule.source] : [])],
				message: `${path} matches multiple strict file-structure owners: ${ownerIds.join(", ")}.`,
			});
		}
	}
	for (const node of map.nodes) {
		for (const exportRef of node.compatibility_exports) {
			if (!treeHasPathPattern(treePaths, exportRef.path)) {
				pushDriftEntry(entries, {
					category: "compatibility_export_gap",
					severity: "warning",
					path: exportRef.path,
					owner_id: exportRef.owner_id,
					owner_label: node.label,
					refs: [map.path, ...(exportRef.target ? [exportRef.target] : [])],
					message: `${exportRef.path} compatibility export is required by ${node.label} but is absent.`,
				});
			}
		}
	}
	const sortedEntries = entries.sort((a, b) => `${a.category}:${a.path}:${a.owner_id || ""}`.localeCompare(`${b.category}:${b.path}:${b.owner_id || ""}`));
	return {
		version: 1,
		source: "file-structure-map",
		map_path: map.path,
		available: true,
		categories: map.categories,
		intended_path_rules: map.intended_path_rules,
		current_path_rules: map.current_path_rules,
		target_path_rules: map.target_path_rules,
		approved_delta_edges: map.approved_delta_edges,
		entries: sortedEntries,
		counts: countEntries(sortedEntries),
		satisfied_deferred_triggers: satisfiedDeferredTriggerRefs(map.nodes),
		parse_issues: map.parse_issues,
	};
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim();
}

function stringList(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(stringValue).filter(Boolean);
	const single = stringValue(value);
	return single ? [single] : [];
}

function objectList(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function plainObject(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeRel(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function slugForPath(path: string): string {
	const name = basename(path, extname(path));
	return name.trim();
}

function safeId(value: string): string {
	return value.trim().replace(/[^A-Za-z0-9_.:-]+/g, "_").replace(/^_+|_+$/g, "");
}

function localIdFromEdge(raw: Record<string, unknown>, index: number): string {
	const explicit = stringValue(raw.id);
	if (explicit) return explicit;
	const from = safeId(stringValue(raw.from));
	const to = safeId(stringValue(raw.to));
	if (from && to) return `${from}_to_${to}`;
	return `flow_${index + 1}`;
}

function classifyComponentKind(rawKind: string, raw: Record<string, unknown>): DiagramRefCategory {
	const kind = rawKind.toLowerCase();
	const boundary = stringValue(raw.boundary).toLowerCase();
	if (kind === "adapter") return "adapter";
	if (kind === "actor" || kind === "user") return "actor";
	if (boundary === "external" || kind === "external" || kind === "external_system") return "external_system";
	if (["entity", "domain", "domain_entity"].includes(kind)) return "domain_entity";
	if (["state", "lifecycle"].includes(kind)) return "lifecycle";
	if (["policy", "boundary", "policy_boundary", "gate"].includes(kind)) return "policy";
	if (["artifact", "build", "handoff_truth", "durable_truth", "generated_state", "executable_truth", "publication", "work_truth", "evidence"].includes(kind)) return "artifact";
	return "component";
}

function addUnique<T>(items: T[], item: T, key: (value: T) => string): void {
	const itemKey = key(item);
	if (!items.some((candidate) => key(candidate) === itemKey)) items.push(item);
}

function refAliases(diagramSlug: string, diagramId: string, localId: string): string[] {
	return Array.from(new Set([
		`${diagramSlug}:${localId}`,
		`${diagramId}:${localId}`,
		`${diagramSlug}.${localId}`,
		`${diagramId}.${localId}`,
	].filter(Boolean)));
}

function createDiagramRef(diagram: { slug: string; id: string; path: string }, raw: Record<string, unknown>, category: DiagramRefCategory, localId: string): ParsedDiagramRef | null {
	const id = stringValue(localId);
	if (!id) return null;
	const rawKind = stringValue(raw.kind);
	return {
		ref: `${diagram.slug}:${id}`,
		aliases: refAliases(diagram.slug, diagram.id, id),
		local_id: id,
		label: stringValue(raw.label) || id,
		category,
		diagram_id: diagram.id,
		diagram_slug: diagram.slug,
		diagram_path: diagram.path,
		...(rawKind ? { raw_kind: rawKind } : {}),
		...(stringValue(raw.source) ? { source: stringValue(raw.source) } : {}),
		requires_doc: raw.requires_doc === true || raw.requiresDoc === true,
		metadata: Object.fromEntries(Object.entries(raw).filter(([key]) => !["id", "label", "kind", "source", "requires_doc", "requiresDoc"].includes(key))),
	};
}

function addRef(refs: ParsedDiagramRef[], issues: SystemDiagramValidationIssue[], ref: ParsedDiagramRef | null): void {
	if (!ref) return;
	const duplicate = refs.find((candidate) => candidate.ref === ref.ref);
	if (duplicate) {
		issues.push({
			severity: "error",
			kind: "diagram-duplicate-ref",
			path: ref.diagram_path,
			message: `Duplicate diagram ref: ${ref.ref}`,
			refs: [ref.ref],
		});
		return;
	}
	refs.push(ref);
}

function diagramEdges(diagramPath: string, rawEdges: Record<string, unknown>[], kind: string): ParsedDiagramEdge[] {
	return rawEdges.map((edge, index) => {
		const from = stringValue(edge.from);
		const to = stringValue(edge.to);
		const ref = stringValue(edge.id) || localIdFromEdge(edge, index);
		return {
			kind,
			from,
			to,
			...(stringValue(edge.label || edge.message || edge.type || edge.trigger) ? { label: stringValue(edge.label || edge.message || edge.type || edge.trigger) } : {}),
			...(ref ? { ref } : {}),
			diagram_path: diagramPath,
		};
	}).filter((edge) => edge.from && edge.to);
}

function parseDiagramFile(repoRoot: string, relPath: string): { diagram?: ParsedSystemDiagram; issues: SystemDiagramValidationIssue[] } {
	const issues: SystemDiagramValidationIssue[] = [];
	const rawText = readFileSync(resolve(repoRoot, relPath), "utf8");
	let loaded: unknown;
	try {
		loaded = yaml.load(rawText);
	} catch (error) {
		issues.push({ severity: "error", kind: "diagram-yaml-invalid", path: relPath, message: `Invalid system diagram YAML: ${error instanceof Error ? error.message : String(error)}` });
		return { issues };
	}
	const data = plainObject(loaded);
	if (!data) {
		issues.push({ severity: "error", kind: "diagram-yaml-invalid", path: relPath, message: "System diagram YAML must contain an object." });
		return { issues };
	}
	const slug = slugForPath(relPath);
	const id = stringValue(data.id) || slug;
	const diagram = { slug, id, path: relPath };
	const refs: ParsedDiagramRef[] = [];
	const collectionIssues: SystemDiagramValidationIssue[] = [];
	const addCollection = (value: unknown, category: DiagramRefCategory, idField = "id") => {
		for (const item of objectList(value)) addRef(refs, collectionIssues, createDiagramRef(diagram, item, category, stringValue(item[idField])));
	};

	addCollection(data.actors, "actor");
	addCollection(data.external_systems, "external_system");
	addCollection(data.policies, "policy");
	addCollection(data.policy_boundaries, "policy");
	addCollection(data.boundaries, "policy");
	addCollection(data.artifacts, "artifact");
	addCollection(data.entities, "domain_entity");
	addCollection(data.states, "lifecycle");
	addCollection(data.lifecycles, "lifecycle");
	addCollection(data.components, "component");
	addCollection(data.adapters, "adapter");
	addCollection(data.flows, "flow");

	for (const item of objectList(data.systems)) {
		addRef(refs, collectionIssues, createDiagramRef(diagram, item, classifyComponentKind(stringValue(item.kind), item), stringValue(item.id)));
	}
	for (const item of objectList(data.nodes)) {
		addRef(refs, collectionIssues, createDiagramRef(diagram, item, classifyComponentKind(stringValue(item.kind), item), stringValue(item.id)));
	}
	for (const item of objectList(data.participants)) {
		addRef(refs, collectionIssues, createDiagramRef(diagram, item, classifyComponentKind(stringValue(item.kind), item), stringValue(item.id)));
	}

	const flowCollections: Array<[unknown, string]> = [
		[data.edges, "edge"],
		[data.relationships, "relationship"],
		[data.steps, "step"],
		[data.transitions, "transition"],
	];
	const edges: ParsedDiagramEdge[] = [];
	for (const [collection, kind] of flowCollections) {
		const items = objectList(collection);
		for (const item of items) {
			const ref = createDiagramRef(diagram, item, "flow", localIdFromEdge(item, refs.length));
			addRef(refs, collectionIssues, ref);
		}
		edges.push(...diagramEdges(relPath, items, kind));
	}

	return {
		diagram: {
			path: relPath,
			id,
			slug,
			title: stringValue(data.title) || id,
			kind: stringValue(data.kind) || "diagram",
			purpose: stringValue(data.purpose),
			source_docs: stringList(data.source_docs),
			refs,
			edges,
		},
		issues: [...issues, ...collectionIssues],
	};
}

function diagramRoot(project: WikiProject): string {
	return normalizeRel(join(project.docsRoot || ".codewiki/kb", "system", "diagrams"));
}

function collectDiagramFiles(repoRoot: string, rootRel: string): string[] {
	const rootAbs = resolve(repoRoot, rootRel);
	if (!existsSync(rootAbs)) return [];
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const name of readdirSync(dir)) {
			const abs = resolve(dir, name);
			if (statSync(abs).isDirectory()) walk(abs);
			else if (/\.ya?ml$/i.test(name)) out.push(normalizeRel(relative(repoRoot, abs)));
		}
	};
	walk(rootAbs);
	return out.sort();
}

export function parseSystemDiagrams(repoRoot: string, project: WikiProject): SystemDiagramInventory {
	const diagrams: ParsedSystemDiagram[] = [];
	const parseIssues: SystemDiagramValidationIssue[] = [];
	for (const relPath of collectDiagramFiles(repoRoot, diagramRoot(project))) {
		const parsed = parseDiagramFile(repoRoot, relPath);
		if (parsed.diagram) diagrams.push(parsed.diagram);
		parseIssues.push(...parsed.issues);
	}
	const refs = diagrams.flatMap((diagram) => diagram.refs);
	const refIndex: Record<string, string> = {};
	for (const ref of refs) {
		for (const alias of ref.aliases) refIndex[alias] = ref.ref;
	}
	return { diagrams, refs, ref_index: refIndex, parse_issues: parseIssues };
}

export function resolveDiagramRef(ref: string, inventory: Pick<SystemDiagramInventory, "ref_index">): string | null {
	const normalized = stringValue(ref);
	return normalized ? inventory.ref_index[normalized] || null : null;
}

export function diagramRefMode(project: WikiProject): DiagramRefMode {
	const raw = stringValue(
		project.config?.codewiki?.system_diagrams?.diagram_refs?.mode ??
		project.config?.codewiki?.diagram_refs?.mode ??
		project.config?.lint?.diagram_refs_mode,
	).toLowerCase();
	if (["warn", "warning", "migration"].includes(raw)) return "warn";
	if (["error", "enforce", "required", "hard"].includes(raw)) return "error";
	return "off";
}

function modeSeverity(mode: DiagramRefMode, fallback: "warning" | "error" = "warning"): "warning" | "error" {
	if (mode === "error") return "error";
	if (mode === "warn") return "warning";
	return fallback;
}

function isSystemDoc(project: WikiProject, doc: ParsedDoc): boolean {
	const systemRoot = normalizeRel(join(project.docsRoot || ".codewiki/kb", "system"));
	const path = normalizeRel(doc.path);
	return path.startsWith(`${systemRoot}/`) && path.endsWith(".md");
}

function isDiagramRefExemptDoc(project: WikiProject, doc: ParsedDoc): boolean {
	const docsRoot = normalizeRel(project.docsRoot || ".codewiki/kb");
	const path = normalizeRel(doc.path);
	return path === `${docsRoot}/system/overview.md` || path === `${docsRoot}/system/diagrams/README.md` || path.startsWith(`${docsRoot}/system/diagrams/`) || path.endsWith("/overview.md");
}

export function validateSystemDiagramRefs(repoRoot: string, project: WikiProject, docs: ParsedDoc[]): SystemDiagramValidationResult {
	const inventory = parseSystemDiagrams(repoRoot, project);
	const mode = diagramRefMode(project);
	const issues: SystemDiagramValidationIssue[] = [...inventory.parse_issues];
	const docsByRef = new Map<string, string[]>();
	let systemDocsChecked = 0;

	for (const doc of docs.filter((entry) => isSystemDoc(project, entry) && !isDiagramRefExemptDoc(project, entry))) {
		systemDocsChecked += 1;
		const refs = stringList(doc.frontmatter.diagram_refs);
		if (refs.length === 0) {
			if (mode !== "off") {
				issues.push({
					severity: modeSeverity(mode),
					kind: "system-doc-missing-diagram-refs",
					path: doc.path,
					message: "System doc must declare at least one diagram_refs entry while diagram-ref migration is enabled.",
				});
			}
			continue;
		}
		for (const ref of refs) {
			const target = resolveDiagramRef(ref, inventory);
			if (!target) {
				issues.push({
					severity: modeSeverity(mode),
					kind: "diagram-ref-target-missing",
					path: doc.path,
					message: `diagram_refs entry does not match any system diagram node: ${ref}`,
					refs: [ref],
				});
				continue;
			}
			if (!docsByRef.has(target)) docsByRef.set(target, []);
			addUnique(docsByRef.get(target)!, doc.path, (value) => value);
		}
	}

	const requiredRefs: string[] = [];
	if (mode !== "off") {
		for (const ref of inventory.refs.filter((entry) => entry.requires_doc)) {
			requiredRefs.push(ref.ref);
			if ((docsByRef.get(ref.ref) || []).length > 0) continue;
			issues.push({
				severity: modeSeverity(mode),
				kind: "diagram-node-missing-required-doc",
				path: ref.diagram_path,
				message: `Diagram node ${ref.ref} sets requires_doc but no system doc declares it in diagram_refs.`,
				refs: [ref.ref],
			});
		}
	}

	return {
		...inventory,
		mode,
		system_docs_checked: systemDocsChecked,
		required_refs: requiredRefs.sort(),
		docs_by_ref: Object.fromEntries([...docsByRef.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, value.sort()])),
		issues,
	};
}
