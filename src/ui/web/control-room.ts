import { readFile, readdir } from "node:fs/promises";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { basename, relative, resolve } from "node:path";
import { load as loadYaml } from "js-yaml";
import type { WikiProject } from "../../project/types.ts";
import {
	maybeReadGraph,
	maybeReadRoadmapState,
	maybeReadStatusState,
} from "../../state/artifacts.ts";
import {
	maybeReadJson,
	pathExists,
	readText,
} from "../../project/local/filesystem.ts";

const nodeRequire = createRequire(import.meta.url);
let cytoscapeAssetCache: Promise<string> | null = null;

export interface ControlRoomServerOptions {
	host?: string;
	port?: number;
}

export interface ControlRoomServerHandle {
	host: string;
	port: number;
	url: string;
	close(): Promise<void>;
}

export interface ControlRoomStateModel {
	project: {
		label: string;
		root: string;
	};
	health: {
		color: string;
		errors: number;
		warnings: number;
		total: number;
	};
	roadmap: {
		open: number;
		done: number;
		blocked: number;
		next: string | null;
		focused: string | null;
	};
	claims: {
		active: number;
		warnings: number;
		conflicts: number;
	};
	graph: {
		generated_at: string | null;
		nodes: number;
		edges: number;
		stale: number;
		drift: number;
	};
	gates: {
		blocked: number;
		validation: number;
	};
	file_structure: ControlRoomFileStructureModel | null;
	latest_signal: string | null;
	next_action: {
		kind: string;
		summary: string;
		command: string | null;
	};
}

export interface ControlRoomFileStructureModel {
	available: boolean;
	source: string;
	map_path: string | null;
	source_refs: string[];
	categories: string[];
	counts: Record<string, number>;
	path_rule_counts: {
		intended: number;
		current: number;
		target: number;
	};
	intended_paths: ControlRoomFileStructurePathRule[];
	current_paths: ControlRoomFileStructurePathRule[];
	target_paths: ControlRoomFileStructurePathRule[];
	approved_delta_edges: Array<{ from: string; to: string; label: string }>;
	approved_migration_deltas: ControlRoomFileStructureEntry[];
	actionable_entries: ControlRoomFileStructureEntry[];
	parse_issues: unknown[];
}

export interface ControlRoomFileStructurePathRule {
	pattern: string;
	owner_id: string | null;
	owner_label: string | null;
	group: string | null;
	status: string | null;
	role: string | null;
	approved_delta: boolean;
	refs: string[];
}

export interface ControlRoomFileStructureEntry {
	category: string;
	severity: string;
	path: string;
	message: string;
	owner_id: string | null;
	owner_label: string | null;
	refs: string[];
}

export interface ControlRoomProductModel {
	categories: Array<{
		id: "users" | "stories" | "uis";
		label: string;
		summary: string;
		items: ControlRoomProductItem[];
	}>;
}

export interface ControlRoomProductItem {
	id: string;
	path: string;
	title: string;
	summary: string;
	state: string | null;
	updated: string | null;
	sections: Array<{ title: string; body: string }>;
}

export interface ControlRoomBoardModel {
	stats: {
		open: number;
		done: number;
		blocked: number;
	};
	active_sprints: Array<{
		id: string;
		title: string;
		status: string;
		task_ids: string[];
		open_task_ids: string[];
	}>;
	tasks: Array<{
		id: string;
		title: string;
		status: string;
		priority: string;
		summary: string;
		acceptance: string[];
		verification: string[];
		spec_paths: string[];
		code_paths: string[];
	}>;
}

export interface ControlRoomSystemModel {
	architecture_path: string;
	source: string;
	diagram_catalog: ControlRoomSystemDiagramSummary[];
	diagrams: ControlRoomSystemDiagram[];
	components: ControlRoomSystemComponent[];
	edges: Array<{ from: string; to: string; kind: string; label?: string }>;
}

export interface ControlRoomSystemDiagramSummary {
	id: string;
	title: string;
	kind: string;
	path: string;
	purpose: string;
}

export interface ControlRoomSystemDiagram
	extends ControlRoomSystemDiagramSummary {
	source_docs: string[];
	nodes: ControlRoomSystemDiagramNode[];
	edges: ControlRoomSystemDiagramEdge[];
	raw: unknown;
}

export interface ControlRoomSystemDiagramNode {
	id: string;
	label: string;
	kind: string;
	doc_path: string | null;
	summary: string;
	raw?: unknown;
}

export interface ControlRoomSystemDiagramEdge {
	from: string;
	to: string;
	kind: string;
	label: string;
	raw?: unknown;
}

export interface ControlRoomSystemComponent {
	id: string;
	label: string;
	doc_path: string | null;
	kind: "component" | "artifact";
	title: string;
	summary: string;
	state: string | null;
	updated: string | null;
	sections: Array<{ title: string; body: string }>;
}

export interface ControlRoomGraphModel {
	generated_at: string | null;
	stats: {
		total_nodes: number;
		total_edges: number;
		shown_nodes: number;
		shown_edges: number;
		hidden_cold_nodes: number;
		hidden_cold_edges: number;
		truncated: boolean;
	};
	node_kinds: string[];
	edge_kinds: string[];
	nodes: Array<Record<string, unknown>>;
	edges: Array<Record<string, unknown>>;
}

export interface ControlRoomSettingsModel {
	source_path: string;
	groups: Array<{
		id: string;
		label: string;
		summary: string;
		rows: ControlRoomSettingsRow[];
	}>;
}

export interface ControlRoomSettingsRow {
	path: string;
	value: string;
	category: string;
	purpose: string;
	source_path: string;
	editability: "read-only" | "safe-edit" | "policy-gated";
}

export async function startControlRoomServer(
	project: WikiProject,
	options: ControlRoomServerOptions = {},
): Promise<ControlRoomServerHandle> {
	const host = options.host ?? "127.0.0.1";
	const requestedPort = options.port ?? 0;
	const server = createServer((req, res) => {
		void handleControlRoomRequest(project, req, res);
	});

	await new Promise<void>((accept, reject) => {
		const onError = (error: Error) => reject(error);
		server.once("error", onError);
		server.listen(requestedPort, host, () => {
			server.off("error", onError);
			accept();
		});
	});

	const address = server.address() as AddressInfo;
	const port = address.port;
	return {
		host,
		port,
		url: `http://${host}:${port}/`,
		close: () =>
			new Promise<void>((accept, reject) => {
				server.close((error) => {
					if (error) reject(error);
					else accept();
				});
			}),
	};
}

export async function buildControlRoomStateModel(
	project: WikiProject,
): Promise<ControlRoomStateModel> {
	const graph = (await maybeReadGraph(project.graphPath)) as any;
	const status = (await maybeReadStatusState(project.statusStatePath)) as any;
	const roadmapState = (await maybeReadRoadmapState(
		project.roadmapStatePath,
	)) as any;
	const rawRoadmap = await maybeReadJson<any>(
		resolve(project.root, project.roadmapPath),
	);
	const roadmap = roadmapState?.tasks
		? roadmapState
		: rawRoadmap?.tasks
			? rawRoadmap
			: (graph?.lenses?.roadmap ?? graph?.views?.roadmap ?? null);
	const lint = graph?.lenses?.lint ?? graph?.lint ?? null;
	const health = status?.health ?? lint?.summary ?? graph?.views?.health ?? {};
	const issueCounts = status?.issue_counts ?? health ?? {};
	const roadmapSummary = status?.roadmap ?? roadmap?.summary ?? roadmap ?? {};
	const nextAction =
		status?.next_action ?? graph?.views?.reconciliation?.next_action ?? {};
	const claims =
		status?.claims ??
		graph?.views?.coordination?.claims ??
		graph?.views?.coordination ??
		{};
	const reconciliationItems = graph?.views?.reconciliation?.items ?? [];
	const defaultLens = graph?.views?.lenses?.default ?? null;
	const defaultLensFamilies = Array.isArray(defaultLens?.families)
		? defaultLens.families
		: [];
	const graphNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
	const visibleGraphNodes = graphNodes.filter(isDefaultGraphNodeVisible);
	const visibleGraphNodeIds = new Set<string>(
		visibleGraphNodes.map((node: any) => String(node.id ?? "")),
	);
	const validationNodes = visibleGraphNodes.filter((node: any) =>
		String(node.kind ?? "").includes("validation"),
	);
	const latestValidation = validationNodes.at(-1);
	const openTasks = Object.values(roadmap?.tasks ?? {}).filter((task: any) =>
		isOpenTaskStatus(task?.status),
	);
	const blockedTasks = openTasks.filter(
		(task: any) =>
			String(task?.status ?? "") === "blocked" || task?.blocked === true,
	);
	const fileStructure = buildControlRoomFileStructureModel(
		graph?.views?.file_structure ??
			status?.file_structure ??
			graph?.views?.lenses?.audit?.file_structure_drift ??
			null,
	);

	return {
		project: {
			label: project.label,
			root: project.root,
		},
		health: {
			color: String(
				health.color ??
					(issueCounts.errors
						? "red"
						: issueCounts.warnings
							? "yellow"
							: "green"),
			),
			errors: numberFrom(issueCounts.errors ?? health.errors),
			warnings: numberFrom(issueCounts.warnings ?? health.warnings),
			total: numberFrom(
				issueCounts.total ?? health.total_issues ?? health.total,
			),
		},
		roadmap: {
			open: numberFrom(
				roadmapSummary.open_task_count ??
					roadmapSummary.open ??
					roadmap?.summary?.open_count ??
					roadmap?.open_task_count ??
					openTasks.length,
			),
			done: numberFrom(
				roadmapSummary.done_task_count ??
					roadmapSummary.done ??
					roadmap?.summary?.status_counts?.done ??
					status?.summary?.done_task_count,
			),
			blocked: numberFrom(
				roadmapSummary.blocked_task_count ??
					roadmapSummary.blocked ??
					roadmap?.summary?.status_counts?.blocked ??
					blockedTasks.length,
			),
			next: stringOrNull(
				roadmapSummary.next_task_id ??
					roadmapSummary.next ??
					roadmap?.next_task_id,
			),
			focused: stringOrNull(
				roadmapSummary.focused_task_id ?? status?.resume?.task_id,
			),
		},
		claims: {
			active: numberFrom(
				claims.active_claim_count ??
					claims.active ??
					status?.active_claim_count,
			),
			warnings: numberFrom(
				claims.warning_count ?? claims.warnings ?? status?.claim_warning_count,
			),
			conflicts: numberFrom(
				claims.conflict_count ??
					claims.conflicts ??
					status?.claim_conflict_count,
			),
		},
		graph: {
			generated_at: stringOrNull(graph?.generated_at),
			nodes: defaultLensFamilies.length || visibleGraphNodes.length,
			edges: defaultLensFamilies.length
				? Math.max(0, defaultLensFamilies.length - 1)
				: Array.isArray(graph?.edges)
					? graph.edges.filter((edge: any) =>
							isDefaultGraphEdgeVisible(edge, visibleGraphNodeIds),
						).length
					: 0,
			stale: Array.isArray(graph?.lenses?.freshness?.issues)
				? graph.lenses.freshness.issues.length
				: numberFrom(status?.summary?.stale_count),
			drift: Array.isArray(reconciliationItems)
				? reconciliationItems.length
				: numberFrom(status?.summary?.drift_count),
		},
		gates: {
			blocked: blockedTasks.length,
			validation: validationNodes.length,
		},
		file_structure: fileStructure,
		latest_signal: stringOrNull(
			latestValidation?.title ??
				latestValidation?.path ??
				status?.latest_validation?.summary ??
				status?.checks?.latest,
		),
		next_action: {
			kind: String(nextAction.kind ?? nextAction.type ?? "observe"),
			summary: String(
				nextAction.summary ??
					nextAction.reason ??
					nextAction.label ??
					"Inspect CodeWiki state.",
			),
			command: stringOrNull(nextAction.command),
		},
	};
}

