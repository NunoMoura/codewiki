import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import {
	pathMatchesPattern,
	sourceMapComponentById,
	sourceMapOwnerForPath,
	type SourceMapComponent,
	type SourceMapContract,
} from "../knowledge/source-map.ts";
import { sourceOwnershipMapFromOkfBundle } from "../knowledge/source-ownership.ts";
import type { OkfBundleFile } from "../knowledge/okf-validation.ts";
import { foldProjectTraceRecords } from "../traces/project.ts";
import type { TraceEvent, TraceRecord } from "../traces/types.ts";
import { buildQualityView } from "../views/quality.ts";
import type { QualityIterationSummary } from "../views/types.ts";
import { readProjectTraceRecords } from "./state-file.ts";

export type ProjectExplainKind =
	| "project"
	| "component"
	| "flow"
	| "path"
	| "unknown";

export interface ProjectExplainSection {
	title: string;
	items: string[];
}

export interface ProjectExplainOwnerSummary {
	componentId: string;
	doc: string;
	sourcePatterns: string[];
	testPatterns: string[];
	generatedViews: string[];
	traceEvents: string[];
	role?: string;
	testPolicy?: string;
	testRationale?: string;
}

export interface ProjectExplainQualitySummary {
	traceId: string;
	loop: string;
	eventId: string;
	ready: boolean;
	met: number;
	unmet: number;
	blocked: number;
	missing: number;
	blockers: string[];
}

export interface ProjectExplainView {
	target?: string;
	kind: ProjectExplainKind;
	title: string;
	summary: string;
	refs: string[];
	sections: ProjectExplainSection[];
	owner?: ProjectExplainOwnerSummary;
	traceRefs?: string[];
	quality?: ProjectExplainQualitySummary[];
}

interface BuildProjectExplainInput {
	repoRoot: string;
	target?: string;
}

async function readProjectSourceMap(
	repoRoot: string,
): Promise<SourceMapContract | undefined> {
	const bundleFiles = await readKnowledgeBundleFiles(repoRoot);
	if (bundleFiles.length === 0) return undefined;
	const ownership = sourceOwnershipMapFromOkfBundle(bundleFiles);
	return ownership.components.length > 0 ? ownership : undefined;
}

async function readKnowledgeBundleFiles(
	repoRoot: string,
): Promise<OkfBundleFile[]> {
	const kbRoot = join(repoRoot, ".codewiki", "kb");
	return await readKnowledgeBundleDirectory(kbRoot, ".codewiki/kb");
}

async function readKnowledgeBundleDirectory(
	absolutePath: string,
	relativePath: string,
): Promise<OkfBundleFile[]> {
	let entries: Array<{ name: string; isDirectory(): boolean }>;
	try {
		entries = await readdir(absolutePath, { withFileTypes: true });
	} catch (error) {
		if (isNotFound(error)) return [];
		throw error;
	}
	const nested = await Promise.all(
		entries.sort(byName).map(async (entry) => {
			const childAbsolute = join(absolutePath, entry.name);
			const childRelative = `${relativePath}/${entry.name}`;
			if (entry.isDirectory()) {
				return await readKnowledgeBundleDirectory(childAbsolute, childRelative);
			}
			if (!entry.name.endsWith(".md")) return [];
			return [
				{
					path: childRelative,
					content: await readFile(childAbsolute, "utf8"),
				},
			];
		}),
	);
	return nested.flat();
}

function byName(left: { name: string }, right: { name: string }): number {
	return left.name.localeCompare(right.name);
}

export async function buildProjectExplainView(
	input: BuildProjectExplainInput,
): Promise<ProjectExplainView> {
	const target = input.target?.trim();
	const sourceMap = await readProjectSourceMap(input.repoRoot);
	const flows = await readFlowSummaries(input.repoRoot);
	if (!target) return await projectExplain(input.repoRoot, flows);
	const flow = flows.find((candidate) => candidate.id === target);
	if (flow) return flowExplain(flow);
	const component = sourceMap
		? sourceMapComponentById(sourceMap, target)
		: undefined;
	if (component) return componentExplain(component);
	if (looksLikePath(target)) {
		const records = await readProjectTraceRecords(input.repoRoot);
		return pathExplain(
			target,
			sourceMap ? sourceMapOwnerForExplainPath(sourceMap, target) : undefined,
			records,
		);
	}
	return unknownExplain(
		target,
		sourceMap?.components.map((item) => item.id) || [],
		flows.map((item) => item.id),
	);
}

interface FlowSummary {
	id: string;
	title: string;
	summary: string;
	ref: string;
}

