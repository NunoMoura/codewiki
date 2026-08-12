import { RuntimeReactor } from "../../src/runtime/coordinator/reactor.ts";

export function testPiProjectServices() {
	const reactors = new Map();
	const reactorFor = (root) => {
		const current = reactors.get(root);
		if (current) return current;
		const reactor = new RuntimeReactor(root);
		reactors.set(root, reactor);
		return reactor;
	};
	return {
		inspect(root, _ctx, trigger) {
			return reactorFor(root).inspect(trigger);
		},
		async decisionAttention() {
			throw new Error("decision_attention_projection_unavailable");
		},
		async selectDecision() {
			throw new Error("decision_attention_selection_unavailable");
		},
		async disconnect() {},
	};
}