function buildControlRoomFileStructureModel(
	raw: any,
): ControlRoomFileStructureModel | null {
	if (!raw || typeof raw !== "object") return null;
	const mapPath = stringOrNull(raw.map_path);
	const approvedEntries = normalizeFileStructureEntries(
		raw.approved_migration_deltas,
		mapPath,
	);
	const actionableEntries = normalizeFileStructureEntries(
		raw.actionable_entries,
		mapPath,
	);
	const parseIssues = Array.isArray(raw.parse_issues) ? raw.parse_issues : [];
	const sourceRefs = fileStructureSourceRefs(raw, mapPath, [
		...approvedEntries,
		...actionableEntries,
	]);
	return {
		available: raw.available !== false,
		source: String(raw.source ?? "file-structure-map"),
		map_path: mapPath,
		source_refs: sourceRefs,
		categories: Array.isArray(raw.categories)
			? raw.categories
					.map((category: unknown) => String(category))
					.filter(Boolean)
			: Object.keys(raw.counts ?? {}),
		counts: normalizeNumberRecord(raw.counts),
		path_rule_counts: {
			intended: normalizeArray(raw.intended_paths ?? raw.intended_path_rules)
				.length,
			current: normalizeArray(raw.current_paths ?? raw.current_path_rules)
				.length,
			target: normalizeArray(raw.target_paths ?? raw.target_path_rules).length,
		},
		intended_paths: normalizeFileStructurePathRules(
			raw.intended_paths ?? raw.intended_path_rules,
			sourceRefs,
		),
		current_paths: normalizeFileStructurePathRules(
			raw.current_paths ?? raw.current_path_rules,
			sourceRefs,
		),
		target_paths: normalizeFileStructurePathRules(
			raw.target_paths ?? raw.target_path_rules,
			sourceRefs,
		),
		approved_delta_edges: normalizeFileStructureDeltaEdges(
			raw.approved_delta_edges,
		),
		approved_migration_deltas: approvedEntries,
		actionable_entries: actionableEntries,
		parse_issues: parseIssues,
	};
}

function normalizeFileStructurePathRules(
	value: unknown,
	fallbackRefs: string[],
): ControlRoomFileStructurePathRule[] {
	return normalizeArray(value)
		.map((rule: any) => ({
			pattern: String(rule.pattern ?? ""),
			owner_id: stringOrNull(rule.owner_id),
			owner_label: stringOrNull(rule.owner_label),
			group: stringOrNull(rule.group),
			status: stringOrNull(rule.status),
			role: stringOrNull(rule.role),
			approved_delta: Boolean(rule.approved_delta),
			refs: uniqueSorted([
				...normalizeArray(rule.refs).map((ref: unknown) => String(ref)),
				stringOrNull(rule.source) ?? "",
				...fallbackRefs,
			]),
		}))
		.filter((rule) => rule.pattern);
}

function normalizeFileStructureEntries(
	value: unknown,
	mapPath: string | null,
): ControlRoomFileStructureEntry[] {
	return normalizeArray(value)
		.map((entry: any) => ({
			category: String(entry.category ?? "unknown"),
			severity: String(entry.severity ?? "info"),
			path: String(entry.path ?? ""),
			message: String(entry.message ?? ""),
			owner_id: stringOrNull(entry.owner_id),
			owner_label: stringOrNull(entry.owner_label),
			refs: uniqueSorted([
				...normalizeArray(entry.refs).map((ref: unknown) => String(ref)),
				mapPath ?? "",
			]),
		}))
		.filter((entry) => entry.path || entry.message);
}

function normalizeFileStructureDeltaEdges(
	value: unknown,
): Array<{ from: string; to: string; label: string }> {
	return normalizeArray(value)
		.map((edge: any) => ({
			from: String(edge.from ?? ""),
			to: String(edge.to ?? ""),
			label: String(edge.label ?? "approved migration delta"),
		}))
		.filter((edge) => edge.from || edge.to || edge.label);
}

function fileStructureSourceRefs(
	raw: any,
	mapPath: string | null,
	entries: ControlRoomFileStructureEntry[],
): string[] {
	return uniqueSorted([
		mapPath ?? "",
		...normalizeArray(raw.source_refs).map((ref: unknown) => String(ref)),
		...normalizeArray(raw.canonical_refs).map((ref: unknown) => String(ref)),
		...entries.flatMap((entry) => entry.refs),
	]);
}

function normalizeNumberRecord(value: unknown): Record<string, number> {
	const result: Record<string, number> = {};
	if (!value || typeof value !== "object") return result;
	for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
		result[key] = numberFrom(count);
	}
	return result;
}

function normalizeArray(value: unknown): any[] {
	return Array.isArray(value) ? value : [];
}

export async function buildControlRoomProductModel(
	project: WikiProject,
): Promise<ControlRoomProductModel> {
	const categories = [
		{
			id: "users" as const,
			label: "Users",
			summary: "Who the project serves and what they need.",
		},
		{
			id: "stories" as const,
			label: "Stories",
			summary: "User outcomes and success signals.",
		},
		{
			id: "uis" as const,
			label: "UI surfaces",
			summary: "Visual surfaces that support those outcomes.",
		},
	];
	return {
		categories: await Promise.all(
			categories.map(async (category) => ({
				...category,
				items: await readProductItems(project, category.id),
			})),
		),
	};
}

export async function buildControlRoomBoardModel(
	project: WikiProject,
): Promise<ControlRoomBoardModel> {
	const graph = (await maybeReadGraph(project.graphPath)) as any;
	const roadmapState = (await maybeReadRoadmapState(
		project.roadmapStatePath,
	)) as any;
	const rawRoadmap = await maybeReadJson<any>(
		resolve(project.root, project.roadmapPath),
	);
	const roadmap = roadmapState?.tasks
		? roadmapState
		: rawRoadmap?.tasks
			? rawRoadmap
			: (graph?.lenses?.roadmap ?? graph?.views?.roadmap ?? null);
	const tasks = Object.values(roadmap?.tasks ?? {}) as any[];
	const openTasks = tasks.filter((task) => isOpenTaskStatus(task.status));
	const focused = stringOrNull(
		roadmap?.summary?.focused_task_id ?? roadmap?.focused_task_id,
	);
	const orderedOpenTasks = [...openTasks].sort((a, b) => {
		if (focused && a.id === focused) return -1;
		if (focused && b.id === focused) return 1;
		return String(a.id).localeCompare(String(b.id));
	});
	const sprints = Object.values(
		roadmap?.sprints ?? roadmap?.views?.sprints ?? {},
	) as any[];
	return {
		stats: {
			open: numberFrom(
				roadmap?.summary?.open_count ??
					roadmap?.summary?.open_task_count ??
					roadmap?.open_task_count ??
					roadmap?.open ??
					openTasks.length,
			),
			done: numberFrom(
				roadmap?.summary?.status_counts?.done ??
					roadmap?.summary?.done_task_count ??
					roadmap?.done_task_count,
			),
			blocked: numberFrom(
				roadmap?.summary?.status_counts?.blocked ??
					roadmap?.summary?.blocked_task_count ??
					roadmap?.blocked_task_count ??
					openTasks.filter((task) => String(task.status) === "blocked").length,
			),
		},
		active_sprints: sprints
			.filter((sprint) =>
				["active", "planned", "in_progress"].includes(
					String(sprint.status ?? ""),
				),
			)
			.slice(0, 5)
			.map((sprint) => ({
				id: String(sprint.id ?? "sprint"),
				title: String(sprint.title ?? sprint.id ?? "Sprint"),
				status: String(sprint.status ?? "unknown"),
				task_ids: Array.isArray(sprint.task_ids)
					? sprint.task_ids.map(String)
					: [],
				open_task_ids: Array.isArray(sprint.open_task_ids)
					? sprint.open_task_ids.map(String)
					: [],
			})),
		tasks: orderedOpenTasks.slice(0, 12).map((task) => ({
			id: String(task.id ?? ""),
			title: String(task.title ?? task.id ?? "Task"),
			status: String(task.status ?? "unknown"),
			priority: String(task.priority ?? "medium"),
			summary: String(task.summary ?? ""),
			acceptance: Array.isArray(task.goal?.acceptance)
				? task.goal.acceptance.slice(0, 4).map(String)
				: [],
			verification: Array.isArray(task.goal?.verification)
				? task.goal.verification.slice(0, 4).map(String)
				: [],
			spec_paths: Array.isArray(task.spec_paths)
				? task.spec_paths.slice(0, 6).map(String)
				: [],
			code_paths: Array.isArray(task.code_paths)
				? task.code_paths.slice(0, 6).map(String)
				: [],
		})),
	};
}

export async function buildControlRoomSystemModel(
	project: WikiProject,
): Promise<ControlRoomSystemModel> {
	const architecturePath = resolve(
		project.root,
		".codewiki/kb/system/architecture.mmd",
	);
	const source = await readTextIfExists(architecturePath);
	const parsed = parseArchitectureMermaid(source);
	const componentClasses = parseClassMembership(source, "component");
	const artifactClasses = parseClassMembership(source, "artifact");
	const diagrams = await readSystemDiagrams(project);
	const components: ControlRoomSystemComponent[] = [];
	for (const node of parsed.nodes) {
		const docPath = node.doc ? `.codewiki/kb/system/${node.doc}` : null;
		const absoluteDocPath = docPath ? resolve(project.root, docPath) : null;
		const doc = absoluteDocPath ? await readMarkdownDoc(absoluteDocPath) : null;
		const kind: "component" | "artifact" = componentClasses.has(node.id)
			? "component"
			: artifactClasses.has(node.id)
				? "artifact"
				: node.doc
					? "component"
					: "artifact";
		components.push({
			id: node.id,
			label: node.label,
			doc_path: docPath,
			kind,
			title: doc?.frontmatter.title ?? node.label,
			summary: doc?.frontmatter.summary ?? "No component summary found.",
			state: doc?.frontmatter.state ?? null,
			updated: doc?.frontmatter.updated ?? null,
			sections: doc?.sections ?? [],
		});
	}
	return {
		architecture_path: relative(project.root, architecturePath),
		source,
		diagram_catalog: diagrams.map(({ id, title, kind, path, purpose }) => ({
			id,
			title,
			kind,
			path,
			purpose,
		})),
		diagrams,
		components,
		edges: parsed.edges.map((edge) => ({ ...edge, kind: "architecture" })),
	};
}

export async function buildControlRoomSettingsModel(
	project: WikiProject,
): Promise<ControlRoomSettingsModel> {
	const sourcePath = ".codewiki/config.json";
	const rows = flattenConfigRows(project.config || {}, sourcePath);
	const groupOrder = [
		"project",
		"paths",
		"roadmap",
		"generated",
		"lint",
		"gateway",
		"runtime",
		"rebuild",
		"agency",
		"gc",
		"other",
	];
	const grouped = new Map<string, ControlRoomSettingsRow[]>();
	for (const row of rows) {
		const id = row.category;
		const list = grouped.get(id) || [];
		list.push(row);
		grouped.set(id, list);
	}
	return {
		source_path: sourcePath,
		groups: groupOrder
			.filter((id) => grouped.has(id))
			.map((id) => ({
				id,
				label: settingsGroupLabel(id),
				summary: settingsGroupSummary(id),
				rows: grouped.get(id) ?? [],
			})),
	};
}

export async function buildControlRoomGraphModel(
	project: WikiProject,
	_options: { maxNodes?: number; maxEdges?: number } = {},
): Promise<ControlRoomGraphModel> {
	const graph = await maybeReadJson<any>(project.graphPath);
	const allNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
	const allEdges = Array.isArray(graph?.edges) ? graph.edges : [];
	const defaultLens = graph?.views?.lenses?.default ?? null;
	const familyNodes: Record<string, unknown>[] = Array.isArray(
		defaultLens?.families,
	)
		? defaultLens.families.map(normalizeLensFamilyNode)
		: [];
	const familyEdges: Record<string, unknown>[] = familyNodes
		.slice(0, -1)
		.map((node: Record<string, unknown>, index: number) => ({
			from: String(node.id),
			to: String(familyNodes[index + 1]?.id ?? ""),
			kind: "lens_flow",
			label: "default lens order",
		}))
		.filter((edge: Record<string, unknown>) => Boolean(edge.to));
	const visibleNodes = allNodes.filter(isDefaultGraphNodeVisible);
	const visibleNodeIds = new Set<string>(
		visibleNodes.map((node: any) => String(node.id ?? "")),
	);
	const visibleEdges = allEdges.filter((edge: any) =>
		isDefaultGraphEdgeVisible(edge, visibleNodeIds),
	);
	const nodes = [...familyNodes, ...visibleNodes.map(normalizeGraphNode)];
	const edges = [...familyEdges, ...visibleEdges.map(normalizeGraphEdge)];
	return {
		generated_at: stringOrNull(graph?.generated_at),
		stats: {
			total_nodes: allNodes.length,
			total_edges: allEdges.length,
			shown_nodes: nodes.length,
			shown_edges: edges.length,
			hidden_cold_nodes: allNodes.length - visibleNodes.length,
			hidden_cold_edges: allEdges.length - visibleEdges.length,
			truncated: false,
		},
		node_kinds: uniqueSorted(
			nodes.map((node: any) => String(node.kind ?? "unknown")),
		),
		edge_kinds: uniqueSorted(
			edges.map((edge: any) => String(edge.kind ?? "edge")),
		),
		nodes,
		edges,
	};
}