async function projectExplain(
	repoRoot: string,
	flows: FlowSummary[],
): Promise<ProjectExplainView> {
	const product = await readKbSummary(
		repoRoot,
		".codewiki/kb/product/overview.md",
	);
	const system = await readKbSummary(
		repoRoot,
		".codewiki/kb/system/components/overview.md",
	);
	return {
		kind: "project",
		title: "CodeWiki project",
		summary:
			product ||
			system ||
			"CodeWiki is a Pi-native software-development OS backed by KB docs, append-only traces, and generated views.",
		refs: [
			".codewiki/kb/product/overview.md",
			".codewiki/kb/system/components/overview.md",
			".codewiki/kb/system/components/api-tools.md",
		],
		sections: [
			{
				title: "Core model",
				items: [
					"Semantic loops: decision, planning, implementation.",
					"Runtime coordinates scheduling, claims, workers, and handoff; it is not a fourth loop.",
					"Trace JSONL files are workflow truth; generated views are disposable projections.",
				],
			},
			{
				title: "User experience",
				items: [
					"Primary host UX is the automatically opened Work Pipeline dashboard; /wiki-dashboard reopens or stops it, and focused /wiki-* commands remain available.",
					"Internal wiki_* tools provide agent trace context without becoming user UX.",
				],
			},
			...(flows.length
				? [
						{
							title: "Known flows",
							items: flows.map((flow) => flow.id),
						},
					]
				: []),
		],
	};
}

function componentExplain(component: SourceMapComponent): ProjectExplainView {
	return {
		target: component.id,
		kind: "component",
		title: `Component: ${component.id}`,
		summary: component.role || `Source owner component ${component.id}.`,
		refs: [component.doc],
		owner: ownerSummary(component),
		sections: [
			{ title: "Source", items: component.sourcePatterns },
			{ title: "Tests", items: testItems(component) },
			{ title: "Generated views", items: component.generatedViews },
			{ title: "Trace events", items: component.traceEvents },
		].filter((section) => section.items.length > 0),
	};
}

function pathExplain(
	target: string,
	owner: SourceMapComponent | undefined,
	records: TraceRecord[],
): ProjectExplainView {
	const traceRefs = traceRefsForPath(records, target, owner);
	const quality = qualityForPath(records, target, owner, traceRefs);
	if (!owner) {
		return {
			target,
			kind: "path",
			title: `Path: ${target}`,
			summary: "No OKF source owner was found for this path.",
			refs: unique([
				".codewiki/kb/system/components/source-map.md",
				...traceRefs,
			]),
			traceRefs,
			quality,
			sections: [
				{
					title: "Next",
					items: ["Add or adjust OKF ownership metadata before broad edits."],
				},
				{ title: "Trace refs", items: traceRefs },
				{ title: "Quality", items: qualityItems(quality) },
			].filter((section) => section.items.length > 0),
		};
	}
	return {
		target,
		kind: "path",
		title: `Path: ${target}`,
		summary: `Owned by component ${owner.id}.`,
		refs: unique([
			owner.doc,
			".codewiki/kb/system/components/source-map.md",
			...traceRefs,
		]),
		owner: ownerSummary(owner),
		traceRefs,
		quality,
		sections: [
			{ title: "Owner", items: ownerItems(owner) },
			{ title: "Relevant docs", items: [owner.doc] },
			{ title: "Tests", items: testItems(owner) },
			{ title: "Trace events", items: owner.traceEvents },
			{ title: "Trace refs", items: traceRefs },
			{ title: "Quality", items: qualityItems(quality) },
		].filter((section) => section.items.length > 0),
	};
}

function flowExplain(flow: FlowSummary): ProjectExplainView {
	return {
		target: flow.id,
		kind: "flow",
		title: `Flow: ${flow.title || flow.id}`,
		summary: flow.summary || `CodeWiki flow ${flow.id}.`,
		refs: [flow.ref],
		sections: [{ title: "Reference", items: [flow.ref] }],
	};
}

function unknownExplain(
	target: string,
	components: string[],
	flows: string[],
): ProjectExplainView {
	return {
		target,
		kind: "unknown",
		title: `CodeWiki explanation: ${target}`,
		summary: "No exact component, flow, or path owner matched this target.",
		refs: [".codewiki/kb/system/components/source-map.md"],
		sections: [
			{ title: "Known components", items: components.slice(0, 12) },
			{ title: "Known flows", items: flows.slice(0, 12) },
		].filter((section) => section.items.length > 0),
	};
}

async function readFlowSummaries(repoRoot: string): Promise<FlowSummary[]> {
	const root = join(repoRoot, ".codewiki", "kb", "system", "flows");
	let files: string[];
	try {
		files = await readdir(root);
	} catch (error) {
		if (isNotFound(error)) return [];
		throw error;
	}
	return await Promise.all(
		files
			.filter((file) => file.endsWith(".md"))
			.sort()
			.map(async (file) => {
				const ref = `.codewiki/kb/system/flows/${file}`;
				const content = await readFile(join(root, file), "utf8");
				return {
					id: basename(file, ".md"),
					title: firstHeading(content) || basename(file, ".md"),
					summary: firstParagraph(content),
					ref,
				};
			}),
	);
}

