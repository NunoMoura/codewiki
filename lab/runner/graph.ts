#!/usr/bin/env node
import { createHash } from "node:crypto";
import { decisionLoopCandidate } from "../decision/loop.ts";
import { implementationLoopCandidate } from "../implementation/loop.ts";
import { planningLoopCandidate } from "../planning/loop.ts";
import {
	DECISION_CHANGE_GRAPH_HASH,
	DECISION_CHANGE_GRAPH_ID,
	DECISION_CHANGE_GRAPH_VERSION,
	DECISION_CHANGE_QUALITY_STANDARDS,
} from "../../src/decision/change-quality.ts";
import { IMPLEMENTATION_LOOP_GRAPH } from "../../src/implementation/loop.ts";
import {
	loopQualityGraphRef,
	type LoopQualityGraph,
} from "../../src/loops/graph.ts";
import {
	PLANNING_PORTFOLIO_GRAPH_HASH,
	PLANNING_PORTFOLIO_GRAPH_ID,
	PLANNING_PORTFOLIO_GRAPH_VERSION,
	PLANNING_PORTFOLIO_QUALITY_STANDARDS,
} from "../../src/planning/portfolio-quality.ts";
import type { LabLoop } from "./types.ts";

export interface LabGraphNodeSummary {
	id: string;
	layer: string;
	standardType: string;
	method: string;
	mode: string;
	weight: number;
	cost: number;
	repairTarget: string;
	hardGate: boolean;
}

export interface LabGraphLayerSummary {
	layer: string;
	nodeCount: number;
	totalWeight: number;
	totalCost: number;
}

export interface LabQualityPackSummary {
	id: string;
	version: string;
	authority: string;
	rollout: string;
}

export interface LabGraphSummary {
	graphId: string;
	graphVersion: string;
	schemaVersion: number;
	hash: string;
	nodeCount: number;
	layers: LabGraphLayerSummary[];
	nodes: LabGraphNodeSummary[];
	qualityPack?: LabQualityPackSummary;
}

export interface LabGraphDiff {
	sharedNodeIds: string[];
	productionOnlyNodeIds: string[];
	candidateOnlyNodeIds: string[];
	layerDeltas: Array<{
		layer: string;
		productionNodeCount: number;
		candidateNodeCount: number;
	}>;
}

export interface LabLoopGraphReport {
	loop: LabLoop;
	production: LabGraphSummary;
	candidate: LabGraphSummary;
	diff: LabGraphDiff;
}

export interface LabGraphReport {
	version: 1;
	loops: LabLoopGraphReport[];
}

interface GraphLike {
	graphId: string;
	hash?: string;
	graphVersion: string;
	schemaVersion: number;
	layers: string[];
	nodes?: GraphNodeLike[];
	standards?: GraphNodeLike[];
	qualityPack?: LabQualityPackSummary;
}

interface GraphNodeLike {
	id: string;
	layer?: string;
	standardType?: string;
	method?: string;
	mode?: string;
	weight: number;
	cost?: number;
	repairTarget?: string;
	hardGate?: boolean;
	description?: string;
}

const DECISION_CHANGE_GRAPH: GraphLike = {
	graphId: DECISION_CHANGE_GRAPH_ID,
	graphVersion: DECISION_CHANGE_GRAPH_VERSION,
	schemaVersion: 1,
	hash: DECISION_CHANGE_GRAPH_HASH,
	layers: ["hard_gate"],
	nodes: DECISION_CHANGE_QUALITY_STANDARDS.map((standard) => ({
		...standard,
		layer: "hard_gate",
		standardType: "loop_contract",
		weight: 10,
		cost: 10,
		repairTarget: "decision",
		hardGate: true,
	})),
};

const PLANNING_PORTFOLIO_GRAPH: GraphLike = {
	graphId: PLANNING_PORTFOLIO_GRAPH_ID,
	graphVersion: PLANNING_PORTFOLIO_GRAPH_VERSION,
	schemaVersion: 1,
	hash: PLANNING_PORTFOLIO_GRAPH_HASH,
	layers: ["hard_gate"],
	nodes: PLANNING_PORTFOLIO_QUALITY_STANDARDS.map((standard) => ({
		...standard,
		layer: "hard_gate",
		standardType: "loop_contract",
		weight: 10,
		cost: 10,
		repairTarget: "planning",
		hardGate: true,
	})),
};

const LOOP_GRAPHS: Array<{
	loop: LabLoop;
	production: GraphLike;
	candidate: GraphLike;
}> = [
	{
		loop: "decision",
		production: DECISION_CHANGE_GRAPH,
		candidate: candidateGraph(decisionLoopCandidate),
	},
	{
		loop: "planning",
		production: PLANNING_PORTFOLIO_GRAPH,
		candidate: candidateGraph(planningLoopCandidate),
	},
	{
		loop: "implementation",
		production: IMPLEMENTATION_LOOP_GRAPH,
		candidate: candidateGraph(implementationLoopCandidate),
	},
];

export function buildLabGraphReport(): LabGraphReport {
	return {
		version: 1,
		loops: LOOP_GRAPHS.map(({ loop, production, candidate }) => {
			const productionSummary = summarizeGraph(production, "production");
			const candidateSummary = summarizeGraph(candidate, "candidate");
			return {
				loop,
				production: productionSummary,
				candidate: candidateSummary,
				diff: diffGraphs(productionSummary, candidateSummary),
			};
		}),
	};
}

