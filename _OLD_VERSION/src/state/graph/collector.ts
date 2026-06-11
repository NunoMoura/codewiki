import type { GraphEdge, GraphNode } from "../types.ts";

export class GraphAccumulator {
	readonly nodes: GraphNode[] = [];
	readonly edges: GraphEdge[] = [];

	private readonly seenNodes = new Set<string>();
	private readonly seenEdges = new Set<string>();

	readonly addNode = (nodeId: string, payload: Partial<GraphNode>): void => {
		if (!nodeId || this.seenNodes.has(nodeId)) return;
		this.seenNodes.add(nodeId);
		this.nodes.push({
			id: nodeId,
			kind: payload.kind || "unknown",
			...payload,
		});
	};

	readonly addEdge = (
		kind: string,
		source: string,
		target: string,
		payload: Partial<GraphEdge> = {},
	): void => {
		if (!source || !target) return;
		const key = `${kind}:${source}->${target}`;
		if (this.seenEdges.has(key)) return;
		this.seenEdges.add(key);
		this.edges.push({ kind, from: source, to: target, ...payload });
	};
}