async function handleControlRoomRequest(
	project: WikiProject,
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
	try {
		if (req.method !== "GET") {
			writeTextResponse(
				res,
				405,
				"Method not allowed",
				"text/plain; charset=utf-8",
			);
			return;
		}
		switch (requestUrl.pathname) {
			case "/":
			case "/index.html":
				writeTextResponse(
					res,
					200,
					CONTROL_ROOM_HTML,
					"text/html; charset=utf-8",
				);
				return;
			case "/assets/control-room.css":
				writeTextResponse(
					res,
					200,
					CONTROL_ROOM_CSS,
					"text/css; charset=utf-8",
				);
				return;
			case "/assets/control-room.js":
				writeTextResponse(
					res,
					200,
					CONTROL_ROOM_JS,
					"text/javascript; charset=utf-8",
				);
				return;
			case "/assets/vendor/cytoscape.min.js":
				writeTextResponse(
					res,
					200,
					await readCytoscapeVendorAsset(),
					"text/javascript; charset=utf-8",
				);
				return;
			case "/api/state":
				writeJsonResponse(res, 200, await buildControlRoomStateModel(project));
				return;
			case "/api/product":
				writeJsonResponse(
					res,
					200,
					await buildControlRoomProductModel(project),
				);
				return;
			case "/api/system":
				writeJsonResponse(res, 200, await buildControlRoomSystemModel(project));
				return;
			case "/api/board":
				writeJsonResponse(res, 200, await buildControlRoomBoardModel(project));
				return;
			case "/api/settings":
				writeJsonResponse(
					res,
					200,
					await buildControlRoomSettingsModel(project),
				);
				return;
			case "/api/graph":
				writeJsonResponse(res, 200, await buildControlRoomGraphModel(project));
				return;
			case "/api/health":
				writeJsonResponse(res, 200, { ok: true, project: project.label });
				return;
			default:
				writeJsonResponse(res, 404, { error: "Not found" });
		}
	} catch (error) {
		writeJsonResponse(res, 500, {
			error: String(error instanceof Error ? error.message : error),
		});
	}
}

function readCytoscapeVendorAsset(): Promise<string> {
	cytoscapeAssetCache ??= readFile(
		nodeRequire.resolve("cytoscape/dist/cytoscape.min.js"),
		"utf8",
	);
	return cytoscapeAssetCache;
}

function flattenConfigRows(
	value: unknown,
	sourcePath: string,
	prefix: string[] = [],
): ControlRoomSettingsRow[] {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return Object.entries(value as Record<string, unknown>).flatMap(
			([key, nested]) =>
				flattenConfigRows(nested, sourcePath, [...prefix, key]),
		);
	}
	const optionPath = prefix.join(".");
	return [
		{
			path: optionPath,
			value: formatConfigValue(value),
			category: settingsCategory(prefix),
			purpose: settingsPurpose(prefix),
			source_path: sourcePath,
			editability: settingsEditability(prefix),
		},
	];
}

function formatConfigValue(value: unknown): string {
	if (Array.isArray(value)) return JSON.stringify(value);
	if (value && typeof value === "object") return JSON.stringify(value);
	if (value === undefined) return "undefined";
	return String(value);
}

function settingsCategory(path: string[]): string {
	const joined = path.join(".");
	if (
		["project_name", "version", "template", "index_title"].includes(
			path[0] || "",
		)
	)
		return "project";
	if (
		[
			"docs_root",
			"specs_root",
			"evidence_root",
			"research_root",
			"meta_root",
			"views_root",
			"sources_root",
			"roadmap_path",
			"roadmap_doc_path",
		].includes(path[0] || "")
	)
		return "paths";
	if (path[0] === "roadmap_retention") return "roadmap";
	if (path[0] === "generated_files") return "generated";
	if (path[0] === "lint") return "lint";
	if (joined.startsWith("codewiki.gateway")) return "gateway";
	if (joined.startsWith("codewiki.runtime")) return "runtime";
	if (joined.startsWith("codewiki.rebuild")) return "rebuild";
	if (joined.startsWith("codewiki.agency")) return "agency";
	if (joined.startsWith("codewiki.gc")) return "gc";
	return "other";
}

function settingsPurpose(path: string[]): string {
	const joined = path.join(".");
	if (joined === "project_name")
		return "Display name for this CodeWiki project.";
	if (joined.endsWith("_root") || joined.endsWith("_path"))
		return "Repository-relative source or generated artifact location.";
	if (path[0] === "generated_files")
		return "Generated files rebuilt from canonical sources.";
	if (path[0] === "roadmap_retention")
		return "Closed-work retention and archive policy.";
	if (path[0] === "lint") return "Knowledge/documentation lint policy.";
	if (joined.startsWith("codewiki.gateway"))
		return "Gateway read/write, deny, and generated-readonly policy.";
	if (joined.startsWith("codewiki.runtime"))
		return "Runtime adapter and patch behavior.";
	if (joined.startsWith("codewiki.rebuild"))
		return "Rebuild freshness, debounce, and verbosity controls.";
	if (joined.startsWith("codewiki.agency.budgets"))
		return "Bounded agency budget limit.";
	if (joined.startsWith("codewiki.agency.parallelism"))
		return "Parallel session and sprint execution limit.";
	if (joined.startsWith("codewiki.agency"))
		return "Default agency planning scope.";
	if (joined.startsWith("codewiki.gc"))
		return "Hot/warm/cold/purge artifact lifecycle policy.";
	return "CodeWiki configuration option.";
}

function settingsEditability(
	path: string[],
): ControlRoomSettingsRow["editability"] {
	const joined = path.join(".");
	if (
		joined.startsWith("codewiki.gateway") ||
		joined.startsWith("codewiki.runtime") ||
		joined.includes("deny_paths") ||
		joined.includes("write_paths")
	)
		return "policy-gated";
	if (
		path[0] === "project_name" ||
		path[0] === "lint" ||
		joined.startsWith("codewiki.agency.budgets") ||
		joined.startsWith("codewiki.rebuild")
	)
		return "safe-edit";
	return "read-only";
}

function settingsGroupLabel(id: string): string {
	return (
		(
			{
				project: "Project",
				paths: "Paths",
				roadmap: "Roadmap retention",
				generated: "Generated files",
				lint: "Lint",
				gateway: "Gateway policy",
				runtime: "Runtime",
				rebuild: "Rebuild",
				agency: "Agency",
				gc: "GC / archival",
				other: "Other",
			} as Record<string, string>
		)[id] || id
	);
}

function settingsGroupSummary(id: string): string {
	return (
		(
			{
				project: "Identity and template metadata.",
				paths: "Canonical and generated repository locations.",
				roadmap: "Closed-task retention and archive behavior.",
				generated: "Generated files rebuilt by CodeWiki.",
				lint: "Warnings and documentation policy.",
				gateway: "Sandbox/read/write/deny/generated path policy.",
				runtime: "Adapter and patch runtime settings.",
				rebuild: "Rebuild freshness and noise controls.",
				agency: "Default agency scope, budget, and parallelism.",
				gc: "Artifact lifecycle and archive thresholds.",
				other: "Additional config values.",
			} as Record<string, string>
		)[id] || "Config values."
	);
}

async function readProductItems(
	project: WikiProject,
	category: "users" | "stories" | "uis",
): Promise<ControlRoomProductItem[]> {
	const dir = resolve(project.root, ".codewiki/kb/product", category);
	if (!(await pathExists(dir))) return [];
	const entries = (await readdir(dir, { withFileTypes: true }))
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b));
	const items: ControlRoomProductItem[] = [];
	for (const name of entries) {
		const absolute = resolve(dir, name);
		const raw = await readText(absolute);
		const { frontmatter, body } = parseMarkdownFrontmatter(raw);
		const title =
			frontmatter.title || markdownTitle(body) || titleFromFilename(name);
		items.push({
			id: `${category}:${name.replace(/\.md$/, "")}`,
			path: relative(project.root, absolute),
			title,
			summary:
				frontmatter.summary || firstParagraph(body) || "No summary found.",
			state: frontmatter.state || null,
			updated: frontmatter.updated || null,
			sections: extractMarkdownSections(body).slice(0, 4),
		});
	}
	return items;
}

async function readSystemDiagrams(
	project: WikiProject,
): Promise<ControlRoomSystemDiagram[]> {
	const dir = resolve(project.root, ".codewiki/kb/system/diagrams");
	if (!(await pathExists(dir))) return [];
	const entries = (await readdir(dir, { withFileTypes: true }))
		.filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
		.map((entry) => entry.name)
		.sort(
			(a, b) => diagramSortRank(a) - diagramSortRank(b) || a.localeCompare(b),
		);
	const diagrams: ControlRoomSystemDiagram[] = [];
	for (const name of entries) {
		const absolute = resolve(dir, name);
		try {
			const raw = loadYaml(await readText(absolute)) as any;
			diagrams.push(
				normalizeSystemDiagram(raw || {}, relative(project.root, absolute)),
			);
		} catch {
			// Invalid diagram YAML should not block the whole Control Room.
		}
	}
	return diagrams;
}

function diagramSortRank(name: string): number {
	const order = [
		"context-map",
		"component-map",
		"key-flow",
		"data-model",
		"state-lifecycle",
	];
	const index = order.findIndex((item) => name.startsWith(item));
	return index >= 0 ? index : order.length;
}

function normalizeSystemDiagram(
	raw: any,
	path: string,
): ControlRoomSystemDiagram {
	const kind = String(raw.kind || "diagram");
	const nodes = normalizeDiagramNodes(raw, kind);
	return {
		id: String(raw.id || path),
		title: String(raw.title || titleFromFilename(basename(path))),
		kind,
		path,
		purpose: String(raw.purpose || "System diagram."),
		source_docs: Array.isArray(raw.source_docs)
			? raw.source_docs.map(String)
			: [],
		nodes,
		edges: normalizeDiagramEdges(raw, kind),
		raw,
	};
}

function normalizeDiagramNodes(
	raw: any,
	kind: string,
): ControlRoomSystemDiagramNode[] {
	if (kind === "context_map") {
		return [
			...arrayOf(raw.actors).map((node: any) => diagramNode(node, "actor")),
			...arrayOf(raw.systems).map((node: any) =>
				diagramNode(node, String(node.boundary || "system")),
			),
		];
	}
	if (kind === "sequence_flow")
		return arrayOf(raw.participants).map((node: any) =>
			diagramNode(node, String(node.kind || "participant")),
		);
	if (kind === "data_model")
		return arrayOf(raw.entities).map((node: any) =>
			diagramNode(node, "entity", node.role || node.storage),
		);
	if (kind === "state_lifecycle")
		return arrayOf(raw.states).map((node: any) =>
			diagramNode(node, String(node.kind || "state")),
		);
	return arrayOf(raw.nodes).map((node: any) =>
		diagramNode(node, String(node.kind || node.group || "node")),
	);
}

