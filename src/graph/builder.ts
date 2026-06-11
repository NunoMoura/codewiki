import type { GraphViewNode } from "./types.ts";

export function buildGraphView(nodes: GraphViewNode[]): GraphViewNode[] {
	return nodes.map((node) => ({ ...node }));
}
