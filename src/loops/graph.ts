import { createHash } from "node:crypto";
import type {
	ExitQualityGraphRef,
	LoopQualityStandardMode,
	TraceLoop,
} from "../traces/types.ts";

export const LOOP_QUALITY_GRAPH_SCHEMA_VERSION = 2;

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
	mode?: LoopQualityStandardMode;
	evidenceRefs?: string[];
	hardGate?: boolean;
	scoreThreshold?: number;
	judge?: LoopQualityJudgeNodeSpec;
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
	return `sha256:${createHash("sha256")
		.update(stableJson(graph))
		.digest("hex")}`;
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