function normalizeDiagramEdges(
	raw: any,
	kind: string,
): ControlRoomSystemDiagramEdge[] {
	if (kind === "context_map")
		return arrayOf(raw.relationships).map((edge: any) =>
			diagramEdge(edge, "relationship"),
		);
	if (kind === "sequence_flow")
		return arrayOf(raw.steps).map((edge: any) =>
			diagramEdge(edge, "sequence", edge.message),
		);
	if (kind === "data_model")
		return arrayOf(raw.relationships).map((edge: any) =>
			diagramEdge(edge, String(edge.type || "relationship")),
		);
	if (kind === "state_lifecycle")
		return arrayOf(raw.transitions).map((edge: any) =>
			diagramEdge(edge, "transition", edge.trigger),
		);
	return arrayOf(raw.edges).map((edge: any) =>
		diagramEdge(edge, String(edge.kind || "edge")),
	);
}

function diagramNode(
	node: any,
	kind: string,
	summary?: unknown,
): ControlRoomSystemDiagramNode {
	return {
		id: String(node.id || node.label || "node"),
		label: String(node.label || node.title || node.id || "node"),
		kind,
		doc_path: stringOrNull(node.source || node.doc_path || node.doc),
		summary: String(
			summary ||
				node.summary ||
				node.purpose ||
				node.role ||
				node.storage ||
				kind,
		),
		raw: node,
	};
}

function diagramEdge(
	edge: any,
	kind: string,
	label?: unknown,
): ControlRoomSystemDiagramEdge {
	return {
		from: String(edge.from || edge.source || ""),
		to: String(edge.to || edge.target || ""),
		kind,
		label: String(label || edge.label || edge.type || kind),
		raw: edge,
	};
}

function arrayOf(value: unknown): any[] {
	return Array.isArray(value) ? value : [];
}

function markdownTitle(body: string): string | null {
	return stringOrNull(/^#\s+(.+)$/m.exec(body)?.[1]?.trim());
}

function firstParagraph(body: string): string | null {
	const paragraph = body
		.replace(/^#\s+.+$/gm, "")
		.split(/\n\s*\n/)
		.map((part) => part.trim())
		.find((part) => part && !part.startsWith("|") && !part.startsWith("```"));
	return paragraph ? paragraph.replace(/\s+/g, " ").slice(0, 220) : null;
}

function titleFromFilename(name: string): string {
	return name
		.replace(/\.(md|ya?ml)$/i, "")
		.split(/[-_]/g)
		.map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
		.join(" ");
}

function writeTextResponse(
	res: ServerResponse,
	status: number,
	body: string,
	contentType: string,
): void {
	res.writeHead(status, {
		"content-type": contentType,
		"cache-control": "no-store",
	});
	res.end(body);
}

function writeJsonResponse(
	res: ServerResponse,
	status: number,
	body: unknown,
): void {
	writeTextResponse(
		res,
		status,
		`${JSON.stringify(body, null, 2)}\n`,
		"application/json; charset=utf-8",
	);
}

type ArchitectureMermaidNode = {
	id: string;
	label: string;
	doc: string | null;
};
type ArchitectureMermaidEdge = { from: string; to: string };

function parseArchitectureNodeLabel(
	id: string,
	rawLabel: string,
): ArchitectureMermaidNode {
	const labelParts = rawLabel
		.split(/\\n/)
		.map((part) => part.trim())
		.filter(Boolean);
	const doc = labelParts.find((part) => part.endsWith(".md")) ?? null;
	return { id, label: labelParts[0] ?? id, doc };
}

function parseArchitectureNodeLine(
	line: string,
): ArchitectureMermaidNode | null {
	const nodeMatch = /^\s*([A-Za-z0-9_]+)\["([\s\S]+)"\]/.exec(line);
	if (!nodeMatch) return null;
	return parseArchitectureNodeLabel(nodeMatch[1], nodeMatch[2]);
}

function parseArchitectureEdgeLine(
	line: string,
): ArchitectureMermaidEdge | null {
	const edgeMatch = /^\s*([A-Za-z0-9_]+)\s*-->\s*([A-Za-z0-9_]+)/.exec(line);
	if (!edgeMatch) return null;
	return { from: edgeMatch[1], to: edgeMatch[2] };
}

function parseArchitectureMermaid(source: string): {
	nodes: ArchitectureMermaidNode[];
	edges: ArchitectureMermaidEdge[];
} {
	const nodes = new Map<string, ArchitectureMermaidNode>();
	const edges: ArchitectureMermaidEdge[] = [];
	source.split(/\r?\n/).forEach((line) => {
		const node = parseArchitectureNodeLine(line);
		if (node) {
			nodes.set(node.id, node);
			return;
		}
		const edge = parseArchitectureEdgeLine(line);
		if (edge) edges.push(edge);
	});
	return { nodes: Array.from(nodes.values()), edges };
}

function escapeRegexLiteral(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classMembershipPattern(className: string): RegExp {
	return new RegExp(
		`^\\s*class\\s+([^;]+)\\s+${escapeRegexLiteral(className)}\\s*;`,
		"gm",
	);
}

function parseClassMemberIds(rawIds: string): string[] {
	return rawIds
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

function parseClassMembership(source: string, className: string): Set<string> {
	const set = new Set<string>();
	const pattern = classMembershipPattern(className);
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(source))) {
		parseClassMemberIds(match[1]).forEach((id) => set.add(id));
	}
	return set;
}

async function readMarkdownDoc(path: string): Promise<{
	frontmatter: Record<string, string>;
	sections: Array<{ title: string; body: string }>;
} | null> {
	if (!(await pathExists(path))) return null;
	const raw = await readText(path);
	const { frontmatter, body } = parseMarkdownFrontmatter(raw);
	return { frontmatter, sections: extractMarkdownSections(body) };
}

function parseMarkdownFrontmatter(raw: string): {
	frontmatter: Record<string, string>;
	body: string;
} {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
	if (!match) return { frontmatter: {}, body: raw };
	const frontmatter: Record<string, string> = {};
	for (const line of match[1].split(/\r?\n/)) {
		const scalar = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
		if (!scalar) continue;
		frontmatter[scalar[1]] = scalar[2].replace(/^['"]|['"]$/g, "");
	}
	return { frontmatter, body: raw.slice(match[0].length) };
}

function extractMarkdownSections(
	body: string,
): Array<{ title: string; body: string }> {
	const sections: Array<{ title: string; body: string }> = [];
	const lines = body.split(/\r?\n/);
	let current: { title: string; body: string[] } | null = null;
	for (const line of lines) {
		const heading = /^##\s+(.+)$/.exec(line);
		if (heading) {
			if (current)
				sections.push({
					title: current.title,
					body: compactSectionBody(current.body),
				});
			current = { title: heading[1].trim(), body: [] };
			continue;
		}
		if (current) current.body.push(line);
	}
	if (current)
		sections.push({
			title: current.title,
			body: compactSectionBody(current.body),
		});
	return sections.filter((section) => section.body).slice(0, 6);
}

function compactSectionBody(lines: string[]): string {
	return lines
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim()
		.slice(0, 1400);
}

function normalizeGraphNode(node: any): Record<string, unknown> {
	return {
		id: String(node.id ?? node.path ?? "node"),
		kind: String(node.kind ?? "unknown"),
		label: String(node.title ?? node.label ?? node.path ?? node.id ?? "node"),
		path: node.path,
		layer: node.layer,
		state: node.state ?? node.status,
		lens_family: node.lens_family,
		default_collapsed: node.default_collapsed === true,
	};
}

function normalizeLensFamilyNode(family: any): Record<string, unknown> {
	return {
		id: `lens:${String(family.id ?? "family")}`,
		kind: "lens_family",
		label: String(family.label ?? family.id ?? "Lens family"),
		path: String(family.id ?? ""),
		layer: "lens",
		state: family.state ?? "unknown",
		lens_family: String(family.id ?? ""),
		badges: Array.isArray(family.badges) ? family.badges : [],
		item_count: numberFrom(family.item_count),
	};
}

function normalizeGraphEdge(edge: any): Record<string, unknown> {
	return {
		from: String(edge.from ?? ""),
		to: String(edge.to ?? ""),
		kind: String(edge.kind ?? "edge"),
		label: edge.label ?? edge.reason,
	};
}

function isDefaultGraphNodeVisible(node: any): boolean {
	if (!node) return false;
	if (node.default_hidden === true) return false;
	const kind = String(node.kind ?? "");
	if (kind === "git_archive_ref") return false;
	if (node.compacted === true) return false;
	if (
		kind === "roadmap_task" &&
		["done", "cancelled", "closed"].includes(String(node.status ?? ""))
	)
		return false;
	if (kind === "validation_report" && String(node.verdict ?? "") === "pass")
		return false;
	return true;
}

function isDefaultGraphEdgeVisible(
	edge: any,
	visibleNodeIds: Set<string>,
): boolean {
	if (!edge || edge.default_hidden === true) return false;
	return (
		visibleNodeIds.has(String(edge.from ?? "")) &&
		visibleNodeIds.has(String(edge.to ?? ""))
	);
}

async function readTextIfExists(path: string): Promise<string> {
	return (await pathExists(path)) ? readText(path) : "";
}

function stringOrNull(value: unknown): string | null {
	if (value === undefined || value === null || value === "") return null;
	return String(value);
}

function numberFrom(value: unknown): number {
	const number = Number(value ?? 0);
	return Number.isFinite(number) ? number : 0;
}

function isOpenTaskStatus(status: unknown): boolean {
	return !["done", "cancelled", "closed"].includes(
		String(status ?? "").toLowerCase(),
	);
}

function uniqueSorted(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
		a.localeCompare(b),
	);
}

const CONTROL_ROOM_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CodeWiki</title>
<link rel="stylesheet" href="/assets/control-room.css">
</head>
<body>
<div id="app" class="shell">
  <header class="topbar">
    <div>
      <span class="sigil">▣</span>
      <span class="title">CodeWiki</span>
      <span id="repo" class="muted"></span>
    </div>
    <div class="header-actions">
      <div class="command">⌘ local-first · 127.0.0.1</div>
      <button id="settingsButton" class="icon-button" type="button" aria-label="Open settings" title="Settings">⚙</button>
    </div>
  </header>
  <nav class="rail" aria-label="CodeWiki sections">
    <button data-view="status" class="active">Status</button>
    <button data-view="product">Product</button>
    <button data-view="system">System</button>
    <button data-view="board">Board</button>
    <button data-view="graph">Graph</button>
  </nav>
  <main class="workspace">
    <section id="status" class="view active"></section>
    <section id="product" class="view"></section>
    <section id="system" class="view"></section>
    <section id="board" class="view"></section>
    <section id="graph" class="view"></section>
  </main>
  <aside id="inspector" class="inspector"></aside>
  <section id="settingsPanel" class="settings-panel" hidden aria-label="Settings"></section>
  <footer id="statusLine" class="status">booting CodeWiki…</footer>
</div>
<script src="/assets/vendor/cytoscape.min.js"></script>
<script src="/assets/control-room.js"></script>
</body>
</html>`;

const CONTROL_ROOM_CSS = String.raw`
:root {
  color-scheme: dark;
  --bg: #050604;
  --panel: #090b08;
  --panel2: #10140f;
  --line: #7f927f;
  --line-dim: rgba(180, 190, 172, 0.24);
  --highlight: #f4f1e8;
  --accent: #c7a35a;
  --accent-dim: rgba(199, 163, 90, 0.38);
  --red: #d46a66;
  --text: #dfddd2;
  --muted: #899488;
  --shadow: rgba(244, 241, 232, 0.10);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background:
    linear-gradient(rgba(255,255,255,0.018) 50%, rgba(0,0,0,0.055) 50%) 0 0 / 100% 4px,
    radial-gradient(circle at 50% 0%, rgba(244,241,232,0.055), transparent 34rem),
    var(--bg);
  color: var(--text);
  font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}
button, select, input { font: inherit; }
button { color: inherit; }
.shell {
  display: grid;
  grid-template-columns: 11rem minmax(0, 1fr) 24rem;
  grid-template-rows: 3.2rem minmax(0, 1fr) 2.1rem;
  height: 100vh;
  gap: 1px;
  background: var(--line-dim);
}
.topbar, .rail, .workspace, .inspector, .status {
  background: rgba(5, 6, 4, 0.97);
}
.topbar {
  grid-column: 1 / 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  border-bottom: 1px solid var(--line-dim);
  box-shadow: 0 0 24px var(--shadow);
}
.sigil, .title { color: var(--highlight); text-shadow: 0 0 10px var(--shadow); }
.title { font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
.muted { color: var(--muted); }
.command { color: var(--accent); }
.header-actions { display: flex; align-items: center; gap: 0.75rem; }
.icon-button {
  color: var(--accent);
  background: rgba(199, 163, 90, 0.08);
  border: 1px solid rgba(199, 163, 90, 0.35);
  width: 2rem;
  height: 2rem;
  cursor: pointer;
}
.icon-button:hover, .icon-button.active { color: var(--highlight); border-color: var(--highlight); box-shadow: 0 0 14px rgba(244,241,232,0.16); }
.rail {
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.rail button {
  color: var(--muted);
  background: transparent;
  border: 1px solid transparent;
  text-align: left;
  padding: 0.55rem 0.65rem;
  cursor: pointer;
}
.rail button:hover, .rail button.active {
  color: var(--highlight);
  border-color: var(--line-dim);
  background: rgba(244, 241, 232, 0.055);
  box-shadow: inset 0 0 18px rgba(244, 241, 232, 0.045);
}
.workspace { overflow: auto; padding: 0.75rem; }
.inspector { overflow: auto; padding: 1rem; border-left: 1px solid var(--line-dim); }
.status {
  grid-column: 1 / 4;
  padding: 0.35rem 1rem;
  color: var(--muted);
  border-top: 1px solid var(--line-dim);
}
.view { display: none; min-height: 100%; }
.view.active { display: block; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 0.75rem; }
.card, .area-card, .source-card, .empty-state {
  border: 1px solid var(--line-dim);
  background: linear-gradient(180deg, rgba(16, 20, 15, 0.86), rgba(5, 6, 4, 0.72));
  padding: 0.85rem;
  box-shadow: 0 0 16px rgba(244, 241, 232, 0.035);
}
.card h3, .area-card h3, .source-card h3, .section-head h2, .empty-state h2 { margin: 0 0 0.55rem; color: var(--highlight); }
.big { font-size: 2rem; color: var(--highlight); }
.badge { display: inline-block; padding: 0.1rem 0.35rem; border: 1px solid var(--line-dim); color: var(--highlight); margin-right: 0.35rem; }
.badge.yellow { color: var(--accent); border-color: var(--accent-dim); }
.badge.red { color: var(--red); border-color: rgba(212, 106, 102, 0.45); }
.toolbar { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; margin: 0 0 0.6rem; }
.toolbar select, .toolbar input, .toolbar button {
  color: var(--text);
  background: #050604;
  border: 1px solid var(--line-dim);
  padding: 0.35rem 0.45rem;
}
.toolbar button { cursor: pointer; }
.toolbar button:hover { color: var(--highlight); border-color: var(--highlight); }
.section-head { margin: 0 0 0.75rem; }
.section-head p { margin: 0.25rem 0 0; color: var(--muted); }
.area-map { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 0.75rem; margin-top: 0.75rem; }
.area-card { width: 100%; min-height: 8rem; text-align: left; cursor: pointer; }
.area-card:hover, .area-card.active { border-color: var(--highlight); background: rgba(244, 241, 232, 0.055); }
.area-card .glyph { color: var(--accent); font-size: 1.1rem; }
.source-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 0.75rem; }
.source-card { text-align: left; cursor: pointer; }
.source-card:hover { border-color: var(--highlight); background: rgba(244, 241, 232, 0.055); }
.source-card code, pre code { color: var(--highlight); }
.drawer-eyebrow, .terminal-prompt { color: var(--accent); text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.78rem; }
.signal { border: 1px solid var(--line-dim); background: rgba(244,241,232,0.035); padding: 0.65rem; margin: 0.65rem 0; }
.signal h3 { margin: 0 0 0.35rem; color: var(--highlight); }
.signal p { margin: 0; }
.mini-list { margin: 0.35rem 0 0; padding-left: 1rem; }
.source-drawer { border: 1px solid var(--line-dim); background: rgba(0,0,0,0.18); margin-top: 0.75rem; }
.source-drawer summary { cursor: pointer; color: var(--accent); padding: 0.55rem 0.65rem; }
.source-drawer pre { border: 0; border-top: 1px solid var(--line-dim); margin: 0; }
.kanban { display: grid; grid-template-columns: repeat(4, minmax(13rem, 1fr)); gap: 0.75rem; align-items: start; }
.kanban-lane { border: 1px solid var(--line-dim); background: linear-gradient(180deg, rgba(16,20,15,0.76), rgba(5,6,4,0.78)); min-height: 24rem; padding: 0.65rem; }
.lane-head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; border-bottom: 1px solid var(--line-dim); padding-bottom: 0.45rem; margin-bottom: 0.55rem; }
.lane-head h3 { margin: 0; color: var(--highlight); text-transform: uppercase; letter-spacing: 0.08em; }
.kanban-card { width: 100%; text-align: left; border: 1px solid var(--line-dim); background: rgba(5,6,4,0.72); padding: 0.65rem; margin-bottom: 0.55rem; cursor: pointer; }
.kanban-card:hover, .kanban-card.active { border-color: var(--highlight); box-shadow: inset 0 0 18px rgba(244,241,232,0.04); }
.kanban-card h4 { margin: 0.25rem 0; color: var(--highlight); }
.next-action { color: var(--accent); margin-top: 0.45rem; }
.canvas { width: 100%; min-height: calc(100vh - 7.2rem); overflow: auto; background: transparent; }
.diagram { width: 100%; min-height: calc(100vh - 7.2rem); overflow: auto; background: transparent; }
.graphmap {
  width: 100%;
  min-height: calc(100vh - 7.2rem);
  height: calc(100vh - 7.2rem);
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 45%, rgba(244,241,232,0.035), transparent 28rem),
    rgba(0,0,0,0.12);
  border: 1px solid var(--line-dim);
}
.graphmap canvas { outline: none; }
.cy-error { border: 1px solid rgba(212,106,102,0.45); color: var(--red); padding: 1rem; }
svg text { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
.node rect, .g-node circle, .g-edge { cursor: pointer; }
.node.selected rect { stroke: var(--highlight); stroke-width: 3; filter: drop-shadow(0 0 8px rgba(244,241,232,0.45)); }
.edge { fill: none; stroke: rgba(180,190,172,0.42); stroke-width: 1.35; marker-end: url(#arrow); }
.edge:hover, .edge.selected { stroke: var(--highlight); stroke-width: 2.4; }
.g-edge { stroke: rgba(137,148,136,0.36); stroke-width: 1; }
.g-edge:hover, .g-edge.selected { stroke: var(--highlight); stroke-width: 2.5; filter: drop-shadow(0 0 5px rgba(244,241,232,0.42)); }
.g-node.selected circle { stroke: var(--highlight); stroke-width: 3; }
pre {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
  border: 1px solid var(--line-dim);
  padding: 0.65rem;
  background: rgba(0,0,0,0.22);
}
a { color: var(--highlight); }
.empty-state { color: var(--muted); }
.settings-panel {
  position: fixed;
  inset: 4.5rem 2rem 2rem 2rem;
  z-index: 20;
  background: rgba(5, 6, 4, 0.98);
  border: 1px solid var(--line);
  box-shadow: 0 0 40px rgba(0,0,0,0.55), 0 0 20px var(--shadow);
  padding: 1rem;
  overflow: auto;
}
.settings-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(24rem, 1fr)); gap: 0.75rem; }
.settings-group { border: 1px solid var(--line-dim); background: rgba(244,241,232,0.035); padding: 0.75rem; }
.settings-row { border-top: 1px solid var(--line-dim); padding: 0.55rem 0; }
.settings-row:first-of-type { border-top: 0; }
.settings-path { color: var(--highlight); font-weight: 700; }
.settings-value { color: var(--accent); word-break: break-word; }
.settings-meta { color: var(--muted); font-size: 0.82rem; }
.structure-review { margin-top: 0.75rem; }
.structure-lanes { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 0.75rem; }
.structure-list { display: flex; flex-direction: column; gap: 0.45rem; }
.structure-row { border: 1px solid var(--line-dim); background: rgba(0,0,0,0.16); padding: 0.55rem; }
.structure-row code { color: var(--highlight); }
.structure-meta { color: var(--muted); font-size: 0.82rem; margin-top: 0.25rem; }
@media (max-width: 980px) {
  .shell { grid-template-columns: 1fr; grid-template-rows: auto auto 1fr auto auto; }
  .topbar, .status { grid-column: 1; }
  .rail { flex-direction: row; overflow-x: auto; }
  .kanban { grid-template-columns: 1fr; }
  .inspector { border-left: 0; border-top: 1px solid var(--line-dim); max-height: 36vh; }
}
@media (prefers-reduced-motion: reduce) {
  * { scroll-behavior: auto !important; }
}
`;

const CONTROL_ROOM_JS = String.raw`
const state = { model: null, product: null, system: null, board: null, graph: null, settings: null, selected: null, systemZoom: 0.92, graphZoom: 1, drawnEdges: [], cy: null, systemDiagramId: null, settingsOpen: false };
const GRAPH_FIT_PADDING = 72;
const GRAPH_LAYOUT_SPACING = 180;
const GRAPH_NODE_REPULSION = 26000;
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));

const AREAS = [
  { id: 'status', label: 'Status', glyph: '▣', summary: 'Basic project metrics, health, focus, gates, claims, drift, and next action.', sources: ['.codewiki/index_graph.json', '.codewiki/roadmap/queue.json'] },
  { id: 'product', label: 'Product', glyph: '◇', summary: 'Stories and UI surfaces first; users and Markdown appear as contextual evidence.', sources: ['.codewiki/kb/product/**'] },
  { id: 'system', label: 'System', glyph: '▧', summary: 'Source-backed diagrams and components for architecture alignment.', sources: ['.codewiki/kb/system/*.md', '.codewiki/kb/system/diagrams/**'] },
  { id: 'board', label: 'Board', glyph: '▦', summary: 'Retro Kanban over roadmap work, gates, blockers, acceptance, and next actions.', sources: ['.codewiki/roadmap/queue.json', '.codewiki/kb/system/roadmap.md'] },
  { id: 'graph', label: 'Graph', glyph: '✣', summary: 'Generated relationships around active work, drift, validation, builds, and evidence.', sources: ['.codewiki/index_graph.json'] },
];

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(url + ' -> ' + res.status);
  return res.json();
}

