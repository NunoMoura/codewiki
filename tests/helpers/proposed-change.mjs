export function decisionQualityFields(overrides = {}) {
	return {
		kind: "improve",
		currentPain:
			"The current behavior leaves project intent less structured than it could be.",
		desiredOutcome:
			"The decision creates a clearer, more useful project outcome.",
		successSignal:
			"Planning can consume the decision without additional intent clarification.",
		nonGoals: ["Do not expand scope beyond the approved proposed change."],
		userImpact: "Improves user outcomes by preserving clear project intent.",
		maintainerImpact: "Keeps implementation cost bounded and reviewable.",
		effort: "low",
		workScale: "small",
		planningDepth: "micro",
		risk: "low",
		recommendation: "approve",
		recommendationRationale:
			"Evidence supports this intention as valuable and safe to plan.",
		agentAssessment: {
			stance: "aligned",
			userAlignment:
				"Matches the user's stated goal and assumes good-faith project intent.",
			projectBenefit:
				"Improves CodeWiki while preserving trace-backed source truth.",
			rationale:
				"No lower-cost alternative better serves the user and project.",
		},
		...overrides,
	};
}
