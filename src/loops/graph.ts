import { createHash } from "node:crypto";
import type {
	ExitQualityGraphRef,
	LoopQualityStandardMode,
	TraceLoop,
} from "../traces/types.ts";

export const LOOP_QUALITY_GRAPH_SCHEMA_VERSION = 3;

export type LoopQualityLayer =
	| "hard_gate"
	| "input_contract"
	| "trace_fidelity"
	| "coverage"
	| "specificity"
	| "scope_control"
	| "evidence_quality"
	| "risk_authority"
	| "project_fit"
	| "repairability"
	| "pipeline_carryover"
	| "exit_loss";

export type LoopQualityStandardMethod =
	| "deterministic"
	| "agent_self_assessment"
	| "model_judge"
	| "human_authority"
	| "external_evidence";

export type LoopQualityGate = "hard" | "soft" | "score_only";
export type LoopQualityRollout = "observe" | "warn" | "enforce";

export type LoopQualityStandardType =
	| "loop_contract"
	| "security"
	| "maintainability"
	| "robustness"
	| "project_fit"
	| "user_value"
	| "scope_control"
	| "reversibility"
	| "evidence_quality"
	| "trace_fidelity"
	| "pipeline_carryover"
	| "risk_authority"
	| "coverage"
	| "repairability";

export type LoopQualityRepairTarget =
	| TraceLoop
	| "kb"
	| "source"
	| "tests"
	| "trace"
	| "user";

export interface LoopQualityJudgeNodeSpec {
	id: string;
	role: string;
	rubric: string[];
	scoreThreshold: number;
	calibrationRefs?: string[];
}

export interface LoopQualityGraphNode<TCode extends string> {
	id: string;
	description: string;
	codes: TCode[];
	layer: LoopQualityLayer;
	standardType: LoopQualityStandardType;
	method: LoopQualityStandardMethod;
	repairTarget: LoopQualityRepairTarget;
	weight: number;
	cost: number;
	gate?: LoopQualityGate;
	timeoutMs?: number;
	dependsOn?: string[];
	mode?: LoopQualityStandardMode;
	evidenceRefs?: string[];
	hardGate?: boolean;
	scoreThreshold?: number;
	judge?: LoopQualityJudgeNodeSpec;
	packId?: string;
	rollout?: LoopQualityRollout;
	evaluatorId?: string;
	evidenceAdapterIds?: string[];
}

export interface LoopQualityGraph<TCode extends string> {
	graphId: string;
	graphVersion: string;
	schemaVersion: typeof LOOP_QUALITY_GRAPH_SCHEMA_VERSION;
	layers: LoopQualityLayer[];
	nodes: LoopQualityGraphNode<TCode>[];
}

export function loopQualityGraphRef<TCode extends string>(
	graph: LoopQualityGraph<TCode>,
): ExitQualityGraphRef {
	return {
		id: graph.graphId,
		version: graph.graphVersion,
		schemaVersion: graph.schemaVersion,
		hash: loopQualityGraphHash(graph),
	};
}

export function loopQualityGraphHash<TCode extends string>(
	graph: LoopQualityGraph<TCode>,
): string {
	assertValidLoopQualityGraph(graph);
	return `sha256:${createHash("sha256")
		.update(stableJson(graph))
		.digest("hex")}`;
}

export function assertValidLoopQualityGraph<TCode extends string>(
	graph: LoopQualityGraph<TCode>,
): void {
	if (graph.schemaVersion !== LOOP_QUALITY_GRAPH_SCHEMA_VERSION) {
		throw new Error(
			`Loop quality graph ${graph.graphId || "<unknown>"} uses unsupported schema version ${graph.schemaVersion}.`,
		);
	}
	if (!graph.graphId.trim())
		throw new Error("Loop quality graph id is required.");
	if (!graph.graphVersion.trim()) {
		throw new Error(`Loop quality graph ${graph.graphId} version is required.`);
	}
	assertUniqueGraphValues(graph.layers, graph.graphId, "layer");
	const nodeIds = graph.nodes.map((node) => node.id);
	assertUniqueGraphValues(nodeIds, graph.graphId, "node id");
	const knownNodes = new Set(nodeIds);
	const knownLayers = new Set(graph.layers);
	for (const node of graph.nodes) {
		if (!node.id.trim()) {
			throw new Error(
				`Loop quality graph ${graph.graphId} has an empty node id.`,
			);
		}
		if (!knownLayers.has(node.layer)) {
			throw new Error(
				`Loop quality graph ${graph.graphId} node ${node.id} uses undeclared layer ${node.layer}.`,
			);
		}
		const dependencies = node.dependsOn || [];
		assertUniqueGraphValues(
			dependencies,
			`${graph.graphId} node ${node.id}`,
			"dependency",
		);
		for (const dependency of dependencies) {
			if (!knownNodes.has(dependency)) {
				throw new Error(
					`Loop quality graph ${graph.graphId} node ${node.id} has unknown dependency ${dependency}.`,
				);
			}
			if (dependency === node.id) {
				throw new Error(
					`Loop quality graph ${graph.graphId} node ${node.id} cannot depend on itself.`,
				);
			}
		}
	}
	assertAcyclicGraphDependencies(graph);
}

