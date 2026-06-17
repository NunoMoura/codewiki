import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import {
	sourceMapComponentById,
	sourceMapOwnerForPath,
	type SourceMapComponent,
} from "../knowledge/source-map.ts";
import { readProjectSourceMap } from "./state-file.ts";

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

export interface ProjectExplainView {
	target?: string;
	kind: ProjectExplainKind;
	title: string;
	summary: string;
	refs: string[];
	sections: ProjectExplainSection[];
}

export interface BuildProjectExplainInput {
	repoRoot: string;
	target?: string;
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
		return pathExplain(
			target,
			sourceMap ? sourceMapOwnerForPath(sourceMap, target) : undefined,
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
		".codewiki/kb/system/overview.md",
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
			".codewiki/kb/system/overview.md",
			".codewiki/kb/system/api-tools.md",
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
					"Primary host UX is Pi-owned /wiki commands and wiki_* tools.",
					"Tool rendering should expose semantic progress without adding model-token cost.",
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
		summary: component.role || `Source-map component ${component.id}.`,
		refs: [component.doc],
		sections: [
			{ title: "Source", items: component.sourcePatterns },
			{ title: "Tests", items: component.testPatterns },
			{ title: "Generated views", items: component.generatedViews },
			{ title: "Trace events", items: component.traceEvents },
		].filter((section) => section.items.length > 0),
	};
}

function pathExplain(
	target: string,
	owner: SourceMapComponent | undefined,
): ProjectExplainView {
	if (!owner) {
		return {
			target,
			kind: "path",
			title: `Path: ${target}`,
			summary: "No source-map owner was found for this path.",
			refs: [".codewiki/kb/system/source-map.yaml"],
			sections: [
				{
					title: "Next",
					items: ["Add or adjust source-map ownership before broad edits."],
				},
			],
		};
	}
	return {
		target,
		kind: "path",
		title: `Path: ${target}`,
		summary: `Owned by component ${owner.id}.`,
		refs: [owner.doc, ".codewiki/kb/system/source-map.yaml"],
		sections: [
			{ title: "Component", items: [owner.id] },
			{ title: "Relevant docs", items: [owner.doc] },
			{ title: "Tests", items: owner.testPatterns },
			{ title: "Trace events", items: owner.traceEvents },
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
		refs: [".codewiki/kb/system/source-map.yaml"],
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

function isNotFound(error: unknown): boolean {
	return Boolean(
		error &&
			typeof error === "object" &&
			"code" in error &&
			(error as { code?: unknown }).code === "ENOENT",
	);
}