function sourceMapOwnerForExplainPath(
	map: SourceMapContract,
	target: string,
): SourceMapComponent | undefined {
	return (
		sourceMapOwnerForPath(map, target) ||
		map.components
			.filter((component) =>
				matchesAnyPattern(target, [
					component.doc,
					...component.testPatterns,
					...component.generatedViews,
				]),
			)
			.sort(
				(left, right) =>
					componentExplainSpecificity(right) -
					componentExplainSpecificity(left),
			)[0]
	);
}

function componentExplainSpecificity(component: SourceMapComponent): number {
	return Math.max(
		0,
		...[
			component.doc,
			...component.testPatterns,
			...component.generatedViews,
		].map((pattern) => pattern.replace(/\*/g, "").length),
	);
}

function traceRefsForPath(
	records: TraceRecord[],
	target: string,
	owner: SourceMapComponent | undefined,
): string[] {
	const fold = foldProjectTraceRecords(records);
	return unique(
		fold.events.flatMap((event) => eventTraceRefsForPath(event, target, owner)),
	);
}

function eventTraceRefsForPath(
	event: TraceEvent,
	target: string,
	owner: SourceMapComponent | undefined,
): string[] {
	return unique([
		...(refsTouchPath(event.refs, target, owner) ? [`trace:${event.id}`] : []),
		...decisionChangeRefsForPath(event, target, owner),
		...planningWorkRefsForPath(event, target, owner),
		...implementationChangeRefsForPath(event, target, owner),
	]);
}

function decisionChangeRefsForPath(
	event: TraceEvent,
	target: string,
	owner: SourceMapComponent | undefined,
): string[] {
	if (event.loop !== "decision") return [];
	const output = objectRecord(event.data?.output);
	return [
		...objectList(output.approvedChanges),
		...objectList(output.rejectedRows),
		...objectList(output.deferredRows),
	]
		.filter((change) =>
			refsTouchPath(stringList(change.sourceRefs), target, owner),
		)
		.map(
			(change) => `trace:${event.id}#change:${text(change.id) || "unknown"}`,
		);
}

function planningWorkRefsForPath(
	event: TraceEvent,
	target: string,
	owner: SourceMapComponent | undefined,
): string[] {
	if (event.loop !== "planning") return [];
	return objectList(objectRecord(event.data?.output).workItems)
		.filter((item) => planningWorkTouchesPath(item, target, owner))
		.map((item) => `trace:${event.id}#work:${text(item.id) || "unknown"}`);
}

function implementationChangeRefsForPath(
	event: TraceEvent,
	target: string,
	owner: SourceMapComponent | undefined,
): string[] {
	if (event.loop !== "implementation") return [];
	return objectList(objectRecord(event.data?.output).changes)
		.filter((change) => implementationChangeTouchesPath(change, target, owner))
		.map(
			(change) => `trace:${event.id}#change:${text(change.id) || "unknown"}`,
		);
}

function planningWorkTouchesPath(
	item: Record<string, unknown>,
	target: string,
	owner: SourceMapComponent | undefined,
): boolean {
	return (
		componentRefsTouchOwner(
			stringList(item.componentRefs ?? item.component_refs),
			owner,
		) ||
		refsTouchPath(
			[
				...stringList(item.pathScopes ?? item.path_scopes),
				...stringList(item.verification),
			],
			target,
			owner,
		)
	);
}

function implementationChangeTouchesPath(
	change: Record<string, unknown>,
	target: string,
	owner: SourceMapComponent | undefined,
): boolean {
	return refsTouchPath(
		[
			...stringList(change.codePaths ?? change.code_paths),
			...stringList(change.docPaths ?? change.doc_paths),
			...stringList(change.testPaths ?? change.test_paths),
			...stringList(change.publicationRefs ?? change.publication_refs),
		],
		target,
		owner,
	);
}

function qualityForPath(
	records: TraceRecord[],
	target: string,
	owner: SourceMapComponent | undefined,
	traceRefs: string[],
): ProjectExplainQualitySummary[] {
	const fold = foldProjectTraceRecords(records);
	const eventIds = new Set(traceRefs.map(eventIdFromTraceRef).filter(Boolean));
	return fold.traceIds.flatMap((traceId) =>
		buildQualityView({ records: fold.recordsByTrace[traceId] || [] })
			.iterations.filter(
				(iteration) =>
					eventIds.has(iteration.eventId) ||
					refsTouchPath(iteration.refs, target, owner),
			)
			.map(qualitySummary),
	);
}

