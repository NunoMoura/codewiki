import type { GraphViewNode } from "./types.ts";

export function findGraphNode(
	nodes: GraphViewNode[],
	id: string,
): GraphViewNode | undefined {
	return nodes.find((node) => node.id === id);
}
