import type { LoopQualityGraph, LoopQualityGraphNode } from "./graph.ts";
import type { LoopQualityStandardResult } from "../changes/trace/types.ts";

export type LoopQualityProfileNodeState =
	| "active"
	| "required"
	| "optional"
	| "not_applicable"
	| "escalated";
export type LoopQualityProfileInactiveReason =
	| "not_applicable"
	| "covered_by_invariant"
	| "escalated_elsewhere";

export interface LoopQualityProfileNodeActivation {
	state: LoopQualityProfileNodeState;
	reason?: LoopQualityProfileInactiveReason;
	message?: string;
	refs?: string[];
}

export interface LoopQualityProfile {
	id: string;
	description?: string;
	nodes: Record<string, LoopQualityProfileNodeActivation>;
}

export interface LoopQualityProfileValidationIssue {
	code:
		| "missing_inactive_reason"
		| "forbidden_hard_gate_skip"
		| "unknown_profile_node";
	nodeId: string;
	message: string;
}

export function loopQualityProfileActivationForNode<TCode extends string>(
	profile: LoopQualityProfile | undefined,
	node: LoopQualityGraphNode<TCode>,
): LoopQualityProfileNodeActivation | undefined {
	return profile?.nodes[node.id];
}

export function loopQualityProfileNodeIsInactive(
	activation: LoopQualityProfileNodeActivation | undefined,
): boolean {
	return (
		activation?.state === "not_applicable" || activation?.state === "escalated"
	);
}

export function inactiveLoopQualityStandard<TCode extends string>(input: {
	node: LoopQualityGraphNode<TCode>;
	activation: LoopQualityProfileNodeActivation;
	graphId: string;
	graphVersion: string;
	graphHash: string;
}): LoopQualityStandardResult {
	const escalated = input.activation.state === "escalated";
	return {
		id: input.node.id,
		status: escalated ? "escalated" : "not_applicable",
		mode: input.node.mode || "deterministic",
		weight: input.node.weight,
		description: input.node.description,
		message:
			input.activation.message ||
			`${input.node.id} is ${input.activation.state} by quality profile.`,
		refs: input.activation.refs || [],
		graphId: input.graphId,
		graphVersion: input.graphVersion,
		graphHash: input.graphHash,
		layer: input.node.layer,
		standardType: input.node.standardType,
		method: input.node.method,
		cost: input.node.cost,
		gate: input.node.gate,
		score: 0,
		scoreThreshold: 0,
		repairTarget: input.node.repairTarget,
	};
}

export function validateLoopQualityProfile<TCode extends string>(
	graph: LoopQualityGraph<TCode>,
	profile: LoopQualityProfile,
): LoopQualityProfileValidationIssue[] {
	const nodeIds = new Set(graph.nodes.map((node) => node.id));
	const issues: LoopQualityProfileValidationIssue[] = [];
	for (const [nodeId, activation] of Object.entries(profile.nodes)) {
		const node = graph.nodes.find((candidate) => candidate.id === nodeId);
		if (!nodeIds.has(nodeId)) {
			issues.push({
				code: "unknown_profile_node",
				nodeId,
				message: `Quality profile ${profile.id} references unknown node ${nodeId}.`,
			});
			continue;
		}
		if (loopQualityProfileNodeIsInactive(activation) && !activation.reason) {
			issues.push({
				code: "missing_inactive_reason",
				nodeId,
				message: `Quality profile ${profile.id} must explain why node ${nodeId} is ${activation.state}.`,
			});
		}
		if (
			node &&
			(node.hardGate || node.layer === "hard_gate" || node.gate === "hard") &&
			activation.state === "not_applicable" &&
			activation.reason !== "covered_by_invariant"
		) {
			issues.push({
				code: "forbidden_hard_gate_skip",
				nodeId,
				message: `Quality profile ${profile.id} cannot mark hard gate ${nodeId} not applicable without invariant coverage.`,
			});
		}
	}
	return issues;
}