function candidateGraph(candidate: {
	graphId: string;
	graphVersion: string;
	schemaVersion: number;
	layers: string[];
	standards: GraphNodeLike[];
	qualityPack: LabQualityPackSummary;
}): GraphLike {
	return {
		graphId: candidate.graphId,
		graphVersion: candidate.graphVersion,
		schemaVersion: candidate.schemaVersion,
		layers: candidate.layers,
		nodes: candidate.standards,
		qualityPack: {
			id: candidate.qualityPack.id,
			version: candidate.qualityPack.version,
			authority: candidate.qualityPack.authority,
			rollout: candidate.qualityPack.rollout,
		},
	};
}

function summarizeGraph(
	graph: GraphLike,
	kind: "production" | "candidate",
): LabGraphSummary {
	const nodes = graphNodes(graph).map(nodeSummary);
	return {
		graphId: graph.graphId,
		graphVersion: graph.graphVersion,
		schemaVersion: graph.schemaVersion,
		hash: graphHash(graph, kind),
		nodeCount: nodes.length,
		layers: layerSummaries(graph.layers, nodes),
		nodes,
		...(graph.qualityPack ? { qualityPack: graph.qualityPack } : {}),
	};
}

function graphNodes(graph: GraphLike): GraphNodeLike[] {
	return graph.nodes || graph.standards || [];
}

function nodeSummary(node: GraphNodeLike): LabGraphNodeSummary {
	return {
		id: node.id,
		layer: node.layer || "unknown",
		standardType: node.standardType || "unknown",
		method: node.method || "deterministic",
		mode: node.mode || "deterministic",
		weight: node.weight,
		cost: node.cost || node.weight,
		repairTarget: node.repairTarget || "unknown",
		hardGate: Boolean(node.hardGate || node.layer === "hard_gate"),
	};
}

function layerSummaries(
	layers: string[],
	nodes: LabGraphNodeSummary[],
): LabGraphLayerSummary[] {
	const layerSet = new Set([...layers, ...nodes.map((node) => node.layer)]);
	return [...layerSet].map((layer) => {
		const layerNodes = nodes.filter((node) => node.layer === layer);
		return {
			layer,
			nodeCount: layerNodes.length,
			totalWeight: sum(layerNodes.map((node) => node.weight)),
			totalCost: sum(layerNodes.map((node) => node.cost)),
		};
	});
}

function diffGraphs(
	production: LabGraphSummary,
	candidate: LabGraphSummary,
): LabGraphDiff {
	const productionIds = new Set(production.nodes.map((node) => node.id));
	const candidateIds = new Set(candidate.nodes.map((node) => node.id));
	const layers = new Set([
		...production.layers.map((layer) => layer.layer),
		...candidate.layers.map((layer) => layer.layer),
	]);
	return {
		sharedNodeIds: sorted(
			[...productionIds].filter((id) => candidateIds.has(id)),
		),
		productionOnlyNodeIds: sorted(
			[...productionIds].filter((id) => !candidateIds.has(id)),
		),
		candidateOnlyNodeIds: sorted(
			[...candidateIds].filter((id) => !productionIds.has(id)),
		),
		layerDeltas: [...layers].sort().map((layer) => ({
			layer,
			productionNodeCount:
				production.layers.find((item) => item.layer === layer)?.nodeCount || 0,
			candidateNodeCount:
				candidate.layers.find((item) => item.layer === layer)?.nodeCount || 0,
		})),
	};
}

function graphHash(graph: GraphLike, kind: "production" | "candidate"): string {
	if (graph.hash) return graph.hash;
	if (kind === "production") {
		return loopQualityGraphRef(graph as unknown as LoopQualityGraph<string>)
			.hash;
	}
	return `sha256:${createHash("sha256")
		.update(stableJson(graphHashInput(graph)))
		.digest("hex")}`;
}

function graphHashInput(graph: GraphLike) {
	return {
		graphId: graph.graphId,
		graphVersion: graph.graphVersion,
		schemaVersion: graph.schemaVersion,
		layers: graph.layers,
		nodes: graphNodes(graph).map((node) => ({
			id: node.id,
			layer: node.layer,
			standardType: node.standardType,
			method: node.method,
			mode: node.mode,
			weight: node.weight,
			cost: node.cost,
			repairTarget: node.repairTarget,
			hardGate: node.hardGate,
			description: node.description,
		})),
	};
}

export function printLabGraphReport(report: LabGraphReport): void {
	console.log("CodeWiki quality networks");
	for (const loopReport of report.loops) {
		console.log(`${loopReport.loop}:`);
		printGraphSummary("production", loopReport.production);
		printGraphSummary("candidate", loopReport.candidate);
		console.log(
			`  diff: ${loopReport.diff.sharedNodeIds.length} shared, ${loopReport.diff.productionOnlyNodeIds.length} production-only, ${loopReport.diff.candidateOnlyNodeIds.length} candidate-only`,
		);
		for (const delta of loopReport.diff.layerDeltas) {
			if (delta.productionNodeCount === delta.candidateNodeCount) continue;
			console.log(
				`    ${delta.layer}: production ${delta.productionNodeCount}, candidate ${delta.candidateNodeCount}`,
			);
		}
	}
}

function printGraphSummary(
	label: "production" | "candidate",
	graph: LabGraphSummary,
): void {
	console.log(
		`  ${label}: ${graph.graphId}@${graph.graphVersion} ${graph.hash} (${graph.nodeCount} nodes)`,
	);
	for (const layer of graph.layers.filter((item) => item.nodeCount > 0)) {
		console.log(
			`    ${layer.layer}: ${layer.nodeCount} nodes, weight ${layer.totalWeight}, cost ${layer.totalCost}`,
		);
	}
}

function sum(values: number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

function sorted(values: string[]): string[] {
	return [...values].sort((left, right) => left.localeCompare(right));
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function main(argv = process.argv.slice(2)) {
	const report = buildLabGraphReport();
	if (argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
	else printLabGraphReport(report);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