function assertUniqueGraphValues(
	values: readonly string[],
	graphId: string,
	label: string,
): void {
	const seen = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) {
			throw new Error(
				`Loop quality graph ${graphId} has duplicate ${label} ${value}.`,
			);
		}
		seen.add(value);
	}
}

function assertAcyclicGraphDependencies<TCode extends string>(
	graph: LoopQualityGraph<TCode>,
): void {
	const byId = new Map(graph.nodes.map((node) => [node.id, node]));
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (nodeId: string): void => {
		if (visited.has(nodeId)) return;
		if (visiting.has(nodeId)) {
			throw new Error(
				`Loop quality graph ${graph.graphId} contains a dependency cycle at ${nodeId}.`,
			);
		}
		visiting.add(nodeId);
		for (const dependency of byId.get(nodeId)?.dependsOn || [])
			visit(dependency);
		visiting.delete(nodeId);
		visited.add(nodeId);
	};
	for (const node of graph.nodes) visit(node.id);
}

export function loopQualityMethodForMode(
	mode?: LoopQualityStandardMode,
): LoopQualityStandardMethod {
	if (mode === "agent") return "agent_self_assessment";
	if (mode === "user") return "human_authority";
	return "deterministic";
}

export function loopQualityMethodUsesJudge(
	method: LoopQualityStandardMethod | string,
): boolean {
	return method === "agent_self_assessment" || method === "model_judge";
}

export function loopQualityJudgeSpecForNode<TCode extends string>(
	node: LoopQualityGraphNode<TCode>,
): LoopQualityJudgeNodeSpec | undefined {
	if (!loopQualityMethodUsesJudge(node.method)) return undefined;
	return {
		id: `${node.id}.judge`,
		role: `${node.standardType} judge for ${node.id}`,
		scoreThreshold: loopQualityScoreThresholdForNode(node),
		rubric: [
			node.description,
			"Judge only the supplied loop evidence and refs; do not infer missing facts.",
			"False pass is the highest-cost error; fail or block weak, generic, contradictory, or unsupported evidence.",
			"Return evidence-linked feedback that the coding agent can act on in the next loop iteration.",
		],
	};
}

export function loopQualityScoreThresholdForNode<TCode extends string>(
	node: LoopQualityGraphNode<TCode>,
): number {
	if (node.scoreThreshold !== undefined) {
		return clampQualityScore(node.scoreThreshold);
	}
	if (node.judge?.scoreThreshold !== undefined) {
		return clampQualityScore(node.judge.scoreThreshold);
	}
	const gate =
		node.gate ||
		(node.hardGate || node.layer === "hard_gate" ? "hard" : "soft");
	if (gate === "score_only") return 0;
	return gate === "hard" ? 100 : 80;
}

export function clampQualityScore(score: number): number {
	if (!Number.isFinite(score)) return 0;
	return Math.max(0, Math.min(100, Math.round(score)));
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

export function loopGraphLayers(
	layers: LoopQualityLayer[],
): LoopQualityLayer[] {
	return layers;
}

// Backward-compatible type aliases for persisted trace terminology.
export type ExitQualityLayer = LoopQualityLayer;
export type ExitQualityStandardMethod = LoopQualityStandardMethod;
export type ExitQualityGate = LoopQualityGate;
export type ExitQualityStandardType = LoopQualityStandardType;
export type ExitQualityRepairTarget = LoopQualityRepairTarget;
export type ExitQualityGraphNode<TCode extends string> =
	LoopQualityGraphNode<TCode>;
export type ExitQualityGraph<TCode extends string> = LoopQualityGraph<TCode>;
export const exitQualityGraphRef = loopQualityGraphRef;
export const exitQualityGraphHash = loopQualityGraphHash;
export const exitGraphLayers = loopGraphLayers;