async function boot() {
  wireNav();
  try {
    const [model, product, system, board, graph, settings] = await Promise.all([getJson('/api/state'), getJson('/api/product'), getJson('/api/system'), getJson('/api/board'), getJson('/api/graph'), getJson('/api/settings')]);
    state.model = model; state.product = product; state.system = system; state.board = board; state.graph = graph; state.settings = settings;
    state.systemDiagramId = system.diagram_catalog?.[0]?.id || null;
    $('repo').textContent = ' :: ' + model.project.label;
    renderStatus();
    renderProduct();
    renderSystem();
    renderBoard();
    renderGraph();
    renderSettingsPanel();
    inspectStatus();
    $('statusLine').textContent = 'ready · ' + model.health.color + ' · tasks ' + model.roadmap.open + ' open · graph ' + model.graph.nodes + '/' + model.graph.edges + ' · local repo ' + model.project.root;
  } catch (err) {
    $('statusLine').textContent = 'error · ' + err.message;
    $('status').innerHTML = '<div class="empty-state"><h2>Boot failed</h2><pre>' + esc(err.stack || err.message) + '</pre></div>';
  }
}

function wireNav() {
  document.querySelectorAll('.rail button').forEach((button) => {
    button.addEventListener('click', () => activateView(button.dataset.view));
  });
  $('settingsButton')?.addEventListener('click', () => toggleSettings());
}

function toggleSettings(force) {
  state.settingsOpen = typeof force === 'boolean' ? force : !state.settingsOpen;
  const panel = $('settingsPanel');
  if (panel) panel.hidden = !state.settingsOpen;
  $('settingsButton')?.classList.toggle('active', state.settingsOpen);
  if (state.settingsOpen) renderSettingsPanel();
}

