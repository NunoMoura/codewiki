import type { DecisionLabInput as CanonicalDecisionLabInput } from "./loop.ts";

export function decisionLabInput(
	overrides: {
		authority?: CanonicalDecisionLabInput["authority"] | null;
		rationale?: string;
		successSignals?: string[];
		risk?: "low" | "medium" | "high";
		proofRefs?: string[];
	} = {},
): CanonicalDecisionLabInput {
	return {
		revisionReady: true,
		semanticComplete: true,
		knowledgeAccounted: true,
		successSignals: overrides.successSignals ?? ["Approval event is appended."],
		risk: overrides.risk ?? "low",
		proofRefs: overrides.proofRefs ?? ["tests/decision/wiki-decide.test.mjs"],
		overlapAccounted: true,
		rationale: overrides.rationale ?? "Approve exact validated Change.",
		...(overrides.authority === null
			? {}
			: { authority: overrides.authority ?? "approval:user:lab" }),
	};
}
