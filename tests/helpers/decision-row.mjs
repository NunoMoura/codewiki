export function decisionQualityFields(overrides = {}) {
	return {
		userImpact: "Improves user outcomes by preserving clear project intent.",
		maintainerImpact: "Keeps implementation cost bounded and reviewable.",
		effort: "low",
		recommendation: "approve",
		recommendationRationale: "Evidence supports this intention as valuable and safe to plan.",
		agentAssessment: {
			stance: "aligned",
			userAlignment: "Matches the user's stated goal and assumes good-faith project intent.",
			projectBenefit: "Improves CodeWiki while preserving trace-backed source truth.",
			rationale: "No lower-cost alternative better serves the user and project.",
		},
		...overrides,
	};
}