function activateView(view) {
  document.querySelectorAll('.rail button').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === view));
  if (view === 'status') inspectStatus();
  else if (view === 'product') inspectArea('product');
  else if (view === 'system') inspectDiagram();
  else if (view === 'board') inspectArea('board');
  else if (view === 'graph' && state.graph?.nodes?.[0]) inspectGraphNode(String(state.graph.nodes[0].id));
  else inspectArea(view);
}

function renderStatus() {
  const m = state.model;
  const fileStructure = m.file_structure;
  $('status').innerHTML = '<div class="section-head"><h2>Status</h2><p>Compact project metrics for second-screen use beside chat.</p></div><div class="grid">'
    + card('Health', '<span class="badge ' + healthClass(m.health.color) + '">' + esc(m.health.color) + '</span><div class="big">' + m.health.errors + '/' + m.health.warnings + '</div><div class="muted">errors / warnings</div>')
    + card('Roadmap work', '<div class="big">' + m.roadmap.open + '</div><div>open tasks</div><div class="muted">done ' + m.roadmap.done + ' · blocked ' + m.roadmap.blocked + '</div>')
    + card('Claims', '<div class="big">' + m.claims.active + '</div><div>active claims</div><div class="muted">conflicts ' + m.claims.conflicts + ' · warnings ' + m.claims.warnings + '</div>')
    + card('Graph', '<div class="big">' + m.graph.nodes + '</div><div>nodes</div><div class="muted">edges ' + m.graph.edges + ' · drift ' + m.graph.drift + ' · stale ' + m.graph.stale + '</div>')
    + card('Gates', '<div class="big">' + m.gates.blocked + '</div><div>blocked gate(s)</div><div class="muted">validation signals ' + m.gates.validation + '</div>')
    + card('File structure', fileStructure ? '<div class="big">' + fileStructure.actionable_entries.length + '</div><div>actionable drift</div><div class="muted">approved deltas ' + (fileStructure.counts.approved_migration_delta || 0) + ' · current ' + fileStructure.path_rule_counts.current + ' · target ' + fileStructure.path_rule_counts.target + '</div>' : '<div class="big">—</div><div class="muted">no generated lens loaded</div>')
    + card('Focus', '<div class="big">' + esc(m.roadmap.focused || m.roadmap.next || '—') + '</div><div class="muted">next: ' + esc(m.next_action.kind) + '</div>')
    + '</div>' + renderFileStructureReview(fileStructure)
    + '<div class="empty-state" style="margin-top:0.75rem"><h2>Next safe action</h2><p><span class="badge">' + esc(m.next_action.kind) + '</span>' + esc(m.next_action.summary) + '</p><pre>' + esc(m.next_action.command || 'Use Product, System, Board, or Graph for context.') + '</pre></div>';
}

function renderFileStructureReview(fileStructure) {
  if (!fileStructure) return '';
  const actionableCount = fileStructure.actionable_entries?.length || 0;
  const approvedCount = fileStructure.approved_migration_deltas?.length || 0;
  return '<section class="structure-review"><div class="section-head"><h2>File-structure review</h2><p>Generated graph/status/audit lens over intended/current paths, accepted migration deltas, and actionable drift. Output is review evidence, not canonical truth.</p></div>'
    + '<div class="structure-lanes">'
    + structureLane('Intended structure', fileStructure.intended_paths, structureRuleRow, 'No intended path rules exposed.')
    + structureLane('Current structure', fileStructure.current_paths, structureRuleRow, 'No current path rules exposed.')
    + structureLane('Approved migration deltas', fileStructure.approved_migration_deltas, structureEntryRow, 'No approved migration deltas.')
    + structureLane('Actionable drift', fileStructure.actionable_entries, structureEntryRow, 'No actionable file-structure drift.')
    + '</div>'
    + sourceDetails('File-structure source refs', ['generated: .codewiki/index_graph.json views.file_structure', 'audit: wiki_audit profile=file-structure', ...(fileStructure.source_refs || [])])
    + '<p class="muted">Counts: intended ' + fileStructure.path_rule_counts.intended + ' · current ' + fileStructure.path_rule_counts.current + ' · target ' + fileStructure.path_rule_counts.target + ' · approved ' + approvedCount + ' · actionable ' + actionableCount + '</p>'
    + '</section>';
}

function structureLane(title, rows, rowRenderer, emptyText) {
  const visibleRows = (rows || []).slice(0, 6);
  const overflow = (rows || []).length - visibleRows.length;
  return '<section class="card"><h3>' + esc(title) + ' <span class="badge">' + (rows || []).length + '</span></h3><div class="structure-list">'
    + (visibleRows.length ? visibleRows.map(rowRenderer).join('') : '<p class="muted">' + esc(emptyText) + '</p>')
    + (overflow > 0 ? '<p class="muted">+' + overflow + ' more in generated evidence.</p>' : '')
    + '</div></section>';
}

function structureRuleRow(rule) {
  return '<article class="structure-row"><div><code>' + esc(rule.pattern) + '</code></div><div class="structure-meta">' + esc([rule.role, rule.owner_label || rule.owner_id, rule.status].filter(Boolean).join(' · ')) + '</div>' + sourceDetails('source refs', rule.refs || []) + '</article>';
}

function structureEntryRow(entry) {
  return '<article class="structure-row"><div><span class="badge ' + (entry.severity === 'error' ? 'red' : entry.severity === 'warning' ? 'yellow' : '') + '">' + esc(entry.category) + '</span><code>' + esc(entry.path) + '</code></div><div class="structure-meta">' + esc(entry.message || entry.owner_label || entry.owner_id || 'generated claim') + '</div>' + sourceDetails('source refs', entry.refs || []) + '</article>';
}

function card(title, body) { return '<article class="card"><h3>' + esc(title) + '</h3>' + body + '</article>'; }
function healthClass(color) { return color === 'red' ? 'red' : color === 'yellow' ? 'yellow' : ''; }
function categoryById(id) { return (state.product?.categories || []).find((entry) => entry.id === id); }
function sourceDetails(title, value) {
  const text = Array.isArray(value) ? value.filter(Boolean).join('\n') : String(value || '');
  return '<details class="source-drawer"><summary>' + esc(title) + '</summary><pre>' + esc(text || '—') + '</pre></details>';
}
function signal(title, body) { return '<section class="signal"><h3>' + esc(title) + '</h3>' + body + '</section>'; }
function bullets(items) {
  const values = (items || []).filter(Boolean);
  if (!values.length) return '<p class="muted">—</p>';
  return '<ul class="mini-list">' + values.map((item) => '<li>' + esc(item) + '</li>').join('') + '</ul>';
}
function firstValue(items, fallback) { return (items || []).find((item) => String(item || '').trim()) || fallback; }

function renderProduct() {
  const visible = [categoryById('stories'), categoryById('uis')].filter(Boolean);
  const users = categoryById('users')?.items || [];
  $('product').innerHTML = '<div class="section-head"><h2>Product</h2><p>User outcomes first. Stories and UI surfaces are primary; audience/source detail opens only when useful.</p></div>'
    + '<div class="grid" style="margin-bottom:0.75rem">'
    + card('Disclosure rule', '<p>Show stories + UI first. Keep users, Markdown, and paths behind context.</p><p><span class="badge">observability</span><span class="badge">alignment</span></p>')
    + card('Audience context', '<div class="big">' + users.length + '</div><div class="muted">user docs available after selection</div>')
    + '</div>'
    + visible.map((category) => '<section class="product-category"><h3>' + esc(category.label) + '</h3><p class="muted">' + esc(category.summary) + '</p><div class="source-grid">'
      + (category.items || []).map((item) => '<button class="source-card product-card" data-category="' + esc(category.id) + '" data-product="' + esc(item.id) + '"><h3>' + esc(item.title) + '</h3><p>' + esc(item.summary) + '</p><p><span class="badge">' + esc(category.id === 'stories' ? 'story' : 'ui') + '</span>' + (item.state ? '<span class="badge">' + esc(item.state) + '</span>' : '') + '</p></button>').join('')
      + '</div></section>').join('');
  document.querySelectorAll('.product-card').forEach((card) => card.addEventListener('click', () => inspectProductItem(card.dataset.category, card.dataset.product)));
}

function inspectProductItem(categoryId, itemId) {
  const category = categoryById(categoryId);
  const item = category?.items?.find((entry) => entry.id === itemId);
  if (!item) return;
  const users = categoryById('users')?.items || [];
  const sourceText = [item.path, '', ...(item.sections || []).map((s) => '## ' + s.title + '\n' + s.body)];
  $('inspector').innerHTML = '<div class="drawer-eyebrow">Product alignment</div><h2>' + esc(item.title) + '</h2><p>' + esc(item.summary) + '</p>'
    + '<p><span class="badge">' + esc(category.label) + '</span>' + (item.state ? '<span class="badge">' + esc(item.state) + '</span>' : '') + '</p>'
    + signal('Why this matters', '<p>' + esc(categoryId === 'stories' ? 'Story expresses a user outcome the UI/system should support.' : 'UI surface is where the story becomes visible to the user.') + '</p>')
    + signal('Audience context', bullets(users.slice(0, 4).map((user) => user.title + ': ' + user.summary)))
    + signal('Next safe action', '<p class="next-action">Trace this ' + esc(categoryId === 'stories' ? 'story' : 'surface') + ' to Board work or Graph evidence before changing code.</p>')
    + sourceDetails('Source Markdown', sourceText);
}

function renderSystem() {
  const catalog = state.system?.diagram_catalog || [];
  const options = catalog.map((diagram) => '<option value="' + esc(diagram.id) + '"' + (diagram.id === state.systemDiagramId ? ' selected' : '') + '>' + esc(diagram.title) + '</option>').join('');
  const controls = '<div class="toolbar"><label>diagram <select id="systemDiagramSelect">' + options + '</select></label><span id="systemDiagramPurpose" class="muted"></span><button data-zoom="system:out">−</button><button data-zoom="system:in">+</button><button data-zoom="system:fit">fit</button><button data-zoom="system:reset">reset</button></div>';
  $('system').innerHTML = controls + '<div id="systemDiagram" class="diagram canvas"></div>';
  $('systemDiagramSelect')?.addEventListener('change', () => { state.systemDiagramId = $('systemDiagramSelect').value; drawSystemDiagram(); inspectDiagram(); });
  wireZoomControls();
  drawSystemDiagram();
}

function activeDiagram() {
  const diagrams = state.system?.diagrams || [];
  return diagrams.find((diagram) => diagram.id === state.systemDiagramId) || diagrams[0] || null;
}

function drawSystemDiagram() {
  const diagram = activeDiagram();
  if (!diagram) {
    $('systemDiagram').innerHTML = '<div class="empty-state"><h2>No system diagrams</h2><p>Create YAML diagram specs in .codewiki/kb/system/diagrams/.</p></div>';
    return;
  }
  $('systemDiagramPurpose').textContent = diagram.kind + ' · ' + diagram.path;
  const layout = layoutDiagram(diagram.nodes || []);
  const boxW = layout.boxW, boxH = layout.boxH;
  let svg = '<svg width="' + Math.round(layout.width * state.systemZoom) + '" height="' + Math.round(layout.height * state.systemZoom) + '" viewBox="0 0 ' + layout.width + ' ' + layout.height + '" role="img" aria-label="' + esc(diagram.title) + '"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#c7a35a" /></marker></defs>';
  (diagram.edges || []).forEach((edge, index) => {
    const a = layout.pos.get(edge.from), b = layout.pos.get(edge.to);
    if (!a || !b) return;
    svg += '<path class="edge" data-edge="' + index + '" d="' + routeEdge(a, b, boxW, boxH) + '" /><text x="' + Math.round((a.x + b.x) / 2 + boxW / 2) + '" y="' + Math.round((a.y + b.y) / 2 + boxH / 2 - 6) + '" fill="#899488" font-size="9">' + esc(trim(edge.label, 28)) + '</text>';
  });
  for (const node of diagram.nodes || []) {
    const p = layout.pos.get(node.id); if (!p) continue;
    const fill = node.kind === 'actor' ? 'rgba(199,163,90,0.10)' : 'rgba(180,190,172,0.10)';
    svg += '<g class="node" data-id="' + esc(node.id) + '"><rect x="' + p.x + '" y="' + p.y + '" width="' + boxW + '" height="' + boxH + '" rx="4" fill="' + fill + '" stroke="rgba(180,190,172,0.42)" />'
      + '<text x="' + (p.x + 12) + '" y="' + (p.y + 25) + '" fill="#f4f1e8" font-size="13">' + esc(trim(node.label, 28)) + '</text>'
      + '<text x="' + (p.x + 12) + '" y="' + (p.y + 44) + '" fill="#899488" font-size="10">' + esc(trim(node.doc_path || node.kind, 34)) + '</text></g>';
  }
  svg += '</svg>';
  $('systemDiagram').innerHTML = svg;
  document.querySelectorAll('#systemDiagram .node').forEach((node) => node.addEventListener('click', () => inspectDiagramNode(node.dataset.id)));
  document.querySelectorAll('#systemDiagram .edge').forEach((edge) => edge.addEventListener('click', () => inspectDiagramEdge(Number(edge.dataset.edge))));
}

