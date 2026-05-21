import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import yaml from "js-yaml";
import type { WikiProject } from "../../domain/project/types.ts";
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