function qualitySummary(
	iteration: QualityIterationSummary,
): ProjectExplainQualitySummary {
	return {
		traceId: iteration.traceId,
		loop: iteration.loop,
		eventId: iteration.eventId,
		ready: iteration.ready,
		met: iteration.standards.filter((standard) => standard.status === "met")
			.length,
		unmet: iteration.standards.filter((standard) => standard.status === "unmet")
			.length,
		blocked: iteration.standards.filter(
			(standard) => standard.status === "blocked",
		).length,
		missing: iteration.standards.filter(
			(standard) => standard.status === "missing",
		).length,
		blockers: [...iteration.blockers],
	};
}

function ownerSummary(
	component: SourceMapComponent,
): ProjectExplainOwnerSummary {
	return {
		componentId: component.id,
		doc: component.doc,
		sourcePatterns: [...component.sourcePatterns],
		testPatterns: [...component.testPatterns],
		generatedViews: [...component.generatedViews],
		traceEvents: [...component.traceEvents],
		...(component.role ? { role: component.role } : {}),
		...(component.testPolicy ? { testPolicy: component.testPolicy } : {}),
		...(component.testRationale
			? { testRationale: component.testRationale }
			: {}),
	};
}

function ownerItems(component: SourceMapComponent): string[] {
	return [
		component.id,
		...(component.role ? [`role: ${component.role}`] : []),
		...(component.testPolicy ? [`test policy: ${component.testPolicy}`] : []),
	];
}

function testItems(component: SourceMapComponent): string[] {
	return [
		...component.testPatterns,
		...(component.testRationale
			? [`test rationale: ${component.testRationale}`]
			: []),
	];
}

function qualityItems(quality: ProjectExplainQualitySummary[]): string[] {
	return quality.map((item) => {
		const status = item.ready ? "ready" : "blocked";
		const blockers = item.blockers.length
			? ` — ${item.blockers.slice(0, 2).join("; ")}`
			: "";
		return `${item.traceId} ${item.loop}: ${status} (${item.met} met, ${item.unmet} unmet, ${item.blocked} blocked, ${item.missing} missing)${blockers}`;
	});
}

function refsTouchPath(
	refs: string[],
	target: string,
	owner: SourceMapComponent | undefined,
): boolean {
	return refs.some((ref) => refTouchesPath(ref, target, owner));
}

function refTouchesPath(
	ref: string,
	target: string,
	owner: SourceMapComponent | undefined,
): boolean {
	const normalized = ref.trim();
	if (!normalized) return false;
	if (normalized === target) return true;
	if (pathMatchesPattern(target, normalized)) return true;
	if (pathMatchesPattern(normalized, target)) return true;
	if (!owner) return false;
	if (normalized === owner.id || normalized === `component.${owner.id}`) {
		return true;
	}
	if (normalized === owner.doc) return true;
	return matchesAnyPattern(normalized, [
		...owner.sourcePatterns,
		...owner.testPatterns,
		...owner.generatedViews,
	]);
}

function componentRefsTouchOwner(
	componentRefs: string[],
	owner: SourceMapComponent | undefined,
): boolean {
	if (!owner) return false;
	return componentRefs.some(
		(ref) => ref === owner.id || ref === `component.${owner.id}`,
	);
}

function matchesAnyPattern(path: string, patterns: string[]): boolean {
	return patterns.some((pattern) => pathMatchesPattern(path, pattern));
}

function eventIdFromTraceRef(ref: string): string {
	if (!ref.startsWith("trace:")) return "";
	return ref.slice("trace:".length).split("#")[0] || "";
}

async function readKbSummary(repoRoot: string, path: string): Promise<string> {
	try {
		return firstParagraph(await readFile(join(repoRoot, path), "utf8"));
	} catch (error) {
		if (isNotFound(error)) return "";
		throw error;
	}
}

function firstHeading(content: string): string {
	return (
		content
			.split(/\r?\n/)
			.find((line) => line.startsWith("# "))
			?.replace(/^#\s+/, "")
			.trim() || ""
	);
}

function firstParagraph(content: string): string {
	const lines = content.split(/\r?\n/);
	const paragraph: string[] = [];
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			if (paragraph.length > 0) break;
			continue;
		}
		paragraph.push(trimmed);
	}
	return paragraph.join(" ");
}

function looksLikePath(target: string): boolean {
	return (
		target.includes("/") ||
		target.startsWith(".") ||
		/\.[a-z0-9]+$/i.test(target)
	);
}

function objectRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function objectList(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is Record<string, unknown> =>
					typeof item === "object" && item !== null,
			)
		: [];
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => text(item)).filter(Boolean)
		: [];
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => text(value)).filter(Boolean)),
	);
}

function isNotFound(error: unknown): boolean {
	return Boolean(
		error &&
			typeof error === "object" &&
			"code" in error &&
			(error as { code?: unknown }).code === "ENOENT",
	);
}