function layoutDiagram(nodes) {
  const boxW = 220, boxH = 64, colW = 295, rowH = 118, marginX = 34, marginY = 44;
  const pos = new Map();
  const columns = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, nodes.length))));
  nodes.forEach((node, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    pos.set(String(node.id), { x: marginX + col * colW, y: marginY + row * rowH });
  });
  const values = Array.from(pos.values());
  const width = Math.max(980, Math.max(...values.map((p) => p.x), marginX) + boxW + marginX);
  const height = Math.max(620, Math.max(...values.map((p) => p.y), marginY) + boxH + marginY);
  return { pos, boxW, boxH, width, height };
}

function routeEdge(a, b, boxW, boxH) {
  const sx = a.x + boxW;
  const sy = a.y + boxH / 2;
  const ex = b.x;
  const ey = b.y + boxH / 2;
  const midX = Math.abs(ex - sx) < 30 ? sx + 44 : (sx + ex) / 2;
  return 'M ' + sx + ' ' + sy + ' H ' + midX + ' V ' + ey + ' H ' + ex;
}

function inspectDiagram() {
  const diagram = activeDiagram();
  if (!diagram) return;
  $('inspector').innerHTML = '<div class="drawer-eyebrow">System alignment</div><h2>' + esc(diagram.title) + '</h2><p>' + esc(diagram.purpose) + '</p><p><span class="badge">' + esc(diagram.kind) + '</span></p>'
    + signal('What to observe', '<p>This diagram shows one source-backed view of system shape. Select a node or edge to focus the evidence.</p>')
    + signal('Next safe action', '<p class="next-action">Select a component/relationship, then compare its summary with linked source docs before changing architecture.</p>')
    + sourceDetails('Diagram source', [diagram.path, ...(diagram.source_docs || [])]);
}

function inspectDiagramNode(id) {
  const diagram = activeDiagram();
  const node = diagram?.nodes?.find((item) => String(item.id) === id);
  if (!node) return;
  document.querySelectorAll('#systemDiagram .node').forEach((el) => el.classList.toggle('selected', el.dataset.id === id));
  document.querySelectorAll('#systemDiagram .edge').forEach((el) => el.classList.remove('selected'));
  $('inspector').innerHTML = '<div class="drawer-eyebrow">Component focus</div><h2>' + esc(node.label) + '</h2><p>' + esc(node.summary) + '</p><p><span class="badge">' + esc(node.kind) + '</span></p>'
    + signal('Alignment cue', '<p>' + esc(node.doc_path ? 'Linked to a canonical system doc.' : 'No specific system doc path exposed by this diagram node.') + '</p>')
    + signal('Next safe action', '<p class="next-action">Open related roadmap/graph evidence before editing this component.</p>')
    + sourceDetails('Source', [node.doc_path || diagram.path]);
}

function inspectDiagramEdge(index) {
  const diagram = activeDiagram();
  const edge = diagram?.edges?.[index];
  if (!edge) return;
  document.querySelectorAll('#systemDiagram .node').forEach((el) => el.classList.remove('selected'));
  document.querySelectorAll('#systemDiagram .edge').forEach((el) => el.classList.toggle('selected', Number(el.dataset.edge) === index));
  $('inspector').innerHTML = '<div class="drawer-eyebrow">Relationship focus</div><h2>' + esc(edge.from + ' → ' + edge.to) + '</h2><p>' + esc(edge.label || 'Diagram relationship') + '</p><p><span class="badge">' + esc(edge.kind) + '</span></p>'
    + signal('Why this matters', '<p>Relationships reveal coupling and workflow direction; they should stay aligned with source docs and code paths.</p>')
    + signal('Next safe action', '<p class="next-action">Check source docs and Graph evidence before changing dependency direction.</p>')
    + sourceDetails('Source', [diagram.path, edge.from + ' -> ' + edge.to, edge.label]);
}

function renderBoard() {
  const board = state.board;
  const lanes = boardLanes(board.tasks || []);
  $('board').innerHTML = '<div class="section-head"><h2>Board</h2><p>Retro Kanban over roadmap truth: work state, gates, blockers, and next safe action.</p></div><div class="grid" style="margin-bottom:0.75rem">'
    + card('Open', '<div class="big">' + board.stats.open + '</div><div class="muted">done ' + board.stats.done + ' · blocked ' + board.stats.blocked + '</div>')
    + card('Active sprints', '<div class="big">' + board.active_sprints.length + '</div><div class="muted">planned/active scopes</div>')
    + card('Lane rule', '<p>Cards move by roadmap status, focus, and gates. No hidden browser Kanban state.</p>')
    + '</div><div class="kanban">'
    + lanes.map((lane) => '<section class="kanban-lane"><div class="lane-head"><h3>' + esc(lane.label) + '</h3><span class="badge">' + lane.tasks.length + '</span></div><p class="muted">' + esc(lane.summary) + '</p>'
      + (lane.tasks.length ? lane.tasks.map(boardTaskCard).join('') : '<div class="empty-state"><p>—</p></div>')
      + '</section>').join('')
    + '</div>';
  document.querySelectorAll('.board-card').forEach((card) => card.addEventListener('click', () => inspectBoardTask(card.dataset.task)));
}

function boardLanes(tasks) {
  const lanes = [
    { id: 'now', label: 'Now', summary: 'Focused, in progress, or first safe task.', tasks: [] },
    { id: 'ready', label: 'Ready', summary: 'Known work waiting for capacity.', tasks: [] },
    { id: 'blocked', label: 'Blocked', summary: 'Needs decision, policy, validation, or dependency.', tasks: [] },
    { id: 'gate', label: 'Gate', summary: 'Needs validation gateway, proof, or recent closure evidence.', tasks: [] },
  ];
  const byId = new Map(lanes.map((lane) => [lane.id, lane]));
  tasks.forEach((task, index) => byId.get(laneForTask(task, index)).tasks.push(task));
  return lanes;
}

function laneForTask(task, index) {
  const status = String(task.status || '').toLowerCase();
  if (status === 'blocked') return 'blocked';
  if (status === 'done') return 'gate';
  if (index === 0 || status === 'in_progress') return 'now';
  return 'ready';
}

function boardTaskCard(task) {
  const next = taskNextAction(task);
  return '<button class="kanban-card board-card" data-task="' + esc(task.id) + '"><div class="terminal-prompt">' + esc(task.status) + '</div><h4>' + esc(task.id + ' · ' + task.title) + '</h4><p>' + esc(task.summary) + '</p><p><span class="badge">' + esc(task.priority) + '</span></p><p class="next-action">next: ' + esc(next) + '</p></button>';
}

function taskNextAction(task) {
  const status = String(task.status || '').toLowerCase();
  if (status === 'blocked') return 'resolve blocker / ask user';
  if (status === 'done') return 'review closure evidence';
  return firstValue(task.verification, 'resume implementation');
}

function inspectBoardTask(taskId) {
  const task = (state.board?.tasks || []).find((item) => item.id === taskId);
  if (!task) return;
  document.querySelectorAll('.board-card').forEach((el) => el.classList.toggle('active', el.dataset.task === taskId));
  const sources = [...(task.spec_paths || []), ...(task.code_paths || [])];
  $('inspector').innerHTML = '<div class="drawer-eyebrow">Roadmap alignment</div><h2>' + esc(task.id + ' · ' + task.title) + '</h2><p>' + esc(task.summary) + '</p>'
    + '<p><span class="badge">' + esc(task.status) + '</span><span class="badge">' + esc(task.priority) + '</span></p>'
    + signal('Outcome target', '<p>' + esc(firstValue(task.acceptance, 'No acceptance target exposed.')) + '</p>')
    + signal('Gate / check', '<p>' + esc(firstValue(task.verification, 'No verification gate exposed.')) + '</p>')
    + signal('Next safe action', '<p class="next-action">' + esc(taskNextAction(task)) + '</p>')
    + sourceDetails('Sources and full criteria', [...sources, '', 'Acceptance:', ...(task.acceptance || []).map((item) => '- ' + item), '', 'Verification:', ...(task.verification || []).map((item) => '- ' + item)]);
}

function renderSettingsPanel() {
  const settings = state.settings;
  if (!settings) return;
  const groups = settings.groups || [];
  $('settingsPanel').innerHTML = '<div class="settings-head"><div><h2>Settings</h2><p class="muted">Source-backed map of ' + esc(settings.source_path) + '. Values are read-only unless a future API-backed safe edit is added.</p></div><button id="settingsClose" class="icon-button" type="button" aria-label="Close settings">×</button></div>'
    + '<div class="settings-grid">' + groups.map((group) => '<section class="settings-group"><h3>' + esc(group.label) + '</h3><p class="muted">' + esc(group.summary) + '</p>'
      + (group.rows || []).map((row) => '<article class="settings-row"><div class="settings-path">' + esc(row.path) + '</div><div class="settings-value">' + esc(row.value) + '</div><div class="settings-meta">' + esc(row.purpose) + '</div><div class="settings-meta">' + esc(row.source_path) + ' · ' + esc(row.editability) + '</div></article>').join('')
      + '</section>').join('') + '</div>';
  $('settingsClose')?.addEventListener('click', () => toggleSettings(false));
}

function renderGraph() {
  const model = state.graph;
  const nodeOptions = ['all'].concat(model.node_kinds).map((kind) => '<option value="' + esc(kind) + '">' + esc(kind) + '</option>').join('');
  const edgeOptions = ['all'].concat(model.edge_kinds).map((kind) => '<option value="' + esc(kind) + '">' + esc(kind) + '</option>').join('');
  $('graph').innerHTML = '<div class="section-head"><h2>CodeWiki map</h2><p>Work-centered graph slice over roadmap tasks, builds, validation, evidence, drift, and source paths.</p></div><div class="toolbar"><label>scope <select id="graphScope"><option value="work">work</option><option value="core">core</option><option value="all">all</option></select></label><label>node kind <select id="nodeKind">' + nodeOptions + '</select></label><label>edge kind <select id="edgeKind">' + edgeOptions + '</select></label><label>search <input id="graphSearch" placeholder="node id/path"></label><button data-zoom="graph:out">−</button><button data-zoom="graph:in">+</button><button data-zoom="graph:fit">fit</button><button data-zoom="graph:reset">reset</button><span id="graphStats" class="badge">shown ' + model.stats.shown_nodes + '/' + model.stats.total_nodes + '</span></div><div id="graphMap" class="graphmap canvas"></div>';
  $('graphScope').addEventListener('change', drawGraphMap);
  $('nodeKind').addEventListener('change', drawGraphMap);
  $('edgeKind').addEventListener('change', drawGraphMap);
  $('graphSearch').addEventListener('input', drawGraphMap);
  wireZoomControls();
  drawGraphMap();
}

function drawGraphMap() {
  const container = $('graphMap');
  const model = state.graph;
  const scope = $('graphScope')?.value || 'work';
  const nodeKind = $('nodeKind')?.value || 'all';
  const edgeKind = $('edgeKind')?.value || 'all';
  const query = ($('graphSearch')?.value || '').toLowerCase();
  const maxNodes = scope === 'all' ? 150 : scope === 'core' ? 90 : 70;
  const nodes = model.nodes.filter((node) => scopeMatchesGraphNode(node, scope) && (nodeKind === 'all' || node.kind === nodeKind) && (!query || String(node.id + ' ' + (node.path || '') + ' ' + (node.label || '')).toLowerCase().includes(query))).slice(0, maxNodes);
  const ids = new Set(nodes.map((node) => String(node.id)));
  const edges = model.edges.filter((edge) => ids.has(String(edge.from)) && ids.has(String(edge.to)) && (edgeKind === 'all' || edge.kind === edgeKind)).slice(0, scope === 'all' ? 280 : 150);
  state.drawnEdges = edges;
  $('graphStats').textContent = 'shown ' + nodes.length + '/' + model.stats.total_nodes + ' · edges ' + edges.length + '/' + model.stats.total_edges + ' · cytoscape';
  destroyGraphRenderer();
  if (!container) return;
  container.innerHTML = '';
  if (!window.cytoscape) {
    container.innerHTML = '<div class="cy-error"><h2>Graph renderer unavailable</h2><p>Cytoscape.js did not load from the local vendor asset.</p><pre>/assets/vendor/cytoscape.min.js</pre></div>';
    return;
  }
  const cy = window.cytoscape({
    container,
    elements: buildCytoscapeElements(nodes, edges),
    wheelSensitivity: 0.18,
    minZoom: 0.05,
    maxZoom: 2.8,
    style: createGraphStyle(),
    layout: layoutForGraph(nodes, edges),
  });
  state.cy = cy;
  cy.on('tap', 'node', (event) => inspectGraphNode(String(event.target.data('id'))));
  cy.on('tap', 'edge', (event) => inspectGraphEdge(Number(event.target.data('index'))));
  cy.one('layoutstop', () => fitGraph(cy));
  cy.ready(() => { fitGraph(cy); window.requestAnimationFrame(() => fitGraph(cy)); });
}

function scopeMatchesGraphNode(node, scope) {
  if (scope === 'all') return true;
  if (scope === 'work') return isWorkGraphNode(node);
  return isCoreGraphNode(node);
}

function isWorkGraphNode(node) {
  const id = String(node.id || '');
  const kind = String(node.kind || '');
  const path = String(node.path || '');
  if (kind === 'lens_family') return true;
  return kind.includes('task') || kind.includes('roadmap') || kind.includes('build') || kind.includes('validation') || kind.includes('evidence') || kind.includes('closure') || id.includes('TASK-') || path.includes('/roadmap') || path.includes('/builds/') || path.includes('/validation/');
}

function destroyGraphRenderer() { if (state.cy) { state.cy.destroy(); state.cy = null; } }
function fitGraph(cy) { cy.fit(cy.elements(), GRAPH_FIT_PADDING); }

function buildCytoscapeElements(nodes, edges) {
  const elements = [];
  for (const node of nodes) {
    const id = String(node.id);
    elements.push({ group: 'nodes', data: { id, kind: String(node.kind || 'unknown'), label: String(node.label || node.path || node.id || 'node'), displayLabel: trim(node.label || node.path || node.id, 28), path: node.path || '', color: colorForKind(node.kind) } });
  }
  edges.forEach((edge, index) => {
    elements.push({ group: 'edges', data: { id: 'edge:' + index + ':' + edge.from + '->' + edge.to, source: String(edge.from), target: String(edge.to), kind: String(edge.kind || 'edge'), displayKind: trim(edge.kind || 'edge', 18), label: edge.label || '', index } });
  });
  return elements;
}

function createGraphStyle() {
  return [
    { selector: 'core', style: { 'active-bg-color': '#f4f1e8', 'active-bg-opacity': 0.08, 'selection-box-color': '#f4f1e8', 'selection-box-opacity': 0.08, 'selection-box-border-color': '#f4f1e8' } },
    { selector: 'node', style: { 'background-color': 'data(color)', 'border-color': '#b4beac', 'border-opacity': 0.5, 'border-width': 1.4, 'color': '#f4f1e8', 'font-family': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', 'font-size': 10, 'height': 26, 'label': 'data(displayLabel)', 'min-zoomed-font-size': 6, 'overlay-color': '#f4f1e8', 'overlay-opacity': 0.04, 'shape': 'round-rectangle', 'text-background-color': '#050604', 'text-background-opacity': 0.72, 'text-background-padding': 2, 'text-halign': 'right', 'text-margin-x': 8, 'text-valign': 'center', 'width': 26 } },
    { selector: 'edge', style: { 'color': '#899488', 'curve-style': 'bezier', 'font-family': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', 'font-size': 8, 'label': 'data(displayKind)', 'line-color': '#899488', 'min-zoomed-font-size': 7, 'opacity': 0.64, 'target-arrow-color': '#c7a35a', 'target-arrow-shape': 'triangle', 'text-background-color': '#050604', 'text-background-opacity': 0.7, 'text-background-padding': 1, 'text-rotation': 'autorotate', 'width': 1.1 } },
    { selector: 'node:selected', style: { 'border-color': '#f4f1e8', 'border-width': 4, 'color': '#f4f1e8' } },
    { selector: 'edge:selected', style: { 'line-color': '#f4f1e8', 'opacity': 1, 'target-arrow-color': '#f4f1e8', 'width': 2.6 } },
  ];
}

function layoutForGraph(nodes, edges) {
  if (nodes.length <= 8) return { name: 'circle', fit: true, padding: GRAPH_FIT_PADDING, avoidOverlap: true, nodeDimensionsIncludeLabels: true, spacingFactor: 1.8 };
  if (edges.length === 0) return { name: 'grid', fit: true, padding: GRAPH_FIT_PADDING, avoidOverlap: true, nodeDimensionsIncludeLabels: true, spacingFactor: 2.1 };
  return { name: 'cose', animate: false, componentSpacing: GRAPH_LAYOUT_SPACING, coolingFactor: 0.96, edgeElasticity: 48, fit: true, gravity: 0.08, idealEdgeLength: GRAPH_LAYOUT_SPACING, initialTemp: 300, minTemp: 1, nestingFactor: 1.0, nodeDimensionsIncludeLabels: true, nodeOverlap: 72, nodeRepulsion: GRAPH_NODE_REPULSION, numIter: 1400, padding: GRAPH_FIT_PADDING, randomize: true };
}

function isCoreGraphNode(node) {
  const id = String(node.id || '');
  const kind = String(node.kind || '');
  if (kind === 'lens_family') return true;
  if (kind.includes('code_path') || id.startsWith('code:')) return false;
  if (id.includes('/builds/') && !id.includes('2026-05-')) return false;
  return true;
}

function inspectGraphNode(id) {
  if (state.cy) { state.cy.elements().unselect(); const selected = state.cy.getElementById(id); if (selected?.length) selected.select(); }
  const node = state.graph.nodes.find((item) => String(item.id) === id);
  if (!node) return;
  const links = state.graph.edges.filter((edge) => edge.from === id || edge.to === id).slice(0, 20);
  $('inspector').innerHTML = '<div class="drawer-eyebrow">Graph evidence</div><h2>' + esc(node.label || node.id) + '</h2><p><span class="badge">' + esc(node.kind) + '</span></p>'
    + signal('What this tells you', '<p>Generated relationship node. Use it to find alignment evidence, not as canonical truth.</p>')
    + signal('Connected evidence', '<p>' + esc(links.length + ' visible relationship(s) in current slice.') + '</p>')
    + signal('Next safe action', '<p class="next-action">Open the canonical source path or linked roadmap/build before editing.</p>')
    + sourceDetails('Generated graph record', [JSON.stringify(node, null, 2), '', 'Edges:', JSON.stringify(links, null, 2)]);
}

function inspectGraphEdge(index) {
  if (state.cy) { state.cy.elements().unselect(); const selected = state.cy.edges().filter((edge) => Number(edge.data('index')) === index); if (selected.length) selected.select(); }
  const edge = state.drawnEdges?.[index];
  if (!edge) return;
  $('inspector').innerHTML = '<div class="drawer-eyebrow">Graph relationship</div><h2>' + esc(edge.from + ' → ' + edge.to) + '</h2><p><span class="badge">' + esc(edge.kind) + '</span></p>'
    + signal('What this tells you', '<p>Generated edge showing how current CodeWiki sources relate.</p>')
    + signal('Next safe action', '<p class="next-action">Follow source nodes; make canonical changes through compiler/API flows.</p>')
    + sourceDetails('Generated edge record', JSON.stringify(edge, null, 2));
}

function wireZoomControls() {
  document.querySelectorAll('[data-zoom]').forEach((button) => {
    button.onclick = () => {
      const [target, action] = button.dataset.zoom.split(':');
      if (target === 'system') { state.systemZoom = nextZoom(state.systemZoom, action, 0.78, 1); drawSystemDiagram(); }
      if (target === 'graph') controlGraphViewport(action);
    };
  });
}

function controlGraphViewport(action) {
  if (!state.cy) { state.graphZoom = nextZoom(state.graphZoom, action, 0.68, 1); drawGraphMap(); return; }
  if (action === 'fit') { fitGraph(state.cy); return; }
  if (action === 'reset') { state.cy.reset(); fitGraph(state.cy); return; }
  const box = state.cy.container().getBoundingClientRect();
  const renderedPosition = { x: box.width / 2, y: box.height / 2 };
  const factor = action === 'in' ? 1.18 : 1 / 1.18;
  const level = Math.max(state.cy.minZoom(), Math.min(state.cy.maxZoom(), state.cy.zoom() * factor));
  state.cy.zoom({ level, renderedPosition });
}

function nextZoom(current, action, fitValue, resetValue) {
  if (action === 'in') return Math.min(1.8, Math.round((current + 0.12) * 100) / 100);
  if (action === 'out') return Math.max(0.45, Math.round((current - 0.12) * 100) / 100);
  if (action === 'fit') return fitValue;
  return resetValue;
}

function inspectStatus() {
  const m = state.model;
  if (!m) return;
  const fileStructure = m.file_structure;
  $('inspector').innerHTML = '<div class="drawer-eyebrow">Status alignment</div><h2>Current repo signal</h2><p><span class="badge">' + esc(m.health.color) + '</span><span class="badge">local-first</span><span class="badge">second-screen</span></p>'
    + signal('What to watch', '<p>' + esc(m.latest_signal || 'No validation/check signal found.') + '</p>')
    + signal('File-structure drift', fileStructure ? '<p><span class="badge">actionable ' + fileStructure.actionable_entries.length + '</span><span class="badge">approved ' + fileStructure.approved_migration_deltas.length + '</span></p><p class="muted">Approved migration deltas are reported separately from actionable drift.</p>' : '<p class="muted">No generated file-structure lens loaded.</p>')
    + signal('Next safe action', '<p class="next-action">' + esc(m.next_action?.summary || 'Choose Product, System, Board, or Graph for context.') + '</p>')
    + sourceDetails('Status sources', ['.codewiki/index_graph.json', '.codewiki/roadmap/queue.json', '.codewiki/session/queue.json', ...(fileStructure?.source_refs || [])])
    + (fileStructure ? sourceDetails('Generated file-structure evidence', JSON.stringify(fileStructure, null, 2)) : '');
}

function inspectArea(id) {
  const area = AREAS.find((entry) => entry.id === id);
  if (!area) return;
  $('inspector').innerHTML = '<div class="drawer-eyebrow">Section purpose</div><h2>' + esc(area.glyph + ' ' + area.label) + '</h2><p>' + esc(area.summary) + '</p>'
    + signal('Alignment rule', '<p>Default view should show only what helps observe intended state, actual state, gap, or next action.</p>')
    + signal('Next safe action', '<p class="next-action">Open a card, node, lane, or selected entity for focused context.</p>')
    + sourceDetails('Source anchors', area.sources);
}

function colorForKind(kind) {
  const value = String(kind || 'unknown');
  if (value === 'lens_family') return '#8bbf8b';
  if (value.includes('task') || value.includes('roadmap')) return '#c7a35a';
  if (value.includes('build')) return '#a7a06d';
  if (value.includes('validation')) return '#d46a66';
  if (value.includes('doc') || value.includes('knowledge')) return '#f4f1e8';
  return '#7f927f';
}

function trim(value, max) {
  const text = String(value ?? '');
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

boot();
`;
